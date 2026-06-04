import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL, readBearerToken } from "../_shared";

export async function GET(request: NextRequest) {
  if (!API_BASE_URL) return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  const token = await readBearerToken(request);
  if (!token) return NextResponse.json({ message: "Not authenticated." }, { status: 401 });

  const upstreamUrl = new URL("/api/ClientProfiles/RiskProfileScores", API_BASE_URL);
  const rangeFrom = request.nextUrl.searchParams.get("rangeFrom");
  const rangeTo = request.nextUrl.searchParams.get("rangeTo");

  if (rangeFrom !== null) upstreamUrl.searchParams.set("rangeFrom", rangeFrom);
  if (rangeTo !== null) upstreamUrl.searchParams.set("rangeTo", rangeTo);

  try {
    const response = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    console.log(`Proxied request to ${upstreamUrl} with status ${response.status}`);

    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? `Risk profile score proxy failed: ${error.message}`
            : "Risk profile score proxy failed.",
      },
      { status: 502 },
    );
  }
}
