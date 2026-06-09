import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/api/client";
import { getClientProfile, getClientProfileId } from "@/lib/api/clients";
import type { ClientPolicyRecord, ClientProfile } from "@/lib/api/types";
import { readAuthTokenFromCookies } from "@/lib/auth";
import { getMockClientProfile } from "@/lib/client-mocks";
import {
  buildInsuranceIntakeProfileContext,
  mapIntakeInsuranceAdviceToCanonical,
  peopleFromClientProfile,
} from "@/lib/insurance-workspace-intake";
import { getApiBaseUrl, isMockAuthEnabled } from "@/lib/server-runtime";
import type { IntakeAssessmentV1 } from "@/lib/soa-output-contracts";
import { generateSoaIntakeAssessment } from "@/lib/soa-intake-service";

type IntakePayload = {
  clientId?: string | null;
  adviserInstruction?: string | null;
  workspaceContext?: {
    clientName?: string | null;
    people?: unknown;
    insuranceAdvice?: unknown;
  } | null;
  uploadedFiles?: Array<{
    name?: string | null;
    kind?: string | null;
    extractedText?: string | null;
  }> | null;
  currentAssessment?: IntakeAssessmentV1 | null;
};

async function loadProfile(clientId: string): Promise<ClientProfile> {
  if (isMockAuthEnabled() || !getApiBaseUrl()) {
    return getMockClientProfile(clientId);
  }

  const token = await readAuthTokenFromCookies();
  if (!token) {
    throw new Error("You must sign in to generate insurance workspace intake.");
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
    throw new Error("The live API could not resolve the selected client profile.");
  }

  return (await getClientProfile(profileIdResult.data, token)).data;
}

async function loadNestedInsurancePolicies(clientId: string, token: string | null): Promise<ClientPolicyRecord[]> {
  const apiBaseUrl = getApiBaseUrl();
  if (!token || !apiBaseUrl) return [];

  try {
    const response = await fetch(new URL(`/api/Insurance/${encodeURIComponent(clientId)}/Policies`, apiBaseUrl), {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!response.ok) return [];

    const body = (await response.json().catch(() => null)) as { data?: ClientPolicyRecord[] | null } | ClientPolicyRecord[] | null;
    if (Array.isArray(body)) return body;
    return body && Array.isArray(body.data) ? body.data : [];
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as IntakePayload | null;
  const clientId = payload?.clientId?.trim();

  if (!clientId) {
    return NextResponse.json({ error: "Client id is required." }, { status: 400 });
  }

  try {
    let profile: ClientProfile | null = null;
    let profileWarning: string | null = null;
    let authToken: string | null = null;

    try {
      authToken = await readAuthTokenFromCookies();
      profile = await loadProfile(clientId);
    } catch (error) {
      profileWarning =
        error instanceof ApiError
          ? `Live client profile could not be loaded (${error.statusCode}). Finley used the current workspace context instead.`
          : "Live client profile could not be loaded. Finley used the current workspace context instead.";
    }

    const nestedInsurancePolicies = await loadNestedInsurancePolicies(clientId, authToken);

    const fallbackPeople = Array.isArray(payload?.workspaceContext?.people)
      ? payload.workspaceContext.people.filter(
          (person): person is ReturnType<typeof peopleFromClientProfile>[number] =>
            Boolean(person && typeof person === "object" && "personId" in person && "fullName" in person),
        )
      : [];
    const people = profile ? peopleFromClientProfile(profile) : fallbackPeople.length ? fallbackPeople : [
      {
        personId: "client",
        role: "client" as const,
        fullName: payload?.workspaceContext?.clientName?.trim() || "Selected client",
      },
    ];
    const clientName = profile ? people.map((person) => person.fullName).join(" & ") : payload?.workspaceContext?.clientName?.trim() || people.map((person) => person.fullName).join(" & ");
    const uploadedFiles =
      payload?.uploadedFiles
        ?.filter((file) => Boolean(file?.name?.trim() || file?.extractedText?.trim()))
        .map((file, index) => ({
          name: file.name?.trim() || `Insurance workspace evidence ${index + 1}`,
          kind: file.kind ?? "insurance_document",
          extractedText: file.extractedText ?? null,
        })) ?? [];

    const result = await generateSoaIntakeAssessment({
      clientName,
      adviserMessage: [
        "Generate the insurance advice module for the standalone insurance workspace.",
        "Populate candidateInsuranceAdvice in adviser workflow order: current cover review, insurability assessment, needs analysis, product research, recommendations, replacement analysis.",
        payload?.currentAssessment ? "Use the supplied SOA intake assessment as the latest structured brief and refine only the insurance workspace module." : "",
        "Use only evidence from the selected client profile and uploaded evidence. Use nulls or notes where information is missing.",
        payload?.adviserInstruction?.trim() ? `Adviser instruction: ${payload.adviserInstruction.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      uploadedFiles: [
        {
          name: "Selected client profile insurance context",
          kind: "client_profile",
          extractedText: profile
            ? JSON.stringify(
                {
                  ...JSON.parse(buildInsuranceIntakeProfileContext(profile)),
                  nestedInsurancePolicies,
                },
                null,
                2,
              ).slice(0, 60000)
            : JSON.stringify(
                {
                  clientName,
                  people,
                  currentWorkspaceInsuranceAdvice: payload?.workspaceContext?.insuranceAdvice ?? [],
                  profileWarning,
                },
                null,
                2,
              ),
        },
        ...uploadedFiles,
      ],
      currentAssessment: payload?.currentAssessment ?? null,
      recentMessages: null,
      activeFollowUpQuestion: null,
      answeredFollowUpResponses: null,
    });

    return NextResponse.json(
      {
        people,
        clientName,
        insuranceAdvice: mapIntakeInsuranceAdviceToCanonical(result.assessment, people),
        assessment: result.assessment,
        source: result.source,
        model: result.model,
        warning: [profileWarning, result.warning].filter(Boolean).join(" ") || null,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Unable to generate insurance workspace intake (${error.statusCode}): ${error.message}`
        : error instanceof Error
          ? error.message
          : "Unable to generate insurance workspace intake.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
