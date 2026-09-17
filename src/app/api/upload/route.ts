import { NextRequest } from "next/server";
import { authenticate } from "@/lib/auth";
import { getStorageProvider } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError, ApiError } from "@/lib/utils";
import { isRateLimited } from "@/lib/rate-limit";
import sharp from "sharp";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/heic", "image/webp", "image/heif"];

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticate();
    if (!auth) {
      throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
    }

    // Upload throttle: 30 requests/hour per user (protects disk/blob quota).
    if (isRateLimited(`upload:${auth.userId}`, 30, 60 * 60 * 1000)) {
      throw new ApiError(429, "TOO_MANY_REQUESTS", "Too many uploads, try again later");
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const side = (formData.get("side") as string) || "FRONT";

    if (!file) {
      throw new ApiError(400, "NO_FILE", "No file uploaded");
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new ApiError(
        400,
        "INVALID_TYPE",
        `Invalid file type: ${file.type}. Allowed: JPEG, PNG, HEIC, WebP`
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new ApiError(400, "FILE_TOO_LARGE", "File size exceeds 10MB limit");
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);

    // Initial Sharp processing: convert HEIC/HEIF to JPEG, resize if needed
    const image = sharp(rawBuffer);
    const metadata = await image.metadata();

    if (
      metadata.width &&
      metadata.height &&
      (metadata.width > 2048 || metadata.height > 2048)
    ) {
      image.resize(2048, 2048, { fit: "inside", withoutEnlargement: true });
    }

    const processedBuffer = await image.jpeg({ quality: 85 }).toBuffer();
    const mimeType = "image/jpeg";
    const filename = file.name.replace(/\.[^.]+$/, ".jpg");

    // Store file
    const storage = getStorageProvider();
    const { storageKey, url } = await storage.upload(processedBuffer, filename, mimeType);

    // Save record to database
    const cardImage = await prisma.cardImage.create({
      data: {
        userId: auth.userId,
        side: side === "BACK" ? "BACK" : "FRONT",
        storageKey,
        storageUrl: url,
        mimeType,
        sizeBytes: processedBuffer.length,
      },
    });

    return apiResponse({
      id: cardImage.id,
      url,
      storageKey,
      mimeType,
      sizeBytes: processedBuffer.length,
      side: cardImage.side,
    });
  } catch (error) {
    return apiError(error);
  }
}
