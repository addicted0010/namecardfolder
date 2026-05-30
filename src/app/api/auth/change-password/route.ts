import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authenticateOrThrow,
  verifyPassword,
  hashPassword,
  clearAuthCookie,
} from "@/lib/auth";
import { apiResponse, apiError, ApiError } from "@/lib/utils";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await authenticateOrThrow();

    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      throw new ApiError(400, "MISSING_FIELDS", "Current password and new password are required");
    }

    if (newPassword.length < 6) {
      throw new ApiError(400, "PASSWORD_TOO_SHORT", "Password must be at least 6 characters");
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiError(404, "USER_NOT_FOUND", "User not found");
    }

    // For Google-only users setting password for the first time,
    // skip current password verification
    if (user.passwordHash) {
      const valid = await verifyPassword(currentPassword, user.passwordHash);
      if (!valid) {
        throw new ApiError(401, "CURRENT_PASSWORD_WRONG", "Current password is incorrect");
      }

      const isSame = await verifyPassword(newPassword, user.passwordHash);
      if (isSame) {
        throw new ApiError(400, "SAME_PASSWORD", "New password cannot be the same as current password");
      }
    }

    const newHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    await clearAuthCookie();

    return apiResponse({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return apiResponse({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, 401);
    }
    return apiError(error);
  }
}
