import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL, readBearerToken, requireCurrentUser } from "../../../../_shared";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ profileId: string; personId: string }> },
) {
  if (!API_BASE_URL) return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  const token = await readBearerToken(request);
  if (!token) return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  const currentUserResult = await requireCurrentUser(token);
  if (currentUserResult.error) {
    return NextResponse.json({ message: currentUserResult.error.message }, { status: currentUserResult.error.status });
  }

  const payload = await request.json().catch(() => null);
  const { profileId, personId } = await params;

  try {
    const response = await fetch(
      new URL(`/api/ClientProfiles/${encodeURIComponent(profileId)}/Partner/${encodeURIComponent(personId)}/RiskProfile`, API_BASE_URL),
      {
        method: "PUT",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...(payload && typeof payload === "object" ? payload : {}),
          currentUser: currentUserResult.currentUser,
        }),
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
      { message: error instanceof Error ? `Partner risk profile proxy failed: ${error.message}` : "Partner risk profile proxy failed." },
      { status: 502 },
    );
  }
}
