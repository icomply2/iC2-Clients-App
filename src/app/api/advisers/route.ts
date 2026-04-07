import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export async function GET(request: NextRequest) {
  if (!API_BASE_URL) {
    return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  }

  const upstreamUrl = new URL("/api/Advisers", API_BASE_URL);
  const practiceName = request.nextUrl.searchParams.get("practiceName");
  const licenseeName = request.nextUrl.searchParams.get("licenseeName");
  const id = request.nextUrl.searchParams.get("id");

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
