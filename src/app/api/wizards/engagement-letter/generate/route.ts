import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/api/client";
import { getClientProfile, getClientProfileId } from "@/lib/api/clients";
import { readAuthTokenFromCookies, readCurrentUserFromCookies } from "@/lib/auth";
import {
  buildEngagementLetterOutputName,
  renderEngagementLetterDocx,
  type EngagementLetterDocxInput,
} from "@/lib/engagement-letter-docx-export";
import { readUserProfileOverride } from "@/lib/user-profile-overrides-store";

async function loadProfile(clientId: string) {
  const token = await readAuthTokenFromCookies();

  if (!token) {
    throw new Error("You need to sign in again before generating the engagement letter.");
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
    throw new Error("Finley could not resolve the client profile needed for engagement letter generation.");
  }

  return (await getClientProfile(profileIdResult.data, token)).data;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | {
        clientId?: string | null;
        draft?: EngagementLetterDocxInput | null;
      }
    | null;

  const clientId = body?.clientId?.trim();

  if (!clientId) {
    return NextResponse.json({ error: "Client id is required." }, { status: 400 });
  }

  try {
    const profile = await loadProfile(clientId);
    const currentUser = await readCurrentUserFromCookies();
    const profileOverride = await readUserProfileOverride(currentUser?.id);
    const draft = {
      ...(body?.draft ?? {}),
      documentStyleProfile: profileOverride?.documentStyleProfile ?? null,
    };
    const outputName = buildEngagementLetterOutputName(profile);
    const buffer = await renderEngagementLetterDocx(profile, draft);

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${outputName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Unable to load the live engagement letter data (${error.statusCode}): ${error.message}`
        : error instanceof Error
          ? error.message
          : "Unable to generate the engagement letter right now.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
