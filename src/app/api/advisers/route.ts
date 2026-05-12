import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import type { AdviserSummary } from "@/lib/api/types";
import { mockClientSummaries } from "@/lib/client-mocks";
import { getApiBaseUrl, isMockAuthEnabled } from "@/lib/server-runtime";

export async function GET(request: NextRequest) {
  const apiBaseUrl = getApiBaseUrl();
  const practiceName = request.nextUrl.searchParams.get("practiceName");
  const licenseeName = request.nextUrl.searchParams.get("licenseeName");
  const id = request.nextUrl.searchParams.get("id");

  if (isMockAuthEnabled()) {
    const advisers = Array.from(
      new Map<string, AdviserSummary>(
        mockClientSummaries
          .filter((client) => {
            const matchesPractice =
              !practiceName ||
              (client.clientAdviserPracticeName ?? "").trim().toLowerCase() === practiceName.trim().toLowerCase();
            const matchesLicensee =
              !licenseeName ||
              (client.clientAdviserLicenseeName ?? "").trim().toLowerCase() === licenseeName.trim().toLowerCase();

            return matchesPractice && matchesLicensee;
          })
          .map((client, index) => [
            `${client.clientAdviserName ?? ""}|${client.clientAdviserPracticeName ?? ""}|${client.clientAdviserLicenseeName ?? ""}`,
            {
              id: `mock-adviser-${index + 1}`,
              name: client.clientAdviserName ?? null,
              practiceName: client.clientAdviserPracticeName ?? null,
              licenseeName: client.clientAdviserLicenseeName ?? null,
              licenseeId: null,
              email: null,
            },
          ]),
      ).values(),
    ).filter((adviser) => !id || adviser.id === id);

    return NextResponse.json({ data: advisers }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }

  if (!apiBaseUrl) {
    return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  }

  const upstreamUrl = new URL("/api/Advisers", apiBaseUrl);

  if (practiceName) {
    upstreamUrl.searchParams.set("practiceName", practiceName);
  }

  if (licenseeName) {
    upstreamUrl.searchParams.set("licenseeName", licenseeName);
  }

  if (id) {
    upstreamUrl.searchParams.set("id", id);
  }

  try {
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

    const response = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      cache: "no-store",
    });

    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "application/json";

    return new NextResponse(text, {
      status: response.status,
      headers: {
        "content-type": contentType,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? `Adviser proxy request failed: ${error.message}` : "Adviser proxy request failed.";

    return NextResponse.json({ message }, { status: 502 });
  }
}
