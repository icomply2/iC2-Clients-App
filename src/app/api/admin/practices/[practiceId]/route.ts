import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL, adminAuthError, adminConfigError, parseJsonBody, readAdminToken } from "../../_shared";

export async function PUT(request: NextRequest, context: { params: Promise<{ practiceId: string }> }) {
  if (!API_BASE_URL) {
    return adminConfigError();
  }

  const token = await readAdminToken();

  if (!token) {
    return adminAuthError();
  }

  const { practiceId } = await context.params;
  const payload = await parseJsonBody(request);

  if (!payload) {
    return NextResponse.json({ message: "Request body is required." }, { status: 400 });
  }

  const response = await fetch(new URL(`/api/Licensees/Practice/${encodeURIComponent(practiceId)}`, API_BASE_URL), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const text = await response.text();

  return new NextResponse(text, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "application/json",
    },
  });
}
