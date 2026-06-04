import type { ClientProfile } from "@/lib/api/types";
import {
  FINLEY_FILE_NOTE_SUBTYPE_OPTIONS,
  FINLEY_FILE_NOTE_TYPE_OPTIONS,
} from "@/lib/finley-shared";

export type FinleyDraftSkillId = "initial_meeting_file_note" | "paraplanning_request";

export type FinleyDraftSkillPromoteAction = "save_draft" | "file_note" | "word_output" | "copy";

export type FinleyDraftSkillDefinition = {
  id: FinleyDraftSkillId;
  displayName: string;
  pillLabel: string;
  description: string;
  status: "Active";
  allowedContextSources: string[];
  outputType: string;
  outputJsonSchema: Record<string, unknown>;
  draftingInstructions: string[];
  allowedPromoteActions: FinleyDraftSkillPromoteAction[];
};

export type FinleyDraftSkillUploadedFile = {
  name?: string | null;
  tags?: string[] | null;
  extractedText?: string | null;
};

export type FinleyDraftSkillRecentMessage = {
  role?: "assistant" | "user" | string | null;
  content?: string | null;
};

export type InitialMeetingFileNoteDraft = {
  subject: string;
  suggestedServiceDate: string | null;
  fileNoteType: string;
  fileNoteSubType: string;
  attendees: string[];
  meetingPurpose: string[];
  keyFacts: string[];
  clientObjectives: string[];
  scopeAndExclusions: string[];
  agreedNextSteps: string[];
  documentsRequested: string[];
  complianceNotes: string[];
  followUpQuestions: string[];
};

export type ParaplanningRequestDraft = {
  subject: string;
  requestPurpose: string;
  clientSummary: string[];
  adviceScope: string[];
  keyFacts: string[];
  clientObjectives: string[];
  recommendedAnalysis: string[];
  researchRequired: string[];
  modellingRequired: string[];
  documentsAndEvidence: string[];
  missingInformation: string[];
  complianceConsiderations: string[];
  instructionsForParaplanner: string[];
};

export type FinleyDraftSkillFileNoteSeed = {
  subject: string;
  serviceDate: string | null;
  type: string;
  subType: string;
  content: string;
};

export type GenerateFinleyDraftSkillInput = {
  skillId: FinleyDraftSkillId;
  clientName?: string | null;
  adviserName?: string | null;
  profile?: ClientProfile | null;
  uploadedFiles?: FinleyDraftSkillUploadedFile[] | null;
  recentMessages?: FinleyDraftSkillRecentMessage[] | null;
};

export type GenerateFinleyDraftSkillResult = {
  skillId: FinleyDraftSkillId;
  draft: InitialMeetingFileNoteDraft | ParaplanningRequestDraft;
  assistantMessage: string;
  fileNoteSeed?: FinleyDraftSkillFileNoteSeed | null;
  warning?: string | null;
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim() ?? "";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
const OPENAI_DRAFT_SKILL_MODEL =
  process.env.OPENAI_DRAFT_SKILL_MODEL?.trim() ||
  process.env.OPENAI_FINLEY_CHAT_MODEL?.trim() ||
  process.env.OPENAI_SOA_INTAKE_MODEL?.trim() ||
  "gpt-5.2";

const INITIAL_MEETING_FILE_NOTE_SCHEMA = {
  name: "initial_meeting_file_note",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "subject",
      "suggestedServiceDate",
      "fileNoteType",
      "fileNoteSubType",
      "attendees",
      "meetingPurpose",
      "keyFacts",
      "clientObjectives",
      "scopeAndExclusions",
      "agreedNextSteps",
      "documentsRequested",
      "complianceNotes",
      "followUpQuestions",
    ],
    properties: {
      subject: { type: "string" },
      suggestedServiceDate: { type: ["string", "null"] },
      fileNoteType: { type: "string" },
      fileNoteSubType: { type: "string" },
      attendees: { type: "array", items: { type: "string" } },
      meetingPurpose: { type: "array", items: { type: "string" } },
      keyFacts: { type: "array", items: { type: "string" } },
      clientObjectives: { type: "array", items: { type: "string" } },
      scopeAndExclusions: { type: "array", items: { type: "string" } },
      agreedNextSteps: { type: "array", items: { type: "string" } },
      documentsRequested: { type: "array", items: { type: "string" } },
      complianceNotes: { type: "array", items: { type: "string" } },
      followUpQuestions: { type: "array", items: { type: "string" } },
    },
  },
};

const PARAPLANNING_REQUEST_SCHEMA = {
  name: "paraplanning_request",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "subject",
      "requestPurpose",
      "clientSummary",
      "adviceScope",
      "keyFacts",
      "clientObjectives",
      "recommendedAnalysis",
      "researchRequired",
      "modellingRequired",
      "documentsAndEvidence",
      "missingInformation",
      "complianceConsiderations",
      "instructionsForParaplanner",
    ],
    properties: {
      subject: { type: "string" },
      requestPurpose: { type: "string" },
      clientSummary: { type: "array", items: { type: "string" } },
      adviceScope: { type: "array", items: { type: "string" } },
      keyFacts: { type: "array", items: { type: "string" } },
      clientObjectives: { type: "array", items: { type: "string" } },
      recommendedAnalysis: { type: "array", items: { type: "string" } },
      researchRequired: { type: "array", items: { type: "string" } },
      modellingRequired: { type: "array", items: { type: "string" } },
      documentsAndEvidence: { type: "array", items: { type: "string" } },
      missingInformation: { type: "array", items: { type: "string" } },
      complianceConsiderations: { type: "array", items: { type: "string" } },
      instructionsForParaplanner: { type: "array", items: { type: "string" } },
    },
  },
};

export const FINLEY_DRAFT_SKILLS: FinleyDraftSkillDefinition[] = [
  {
    id: "initial_meeting_file_note",
    displayName: "Initial Meeting File Note",
    pillLabel: "Initial Meeting File Note",
    description:
      "Drafts a structured compliance file note from meeting transcript evidence. Draft only until promoted into the file-note workflow and saved by the adviser.",
    status: "Active",
    allowedContextSources: ["Meeting transcript", "Uploaded documents", "Read-only client profile", "Recent chat"],
    outputType: "Structured file note draft",
    outputJsonSchema: INITIAL_MEETING_FILE_NOTE_SCHEMA,
    draftingInstructions: [
      "Use meeting transcript evidence first.",
      "Write as a professional adviser file note, not a client-facing letter.",
      "Separate facts, objectives, scope, next steps, requested documents, compliance notes, and follow-up questions.",
      "Do not claim the draft has been saved to the client record.",
    ],
    allowedPromoteActions: ["save_draft", "file_note", "word_output", "copy"],
  },
  {
    id: "paraplanning_request",
    displayName: "Paraplanning Request",
    pillLabel: "Paraplanning Request",
    description:
      "Drafts a structured internal request for paraplanning from uploaded evidence, client profile context, and adviser instructions. Draft only until copied or exported.",
    status: "Active",
    allowedContextSources: ["Uploaded documents", "Meeting transcript", "Read-only client profile", "Recent chat"],
    outputType: "Structured paraplanning request draft",
    outputJsonSchema: PARAPLANNING_REQUEST_SCHEMA,
    draftingInstructions: [
      "Write for a paraplanner, not the client.",
      "Separate scope, facts, objectives, research, modelling, missing information, and compliance considerations.",
      "Use uploaded evidence first, then read-only profile context.",
      "Do not claim any client record, file note, or document has been saved.",
    ],
    allowedPromoteActions: ["save_draft", "word_output", "copy"],
  },
];

export function getFinleyDraftSkillCatalogue() {
  return FINLEY_DRAFT_SKILLS;
}

export async function generateFinleyDraftSkill(
  input: GenerateFinleyDraftSkillInput,
): Promise<GenerateFinleyDraftSkillResult> {
  if (input.skillId === "initial_meeting_file_note") {
    return generateInitialMeetingFileNoteSkill(input);
  }

  if (input.skillId === "paraplanning_request") {
    return generateParaplanningRequestSkill(input);
  }

  throw new Error(`Unsupported Finley draft skill: ${input.skillId}`);
}

async function generateInitialMeetingFileNoteSkill(
  input: GenerateFinleyDraftSkillInput,
): Promise<GenerateFinleyDraftSkillResult> {
  const fallbackDraft = buildFallbackInitialMeetingDraft(input);
  const hasTranscript = hasMeetingTranscriptEvidence(input.uploadedFiles);

  if (!OPENAI_API_KEY) {
    return buildInitialMeetingResult(fallbackDraft, "The draft skill model is not configured, so Finley prepared a safe structured shell.");
  }

  if (!hasTranscript && !hasUsefulEvidence(input.uploadedFiles)) {
    return buildInitialMeetingResult(
      fallbackDraft,
      "I could not find useful transcript evidence in this Finley session, so this is a structured shell for the adviser to complete.",
    );
  }

  try {
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(isAzureOpenAiBaseUrl(OPENAI_BASE_URL)
          ? { "api-key": OPENAI_API_KEY }
          : { authorization: `Bearer ${OPENAI_API_KEY}` }),
      },
      body: JSON.stringify({
        model: OPENAI_DRAFT_SKILL_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are Finley, an Australian financial advice assistant. Draft structured, compliance-friendly adviser file note content from evidence. Return only JSON matching the schema. Do not save records or imply any client profile write has occurred.",
          },
          {
            role: "user",
            content: JSON.stringify({
              task: "Draft an initial meeting file note.",
              clientName: input.clientName ?? getClientName(input.profile) ?? "the selected client",
              adviserName: input.adviserName ?? getAdviserName(input.profile) ?? null,
              profileSummary: buildProfileSummary(input.profile),
              uploadedEvidence: (input.uploadedFiles ?? []).map((file) => ({
                name: file.name ?? "Uploaded file",
                tags: file.tags ?? [],
                extractedText: clip(file.extractedText ?? "", 12000),
              })),
              recentMessages: (input.recentMessages ?? []).slice(-8),
            }),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: INITIAL_MEETING_FILE_NOTE_SCHEMA,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`draft skill model returned status ${response.status}${text ? `: ${text.slice(0, 240)}` : ""}`);
    }

    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
    const content = payload.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content) as Partial<InitialMeetingFileNoteDraft>;
    const draft = normalizeInitialMeetingDraft(parsed, fallbackDraft);
    return buildInitialMeetingResult(draft, null);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown draft skill error";
    return buildInitialMeetingResult(fallbackDraft, `Finley could not run the draft skill model (${message}). I prepared a safe structured shell instead.`);
  }
}

async function generateParaplanningRequestSkill(
  input: GenerateFinleyDraftSkillInput,
): Promise<GenerateFinleyDraftSkillResult> {
  const fallbackDraft = buildFallbackParaplanningRequestDraft(input);

  if (!OPENAI_API_KEY) {
    return buildParaplanningRequestResult(
      fallbackDraft,
      "The draft skill model is not configured, so Finley prepared a safe structured shell.",
    );
  }

  if (!hasUsefulEvidence(input.uploadedFiles) && !(input.recentMessages ?? []).some((message) => clean(message.content))) {
    return buildParaplanningRequestResult(
      fallbackDraft,
      "I could not find uploaded evidence or recent adviser instructions, so this is a structured shell for the adviser to complete.",
    );
  }

  try {
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(isAzureOpenAiBaseUrl(OPENAI_BASE_URL)
          ? { "api-key": OPENAI_API_KEY }
          : { authorization: `Bearer ${OPENAI_API_KEY}` }),
      },
      body: JSON.stringify({
        model: OPENAI_DRAFT_SKILL_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are Finley, an Australian financial advice assistant. Draft a structured internal paraplanning request from evidence, client profile context, and adviser instructions. Return only JSON matching the schema. Do not save records or imply any client profile write has occurred.",
          },
          {
            role: "user",
            content: JSON.stringify({
              task: "Draft a paraplanning request.",
              clientName: input.clientName ?? getClientName(input.profile) ?? "the selected client",
              adviserName: input.adviserName ?? getAdviserName(input.profile) ?? null,
              profileSummary: buildProfileSummary(input.profile),
              uploadedEvidence: (input.uploadedFiles ?? []).map((file) => ({
                name: file.name ?? "Uploaded file",
                tags: file.tags ?? [],
                extractedText: clip(file.extractedText ?? "", 12000),
              })),
              recentMessages: (input.recentMessages ?? []).slice(-8),
            }),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: PARAPLANNING_REQUEST_SCHEMA,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`draft skill model returned status ${response.status}${text ? `: ${text.slice(0, 240)}` : ""}`);
    }

    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
    const content = payload.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content) as Partial<ParaplanningRequestDraft>;
    const draft = normalizeParaplanningRequestDraft(parsed, fallbackDraft);
    return buildParaplanningRequestResult(draft, null);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown draft skill error";
    return buildParaplanningRequestResult(
      fallbackDraft,
      `Finley could not run the draft skill model (${message}). I prepared a safe structured shell instead.`,
    );
  }
}

function buildInitialMeetingResult(draft: InitialMeetingFileNoteDraft, warning?: string | null): GenerateFinleyDraftSkillResult {
  return {
    skillId: "initial_meeting_file_note",
    draft,
    assistantMessage: renderInitialMeetingFileNoteDraft(draft, warning),
    fileNoteSeed: buildFileNoteSeedFromDraft(draft),
    warning,
  };
}

function buildParaplanningRequestResult(
  draft: ParaplanningRequestDraft,
  warning?: string | null,
): GenerateFinleyDraftSkillResult {
  return {
    skillId: "paraplanning_request",
    draft,
    assistantMessage: renderParaplanningRequestDraft(draft, warning),
    fileNoteSeed: null,
    warning,
  };
}

function buildFallbackInitialMeetingDraft(input: GenerateFinleyDraftSkillInput): InitialMeetingFileNoteDraft {
  const clientName = input.clientName ?? getClientName(input.profile) ?? "the selected client";
  const adviserName = input.adviserName ?? getAdviserName(input.profile);
  const defaultType = getDefaultFileNoteType();
  const defaultSubType = getDefaultFileNoteSubType(defaultType);
  const fileNames = (input.uploadedFiles ?? []).map((file) => file.name).filter(Boolean) as string[];

  return {
    subject: `Initial meeting file note - ${clientName}`,
    suggestedServiceDate: null,
    fileNoteType: defaultType,
    fileNoteSubType: defaultSubType,
    attendees: [clientName, adviserName].filter(Boolean) as string[],
    meetingPurpose: ["Record the purpose of the initial advice meeting and the client outcomes discussed."],
    keyFacts: fileNames.length
      ? [`Evidence reviewed: ${fileNames.join(", ")}.`]
      : ["No meeting transcript evidence has been extracted yet."],
    clientObjectives: ["Confirm the client's objectives, priorities, and timeframes from the meeting evidence."],
    scopeAndExclusions: ["Confirm the agreed advice scope and any exclusions before saving this file note."],
    agreedNextSteps: ["Confirm documents required, adviser actions, client actions, and expected timeframes."],
    documentsRequested: ["List any statements, policy schedules, identification, authorities, or supporting records requested."],
    complianceNotes: [
      "Draft only. This file note has not been saved to the client record.",
      "Check accuracy against the transcript and client profile before saving.",
    ],
    followUpQuestions: ["What information still needs to be confirmed before advice can proceed?"],
  };
}

function normalizeInitialMeetingDraft(
  raw: Partial<InitialMeetingFileNoteDraft>,
  fallback: InitialMeetingFileNoteDraft,
): InitialMeetingFileNoteDraft {
  return {
    subject: clean(raw.subject) ?? fallback.subject,
    suggestedServiceDate: clean(raw.suggestedServiceDate) ?? fallback.suggestedServiceDate,
    fileNoteType: clean(raw.fileNoteType) ?? fallback.fileNoteType,
    fileNoteSubType: clean(raw.fileNoteSubType) ?? fallback.fileNoteSubType,
    attendees: asStringArray(raw.attendees, fallback.attendees),
    meetingPurpose: asStringArray(raw.meetingPurpose, fallback.meetingPurpose),
    keyFacts: asStringArray(raw.keyFacts, fallback.keyFacts),
    clientObjectives: asStringArray(raw.clientObjectives, fallback.clientObjectives),
    scopeAndExclusions: asStringArray(raw.scopeAndExclusions, fallback.scopeAndExclusions),
    agreedNextSteps: asStringArray(raw.agreedNextSteps, fallback.agreedNextSteps),
    documentsRequested: asStringArray(raw.documentsRequested, fallback.documentsRequested),
    complianceNotes: asStringArray(raw.complianceNotes, fallback.complianceNotes),
    followUpQuestions: asStringArray(raw.followUpQuestions, fallback.followUpQuestions),
  };
}

function renderInitialMeetingFileNoteDraft(draft: InitialMeetingFileNoteDraft, warning?: string | null) {
  const sections: Array<[string, string[]]> = [
    ["Attendees", draft.attendees],
    ["Meeting Purpose", draft.meetingPurpose],
    ["Key Facts", draft.keyFacts],
    ["Client Objectives", draft.clientObjectives],
    ["Scope And Exclusions", draft.scopeAndExclusions],
    ["Agreed Next Steps", draft.agreedNextSteps],
    ["Documents Requested", draft.documentsRequested],
    ["Compliance Notes", draft.complianceNotes],
    ["Follow-Up Questions", draft.followUpQuestions],
  ];

  const lines = [
    `## ${draft.subject}`,
    "",
    `**Suggested service date:** ${draft.suggestedServiceDate || "To be confirmed"}`,
    `**File note type:** ${draft.fileNoteType}`,
    `**Subtype:** ${draft.fileNoteSubType}`,
  ];

  if (warning) {
    lines.push("", `**Note:** ${warning}`);
  }

  sections.forEach(([title, items]) => {
    lines.push("", `### ${title}`);
    if (items.length === 0) {
      lines.push("- To be confirmed.");
      return;
    }
    items.forEach((item) => lines.push(`- ${item}`));
  });

  return lines.join("\n");
}

function buildFileNoteSeedFromDraft(draft: InitialMeetingFileNoteDraft): FinleyDraftSkillFileNoteSeed {
  const body = renderInitialMeetingFileNoteBody(draft);
  return {
    subject: draft.subject,
    serviceDate: draft.suggestedServiceDate,
    type: draft.fileNoteType,
    subType: draft.fileNoteSubType,
    content: body,
  };
}

function renderInitialMeetingFileNoteBody(draft: InitialMeetingFileNoteDraft) {
  const section = (title: string, items: string[]) =>
    [`${title}:`, ...(items.length ? items.map((item) => `- ${item}`) : ["- To be confirmed."])].join("\n");

  return [
    section("Attendees", draft.attendees),
    "",
    section("Meeting purpose", draft.meetingPurpose),
    "",
    section("Key facts", draft.keyFacts),
    "",
    section("Client objectives", draft.clientObjectives),
    "",
    section("Scope and exclusions", draft.scopeAndExclusions),
    "",
    section("Agreed next steps", draft.agreedNextSteps),
    "",
    section("Documents requested", draft.documentsRequested),
    "",
    section("Compliance notes", draft.complianceNotes),
    "",
    section("Follow-up questions", draft.followUpQuestions),
  ].join("\n");
}

function buildFallbackParaplanningRequestDraft(input: GenerateFinleyDraftSkillInput): ParaplanningRequestDraft {
  const clientName = input.clientName ?? getClientName(input.profile) ?? "the selected client";
  const adviserName = input.adviserName ?? getAdviserName(input.profile);
  const fileNames = (input.uploadedFiles ?? []).map((file) => file.name).filter(Boolean) as string[];

  return {
    subject: `Paraplanning request - ${clientName}`,
    requestPurpose: `Prepare advice support for ${clientName} based on the uploaded evidence and adviser instructions.`,
    clientSummary: [
      `Client: ${clientName}.`,
      adviserName ? `Adviser: ${adviserName}.` : "Adviser: To be confirmed.",
    ],
    adviceScope: ["Confirm the advice scope from the meeting notes, fact find, or adviser instructions."],
    keyFacts: fileNames.length
      ? [`Evidence reviewed: ${fileNames.join(", ")}.`]
      : ["No uploaded evidence has been extracted yet."],
    clientObjectives: ["Summarise the client's objectives, priorities, constraints, and timeframes."],
    recommendedAnalysis: ["Identify the analysis required before advice can be drafted."],
    researchRequired: ["List product, strategy, insurance, investment, or technical research required."],
    modellingRequired: ["List any cashflow, projection, contribution, tax, Centrelink, or debt modelling required."],
    documentsAndEvidence: fileNames.length
      ? fileNames.map((name) => `Review uploaded document: ${name}.`)
      : ["Request or upload the documents needed to complete this paraplanning request."],
    missingInformation: ["Confirm missing information before preparing final advice."],
    complianceConsiderations: [
      "Clearly state advice scope, exclusions, assumptions, and outstanding confirmations.",
    ],
    instructionsForParaplanner: [
      "Prepare workpapers and advice drafting support based on the confirmed scope.",
      "Flag assumptions, missing information, and any advice risks for adviser review.",
    ],
  };
}

function normalizeParaplanningRequestDraft(
  raw: Partial<ParaplanningRequestDraft>,
  fallback: ParaplanningRequestDraft,
): ParaplanningRequestDraft {
  return {
    subject: clean(raw.subject) ?? fallback.subject,
    requestPurpose: clean(raw.requestPurpose) ?? fallback.requestPurpose,
    clientSummary: asStringArray(raw.clientSummary, fallback.clientSummary),
    adviceScope: asStringArray(raw.adviceScope, fallback.adviceScope),
    keyFacts: asStringArray(raw.keyFacts, fallback.keyFacts),
    clientObjectives: asStringArray(raw.clientObjectives, fallback.clientObjectives),
    recommendedAnalysis: asStringArray(raw.recommendedAnalysis, fallback.recommendedAnalysis),
    researchRequired: asStringArray(raw.researchRequired, fallback.researchRequired),
    modellingRequired: asStringArray(raw.modellingRequired, fallback.modellingRequired),
    documentsAndEvidence: asStringArray(raw.documentsAndEvidence, fallback.documentsAndEvidence),
    missingInformation: asStringArray(raw.missingInformation, fallback.missingInformation),
    complianceConsiderations: asStringArray(raw.complianceConsiderations, fallback.complianceConsiderations),
    instructionsForParaplanner: asStringArray(raw.instructionsForParaplanner, fallback.instructionsForParaplanner),
  };
}

function renderParaplanningRequestDraft(draft: ParaplanningRequestDraft, warning?: string | null) {
  const sections: Array<[string, string[]]> = [
    ["Client Summary", draft.clientSummary],
    ["Advice Scope", draft.adviceScope],
    ["Key Facts", draft.keyFacts],
    ["Client Objectives", draft.clientObjectives],
    ["Recommended Analysis", draft.recommendedAnalysis],
    ["Research Required", draft.researchRequired],
    ["Modelling Required", draft.modellingRequired],
    ["Documents And Evidence", draft.documentsAndEvidence],
    ["Missing Information", draft.missingInformation],
    ["Compliance Considerations", draft.complianceConsiderations],
    ["Instructions For Paraplanner", draft.instructionsForParaplanner],
  ];

  const lines = [
    `## ${draft.subject}`,
    "",
    "### Request Purpose",
    draft.requestPurpose,
  ];

  if (warning) {
    lines.push("", `**Note:** ${warning}`);
  }

  sections.forEach(([title, items]) => {
    lines.push("", `### ${title}`);
    if (items.length === 0) {
      lines.push("- To be confirmed.");
      return;
    }
    items.forEach((item) => lines.push(`- ${item}`));
  });

  return lines.join("\n");
}

function hasMeetingTranscriptEvidence(uploadedFiles?: FinleyDraftSkillUploadedFile[] | null) {
  return (uploadedFiles ?? []).some((file) =>
    (file.tags ?? []).some((tag) => tag.toLowerCase().includes("meeting") || tag.toLowerCase().includes("transcript")),
  );
}

function hasUsefulEvidence(uploadedFiles?: FinleyDraftSkillUploadedFile[] | null) {
  return (uploadedFiles ?? []).some((file) => Boolean(file.extractedText?.trim()));
}

function buildProfileSummary(profile?: ClientProfile | null) {
  if (!profile) return null;
  const record = profile as unknown as Record<string, unknown>;
  return {
    client: safeRecord(record.client),
    partner: safeRecord(record.partner),
    counts: {
      assets: Array.isArray(record.assets) ? record.assets.length : 0,
      liabilities: Array.isArray(record.liabilities) ? record.liabilities.length : 0,
      income: Array.isArray(record.income) ? record.income.length : 0,
      expenses: Array.isArray(record.expenses) ? record.expenses.length : 0,
      insurance: Array.isArray(record.insurance) ? record.insurance.length : 0,
    },
  };
}

function safeRecord(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return {
    name: clean(record.name) ?? clean(record.fullName),
    dateOfBirth: clean(record.dateOfBirth) ?? clean(record.dob),
    residency: clean(record.residency) ?? clean(record.residencyStatus),
    riskProfile: clean(record.riskProfile) ?? clean(record.riskProfileName),
  };
}

function getClientName(profile?: ClientProfile | null) {
  const record = profile as unknown as Record<string, unknown> | null | undefined;
  const client = safeObject(record?.client);
  return clean(client?.name) ?? clean(client?.fullName) ?? clean(record?.name);
}

function getAdviserName(profile?: ClientProfile | null) {
  const record = profile as unknown as Record<string, unknown> | null | undefined;
  return clean(record?.adviserName) ?? clean(safeObject(record?.adviser)?.name) ?? clean(safeObject(record?.clientAdviser)?.name);
}

function getDefaultFileNoteType() {
  return (
    FINLEY_FILE_NOTE_TYPE_OPTIONS.find((option) => /client meeting|meeting/i.test(option)) ??
    FINLEY_FILE_NOTE_TYPE_OPTIONS[0] ??
    "Client Meeting"
  );
}

function getDefaultFileNoteSubType(type: string) {
  const options = (FINLEY_FILE_NOTE_SUBTYPE_OPTIONS as Record<string, string[]>)[type] ?? [];
  return options.find((option) => /initial/i.test(option)) ?? options[0] ?? "Initial Meeting";
}

function isAzureOpenAiBaseUrl(baseUrl: string) {
  return /azure/i.test(baseUrl) || baseUrl.includes("/openai/");
}

function asStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value.map((item) => clean(item)).filter(Boolean) as string[];
  return cleaned.length ? cleaned : fallback;
}

function clean(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function safeObject(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function clip(text: string, limit: number) {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit)}\n\n[Evidence clipped for drafting context]`;
}
