import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ profileId: string; personId: string }> },
) {
  if (!API_BASE_URL) {
    return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const { profileId, personId } = await params;

  try {
    const response = await fetch(
      new URL(`/api/ClientProfiles/${profileId}/Client/${personId}`, API_BASE_URL),
      {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      },
    );

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
      error instanceof Error ? `Client update proxy failed: ${error.message}` : "Client update proxy failed.";

    return NextResponse.json({ message }, { status: 502 });
  }
}
