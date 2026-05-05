import { NextRequest, NextResponse } from "next/server";
import { readBearerToken } from "../../../client-profiles/_shared";

const SYNCED_MAPPING_FUNCTION_URL = process.env.SYNCED_MAPPING_FUNCTION_URL;
const SYNCED_MAPPING_FUNCTION_CODE = process.env.SYNCED_MAPPING_FUNCTION_CODE;

export async function POST(request: NextRequest) {
  if (!SYNCED_MAPPING_FUNCTION_URL || !SYNCED_MAPPING_FUNCTION_CODE) {
    return NextResponse.json(
      { message: "The synced mapping function is not configured yet." },
      { status: 500 },
    );
  }

  const token = await readBearerToken(request);

  if (!token) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const mappingId =
    payload && typeof payload === "object" && typeof payload.id === "string" ? payload.id.trim() : "";

  if (!mappingId) {
    return NextResponse.json({ message: "Mapping id is required." }, { status: 400 });
  }

  try {
    const url = new URL(SYNCED_MAPPING_FUNCTION_URL);
    url.searchParams.set("code", SYNCED_MAPPING_FUNCTION_CODE);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: mappingId }),
      cache: "no-store",
    });

    const text = await response.text();

    return new NextResponse(text, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? `Synced mapping trigger failed: ${error.message}`
            : "Synced mapping trigger failed.",
      },
      { status: 502 },
    );
  }
}
