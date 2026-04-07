import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

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
      }),
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
      error instanceof Error ? `Proxy request failed: ${error.message}` : "Proxy request failed.";

    return NextResponse.json({ message }, { status: 502 });
  }
}
