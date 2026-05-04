import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/api/client";
import { getClientProfile, getClientProfileId } from "@/lib/api/clients";
import { getUser, getUsers } from "@/lib/api/users";
import type { ClientProfile } from "@/lib/api/types";
import { readAuthTokenFromCookies } from "@/lib/auth";
import { getMockClientProfile } from "@/lib/client-mocks";
import { readUserProfileOverride } from "@/lib/user-profile-overrides-store";
import { mergeClientProfileAdviserOverride } from "@/lib/user-profile-overrides-shared";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const ENABLE_MOCK_AUTH = process.env.NEXT_PUBLIC_ENABLE_MOCK_AUTH === "true";

function normalizeText(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

async function loadUserByPossibleIds(possibleIds: string[], token: string) {
  for (const possibleId of possibleIds) {
    try {
      const result = await getUser(possibleId, token);
      if (result.data) {
        return result.data;
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function loadMatchingUserFromList(profile: ClientProfile, token: string) {
  const adviserEmail = normalizeText(profile.adviser?.email);
  const adviserName = normalizeText(profile.adviser?.name);

  if (!adviserEmail && !adviserName) {
    return null;
  }

  try {
    const result = await getUsers(token);
    const users = result.data ?? [];

    return (
      users.find((user) => normalizeText(user.email) === adviserEmail) ??
      users.find((user) => normalizeText(user.name) === adviserName) ??
      null
    );
  } catch {
    return null;
  }
}

async function enrichAdviser(profile: ClientProfile, token: string) {
  const possibleIds = [profile.adviser?.id, profile.adviser?.entity].filter((value): value is string => Boolean(value?.trim()));
  const adviserUser = (await loadUserByPossibleIds(possibleIds, token)) ?? (await loadMatchingUserFromList(profile, token));

  if (!adviserUser) {
    return profile;
  }

  const enrichedProfile = {
    ...profile,
    adviser: {
      ...profile.adviser,
      id: adviserUser.id ?? profile.adviser?.id ?? null,
      entity: adviserUser.entityId ?? profile.adviser?.entity ?? null,
      name: adviserUser.name ?? profile.adviser?.name ?? null,
      email: adviserUser.email ?? profile.adviser?.email ?? null,
      address: adviserUser.address ?? null,
      abn: adviserUser.abn ?? null,
      acn: adviserUser.acn ?? null,
      asicNumber: adviserUser.asicNumber ?? null,
      businessName: adviserUser.businessName ?? null,
      phoneNumber: adviserUser.phoneNumber ?? null,
      officeNumber: adviserUser.officeNumber ?? null,
      profilePhoto: adviserUser.profilePhoto ?? null,
      practiceLogo: adviserUser.practiceLogo ?? null,
      practice: adviserUser.practice ?? null,
      licensee: adviserUser.licensee ?? null,
    },
  };

  return mergeClientProfileAdviserOverride(enrichedProfile, await readUserProfileOverride(adviserUser.id));
}

async function loadProfile(clientId: string) {
  if (ENABLE_MOCK_AUTH || !API_BASE_URL) {
    return {
      profile: getMockClientProfile(clientId),
      source: "mock",
    };
  }

  const token = await readAuthTokenFromCookies();

  if (!token) {
    return {
      profile: getMockClientProfile(clientId),
      source: "mock",
    };
  }

  try {
    return {
      profile: await enrichAdviser((await getClientProfile(clientId, token)).data, token),
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
    profile: await enrichAdviser((await getClientProfile(profileIdResult.data, token)).data, token),
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
