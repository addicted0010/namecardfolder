import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError, ApiError } from "@/lib/utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // LLM logs expose prompt/model internals: admin-only feature.
    const user = await getCurrentUser();
    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
    }
    if (!user.isAdmin) {
      throw new ApiError(403, "FORBIDDEN", "Admin access required");
    }

    const { id } = await params;

    const log = await prisma.llmLog.findUnique({
      where: { id },
    });

    if (!log) {
      throw new ApiError(404, "NOT_FOUND", "Log not found");
    }

    return apiResponse(log);
  } catch (error) {
    return apiError(error);
  }
}
