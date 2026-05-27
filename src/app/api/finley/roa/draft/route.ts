import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/api/client";
import { getClientProfile, getClientProfileId } from "@/lib/api/clients";
import type { ClientProfile } from "@/lib/api/types";
import { readAuthTokenFromCookies } from "@/lib/auth";
import { getMockClientProfile } from "@/lib/client-mocks";
import { generateRoaDraft } from "@/lib/roa-draft-service";
import { getApiBaseUrl, isMockAuthEnabled } from "@/lib/server-runtime";

async function loadProfile(clientId: string): Promise<ClientProfile> {
  if (isMockAuthEnabled() || !getApiBaseUrl()) {
    return getMockClientProfile(clientId);
  }

  const token = await readAuthTokenFromCookies();
  if (!token) {
    throw new Error("You must sign in to prepare a Record of Advice.");
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
    throw new Error("The live API could not resolve the client profile needed for the Record of Advice.");
  }

  return (await getClientProfile(profileIdResult.data, token)).data;
}

function clean(value?: string | null) {
  return value?.trim() || null;
}

function personAddressLines(person?: ClientProfile["client"] | null) {
  const street = clean(person?.street)
    || clean(person?.addressStreet)
    || clean(person?.address?.street)
    || clean(person?.address?.line1);
  const suburb = clean(person?.suburb)
    || clean(person?.addressSuburb)
    || clean(person?.address?.suburb)
    || clean(person?.address?.city);
  const state = clean(person?.state)
    || clean(person?.addressState)
    || clean(person?.address?.state)
    || clean(person?.address?.region);
  const postcode = clean(person?.postCode)
    || clean(person?.postcode)
    || clean(person?.addressPostCode)
    || clean(person?.address?.postCode)
    || clean(person?.address?.postcode)
    || clean(person?.address?.zipCode);
  const locality = [suburb, state, postcode].filter(Boolean).join(" ") || null;

  return [street, locality].filter((line): line is string => Boolean(line));
}

function buildLetterDetails(profile: ClientProfile, fallbackClientName?: string | null, fallbackAdviserName?: string | null) {
  const clientNames = [clean(profile.client?.name), clean(profile.partner?.name)].filter(Boolean);
  const addressee = clientNames.length > 1 ? clientNames.join(" and ") : clientNames[0] || clean(fallbackClientName) || "Client";
  const adviserName = clean(profile.adviser?.name) || clean(fallbackAdviserName) || "Adviser";
  const practiceName = clean(profile.adviser?.practice?.name) || clean(profile.practice) || clean(profile.adviser?.entity) || "";
  const licenseeName = clean(profile.adviser?.licensee?.name) || clean(profile.licensee) || "";

  return {
    addressee,
    addressLines: personAddressLines(profile.client),
    adviserName,
    adviserSignatureName: adviserName,
    adviserPracticeName: practiceName,
    adviserLicenseeName: licenseeName,
    adviserAbn: clean(profile.adviser?.abn) || "",
    adviserAfsl: "368175",
  };
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as
    | {
        clientId?: string | null;
        clientName?: string | null;
        adviserName?: string | null;
        uploadedFiles?: Array<{
          name?: string | null;
          tags?: string[] | null;
          extractedText?: string | null;
        }> | null;
      }
    | null;

  const clientId = payload?.clientId?.trim() ?? "";

  if (!clientId) {
    return NextResponse.json({ error: "Client id is required." }, { status: 400 });
  }

  try {
    const profile = await loadProfile(clientId);
    const result = await generateRoaDraft({
      clientName: payload?.clientName ?? [profile.client?.name, profile.partner?.name].filter(Boolean).join(" & "),
      adviserName: payload?.adviserName ?? profile.adviser?.name ?? null,
      profile,
      uploadedFiles: payload?.uploadedFiles ?? [],
    });

    return NextResponse.json(
      {
        ...result,
        letterDetails: buildLetterDetails(profile, payload?.clientName, payload?.adviserName),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Unable to load the live client profile (${error.statusCode}): ${error.message}`
        : error instanceof Error
          ? error.message
          : "Unable to prepare the Record of Advice draft.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
