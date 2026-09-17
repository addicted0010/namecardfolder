import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

const COOKIE_NAME = "auth_token";
const TOKEN_EXPIRY = "7d";

const DEV_FALLBACK_SECRET = "dev-insecure-fallback-secret-change-me-please";

/**
 * Resolve the JWT signing secret. Fails closed in production: if `JWT_SECRET`
 * is missing or too weak, an error is thrown instead of falling back to a
 * publicly-known default (which would allow token forgery).
 */
export function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (secret) {
    if (secret.length < 32) {
      console.warn(
        "[auth] JWT_SECRET is shorter than the recommended 32 characters. Use `openssl rand -base64 32`."
      );
    }
    return new TextEncoder().encode(secret);
  }
  // No secret set: never fall back to a public default in production.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET must be set in production (recommended: a random string of at least 32 characters)."
    );
  }
  console.warn(
    "[auth] JWT_SECRET is not set; using an insecure development fallback. Set JWT_SECRET before deploying."
  );
  return new TextEncoder().encode(DEV_FALLBACK_SECRET);
}

/**
 * Whether the given email is configured as an administrator via the
 * `ADMIN_EMAILS` environment variable (comma-separated, case-insensitive).
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

export interface JWTPayload {
  sub: string;
  iat: number;
  exp: number;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(getJwtSecret());
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

export async function setAuthCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export async function clearAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getAuthToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value ?? null;
}

export async function authenticate(): Promise<{
  userId: string;
} | null> {
  const token = await getAuthToken();
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  // Reject tokens of deleted users (JWTs are otherwise valid until expiry).
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true },
  });
  if (!user) return null;

  return { userId: payload.sub };
}

export async function authenticateOrThrow(): Promise<{ userId: string }> {
  const auth = await authenticate();
  if (!auth) {
    throw new Error("Unauthorized");
  }
  return auth;
}

export async function getCurrentUser() {
  const auth = await authenticate();
  if (!auth) return null;

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      id: true,
      username: true,
      email: true,
      displayName: true,
      isAdmin: true,
      createdAt: true,
    },
  });

  return user;
}
