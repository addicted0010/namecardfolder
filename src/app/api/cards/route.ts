import { NextRequest } from "next/server";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError, ApiError, paginate } from "@/lib/utils";

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

    return apiResponse({
      data: cards,
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
    const { frontImageId, backImageId } = body;

    if (!frontImageId && !backImageId) {
      throw new ApiError(400, "NO_IMAGES", "At least one image is required");
    }

    // Create card
    const card = await prisma.card.create({
      data: {
        userId: auth.userId,
        recognitionStatus: "PENDING",
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

    return apiResponse(updatedCard, 201);
  } catch (error) {
    return apiError(error);
  }
}
