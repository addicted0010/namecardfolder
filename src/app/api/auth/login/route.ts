import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, signToken, setAuthCookie } from "@/lib/auth";
import { apiResponse, apiError, ApiError } from "@/lib/utils";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      throw new ApiError(400, "MISSING_FIELDS", "Username and password are required");
    }

    // Brute-force protection: 5 attempts per 15 minutes per IP+username.
    if (isRateLimited(`login:${getClientIp(request)}:${username}`, 5, 15 * 60 * 1000)) {
      throw new ApiError(429, "TOO_MANY_REQUESTS", "Too many login attempts, try again later");
    }

    const user = await prisma.user.findUnique({ where: username });
    if (!user) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid username or password");
    }

    // User registered via Google only (no password set). Same status/code
    // family as invalid credentials to avoid account enumeration.
    if (!user.passwordHash) {
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
        isAdmin: user.isAdmin,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
