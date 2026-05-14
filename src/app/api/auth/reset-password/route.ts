import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

type ResetPasswordPayload = {
  email?: string | null;
  code?: string | null;
  newPassword?: string | null;
};

export async function POST(request: NextRequest) {
  if (!API_BASE_URL) {
    return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  }

  const payload = (await request.json().catch(() => null)) as ResetPasswordPayload | null;
  const email = payload?.email?.trim();
  const code = payload?.code?.trim();
  const newPassword = payload?.newPassword;

  if (!email || !code || !newPassword) {
    return NextResponse.json({ message: "Email, reset code, and new password are required." }, { status: 400 });
  }

  try {
    const response = await fetch(new URL("/api/Users/ResetPassword", API_BASE_URL), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ email, code, newPassword }),
      cache: "no-store",
    });

    const body = await response.json().catch(() => ({ message: "Password reset failed." }));

    return NextResponse.json(body, { status: response.status });
  } catch (error) {
    const message =
      error instanceof Error ? `Proxy reset-password failed: ${error.message}` : "Proxy reset-password failed.";

    return NextResponse.json({ message }, { status: 502 });
  }
}
