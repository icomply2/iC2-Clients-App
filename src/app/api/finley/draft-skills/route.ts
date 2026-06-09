import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/api/client";
import { getClientProfile, getClientProfileId } from "@/lib/api/clients";
import type { ClientProfile } from "@/lib/api/types";
import { readAuthTokenFromCookies } from "@/lib/auth";
import { getMockClientProfile } from "@/lib/client-mocks";
import {
  generateFinleyDraftSkill,
  type FinleyDraftSkillId,
  type FinleyDraftSkillRecentMessage,
  type FinleyDraftSkillUploadedFile,
} from "@/lib/finley-draft-skills";
import { getApiBaseUrl, isMockAuthEnabled } from "@/lib/server-runtime";

type DraftSkillRequestBody = {
  skillId?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  adviserName?: string | null;
  uploadedFiles?: FinleyDraftSkillUploadedFile[] | null;
  recentMessages?: FinleyDraftSkillRecentMessage[] | null;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DraftSkillRequestBody;
    const skillId = normalizeSkillId(body.skillId);

    if (!skillId) {
      return NextResponse.json({ error: "Unsupported Finley draft skill." }, { status: 400 });
    }

    const profile = body.clientId ? await loadProfile(body.clientId) : null;
    const result = await generateFinleyDraftSkill({
      skillId,
      clientName: body.clientName,
      adviserName: body.adviserName,
      profile,
      uploadedFiles: body.uploadedFiles,
      recentMessages: body.recentMessages,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run Finley draft skill.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function normalizeSkillId(skillId?: string | null): FinleyDraftSkillId | null {
  if (skillId === "initial_meeting_file_note" || skillId === "paraplanning_request") {
    return skillId;
  }

  return null;
}

async function loadProfile(clientId: string): Promise<ClientProfile | null> {
  if (isMockAuthEnabled() || !getApiBaseUrl()) {
    return getMockClientProfile(clientId);
  }

  const token = await readAuthTokenFromCookies();
  if (!token) {
    throw new Error("Authentication is required to load the selected client profile.");
  }

  try {
    return (await getClientProfile(clientId, token)).data;
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 404) {
      const profileIdResult = await getClientProfileId(clientId, token);
      if (!profileIdResult.data) {
        return null;
      }
      return (await getClientProfile(profileIdResult.data, token)).data;
    }
    throw error;
  }
}
