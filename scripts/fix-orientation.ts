/**
 * Batch orientation fix script for existing card images.
 *
 * Downloads each image from OSS, runs LLM orientation detection,
 * and re-uploads rotated image if needed.
 *
 * Usage:
 *   npx tsx scripts/fix-orientation.ts
 *
 * Options:
 *   --dry-run    Preview without making changes
 *   --batch=N    Process N images at a time (default: 5)
 */

import dotenv from "dotenv";
import { readFileSync } from "fs";
// Load .env.local for all credentials (OSS, LLM, local DB)
dotenv.config({ path: ".env.local" });
// If --env=production, override only DATABASE_URL and STORAGE_PROVIDER from that file
const envArg = process.argv.find((a) => a.startsWith("--env="));
if (envArg) {
  const envFile = `.env.${envArg.split("=")[1]}`;
  const content = readFileSync(envFile, "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^(DATABASE_URL|STORAGE_PROVIDER)=["']?(.+?)["']?$/);
    if (match) {
      process.env[match[1]] = match[2];
    }
  }
}
const envLabel = envArg ? envArg.split("=")[1] : "local";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import OSS from "ali-oss";
import crypto from "crypto";
import sharp from "sharp";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const batchArg = args.find((a) => a.startsWith("--batch="));
const batchSize = batchArg ? parseInt(batchArg.split("=")[1], 10) : 5;

// --- STS helpers (same as migrate script) ---

interface STSCredentials {
  accessKeyId: string;
  accessKeySecret: string;
  securityToken: string;
  expiration: Date;
}

let cachedCredentials: STSCredentials | null = null;

function encodeRFC3986(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

async function assumeRole(): Promise<STSCredentials> {
  const accessKeyId = process.env.ALIYUN_OSS_ACCESS_KEY_ID!;
  const accessKeySecret = process.env.ALIYUN_OSS_ACCESS_KEY_SECRET!;
  const roleArn = process.env.ALIYUN_OSS_ROLE_ARN!;
  const stsEndpoint = process.env.ALIYUN_OSS_STS_ENDPOINT || "https://sts.aliyuncs.com";

  const params: Record<string, string> = {
    Action: "AssumeRole",
    Version: "2015-04-01",
    Format: "JSON",
    RoleArn: roleArn,
    RoleSessionName: `orientation-fix-${Date.now()}`,
    DurationSeconds: "3600",
    AccessKeyId: accessKeyId,
    SignatureMethod: "HMAC-SHA1",
    SignatureVersion: "1.0",
    SignatureNonce: crypto.randomUUID(),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  };

  const sortedKeys = Object.keys(params).sort();
  const canonicalQuery = sortedKeys
    .map((k) => `${encodeRFC3986(k)}=${encodeRFC3986(params[k])}`)
    .join("&");

  const stringToSign = `GET&${encodeRFC3986("/")}&${encodeRFC3986(canonicalQuery)}`;
  const signature = crypto
    .createHmac("sha1", `${accessKeySecret}&`)
    .update(stringToSign)
    .digest("base64");

  const url = `${stsEndpoint}/?${canonicalQuery}&Signature=${encodeURIComponent(signature)}`;
  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`STS AssumeRole failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const credentials = data.Credentials;

  return {
    accessKeyId: credentials.AccessKeyId,
    accessKeySecret: credentials.AccessKeySecret,
    securityToken: credentials.SecurityToken,
    expiration: new Date(credentials.Expiration),
  };
}

async function getOSSClient(): Promise<OSS> {
  const now = new Date();
  const bufferMs = 5 * 60 * 1000;

  if (cachedCredentials && cachedCredentials.expiration.getTime() - now.getTime() > bufferMs) {
    // reuse cached
  } else {
    cachedCredentials = await assumeRole();
  }

  return new OSS({
    region: process.env.ALIYUN_OSS_REGION!,
    bucket: process.env.ALIYUN_OSS_BUCKET!,
    accessKeyId: cachedCredentials.accessKeyId,
    accessKeySecret: cachedCredentials.accessKeySecret,
    stsToken: cachedCredentials.securityToken,
    secure: true,
  });
}

// --- LLM Orientation Detection (standalone, no import from app code) ---

interface OrientationResult {
  rotation: 0 | 90 | 180 | 270;
}

const CARD_ORIENTATION_PROMPT = `You are a business card orientation detection assistant.

Your task: Determine how many degrees the image must be rotated CLOCKWISE so that the text on the card reads normally (left-to-right, top-to-bottom) in standard landscape orientation.

IMPORTANT FACTS about business cards:
- Business cards are ALWAYS designed to be read in LANDSCAPE (horizontal) orientation
- The card's width should be GREATER than its height when correctly oriented
- ALL text (name, company, phone, email, address) should read horizontally from left to right
- If you see text running vertically or the card appears taller than it is wide, it NEEDS rotation

Return a JSON object:
{
  "rotation": 0 | 90 | 180 | 270
}

How to determine rotation:
- 0: Text already reads left-to-right horizontally, card is wider than tall. No rotation needed.
- 90: The card appears TALLER than wide (portrait), and text reads from TOP to BOTTOM along what is currently the left edge. Rotate 90° clockwise to fix.
- 180: The card is wider than tall BUT text is UPSIDE DOWN (readable only if you flip the image 180°). Rotate 180° to fix.
- 270: The card appears TALLER than wide (portrait), and text reads from BOTTOM to TOP along what is currently the right edge. Rotate 270° clockwise to fix.

Decision process:
1. Look at the majority of text on the card (name, company name, address lines)
2. Determine which direction this text flows
3. If text is horizontal and readable → 0
4. If text is horizontal but upside-down → 180
5. If text is vertical (card is in portrait mode) → 90 or 270 depending on direction

Respond ONLY with the JSON object, no additional text.`;

function parseOrientationJSON(text: string): OrientationResult {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const rotation = parsed.rotation;
      if (rotation === 0 || rotation === 90 || rotation === 180 || rotation === 270) {
        return { rotation };
      }
    } catch { /* fall through */ }
  }
  return { rotation: 0 };
}

/**
 * Ask LLM a simple YES/NO question: "Is the text on this card readable left-to-right?"
 * This is much more reliable than asking it to determine rotation angle.
 */
async function askIsReadable(base64: string): Promise<boolean> {
  const baseUrl = process.env.ALIBABA_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
  const apiKey = process.env.ALIBABA_API_KEY || "";
  const model = process.env.ALIBABA_MODEL || "qwen3.7-max";

  const prompt = `Look at this business card image. Is the text on this card in normal readable orientation? (text reads horizontally from left to right, and the card is wider than tall)

Answer with ONLY one word: YES or NO`;

  const body = {
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } },
          { type: "text", text: prompt },
        ],
      },
    ],
    max_tokens: 10,
    enable_thinking: false,
  };

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-DashScope-DataInspection": "disable",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return true; // default to "readable" on error
  }

  const data = await response.json();
  const text = (data.choices?.[0]?.message?.content || "").toUpperCase().trim();
  return text.includes("YES");
}

/**
 * Determine rotation for a portrait image (height > width).
 * Strategy: rotate 90° first, ask LLM if readable. If not, use 270°.
 */
async function determinePortraitRotation(buffer: Buffer): Promise<90 | 270> {
  // Try rotating 90° clockwise
  const rotated90 = await sharp(buffer)
    .rotate(90)
    .jpeg({ quality: 72 })
    .toBuffer();

  const base64_90 = rotated90.toString("base64");
  const isReadable = await askIsReadable(base64_90);

  return isReadable ? 90 : 270;
}

/**
 * Check if a landscape image is upside down.
 * Strategy: ask LLM if the current image is readable.
 * If not, it's upside down (needs 180°).
 */
async function checkUpsideDown(base64: string): Promise<boolean> {
  const isReadable = await askIsReadable(base64);
  return !isReadable;
}

// --- Main ---

async function main() {
  console.log("=== Batch Orientation Fix ===");
  console.log(`Env: ${envLabel}`);
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes)" : "LIVE"}`);
  console.log(`Batch size: ${batchSize}`);
  console.log("");

  // Validate environment
  const required = [
    "ALIYUN_OSS_ACCESS_KEY_ID",
    "ALIYUN_OSS_ACCESS_KEY_SECRET",
    "ALIYUN_OSS_ROLE_ARN",
    "ALIYUN_OSS_REGION",
    "ALIYUN_OSS_BUCKET",
    "ALIBABA_API_KEY",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Missing environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }

  // Find all images (supports both OSS and local storage)
  const images = await prisma.cardImage.findMany({
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${images.length} images to check orientation.`);
  if (images.length === 0) {
    console.log("Nothing to process. Done!");
    return;
  }

  let rotated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < images.length; i += batchSize) {
    const batch = images.slice(i, i + batchSize);
    console.log(`\nBatch ${Math.floor(i / batchSize) + 1} (${batch.length} images)...`);

    for (const image of batch) {
      const idx = i + batch.indexOf(image) + 1;

      try {
        console.log(`  [${idx}/${images.length}] ${image.id} - ${image.storageUrl}`);

        // Download image based on storage type
        let buffer: Buffer;
        const isOSS = image.storageUrl.startsWith("oss://");
        const isLocal = image.storageUrl.startsWith("/uploads/");

        if (isOSS) {
          const storageKey = image.storageUrl.replace("oss://", "");
          const client = await getOSSClient();
          const result = await client.get(storageKey);
          buffer = result.content as Buffer;
        } else if (isLocal) {
          const filePath = join(process.cwd(), "public", image.storageUrl);
          buffer = await readFile(filePath);
        } else {
          console.log(`    → Skipped (unknown storage type: ${image.storageUrl})`);
          skipped++;
          continue;
        }

        // Check image dimensions
        const meta = await sharp(buffer).metadata();
        const width = meta.width || 0;
        const height = meta.height || 0;
        const isPortrait = height > width * 1.1; // 10% threshold

        let rotation: 0 | 90 | 180 | 270 = 0;

        if (isPortrait) {
          // Portrait image → definitely needs rotation (90 or 270)
          console.log(`    → Portrait (${width}x${height}), determining direction...`);
          rotation = await determinePortraitRotation(buffer);
        } else {
          // Landscape image → check if upside down
          const base64 = buffer.toString("base64");
          const upsideDown = await checkUpsideDown(base64);
          if (upsideDown) {
            rotation = 180;
          }
        }

        if (rotation === 0) {
          console.log(`    → OK (no rotation needed, ${width}x${height})`);
          skipped++;
          continue;
        }

        console.log(`    → Needs ${rotation}° rotation`);

        if (dryRun) {
          console.log(`    → [DRY RUN] Would rotate and re-upload`);
          rotated++;
          continue;
        }

        // Rotate image
        const rotatedBuffer = await sharp(buffer)
          .rotate(rotation)
          .jpeg({ quality: 72 })
          .toBuffer();

        // Re-upload / overwrite based on storage type
        if (isOSS) {
          const storageKey = image.storageUrl.replace("oss://", "");
          const client = await getOSSClient();
          await client.put(storageKey, rotatedBuffer, {
            headers: { "Content-Type": "image/jpeg" },
          });
        } else if (isLocal) {
          const filePath = join(process.cwd(), "public", image.storageUrl);
          await writeFile(filePath, rotatedBuffer);
        }

        // Update sizeBytes in database
        await prisma.cardImage.update({
          where: { id: image.id },
          data: { sizeBytes: rotatedBuffer.length },
        });

        console.log(`    ✓ Rotated ${rotation}° and saved (${buffer.length} → ${rotatedBuffer.length} bytes)`);
        rotated++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`    ✗ Failed: ${msg}`);
        failed++;
      }
    }
  }

  console.log("\n=== Orientation Fix Complete ===");
  console.log(`Rotated: ${rotated}`);
  console.log(`Already OK: ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${images.length}`);
}

main()
  .catch((e) => {
    console.error("Script failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
