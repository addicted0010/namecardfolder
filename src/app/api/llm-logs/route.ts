import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError, ApiError, paginate } from "@/lib/utils";

export async function GET(request: NextRequest) {
  try {
    // LLM logs expose prompt/model internals: admin-only feature.
    const user = await getCurrentUser();
    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
    }
    if (!user.isAdmin) {
      throw new ApiError(403, "FORBIDDEN", "Admin access required");
    }

    const url = new URL(request.url);
    const cardId = url.searchParams.get("cardId");
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get("pageSize") || "20", 10) || 20));

    const where: Record<string, unknown> = cardId ? { cardId } : { userId: user.id };

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
