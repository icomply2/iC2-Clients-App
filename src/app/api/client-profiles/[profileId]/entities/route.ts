import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, type CurrentUser, readCurrentUserFromCookies } from "@/lib/auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

async function resolveCurrentUser(token: string, currentUser: CurrentUser) {
  if (currentUser.id) {
    return currentUser;
  }

  try {
    const response = await fetch(new URL("/api/Users", API_BASE_URL), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const body = (await response.json().catch(() => null)) as
      | {
          data?: { id?: string | null; email?: string | null; name?: string | null }[] | null;
        }
      | null;

    if (!response.ok || !body?.data?.length) {
      return currentUser;
    }

    const email = currentUser.email?.trim().toLowerCase();
    const name = currentUser.name?.trim().toLowerCase();
    const matchedUser =
      body.data.find((user) => user.email?.trim().toLowerCase() === email) ??
      body.data.find((user) => user.name?.trim().toLowerCase() === name);

    if (!matchedUser?.id) {
      return currentUser;
    }

    return {
      id: matchedUser.id,
      name: currentUser.name ?? matchedUser.name ?? null,
      email: currentUser.email ?? matchedUser.email ?? null,
    };
  } catch {
    return currentUser;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ profileId: string }> },
) {
  if (!API_BASE_URL) {
    return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const { profileId } = await params;
  const currentUser = await readCurrentUserFromCookies();

  if (!currentUser) {
    return NextResponse.json({ message: "Unable to resolve the signed-in user for this request." }, { status: 401 });
  }

  const resolvedCurrentUser = await resolveCurrentUser(token, currentUser);

  if (!resolvedCurrentUser.id) {
    return NextResponse.json(
      { message: "Unable to resolve the signed-in user's id for this request." },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(
      new URL(`/api/ClientProfiles/${profileId}/Entities`, API_BASE_URL),
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...(payload && typeof payload === "object" ? payload : {}),
          currentUser: resolvedCurrentUser,
        }),
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
      error instanceof Error ? `Entity create proxy failed: ${error.message}` : "Entity create proxy failed.";

    return NextResponse.json({ message }, { status: 502 });
  }
}
