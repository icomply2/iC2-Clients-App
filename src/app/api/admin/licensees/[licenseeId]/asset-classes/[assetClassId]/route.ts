import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL, adminAuthError, adminConfigError, readAdminToken } from "../../../../_shared";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ licenseeId: string; assetClassId: string }> },
) {
  if (!API_BASE_URL) {
    return adminConfigError();
  }

  const token = await readAdminToken();

  if (!token) {
    return adminAuthError();
  }

  const { licenseeId, assetClassId } = await context.params;
  const response = await fetch(
    new URL(
      `/api/Licensees/${encodeURIComponent(licenseeId)}/AssetClasses/${encodeURIComponent(assetClassId)}`,
      API_BASE_URL,
    ),
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

  return new NextResponse(text, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "application/json",
    },
  });
}
