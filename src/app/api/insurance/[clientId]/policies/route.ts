import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL, readBearerToken } from "@/app/api/client-profiles/_shared";

export async function GET(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  if (!API_BASE_URL) {
    return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  }

  const token = await readBearerToken(request);
  if (!token) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const { clientId } = await params;

  try {
    const response = await fetch(new URL(`/api/Insurance/${encodeURIComponent(clientId)}/Policies`, API_BASE_URL), {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? `Insurance policies proxy failed: ${error.message}` : "Insurance policies proxy failed." },
      { status: 502 },
    );
  }
}
