import { NextRequest, after } from "next/server";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStorageProvider } from "@/lib/storage";
import { apiResponse, apiError, ApiError } from "@/lib/utils";
import { AliyunOSSProvider } from "@/lib/storage/aliyun-oss";

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

    // Enrich images with direct access URLs
    const storageType = process.env.STORAGE_PROVIDER || "local";
    let enrichedImages: Array<Record<string, unknown>> = card.images.map(
      (img: { id: string; storageUrl: string }) => ({ ...img, imageUrl: `/api/images/${img.id}` })
    );

    if (storageType === "aliyun-oss") {
      const ossProvider = new AliyunOSSProvider();
      enrichedImages = await Promise.all(
        card.images.map(async (img: { id: string; storageUrl: string }) => {
          if (img.storageUrl.startsWith("oss://")) {
            const storageKey = img.storageUrl.replace("oss://", "");
            const imageUrl = await ossProvider.getSignedUrl(storageKey, 3600);
            return { ...img, imageUrl };
          }
          return { ...img, imageUrl: `/api/images/${img.id}` };
        })
      );
    }

    return apiResponse({ ...card, images: enrichedImages });
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
      "source",
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
