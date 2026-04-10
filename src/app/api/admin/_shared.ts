import { NextResponse } from "next/server";
import { readAuthTokenFromCookies } from "@/lib/auth";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export async function readAdminToken() {
  return readAuthTokenFromCookies();
}

export function adminConfigError() {
  return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
}

export function adminAuthError() {
  return NextResponse.json({ message: "Not signed in." }, { status: 401 });
}

export async function parseJsonBody(request: Request) {
  return (await request.json().catch(() => null)) as Record<string, unknown> | null;
}
