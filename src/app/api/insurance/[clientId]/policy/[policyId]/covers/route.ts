import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL, readBearerToken } from "@/app/api/client-profiles/_shared";

export async function POST(request: NextRequest, { params }: { params: Promise<{ clientId: string; policyId: string }> }) {
  if (!API_BASE_URL) {
    return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  }

  const token = await readBearerToken(request);
  if (!token) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const { clientId, policyId } = await params;

  try {
    const response = await fetch(
      new URL(`/api/Insurance/${encodeURIComponent(clientId)}/Policy/${encodeURIComponent(policyId)}/Covers`, API_BASE_URL),
      {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(Array.isArray(payload) ? payload : []),
        cache: "no-store",
      },
    );

    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? `Insurance cover save proxy failed: ${error.message}` : "Insurance cover save proxy failed." },
      { status: 502 },
    );
  }
}
