import { NextRequest, after } from "next/server";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError, ApiError, paginate } from "@/lib/utils";
import { processRecognitionQueue } from "@/lib/recognition-queue";
import { AliyunOSSProvider } from "@/lib/storage/aliyun-oss";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticate();
    if (!auth) {
      throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
    }

    const url = new URL(request.url);
    const q = url.searchParams.get("q") || "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get("pageSize") || "12")));

    const where: Record<string, unknown> = { userId: auth.userId };

    if (q) {
      where.OR = [
        { fullName: { contains: q, mode: "insensitive" } },
        { nameReading: { contains: q, mode: "insensitive" } },
        { company: { contains: q, mode: "insensitive" } },
        { title: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
        { address: { contains: q, mode: "insensitive" } },
        { department: { contains: q, mode: "insensitive" } },
        { notes: { contains: q, mode: "insensitive" } },
        { source: { contains: q, mode: "insensitive" } },
      ];
    }

    const [cards, total] = await Promise.all([
      prisma.card.findMany({
        where,
        include: {
          images: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.card.count({ where }),
    ]);

    const cardsWithUrls = await enrichImagesWithUrls(cards);

    return apiResponse({
      data: cardsWithUrls,
      pagination: paginate(page, pageSize, total),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticate();
    if (!auth) {
      throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
    }

    const body = await request.json();
    const { frontImageId, backImageId, source } = body;

    if (!frontImageId && !backImageId) {
      throw new ApiError(400, "NO_IMAGES", "At least one image is required");
    }

    // Create card
    const card = await prisma.card.create({
      data: {
        userId: auth.userId,
        recognitionStatus: "PENDING",
        ...(source ? { source } : {}),
      },
      include: { images: true },
    });

    // Associate images with card
    const imageIds = [frontImageId, backImageId].filter(Boolean);
    if (imageIds.length > 0) {
      await prisma.cardImage.updateMany({
        where: { id: { in: imageIds }, cardId: null },
        data: { cardId: card.id },
      });
    }

    const updatedCard = await prisma.card.findUnique({
      where: { id: card.id },
      include: { images: true },
    });

    // Trigger background recognition after response is sent
    after(async () => {
      await processRecognitionQueue();
    });

    return apiResponse(updatedCard, 201);
  } catch (error) {
    return apiError(error);
  }
}

/**
 * Enrich card images with direct access URLs (signed URLs for OSS).
 * This avoids N+1 API calls from the frontend for each image.
 */
async function enrichImagesWithUrls(
  cards: Array<{ images: Array<{ id: string; storageUrl: string; [key: string]: unknown }> } & Record<string, unknown>>
) {
  const storageType = process.env.STORAGE_PROVIDER || "local";

  if (storageType === "aliyun-oss") {
    const ossProvider = new AliyunOSSProvider();
    return Promise.all(
      cards.map(async (card) => ({
        ...card,
        images: await Promise.all(
          card.images.map(async (img) => {
            if (img.storageUrl.startsWith("oss://")) {
              const storageKey = (img.storageUrl as string).replace("oss://", "");
              const imageUrl = await ossProvider.getSignedUrl(storageKey, 3600);
              return { ...img, imageUrl };
            }
            return { ...img, imageUrl: `/api/images/${img.id}` };
          })
        ),
      }))
    );
  }

  // For local / vercel storage, use proxy API
  return cards.map((card) => ({
    ...card,
    images: card.images.map((img) => ({
      ...img,
      imageUrl: `/api/images/${img.id}`,
    })),
  }));
}
