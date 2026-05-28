import { NextRequest, after } from "next/server";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStorageProvider } from "@/lib/storage";
import { apiResponse, apiError, ApiError } from "@/lib/utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticate();
    if (!auth) {
      throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
    }

    const { id } = await params;

    const card = await prisma.card.findFirst({
      where: { id, userId: auth.userId },
      include: {
        images: true,
        llmLogs: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!card) {
      throw new ApiError(404, "NOT_FOUND", "Card not found");
    }

    // Mark as viewed after response is sent (if not already viewed)
    if (!card.viewedAt) {
      after(async () => {
        await prisma.card.update({
          where: { id },
          data: { viewedAt: new Date() },
        });
      });
    }

    return apiResponse(card);
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticate();
    if (!auth) {
      throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
    }

    const { id } = await params;
    const body = await request.json();

    // Only allow updating specific fields
    const allowedFields = [
      "fullName",
      "nameReading",
      "company",
      "title",
      "email",
      "phone",
      "mobilePhone",
      "address",
      "website",
      "department",
      "fax",
      "notes",
    ];

    const data: Record<string, string | null> = {};
    for (const field of allowedFields) {
      if (field in body) {
        data[field] = body[field] || null;
      }
    }

    const card = await prisma.card.updateMany({
      where: { id, userId: auth.userId },
      data,
    });

    if (card.count === 0) {
      throw new ApiError(404, "NOT_FOUND", "Card not found");
    }

    const updated = await prisma.card.findUnique({
      where: { id },
      include: { images: true },
    });

    return apiResponse(updated);
  } catch (error) {
    return apiError(error);
  }
}

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

    const card = await prisma.card.findFirst({
      where: { id, userId: auth.userId },
      include: { images: true },
    });

    if (!card) {
      throw new ApiError(404, "NOT_FOUND", "Card not found");
    }

    // Delete images from storage
    const storage = getStorageProvider();
    await Promise.all(
      card.images.map((img: { storageKey: string }) => storage.delete(img.storageKey).catch(() => {}))
    );

    // Delete card (cascade deletes images and logs in DB)
    await prisma.card.delete({ where: { id } });

    return apiResponse({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
