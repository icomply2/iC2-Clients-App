import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ profileId: string; assetId: string }> },
) {
  if (!API_BASE_URL) {
    return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const { profileId, assetId } = await params;

  if (!profileId || !assetId) {
    return NextResponse.json({ message: "Missing profile id or asset id." }, { status: 400 });
  }

  try {
    const encodedProfileId = encodeURIComponent(profileId);
    const encodedAssetId = encodeURIComponent(assetId);
    const response = await fetch(
      new URL(`/api/ClientProfiles/${encodedProfileId}/Assets/${encodedAssetId}`, API_BASE_URL),
      {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
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
      error instanceof Error
        ? `Asset delete proxy failed: ${error.message} (profileId=${profileId}, assetId=${assetId})`
        : "Asset delete proxy failed.";

    return NextResponse.json({ message }, { status: 502 });
  }
}
