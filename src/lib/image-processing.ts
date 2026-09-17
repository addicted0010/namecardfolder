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
): Promise<{ storageKey: string; url: string; sizeBytes: number; log: LLMLogEntry; orientationLog: LLMLogEntry; buffer: Buffer; cleanupOld: () => Promise<void> }> {
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
  // 429 must be surfaced as a retryable rate-limit error BEFORE the generic
  // error throw, otherwise the queue's backoff/retry path is unreachable.
  if (log.responseStatus === 429) {
    throw new ApiError(429, "LLM_RATE_LIMITED", "Upstream LLM rate limited");
  }

  if (log.errorMessage) {
    throw new ApiError(502, "PROCESSING_FAILED", `LLM error: ${log.errorMessage}`);
  }

  if (!result.isCard || result.confidence < 0.5 || !result.boundingBox) {
    throw new ApiError(422, "NOT_A_BUSINESS_CARD", "This doesn't appear to be a business card");
  }

  const { x1, y1, x2, y2 } = result.boundingBox;

  // Guard against malformed model output (null / strings / NaN)
  if (![x1, y1, x2, y2].every((v) => typeof v === "number" && Number.isFinite(v))) {
    throw new ApiError(422, "INVALID_DETECTION", "Detection bounding box is invalid");
  }

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

  // Step 8.5: Compress cropped image for faster upload and recognition
  const compressedBuffer = await sharp(croppedBuffer)
    .resize(1000, 1000, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 72 })
    .toBuffer();

  // Step 9: Detect orientation and rotate if needed
  // Strategy: use image dimensions as primary signal (portrait = needs rotation),
  // then use LLM to verify direction
  const compressedMeta = await sharp(compressedBuffer).metadata();
  const cWidth = compressedMeta.width || 1000;
  const cHeight = compressedMeta.height || 1000;
  const isPortrait = cHeight > cWidth * 1.1;

  let orientResult: { rotation: 0 | 90 | 180 | 270 } = { rotation: 0 };
  let orientLog: LLMLogEntry;

  if (isPortrait) {
    // Portrait image → definitely needs rotation. Try 90° and verify with LLM.
    const rotated90 = await sharp(compressedBuffer)
      .rotate(90)
      .jpeg({ quality: 72 })
      .toBuffer();
    const base64_90 = rotated90.toString("base64");
    const { result: verifyResult, log: verifyLog } = await llm.detectOrientation({
      url: oldStorageUrl,
      base64: base64_90,
      mimeType: "image/jpeg",
      side: "FRONT",
    });
    orientLog = verifyLog;
    if (orientLog.responseStatus === 429) {
      throw new ApiError(429, "LLM_RATE_LIMITED", "Upstream LLM rate limited");
    }
    // If LLM says rotated image needs 0 rotation, 90° was correct
    // If LLM says it needs 180°, then we need 270° instead (90+180=270)
    if (verifyResult.rotation === 0) {
      orientResult = { rotation: 90 };
    } else {
      orientResult = { rotation: 270 };
    }
  } else {
    // Landscape image → check if upside down via LLM
    const orientBase64 = compressedBuffer.toString("base64");
    const { result, log: oLog } = await llm.detectOrientation({
      url: oldStorageUrl,
      base64: orientBase64,
      mimeType: "image/jpeg",
      side: "FRONT",
    });
    orientLog = oLog;
    if (orientLog.responseStatus === 429) {
      throw new ApiError(429, "LLM_RATE_LIMITED", "Upstream LLM rate limited");
    }
    orientResult = result;
  }

  let finalBuffer = compressedBuffer;
  if (orientResult.rotation !== 0) {
    finalBuffer = await sharp(compressedBuffer)
      .rotate(orientResult.rotation)
      .jpeg({ quality: 72 })
      .toBuffer();
  }

  // Step 10: Replace in storage. Upload the new object FIRST and only hand
  // out the old-object cleanup after the caller persisted the new reference,
  // so a failure never leaves the card without any image.
  const storage = getStorageProvider();
  const { storageKey, url } = await storage.upload(finalBuffer, filename, "image/jpeg");

  return {
    storageKey,
    url,
    sizeBytes: finalBuffer.length,
    log,
    orientationLog: orientLog,
    buffer: finalBuffer,
    cleanupOld: () =>
      oldStorageKey === storageKey
        ? Promise.resolve()
        : storage.delete(oldStorageKey),
  };
}
