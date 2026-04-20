import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL, readBearerToken } from "./_shared";

type CreateClientProfileResult = {
  status?: boolean | null;
  message?: string | null;
  modelErrors?: { propertyName?: string | null; errorMessage?: string | null }[] | null;
  data?: {
    id?: string | null;
    client?: { id?: string | null; name?: string | null } | null;
    partner?: { id?: string | null; name?: string | null } | null;
    adviser?: {
      id?: string | null;
      entity?: string | null;
      name?: string | null;
      email?: string | null;
    } | null;
    practice?: string | null;
    licensee?: string | null;
  } | null;
};

export async function POST(request: NextRequest) {
  if (!API_BASE_URL) {
    return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  }

  const token = await readBearerToken(request);

  if (!token) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);

  if (!payload) {
    return NextResponse.json({ message: "Request body is required." }, { status: 400 });
  }

  try {
    const response = await fetch(new URL("/api/ClientProfiles", API_BASE_URL), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const text = await response.text();
    const body = (text ? JSON.parse(text) : null) as CreateClientProfileResult | null;

    if (!response.ok) {
      return NextResponse.json(body ?? { message: text.trim() || "Unable to create the client profile." }, {
        status: response.status,
      });
    }

    return NextResponse.json(body, { status: response.status });
  } catch (error) {
    const message =
      error instanceof Error ? `Create client profile proxy failed: ${error.message}` : "Create client profile proxy failed.";

    return NextResponse.json({ message }, { status: 502 });
  }
}
