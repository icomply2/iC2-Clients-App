import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL, readBearerToken } from "../../../_shared";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ profileId: string; pensionId: string }> }) {
  if (!API_BASE_URL) return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  const token = await readBearerToken(request);
  if (!token) return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  const { profileId, pensionId } = await params;
  try {
    const response = await fetch(new URL(`/api/ClientProfiles/${encodeURIComponent(profileId)}/Pensions/${encodeURIComponent(pensionId)}`, API_BASE_URL), {
      method: "DELETE",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const text = await response.text();
    return new NextResponse(text, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "application/json" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? `Retirement income delete proxy failed: ${error.message}` : "Retirement income delete proxy failed." }, { status: 502 });
  }
}
