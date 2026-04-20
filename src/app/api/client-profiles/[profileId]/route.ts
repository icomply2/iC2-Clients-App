import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL, readBearerToken } from "../_shared";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ profileId: string }> },
) {
  if (!API_BASE_URL) {
    return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  }

  const token = await readBearerToken(request);

  if (!token) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const { profileId } = await params;

  if (!payload) {
    return NextResponse.json({ message: "Request body is required." }, { status: 400 });
  }

  try {
    const response = await fetch(new URL(`/api/ClientProfiles/${encodeURIComponent(profileId)}`, API_BASE_URL), {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
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
      error instanceof Error ? `Client profile update proxy failed: ${error.message}` : "Client profile update proxy failed.";

    return NextResponse.json({ message }, { status: 502 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ profileId: string }> },
) {
  if (!API_BASE_URL) {
    return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  }

  const token = await readBearerToken(request);

  if (!token) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const { profileId } = await params;

  try {
    const response = await fetch(new URL(`/api/ClientProfiles/${encodeURIComponent(profileId)}`, API_BASE_URL), {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
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
      error instanceof Error ? `Client profile delete proxy failed: ${error.message}` : "Client profile delete proxy failed.";

    return NextResponse.json({ message }, { status: 502 });
  }
}
