import { prisma } from "@/lib/prisma";
import { getLLMProvider } from "@/lib/llm";
import { processCardImage } from "@/lib/image-processing";
import { readFile } from "fs/promises";
import { join } from "path";
import { AliyunOSSProvider } from "@/lib/storage/aliyun-oss";

/**
 * Fetch image buffer from storage URL.
 */
async function fetchImageBuffer(storageUrl: string): Promise<Buffer> {
  if (storageUrl.startsWith("/uploads/")) {
    const filePath = join(process.cwd(), "public", storageUrl);
    return await readFile(filePath);
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
 * Returns "SUCCESS" | "FAILED" | "RATE_LIMITED"
 */
export async function recognizeCard(cardId: string): Promise<"SUCCESS" | "FAILED" | "RATE_LIMITED"> {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: { images: true },
  });

  if (!card || card.images.length === 0) {
    await prisma.card.update({
      where: { id: cardId },
      data: { recognitionStatus: "FAILED" },
    }).catch(() => {});
    return "FAILED";
  }

  // Update status to PROCESSING
  await prisma.card.update({
    where: { id: cardId },
    data: { recognitionStatus: "PROCESSING" },
  });

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

        // Update CardImage with processed file info
        await prisma.cardImage.update({
          where: { id: imgTyped.id },
          data: {
            storageKey: processed.storageKey,
            storageUrl: processed.url,
            sizeBytes: processed.sizeBytes,
          },
        });

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

        // Check for rate limiting from detectCard
        if (processed.log.responseStatus === 429) {
          await prisma.card.update({
            where: { id: cardId },
            data: { recognitionStatus: "PENDING" },
          });
          return "RATE_LIMITED";
        }

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
              data: { recognitionStatus: "FAILED" },
            });
            return "FAILED";
          }
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
        data: { recognitionStatus: "PENDING" },
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
      },
    });

    return log.errorMessage ? "FAILED" : "SUCCESS";
  } catch (error) {
    console.error(`Recognition error for card ${cardId}:`, error);
    await prisma.card.update({
      where: { id: cardId },
      data: { recognitionStatus: "FAILED" },
    }).catch(() => {});
    return "FAILED";
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
}> {
  const stats = { processed: 0, succeeded: 0, failed: 0, rateLimited: 0 };

  // Read config from SystemConfig
  const [maxConcurrencyConfig, minIntervalConfig] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { key: "recognition_max_concurrency" } }),
    prisma.systemConfig.findUnique({ where: { key: "recognition_min_interval_ms" } }),
  ]);

  const maxConcurrency = parseInt(maxConcurrencyConfig?.value || "5", 10);
  const minIntervalMs = parseInt(minIntervalConfig?.value || "100", 10);

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
  for (const { id } of pendingCards) {
    const startTime = Date.now();

    // Retry logic with exponential backoff for rate limiting
    let result: "SUCCESS" | "FAILED" | "RATE_LIMITED" = "FAILED";
    let retries = 0;
    const maxRetries = 3;

    while (retries <= maxRetries) {
      result = await recognizeCard(id);

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

    stats.processed++;
    if (result === "SUCCESS") stats.succeeded++;
    else if (result === "RATE_LIMITED") stats.rateLimited++;
    else stats.failed++;

    // Enforce minimum interval between requests
    const elapsed = Date.now() - startTime;
    if (elapsed < minIntervalMs && pendingCards.indexOf({ id }) < pendingCards.length - 1) {
      await sleep(minIntervalMs - elapsed);
    }
  }

  return stats;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
