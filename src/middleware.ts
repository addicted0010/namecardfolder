import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { type NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Inline JWT verification for Edge runtime (no Prisma/bcrypt dependency)
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "fallback-secret-do-not-use-in-production"
);

async function verifyJWT(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

const intlMiddleware = createMiddleware(routing);

const PUBLIC_PATHS = ["/login", "/register", "/privacy-policy", "/terms-of-service"];
const API_PUBLIC_PATHS = ["/api/auth/login", "/api/auth/register", "/api/auth/google", "/api/cron/"];

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes: skip intl, check auth
  if (pathname.startsWith("/api")) {
    const isPublicApi = API_PUBLIC_PATHS.some((p) => pathname.startsWith(p));
    if (isPublicApi) {
      return NextResponse.next();
    }
    const token = request.cookies.get("auth_token")?.value;
    if (!token) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }
    const valid = await verifyJWT(token);
    if (!valid) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Invalid or expired token" } },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // Apply intl middleware first (handles locale routing)
  const response = intlMiddleware(request);

  // Check auth for page routes
  const locale = request.nextUrl.pathname.split("/")[1];
  const pathWithoutLocale = request.nextUrl.pathname.replace(
    new RegExp(`^/${locale}`),
    ""
  );

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathWithoutLocale === p || pathWithoutLocale === p + "/"
  );

  if (!isPublic && pathWithoutLocale !== "" && pathWithoutLocale !== "/") {
    const token = request.cookies.get("auth_token")?.value;
    let authenticated = false;
    if (token) {
      authenticated = await verifyJWT(token);
    }
    if (!authenticated) {
      const loginUrl = new URL(`/${locale}/login`, request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next|_vercel|.*\\..*).*)",
  ],
};
