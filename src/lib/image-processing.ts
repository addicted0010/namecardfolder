import sharp from "sharp";
import { getLLMProvider } from "./llm";
import { getStorageProvider } from "./storage";
import { ApiError } from "./utils";
import type { LLMLogEntry } from "./llm/types";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export async function processCardImage(
  rawBuffer: Buffer,
  oldStorageKey: string,
  oldStorageUrl: string,
  mimeType: string,
  filename: string
): Promise<{ storageKey: string; url: string; sizeBytes: number; log: LLMLogEntry }> {
  // Step 1: Create preview buffer for LLM (rotated + resized)
  const previewBuffer = await sharp(rawBuffer)
    .rotate() // auto-orient from EXIF
    .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  // Step 2: Get oriented preview dimensions
  const previewMeta = await sharp(previewBuffer).metadata();
  const previewW = previewMeta.width || 2048;
  const previewH = previewMeta.height || 2048;

  // Step 3: Base64 encode preview and call LLM
  const base64 = previewBuffer.toString("base64");
  const llm = getLLMProvider();
  const { result, log } = await llm.detectCard({
    url: oldStorageUrl,
    base64,
    mimeType: "image/jpeg",
    side: "FRONT",
  });

  // Step 4: Validate detection result
  if (log.errorMessage) {
    throw new ApiError(502, "PROCESSING_FAILED", `LLM error: ${log.errorMessage}`);
  }

  if (!result.isCard || result.confidence < 0.5 || !result.boundingBox) {
    throw new ApiError(422, "NOT_A_BUSINESS_CARD", "This doesn't appear to be a business card");
  }

  const { x1, y1, x2, y2 } = result.boundingBox;

  // Step 5: Add 5% padding around detected box
  const padX = 50; // 5% of 1000
  const padY = 50;
  const bx1 = clamp(x1 - padX, 0, 1000);
  const by1 = clamp(y1 - padY, 0, 1000);
  const bx2 = clamp(x2 + padX, 0, 1000);
  const by2 = clamp(y2 + padY, 0, 1000);

  // Step 6: Convert normalized coords to pixel coords on preview
  const pLeft = Math.round((bx1 / 1000) * previewW);
  const pTop = Math.round((by1 / 1000) * previewH);
  const pWidth = Math.round(((bx2 - bx1) / 1000) * previewW);
  const pHeight = Math.round(((by2 - by1) / 1000) * previewH);

  // Minimum size check on preview
  if (pWidth < 200 || pHeight < 120) {
    throw new ApiError(422, "NOT_A_BUSINESS_CARD", "Detected card region is too small");
  }

  // Step 7: Scale to original image dimensions
  // Get original oriented dimensions
  const origMeta = await sharp(rawBuffer).rotate().metadata();
  const origW = origMeta.width || previewW;
  const origH = origMeta.height || previewH;

  const scaleX = origW / previewW;
  const scaleY = origH / previewH;

  const left = clamp(Math.round(pLeft * scaleX), 0, origW - 1);
  const top = clamp(Math.round(pTop * scaleY), 0, origH - 1);
  const cropWidth = clamp(Math.round(pWidth * scaleX), 1, origW - left);
  const cropHeight = clamp(Math.round(pHeight * scaleY), 1, origH - top);

  // Step 8: Crop the original (full-res) image
  const croppedBuffer = await sharp(rawBuffer)
    .rotate()
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .jpeg({ quality: 85 })
    .toBuffer();

  // Step 9: Replace in storage (delete old + upload new)
  const storage = getStorageProvider();
  await storage.delete(oldStorageKey);
  const { storageKey, url } = await storage.upload(croppedBuffer, filename, "image/jpeg");

  return {
    storageKey,
    url,
    sizeBytes: croppedBuffer.length,
    log,
  };
}
