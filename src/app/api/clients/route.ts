import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { mockClientSummaries } from "@/lib/client-mocks";
import { resolveCurrentUserFromApi } from "@/lib/current-user";
import { getApiBaseUrl, isMockAuthEnabled } from "@/lib/server-runtime";

function normalizeText(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function getClientItemPracticeName(item: {
  practice?: string | null;
  practiceName?: string | null;
  clientAdviserPracticeName?: string | null;
}) {
  return item.clientAdviserPracticeName?.trim() || item.practiceName?.trim() || item.practice?.trim() || "";
}

function getClientItemLicenseeName(item: {
  licensee?: string | null;
  licenseeName?: string | null;
  clientAdviserLicenseeName?: string | null;
}) {
  return item.clientAdviserLicenseeName?.trim() || item.licenseeName?.trim() || item.licensee?.trim() || "";
}

export async function GET(request: NextRequest) {
  const apiBaseUrl = getApiBaseUrl();
  const clientName = request.nextUrl.searchParams.get("search") ?? undefined;
  const adviserName = request.nextUrl.searchParams.get("adviser") ?? undefined;
  const continuationToken = request.nextUrl.searchParams.get("continuationToken") ?? undefined;
  const pageSize = Number(request.nextUrl.searchParams.get("pageSize") ?? "25");

  if (isMockAuthEnabled()) {
    const normalizedSearch = clientName?.trim().toLowerCase() ?? "";
    const filteredItems = mockClientSummaries.filter((client) => {
      const matchesSearch = !normalizedSearch || (client.name ?? "").toLowerCase().includes(normalizedSearch);
      const matchesAdviser = !adviserName || adviserName === "All advisers" || client.clientAdviserName === adviserName;

      return matchesSearch && matchesAdviser;
    });

    return NextResponse.json(
      {
        data: {
          items: filteredItems.slice(0, pageSize).map((client) => ({
            id: client.id,
            client: { name: client.name },
            partner: null,
            adviser: { name: client.clientAdviserName },
            practice: client.clientAdviserPracticeName,
            licensee: client.clientAdviserLicenseeName,
            clientAdviserName: client.clientAdviserName,
            clientAdviserPracticeName: client.clientAdviserPracticeName,
            clientAdviserLicenseeName: client.clientAdviserLicenseeName,
            category: client.category,
            clientCategory: client.clientCategory,
          })),
          continuationToken: continuationToken ?? null,
          totalPageCount: Math.max(Math.ceil(filteredItems.length / Math.max(pageSize, 1)), 1),
        },
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!apiBaseUrl) {
    return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  }

  const upstreamUrl = new URL("/api/ClientProfiles/SearchClientProfile", apiBaseUrl);

  try {
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    const currentUserScope = token ? await resolveCurrentUserFromApi(token).catch(() => null) : null;
    const resolvedLicenseeName = currentUserScope?.licensee?.name?.trim() || "";
    const resolvedPracticeName = currentUserScope?.practice?.name?.trim() || "";
    const isComplianceManager = normalizeText(currentUserScope?.userRole) === "compliance manager";

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
        licenseeName: resolvedLicenseeName || undefined,
        practiceName: !isComplianceManager && resolvedPracticeName ? resolvedPracticeName : undefined,
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
          practiceName?: string | null;
          clientAdviserPracticeName?: string | null;
          licensee?: string | null;
          licenseeName?: string | null;
          clientAdviserLicenseeName?: string | null;
        }>;
        totalPageCount?: number | null;
      } | null;
    };

    if ((resolvedLicenseeName || resolvedPracticeName) && Array.isArray(body.data?.items)) {
      body.data.items = body.data.items.filter((item) => {
        const matchesLicensee =
          !resolvedLicenseeName || normalizeText(getClientItemLicenseeName(item)) === normalizeText(resolvedLicenseeName);
        const matchesPractice =
          isComplianceManager ||
          !resolvedPracticeName ||
          normalizeText(getClientItemPracticeName(item)) === normalizeText(resolvedPracticeName);

        return matchesLicensee && matchesPractice;
      });
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
