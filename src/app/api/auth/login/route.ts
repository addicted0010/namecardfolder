import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, signToken, setAuthCookie } from "@/lib/auth";
import { apiResponse, apiError, ApiError } from "@/lib/utils";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      throw new ApiError(400, "MISSING_FIELDS", "Username and password are required");
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid username or password");
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid username or password");
    }

    const token = await signToken(user.id);
    await setAuthCookie(token);

    return apiResponse({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
