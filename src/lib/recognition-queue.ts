import { prisma } from "@/lib/prisma";
import { getLLMProvider } from "@/lib/llm";
import { processCardImage } from "@/lib/image-processing";
import { readFile } from "fs/promises";
import { AliyunOSSProvider } from "@/lib/storage/aliyun-oss";
import { getLocalUploadPath } from "@/lib/storage/local-storage";
import { refundDailyCredits } from "@/lib/credits";
import { ApiError } from "@/lib/utils";

/** Milliseconds after which a PROCESSING card is considered abandoned. */
const STALE_PROCESSING_MS = 5 * 60 * 1000;

/**
 * Fetch image buffer from storage URL.
 */
async function fetchImageBuffer(storageUrl: string): Promise<Buffer> {
  if (storageUrl.startsWith("/uploads/")) {
    const storageKey = storageUrl.replace(/^\/uploads\//, "");
    return await readFile(getLocalUploadPath(storageKey));
  } else if (storageUrl.startsWith("oss://")) {
    // Aliyun OSS: extract key and fetch via SDK
    const storageKey = storageUrl.replace("oss://", "");
    const ossProvider = new AliyunOSSProvider();
    return await ossProvider.fetch(storageKey);
  } else {
    // Vercel Blob (private): fetch with auth token
    const res = await fetch(storageUrl, {
      headers: {
        authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
      },
    });
    return Buffer.from(await res.arrayBuffer());
  }
}

/**
 * Recognize a single card by ID.
 * Flow: image processing (detect + crop) → OCR recognition.
 * Shared logic used by both the queue processor and the manual recognize API endpoint.
 *
 * Returns "SUCCESS" | "FAILED" | "RATE_LIMITED" | "SKIPPED"
 * ("SKIPPED" = another worker already claimed the card).
 */
export async function recognizeCard(
  cardId: string
): Promise<"SUCCESS" | "FAILED" | "RATE_LIMITED" | "SKIPPED"> {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: { images: true },
  });

  if (!card || card.images.length === 0) {
    await prisma.card.update({
      where: { id: cardId },
      data: { recognitionStatus: "FAILED", processingStartedAt: null },
    }).catch(() => {});
    return "FAILED";
  }

  // Atomic claim: only one worker may process a card at a time.
  const claimed = await prisma.card.updateMany({
    where: {
      id: cardId,
      recognitionStatus: { in: ["PENDING", "FAILED"] },
    },
    data: { recognitionStatus: "PROCESSING", processingStartedAt: new Date() },
  });

  if (claimed.count === 0) {
    return "SKIPPED"; // Already processing (or state changed concurrently)
  }

  const refundOnFailure = () =>
    refundDailyCredits(card.userId, card.images.length).catch((e) =>
      console.error(`Credit refund failed for card ${cardId}:`, e)
    );

  try {
    // Phase 1: Image processing (detect card region + crop + compress)
    const processedImages: Array<{
      base64: string;
      mimeType: string;
      side: "FRONT" | "BACK";
      url: string;
    }> = [];

    for (const img of card.images) {
      const imgTyped = img as { id: string; storageKey: string; storageUrl: string; mimeType: string; side: string };
      const buffer = await fetchImageBuffer(imgTyped.storageUrl);

      try {
        const processed = await processCardImage(
          buffer,
          imgTyped.storageKey,
          imgTyped.storageUrl,
          imgTyped.mimeType,
          "card.jpg"
        );

        // Update CardImage with processed file info, then clean up the old
        // object (upload-then-delete keeps the original recoverable on failure).
        await prisma.cardImage.update({
          where: { id: imgTyped.id },
          data: {
            storageKey: processed.storageKey,
            storageUrl: processed.url,
            sizeBytes: processed.sizeBytes,
          },
        });
        await processed.cleanupOld().catch((e) =>
          console.error(`Cleanup of old image failed for ${imgTyped.id}:`, e)
        );

        // Save LLM detection log
        await prisma.llmLog.create({
          data: {
            userId: card.userId,
            cardId,
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

        // Save LLM orientation log
        await prisma.llmLog.create({
          data: {
            userId: card.userId,
            cardId,
            provider: processed.orientationLog.provider,
            model: processed.orientationLog.model,
            requestHeaders: processed.orientationLog.requestHeaders as never,
            requestBody: processed.orientationLog.requestBody as never,
            responseBody: processed.orientationLog.responseBody as never,
            responseStatus: processed.orientationLog.responseStatus,
            durationMs: processed.orientationLog.durationMs,
            errorMessage: processed.orientationLog.errorMessage,
          },
        });

        // Use the processed buffer directly for OCR (avoid re-fetching)
        processedImages.push({
          base64: processed.buffer.toString("base64"),
          mimeType: "image/jpeg",
          side: imgTyped.side as "FRONT" | "BACK",
          url: processed.url,
        });
      } catch (error) {
        // If not a business card, mark as FAILED
        if (error instanceof Error && "code" in error) {
          const apiErr = error as { code?: string };
          if (apiErr.code === "NOT_A_BUSINESS_CARD") {
            await prisma.card.update({
              where: { id: cardId },
              data: { recognitionStatus: "FAILED", processingStartedAt: null },
            });
            await refundOnFailure();
            return "FAILED";
          }
        }
        // Upstream rate limiting: back off and retry later
        if (error instanceof ApiError && error.code === "LLM_RATE_LIMITED") {
          await prisma.card.update({
            where: { id: cardId },
            data: { recognitionStatus: "PENDING", processingStartedAt: null },
          });
          return "RATE_LIMITED";
        }
        // For other processing errors, also mark FAILED
        throw error;
      }
    }

    // Phase 2: OCR recognition using processed images
    const llm = getLLMProvider();
    const { result, log } = await llm.recognizeCard(processedImages);

    // Save OCR log
    await prisma.llmLog.create({
      data: {
        userId: card.userId,
        cardId,
        provider: log.provider,
        model: log.model,
        requestHeaders: log.requestHeaders as never,
        requestBody: log.requestBody as never,
        responseBody: log.responseBody as never,
        responseStatus: log.responseStatus,
        durationMs: log.durationMs,
        errorMessage: log.errorMessage,
      },
    });

    // Check for rate limiting (429)
    if (log.responseStatus === 429) {
      await prisma.card.update({
        where: { id: cardId },
        data: { recognitionStatus: "PENDING", processingStartedAt: null },
      });
      return "RATE_LIMITED";
    }

    // Sanitize LLM result
    const str = (v: unknown): string | undefined =>
      typeof v === "string" ? v : v != null ? String(v) : undefined;

    // Update card with recognized data
    await prisma.card.update({
      where: { id: cardId },
      data: {
        fullName: str(result.fullName) || card.fullName,
        nameReading: str(result.nameReading) || card.nameReading,
        company: str(result.company) || card.company,
        title: str(result.title) || card.title,
        email: str(result.email) || card.email,
        phone: str(result.phone) || card.phone,
        mobilePhone: str(result.mobilePhone) || card.mobilePhone,
        address: str(result.address) || card.address,
        website: str(result.website) || card.website,
        department: str(result.department) || card.department,
        fax: str(result.fax) || card.fax,
        notes: str(result.notes) || card.notes,
        rawText: str(result.rawText) || card.rawText,
        recognitionStatus: log.errorMessage ? "FAILED" : "SUCCESS",
        processingStartedAt: null,
      },
    });

    if (log.errorMessage) {
      await refundOnFailure();
      return "FAILED";
    }
    return "SUCCESS";
  } catch (error) {
    console.error(`Recognition error for card ${cardId}:`, error);
    await prisma.card.update({
      where: { id: cardId },
      data: { recognitionStatus: "FAILED", processingStartedAt: null },
    }).catch(() => {});
    await refundOnFailure();
    return "FAILED";
  } finally {
    // Safety net: never leave a card stuck in PROCESSING (a stale PROCESSING
    // row permanently occupies a concurrency slot).
    await prisma.card
      .updateMany({
        where: { id: cardId, recognitionStatus: "PROCESSING" },
        data: { recognitionStatus: "FAILED", processingStartedAt: null },
      })
      .catch(() => {});
  }
}

/**
 * Process the recognition queue.
 * Reads config from SystemConfig, checks current concurrency,
 * and processes pending cards with rate limiting and retry logic.
 */
export async function processRecognitionQueue(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  rateLimited: number;
  skipped: number;
  reclaimed: number;
}> {
  const stats = { processed: 0, succeeded: 0, failed: 0, rateLimited: 0, skipped: 0, reclaimed: 0 };

  // Reclaim abandoned PROCESSING slots (crashed workers, killed functions).
  // Without this, leaked slots permanently block the whole pipeline.
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);
  const reclaimed = await prisma.card.updateMany({
    where: {
      recognitionStatus: "PROCESSING",
      OR: [{ processingStartedAt: { lt: staleBefore } }, { processingStartedAt: null }],
    },
    data: { recognitionStatus: "PENDING", processingStartedAt: null },
  });
  stats.reclaimed = reclaimed.count;

  // Read config from SystemConfig
  const [maxConcurrencyConfig, minIntervalConfig] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { key: "recognition_max_concurrency" } }),
    prisma.systemConfig.findUnique({ where: { key: "recognition_min_interval_ms" } }),
  ]);

  const maxConcurrency = Math.max(1, parseInt(maxConcurrencyConfig?.value || "5", 10) || 5);
  const minIntervalMs = Math.max(0, parseInt(minIntervalConfig?.value || "100", 10) || 100);

  // Check how many are currently processing
  const currentProcessing = await prisma.card.count({
    where: { recognitionStatus: "PROCESSING" },
  });

  if (currentProcessing >= maxConcurrency) {
    return stats; // Already at capacity
  }

  const availableSlots = maxConcurrency - currentProcessing;

  // Get pending cards (oldest first)
  const pendingCards = await prisma.card.findMany({
    where: { recognitionStatus: "PENDING", images: { some: {} } },
    orderBy: { createdAt: "asc" },
    take: availableSlots,
    select: { id: true },
  });

  if (pendingCards.length === 0) {
    return stats;
  }

  // Process each card sequentially with minimum interval
  for (let i = 0; i < pendingCards.length; i++) {
    const { id } = pendingCards[i];
    const startTime = Date.now();

    // Retry logic with exponential backoff for rate limiting
    let result: "SUCCESS" | "FAILED" | "RATE_LIMITED" | "SKIPPED" = "FAILED";
    let retries = 0;
    const maxRetries = 3;

    while (retries <= maxRetries) {
      result = await recognizeCard(id);

      if (result === "SKIPPED") {
        break; // Another worker owns this card
      }

      if (result !== "RATE_LIMITED") {
        break;
      }

      retries++;
      if (retries <= maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const backoffMs = Math.pow(2, retries - 1) * 1000;
        await sleep(backoffMs);
      }
    }

    if (result === "SKIPPED") {
      stats.skipped++;
      continue;
    }

    stats.processed++;
    if (result === "SUCCESS") stats.succeeded++;
    else if (result === "RATE_LIMITED") stats.rateLimited++;
    else stats.failed++;

    // Enforce minimum interval between requests
    const elapsed = Date.now() - startTime;
    if (elapsed < minIntervalMs && i < pendingCards.length - 1) {
      await sleep(minIntervalMs - elapsed);
    }
  }

  return stats;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
