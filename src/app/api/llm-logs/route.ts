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
    const cardId = url.searchParams.get("cardId");
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get("pageSize") || "20")));

    const where: Record<string, unknown> = { userId: auth.userId };
    if (cardId) {
      where.cardId = cardId;
    }

    const [logs, total] = await Promise.all([
      prisma.llmLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          cardId: true,
          provider: true,
          model: true,
          responseStatus: true,
          durationMs: true,
          errorMessage: true,
          createdAt: true,
        },
      }),
      prisma.llmLog.count({ where }),
    ]);

    return apiResponse({
      data: logs,
      pagination: paginate(page, pageSize, total),
    });
  } catch (error) {
    return apiError(error);
  }
}
