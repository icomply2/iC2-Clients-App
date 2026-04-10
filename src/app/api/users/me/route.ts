import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { resolveCurrentUserFromApi } from "@/lib/current-user";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export async function GET(request: NextRequest) {
  if (!API_BASE_URL) {
    return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ message: "Not signed in." }, { status: 401 });
  }

  try {
    const matchedUser = await resolveCurrentUserFromApi(token);

    if (!matchedUser) {
      return NextResponse.json({ message: "Unable to resolve the signed-in user." }, { status: 404 });
    }

    return NextResponse.json({ data: matchedUser }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? `Current user proxy failed: ${error.message}` : "Current user proxy failed.";

    return NextResponse.json({ message }, { status: 502 });
  }
}
