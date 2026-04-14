import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export async function POST(request: NextRequest) {
  if (!API_BASE_URL) {
    return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  }

  const payload = await request.json().catch(() => null);

  if (!payload) {
    return NextResponse.json({ message: "Invalid login payload." }, { status: 400 });
  }

  try {
    const response = await fetch(new URL("/api/Users/Login", API_BASE_URL), {
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

    if (!response.ok) {
      return NextResponse.json(
        { message: body?.message ?? "Login failed." },
        { status: response.status },
      );
    }

    const token = body?.data?.jwtToken;
    const requiresTwoFactor = body?.data?.requiresTwoFactorAuthentication ?? false;

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
