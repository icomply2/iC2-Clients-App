import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/api/client";
import { getClientProfile, getClientProfileId } from "@/lib/api/clients";
import { readAuthTokenFromCookies } from "@/lib/auth";
import { updateClientDetails, updatePartnerDetails } from "@/lib/services/client-updates";

function parseDateValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return trimmed;
  }

  const slashMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, "0");
    const month = slashMatch[2].padStart(2, "0");
    const year = slashMatch[3];
    return `${year}-${month}-${day}`;
  }

  return trimmed;
}

async function loadProfile(clientId: string) {
  const token = await readAuthTokenFromCookies();

  if (!token) {
    throw new Error("You need to sign in again before saving this fact find step.");
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
    throw new Error("Finley could not resolve the client profile needed to save this fact find step.");
  }

  return (await getClientProfile(profileIdResult.data, token)).data;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    clientId?: string | null;
    stepId?: string | null;
    record?: Record<string, unknown> | null;
  } | null;

  const clientId = body?.clientId?.trim();
  const stepId = body?.stepId?.trim();
  const record = body?.record && typeof body.record === "object" ? body.record : null;

  if (!clientId || !stepId || !record) {
    return NextResponse.json({ error: "Client id, step id, and record are required." }, { status: 400 });
  }

  if (stepId !== "household-details" && stepId !== "partner-details") {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  try {
    const profile = await loadProfile(clientId);
    const target = record.target === "partner" ? "partner" : "client";
    const personId = target === "partner" ? profile.partner?.id?.trim() || "" : profile.client?.id?.trim() || "";
    const profileId = profile.id?.trim() || "";

    if (!profileId || !personId) {
      throw new Error("Finley could not determine which person record to save for this fact find step.");
    }

    const changes = {
      ...(typeof record.name === "string" ? { name: record.name } : {}),
      ...(typeof record.email === "string" ? { email: record.email } : {}),
      ...(typeof record.preferredPhone === "string" ? { preferredPhone: record.preferredPhone } : {}),
      ...(typeof record.dateOfBirth === "string" ? { dateOfBirth: parseDateValue(record.dateOfBirth) } : {}),
      ...(typeof record.street === "string" ? { street: record.street } : {}),
      ...(typeof record.suburb === "string" ? { suburb: record.suburb } : {}),
      ...(typeof record.state === "string" ? { state: record.state } : {}),
      ...(typeof record.postCode === "string" ? { postCode: record.postCode } : {}),
      ...(typeof record.maritalStatus === "string" ? { maritalStatus: record.maritalStatus } : {}),
      ...(typeof record.residentStatus === "string" ? { residentStatus: record.residentStatus } : {}),
      ...(typeof record.gender === "string" ? { gender: record.gender } : {}),
      ...(typeof record.status === "string" ? { status: record.status } : {}),
      ...(typeof record.clientCategory === "string" ? { clientCategory: record.clientCategory } : {}),
      ...(typeof record.riskProfile === "string" ? { riskProfile: record.riskProfile } : {}),
      ...(typeof record.adviceAgreementRequired === "string" ? { adviceAgreementRequired: record.adviceAgreementRequired } : {}),
      ...(typeof record.agreementType === "string" ? { agreementType: record.agreementType } : {}),
      ...(typeof record.nextAnniversaryDate === "string"
        ? { nextAnniversaryDate: parseDateValue(record.nextAnniversaryDate) }
        : {}),
    };

    const context = {
      origin: request.nextUrl.origin,
      cookieHeader: request.headers.get("cookie"),
    };

    if (target === "partner") {
      await updatePartnerDetails(
        {
          profileId,
          personId,
          changes,
        },
        context,
      );
    } else {
      await updateClientDetails(
        {
          profileId,
          personId,
          changes,
        },
        context,
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Unable to save the fact find step (${error.statusCode}): ${error.message}`
        : error instanceof Error
          ? error.message
          : "Unable to save this fact find step right now.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
