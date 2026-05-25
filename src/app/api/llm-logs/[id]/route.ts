import { NextRequest } from "next/server";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

    const log = await prisma.llmLog.findFirst({
      where: { id, userId: auth.userId },
    });

    if (!log) {
      throw new ApiError(404, "NOT_FOUND", "Log not found");
    }

    return apiResponse(log);
  } catch (error) {
    return apiError(error);
  }
}
