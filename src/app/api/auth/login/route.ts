import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { isArchivedUserToken } from "@/lib/auth-user-status";
import { getApiBaseUrl, isMockAuthEnabled } from "@/lib/server-runtime";

function encodeBase64Url(value: unknown) {
  return Buffer.from(JSON.stringify(value))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createMockToken(email: string) {
  const now = Math.floor(Date.now() / 1000);

  return [
    encodeBase64Url({ alg: "none", typ: "JWT" }),
    encodeBase64Url({
      sub: "mock-user",
      name: email,
      email,
      userRole: "Admin",
      iat: now,
      exp: now + 60 * 60 * 8,
    }),
    "mock-signature",
  ].join(".");
}

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);

  if (!payload) {
    return NextResponse.json({ message: "Invalid login payload." }, { status: 400 });
  }

  if (isMockAuthEnabled()) {
    const email = typeof payload.email === "string" && payload.email.trim() ? payload.email.trim() : "mock.user@ic2.local";
    const token = createMockToken(email);
    const nextResponse = NextResponse.json(
      {
        data: {
          jwtToken: token,
          requiresTwoFactorAuthentication: false,
        },
        message: "Mock login successful.",
      },
      { status: 200 },
    );

    nextResponse.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });

    return nextResponse;
  }

  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl) {
    return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  }
  try {
    const response = await fetch(new URL("/api/Users/Login", apiBaseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const body = (await response.json().catch(() => null)) as
      | {
          data?: { jwtToken?: string | null; requiresTwoFactorAuthentication?: boolean };
          message?: string | null;
        }
      | null;

     ;
    if (!response.ok) {
      return NextResponse.json(
        { message: body?.message ?? "Login failed." },
        { status: response.status },
      );
    }
    
    const token = body?.data?.jwtToken;
    const requiresTwoFactor = body?.data?.requiresTwoFactorAuthentication ?? false;
    if (token && !requiresTwoFactor && await isArchivedUserToken(token)) {
      return NextResponse.json(
        { message: "This account has been archived. Please contact your administrator." },
        { status: 403 },
      );
    }

    const nextResponse = NextResponse.json(body, { status: response.status });

    if (token && !requiresTwoFactor) {
      nextResponse.cookies.set(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });
    }

    return nextResponse;
  } catch (error) {
    const message =
      error instanceof Error ? `Proxy login failed: ${error.message}` : "Proxy login failed.";

    return NextResponse.json({ message }, { status: 502 });
  }
}
