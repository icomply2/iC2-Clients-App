import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL, readBearerToken } from "@/app/api/client-profiles/_shared";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ clientId: string; policyId: string }> }) {
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
    const response = await fetch(new URL(`/api/Insurance/${encodeURIComponent(clientId)}/Policy/${encodeURIComponent(policyId)}`, API_BASE_URL), {
      method: "PUT",
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload && typeof payload === "object" ? payload : {}),
      cache: "no-store",
    });

    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? `Insurance policy update proxy failed: ${error.message}` : "Insurance policy update proxy failed." },
      { status: 502 },
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ clientId: string; policyId: string }> }) {
  if (!API_BASE_URL) {
    return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  }

  const token = await readBearerToken(request);
  if (!token) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const { clientId, policyId } = await params;

  try {
    const response = await fetch(new URL(`/api/Insurance/${encodeURIComponent(clientId)}/Policy/${encodeURIComponent(policyId)}`, API_BASE_URL), {
      method: "DELETE",
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
      { message: error instanceof Error ? `Insurance policy delete proxy failed: ${error.message}` : "Insurance policy delete proxy failed." },
      { status: 502 },
    );
  }
}
