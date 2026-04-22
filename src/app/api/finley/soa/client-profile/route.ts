import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/api/client";
import { getClientProfile, getClientProfileId } from "@/lib/api/clients";
import { readAuthTokenFromCookies } from "@/lib/auth";
import { mockClientProfile } from "@/lib/client-mocks";

async function loadProfile(clientId: string) {
  const token = await readAuthTokenFromCookies();

  if (!token) {
    return {
      profile: mockClientProfile,
      source: "mock",
    };
  }

  try {
    return {
      profile: (await getClientProfile(clientId, token)).data,
      source: "live",
    };
  } catch (error) {
    if (!(error instanceof ApiError) || error.statusCode !== 404) {
      throw error;
    }
  }

  const profileIdResult = await getClientProfileId(clientId, token);
  if (!profileIdResult.data) {
    throw new Error("Finley could not resolve the client profile needed for the SOA preview.");
  }

  return {
    profile: (await getClientProfile(profileIdResult.data, token)).data,
    source: "live",
  };
}

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId")?.trim() ?? "";

  if (!clientId) {
    return NextResponse.json({ error: "Client id is required." }, { status: 400 });
  }

  try {
    const result = await loadProfile(clientId);

    return NextResponse.json(
      {
        profile: result.profile,
        source: result.source,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Unable to load the live client profile (${error.statusCode}): ${error.message}`
        : error instanceof Error
          ? error.message
          : "Unable to load the client profile for the SOA preview.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
