import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

function decodeJwtPayload(token: string) {
  const parts = token.split(".");

  if (parts.length < 2) {
    return null;
  }

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = Buffer.from(padded, "base64").toString("utf8");

    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readStringClaim(payload: Record<string, unknown>, claimNames: string[]) {
  for (const claimName of claimNames) {
    const value = payload[claimName];

    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}

export async function GET(request: NextRequest) {
  if (!API_BASE_URL) {
    return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ message: "Not signed in." }, { status: 401 });
  }

  const payload = decodeJwtPayload(token);
  const currentUserId = payload
    ? readStringClaim(payload, [
        "nameid",
        "sub",
        "uid",
        "userId",
        "id",
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier",
      ])
    : null;
  const currentEmail = payload
    ? readStringClaim(payload, [
        "email",
        "unique_name",
        "upn",
        "preferred_username",
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
      ])
    : null;

  try {
    const response = await fetch(new URL("/api/Users", API_BASE_URL), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const body = (await response.json().catch(() => null)) as
      | {
          data?: Array<{
            id?: string | null;
            email?: string | null;
            name?: string | null;
            userRole?: string | null;
            userStatus?: string | null;
            appAccess?: string | null;
            practice?: { id?: string | null; name?: string | null } | null;
            licensee?: { id?: string | null; name?: string | null } | null;
          }> | null;
          message?: string | null;
        }
      | null;

    if (!response.ok) {
      return NextResponse.json({ message: body?.message ?? "Unable to load the current user." }, { status: response.status });
    }

    const matchedUser =
      body?.data?.find((user) => currentUserId && user.id && user.id === currentUserId) ??
      body?.data?.find(
        (user) =>
          currentEmail &&
          user.email &&
          currentEmail.trim().toLowerCase() === user.email.trim().toLowerCase(),
      ) ??
      null;

    if (!matchedUser) {
      return NextResponse.json({ message: "Unable to resolve the signed-in user." }, { status: 404 });
    }

    return NextResponse.json({ data: matchedUser }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? `Current user proxy failed: ${error.message}` : "Current user proxy failed.";

    return NextResponse.json({ message }, { status: 502 });
  }
}
