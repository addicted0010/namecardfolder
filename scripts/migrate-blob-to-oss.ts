/**
 * Migration script: Vercel Blob → Aliyun OSS
 *
 * This script migrates all images stored in Vercel Blob to Aliyun OSS.
 * It reads each CardImage record, downloads from Vercel Blob, uploads to OSS,
 * and updates the database record.
 *
 * Prerequisites:
 * - Set environment variables for both Vercel Blob and Aliyun OSS
 * - Ensure the Aliyun OSS bucket exists and is configured
 *
 * Usage:
 *   DATABASE_URL="..." BLOB_READ_WRITE_TOKEN="..." \
 *   ALIYUN_OSS_ACCESS_KEY_ID="..." ALIYUN_OSS_ACCESS_KEY_SECRET="..." \
 *   ALIYUN_OSS_ROLE_ARN="..." ALIYUN_OSS_REGION="..." ALIYUN_OSS_BUCKET="..." \
 *   npx tsx scripts/migrate-blob-to-oss.ts
 *
 * Options:
 *   --dry-run    Preview without making changes
 *   --batch=N    Process N images at a time (default: 10)
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import OSS from "ali-oss";
import crypto from "crypto";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const batchArg = args.find((a) => a.startsWith("--batch="));
const batchSize = batchArg ? parseInt(batchArg.split("=")[1], 10) : 10;

// --- STS helpers (copied from aliyun-oss.ts for standalone usage) ---

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
    RoleSessionName: `migration-${Date.now()}`,
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

// --- Main migration ---

async function main() {
  console.log("=== Vercel Blob → Aliyun OSS Migration ===");
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes)" : "LIVE"}`);
  console.log(`Batch size: ${batchSize}`);
  console.log("");

  // Validate environment
  const required = [
    "BLOB_READ_WRITE_TOKEN",
    "ALIYUN_OSS_ACCESS_KEY_ID",
    "ALIYUN_OSS_ACCESS_KEY_SECRET",
    "ALIYUN_OSS_ROLE_ARN",
    "ALIYUN_OSS_REGION",
    "ALIYUN_OSS_BUCKET",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Missing environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }

  // Find all Vercel Blob images (storageUrl does NOT start with /uploads/ or oss://)
  const blobImages = await prisma.cardImage.findMany({
    where: {
      NOT: [
        { storageUrl: { startsWith: "/uploads/" } },
        { storageUrl: { startsWith: "oss://" } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${blobImages.length} images in Vercel Blob to migrate.`);
  if (blobImages.length === 0) {
    console.log("Nothing to migrate. Done!");
    return;
  }

  let succeeded = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < blobImages.length; i += batchSize) {
    const batch = blobImages.slice(i, i + batchSize);
    console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1} (${batch.length} images)...`);

    for (const image of batch) {
      try {
        console.log(`  [${i + batch.indexOf(image) + 1}/${blobImages.length}] ${image.id} - ${image.storageKey}`);

        if (dryRun) {
          console.log(`    → Would download from Vercel Blob and upload to OSS`);
          succeeded++;
          continue;
        }

        // Download from Vercel Blob
        const blobResponse = await fetch(image.storageUrl, {
          headers: {
            authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
          },
        });

        if (!blobResponse.ok) {
          throw new Error(`Failed to download from Blob: ${blobResponse.status} ${blobResponse.statusText}`);
        }

        const buffer = Buffer.from(await blobResponse.arrayBuffer());
        const contentType = blobResponse.headers.get("content-type") || image.mimeType || "image/jpeg";

        // Upload to OSS (keep same storageKey structure)
        const ossKey = image.storageKey.startsWith("cards/")
          ? image.storageKey
          : `cards/${image.storageKey}`;

        const client = await getOSSClient();
        await client.put(ossKey, buffer, {
          headers: { "Content-Type": contentType },
        });

        // Update database record
        await prisma.cardImage.update({
          where: { id: image.id },
          data: {
            storageKey: ossKey,
            storageUrl: `oss://${ossKey}`,
          },
        });

        console.log(`    ✓ Migrated to oss://${ossKey}`);
        succeeded++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`    ✗ Failed: ${msg}`);
        failed++;
      }
    }
  }

  console.log("\n=== Migration Complete ===");
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${blobImages.length}`);

  if (failed > 0) {
    console.log("\nSome images failed to migrate. You can re-run the script to retry.");
    console.log("Already migrated images (oss:// prefix) will be skipped.");
  }
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
