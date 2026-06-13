import { NextRequest } from "next/server";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError, ApiError } from "@/lib/utils";
import { recognizeCard } from "@/lib/recognition-queue";
import {
  DailyCreditLimitExceededError,
  getCreditCostForImageIds,
  reserveDailyCredits,
} from "@/lib/credits";

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

    // Verify card ownership
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

    await reserveDailyCredits(
      auth.userId,
      getCreditCostForImageIds(card.images.map((image) => image.id))
    );

    // Run recognition using shared logic
    const result = await recognizeCard(id);

    if (result === "RATE_LIMITED") {
      throw new ApiError(429, "RATE_LIMITED", "LLM service is rate limited, will retry automatically");
    }

    // Return updated card
    const updatedCard = await prisma.card.findUnique({
      where: { id },
      include: { images: true, llmLogs: { orderBy: { createdAt: "desc" }, take: 5 } },
    });

    return apiResponse(updatedCard);
  } catch (error) {
    if (error instanceof DailyCreditLimitExceededError) {
      return apiError(
        new ApiError(
          429,
          "DAILY_CREDIT_LIMIT_EXCEEDED",
          `Daily credit limit exceeded. Remaining: ${error.status.remaining ?? 0}, required: ${error.requiredCredits}.`
        )
      );
    }
    return apiError(error);
  }
}

