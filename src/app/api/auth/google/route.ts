import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { getJwtSecret } from "@/lib/auth";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

// Generate a random state parameter for CSRF protection
async function generateState(): Promise<string> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: { code: "CONFIG_ERROR", message: "Google OAuth is not configured" } },
      { status: 500 }
    );
  }

  const state = await generateState();

  // Store state in a short-lived cookie for CSRF validation
  const stateToken = await new SignJWT({ state })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(getJwtSecret());

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "select_account",
  });

  const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;

  // Get the locale from the referer or default to 'en'
  const referer = request.headers.get("referer") || "";
  const localeMatch = referer.match(/\/([a-z]{2})\//);
  const locale = localeMatch ? localeMatch[1] : "en";

  const response = NextResponse.json({ url: authUrl, locale });

  response.cookies.set("google_oauth_state", stateToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // 10 minutes
  });

  // Also store the locale for redirect after callback
  response.cookies.set("oauth_locale", locale, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });

  return response;
}
