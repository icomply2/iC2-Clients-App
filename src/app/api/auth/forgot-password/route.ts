import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export async function GET(request: NextRequest) {
  if (!API_BASE_URL) {
    return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  }

  const email = request.nextUrl.searchParams.get("email");

  if (!email) {
    return NextResponse.json({ message: "Email is required." }, { status: 400 });
  }

  const upstreamUrl = new URL("/api/Users/ForgotPassword", API_BASE_URL);
  upstreamUrl.searchParams.set("email", email);

  try {
    const response = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const body = await response.json().catch(() => ({ message: "Password reset request failed." }));

    return NextResponse.json(body, { status: response.status });
  } catch (error) {
    const message =
      error instanceof Error ? `Proxy forgot-password failed: ${error.message}` : "Proxy forgot-password failed.";

    return NextResponse.json({ message }, { status: 502 });
  }
}
