import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken, setAuthCookie } from "@/lib/auth";
import { apiResponse, apiError, ApiError } from "@/lib/utils";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password, displayName } = body;

    if (!username || !password) {
      throw new ApiError(400, "MISSING_FIELDS", "Username and password are required");
    }

    if (password.length < 6) {
      throw new ApiError(400, "PASSWORD_TOO_SHORT", "Password must be at least 6 characters");
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      throw new ApiError(409, "USERNAME_TAKEN", "Username is already taken");
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        displayName: displayName || username,
      },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
      },
    });

    const token = await signToken(user.id);
    await setAuthCookie(token);

    return apiResponse({ user });
  } catch (error) {
    return apiError(error);
  }
}
