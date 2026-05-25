import { NextRequest } from "next/server";
import { authenticate } from "@/lib/auth";
import { getStorageProvider } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError, ApiError } from "@/lib/utils";
import { processCardImage } from "@/lib/image-processing";
import sharp from "sharp";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/heic", "image/webp", "image/heif"];

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticate();
    if (!auth) {
      throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
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

    // Store initial file
    const storage = getStorageProvider();
    const { storageKey: initialKey, url: initialUrl } = await storage.upload(processedBuffer, filename, mimeType);

    // Save initial record to database
    const cardImage = await prisma.cardImage.create({
      data: {
        side: side === "BACK" ? "BACK" : "FRONT",
        storageKey: initialKey,
        storageUrl: initialUrl,
        mimeType,
        sizeBytes: processedBuffer.length,
      },
    });

    // Run LLM-based image processing (detect card + crop)
    try {
      const processed = await processCardImage(
        processedBuffer,
        initialKey,
        initialUrl,
        mimeType,
        filename
      );

      // Update DB with processed image info
      await prisma.cardImage.update({
        where: { id: cardImage.id },
        data: {
          storageKey: processed.storageKey,
          storageUrl: processed.url,
          sizeBytes: processed.sizeBytes,
        },
      });

      // Save LLM detection log
      await prisma.llmLog.create({
        data: {
          userId: auth.userId,
          cardId: null,
          provider: processed.log.provider,
          model: processed.log.model,
          requestHeaders: processed.log.requestHeaders as never,
          requestBody: processed.log.requestBody as never,
          responseBody: processed.log.responseBody as never,
          responseStatus: processed.log.responseStatus,
          durationMs: processed.log.durationMs,
          errorMessage: processed.log.errorMessage,
        },
      });

      return apiResponse({
        id: cardImage.id,
        url: processed.url,
        storageKey: processed.storageKey,
        mimeType,
        sizeBytes: processed.sizeBytes,
        side: cardImage.side,
      });
    } catch (processError) {
      // Clean up: delete initial file and DB record on processing failure
      await storage.delete(initialKey).catch(() => {});
      await prisma.cardImage.delete({ where: { id: cardImage.id } }).catch(() => {});
      throw processError;
    }
  } catch (error) {
    return apiError(error);
  }
}
