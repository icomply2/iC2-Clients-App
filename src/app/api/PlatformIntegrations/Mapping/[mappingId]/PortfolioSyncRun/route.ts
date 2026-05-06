import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL, readBearerToken } from "../../../../client-profiles/_shared";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mappingId: string }> },
) {
  if (!API_BASE_URL) {
    return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  }

  const token = await readBearerToken(request);

  if (!token) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const { mappingId } = await params;

  if (!mappingId.trim()) {
    return NextResponse.json({ message: "Mapping id is required." }, { status: 400 });
  }

  try {
    const response = await fetch(
      new URL(
        `/api/PlatformIntegrations/Mapping/${encodeURIComponent(mappingId)}/PortfolioSyncRun`,
        API_BASE_URL,
      ),
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );

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
            ? `Portfolio sync run list proxy failed: ${error.message}`
            : "Portfolio sync run list proxy failed.",
      },
      { status: 502 },
    );
  }
}
