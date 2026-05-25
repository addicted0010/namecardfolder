import { NextRequest } from "next/server";
import { authenticate } from "@/lib/auth";
import { getStorageProvider } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError, ApiError } from "@/lib/utils";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticate();
    if (!auth) {
      throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
    }

    const { id } = await params;

    // Only allow deleting orphan images (not yet attached to a card)
    const cardImage = await prisma.cardImage.findUnique({
      where: { id },
    });

    if (!cardImage) {
      throw new ApiError(404, "NOT_FOUND", "Image not found");
    }

    if (cardImage.cardId !== null) {
      throw new ApiError(403, "FORBIDDEN", "Cannot delete image attached to a card");
    }

    // Delete from storage
    const storage = getStorageProvider();
    await storage.delete(cardImage.storageKey);

    // Delete from database
    await prisma.cardImage.delete({ where: { id } });

    return apiResponse({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
