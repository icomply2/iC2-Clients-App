import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/api/client";
import { getClientProfile, getClientProfileId } from "@/lib/api/clients";
import { readAuthTokenFromCookies } from "@/lib/auth";
import {
  buildEngagementLetterDocmosisModel,
  buildEngagementLetterOutputName,
  DOCMOSIS_ENGAGEMENT_TEMPLATE_NAME,
  renderDocmosisDocx,
  type EngagementLetterDocmosisInput,
} from "@/lib/services/docmosis";

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
        draft?: EngagementLetterDocmosisInput | null;
      }
    | null;

  const clientId = body?.clientId?.trim();

  if (!clientId) {
    return NextResponse.json({ error: "Client id is required." }, { status: 400 });
  }

  try {
    const profile = await loadProfile(clientId);
    const model = buildEngagementLetterDocmosisModel(profile, body?.draft ?? {});
    const outputName = buildEngagementLetterOutputName(profile);
    const buffer = await renderDocmosisDocx({
      templateName: DOCMOSIS_ENGAGEMENT_TEMPLATE_NAME,
      outputName,
      data: model,
    });

    return new NextResponse(buffer, {
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
