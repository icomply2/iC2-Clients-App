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

async function resolveCurrentUserPracticeName(token: string) {
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
          practice?: { name?: string | null } | null;
        }> | null;
      }
    | null;

  if (!response.ok) {
    throw new Error("Unable to resolve the current user scope.");
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

  return matchedUser?.practice?.name?.trim() ?? null;
}

export async function GET(request: NextRequest) {
  if (!API_BASE_URL) {
    return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  }

  const upstreamUrl = new URL("/api/ClientProfiles/SearchClientProfile", API_BASE_URL);
  const clientName = request.nextUrl.searchParams.get("search") ?? undefined;
  const adviserName = request.nextUrl.searchParams.get("adviser") ?? undefined;
  const continuationToken = request.nextUrl.searchParams.get("continuationToken") ?? undefined;
  const pageSize = Number(request.nextUrl.searchParams.get("pageSize") ?? "25");

  try {
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    const resolvedPracticeName = token ? await resolveCurrentUserPracticeName(token).catch(() => null) : null;

    const response = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        pageSize,
        continuationToken: continuationToken || undefined,
        clientName,
        adviserName: adviserName && adviserName !== "All advisers" ? adviserName : undefined,
        practiceName: resolvedPracticeName || undefined,
      }),
      cache: "no-store",
    });

    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "application/json";

    if (!response.ok || !contentType.includes("application/json")) {
      return new NextResponse(text, {
        status: response.status,
        headers: {
          "content-type": contentType,
        },
      });
    }

    const body = JSON.parse(text) as {
      data?: {
        items?: Array<{
          practice?: string | null;
        }>;
        totalPageCount?: number | null;
      } | null;
    };

    if (resolvedPracticeName && Array.isArray(body.data?.items)) {
      body.data.items = body.data.items.filter(
        (item) => item.practice?.trim().toLowerCase() === resolvedPracticeName.trim().toLowerCase(),
      );
    }

    return new NextResponse(JSON.stringify(body), {
      status: response.status,
      headers: {
        "content-type": "application/json",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? `Proxy request failed: ${error.message}` : "Proxy request failed.";

    return NextResponse.json({ message }, { status: 502 });
  }
}
