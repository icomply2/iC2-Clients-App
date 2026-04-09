import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/api/client";
import { getClientProfile, getClientProfileId } from "@/lib/api/clients";
import { readAuthTokenFromCookies } from "@/lib/auth";

async function loadProfile(clientId: string) {
  const token = await readAuthTokenFromCookies();

  if (!token) {
    throw new Error("You need to sign in again before preparing an invoice.");
  }

  try {
    return (await getClientProfile(clientId, token)).data;
  } catch (error) {
    if (!(error instanceof ApiError) || error.statusCode !== 404) {
      throw error;
    }
  }

  const profileIdResult = await getClientProfileId(clientId, token);
  if (!profileIdResult.data) {
    throw new Error("Finley could not resolve the client profile needed for the invoice.");
  }

  return (await getClientProfile(profileIdResult.data, token)).data;
}

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId")?.trim() ?? "";

  if (!clientId) {
    return NextResponse.json({ error: "Client id is required." }, { status: 400 });
  }

  try {
    const profile = await loadProfile(clientId);
    const recipientOptions = [
      profile.client?.name
        ? {
            value: profile.client.name,
            label: profile.client.name,
            email: profile.client?.email ?? "",
          }
        : null,
      profile.partner?.name
        ? {
            value: profile.partner.name,
            label: profile.partner.name,
            email: profile.partner?.email ?? "",
          }
        : null,
      ...(profile.entities ?? [])
        .filter((entity) => entity?.name)
        .map((entity) => ({
          value: entity?.name ?? "",
          label: entity?.name ?? "",
          email: "",
        })),
    ].filter((option): option is { value: string; label: string; email: string } => Boolean(option?.value));

    return NextResponse.json(
      {
        clientName: profile.client?.name ?? "",
        clientEmail: profile.client?.email ?? "",
        adviserName: profile.adviser?.name ?? "",
        clientEntityId: profile.id ?? profile.client?.ic2AppId ?? profile.client?.id ?? clientId,
        clientNameOptions: recipientOptions,
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Unable to load the live invoice defaults (${error.statusCode}): ${error.message}`
        : error instanceof Error
          ? error.message
          : "Unable to load the invoice defaults right now.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
