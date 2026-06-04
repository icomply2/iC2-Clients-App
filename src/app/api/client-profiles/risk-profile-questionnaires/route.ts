import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL, readBearerToken } from "../_shared";

export async function GET(request: NextRequest) {
  if (!API_BASE_URL) return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  const token = await readBearerToken(request);
  if (!token) return NextResponse.json({ message: "Not authenticated." }, { status: 401 });

  try {
    const response = await fetch(new URL("/api/ClientProfiles/RiskProfileQuestionnaires", API_BASE_URL), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

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
            ? `Risk profile questionnaire proxy failed: ${error.message}`
            : "Risk profile questionnaire proxy failed.",
      },
      { status: 502 },
    );
  }
}
