import { NextRequest } from "next/server";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLLMProvider } from "@/lib/llm";
import { apiResponse, apiError, ApiError } from "@/lib/utils";
import { readFile } from "fs/promises";
import { join } from "path";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticate();
    if (!auth) {
      throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
    }

    const { id } = await params;

    // Get card with images
    const card = await prisma.card.findFirst({
      where: { id, userId: auth.userId },
      include: { images: true },
    });

    if (!card) {
      throw new ApiError(404, "NOT_FOUND", "Card not found");
    }

    if (card.images.length === 0) {
      throw new ApiError(400, "NO_IMAGES", "Card has no images");
    }

    // Update status to processing
    await prisma.card.update({
      where: { id },
      data: { recognitionStatus: "PROCESSING" },
    });

    // Prepare images for LLM
    const images = await Promise.all(
      card.images.map(async (img) => {
        let base64: string;

        if (img.storageUrl.startsWith("/uploads/")) {
          // Local file
          const filePath = join(process.cwd(), "public", img.storageUrl);
          const buffer = await readFile(filePath);
          base64 = buffer.toString("base64");
        } else {
          // Remote URL (Vercel Blob)
          const res = await fetch(img.storageUrl);
          const buffer = Buffer.from(await res.arrayBuffer());
          base64 = buffer.toString("base64");
        }

        return {
          url: img.storageUrl,
          base64,
          mimeType: img.mimeType,
          side: img.side as "FRONT" | "BACK",
        };
      })
    );

    // Call LLM
    const llm = getLLMProvider();
    const { result, log } = await llm.recognizeCard(images);

    // Save log
    await prisma.llmLog.create({
      data: {
        userId: auth.userId,
        cardId: id,
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

    // Sanitize LLM result: ensure all fields are strings (LLM may return unexpected types)
    const str = (v: unknown): string | undefined =>
      typeof v === "string" ? v : v != null ? String(v) : undefined;

    // Update card with recognized data
    const updatedCard = await prisma.card.update({
      where: { id },
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
      include: { images: true, llmLogs: { orderBy: { createdAt: "desc" }, take: 5 } },
    });

    return apiResponse(updatedCard);
  } catch (error) {
    console.error("Recognition error:", error);
    // Reset status on error
    try {
      const { id } = await params;
      await prisma.card.update({
        where: { id },
        data: { recognitionStatus: "FAILED" },
      });
    } catch {}

    return apiError(error);
  }
}
