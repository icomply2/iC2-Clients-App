import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { normalizeDocumentStyleProfile } from "@/lib/documents/document-style-profile";
import { getApiBaseUrl, isMockAuthEnabled } from "@/lib/server-runtime";
import { writeUserProfileOverride } from "@/lib/user-profile-overrides-store";
import type { UserPreferences } from "@/lib/api/types";

async function forwardPreferencesRequest(
  request: NextRequest,
  userId: string,
  method: "GET" | "PATCH",
  payload?: UserPreferences | null,
) {
  const apiBaseUrl = getApiBaseUrl();
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (isMockAuthEnabled()) {
    if (method === "PATCH" && payload?.documentStyle) {
      await writeUserProfileOverride(userId, {
        documentStyleProfile: normalizeDocumentStyleProfile(payload.documentStyle),
      });
    }

    return NextResponse.json(
      method === "GET"
        ? {
            statusCode: 200,
            status: true,
            data: {
              application: {
                landingPage: "/clients",
                pageSize: 10,
                useCompactListSpacing: false,
              },
              documentStyle: normalizeDocumentStyleProfile(null),
            },
            message: null,
            modelErrors: null,
          }
        : {
            statusCode: 200,
            status: true,
            data: true,
            message: null,
            modelErrors: null,
          },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!apiBaseUrl) {
    return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  }

  if (!token) {
    return NextResponse.json({ message: "Not signed in." }, { status: 401 });
  }

  try {
    const response = await fetch(new URL(`/api/Users/${encodeURIComponent(userId)}/Preferences`, apiBaseUrl), {
      method,
      headers: {
        Accept: "application/json",
        ...(method === "PATCH" ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${token}`,
      },
      ...(method === "PATCH" ? { body: JSON.stringify(payload ?? {}) } : {}),
      cache: "no-store",
    });

    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "application/json";

    if (response.ok && method === "PATCH" && payload?.documentStyle) {
      await writeUserProfileOverride(userId, {
        documentStyleProfile: normalizeDocumentStyleProfile(payload.documentStyle),
      });
    }

    return new NextResponse(text, {
      status: response.status,
      headers: {
        "content-type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? `User preferences proxy failed: ${error.message}` : "User preferences proxy failed.";

    return NextResponse.json({ message }, { status: 502 });
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return forwardPreferencesRequest(request, userId, "GET");
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const payload = (await request.json().catch(() => null)) as UserPreferences | null;

  if (!payload) {
    return NextResponse.json({ message: "Request body is required." }, { status: 400 });
  }

  return forwardPreferencesRequest(request, userId, "PATCH", payload);
}
