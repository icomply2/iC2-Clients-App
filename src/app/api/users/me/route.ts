import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { getUserPreferences } from "@/lib/api/users";
import { mockClientSummaries } from "@/lib/client-mocks";
import { resolveCurrentUserFromApi } from "@/lib/current-user";
import { DEFAULT_DOCUMENT_STYLE_PROFILE, normalizeDocumentStyleProfile } from "@/lib/documents/document-style-profile";
import { getApiBaseUrl, isMockAuthEnabled } from "@/lib/server-runtime";
import { readUserProfileOverride } from "@/lib/user-profile-overrides-store";

function decodeJwtPayload(token: string) {
  const parts = token.split(".");

  if (parts.length < 2) {
    return null;
  }

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  
  const apiBaseUrl = getApiBaseUrl();
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (isMockAuthEnabled()) {
    const payload = token ? decodeJwtPayload(token) : null;

    return NextResponse.json(
      {
        data: {
          id: "mock-user",
          email: typeof payload?.email === "string" ? payload.email : null,
          name: typeof payload?.name === "string" ? payload.name : typeof payload?.email === "string" ? payload.email : "Mock User",
          userRole: typeof payload?.userRole === "string" ? payload.userRole : "Admin",
          practice: {
            id: "mock-practice-1",
            name: mockClientSummaries[0]?.clientAdviserPracticeName ?? null,
          },
          licensee: {
            id: "mock-licensee-1",
            name: mockClientSummaries[0]?.clientAdviserLicenseeName ?? null,
          },
          documentStyleProfile: DEFAULT_DOCUMENT_STYLE_PROFILE,
        },
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
    const matchedUser = await resolveCurrentUserFromApi(token);
    if (!matchedUser?.id) {
      return NextResponse.json({ message: "Unable to resolve the signed-in user." }, { status: 404 });
    }

    const [profileOverride, preferencesResult] = await Promise.all([
      readUserProfileOverride(matchedUser.id),
      getUserPreferences(matchedUser.id, token).catch(() => null),
    ]);

    return NextResponse.json(
      {
        data: {
          ...matchedUser,
          preferences: preferencesResult?.data ?? null,
          documentStyleProfile: normalizeDocumentStyleProfile(
            preferencesResult?.data?.documentStyle ?? profileOverride?.documentStyleProfile,
          ),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? `Current user proxy failed: ${error.message}` : "Current user proxy failed.";
    return NextResponse.json({ message }, { status: 502 });
  }
}
