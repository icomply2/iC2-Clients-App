import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export async function POST(request: NextRequest) {
  if (!API_BASE_URL) {
    return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  }

  const payload = await request.json().catch(() => null);

  if (!payload) {
    return NextResponse.json({ message: "Invalid registration payload." }, { status: 400 });
  }

  try {
    const response = await fetch(new URL("/api/Users/Register", API_BASE_URL), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    });

    const body = await response.json().catch(() => ({ message: "Registration failed." }));
    return NextResponse.json(body, { status: response.status });
  } catch (error) {
    const message =
      error instanceof Error ? `Proxy registration failed: ${error.message}` : "Proxy registration failed.";

    return NextResponse.json({ message }, { status: 502 });
  }
}
