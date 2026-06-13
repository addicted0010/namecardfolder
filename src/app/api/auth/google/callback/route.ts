import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { signToken, setAuthCookie, getJwtSecret, isAdminEmail } from "@/lib/auth";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture?: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // Get locale for redirect
    const locale = request.cookies.get("oauth_locale")?.value || "en";
    const loginUrl = `/${locale}/login`;

    // Handle Google OAuth errors
    if (error) {
      console.error("Google OAuth error:", error);
      return NextResponse.redirect(
        new URL(`${loginUrl}?error=google_auth_failed`, request.url)
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL(`${loginUrl}?error=missing_params`, request.url)
      );
    }

    // Verify state to prevent CSRF
    const stateCookie = request.cookies.get("google_oauth_state")?.value;
    if (!stateCookie) {
      return NextResponse.redirect(
        new URL(`${loginUrl}?error=invalid_state`, request.url)
      );
    }

    try {
      const { payload } = await jwtVerify(stateCookie, getJwtSecret());
      if (payload.state !== state) {
        return NextResponse.redirect(
          new URL(`${loginUrl}?error=state_mismatch`, request.url)
        );
      }
    } catch {
      return NextResponse.redirect(
        new URL(`${loginUrl}?error=invalid_state`, request.url)
      );
    }

    // Exchange authorization code for tokens
    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI!;

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      console.error("Google token exchange failed:", await tokenResponse.text());
      return NextResponse.redirect(
        new URL(`${loginUrl}?error=token_exchange_failed`, request.url)
      );
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Fetch user info from Google
    const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userInfoResponse.ok) {
      console.error("Google userinfo fetch failed:", await userInfoResponse.text());
      return NextResponse.redirect(
        new URL(`${loginUrl}?error=userinfo_failed`, request.url)
      );
    }

    const googleUser: GoogleUserInfo = await userInfoResponse.json();

    if (!googleUser.email) {
      return NextResponse.redirect(
        new URL(`${loginUrl}?error=no_email`, request.url)
      );
    }

    const emailVerified = googleUser.email_verified === true;

    // Find or create user
    let user = await prisma.user.findFirst({
      where: { googleId: googleUser.sub },
    });

    if (!user) {
      // Only auto-link to an existing account when Google has verified the
      // email, otherwise an unverified email could hijack another account.
      const existingByEmail = emailVerified
        ? await prisma.user.findFirst({ where: { email: googleUser.email } })
        : null;

      if (existingByEmail) {
        // Link Google account to existing user
        user = await prisma.user.update({
          where: { id: existingByEmail.id },
          data: { googleId: googleUser.sub },
        });
      } else {
        // Create new user
        const baseUsername = googleUser.email.split("@")[0];
        let username = baseUsername;
        let suffix = 1;

        // Ensure unique username
        while (await prisma.user.findUnique({ where: { username } })) {
          username = `${baseUsername}${suffix}`;
          suffix++;
        }

        user = await prisma.user.create({
          data: {
            username,
            email: googleUser.email,
            googleId: googleUser.sub,
            displayName: googleUser.name || null,
            passwordHash: null,
          },
        });
      }
    }

    // Grant admin rights when the verified email is configured in ADMIN_EMAILS.
    if (emailVerified && isAdminEmail(googleUser.email) && !user.isAdmin) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { isAdmin: true },
      });
    }

    // Issue JWT token and set cookie (same as password login)
    const token = await signToken(user.id);
    await setAuthCookie(token);

    // Clean up OAuth cookies
    const response = NextResponse.redirect(
      new URL(`/${locale}/cards`, request.url)
    );
    response.cookies.delete("google_oauth_state");
    response.cookies.delete("oauth_locale");

    return response;
  } catch (error) {
    console.error("Google OAuth callback error:", error);
    const locale = request.cookies.get("oauth_locale")?.value || "en";
    return NextResponse.redirect(
      new URL(`/${locale}/login?error=unexpected`, request.url)
    );
  }
}
