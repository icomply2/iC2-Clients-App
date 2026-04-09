import { getClientProfile, getClientProfileId } from "@/lib/api/clients";
import type {
  ClientAssetRecord,
  ClientDependantRecord,
  ClientEntityRecord,
  ClientExpenseRecord,
  ClientIncomeRecord,
  ClientInsuranceRecord,
  ClientLiabilityRecord,
  ClientPensionRecord,
  ClientProfile,
  ClientSuperannuationRecord,
  FileNoteRecord,
  PersonRecord,
  UserSummary,
} from "@/lib/api/types";
import { readAuthTokenFromCookies } from "@/lib/auth";
import { API_BASE_URL } from "@/app/api/client-profiles/_shared";
import { createFileNote as createFileNoteAction } from "@/lib/services/file-notes";
import {
  updateClientDetails as updateClientDetailsAction,
  updatePartnerDetails as updatePartnerDetailsAction,
} from "@/lib/services/client-updates";
import {
  saveAssetCollection,
  saveFinancialCollection,
  upsertAssetCollection,
  upsertFinancialCollection,
} from "@/lib/services/profile-collections";
import {
  saveDependantCollection,
  saveEntityCollection,
  upsertDependantCollection,
  upsertEntityCollection,
} from "@/lib/services/identity-relations";
import {
  FINLEY_FILE_NOTE_SUBTYPE_OPTIONS,
  FINLEY_FILE_NOTE_TYPE_OPTIONS,
  type FinleyDisplayCard,
  type FinleyEditorCard,
  type FinleyFactFindStep,
  type FinleyFactFindWorkflow,
  type FinleyTableEditorCard,
  type FinleyChatRequest,
  type FinleyChatResponse,
} from "@/lib/finley-shared";

type LiveContext = {
  profile: ClientProfile | null;
  currentUser: UserSummary | null;
  fileNotes: FileNoteRecord[];
  resolvedClientId?: string;
  resolvedClientName?: string;
};

type StoredPlan = {
  planId: string;
  threadId: string;
  createdAt: string;
  clientId?: string;
  clientName?: string;
  profileId?: string;
  userId?: string | null;
  userRole?: string | null;
  status: "pending" | "approved" | "completed" | "failed" | "cancelled";
  summary: string;
  toolName:
    | "create_file_note"
    | "update_client_person_details"
    | "update_partner_person_details"
    | "update_asset_record"
    | "update_income_record"
    | "update_expense_record"
    | "update_liability_record"
    | "update_superannuation_record"
    | "update_retirement_income_record"
    | "update_insurance_record"
    | "update_entity_record"
    | "update_dependant_record"
    | "add_asset_record"
    | "add_liability_record"
    | "add_income_record"
    | "add_expense_record"
    | "add_superannuation_record"
    | "add_retirement_income_record"
    | "add_insurance_record"
    | "add_entity_record"
    | "add_dependant_record";
  stepId: string;
  description: string;
  inputsPreview?: Record<string, unknown>;
  execution: {
    kind: "file_note" | "client_update" | "profile_collection";
    payload: Record<string, unknown>;
  };
};

type PlanExecutionOverrides = {
  type?: string;
  subType?: string;
  record?: Record<string, unknown>;
  records?: Array<Record<string, unknown>>;
};

declare global {
  var __finleyPlanStore: Map<string, StoredPlan> | undefined;
}

const planStore = globalThis.__finleyPlanStore ?? new Map<string, StoredPlan>();

if (!globalThis.__finleyPlanStore) {
  globalThis.__finleyPlanStore = planStore;
}

const ASSET_CATEGORY_OPTIONS = ["Cash", "Investment", "Property", "Superannuation", "Business", "Personal"] as const;
const ASSET_TYPE_OPTIONS_BY_CATEGORY: Record<string, string[]> = {
  Cash: ["Cash on Hand", "Current Savings", "Fixed Deposits"],
  Investment: ["Bonds", "Other Investments", "Stocks", "Unit Trusts", "Annuity"],
  Property: ["Investment Property", "Primary Residence"],
  Superannuation: ["Pension", "Superannuation"],
  Business: ["Other Investments"],
  Personal: ["Antiques", "Artwork", "Household Contents", "Jewellery", "Motor Vehicle", "Other Life Style"],
};
const LIABILITY_TYPE_OPTIONS = ["Home Loan", "Investment Loan", "Personal Loan", "Credit Card", "Other"] as const;
const INCOME_TYPE_OPTIONS = ["Salary", "Bonus", "Rental", "Investment", "Pension", "Other"] as const;
const EXPENSE_TYPE_OPTIONS = ["Living", "Mortgage", "Rent", "Utilities", "Insurance", "Other"] as const;
const SUPER_TYPE_OPTIONS = ["Industry Fund", "Retail Fund", "SMSF", "Defined Benefit", "Other"] as const;
const PENSION_TYPE_OPTIONS = ["Account Based Pension", "Allocated Pension", "Annuity", "Other"] as const;
const INSURANCE_COVER_OPTIONS = ["Life", "TPD", "Trauma", "Income Protection", "Health", "Other"] as const;
const INSURANCE_STATUS_OPTIONS = ["Active", "Pending", "Cancelled", "Claimed"] as const;
const FREQUENCY_OPTIONS = ["Weekly", "Fortnightly", "Monthly", "Quarterly", "Annually"] as const;
const ENTITY_TYPE_OPTIONS = ["SMSF", "Trust", "Company", "Partnership"] as const;
const DEPENDANT_TYPE_OPTIONS = ["Child", "Grandchild", "Parent", "Sibling", "Other"] as const;
const CLIENT_UPDATE_TARGET_OPTIONS = ["client", "partner"] as const;
const CLIENT_STATUS_OPTIONS = ["Prospect", "Client", "Archived", "Deceased"] as const;
const CLIENT_CATEGORY_OPTIONS = ["Ongoing", "Transactional", "Review Only", "One Off"] as const;
const MARITAL_STATUS_OPTIONS = ["Single", "Married", "De Facto", "Separated", "Divorced", "Widowed"] as const;
const RESIDENT_STATUS_OPTIONS = ["Resident", "Non-Resident", "Temporary Resident"] as const;
const GENDER_OPTIONS = ["Male", "Female", "Non-Binary", "Other", "Prefer not to say"] as const;
const RISK_PROFILE_OPTIONS = ["Conservative", "Moderately Conservative", "Balanced", "Growth", "High Growth"] as const;
const ADVICE_AGREEMENT_REQUIRED_OPTIONS = ["Yes", "No"] as const;
const AGREEMENT_TYPE_OPTIONS = ["Annual Agreement", "Ongoing Fee Arrangement", "One Off Advice"] as const;

type CollectionIntentResult = {
  kind: "assets" | "liabilities" | "income" | "expenses" | "superannuation" | "retirement-income" | "insurance" | "entities" | "dependants";
  toolName: StoredPlan["toolName"];
  summary: string;
  description: string;
  payload: Record<string, unknown>;
  inputsPreview: Record<string, unknown>;
  missingInformation: string[];
  editorCard?: FinleyEditorCard | FinleyTableEditorCard | null;
};

type BatchAssetRow = {
  id: string;
  values: {
    ownerId: string;
    type: string;
    assetType: string;
    description: string;
    currentValue: string;
  };
};

function normalizeFileNoteText(message: string) {
  const trimmed = message.trim();
  if (/^(create|add)\s+a\s+file\s+note$/i.test(trimmed) || /^(new)\s+file\s+note$/i.test(trimmed)) {
    return "";
  }
  const cleaned = trimmed
    .replace(/^create\s+a\s+file\s+note\s+(saying|that)\s+/i, "")
    .replace(/^create\s+a\s+file\s+note\s+/i, "")
    .replace(/^add\s+a\s+file\s+note\s+(saying|that)\s+/i, "")
    .replace(/^add\s+a\s+file\s+note\s+/i, "")
    .replace(/^note\s+(that|saying)\s+/i, "")
    .trim();

  return cleaned || trimmed;
}

function normalizeAssistPrompt(message: string) {
  return message.replace(/^finley:\s*/i, "").trim();
}

function stripFinleyBoilerplate(text: string) {
  return text
    .replace(/\s*This file note was prepared by Finley for adviser review before saving to the client record\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePromptInstruction(text: string) {
  return stripFinleyBoilerplate(text)
    .replace(/^(write|draft|create|generate|rewrite|make)\s+(a|an)?\s*/i, "")
    .replace(/^(professional|clear|concise)\s+/i, "")
    .replace(/^(file note|note|follow up note)\s+(about|for|regarding)\s+/i, "")
    .replace(/^about\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toSentence(text: string) {
  const trimmed = normalizePromptInstruction(text);
  if (!trimmed) return "";
  const first = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(first) ? first : `${first}.`;
}

function buildProfessionalFileNoteBody(text: string) {
  const topic = normalizePromptInstruction(text);
  if (!topic) {
    return "Client interaction recorded for follow-up.";
  }

  const sentence = toSentence(topic);
  return sentence;
}

function toSubjectLine(text: string) {
  const cleaned = normalizePromptInstruction(text)
    .replace(/\s+(for|about)\s+the\s+file\s+note$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Client update";
  const sentence = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return sentence.length > 72 ? `${sentence.slice(0, 69).trimEnd()}...` : sentence;
}

export async function assistFinleyFileNoteField(input: {
  fieldKey: "subject" | "content";
  message: string;
  activeClientName?: string | null;
  currentSubject?: string | null;
  currentContent?: string | null;
  type?: string | null;
  subType?: string | null;
}) {
  const prompt = normalizeAssistPrompt(input.message);
  const fallbackClient = input.activeClientName?.trim() || "the selected client";
  const cleanPrompt = prompt || `document an update for ${fallbackClient}`;
  const suggestedSubject = toSubjectLine(cleanPrompt);
  const nextBody =
    input.fieldKey === "content"
      ? buildProfessionalFileNoteBody(cleanPrompt)
      : input.currentContent?.trim() || buildProfessionalFileNoteBody(cleanPrompt);

  return {
    assistantMessage:
      input.fieldKey === "subject"
        ? "I drafted the file note subject for you."
        : "I drafted the file note body for you.",
    updates: {
      ...(input.fieldKey === "subject" ? { subject: suggestedSubject } : { content: nextBody, subject: suggestedSubject }),
    },
  };
}

function getFinleyFileNoteType(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes("called") || lower.includes("phone")) {
    return { type: "Phone Call", subType: "Follow Up" };
  }

  if (lower.includes("email")) {
    return { type: "Email", subType: "Client Email" };
  }

  if (lower.includes("review")) {
    return { type: "Review", subType: "Annual Review" };
  }

  return { type: "Administration", subType: "Task Update" };
}

function hasRealPartner(person: PersonRecord | null | undefined) {
  if (!person) return false;

  return Boolean(
    person.id?.trim() ||
      person.name?.trim() ||
      person.email?.trim() ||
      person.dob?.trim() ||
      person.preferredPhone?.trim() ||
      person.phone?.trim() ||
      person.mobile?.trim() ||
      person.mobilePhone?.trim(),
  );
}

function buildClientUpdateEditorCard(
  toolName: StoredPlan["toolName"],
  target: "client" | "partner",
  changes: Record<string, unknown>,
  allowedTargets: ReadonlyArray<"client" | "partner"> = CLIENT_UPDATE_TARGET_OPTIONS,
) {
  const fields: FinleyEditorCard["fields"] = [
    {
      key: "target",
      label: "Target",
      input: "select",
      value: target,
      options: allowedTargets.map((value) => ({ label: value === "partner" ? "Partner" : "Client", value })),
    },
  ];

  const pushTextField = (key: string, label: string, defaultValue = "") => {
    fields.push({
      key,
      label,
      input: "text",
      value: typeof changes[key] === "string" ? (changes[key] as string) : defaultValue,
    });
  };

  const pushSelectField = (key: string, label: string, options: readonly string[], defaultValue = "") => {
    fields.push({
      key,
      label,
      input: "select",
      value: typeof changes[key] === "string" ? (changes[key] as string) : defaultValue,
      options: toCardOptions(options),
    });
  };

  const includesAddressField = ["street", "suburb", "state", "postCode"].some((key) => key in changes);
  const hasKnownField = Object.keys(changes).some((key) =>
    [
      "name",
      "email",
      "preferredPhone",
      "dateOfBirth",
      "maritalStatus",
      "residentStatus",
      "gender",
      "status",
      "clientCategory",
      "riskProfile",
      "adviceAgreementRequired",
      "agreementType",
      "nextAnniversaryDate",
      "street",
      "suburb",
      "state",
      "postCode",
    ].includes(key),
  );

  if (changes.name || !hasKnownField) pushTextField("name", "Name");
  if (changes.email || !hasKnownField) pushTextField("email", "Email");
  if (changes.preferredPhone || !hasKnownField) pushTextField("preferredPhone", "Preferred Phone");
  if (changes.dateOfBirth || !hasKnownField) pushTextField("dateOfBirth", "Date Of Birth");
  if (includesAddressField || !hasKnownField) {
    pushTextField("street", "Street");
    pushTextField("suburb", "Suburb");
    pushTextField("state", "State");
    pushTextField("postCode", "Post Code");
  }
  if (changes.maritalStatus || !hasKnownField) pushSelectField("maritalStatus", "Marital Status", MARITAL_STATUS_OPTIONS);
  if (changes.residentStatus || !hasKnownField) pushSelectField("residentStatus", "Resident Status", RESIDENT_STATUS_OPTIONS);
  if (changes.gender || !hasKnownField) pushSelectField("gender", "Gender", GENDER_OPTIONS);
  if (changes.status) pushSelectField("status", "Status", CLIENT_STATUS_OPTIONS);
  if (changes.clientCategory) pushSelectField("clientCategory", "Client Category", CLIENT_CATEGORY_OPTIONS);
  if (changes.riskProfile || !hasKnownField) pushSelectField("riskProfile", "Risk Profile", RISK_PROFILE_OPTIONS);
  if (changes.adviceAgreementRequired) {
    pushSelectField("adviceAgreementRequired", "Advice Agreement Required", ADVICE_AGREEMENT_REQUIRED_OPTIONS);
  }
  if (changes.agreementType) pushSelectField("agreementType", "Agreement Type", AGREEMENT_TYPE_OPTIONS);
  if (changes.nextAnniversaryDate) pushTextField("nextAnniversaryDate", "Next Anniversary Date");

  return {
    kind: "collection_form" as const,
    title: "Update Details",
    toolName,
    fields,
  };
}

function buildCurrentPersonChanges(person: PersonRecord | null | undefined): Record<string, unknown> {
  if (!person) return {};

  return {
    name: person.name ?? "",
    email: person.email ?? "",
    preferredPhone: person.preferredPhone ?? person.phone ?? person.mobile ?? person.mobilePhone ?? person.contact?.preferredPhone ?? person.contact?.phone ?? "",
    dateOfBirth: person.dob ?? "",
    street: person.street ?? person.address?.street ?? person.address?.line1 ?? "",
    suburb: person.suburb ?? person.address?.suburb ?? person.address?.city ?? "",
    state: person.state ?? person.address?.state ?? person.address?.region ?? "",
    postCode: person.postCode ?? person.postcode ?? person.address?.postCode ?? person.address?.postcode ?? person.address?.zipCode ?? "",
    maritalStatus: person.maritalStatus ?? "",
    residentStatus: person.residentStatus ?? "",
    gender: person.gender ?? "",
    status: person.status ?? person.clientStatus ?? "",
    clientCategory: person.clientCategory ?? person.category ?? "",
    riskProfile: person.riskProfileResponse?.resultDisplay ?? "",
    adviceAgreementRequired:
      person.fdsAnnualAgreementRequired ?? person.annualAgreementRequired ?? person.fdsRequired ?? "",
    agreementType: person.agreementType ?? person.annualAgreement?.agreementType ?? person.annualAgreement?.type ?? "",
    nextAnniversaryDate: person.nextAnniversaryDate ?? person.annualAgreement?.nextAnniversaryDate ?? person.annualAgreement?.nextDueDate ?? "",
  };
}

function applyFileNoteOverrides(plan: StoredPlan, overrides?: PlanExecutionOverrides | null) {
  if (!overrides) return plan;

  if (plan.execution.kind === "profile_collection" && Array.isArray(overrides.records)) {
    return {
      ...plan,
      inputsPreview: {
        ...(plan.inputsPreview ?? {}),
        recordCount: overrides.records.length,
      },
      execution: {
        ...plan.execution,
        payload: {
          ...plan.execution.payload,
          records: overrides.records,
        },
      },
    };
  }

  if (plan.execution.kind === "profile_collection" && overrides.record && typeof overrides.record === "object") {
    return {
      ...plan,
      inputsPreview: {
        ...(plan.inputsPreview ?? {}),
        ...overrides.record,
      },
      execution: {
        ...plan.execution,
        payload: {
          ...plan.execution.payload,
          record: {
            ...(plan.execution.payload.record && typeof plan.execution.payload.record === "object" ? plan.execution.payload.record : {}),
            ...overrides.record,
          },
        },
      },
    };
  }

  if (plan.execution.kind === "client_update") {
    const payload = { ...plan.execution.payload };
    const inputsPreview = { ...(plan.inputsPreview ?? {}) };
    const recordOverride = overrides.record && typeof overrides.record === "object" ? { ...overrides.record } : null;

    if (recordOverride) {
      const nextTarget =
        typeof recordOverride.target === "string" && CLIENT_UPDATE_TARGET_OPTIONS.includes(recordOverride.target as (typeof CLIENT_UPDATE_TARGET_OPTIONS)[number])
          ? recordOverride.target
          : typeof payload.target === "string"
            ? payload.target
            : "client";

      delete recordOverride.target;

      const nextChanges: Record<string, unknown> = Object.fromEntries(
        Object.entries(recordOverride).filter(([key, value]) => {
          if (key === "riskProfileResponse") return false;
          if (typeof value !== "string") return value != null;
          return value.trim().length > 0;
        }),
      );

      if (typeof nextChanges.riskProfile === "string" && nextChanges.riskProfile.trim()) {
        nextChanges.riskProfileResponse = {
          resultDisplay: nextChanges.riskProfile,
        };
      }

      payload.target = nextTarget;
      payload.changes = nextChanges;
      inputsPreview.target = nextTarget;
      inputsPreview.extractedFields = Object.keys(nextChanges);
      Object.assign(inputsPreview, nextChanges);
    }

    return {
      ...plan,
      inputsPreview,
      execution: {
        ...plan.execution,
        payload,
      },
    };
  }

  if (plan.execution.kind !== "file_note") return plan;

  const payload = { ...plan.execution.payload };
  const inputsPreview = { ...(plan.inputsPreview ?? {}) };
  const recordOverride = overrides.record && typeof overrides.record === "object" ? overrides.record : null;

  if (recordOverride) {
    Object.assign(payload, recordOverride);
    Object.assign(inputsPreview, {
      subject: typeof recordOverride.subject === "string" ? recordOverride.subject : inputsPreview.subject,
      content: typeof recordOverride.content === "string" ? recordOverride.content : inputsPreview.content,
      serviceDate: typeof recordOverride.serviceDate === "string" ? recordOverride.serviceDate : inputsPreview.serviceDate,
      type: typeof recordOverride.type === "string" ? recordOverride.type : inputsPreview.type,
      subType: typeof recordOverride.subType === "string" ? recordOverride.subType : inputsPreview.subType,
    });
  }

  const requestedType = typeof overrides.type === "string" ? overrides.type.trim() : "";
  const requestedSubType = typeof overrides.subType === "string" ? overrides.subType.trim() : "";
  const allowedTypes = [...FINLEY_FILE_NOTE_TYPE_OPTIONS];
  const nextType = requestedType && allowedTypes.includes(requestedType as (typeof FINLEY_FILE_NOTE_TYPE_OPTIONS)[number])
    ? requestedType
    : typeof payload.type === "string"
      ? payload.type
      : "";

  const allowedSubTypes = FINLEY_FILE_NOTE_SUBTYPE_OPTIONS[nextType] ?? [];
  const nextSubType =
    requestedSubType && allowedSubTypes.includes(requestedSubType)
      ? requestedSubType
      : allowedSubTypes.includes(typeof payload.subType === "string" ? payload.subType : "")
        ? (payload.subType as string)
        : (allowedSubTypes[0] ?? "");

  payload.type = nextType;
  payload.subType = nextSubType;
  inputsPreview.type = nextType;
  inputsPreview.subType = nextSubType;

  return {
    ...plan,
    inputsPreview,
    execution: {
      ...plan.execution,
      payload,
    },
  };
}

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

async function loadCurrentUser(token: string): Promise<UserSummary | null> {
  if (!API_BASE_URL) return null;

  try {
    const response = await fetch(new URL("/api/Users", API_BASE_URL), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const body = (await response.json().catch(() => null)) as { data?: UserSummary[] | null } | null;
    return response.ok && body?.data?.length ? (body.data[0] ?? null) : null;
  } catch {
    return null;
  }
}

async function loadFileNotes(token: string, clientId?: string | null) {
  if (!API_BASE_URL || !clientId) return [] as FileNoteRecord[];

  try {
    const response = await fetch(new URL(`/api/ClientProfiles/FileNote/Client/${encodeURIComponent(clientId)}`, API_BASE_URL), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const body = (await response.json().catch(() => null)) as { data?: FileNoteRecord[] | null } | null;
    return response.ok && Array.isArray(body?.data) ? body.data : [];
  } catch {
    return [];
  }
}

async function loadLiveContext(activeClientId?: string | null, activeClientName?: string | null): Promise<LiveContext> {
  const token = await readAuthTokenFromCookies();

  if (!token || !activeClientId) {
    return {
      profile: null,
      currentUser: null,
      fileNotes: [],
      resolvedClientId: activeClientId ?? undefined,
      resolvedClientName: activeClientName ?? undefined,
    };
  }

  const currentUser = await loadCurrentUser(token);
  let profile = await getClientProfile(activeClientId, token).then((result) => result.data ?? null).catch(() => null);

  if (!profile) {
    const profileIdResult = await getClientProfileId(activeClientId, token).catch(() => null);
    const resolvedProfileId = profileIdResult?.data ?? null;
    if (resolvedProfileId) {
      profile = await getClientProfile(resolvedProfileId, token).then((result) => result.data ?? null).catch(() => null);
    }
  }

  const resolvedClientId = profile?.client?.id ?? activeClientId;
  const resolvedClientName =
    [profile?.client?.name, profile?.partner?.name].filter(Boolean).join(" & ") || activeClientName || activeClientId;
  const fileNotes = await loadFileNotes(token, resolvedClientId);

  return {
    profile,
    currentUser,
    fileNotes,
    resolvedClientId,
    resolvedClientName,
  };
}

function countMissingFields(profile: ClientProfile | null) {
  if (!profile?.client) return ["client profile"];

  const missing: string[] = [];
  const client = profile.client;
  const record = client as ClientProfile["client"] & Record<string, unknown>;
  const address = (record.address ?? null) as Record<string, unknown> | null;
  const street = typeof address?.street === "string" ? address.street : client.street;
  const suburb = typeof address?.suburb === "string" ? address.suburb : client.suburb;
  const postCode = typeof address?.postCode === "string" ? address.postCode : client.postCode;

  if (!client.email?.trim()) missing.push("email");
  if (!(client.mobile ?? client.phone ?? client.preferredPhone)?.trim()) missing.push("preferred phone");
  if (!client.dob?.trim()) missing.push("date of birth");
  if (!street?.trim()) missing.push("street");
  if (!suburb?.trim()) missing.push("suburb");
  if (!postCode?.trim()) missing.push("post code");

  return missing;
}

function resolvePersonForRead(profile: ClientProfile | null, target: "client" | "partner") {
  if (!profile) return null;
  return target === "partner" ? profile.partner ?? null : profile.client ?? null;
}

function buildProfileReadAnswer(message: string, context: LiveContext) {
  const lower = message.toLowerCase();
  const target = /\bpartner\b/.test(lower) ? "partner" : "client";
  const person = resolvePersonForRead(context.profile, target);
  const personLabel = target === "partner" ? "partner" : "client";
  const personName = person?.name?.trim() || context.resolvedClientName || `the selected ${personLabel}`;

  if (!person) {
    return {
      matched: true,
      assistantMessage: `I could not load the ${personLabel} profile details for ${context.resolvedClientName ?? "the selected client"} yet.`,
      missingInformation: [
        {
          field: target,
          question: `Try refreshing the client context before asking for the ${personLabel}'s details.`,
        },
      ],
      warnings: ["Live client profile was not available for this read-only lookup."],
    };
  }

  const addressStreet = person.address?.street ?? person.address?.line1 ?? person.street ?? null;
  const addressSuburb = person.address?.suburb ?? person.address?.city ?? person.suburb ?? null;
  const addressState = person.address?.state ?? person.address?.region ?? person.state ?? null;
  const addressPostCode = person.address?.postCode ?? person.address?.postcode ?? person.address?.zipCode ?? person.postCode ?? person.postcode ?? null;
  const addressValue = [addressStreet, addressSuburb, [addressState, addressPostCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const phoneValue = person.preferredPhone ?? person.contact?.preferredPhone ?? person.mobile ?? person.mobilePhone ?? person.phone ?? person.contact?.phone ?? null;
  const dobValue = person.dob ?? null;
  const displayDob = formatDateForDisplay(dobValue);
  const summaryRequested =
    lower.includes("summary") ||
    lower.includes("summarise") ||
    lower.includes("summarize") ||
    lower.includes("key details") ||
    lower.includes("overview") ||
    lower.includes("profile");

  if (summaryRequested) {
    const summaryParts = [
      person.email?.trim() ? `Email: ${person.email.trim()}` : "Email missing",
      phoneValue?.trim() ? `Phone: ${phoneValue.trim()}` : "Phone missing",
      displayDob ? `DOB: ${displayDob}` : "DOB missing",
      addressValue ? `Address: ${addressValue}` : "Address missing",
      person.maritalStatus?.trim() ? `Marital status: ${person.maritalStatus.trim()}` : null,
      person.residentStatus?.trim() ? `Resident status: ${person.residentStatus.trim()}` : null,
      person.clientCategory?.trim() ? `Category: ${person.clientCategory.trim()}` : null,
      person.status?.trim() ? `Status: ${person.status.trim()}` : null,
      person.riskProfileResponse?.resultDisplay?.trim()
        ? `Risk profile: ${person.riskProfileResponse.resultDisplay.trim()}`
        : null,
    ].filter(Boolean);

    const recentNotes = context.fileNotes.length;

    return {
      matched: true,
      assistantMessage: `${personName} summary: ${summaryParts.join(". ")}.${recentNotes ? ` I found ${recentNotes} recent file note${recentNotes === 1 ? "" : "s"}.` : ""}`,
      missingInformation: [],
      warnings: [],
    };
  }

  if (lower.includes("email")) {
    return {
      matched: true,
      assistantMessage: person.email?.trim()
        ? `${personName}'s email is ${person.email.trim()}.`
        : `I couldn't find an email address for ${personName}.`,
      missingInformation: person.email?.trim()
        ? []
        : [{ field: "email", question: `Provide ${personName}'s email address if you want me to update it.` }],
      warnings: [],
    };
  }

  if (lower.includes("phone") || lower.includes("mobile") || lower.includes("number")) {
    return {
      matched: true,
      assistantMessage: phoneValue?.trim()
        ? `${personName}'s preferred phone is ${phoneValue.trim()}.`
        : `I couldn't find a preferred phone number for ${personName}.`,
      missingInformation: phoneValue?.trim()
        ? []
        : [{ field: "preferredPhone", question: `Provide ${personName}'s preferred phone number if you want me to update it.` }],
      warnings: [],
    };
  }

  if (lower.includes("address")) {
    return {
      matched: true,
      assistantMessage: addressValue
        ? `${personName}'s address is ${addressValue}.`
        : `I couldn't find an address for ${personName}.`,
      missingInformation: addressValue
        ? []
        : [{ field: "address", question: `Provide ${personName}'s address if you want me to update it.` }],
      warnings: [],
    };
  }

  if (lower.includes("date of birth") || /\bdob\b/.test(lower) || lower.includes("birthday")) {
    return {
      matched: true,
      assistantMessage: displayDob
        ? `${personName}'s date of birth is ${displayDob}.`
        : `I couldn't find a date of birth for ${personName}.`,
      missingInformation: displayDob
        ? []
        : [{ field: "dateOfBirth", question: `Provide ${personName}'s date of birth if you want me to update it.` }],
      warnings: [],
    };
  }

  return {
    matched: false,
    assistantMessage: "",
    missingInformation: [],
    warnings: [],
  };
}

function buildCollectionReadAnswer(message: string, context: LiveContext) {
  const lower = message.toLowerCase();
  const clientName = context.resolvedClientName ?? "the selected client";

  if (lower.includes("asset")) {
    const assets = context.profile?.assets ?? [];
    if (!assets.length) {
      return {
        matched: true,
        assistantMessage: `I couldn't find any asset records for ${clientName}.`,
        missingInformation: [],
        warnings: [],
      };
    }

    const assetSummary = assets
      .slice(0, 5)
      .map((asset) => asset.description ?? asset.assetType ?? asset.type ?? "Asset")
      .join(", ");
    const remaining = assets.length > 5 ? `, plus ${assets.length - 5} more` : "";

    return {
      matched: true,
      assistantMessage: `${clientName} has ${assets.length} asset record${assets.length === 1 ? "" : "s"}: ${assetSummary}${remaining}.`,
      missingInformation: [],
      warnings: [],
      displayCard: {
        kind: "collection_summary",
        title: `${clientName} Assets`,
        columns: ["Category", "Type", "Description", "Current Value"],
        rows: assets.map((asset, index) => ({
          id: asset.id ?? `asset-${index}`,
          cells: [
            asset.type ?? "",
            asset.assetType ?? "",
            asset.description ?? "",
            formatCurrencyDisplay(asset.currentValue),
          ],
          editAction: asset.id ? { kind: "assets", recordId: asset.id, label: "Edit" } : null,
        })),
        footer: null,
      } satisfies FinleyDisplayCard,
    };
  }

  if (lower.includes("dependant") || lower.includes("dependent")) {
    const dependants = context.profile?.dependants ?? [];
    if (!dependants.length) {
      return {
        matched: true,
        assistantMessage: `I couldn't find any dependant records for ${clientName}.`,
        missingInformation: [],
        warnings: [],
        displayCard: null,
      };
    }

    return {
      matched: true,
      assistantMessage: `${clientName} has ${dependants.length} dependant record${dependants.length === 1 ? "" : "s"}.`,
      missingInformation: [],
      warnings: [],
      displayCard: {
        kind: "collection_summary",
        title: `${clientName} Dependants`,
        columns: ["Name", "Type", "Birthday"],
        rows: dependants.map((item, index) => ({
          id: item.id ?? `dependant-${index}`,
          cells: [item.name ?? "", item.type ?? "Child", formatDateForDisplay(item.birthday) ?? ""],
          editAction: item.id ? { kind: "dependants", recordId: item.id, label: "Edit" } : null,
        })),
        footer: null,
      } satisfies FinleyDisplayCard,
    };
  }

  if (lower.includes("entit")) {
    const entities = context.profile?.entities ?? [];
    if (!entities.length) {
      return {
        matched: true,
        assistantMessage: `I couldn't find any entity records for ${clientName}.`,
        missingInformation: [],
        warnings: [],
        displayCard: null,
      };
    }

    return {
      matched: true,
      assistantMessage: `${clientName} has ${entities.length} entity record${entities.length === 1 ? "" : "s"}.`,
      missingInformation: [],
      warnings: [],
      displayCard: {
        kind: "collection_summary",
        title: `${clientName} Entities`,
        columns: ["Name", "Owner", "Type"],
        rows: entities.map((item, index) => ({
          id: item.id ?? `entity-${index}`,
          cells: [item.name ?? "", item.owner?.name ?? "", item.type ?? ""],
          editAction: item.id ? { kind: "entities", recordId: item.id, label: "Edit" } : null,
        })),
        footer: null,
      } satisfies FinleyDisplayCard,
    };
  }

  if (lower.includes("liabil")) {
    const liabilities = context.profile?.liabilities ?? [];
    if (!liabilities.length) {
      return {
        matched: true,
        assistantMessage: `I couldn't find any liability records for ${clientName}.`,
        missingInformation: [],
        warnings: [],
        displayCard: null,
      };
    }

    return {
      matched: true,
      assistantMessage: `${clientName} has ${liabilities.length} liability record${liabilities.length === 1 ? "" : "s"}.`,
      missingInformation: [],
      warnings: [],
      displayCard: {
        kind: "collection_summary",
        title: `${clientName} Liabilities`,
        columns: ["Type", "Bank", "Balance", "Repayment"],
        rows: liabilities.map((item, index) => ({
          id: item.id ?? `liability-${index}`,
          cells: [
            item.loanType ?? "",
            item.bankName ?? "",
            formatCurrencyDisplay(item.outstandingBalance),
            formatCurrencyDisplay(item.repaymentAmount),
          ],
          editAction: item.id ? { kind: "liabilities", recordId: item.id, label: "Edit" } : null,
        })),
        footer: null,
      } satisfies FinleyDisplayCard,
    };
  }

  if (lower.includes("income")) {
    const income = context.profile?.income ?? [];
    const derivedAssetIncome = (context.profile?.assets ?? []).filter((asset) => asset.id && asset.incomeAmount);
    const derivedPensionIncome = (context.profile?.pension ?? []).filter((pension) => pension.id && pension.payment);
    const totalIncomeRecords = income.length + derivedAssetIncome.length + derivedPensionIncome.length;

    if (!totalIncomeRecords) {
      return {
        matched: true,
        assistantMessage: `I couldn't find any income records for ${clientName}.`,
        missingInformation: [],
        warnings: [],
        displayCard: null,
      };
    }

    return {
      matched: true,
      assistantMessage: `${clientName} has ${totalIncomeRecords} income record${totalIncomeRecords === 1 ? "" : "s"}.`,
      missingInformation: [],
      warnings: [],
      displayCard: {
        kind: "collection_summary",
        title: `${clientName} Income`,
        columns: ["Owner", "Description", "Amount", "Frequency", "Annualised"],
        rows: [
          ...income.map((item, index) => ({
            id: item.id ?? `income-${index}`,
            cells: [
              item.owner?.name ?? "",
              item.description ?? "",
              formatCurrencyDisplay(item.amount),
              item.frequency?.value ?? item.frequency?.type ?? "",
              formatCurrencyDisplay(
                annualiseAmount(toNumericValue(item.amount), item.frequency?.value ?? item.frequency?.type),
              ),
            ],
            editAction: item.id ? { kind: "income", recordId: item.id, label: "Edit" } : null,
          })),
          ...derivedAssetIncome.map((asset, index) => ({
            id: `derived-asset-income-${asset.id ?? index}`,
            cells: [
              asset.owner?.name ?? "",
              asset.description ?? asset.assetType ?? "",
              formatCurrencyDisplay(asset.incomeAmount),
              asset.incomeFrequency?.value ?? asset.incomeFrequency?.type ?? "",
              formatCurrencyDisplay(
                annualiseAmount(toNumericValue(asset.incomeAmount), asset.incomeFrequency?.value ?? asset.incomeFrequency?.type),
              ),
            ],
          })),
          ...derivedPensionIncome.map((pension, index) => ({
            id: `derived-pension-income-${pension.id ?? index}`,
            cells: [
              pension.owner?.name ?? "",
              pension.superFund ?? pension.type ?? "",
              formatCurrencyDisplay(pension.payment),
              pension.frequency?.value ?? pension.frequency?.type ?? "",
              formatCurrencyDisplay(
                annualiseAmount(toNumericValue(pension.payment), pension.frequency?.value ?? pension.frequency?.type),
              ),
            ],
          })),
        ],
        footer: null,
      } satisfies FinleyDisplayCard,
    };
  }

  if (lower.includes("expense")) {
    const expenses = context.profile?.expense ?? [];
    const derivedLiabilityExpenses = (context.profile?.liabilities ?? []).filter(
      (liability) => liability.id && liability.repaymentAmount,
    );
    const totalExpenseRecords = expenses.length + derivedLiabilityExpenses.length;

    if (!totalExpenseRecords) {
      return {
        matched: true,
        assistantMessage: `I couldn't find any expense records for ${clientName}.`,
        missingInformation: [],
        warnings: [],
        displayCard: null,
      };
    }

    return {
      matched: true,
      assistantMessage: `${clientName} has ${totalExpenseRecords} expense record${totalExpenseRecords === 1 ? "" : "s"}.`,
      missingInformation: [],
      warnings: [],
      displayCard: {
        kind: "collection_summary",
        title: `${clientName} Expenses`,
        columns: ["Owner", "Type", "Description", "Amount", "Frequency", "Annualised"],
        rows: [
          ...expenses.map((item, index) => ({
            id: item.id ?? `expense-${index}`,
            cells: [
              item.owner?.name ?? "",
              item.type ?? "",
              item.description ?? "",
              formatCurrencyDisplay(item.amount),
              item.frequency?.value ?? item.frequency?.type ?? "",
              formatCurrencyDisplay(
                annualiseAmount(toNumericValue(item.amount), item.frequency?.value ?? item.frequency?.type),
              ),
            ],
            editAction: item.id ? { kind: "expenses", recordId: item.id, label: "Edit" } : null,
          })),
          ...derivedLiabilityExpenses.map((liability, index) => ({
            id: `derived-liability-expense-${liability.id ?? index}`,
            cells: [
              liability.owner?.name ?? "",
              liability.loanType ?? "Liability Repayment",
              liability.bankName ?? "",
              formatCurrencyDisplay(liability.repaymentAmount),
              liability.repaymentFrequency?.value ?? liability.repaymentFrequency?.type ?? "",
              formatCurrencyDisplay(
                annualiseAmount(
                  toNumericValue(liability.repaymentAmount),
                  liability.repaymentFrequency?.value ?? liability.repaymentFrequency?.type,
                ),
              ),
            ],
          })),
        ],
        footer: null,
      } satisfies FinleyDisplayCard,
    };
  }

  if (lower.includes("insurance") || lower.includes("cover")) {
    const insurance = context.profile?.insurance ?? [];
    if (!insurance.length) {
      return {
        matched: true,
        assistantMessage: `I couldn't find any insurance records for ${clientName}.`,
        missingInformation: [],
        warnings: [],
        displayCard: null,
      };
    }

    return {
      matched: true,
      assistantMessage: `${clientName} has ${insurance.length} insurance record${insurance.length === 1 ? "" : "s"}.`,
      missingInformation: [],
      warnings: [],
      displayCard: {
        kind: "collection_summary",
        title: `${clientName} Insurance`,
        columns: ["Cover", "Insurer", "Sum Insured", "Premium"],
        rows: insurance.map((item, index) => ({
          id: item.id ?? `insurance-${index}`,
          cells: [
            item.coverRequired ?? "",
            item.insurer ?? "",
            formatCurrencyDisplay(item.sumInsured),
            formatCurrencyDisplay(item.premiumAmount),
          ],
          editAction: item.id ? { kind: "insurance", recordId: item.id, label: "Edit" } : null,
        })),
        footer: null,
      } satisfies FinleyDisplayCard,
    };
  }

  if (lower.includes("super")) {
    const superRecords = context.profile?.superannuation ?? [];
    if (!superRecords.length) {
      return {
        matched: true,
        assistantMessage: `I couldn't find any superannuation records for ${clientName}.`,
        missingInformation: [],
        warnings: [],
        displayCard: null,
      };
    }

    return {
      matched: true,
      assistantMessage: `${clientName} has ${superRecords.length} superannuation record${superRecords.length === 1 ? "" : "s"}.`,
      missingInformation: [],
      warnings: [],
      displayCard: {
        kind: "collection_summary",
        title: `${clientName} Superannuation`,
        columns: ["Type", "Fund", "Balance", "Contribution"],
        rows: superRecords.map((item, index) => ({
          id: item.id ?? `super-${index}`,
          cells: [
            item.type ?? "",
            item.superFund ?? "",
            formatCurrencyDisplay(item.balance),
            formatCurrencyDisplay(item.contributionAmount),
          ],
          editAction: item.id ? { kind: "superannuation", recordId: item.id, label: "Edit" } : null,
        })),
        footer: null,
      } satisfies FinleyDisplayCard,
    };
  }

  if (lower.includes("retirement income") || lower.includes("pension")) {
    const pensionRecords = context.profile?.pension ?? [];
    if (!pensionRecords.length) {
      return {
        matched: true,
        assistantMessage: `I couldn't find any retirement income records for ${clientName}.`,
        missingInformation: [],
        warnings: [],
        displayCard: null,
      };
    }

    return {
      matched: true,
      assistantMessage: `${clientName} has ${pensionRecords.length} retirement income record${pensionRecords.length === 1 ? "" : "s"}.`,
      missingInformation: [],
      warnings: [],
      displayCard: {
        kind: "collection_summary",
        title: `${clientName} Retirement Income`,
        columns: ["Type", "Fund", "Balance", "Payment"],
        rows: pensionRecords.map((item, index) => ({
          id: item.id ?? `pension-${index}`,
          cells: [
            item.type ?? "",
            item.superFund ?? "",
            formatCurrencyDisplay(item.balance),
            formatCurrencyDisplay(item.payment),
          ],
          editAction: item.id ? { kind: "retirement-income", recordId: item.id, label: "Edit" } : null,
        })),
        footer: null,
      } satisfies FinleyDisplayCard,
    };
  }

  return {
    matched: false,
    assistantMessage: "",
    missingInformation: [],
    warnings: [],
    displayCard: null,
  };
}

function formatCurrencyDisplay(value: string | number | null | undefined) {
  if (value == null) return "";

  const stringValue = String(value).trim();
  if (!stringValue) return "";

  const numeric = Number(stringValue.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(numeric)) return stringValue;

  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

function toNumericValue(value?: string | number | null) {
  if (value == null) return 0;

  const numeric =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/[^0-9.-]/g, ""));

  return Number.isFinite(numeric) ? numeric : 0;
}

function annualiseAmount(amount: number, frequency?: string | null) {
  switch ((frequency ?? "").toLowerCase()) {
    case "weekly":
      return amount * 52;
    case "fortnightly":
      return amount * 26;
    case "monthly":
      return amount * 12;
    case "quarterly":
      return amount * 4;
    case "annually":
    case "annual":
      return amount;
    default:
      return amount;
  }
}

function normalizeDateToIso(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return trimmed;

  const slashMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, "0");
    const month = slashMatch[2].padStart(2, "0");
    const year = slashMatch[3];
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function formatDateForDisplay(value?: string | null) {
  if (!value?.trim()) return null;

  const normalized = normalizeDateToIso(value);
  if (!normalized) return value.trim();

  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year}`;
}

function normalizeCurrencyLikeValue(value?: string | null) {
  if (!value?.trim()) return null;
  const normalized = value.replace(/[^0-9.]/g, "");
  if (!normalized) return null;
  const numeric = Number(normalized);
  return Number.isNaN(numeric) ? null : numeric.toFixed(2);
}

function extractAfterLabel(message: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      return match[1].trim().replace(/[.]+$/, "");
    }
  }

  return null;
}

function extractSegment(message: string, label: string, stopWords: string[]) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stopPattern = stopWords.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = message.match(new RegExp(`\\b${escapedLabel}\\b\\s*(?:to|is|=|:)?\\s*(.+?)(?=\\b(?:${stopPattern})\\b|$)`, "i"));
  return match?.[1]?.trim().replace(/[.]+$/, "") ?? null;
}

function extractMoneyValue(message: string, labels: string[]) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = message.match(new RegExp(`\\b${escaped}\\b\\s*(?:to|is|of|=|:)?\\s*\\$?\\s*([0-9][0-9,]*(?:\\.\\d{1,2})?)`, "i"));
    if (match?.[1]) {
      return normalizeCurrencyLikeValue(match[1]);
    }
  }

  return null;
}

function extractPercentValue(message: string, labels: string[]) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = message.match(new RegExp(`\\b${escaped}\\b\\s*(?:to|is|of|=|:)?\\s*([0-9]+(?:\\.\\d+)?)%?`, "i"));
    if (match?.[1]) {
      return `${match[1]}%`;
    }
  }

  return null;
}

function extractMatchingOption(message: string, options: readonly string[]) {
  const lower = message.toLowerCase();
  return [...options]
    .sort((a, b) => b.length - a.length)
    .find((option) => lower.includes(option.toLowerCase())) ?? null;
}

function extractFrequencyOption(message: string) {
  return extractMatchingOption(message, FREQUENCY_OPTIONS);
}

function resolveCollectionOwner(message: string, profile: ClientProfile | null) {
  const lower = message.toLowerCase();

  if (lower.includes("partner") && profile?.partner?.id && profile.partner.name) {
    return { id: profile.partner.id, name: profile.partner.name };
  }

  const matchedEntity = (profile?.entities ?? []).find(
    (entity: ClientEntityRecord | null | undefined) =>
      entity?.id && entity.name && lower.includes(entity.name.toLowerCase()),
  );

  if (matchedEntity?.id && matchedEntity.name) {
    return { id: matchedEntity.id, name: matchedEntity.name };
  }

  if (profile?.client?.id && profile.client.name) {
    return { id: profile.client.id, name: profile.client.name };
  }

  return null;
}

function inferAssetCategoryFromType(assetType?: string | null) {
  if (!assetType) return null;
  for (const [category, types] of Object.entries(ASSET_TYPE_OPTIONS_BY_CATEGORY)) {
    if (types.includes(assetType)) {
      return category;
    }
  }
  return null;
}

function normalizeAssetTypeLabel(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return { assetType: null, category: null, description: null };

  const lower = trimmed.toLowerCase();
  if (lower === "car" || lower === "vehicle" || lower === "motor vehicle") {
    return { assetType: "Motor Vehicle", category: "Personal", description: "Car" };
  }
  if (lower === "home contents" || lower === "contents" || lower === "household contents") {
    return { assetType: "Household Contents", category: "Personal", description: "Home Contents" };
  }
  if (lower === "cash" || lower === "cash on hand") {
    return { assetType: "Cash on Hand", category: "Cash", description: "Cash" };
  }
  if (lower === "bank account" || lower === "savings account" || lower === "current savings") {
    return { assetType: "Current Savings", category: "Cash", description: trimmed };
  }

  const matched = extractMatchingOption(trimmed, Object.values(ASSET_TYPE_OPTIONS_BY_CATEGORY).flat());
  if (matched) {
    return {
      assetType: matched,
      category: inferAssetCategoryFromType(matched),
      description: trimmed,
    };
  }

  return {
    assetType: trimmed,
    category: inferAssetCategoryFromType(trimmed),
    description: trimmed,
  };
}

function resolveCollectionOwnerByName(name: string, profile: ClientProfile | null) {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;

  const ownerOptions = getOwnerOptions(profile);
  return ownerOptions.find((option) => option.label.trim().toLowerCase() === normalized) ?? null;
}

function parseBatchAssetRows(message: string, context: LiveContext) {
  const lines = message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 3) return null;
  if (!/assets?/i.test(lines[0])) return null;

  const dataLines = lines.slice(1).filter((line) => !/^owner[\s|]+type[\s|]+current\s*value/i.test(line));
  if (dataLines.length < 2) return null;

  const records: BatchAssetRow[] = dataLines
    .map((line, index) => {
      const parts = line.includes("|")
        ? line.split("|").map((part) => part.trim()).filter(Boolean)
        : line.split(/\t+/).map((part) => part.trim()).filter(Boolean);

      if (parts.length < 3) return null;

      const [ownerLabel, typeLabel, currentValueLabel] = parts;
      const ownerFromName = resolveCollectionOwnerByName(ownerLabel, context.profile);
      const fallbackOwner = resolveCollectionOwner(message, context.profile);
      const ownerId = ownerFromName?.value ?? fallbackOwner?.id ?? "";
      const ownerName = ownerFromName?.label ?? fallbackOwner?.name ?? "";
      const normalizedType = normalizeAssetTypeLabel(typeLabel);

      const record: ClientAssetRecord = {
        type: normalizedType.category ?? "Personal",
        assetType: normalizedType.assetType,
        description: normalizedType.description,
        currentValue: normalizeCurrencyLikeValue(currentValueLabel) ?? null,
        cost: null,
        incomeAmount: null,
        incomeFrequency: { type: "", value: "" },
        acquisitionDate: null,
        joint: false,
        owner: ownerId && ownerName ? { id: ownerId, name: ownerName } : null,
      };

      return {
        id: `batch-asset-${index + 1}`,
        values: {
          ownerId: record.owner?.id ?? "",
          type: record.type ?? "",
          assetType: record.assetType ?? "",
          description: record.description ?? "",
          currentValue: record.currentValue ?? "",
        },
      };
    })
    .filter((row): row is BatchAssetRow => row !== null);

  return records.length > 1 ? records : null;
}

function toCardOptions(options: readonly string[]) {
  return [...options].map((option) => ({ label: option, value: option }));
}

function getOwnerOptions(profile: ClientProfile | null) {
  return [
    profile?.client?.id && profile.client.name ? { label: profile.client.name, value: profile.client.id } : null,
    profile?.partner?.id && profile.partner.name ? { label: profile.partner.name, value: profile.partner.id } : null,
    ...((profile?.entities ?? [])
      .filter((entity) => entity.id && entity.name)
      .map((entity) => ({ label: entity.name!, value: entity.id! }))),
  ].filter((entry): entry is { label: string; value: string } => Boolean(entry));
}

function extractAssetIntent(message: string, context: LiveContext): CollectionIntentResult {
  const owner = resolveCollectionOwner(message, context.profile);
  const category =
    extractSegment(message, "category", ["type", "asset type", "description", "value", "cost", "income", "acquisition date"]) ??
    extractMatchingOption(message, ASSET_CATEGORY_OPTIONS) ??
    null;
  const assetType =
    extractSegment(message, "asset type", ["description", "value", "cost", "income", "acquisition date", "category"]) ??
    extractSegment(message, "type", ["description", "value", "cost", "income", "acquisition date", "category"]) ??
    extractMatchingOption(message, Object.values(ASSET_TYPE_OPTIONS_BY_CATEGORY).flat()) ??
    null;
  const resolvedCategory = category || inferAssetCategoryFromType(assetType) || null;
  const description =
    extractSegment(message, "description", ["value", "cost", "income", "acquisition date", "category", "type", "asset type"]) ??
    extractAfterLabel(message, [/\basset\s+(?:for|called|named)\s+([A-Za-z0-9'&().,/ -]+)/i]);

  const record: ClientAssetRecord = {
    type: resolvedCategory,
    assetType,
    description: description?.trim() || null,
    currentValue: extractMoneyValue(message, ["current value", "value", "balance", "worth"]),
    cost: extractMoneyValue(message, ["cost"]),
    incomeAmount: extractMoneyValue(message, ["income amount", "income"]),
    incomeFrequency: extractFrequencyOption(message) ? { type: extractFrequencyOption(message), value: extractFrequencyOption(message) } : { type: "", value: "" },
    acquisitionDate: normalizeDateToIso(extractAfterLabel(message, [/\bacquisition date\s*(?:to|is|=|:)?\s*([A-Za-z0-9/\s-]+)/i]) ?? "") ?? null,
    joint: /\bjoint\b/.test(message.toLowerCase()),
    owner: owner ? { id: owner.id, name: owner.name } : null,
  };

  const missingInformation: string[] = [];
  if (!record.owner?.id) missingInformation.push("owner");
  if (!record.type) missingInformation.push("asset category");
  if (!record.assetType) missingInformation.push("asset type");
  if (!record.description) missingInformation.push("description");

  return {
    kind: "assets",
    toolName: "add_asset_record",
    summary: `Add an asset for ${context.resolvedClientName ?? "the selected client"}`,
    description: "Create a new asset record on the selected client profile.",
    payload: { kind: "assets", record },
    inputsPreview: {
      section: "Assets",
      owner: record.owner?.name ?? null,
      type: record.type,
      assetType: record.assetType,
      description: record.description,
      currentValue: record.currentValue,
      cost: record.cost,
      incomeAmount: record.incomeAmount,
      incomeFrequency: record.incomeFrequency?.value ?? null,
      acquisitionDate: record.acquisitionDate,
      joint: record.joint ? "Yes" : "No",
    },
    missingInformation,
    editorCard: {
      kind: "collection_form",
      title: "New Asset",
      toolName: "add_asset_record",
      fields: [
        {
          key: "type",
          label: "Category",
          input: "select",
          value: record.type ?? "",
          options: ASSET_CATEGORY_OPTIONS.map((option) => ({ label: option, value: option })),
        },
        {
          key: "assetType",
          label: "Type",
          input: "select",
          value: record.assetType ?? "",
          options: Object.values(ASSET_TYPE_OPTIONS_BY_CATEGORY)
            .flat()
            .map((option) => ({ label: option, value: option })),
        },
        {
          key: "description",
          label: "Description",
          input: "text",
          value: record.description ?? "",
        },
        {
          key: "currentValue",
          label: "Current Value",
          input: "text",
          value: record.currentValue ?? "",
        },
      ],
    },
  };
}

function extractLiabilityIntent(message: string, context: LiveContext): CollectionIntentResult {
  const owner = resolveCollectionOwner(message, context.profile);
  const loanType =
    extractAfterLabel(message, [/\bloan type\s*(?:to|is|=|:)?\s*([A-Za-z ]+)/i, /\bliability type\s*(?:to|is|=|:)?\s*([A-Za-z ]+)/i]) ??
    extractMatchingOption(message, LIABILITY_TYPE_OPTIONS);
  const bankName = extractAfterLabel(message, [/\bbank\s*(?:to|is|=|:)?\s*([A-Za-z0-9'&().,/ -]+)/i]);
  const securityAsset = (context.profile?.assets ?? []).find(
    (asset) => asset.id && (message.toLowerCase().includes((asset.description ?? "").toLowerCase()) || message.toLowerCase().includes((asset.assetType ?? "").toLowerCase())),
  );
  const record: ClientLiabilityRecord = {
    loanType: loanType?.trim() || null,
    bankName: bankName?.trim() || null,
    outstandingBalance: extractMoneyValue(message, ["balance", "outstanding balance"]),
    repaymentAmount: extractMoneyValue(message, ["repayment", "repayment amount"]),
    accountNumber: extractAfterLabel(message, [/\baccount(?: number| no\.?)?\s*(?:to|is|=|:)?\s*([A-Za-z0-9-]+)/i]),
    interestRate: extractPercentValue(message, ["interest rate"]),
    repaymentFrequency: extractFrequencyOption(message) ? { type: extractFrequencyOption(message), value: extractFrequencyOption(message) } : null,
    securityAssets: securityAsset?.id
      ? { id: securityAsset.id, type: securityAsset.assetType ?? "Asset", description: securityAsset.description ?? null }
      : null,
    joint: /\bjoint\b/.test(message.toLowerCase()),
    owner: owner ? { id: owner.id, name: owner.name } : null,
  };

  const missingInformation: string[] = [];
  if (!record.owner?.id) missingInformation.push("owner");
  if (!record.loanType) missingInformation.push("liability type");

  return {
    kind: "liabilities",
    toolName: "add_liability_record",
    summary: `Add a liability for ${context.resolvedClientName ?? "the selected client"}`,
    description: "Create a new liability record on the selected client profile.",
    payload: { kind: "liabilities", record },
    inputsPreview: {
      section: "Liabilities",
      owner: record.owner?.name ?? null,
      loanType: record.loanType,
      bankName: record.bankName,
      outstandingBalance: record.outstandingBalance,
      repaymentAmount: record.repaymentAmount,
      interestRate: record.interestRate,
      repaymentFrequency: record.repaymentFrequency?.value ?? null,
      securityAsset: record.securityAssets?.description ?? null,
      joint: record.joint ? "Yes" : "No",
    },
    missingInformation,
    editorCard: {
      kind: "collection_form",
      title: "New Liability",
      toolName: "add_liability_record",
      fields: [
        {
          key: "loanType",
          label: "Type",
          input: "select",
          value: record.loanType ?? "",
          options: toCardOptions(LIABILITY_TYPE_OPTIONS),
        },
        {
          key: "bankName",
          label: "Bank",
          input: "text",
          value: record.bankName ?? "",
        },
        {
          key: "outstandingBalance",
          label: "Balance",
          input: "text",
          value: record.outstandingBalance ?? "",
        },
        {
          key: "repaymentAmount",
          label: "Repayment",
          input: "text",
          value: record.repaymentAmount ?? "",
        },
        {
          key: "interestRate",
          label: "Interest Rate",
          input: "text",
          value: record.interestRate ?? "",
        },
        {
          key: "repaymentFrequency",
          label: "Repayment Frequency",
          input: "select",
          value: record.repaymentFrequency?.value ?? "",
          options: toCardOptions(FREQUENCY_OPTIONS),
        },
        {
          key: "securityAssetId",
          label: "Security Asset",
          input: "select",
          value: record.securityAssets?.id ?? "",
          options: (context.profile?.assets ?? [])
            .filter((asset) => asset.id)
            .map((asset) => ({
              label: asset.description ?? asset.assetType ?? asset.type ?? "Asset",
              value: asset.id!,
            })),
        },
      ],
    },
  };
}

function extractIncomeIntent(message: string, context: LiveContext): CollectionIntentResult {
  const owner = resolveCollectionOwner(message, context.profile);
  const incomeType =
    extractAfterLabel(message, [/\bincome type\s*(?:to|is|=|:)?\s*([A-Za-z ]+)/i, /\btype\s*(?:to|is|=|:)?\s*([A-Za-z ]+)/i]) ??
    extractMatchingOption(message, INCOME_TYPE_OPTIONS);
  const record: ClientIncomeRecord = {
    type: incomeType?.trim() || null,
    description: extractAfterLabel(message, [/\bdescription\s*(?:to|is|=|:)?\s*([A-Za-z0-9'&().,/ -]+)/i]) ?? null,
    amount: extractMoneyValue(message, ["amount", "income", "salary"]),
    taxType:
      extractAfterLabel(message, [/\btax type\s*(?:to|is|=|:)?\s*([A-Za-z -]+)/i]) ??
      extractMatchingOption(message, ["Taxable", "Non-taxable"]),
    frequency: extractFrequencyOption(message) ? { type: extractFrequencyOption(message), value: extractFrequencyOption(message) } : null,
    pension: { id: "", type: "" },
    joint: /\bjoint\b/.test(message.toLowerCase()),
    owner: owner ? { id: owner.id, name: owner.name } : null,
  };

  const missingInformation: string[] = [];
  if (!record.owner?.id) missingInformation.push("owner");
  if (!record.type) missingInformation.push("income type");

  return {
    kind: "income",
    toolName: "add_income_record",
    summary: `Add an income record for ${context.resolvedClientName ?? "the selected client"}`,
    description: "Create a new income record on the selected client profile.",
    payload: { kind: "income", record },
    inputsPreview: {
      section: "Income",
      owner: record.owner?.name ?? null,
      type: record.type,
      description: record.description,
      amount: record.amount,
      taxType: record.taxType,
      frequency: record.frequency?.value ?? null,
      joint: record.joint ? "Yes" : "No",
    },
    missingInformation,
    editorCard: {
      kind: "collection_form",
      title: "New Income Record",
      toolName: "add_income_record",
      fields: [
        {
          key: "type",
          label: "Type",
          input: "select",
          value: record.type ?? "",
          options: toCardOptions(INCOME_TYPE_OPTIONS),
        },
        {
          key: "description",
          label: "Description",
          input: "text",
          value: record.description ?? "",
        },
        {
          key: "amount",
          label: "Amount",
          input: "text",
          value: record.amount ?? "",
        },
        {
          key: "taxType",
          label: "Tax Type",
          input: "select",
          value: record.taxType ?? "",
          options: toCardOptions(["Taxable", "Non-taxable"]),
        },
        {
          key: "frequency",
          label: "Frequency",
          input: "select",
          value: record.frequency?.value ?? "",
          options: toCardOptions(FREQUENCY_OPTIONS),
        },
      ],
    },
  };
}

function extractExpenseIntent(message: string, context: LiveContext): CollectionIntentResult {
  const owner = resolveCollectionOwner(message, context.profile);
  const expenseType =
    extractAfterLabel(message, [/\bexpense type\s*(?:to|is|=|:)?\s*([A-Za-z ]+)/i, /\btype\s*(?:to|is|=|:)?\s*([A-Za-z ]+)/i]) ??
    extractMatchingOption(message, EXPENSE_TYPE_OPTIONS);
  const linkedLiability = (context.profile?.liabilities ?? []).find(
    (item) => item.id && (message.toLowerCase().includes((item.loanType ?? "").toLowerCase()) || message.toLowerCase().includes((item.bankName ?? "").toLowerCase())),
  );
  const record: ClientExpenseRecord = {
    type: expenseType?.trim() || null,
    description: extractAfterLabel(message, [/\bdescription\s*(?:to|is|=|:)?\s*([A-Za-z0-9'&().,/ -]+)/i]) ?? null,
    amount: extractMoneyValue(message, ["amount", "expense"]),
    indexation: extractPercentValue(message, ["indexation"]),
    frequency: extractFrequencyOption(message) ? { type: extractFrequencyOption(message), value: extractFrequencyOption(message) } : null,
    liability: linkedLiability?.id ? { id: linkedLiability.id, type: linkedLiability.loanType ?? "Liability" } : { id: "", type: "" },
    joint: /\bjoint\b/.test(message.toLowerCase()),
    owner: owner ? { id: owner.id, name: owner.name } : null,
  };

  const missingInformation: string[] = [];
  if (!record.owner?.id) missingInformation.push("owner");
  if (!record.type) missingInformation.push("expense type");

  return {
    kind: "expenses",
    toolName: "add_expense_record",
    summary: `Add an expense for ${context.resolvedClientName ?? "the selected client"}`,
    description: "Create a new expense record on the selected client profile.",
    payload: { kind: "expenses", record },
    inputsPreview: {
      section: "Expenses",
      owner: record.owner?.name ?? null,
      type: record.type,
      description: record.description,
      amount: record.amount,
      frequency: record.frequency?.value ?? null,
      indexation: record.indexation,
      linkedLiability: record.liability?.type ?? null,
      joint: record.joint ? "Yes" : "No",
    },
    missingInformation,
    editorCard: {
      kind: "collection_form",
      title: "New Expense",
      toolName: "add_expense_record",
      fields: [
        {
          key: "type",
          label: "Type",
          input: "select",
          value: record.type ?? "",
          options: toCardOptions(EXPENSE_TYPE_OPTIONS),
        },
        {
          key: "description",
          label: "Description",
          input: "text",
          value: record.description ?? "",
        },
        {
          key: "amount",
          label: "Amount",
          input: "text",
          value: record.amount ?? "",
        },
        {
          key: "indexation",
          label: "Indexation",
          input: "text",
          value: record.indexation ?? "",
        },
        {
          key: "frequency",
          label: "Frequency",
          input: "select",
          value: record.frequency?.value ?? "",
          options: toCardOptions(FREQUENCY_OPTIONS),
        },
        {
          key: "liabilityId",
          label: "Linked Liability",
          input: "select",
          value: record.liability?.id ?? "",
          options: (context.profile?.liabilities ?? [])
            .filter((item) => item.id)
            .map((item) => ({
              label: item.loanType ?? item.bankName ?? "Liability",
              value: item.id!,
            })),
        },
      ],
    },
  };
}

function extractSuperIntent(message: string, context: LiveContext): CollectionIntentResult {
  const owner = resolveCollectionOwner(message, context.profile);
  const superType =
    extractAfterLabel(message, [/\bsuper(?:annuation)? type\s*(?:to|is|=|:)?\s*([A-Za-z ]+)/i, /\btype\s*(?:to|is|=|:)?\s*([A-Za-z ]+)/i]) ??
    extractMatchingOption(message, SUPER_TYPE_OPTIONS);
  const record: ClientSuperannuationRecord = {
    type: superType?.trim() || null,
    superFund: extractAfterLabel(message, [/\bfund\s*(?:to|is|=|:)?\s*([A-Za-z0-9'&().,/ -]+)/i]) ?? null,
    balance: extractMoneyValue(message, ["balance"]),
    contributionAmount: extractMoneyValue(message, ["contribution", "contribution amount"]),
    accountNumber: extractAfterLabel(message, [/\baccount(?: number| no\.?)?\s*(?:to|is|=|:)?\s*([A-Za-z0-9-]+)/i]) ?? null,
    frequency: extractFrequencyOption(message) ? { type: extractFrequencyOption(message), value: extractFrequencyOption(message) } : null,
    joint: /\bjoint\b/.test(message.toLowerCase()),
    owner: owner ? { id: owner.id, name: owner.name } : null,
  };

  const missingInformation: string[] = [];
  if (!record.owner?.id) missingInformation.push("owner");
  if (!record.type) missingInformation.push("superannuation type");

  return {
    kind: "superannuation",
    toolName: "add_superannuation_record",
    summary: `Add a superannuation record for ${context.resolvedClientName ?? "the selected client"}`,
    description: "Create a new superannuation record on the selected client profile.",
    payload: { kind: "superannuation", record },
    inputsPreview: {
      section: "Superannuation",
      owner: record.owner?.name ?? null,
      type: record.type,
      superFund: record.superFund,
      balance: record.balance,
      contributionAmount: record.contributionAmount,
      frequency: record.frequency?.value ?? null,
      joint: record.joint ? "Yes" : "No",
    },
    missingInformation,
    editorCard: {
      kind: "collection_form",
      title: "New Superannuation Record",
      toolName: "add_superannuation_record",
      fields: [
        {
          key: "type",
          label: "Type",
          input: "select",
          value: record.type ?? "",
          options: toCardOptions(SUPER_TYPE_OPTIONS),
        },
        {
          key: "superFund",
          label: "Fund",
          input: "text",
          value: record.superFund ?? "",
        },
        {
          key: "balance",
          label: "Balance",
          input: "text",
          value: record.balance ?? "",
        },
        {
          key: "contributionAmount",
          label: "Contribution",
          input: "text",
          value: record.contributionAmount ?? "",
        },
        {
          key: "frequency",
          label: "Frequency",
          input: "select",
          value: record.frequency?.value ?? "",
          options: toCardOptions(FREQUENCY_OPTIONS),
        },
        {
          key: "accountNumber",
          label: "Account Number",
          input: "text",
          value: record.accountNumber ?? "",
        },
      ],
    },
  };
}

function extractRetirementIncomeIntent(message: string, context: LiveContext): CollectionIntentResult {
  const owner = resolveCollectionOwner(message, context.profile);
  const pensionType =
    extractAfterLabel(message, [/\b(?:retirement income|pension) type\s*(?:to|is|=|:)?\s*([A-Za-z ]+)/i, /\btype\s*(?:to|is|=|:)?\s*([A-Za-z ]+)/i]) ??
    extractMatchingOption(message, PENSION_TYPE_OPTIONS);
  const record: ClientPensionRecord = {
    type: pensionType?.trim() || null,
    superFund: extractAfterLabel(message, [/\bfund\s*(?:to|is|=|:)?\s*([A-Za-z0-9'&().,/ -]+)/i]) ?? null,
    balance: extractMoneyValue(message, ["balance"]),
    payment: extractMoneyValue(message, ["payment"]),
    accountNumber: extractAfterLabel(message, [/\baccount(?: number| no\.?)?\s*(?:to|is|=|:)?\s*([A-Za-z0-9-]+)/i]) ?? null,
    annualReturn: extractPercentValue(message, ["annual return", "return"]),
    frequency: extractFrequencyOption(message) ? { type: extractFrequencyOption(message), value: extractFrequencyOption(message) } : null,
    owner: owner ? { id: owner.id, name: owner.name } : null,
  };

  const missingInformation: string[] = [];
  if (!record.owner?.id) missingInformation.push("owner");
  if (!record.type) missingInformation.push("retirement income type");

  return {
    kind: "retirement-income",
    toolName: "add_retirement_income_record",
    summary: `Add a retirement income record for ${context.resolvedClientName ?? "the selected client"}`,
    description: "Create a new retirement income record on the selected client profile.",
    payload: { kind: "retirement-income", record },
    inputsPreview: {
      section: "Retirement Income",
      owner: record.owner?.name ?? null,
      type: record.type,
      superFund: record.superFund,
      balance: record.balance,
      payment: record.payment,
      annualReturn: record.annualReturn,
      frequency: record.frequency?.value ?? null,
    },
    missingInformation,
    editorCard: {
      kind: "collection_form",
      title: "New Retirement Income Record",
      toolName: "add_retirement_income_record",
      fields: [
        {
          key: "type",
          label: "Type",
          input: "select",
          value: record.type ?? "",
          options: toCardOptions(PENSION_TYPE_OPTIONS),
        },
        {
          key: "superFund",
          label: "Fund",
          input: "text",
          value: record.superFund ?? "",
        },
        {
          key: "balance",
          label: "Balance",
          input: "text",
          value: record.balance ?? "",
        },
        {
          key: "payment",
          label: "Payment",
          input: "text",
          value: record.payment ?? "",
        },
        {
          key: "annualReturn",
          label: "Annual Return",
          input: "text",
          value: record.annualReturn ?? "",
        },
        {
          key: "frequency",
          label: "Frequency",
          input: "select",
          value: record.frequency?.value ?? "",
          options: toCardOptions(FREQUENCY_OPTIONS),
        },
        {
          key: "accountNumber",
          label: "Account Number",
          input: "text",
          value: record.accountNumber ?? "",
        },
      ],
    },
  };
}

function extractInsuranceIntent(message: string, context: LiveContext): CollectionIntentResult {
  const owner = resolveCollectionOwner(message, context.profile);
  const matchedSuper = (context.profile?.superannuation ?? []).find(
    (item) => item.id && (message.toLowerCase().includes((item.superFund ?? "").toLowerCase()) || message.toLowerCase().includes((item.type ?? "").toLowerCase())),
  );
  const coverRequired =
    extractAfterLabel(message, [/\bcover\s*(?:to|is|=|:)?\s*([A-Za-z ]+)/i, /\binsurance type\s*(?:to|is|=|:)?\s*([A-Za-z ]+)/i]) ??
    extractMatchingOption(message, INSURANCE_COVER_OPTIONS);
  const record: ClientInsuranceRecord = {
    coverRequired: coverRequired?.trim() || null,
    insurer: extractAfterLabel(message, [/\binsurer\s*(?:to|is|=|:)?\s*([A-Za-z0-9'&().,/ -]+)/i]) ?? null,
    sumInsured: extractMoneyValue(message, ["sum insured", "insured amount", "cover amount"]),
    premiumAmount: extractMoneyValue(message, ["premium", "premium amount"]),
    frequency: extractFrequencyOption(message) ? { type: extractFrequencyOption(message), value: extractFrequencyOption(message) } : null,
    status:
      extractAfterLabel(message, [/\bstatus\s*(?:to|is|=|:)?\s*([A-Za-z ]+)/i]) ??
      extractMatchingOption(message, INSURANCE_STATUS_OPTIONS),
    superFund: matchedSuper?.id ? { id: matchedSuper.id, type: matchedSuper.superFund ?? matchedSuper.type ?? "Super" } : null,
    joint: /\bjoint\b/.test(message.toLowerCase()),
    owner: owner ? { id: owner.id, name: owner.name } : null,
  };

  const missingInformation: string[] = [];
  if (!record.owner?.id) missingInformation.push("owner");
  if (!record.coverRequired) missingInformation.push("cover");

  return {
    kind: "insurance",
    toolName: "add_insurance_record",
    summary: `Add an insurance record for ${context.resolvedClientName ?? "the selected client"}`,
    description: "Create a new insurance record on the selected client profile.",
    payload: { kind: "insurance", record },
    inputsPreview: {
      section: "Insurance",
      owner: record.owner?.name ?? null,
      coverRequired: record.coverRequired,
      insurer: record.insurer,
      sumInsured: record.sumInsured,
      premiumAmount: record.premiumAmount,
      status: record.status,
      frequency: record.frequency?.value ?? null,
      superFund: record.superFund?.type ?? null,
      joint: record.joint ? "Yes" : "No",
    },
    missingInformation,
    editorCard: {
      kind: "collection_form",
      title: "New Insurance Record",
      toolName: "add_insurance_record",
      fields: [
        {
          key: "coverRequired",
          label: "Cover",
          input: "select",
          value: record.coverRequired ?? "",
          options: toCardOptions(INSURANCE_COVER_OPTIONS),
        },
        {
          key: "insurer",
          label: "Insurer",
          input: "text",
          value: record.insurer ?? "",
        },
        {
          key: "sumInsured",
          label: "Sum Insured",
          input: "text",
          value: record.sumInsured ?? "",
        },
        {
          key: "premiumAmount",
          label: "Premium Amount",
          input: "text",
          value: record.premiumAmount ?? "",
        },
        {
          key: "status",
          label: "Status",
          input: "select",
          value: record.status ?? "",
          options: toCardOptions(INSURANCE_STATUS_OPTIONS),
        },
        {
          key: "frequency",
          label: "Frequency",
          input: "select",
          value: record.frequency?.value ?? "",
          options: toCardOptions(FREQUENCY_OPTIONS),
        },
        {
          key: "superFundId",
          label: "Super Fund",
          input: "select",
          value: record.superFund?.id ?? "",
          options: (context.profile?.superannuation ?? [])
            .filter((item) => item.id)
            .map((item) => ({
              label: item.superFund ?? item.type ?? "Super Fund",
              value: item.id!,
            })),
        },
      ],
    },
  };
}

function extractEntityIntent(message: string, context: LiveContext): CollectionIntentResult {
  const owner = resolveCollectionOwner(message, context.profile);
  const entityType =
    extractAfterLabel(message, [/\bentity type\s*(?:to|is|=|:)?\s*([A-Za-z ]+)/i, /\btype\s*(?:to|is|=|:)?\s*([A-Za-z ]+)/i]) ??
    extractMatchingOption(message, ENTITY_TYPE_OPTIONS);
  const name =
    extractAfterLabel(message, [/\bname\s*(?:to|is|=|:)?\s*([A-Za-z0-9'&().,/ -]+)/i, /\bentity\s+(?:called|named)\s+([A-Za-z0-9'&().,/ -]+)/i]) ??
    null;
  const record: ClientEntityRecord = {
    entitiesId: null,
    name: name?.trim() || null,
    type: entityType?.trim() || null,
    owner: owner ? { id: owner.id, name: owner.name } : null,
  };

  const missingInformation: string[] = [];
  if (!record.owner?.id) missingInformation.push("owner");
  if (!record.name) missingInformation.push("entity name");
  if (!record.type) missingInformation.push("entity type");

  return {
    kind: "entities",
    toolName: "add_entity_record",
    summary: `Add an entity for ${context.resolvedClientName ?? "the selected client"}`,
    description: "Create a new entity linked to the selected client profile.",
    payload: { kind: "entities", record },
    inputsPreview: {
      section: "Entities",
      owner: record.owner?.name ?? null,
      name: record.name,
      type: record.type,
    },
    missingInformation,
    editorCard: {
      kind: "collection_form",
      title: "New Entity",
      toolName: "add_entity_record",
      fields: [
        {
          key: "ownerId",
          label: "Owner",
          input: "select",
          value: record.owner?.id ?? "",
          options: getOwnerOptions(context.profile),
        },
        {
          key: "name",
          label: "Name",
          input: "text",
          value: record.name ?? "",
        },
        {
          key: "type",
          label: "Type",
          input: "select",
          value: record.type ?? "",
          options: toCardOptions(ENTITY_TYPE_OPTIONS),
        },
      ],
    },
  };
}

function extractDependantIntent(message: string, context: LiveContext): CollectionIntentResult {
  const owner = resolveCollectionOwner(message, context.profile);
  const dependantType =
    extractAfterLabel(message, [/\bdependant type\s*(?:to|is|=|:)?\s*([A-Za-z ]+)/i, /\btype\s*(?:to|is|=|:)?\s*([A-Za-z ]+)/i]) ??
    extractMatchingOption(message, DEPENDANT_TYPE_OPTIONS);
  const name =
    extractAfterLabel(message, [/\bname\s*(?:to|is|=|:)?\s*([A-Za-z0-9'&().,/ -]+)/i, /\bdependant\s+(?:called|named)\s+([A-Za-z0-9'&().,/ -]+)/i]) ??
    null;
  const birthday = normalizeDateToIso(extractAfterLabel(message, [/\b(?:date of birth|birthday|dob)\s*(?:to|is|=|:)?\s*([A-Za-z0-9/\s-]+)/i]) ?? "");
  const record: ClientDependantRecord = {
    name: name?.trim() || null,
    type: dependantType?.trim() || "Child",
    birthday: birthday ?? null,
    owner: owner ? { id: owner.id, name: owner.name } : null,
  };

  const missingInformation: string[] = [];
  if (!record.owner?.id) missingInformation.push("owner");
  if (!record.name) missingInformation.push("dependant name");

  return {
    kind: "dependants",
    toolName: "add_dependant_record",
    summary: `Add a dependant for ${context.resolvedClientName ?? "the selected client"}`,
    description: "Create a new dependant linked to the selected client profile.",
    payload: { kind: "dependants", record },
    inputsPreview: {
      section: "Dependants",
      owner: record.owner?.name ?? null,
      name: record.name,
      type: record.type,
      birthday: record.birthday,
    },
    missingInformation,
    editorCard: {
      kind: "collection_form",
      title: "New Dependant",
      toolName: "add_dependant_record",
      fields: [
        {
          key: "ownerId",
          label: "Owner",
          input: "select",
          value: record.owner?.id ?? "",
          options: getOwnerOptions(context.profile),
        },
        {
          key: "name",
          label: "Name",
          input: "text",
          value: record.name ?? "",
        },
        {
          key: "type",
          label: "Type",
          input: "select",
          value: record.type ?? "Child",
          options: toCardOptions(DEPENDANT_TYPE_OPTIONS),
        },
        {
          key: "birthday",
          label: "Birthday",
          input: "text",
          value: record.birthday ?? "",
        },
      ],
    },
  };
}

function extractCollectionIntent(message: string, context: LiveContext): CollectionIntentResult | null {
  const lower = message.toLowerCase();
  const isCreate = lower.includes("add") || lower.includes("create") || lower.includes("new ");
  if (!isCreate) return null;

  if (lower.includes("dependant") || lower.includes("dependent")) return extractDependantIntent(message, context);
  if (lower.includes("entit")) return extractEntityIntent(message, context);
  if (lower.includes("asset")) {
    const batchRows = parseBatchAssetRows(message, context);
    if (batchRows) {
      return {
        kind: "assets",
        toolName: "add_asset_record",
        summary: `Add ${batchRows.length} assets for ${context.resolvedClientName ?? "the selected client"}`,
        description: "Create multiple asset records on the selected client profile.",
        payload: {
          kind: "assets",
          records: batchRows.map((row) => ({
            type: row.values.type || null,
            assetType: row.values.assetType || null,
            description: row.values.description || null,
            currentValue: row.values.currentValue || null,
            cost: null,
            incomeAmount: null,
            incomeFrequency: { type: "", value: "" },
            acquisitionDate: null,
            joint: false,
            owner:
              row.values.ownerId && getOwnerOptions(context.profile).find((option) => option.value === row.values.ownerId)
                ? {
                    id: row.values.ownerId,
                    name: getOwnerOptions(context.profile).find((option) => option.value === row.values.ownerId)!.label,
                  }
                : null,
          })),
        },
        inputsPreview: {
          section: "Assets",
          recordCount: batchRows.length,
        },
        missingInformation: [],
        editorCard: {
          kind: "collection_table" as const,
          title: "New Asset Rows",
          toolName: "add_asset_record" as const,
          columns: [
            { key: "ownerId", label: "Owner", input: "select" as const, options: getOwnerOptions(context.profile) },
            { key: "type", label: "Category", input: "select" as const, options: toCardOptions(ASSET_CATEGORY_OPTIONS) },
            {
              key: "assetType",
              label: "Type",
              input: "select" as const,
              options: Object.values(ASSET_TYPE_OPTIONS_BY_CATEGORY)
                .flat()
                .map((option) => ({ label: option, value: option })),
            },
            { key: "description", label: "Description", input: "text" as const },
            { key: "currentValue", label: "Current Value", input: "text" as const },
          ],
          rows: batchRows,
        },
      };
    }
    return extractAssetIntent(message, context);
  }
  if (lower.includes("liability") || lower.includes("loan") || lower.includes("debt")) return extractLiabilityIntent(message, context);
  if (lower.includes("income") && !lower.includes("retirement income")) return extractIncomeIntent(message, context);
  if (lower.includes("expense")) return extractExpenseIntent(message, context);
  if (lower.includes("insurance") || lower.includes("cover")) return extractInsuranceIntent(message, context);
  if (lower.includes("super") || lower.includes("superannuation")) return extractSuperIntent(message, context);
  if (lower.includes("retirement income") || lower.includes("pension")) return extractRetirementIncomeIntent(message, context);

  return null;
}

function buildIncomeEditorCard(record: ClientIncomeRecord): FinleyEditorCard {
  return {
    kind: "collection_form",
    title: "Income Record",
    toolName: "update_income_record",
    fields: [
      {
        key: "type",
        label: "Type",
        input: "select",
        value: record.type ?? "",
        options: toCardOptions(INCOME_TYPE_OPTIONS),
      },
      {
        key: "description",
        label: "Description",
        input: "text",
        value: record.description ?? "",
      },
      {
        key: "amount",
        label: "Amount",
        input: "text",
        value: record.amount ?? "",
      },
      {
        key: "taxType",
        label: "Tax Type",
        input: "select",
        value: record.taxType ?? "",
        options: toCardOptions(["Taxable", "Non-taxable"]),
      },
      {
        key: "frequency",
        label: "Frequency",
        input: "select",
        value: record.frequency?.value ?? "",
        options: toCardOptions(FREQUENCY_OPTIONS),
      },
    ],
  };
}

function buildAssetEditorCard(record: ClientAssetRecord): FinleyEditorCard {
  return {
    kind: "collection_form",
    title: "Asset Record",
    toolName: "update_asset_record",
    fields: [
      {
        key: "type",
        label: "Category",
        input: "select",
        value: record.type ?? "",
        options: toCardOptions(ASSET_CATEGORY_OPTIONS),
      },
      {
        key: "assetType",
        label: "Type",
        input: "select",
        value: record.assetType ?? "",
        options: Object.values(ASSET_TYPE_OPTIONS_BY_CATEGORY)
          .flat()
          .map((option) => ({ label: option, value: option })),
      },
      {
        key: "description",
        label: "Description",
        input: "text",
        value: record.description ?? "",
      },
      {
        key: "currentValue",
        label: "Current Value",
        input: "text",
        value: record.currentValue ?? "",
      },
      {
        key: "cost",
        label: "Cost",
        input: "text",
        value: record.cost ?? "",
      },
      {
        key: "incomeAmount",
        label: "Income Amount",
        input: "text",
        value: record.incomeAmount ?? "",
      },
      {
        key: "incomeFrequency",
        label: "Income Frequency",
        input: "select",
        value: record.incomeFrequency?.value ?? "",
        options: toCardOptions(FREQUENCY_OPTIONS),
      },
      {
        key: "acquisitionDate",
        label: "Acquisition Date",
        input: "text",
        value: record.acquisitionDate ?? "",
      },
    ],
  };
}

function buildExpenseEditorCard(record: ClientExpenseRecord, context: LiveContext): FinleyEditorCard {
  return {
    kind: "collection_form",
    title: "Expense Record",
    toolName: "update_expense_record",
    fields: [
      { key: "type", label: "Type", input: "select", value: record.type ?? "", options: toCardOptions(EXPENSE_TYPE_OPTIONS) },
      { key: "description", label: "Description", input: "text", value: record.description ?? "" },
      { key: "amount", label: "Amount", input: "text", value: record.amount ?? "" },
      { key: "indexation", label: "Indexation", input: "text", value: record.indexation ?? "" },
      { key: "frequency", label: "Frequency", input: "select", value: record.frequency?.value ?? "", options: toCardOptions(FREQUENCY_OPTIONS) },
      {
        key: "liabilityId",
        label: "Linked Liability",
        input: "select",
        value: record.liability?.id ?? "",
        options: (context.profile?.liabilities ?? [])
          .filter((item) => item.id)
          .map((item) => ({ label: item.loanType ?? item.bankName ?? "Liability", value: item.id! })),
      },
    ],
  };
}

function buildLiabilityEditorCard(record: ClientLiabilityRecord, context: LiveContext): FinleyEditorCard {
  return {
    kind: "collection_form",
    title: "Liability Record",
    toolName: "update_liability_record",
    fields: [
      { key: "loanType", label: "Type", input: "select", value: record.loanType ?? "", options: toCardOptions(LIABILITY_TYPE_OPTIONS) },
      { key: "bankName", label: "Bank", input: "text", value: record.bankName ?? "" },
      { key: "outstandingBalance", label: "Balance", input: "text", value: record.outstandingBalance ?? "" },
      { key: "repaymentAmount", label: "Repayment", input: "text", value: record.repaymentAmount ?? "" },
      { key: "interestRate", label: "Interest Rate", input: "text", value: record.interestRate ?? "" },
      { key: "repaymentFrequency", label: "Repayment Frequency", input: "select", value: record.repaymentFrequency?.value ?? "", options: toCardOptions(FREQUENCY_OPTIONS) },
      {
        key: "securityAssetId",
        label: "Security Asset",
        input: "select",
        value: record.securityAssets?.id ?? "",
        options: (context.profile?.assets ?? [])
          .filter((asset) => asset.id)
          .map((asset) => ({ label: asset.description ?? asset.assetType ?? asset.type ?? "Asset", value: asset.id! })),
      },
    ],
  };
}

function buildSuperEditorCard(record: ClientSuperannuationRecord): FinleyEditorCard {
  return {
    kind: "collection_form",
    title: "Superannuation Record",
    toolName: "update_superannuation_record",
    fields: [
      { key: "type", label: "Type", input: "select", value: record.type ?? "", options: toCardOptions(SUPER_TYPE_OPTIONS) },
      { key: "superFund", label: "Fund", input: "text", value: record.superFund ?? "" },
      { key: "balance", label: "Balance", input: "text", value: record.balance ?? "" },
      { key: "contributionAmount", label: "Contribution", input: "text", value: record.contributionAmount ?? "" },
      { key: "frequency", label: "Frequency", input: "select", value: record.frequency?.value ?? "", options: toCardOptions(FREQUENCY_OPTIONS) },
      { key: "accountNumber", label: "Account Number", input: "text", value: record.accountNumber ?? "" },
    ],
  };
}

function buildRetirementIncomeEditorCard(record: ClientPensionRecord): FinleyEditorCard {
  return {
    kind: "collection_form",
    title: "Retirement Income Record",
    toolName: "update_retirement_income_record",
    fields: [
      { key: "type", label: "Type", input: "select", value: record.type ?? "", options: toCardOptions(PENSION_TYPE_OPTIONS) },
      { key: "superFund", label: "Fund", input: "text", value: record.superFund ?? "" },
      { key: "balance", label: "Balance", input: "text", value: record.balance ?? "" },
      { key: "payment", label: "Payment", input: "text", value: record.payment ?? "" },
      { key: "annualReturn", label: "Annual Return", input: "text", value: record.annualReturn ?? "" },
      { key: "frequency", label: "Frequency", input: "select", value: record.frequency?.value ?? "", options: toCardOptions(FREQUENCY_OPTIONS) },
      { key: "accountNumber", label: "Account Number", input: "text", value: record.accountNumber ?? "" },
    ],
  };
}

function buildInsuranceEditorCard(record: ClientInsuranceRecord, context: LiveContext): FinleyEditorCard {
  return {
    kind: "collection_form",
    title: "Insurance Record",
    toolName: "update_insurance_record",
    fields: [
      { key: "coverRequired", label: "Cover", input: "select", value: record.coverRequired ?? "", options: toCardOptions(INSURANCE_COVER_OPTIONS) },
      { key: "insurer", label: "Insurer", input: "text", value: record.insurer ?? "" },
      { key: "sumInsured", label: "Sum Insured", input: "text", value: record.sumInsured ?? "" },
      { key: "premiumAmount", label: "Premium Amount", input: "text", value: record.premiumAmount ?? "" },
      { key: "status", label: "Status", input: "select", value: record.status ?? "", options: toCardOptions(INSURANCE_STATUS_OPTIONS) },
      { key: "frequency", label: "Frequency", input: "select", value: record.frequency?.value ?? "", options: toCardOptions(FREQUENCY_OPTIONS) },
      {
        key: "superFundId",
        label: "Super Fund",
        input: "select",
        value: record.superFund?.id ?? "",
        options: (context.profile?.superannuation ?? [])
          .filter((item) => item.id)
          .map((item) => ({ label: item.superFund ?? item.type ?? "Super Fund", value: item.id! })),
      },
    ],
  };
}

function buildEntityEditorCard(record: ClientEntityRecord, context: LiveContext): FinleyEditorCard {
  return {
    kind: "collection_form",
    title: "Entity Record",
    toolName: "update_entity_record",
    fields: [
      {
        key: "ownerId",
        label: "Owner",
        input: "select",
        value: record.owner?.id ?? "",
        options: getOwnerOptions(context.profile),
      },
      {
        key: "name",
        label: "Name",
        input: "text",
        value: record.name ?? "",
      },
      {
        key: "type",
        label: "Type",
        input: "select",
        value: record.type ?? "",
        options: toCardOptions(ENTITY_TYPE_OPTIONS),
      },
    ],
  };
}

function buildDependantEditorCard(record: ClientDependantRecord, context: LiveContext): FinleyEditorCard {
  return {
    kind: "collection_form",
    title: "Dependant Record",
    toolName: "update_dependant_record",
    fields: [
      {
        key: "ownerId",
        label: "Owner",
        input: "select",
        value: record.owner?.id ?? "",
        options: getOwnerOptions(context.profile),
      },
      {
        key: "name",
        label: "Name",
        input: "text",
        value: record.name ?? "",
      },
      {
        key: "type",
        label: "Type",
        input: "select",
        value: record.type ?? "Child",
        options: toCardOptions(DEPENDANT_TYPE_OPTIONS),
      },
      {
        key: "birthday",
        label: "Birthday",
        input: "text",
        value: record.birthday ?? "",
      },
    ],
  };
}

function collectionKindLabel(kind: string) {
  switch (kind) {
    case "assets":
      return "asset";
    case "liabilities":
      return "liability";
    case "income":
      return "income";
    case "expenses":
      return "expense";
    case "superannuation":
      return "superannuation";
    case "retirement-income":
      return "retirement income";
    case "insurance":
      return "insurance";
    case "entities":
      return "entity";
    case "dependants":
      return "dependant";
    default:
      return "record";
  }
}

function buildCollectionUpdateIntentFromRecord(
  kind: "assets" | "liabilities" | "income" | "expenses" | "superannuation" | "retirement-income" | "insurance" | "entities" | "dependants",
  record:
    | ClientAssetRecord
    | ClientLiabilityRecord
    | ClientIncomeRecord
    | ClientExpenseRecord
    | ClientSuperannuationRecord
    | ClientPensionRecord
    | ClientInsuranceRecord
    | ClientEntityRecord
    | ClientDependantRecord,
  context: LiveContext,
  requestedChange?: string,
) {
  const clientName = context.resolvedClientName ?? "the selected client";

  switch (kind) {
    case "assets": {
      const asset = record as ClientAssetRecord;
      return {
        kind,
        toolName: "update_asset_record" as const,
        summary: `Update an asset for ${clientName}`,
        description: "Update the selected asset record on the client profile.",
        payload: { kind, record: asset },
        inputsPreview: {
          section: "Assets",
          owner: asset.owner?.name ?? null,
          type: asset.type,
          assetType: asset.assetType,
          description: asset.description,
          currentValue: asset.currentValue,
          cost: asset.cost,
          incomeAmount: asset.incomeAmount,
          incomeFrequency: asset.incomeFrequency?.value ?? null,
          acquisitionDate: asset.acquisitionDate,
          requestedChange: requestedChange ?? null,
        },
        editorCard: buildAssetEditorCard(asset),
      };
    }
    case "income": {
      const income = record as ClientIncomeRecord;
      return {
        kind,
        toolName: "update_income_record" as const,
        summary: `Update an income record for ${clientName}`,
        description: "Update the selected income record on the client profile.",
        payload: { kind, record: income },
        inputsPreview: {
          section: "Income",
          owner: income.owner?.name ?? null,
          type: income.type,
          description: income.description,
          amount: income.amount,
          taxType: income.taxType,
          frequency: income.frequency?.value ?? null,
          requestedChange: requestedChange ?? null,
        },
        editorCard: buildIncomeEditorCard(income),
      };
    }
    case "expenses": {
      const expense = record as ClientExpenseRecord;
      return {
        kind,
        toolName: "update_expense_record" as const,
        summary: `Update an expense record for ${clientName}`,
        description: "Update the selected expense record on the client profile.",
        payload: { kind, record: expense },
        inputsPreview: {
          section: "Expenses",
          owner: expense.owner?.name ?? null,
          type: expense.type,
          description: expense.description,
          amount: expense.amount,
          frequency: expense.frequency?.value ?? null,
          indexation: expense.indexation,
          linkedLiability: expense.liability?.type ?? null,
          requestedChange: requestedChange ?? null,
        },
        editorCard: buildExpenseEditorCard(expense, context),
      };
    }
    case "liabilities": {
      const liability = record as ClientLiabilityRecord;
      return {
        kind,
        toolName: "update_liability_record" as const,
        summary: `Update a liability record for ${clientName}`,
        description: "Update the selected liability record on the client profile.",
        payload: { kind, record: liability },
        inputsPreview: {
          section: "Liabilities",
          owner: liability.owner?.name ?? null,
          loanType: liability.loanType,
          bankName: liability.bankName,
          outstandingBalance: liability.outstandingBalance,
          repaymentAmount: liability.repaymentAmount,
          interestRate: liability.interestRate,
          repaymentFrequency: liability.repaymentFrequency?.value ?? null,
          securityAsset: liability.securityAssets?.description ?? null,
          requestedChange: requestedChange ?? null,
        },
        editorCard: buildLiabilityEditorCard(liability, context),
      };
    }
    case "superannuation": {
      const superRecord = record as ClientSuperannuationRecord;
      return {
        kind,
        toolName: "update_superannuation_record" as const,
        summary: `Update a superannuation record for ${clientName}`,
        description: "Update the selected superannuation record on the client profile.",
        payload: { kind, record: superRecord },
        inputsPreview: {
          section: "Superannuation",
          owner: superRecord.owner?.name ?? null,
          type: superRecord.type,
          superFund: superRecord.superFund,
          balance: superRecord.balance,
          contributionAmount: superRecord.contributionAmount,
          frequency: superRecord.frequency?.value ?? null,
          requestedChange: requestedChange ?? null,
        },
        editorCard: buildSuperEditorCard(superRecord),
      };
    }
    case "retirement-income": {
      const pension = record as ClientPensionRecord;
      return {
        kind,
        toolName: "update_retirement_income_record" as const,
        summary: `Update a retirement income record for ${clientName}`,
        description: "Update the selected retirement income record on the client profile.",
        payload: { kind, record: pension },
        inputsPreview: {
          section: "Retirement Income",
          owner: pension.owner?.name ?? null,
          type: pension.type,
          superFund: pension.superFund,
          balance: pension.balance,
          payment: pension.payment,
          annualReturn: pension.annualReturn,
          frequency: pension.frequency?.value ?? null,
          requestedChange: requestedChange ?? null,
        },
        editorCard: buildRetirementIncomeEditorCard(pension),
      };
    }
    case "insurance": {
      const insurance = record as ClientInsuranceRecord;
      return {
        kind,
        toolName: "update_insurance_record" as const,
        summary: `Update an insurance record for ${clientName}`,
        description: "Update the selected insurance record on the client profile.",
        payload: { kind, record: insurance },
        inputsPreview: {
          section: "Insurance",
          owner: insurance.owner?.name ?? null,
          coverRequired: insurance.coverRequired,
          insurer: insurance.insurer,
          sumInsured: insurance.sumInsured,
          premiumAmount: insurance.premiumAmount,
          status: insurance.status,
          frequency: insurance.frequency?.value ?? null,
          superFund: insurance.superFund?.type ?? null,
          requestedChange: requestedChange ?? null,
        },
        editorCard: buildInsuranceEditorCard(insurance, context),
      };
    }
    case "entities": {
      const entity = record as ClientEntityRecord;
      return {
        kind,
        toolName: "update_entity_record" as const,
        summary: `Update an entity for ${clientName}`,
        description: "Update the selected entity linked to the client profile.",
        payload: { kind, record: entity },
        inputsPreview: {
          section: "Entities",
          owner: entity.owner?.name ?? null,
          name: entity.name,
          type: entity.type,
          requestedChange: requestedChange ?? null,
        },
        editorCard: buildEntityEditorCard(entity, context),
      };
    }
    case "dependants": {
      const dependant = record as ClientDependantRecord;
      return {
        kind,
        toolName: "update_dependant_record" as const,
        summary: `Update a dependant for ${clientName}`,
        description: "Update the selected dependant linked to the client profile.",
        payload: { kind, record: dependant },
        inputsPreview: {
          section: "Dependants",
          owner: dependant.owner?.name ?? null,
          name: dependant.name,
          type: dependant.type,
          birthday: dependant.birthday,
          requestedChange: requestedChange ?? null,
        },
        editorCard: buildDependantEditorCard(dependant, context),
      };
    }
  }
}

function extractCollectionUpdateIntent(message: string, context: LiveContext) {
  const lower = message.toLowerCase();
  const isUpdate = lower.includes("update") || lower.includes("change");
  if (!isUpdate) return null;

  const findMatch = <T extends { id?: string | null }>(
    records: T[],
    matchValues: (record: T) => Array<string | null | undefined>,
  ) =>
    records.find((record) =>
      matchValues(record)
        .filter(Boolean)
        .some((value) => lower.includes(String(value).toLowerCase())),
    ) ?? (records.length === 1 ? records[0] : null);

  if (lower.includes("asset") || lower.includes("account") || lower.includes("property") || lower.includes("stock") || lower.includes("annuity")) {
    const records = context.profile?.assets ?? [];
    if (!records.length) return null;
    const matchedRecord = findMatch(records, (record) => [record.description, record.assetType, record.type]);
    if (!matchedRecord) return null;
    const extractedRecord = extractAssetIntent(message, context).payload.record as ClientAssetRecord;
    const mergedRecord: ClientAssetRecord = {
      ...matchedRecord,
      type: extractedRecord.type ?? matchedRecord.type ?? null,
      assetType: extractedRecord.assetType ?? matchedRecord.assetType ?? null,
      description: extractedRecord.description ?? matchedRecord.description ?? null,
      currentValue: extractedRecord.currentValue ?? matchedRecord.currentValue ?? null,
      cost: extractedRecord.cost ?? matchedRecord.cost ?? null,
      incomeAmount: extractedRecord.incomeAmount ?? matchedRecord.incomeAmount ?? null,
      incomeFrequency:
        extractedRecord.incomeFrequency?.value || extractedRecord.incomeFrequency?.type
          ? extractedRecord.incomeFrequency
          : matchedRecord.incomeFrequency ?? { type: "", value: "" },
      acquisitionDate: extractedRecord.acquisitionDate ?? matchedRecord.acquisitionDate ?? null,
      joint: matchedRecord.joint ?? false,
      owner: matchedRecord.owner ?? null,
    };
    return buildCollectionUpdateIntentFromRecord("assets", mergedRecord, context, message);
  }

  if (lower.includes("income") || lower.includes("salary") || lower.includes("bonus")) {
    const records = context.profile?.income ?? [];
    if (!records.length) return null;
    const matchedRecord = findMatch(records, (record) => [record.type, record.description]);
    if (!matchedRecord) return null;
    const extractedRecord = extractIncomeIntent(message, context).payload.record as ClientIncomeRecord;
    const mergedRecord: ClientIncomeRecord = {
      ...matchedRecord,
      type: extractedRecord.type ?? matchedRecord.type ?? null,
      description: extractedRecord.description ?? matchedRecord.description ?? null,
      amount: extractedRecord.amount ?? matchedRecord.amount ?? null,
      taxType: extractedRecord.taxType ?? matchedRecord.taxType ?? null,
      frequency: extractedRecord.frequency ?? matchedRecord.frequency ?? null,
      pension: matchedRecord.pension ?? { id: "", type: "" },
      joint: matchedRecord.joint ?? false,
      owner: matchedRecord.owner ?? null,
    };
    return buildCollectionUpdateIntentFromRecord("income", mergedRecord, context, message);
  }

  if (lower.includes("expense")) {
    const records = context.profile?.expense ?? [];
    if (!records.length) return null;
    const matchedRecord = findMatch(records, (record) => [record.type, record.description]);
    if (!matchedRecord) return null;
    const extractedRecord = extractExpenseIntent(message, context).payload.record as ClientExpenseRecord;
    const mergedRecord: ClientExpenseRecord = {
      ...matchedRecord,
      type: extractedRecord.type ?? matchedRecord.type ?? null,
      description: extractedRecord.description ?? matchedRecord.description ?? null,
      amount: extractedRecord.amount ?? matchedRecord.amount ?? null,
      indexation: extractedRecord.indexation ?? matchedRecord.indexation ?? null,
      frequency: extractedRecord.frequency ?? matchedRecord.frequency ?? null,
      liability: extractedRecord.liability?.id ? extractedRecord.liability : matchedRecord.liability ?? { id: "", type: "" },
      joint: matchedRecord.joint ?? false,
      owner: matchedRecord.owner ?? null,
    };
    return buildCollectionUpdateIntentFromRecord("expenses", mergedRecord, context, message);
  }

  if (lower.includes("liability") || lower.includes("loan") || lower.includes("debt")) {
    const records = context.profile?.liabilities ?? [];
    if (!records.length) return null;
    const matchedRecord = findMatch(records, (record) => [record.loanType, record.bankName]);
    if (!matchedRecord) return null;
    const extractedRecord = extractLiabilityIntent(message, context).payload.record as ClientLiabilityRecord;
    const mergedRecord: ClientLiabilityRecord = {
      ...matchedRecord,
      loanType: extractedRecord.loanType ?? matchedRecord.loanType ?? null,
      bankName: extractedRecord.bankName ?? matchedRecord.bankName ?? null,
      outstandingBalance: extractedRecord.outstandingBalance ?? matchedRecord.outstandingBalance ?? null,
      repaymentAmount: extractedRecord.repaymentAmount ?? matchedRecord.repaymentAmount ?? null,
      interestRate: extractedRecord.interestRate ?? matchedRecord.interestRate ?? null,
      repaymentFrequency: extractedRecord.repaymentFrequency ?? matchedRecord.repaymentFrequency ?? null,
      securityAssets: extractedRecord.securityAssets?.id ? extractedRecord.securityAssets : matchedRecord.securityAssets ?? null,
      accountNumber: extractedRecord.accountNumber ?? matchedRecord.accountNumber ?? null,
      joint: matchedRecord.joint ?? false,
      owner: matchedRecord.owner ?? null,
    };
    return buildCollectionUpdateIntentFromRecord("liabilities", mergedRecord, context, message);
  }

  if (lower.includes("super") || lower.includes("superannuation")) {
    const records = context.profile?.superannuation ?? [];
    if (!records.length) return null;
    const matchedRecord = findMatch(records, (record) => [record.type, record.superFund]);
    if (!matchedRecord) return null;
    const extractedRecord = extractSuperIntent(message, context).payload.record as ClientSuperannuationRecord;
    const mergedRecord: ClientSuperannuationRecord = {
      ...matchedRecord,
      type: extractedRecord.type ?? matchedRecord.type ?? null,
      superFund: extractedRecord.superFund ?? matchedRecord.superFund ?? null,
      balance: extractedRecord.balance ?? matchedRecord.balance ?? null,
      contributionAmount: extractedRecord.contributionAmount ?? matchedRecord.contributionAmount ?? null,
      accountNumber: extractedRecord.accountNumber ?? matchedRecord.accountNumber ?? null,
      frequency: extractedRecord.frequency ?? matchedRecord.frequency ?? null,
      joint: matchedRecord.joint ?? false,
      owner: matchedRecord.owner ?? null,
    };
    return buildCollectionUpdateIntentFromRecord("superannuation", mergedRecord, context, message);
  }

  if (lower.includes("retirement income") || lower.includes("pension")) {
    const records = context.profile?.pension ?? [];
    if (!records.length) return null;
    const matchedRecord = findMatch(records, (record) => [record.type, record.superFund]);
    if (!matchedRecord) return null;
    const extractedRecord = extractRetirementIncomeIntent(message, context).payload.record as ClientPensionRecord;
    const mergedRecord: ClientPensionRecord = {
      ...matchedRecord,
      type: extractedRecord.type ?? matchedRecord.type ?? null,
      superFund: extractedRecord.superFund ?? matchedRecord.superFund ?? null,
      balance: extractedRecord.balance ?? matchedRecord.balance ?? null,
      payment: extractedRecord.payment ?? matchedRecord.payment ?? null,
      annualReturn: extractedRecord.annualReturn ?? matchedRecord.annualReturn ?? null,
      frequency: extractedRecord.frequency ?? matchedRecord.frequency ?? null,
      accountNumber: extractedRecord.accountNumber ?? matchedRecord.accountNumber ?? null,
      owner: matchedRecord.owner ?? null,
    };
    return buildCollectionUpdateIntentFromRecord("retirement-income", mergedRecord, context, message);
  }

  if (lower.includes("insurance") || lower.includes("cover")) {
    const records = context.profile?.insurance ?? [];
    if (!records.length) return null;
    const matchedRecord = findMatch(records, (record) => [record.coverRequired, record.insurer]);
    if (!matchedRecord) return null;
    const extractedRecord = extractInsuranceIntent(message, context).payload.record as ClientInsuranceRecord;
    const mergedRecord: ClientInsuranceRecord = {
      ...matchedRecord,
      coverRequired: extractedRecord.coverRequired ?? matchedRecord.coverRequired ?? null,
      insurer: extractedRecord.insurer ?? matchedRecord.insurer ?? null,
      sumInsured: extractedRecord.sumInsured ?? matchedRecord.sumInsured ?? null,
      premiumAmount: extractedRecord.premiumAmount ?? matchedRecord.premiumAmount ?? null,
      status: extractedRecord.status ?? matchedRecord.status ?? null,
      frequency: extractedRecord.frequency ?? matchedRecord.frequency ?? null,
      superFund: extractedRecord.superFund?.id ? extractedRecord.superFund : matchedRecord.superFund ?? null,
      joint: matchedRecord.joint ?? false,
      owner: matchedRecord.owner ?? null,
    };
    return buildCollectionUpdateIntentFromRecord("insurance", mergedRecord, context, message);
  }

  return null;
}

function getRecentRelevantUserMessage(recentMessages?: FinleyChatRequest["recentMessages"]) {
  const isClarificationPrompt = (text: string) => {
    const lower = text.toLowerCase();
    return (
      lower.includes("what else do you need") ||
      lower.includes("what do you need") ||
      lower.includes("what details do you need") ||
      lower.includes("what information do you need")
    );
  };

  const userMessages = (recentMessages ?? [])
    .filter((entry) => entry.role === "user" && entry.content?.trim())
    .map((entry) => entry.content!.trim())
    .filter((content) => !isClarificationPrompt(content));

  return userMessages.length ? userMessages[userMessages.length - 1] : null;
}

function applyAddressParts(target: Record<string, unknown>, value: string) {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts[0]) {
    target.street = parts[0];
  }

  const suburbStatePostcode = parts.slice(1).join(", ").trim();
  if (suburbStatePostcode) {
    const statePostcodeMatch = suburbStatePostcode.match(/\b([A-Za-z]{2,4})\s+(\d{4})\b/);

    if (statePostcodeMatch) {
      const suburb = suburbStatePostcode.slice(0, statePostcodeMatch.index).replace(/,$/, "").trim();
      if (suburb) target.suburb = suburb;
      target.state = statePostcodeMatch[1].toUpperCase();
      target.postCode = statePostcodeMatch[2];
    } else if (parts[1]) {
      target.suburb = parts[1];
    }
  }

  const postcodeMatch = value.match(/\b(\d{4})\b/);
  if (postcodeMatch && !target.postCode) {
    target.postCode = postcodeMatch[1];
  }
}

function inferContextField(message: string, recentMessages?: FinleyChatRequest["recentMessages"]) {
  const current = message.toLowerCase();
  const currentHasExplicitField =
    current.includes("date of birth") ||
    /\bdob\b/.test(current) ||
    current.includes("birthday") ||
    current.includes("email") ||
    current.includes("address") ||
    current.includes("phone") ||
    current.includes("mobile") ||
    current.includes("marital status") ||
    current.includes("resident status") ||
    current.includes("gender") ||
    current.includes("risk profile") ||
    current.includes("agreement type") ||
    current.includes("anniversary date");

  if (currentHasExplicitField) return null;

  const combinedHistory = (recentMessages ?? [])
    .map((entry) => entry.content?.toLowerCase()?.trim() ?? "")
    .filter(Boolean)
    .reverse();

  for (const text of combinedHistory) {
    if (text.includes("date of birth") || /\bdob\b/.test(text) || text.includes("birthday")) return "dateOfBirth";
    if (text.includes("email")) return "email";
    if (text.includes("address")) return "address";
    if (text.includes("phone") || text.includes("mobile") || text.includes("number")) return "preferredPhone";
    if (text.includes("marital status")) return "maritalStatus";
    if (text.includes("resident status")) return "residentStatus";
    if (text.includes("gender")) return "gender";
    if (text.includes("risk profile")) return "riskProfile";
    if (text.includes("agreement type")) return "agreementType";
    if (text.includes("anniversary date")) return "nextAnniversaryDate";
  }

  return null;
}

function extractClientUpdatePayload(
  message: string,
  recentMessages?: FinleyChatRequest["recentMessages"],
): { target: "client" | "partner"; changes: Record<string, unknown> } {
  const payload: Record<string, unknown> = {};
  const lower = message.toLowerCase();
  const target: "client" | "partner" = /\bpartner\b/.test(lower) ? "partner" : "client";

  const extractAfterLabel = (patterns: RegExp[]) => {
    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match?.[1]) {
        return match[1].trim().replace(/[.]+$/, "");
      }
    }
    return null;
  };

  const emailMatch = message.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  if (emailMatch) {
    payload.email = emailMatch[0];
  }

  const mobileMatch = message.match(/(?:\+?61\s?|0)[0-9][0-9\s-]{7,}/);
  if (mobileMatch) {
    payload.preferredPhone = mobileMatch[0].replace(/\s+/g, " ").trim();
  }

  const dobValue = extractAfterLabel([
    /\b(?:dob|date of birth)\s*(?:to|is|=|:)?\s*([A-Za-z0-9/\s-]+)/i,
  ]);
  const normalizedDob = dobValue ? normalizeDateToIso(dobValue) : null;
  if (normalizedDob) {
    payload.dateOfBirth = normalizedDob;
  }

  const inferredContextField = inferContextField(message, recentMessages);
  const genericValue = extractAfterLabel([
    /\b(?:update|change)(?:\s+it)?\s+to\s+([A-Za-z0-9@./\s-]+)\b/i,
    /\bset(?:\s+it)?\s+to\s+([A-Za-z0-9@./\s-]+)\b/i,
  ]);

  if (genericValue && inferredContextField && Object.keys(payload).length === 0) {
    if (inferredContextField === "dateOfBirth") {
      const inferredDob = normalizeDateToIso(genericValue);
      if (inferredDob) payload.dateOfBirth = inferredDob;
    } else if (inferredContextField === "address") {
      applyAddressParts(payload, genericValue);
    } else if (inferredContextField === "email") {
      payload.email = genericValue;
    } else if (inferredContextField === "preferredPhone") {
      payload.preferredPhone = genericValue;
    } else if (inferredContextField === "maritalStatus") {
      payload.maritalStatus = genericValue;
    } else if (inferredContextField === "residentStatus") {
      payload.residentStatus = genericValue;
    } else if (inferredContextField === "gender") {
      payload.gender = genericValue;
    } else if (inferredContextField === "riskProfile") {
      payload.riskProfile = genericValue;
      payload.riskProfileResponse = {
        resultDisplay: genericValue,
      };
    } else if (inferredContextField === "agreementType") {
      payload.agreementType = genericValue;
    } else if (inferredContextField === "nextAnniversaryDate") {
      const anniversaryDate = normalizeDateToIso(genericValue);
      if (anniversaryDate) payload.nextAnniversaryDate = anniversaryDate;
    }
  }

  const firstNameValue = extractAfterLabel([
    /\bfirst name\s*(?:to|is|=|:)?\s*([A-Za-z' -]+)/i,
  ]);
  if (firstNameValue) {
    const existingNameMatch = message.match(/\b(?:last name)\b/i);
    payload.name = existingNameMatch ? firstNameValue : firstNameValue;
  }

  const lastNameValue = extractAfterLabel([
    /\blast name\s*(?:to|is|=|:)?\s*([A-Za-z' -]+)/i,
  ]);
  if (lastNameValue) {
    payload.lastName = lastNameValue;
  }

  const fullNameValue = extractAfterLabel([
    /\bname\s*(?:to|is|=|:)?\s*([A-Za-z' -]+)/i,
  ]);
  if (fullNameValue && !payload.name) {
    payload.name = fullNameValue;
  }

  const maritalStatusValue = extractAfterLabel([
    /\bmarital status\s*(?:to|is|=|:)?\s*([A-Za-z ]+)/i,
  ]);
  if (maritalStatusValue) {
    payload.maritalStatus = maritalStatusValue;
  }

  const residentStatusValue = extractAfterLabel([
    /\bresident status\s*(?:to|is|=|:)?\s*([A-Za-z ]+)/i,
  ]);
  if (residentStatusValue) {
    payload.residentStatus = residentStatusValue;
  }

  const genderValue = extractAfterLabel([
    /\bgender\s*(?:to|is|=|:)?\s*([A-Za-z ]+)/i,
  ]);
  if (genderValue) {
    payload.gender = genderValue;
  }

  const statusValue = extractAfterLabel([
    /\bstatus\s*(?:to|is|=|:)?\s*(prospect|client|archived|deceased)\b/i,
  ]);
  if (statusValue) {
    payload.status = statusValue;
  }

  const clientCategoryValue = extractAfterLabel([
    /\bclient category\s*(?:to|is|=|:)?\s*([A-Za-z ]+)/i,
    /\bcategory\s*(?:to|is|=|:)?\s*([A-Za-z ]+)/i,
  ]);
  if (clientCategoryValue) {
    payload.clientCategory = clientCategoryValue;
  }

  const riskProfileValue = extractAfterLabel([
    /\brisk profile\s*(?:to|is|=|:)?\s*([A-Za-z ]+)/i,
  ]);
  if (riskProfileValue) {
    payload.riskProfile = riskProfileValue;
    payload.riskProfileResponse = {
      resultDisplay: riskProfileValue,
    };
  }

  const agreementRequiredValue = extractAfterLabel([
    /\b(?:advice agreement required|annual agreement required|agreement required)\s*(?:to|is|=|:)?\s*(yes|no)\b/i,
  ]);
  if (agreementRequiredValue) {
    payload.adviceAgreementRequired = agreementRequiredValue;
  }

  const agreementTypeValue = extractAfterLabel([
    /\bagreement type\s*(?:to|is|=|:)?\s*([A-Za-z ]+)/i,
  ]);
  if (agreementTypeValue) {
    payload.agreementType = agreementTypeValue;
  }

  const anniversaryValue = extractAfterLabel([
    /\b(?:next anniversary date|anniversary date)\s*(?:to|is|=|:)?\s*([A-Za-z0-9/\s-]+)/i,
  ]);
  const normalizedAnniversary = anniversaryValue ? normalizeDateToIso(anniversaryValue) : null;
  if (normalizedAnniversary) {
    payload.nextAnniversaryDate = normalizedAnniversary;
  }

  const addressMatch = message.match(/address(?:\s+to|\s+is|:)?\s+(.+)/i);
  if (addressMatch?.[1]) {
    applyAddressParts(payload, addressMatch[1].trim());
  }

  if (payload.name && payload.lastName) {
    payload.name = `${String(payload.name).trim()} ${String(payload.lastName).trim()}`.trim();
    delete payload.lastName;
  }

  return {
    target,
    changes: payload,
  };
}

function buildBaseResponse(
  request: FinleyChatRequest,
  context: LiveContext,
): Omit<FinleyChatResponse, "status" | "responseMode" | "assistantMessage" | "plan" | "results" | "missingInformation" | "warnings" | "errors" | "suggestedActions"> {
  return {
    threadId: request.threadId?.trim() || makeId("thr"),
    messageId: makeId("msg"),
    timestamp: new Date().toISOString(),
    activeContext: {
      activeClientId: context.resolvedClientId,
      activeClientName: context.resolvedClientName,
      activeProfileId: context.profile?.id ?? undefined,
      userId: context.currentUser?.id ?? null,
      userRole: context.currentUser?.userRole ?? null,
      clientScopeMode: context.resolvedClientId ? "single_client" : "global",
    },
    audit: {
      requestId: makeId("req"),
      workflowId: makeId("wf"),
    },
  };
}

function buildPlanStep(
  toolName: string,
  description: string,
  status: "pending" | "approved" | "succeeded" | "failed" | "skipped" = "pending",
  inputsPreview?: Record<string, unknown>,
) {
  return {
    stepId: makeId("step"),
    toolName,
    kind: toolName.startsWith("get_") || toolName.startsWith("find_") || toolName.startsWith("list_") ? ("read" as const) : ("write" as const),
    status,
    description,
    inputsPreview,
  };
}

function buildCollectionUpdatePlanResponse(
  base: Omit<FinleyChatResponse, "status" | "responseMode" | "assistantMessage" | "plan" | "results" | "missingInformation" | "warnings" | "errors" | "suggestedActions">,
  liveContext: LiveContext,
  collectionUpdateIntent: NonNullable<ReturnType<typeof extractCollectionUpdateIntent>>,
) {
  const planId = makeId("plan");
  const stepId = makeId("step");
  const clientName = liveContext.resolvedClientName ?? "the selected client";
  const sectionLabel = collectionKindLabel(collectionUpdateIntent.kind);

  persistPlan({
    planId,
    threadId: base.threadId,
    createdAt: base.timestamp,
    clientId: liveContext.resolvedClientId,
    clientName,
    profileId: liveContext.profile?.id ?? undefined,
    userId: liveContext.currentUser?.id ?? null,
    userRole: liveContext.currentUser?.userRole ?? null,
    status: "pending",
    summary: collectionUpdateIntent.summary,
    toolName: collectionUpdateIntent.toolName,
    stepId,
    description: collectionUpdateIntent.description,
    inputsPreview: collectionUpdateIntent.inputsPreview,
    execution: {
      kind: "profile_collection",
      payload: collectionUpdateIntent.payload,
    },
  });

  return {
    ...base,
    status: "awaiting_approval" as const,
    responseMode: "plan" as const,
    assistantMessage: `I found the ${sectionLabel} record Finley should update for ${clientName}. Confirm the values below and I’ll apply the change after approval.`,
    plan: {
      planId,
      summary: collectionUpdateIntent.summary,
      requiresApproval: true,
      steps: [
        {
          stepId,
          toolName: collectionUpdateIntent.toolName,
          kind: "write" as const,
          status: "pending" as const,
          description: collectionUpdateIntent.description,
          inputsPreview: collectionUpdateIntent.inputsPreview,
        },
      ],
    },
    results: [],
    missingInformation: [],
    warnings: [],
    errors: [],
    displayCard: null,
    editorCard: collectionUpdateIntent.editorCard,
    suggestedActions: [
      { label: "Approve and run", action: "approve_plan" as const, planId },
      { label: "Cancel", action: "cancel_plan" as const, planId },
    ],
  };
}

export async function prepareFinleyDisplayCardEdit(input: {
  activeClientId?: string | null;
  activeClientName?: string | null;
  threadId?: string | null;
  kind: "assets" | "liabilities" | "income" | "expenses" | "superannuation" | "retirement-income" | "insurance" | "entities" | "dependants";
  recordId: string;
}): Promise<FinleyChatResponse> {
  const liveContext = await loadLiveContext(input.activeClientId, input.activeClientName);
  const base = buildBaseResponse(
    {
      message: `Edit ${input.kind} record`,
      activeClientId: input.activeClientId ?? null,
      activeClientName: input.activeClientName ?? null,
      threadId: input.threadId ?? null,
    },
    liveContext,
  );

  const profile = liveContext.profile;
  if (!profile || !input.recordId) {
    return {
      ...base,
      status: "failed",
      responseMode: "error",
      assistantMessage: "Finley could not load that record for editing right now.",
      plan: null,
      results: [],
      missingInformation: [],
      warnings: [],
      errors: [{ code: "RECORD_NOT_FOUND", message: "Record not found.", retryable: true }],
      displayCard: null,
      editorCard: null,
      suggestedActions: [],
    };
  }

  const recordsByKind = {
    assets: profile.assets ?? [],
    liabilities: profile.liabilities ?? [],
    income: profile.income ?? [],
    expenses: profile.expense ?? [],
    superannuation: profile.superannuation ?? [],
    "retirement-income": profile.pension ?? [],
    insurance: profile.insurance ?? [],
    entities: profile.entities ?? [],
    dependants: profile.dependants ?? [],
  } as const;

  const matchedRecord = recordsByKind[input.kind].find((record) => record.id === input.recordId);

  if (!matchedRecord) {
    return {
      ...base,
      status: "failed",
      responseMode: "error",
      assistantMessage: "Finley could not find that row in the latest client data.",
      plan: null,
      results: [],
      missingInformation: [],
      warnings: [],
      errors: [{ code: "RECORD_NOT_FOUND", message: "Selected row is no longer available.", retryable: true }],
      displayCard: null,
      editorCard: null,
      suggestedActions: [],
    };
  }

  return buildCollectionUpdatePlanResponse(
    base,
    liveContext,
    buildCollectionUpdateIntentFromRecord(input.kind, matchedRecord as never, liveContext),
  );
}

function buildFactFindCollectionStep(
  id: string,
  title: string,
  description: string,
  prompt: string,
  context: LiveContext,
): FinleyFactFindStep {
  const answer = buildCollectionReadAnswer(prompt, context);

  return {
    id,
    title,
    description,
    guidance: answer.displayCard?.rows?.length
      ? "Use the row-level edit button on any record that needs to change."
      : "No records were found in this section yet. You can still add new records through chat.",
    displayCard: answer.displayCard ?? null,
    editorCard: null,
  };
}

export async function prepareFinleyFactFindWorkflow(input: {
  activeClientId?: string | null;
  activeClientName?: string | null;
}): Promise<FinleyFactFindWorkflow> {
  const liveContext = await loadLiveContext(input.activeClientId, input.activeClientName);
  const clientName = liveContext.resolvedClientName ?? input.activeClientName ?? "the selected client";
  const missingFields = countMissingFields(liveContext.profile);
  const hasPartner = hasRealPartner(liveContext.profile?.partner);

  const steps: FinleyFactFindStep[] = [
    {
      id: "household-details",
      title: "Household Details",
      description: `Review the core client details for ${clientName}.`,
      guidance: missingFields.length
        ? `Missing fields currently detected: ${missingFields.join(", ")}.`
        : "Core client details are loaded. Update anything that changed before moving on.",
      displayCard: null,
      editorCard: buildClientUpdateEditorCard(
        "update_client_person_details",
        "client",
        buildCurrentPersonChanges(liveContext.profile?.client),
        hasPartner ? CLIENT_UPDATE_TARGET_OPTIONS : ["client"],
      ),
    },
  ];

  if (hasPartner && liveContext.profile?.partner) {
    steps.push({
      id: "partner-details",
      title: "Partner Details",
      description: `Review the partner details for ${liveContext.profile.partner.name ?? clientName}.`,
      guidance: "Confirm the partner's contact details, address, and profile fields.",
      displayCard: null,
      editorCard: buildClientUpdateEditorCard(
        "update_partner_person_details",
        "partner",
        buildCurrentPersonChanges(liveContext.profile.partner),
      ),
    });
  }

  steps.push(
    buildFactFindCollectionStep(
      "dependants",
      "Dependants",
      "Review dependant records and open any row you want to edit.",
      "what dependants does this client have",
      liveContext,
    ),
    buildFactFindCollectionStep(
      "entities",
      "Entities",
      "Check trusts, companies, and other linked entities for this household.",
      "what entities does this client have",
      liveContext,
    ),
    buildFactFindCollectionStep(
      "assets",
      "Assets",
      "Review the asset register and edit the rows that changed.",
      "what assets does this client have",
      liveContext,
    ),
    buildFactFindCollectionStep(
      "liabilities",
      "Liabilities",
      "Review lending and other liabilities for the household.",
      "what liabilities does this client have",
      liveContext,
    ),
    buildFactFindCollectionStep(
      "income",
      "Income",
      "Confirm employment, investment, and other income records.",
      "what income does this client have",
      liveContext,
    ),
    buildFactFindCollectionStep(
      "expenses",
      "Expenses",
      "Review living costs and liability-derived expense rows.",
      "what expenses does this client have",
      liveContext,
    ),
    buildFactFindCollectionStep(
      "superannuation",
      "Superannuation",
      "Check super balances, contributions, and fund details.",
      "what superannuation does this client have",
      liveContext,
    ),
    buildFactFindCollectionStep(
      "retirement-income",
      "Retirement Income",
      "Review pension and retirement-income records for the household.",
      "what retirement income does this client have",
      liveContext,
    ),
    buildFactFindCollectionStep(
      "insurance",
      "Insurance",
      "Confirm current insurance cover, status, premiums, and linked super funds.",
      "what insurance does this client have",
      liveContext,
    ),
  );

  return {
    clientId: liveContext.resolvedClientId ?? input.activeClientId ?? undefined,
    clientName,
    steps,
  };
}

function persistPlan(plan: StoredPlan) {
  planStore.set(plan.planId, plan);
}

export function getStoredPlan(planId: string) {
  return planStore.get(planId) ?? null;
}

export function cancelStoredPlan(planId: string) {
  const plan = planStore.get(planId);
  if (!plan) return null;
  plan.status = "cancelled";
  planStore.set(planId, plan);
  return plan;
}

async function executeFileNotePlan(plan: StoredPlan, origin?: string | null, cookieHeader?: string | null) {
  const payload = plan.execution.payload;
  const owner =
    payload.owner && typeof payload.owner === "object"
      ? (payload.owner as { id?: string | null; name?: string | null })
      : null;
  const adviser =
    payload.adviser && typeof payload.adviser === "object"
      ? (payload.adviser as { name?: string | null; email?: string | null })
      : null;

  if (!payload.clientId || !owner?.id || !owner.name) {
    throw new Error("Finley could not determine the client and owner needed to create this file note.");
  }

  await createFileNoteAction(
    {
      id: typeof payload.id === "string" ? payload.id : null,
      clientId: String(payload.clientId),
      ownerId: owner.id,
      ownerName: owner.name,
      joint: typeof payload.joint === "boolean" ? payload.joint : false,
      licensee: typeof payload.licensee === "string" ? payload.licensee : null,
      practice: typeof payload.practice === "string" ? payload.practice : null,
      adviserName: adviser?.name ?? null,
      adviserEmail: adviser?.email ?? null,
      subject: typeof payload.subject === "string" ? payload.subject : "",
      content: typeof payload.content === "string" ? payload.content : "",
      serviceDate: typeof payload.serviceDate === "string" ? payload.serviceDate : new Date().toISOString().slice(0, 10),
      type: typeof payload.type === "string" ? payload.type : "Administration",
      subType: typeof payload.subType === "string" ? payload.subType : "Task Update",
      attachment: Array.isArray(payload.attachment) ? (payload.attachment as FileNoteRecord["attachment"]) : [],
    },
    {
      origin,
      cookieHeader,
    },
  );
}

async function executeClientUpdatePlan(plan: StoredPlan, origin?: string | null, cookieHeader?: string | null) {
  const profileId = plan.profileId;
  const personId = typeof plan.execution.payload.personId === "string" ? plan.execution.payload.personId : null;
  const target = typeof plan.execution.payload.target === "string" ? plan.execution.payload.target : "client";
  const changes =
    plan.execution.payload.changes && typeof plan.execution.payload.changes === "object"
      ? (plan.execution.payload.changes as Record<string, unknown>)
      : null;

  if (!profileId || !personId || !changes || Object.keys(changes).length === 0) {
    throw new Error("Finley could not determine a safe set of client fields to update from this request.");
  }

  if (target === "partner") {
    await updatePartnerDetailsAction(
      {
        profileId,
        personId,
        changes: changes as never,
      },
      {
        origin,
        cookieHeader,
      },
    );
    return;
  }

  await updateClientDetailsAction(
    {
      profileId,
      personId,
      changes: changes as never,
    },
    {
      origin,
      cookieHeader,
    },
  );
}

async function executeCollectionPlan(
  plan: StoredPlan,
  liveContext: LiveContext,
  origin?: string | null,
  cookieHeader?: string | null,
) {
  const profileId = plan.profileId;
  const kind = typeof plan.execution.payload.kind === "string" ? plan.execution.payload.kind : null;
  const record =
    plan.execution.payload.record && typeof plan.execution.payload.record === "object"
      ? plan.execution.payload.record
      : null;
  const records = Array.isArray(plan.execution.payload.records)
    ? plan.execution.payload.records.filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    : [];

  if (!profileId || !kind || (!record && records.length === 0)) {
    throw new Error("Finley could not determine a complete collection action for this request.");
  }

  const context = { origin, cookieHeader };
  const normalizedRecords = records.length
    ? records.map((entry) => normalizeApprovedCollectionRecord(kind, entry, liveContext))
    : [normalizeApprovedCollectionRecord(kind, record as Record<string, unknown>, liveContext)];

  switch (kind) {
    case "assets": {
      const nextRecords = normalizedRecords.reduce(
        (current, entry) => upsertAssetCollection(current, entry as ClientAssetRecord),
        [...(liveContext.profile?.assets ?? [])],
      );
      await saveAssetCollection(profileId, nextRecords, context);
      return;
    }
    case "liabilities": {
      const nextRecords = normalizedRecords.reduce(
        (current, entry) =>
          upsertFinancialCollection("liabilities", current, entry as ClientLiabilityRecord),
        [...((liveContext.profile?.liabilities ?? []) as ClientLiabilityRecord[])],
      );
      await saveFinancialCollection("liabilities", profileId, nextRecords, context);
      return;
    }
    case "income": {
      const nextRecords = normalizedRecords.reduce(
        (current, entry) =>
          upsertFinancialCollection("income", current, entry as ClientIncomeRecord),
        [...((liveContext.profile?.income ?? []) as ClientIncomeRecord[])],
      );
      await saveFinancialCollection("income", profileId, nextRecords, context);
      return;
    }
    case "expenses": {
      const nextRecords = normalizedRecords.reduce(
        (current, entry) =>
          upsertFinancialCollection("expenses", current, entry as ClientExpenseRecord),
        [...((liveContext.profile?.expense ?? []) as ClientExpenseRecord[])],
      );
      await saveFinancialCollection("expenses", profileId, nextRecords, context);
      return;
    }
    case "superannuation": {
      const nextRecords = normalizedRecords.reduce(
        (current, entry) =>
          upsertFinancialCollection("superannuation", current, entry as ClientSuperannuationRecord),
        [...((liveContext.profile?.superannuation ?? []) as ClientSuperannuationRecord[])],
      );
      await saveFinancialCollection("superannuation", profileId, nextRecords, context);
      return;
    }
    case "retirement-income": {
      const nextRecords = normalizedRecords.reduce(
        (current, entry) =>
          upsertFinancialCollection("retirement-income", current, entry as ClientPensionRecord),
        [...((liveContext.profile?.pension ?? []) as ClientPensionRecord[])],
      );
      await saveFinancialCollection("retirement-income", profileId, nextRecords, context);
      return;
    }
    case "insurance": {
      const nextRecords = normalizedRecords.reduce(
        (current, entry) =>
          upsertFinancialCollection("insurance", current, entry as ClientInsuranceRecord),
        [...((liveContext.profile?.insurance ?? []) as ClientInsuranceRecord[])],
      );
      await saveFinancialCollection("insurance", profileId, nextRecords, context);
      return;
    }
    case "entities": {
      const nextRecords = normalizedRecords.reduce(
        (current, entry) => upsertEntityCollection(current, entry as ClientEntityRecord),
        [...((liveContext.profile?.entities ?? []) as ClientEntityRecord[])],
      );
      await saveEntityCollection(profileId, nextRecords, context);
      return;
    }
    case "dependants": {
      const nextRecords = normalizedRecords.reduce(
        (current, entry) => upsertDependantCollection(current, entry as ClientDependantRecord),
        [...((liveContext.profile?.dependants ?? []) as ClientDependantRecord[])],
      );
      await saveDependantCollection(profileId, nextRecords, context);
      return;
    }
    default:
      throw new Error("This collection workflow is not supported yet.");
  }
}

function normalizeApprovedCollectionRecord(kind: string, record: Record<string, unknown>, liveContext: LiveContext) {
  const normalized = { ...record };

  if (typeof normalized.frequency === "string") {
    normalized.frequency = normalized.frequency
      ? { type: normalized.frequency, value: normalized.frequency }
      : null;
  }

  if (typeof normalized.incomeFrequency === "string") {
    normalized.incomeFrequency = normalized.incomeFrequency
      ? { type: normalized.incomeFrequency, value: normalized.incomeFrequency }
      : { type: "", value: "" };
  }

  if (typeof normalized.repaymentFrequency === "string") {
    normalized.repaymentFrequency = normalized.repaymentFrequency
      ? { type: normalized.repaymentFrequency, value: normalized.repaymentFrequency }
      : null;
  }

  if (kind === "liabilities" && typeof normalized.securityAssetId === "string") {
    const asset = (liveContext.profile?.assets ?? []).find((entry) => entry.id === normalized.securityAssetId);
    normalized.securityAssets = asset?.id
      ? {
          id: asset.id,
          type: asset.assetType ?? "Asset",
          description: asset.description ?? null,
        }
      : null;
    delete normalized.securityAssetId;
  }

  if (kind === "expenses" && typeof normalized.liabilityId === "string") {
    const liability = (liveContext.profile?.liabilities ?? []).find((entry) => entry.id === normalized.liabilityId);
    normalized.liability = liability?.id
      ? {
          id: liability.id,
          type: liability.loanType ?? "Liability",
        }
      : { id: "", type: "" };
    delete normalized.liabilityId;
  }

  if (kind === "insurance" && typeof normalized.superFundId === "string") {
    const superFund = (liveContext.profile?.superannuation ?? []).find((entry) => entry.id === normalized.superFundId);
    normalized.superFund = superFund?.id
      ? {
          id: superFund.id,
          type: superFund.superFund ?? superFund.type ?? "Super",
        }
      : null;
    delete normalized.superFundId;
  }

  if ((kind === "entities" || kind === "dependants") && typeof normalized.ownerId === "string") {
    const owner = getOwnerOptions(liveContext.profile).find((entry) => entry.value === normalized.ownerId);
    normalized.owner = owner
      ? {
          id: owner.value,
          name: owner.label,
        }
      : null;
    delete normalized.ownerId;
  }

  if (kind === "dependants" && typeof normalized.birthday === "string") {
    normalized.birthday = normalizeDateToIso(normalized.birthday) ?? normalized.birthday;
  }

  return normalized;
}

export async function approveStoredPlan(
  planId: string,
  overrides?: PlanExecutionOverrides | null,
  requestContext?: { origin?: string | null; cookieHeader?: string | null },
): Promise<FinleyChatResponse | null> {
  const storedPlan = planStore.get(planId);
  const plan = storedPlan ? applyFileNoteOverrides(storedPlan, overrides) : null;
  if (!plan) return null;
  persistPlan(plan);

  const token = await readAuthTokenFromCookies();
  const liveContext = await loadLiveContext(plan.clientId, plan.clientName);
  const base = buildBaseResponse(
    {
      message: plan.summary,
      activeClientId: plan.clientId,
      activeClientName: plan.clientName,
      threadId: plan.threadId,
    },
    liveContext,
  );

  if (!token) {
    return {
      ...base,
      status: "failed",
      responseMode: "error",
      assistantMessage: "You must be signed in before Finley can execute an approved plan.",
      plan: null,
      results: [],
      missingInformation: [],
      warnings: [],
      errors: [{ code: "NOT_AUTHENTICATED", message: "Not authenticated.", retryable: true }],
      suggestedActions: [],
    };
  }

  try {
    plan.status = "approved";

    if (plan.execution.kind === "file_note") {
      await executeFileNotePlan(plan, requestContext?.origin, requestContext?.cookieHeader);
      plan.status = "completed";
      persistPlan(plan);

      return {
        ...base,
        status: "completed",
        responseMode: "execution_result",
        assistantMessage: `The file note was created successfully for ${plan.clientName ?? "the selected client"}.`,
        plan: {
          planId: plan.planId,
          summary: plan.summary,
          requiresApproval: true,
          steps: [
            {
              stepId: plan.stepId,
              toolName: plan.toolName,
              kind: "write",
              status: "succeeded",
              description: plan.description,
              inputsPreview: plan.inputsPreview,
            },
          ],
        },
        results: [
          {
            stepId: plan.stepId,
            toolName: plan.toolName,
            status: "succeeded",
            summary: "Created a new file note on the selected client record.",
          },
        ],
        missingInformation: [],
        warnings: [],
        errors: [],
        suggestedActions: [],
      };
    }

    if (plan.execution.kind === "client_update") {
      await executeClientUpdatePlan(plan, requestContext?.origin, requestContext?.cookieHeader);
      plan.status = "completed";
      persistPlan(plan);

      return {
        ...base,
        status: "completed",
        responseMode: "execution_result",
        assistantMessage: `The approved ${plan.toolName === "update_partner_person_details" ? "partner" : "client"} detail changes were applied successfully for ${plan.clientName ?? "the selected client"}.`,
        plan: {
          planId: plan.planId,
          summary: plan.summary,
          requiresApproval: true,
          steps: [
            {
              stepId: plan.stepId,
              toolName: plan.toolName,
              kind: "write",
              status: "succeeded",
              description: plan.description,
              inputsPreview: plan.inputsPreview,
            },
          ],
        },
        results: [
          {
            stepId: plan.stepId,
            toolName: plan.toolName,
            status: "succeeded",
            summary: `Updated the selected ${plan.toolName === "update_partner_person_details" ? "partner" : "client"} details.`,
          },
        ],
        missingInformation: [],
        warnings: [],
        errors: [],
        suggestedActions: [],
      };
    }

    if (plan.execution.kind === "profile_collection") {
      await executeCollectionPlan(plan, liveContext, requestContext?.origin, requestContext?.cookieHeader);
      plan.status = "completed";
      persistPlan(plan);
      const collectionLabel = collectionKindLabel(String(plan.execution.payload.kind));
      const isUpdate = plan.toolName.startsWith("update_");

      return {
        ...base,
        status: "completed",
        responseMode: "execution_result",
        assistantMessage: isUpdate
          ? `The ${collectionLabel} record was updated successfully for ${plan.clientName ?? "the selected client"}.`
          : Array.isArray(plan.execution.payload.records)
            ? `${plan.execution.payload.records.length} ${collectionLabel} record${plan.execution.payload.records.length === 1 ? "" : "s"} were created successfully for ${plan.clientName ?? "the selected client"}.`
            : `The new ${collectionLabel} record was created successfully for ${plan.clientName ?? "the selected client"}.`,
        plan: {
          planId: plan.planId,
          summary: plan.summary,
          requiresApproval: true,
          steps: [
            {
              stepId: plan.stepId,
              toolName: plan.toolName,
              kind: "write",
              status: "succeeded",
              description: plan.description,
              inputsPreview: plan.inputsPreview,
            },
          ],
        },
        results: [
          {
            stepId: plan.stepId,
            toolName: plan.toolName,
            status: "succeeded",
            summary: isUpdate
              ? `Updated the requested ${collectionLabel} record.`
              : Array.isArray(plan.execution.payload.records)
                ? `Created ${plan.execution.payload.records.length} ${collectionLabel} record${plan.execution.payload.records.length === 1 ? "" : "s"}.`
                : `Created the requested ${collectionLabel} record.`,
          },
        ],
        missingInformation: [],
        warnings: [],
        errors: [],
        suggestedActions: [],
      };
    }

    plan.status = "failed";
    persistPlan(plan);

    return {
      ...base,
      status: "failed",
      responseMode: "error",
      assistantMessage: "This approval flow is wired up, but the selected execution type is not supported yet.",
      plan: {
        planId: plan.planId,
        summary: plan.summary,
        requiresApproval: true,
        steps: [
          {
            stepId: plan.stepId,
            toolName: plan.toolName,
            kind: "write",
            status: "failed",
            description: plan.description,
            inputsPreview: plan.inputsPreview,
          },
        ],
      },
      results: [
        {
          stepId: plan.stepId,
          toolName: plan.toolName,
          status: "failed",
          summary: "The selected execution type is not supported yet.",
        },
      ],
      missingInformation: [],
      warnings: [],
      errors: [{ code: "NOT_IMPLEMENTED", message: "The selected execution type is not implemented yet.", retryable: false }],
      suggestedActions: [],
    };
  } catch (error) {
    plan.status = "failed";
    persistPlan(plan);

    return {
      ...base,
      status: "failed",
      responseMode: "error",
      assistantMessage: error instanceof Error ? error.message : "Unable to execute the approved plan.",
      plan: {
        planId: plan.planId,
        summary: plan.summary,
        requiresApproval: true,
        steps: [
          {
            stepId: plan.stepId,
            toolName: plan.toolName,
            kind: "write",
            status: "failed",
            description: plan.description,
            inputsPreview: plan.inputsPreview,
          },
        ],
      },
      results: [
        {
          stepId: plan.stepId,
          toolName: plan.toolName,
          status: "failed",
          summary: error instanceof Error ? error.message : "Unable to execute the approved plan.",
        },
      ],
      missingInformation: [],
      warnings: [],
      errors: [{ code: "PLAN_EXECUTION_FAILED", message: error instanceof Error ? error.message : "Plan execution failed.", retryable: true }],
      suggestedActions: [],
    };
  }
}

export async function handleFinleyChat(request: FinleyChatRequest): Promise<FinleyChatResponse> {
  const message = request.message.trim();
  const liveContext = await loadLiveContext(request.activeClientId, request.activeClientName);
  const base = buildBaseResponse(request, liveContext);
  const clientName = liveContext.resolvedClientName ?? "the selected client";
  const lower = message.toLowerCase();

  if (!message) {
    return {
      ...base,
      status: "failed",
      responseMode: "error",
      assistantMessage: "A chat message is required before Finley can plan a workflow.",
      plan: null,
      results: [],
      missingInformation: [{ field: "message", question: "What would you like Finley to do?" }],
      warnings: [],
      errors: [{ code: "EMPTY_MESSAGE", message: "A chat message is required.", retryable: true }],
      suggestedActions: [],
    };
  }

  if (!liveContext.resolvedClientId) {
    return {
      ...base,
      status: "needs_clarification",
      responseMode: "clarification",
      assistantMessage: "Select a client first so Finley can scope the request to the correct record.",
      plan: null,
      results: [],
      missingInformation: [{ field: "activeClientId", question: "Which client should I work on?" }],
      warnings: [],
      errors: [],
      suggestedActions: [],
    };
  }

  const looksLikeReadQuestion =
    lower.includes("what is") ||
    lower.includes("what's") ||
    lower.startsWith("what ") ||
    lower.includes("show me") ||
    lower.includes("tell me") ||
    lower.includes("summarise") ||
    lower.includes("summarize") ||
    lower.includes("summary") ||
    lower.includes("key details") ||
    lower.includes("overview") ||
    lower.startsWith("who is") ||
    lower.startsWith("get ");

  if (looksLikeReadQuestion) {
    const readAnswer = buildProfileReadAnswer(message, liveContext);

    if (readAnswer.matched) {
      return {
        ...base,
        status: "completed",
        responseMode: "inform",
        assistantMessage: readAnswer.assistantMessage,
        plan: null,
        results: [],
        missingInformation: readAnswer.missingInformation,
        warnings: readAnswer.warnings,
        errors: [],
        displayCard: null,
        editorCard: null,
        suggestedActions: [],
      };
    }

    const collectionReadAnswer = buildCollectionReadAnswer(message, liveContext);

    if (collectionReadAnswer.matched) {
      return {
        ...base,
        status: "completed",
        responseMode: "inform",
        assistantMessage: collectionReadAnswer.assistantMessage,
        plan: null,
        results: [],
        missingInformation: collectionReadAnswer.missingInformation,
        warnings: collectionReadAnswer.warnings,
        errors: [],
        displayCard: collectionReadAnswer.displayCard ?? null,
        editorCard: null,
        suggestedActions: [],
      };
    }
  }

  if (lower.includes("file note") || lower.includes("note")) {
    const planId = makeId("plan");
    const stepId = makeId("step");
    const noteText = normalizeFileNoteText(message);
    const subject = noteText.slice(0, 80);
    const noteKind = getFinleyFileNoteType(message);
    const payload = {
      id: null,
      clientId: liveContext.resolvedClientId,
      owner: liveContext.profile?.client?.id
        ? {
            id: liveContext.profile.client.id,
            name: liveContext.profile.client.name ?? liveContext.resolvedClientName ?? "",
          }
        : null,
      joint: false,
      licensee: liveContext.profile?.licensee ?? null,
      practice: liveContext.profile?.practice ?? null,
      adviser: liveContext.profile?.adviser
        ? {
            name: liveContext.profile.adviser.name ?? null,
            email: liveContext.profile.adviser.email ?? null,
          }
        : null,
      content: noteText,
      serviceDate: new Date().toISOString().slice(0, 10),
      type: noteKind.type,
      subType: noteKind.subType,
      subject,
      attachment: [],
    };

    persistPlan({
      planId,
      threadId: base.threadId,
      createdAt: base.timestamp,
      clientId: liveContext.resolvedClientId,
      clientName,
      profileId: liveContext.profile?.id ?? undefined,
      userId: liveContext.currentUser?.id ?? null,
      userRole: liveContext.currentUser?.userRole ?? null,
      status: "pending",
      summary: `Create a file note for ${clientName}`,
      toolName: "create_file_note",
      stepId,
      description: "Save a new file note on the selected client record with the supplied meeting summary.",
      inputsPreview: {
        clientId: liveContext.resolvedClientId,
        subject,
        content: noteText,
        serviceDate: payload.serviceDate,
        type: noteKind.type,
        subType: noteKind.subType,
      },
      execution: {
        kind: "file_note",
        payload,
      },
    });

    return {
      ...base,
      status: "awaiting_approval",
      responseMode: "plan",
      assistantMessage: `I am ready to create a file note for ${clientName}. I will save the note subject, service date, and content against the selected client record after approval.`,
      editorCard: {
        kind: "collection_form",
        title: "New File Note",
        toolName: "create_file_note",
        fields: [
          {
            key: "serviceDate",
            label: "Service Date",
            input: "text",
            value: payload.serviceDate,
          },
          {
            key: "subject",
            label: "Subject",
            input: "text",
            value: subject,
          },
          {
            key: "type",
            label: "Type",
            input: "select",
            value: noteKind.type,
            options: toCardOptions(FINLEY_FILE_NOTE_TYPE_OPTIONS),
          },
          {
            key: "subType",
            label: "Subtype",
            input: "select",
            value: noteKind.subType,
            options: toCardOptions(FINLEY_FILE_NOTE_SUBTYPE_OPTIONS[noteKind.type] ?? []),
          },
          {
            key: "content",
            label: "Body",
            input: "textarea",
            value: noteText,
          },
        ],
      },
      plan: {
        planId,
        summary: `Create a file note for ${clientName}`,
        requiresApproval: true,
        steps: [
          {
            stepId,
            toolName: "create_file_note",
            kind: "write",
            status: "pending",
            description: "Save a new file note on the selected client record with the supplied meeting summary.",
            inputsPreview: {
              clientId: liveContext.resolvedClientId,
              subject,
              content: noteText,
              serviceDate: payload.serviceDate,
              type: noteKind.type,
              subType: noteKind.subType,
            },
          },
        ],
      },
      results: [],
      missingInformation: [],
      warnings: [],
      errors: [],
      suggestedActions: [
        { label: "Approve and run", action: "approve_plan", planId },
        { label: "Cancel", action: "cancel_plan", planId },
      ],
    };
  }

  const collectionIntent = extractCollectionIntent(message, liveContext);
  const collectionUpdateIntent = extractCollectionUpdateIntent(message, liveContext);

  if (collectionIntent) {
    if (collectionIntent.missingInformation.length > 0) {
      return {
        ...base,
        status: "needs_clarification",
        responseMode: "clarification",
        assistantMessage: `I can create that ${collectionIntent.inputsPreview.section?.toString().toLowerCase() ?? "record"} for ${clientName}, but I still need a bit more detail first.`,
        plan: null,
        results: [],
        missingInformation: collectionIntent.missingInformation.map((field) => ({
          field,
          question: `Please provide the ${field} for this new ${collectionIntent.inputsPreview.section?.toString().toLowerCase() ?? "record"}.`,
        })),
        warnings: [],
        errors: [],
        displayCard: null,
        editorCard: collectionIntent.editorCard ?? null,
        suggestedActions: [],
      };
    }

    const planId = makeId("plan");
    const stepId = makeId("step");

    persistPlan({
      planId,
      threadId: base.threadId,
      createdAt: base.timestamp,
      clientId: liveContext.resolvedClientId,
      clientName,
      profileId: liveContext.profile?.id ?? undefined,
      userId: liveContext.currentUser?.id ?? null,
      userRole: liveContext.currentUser?.userRole ?? null,
      status: "pending",
      summary: collectionIntent.summary,
      toolName: collectionIntent.toolName,
      stepId,
      description: collectionIntent.description,
      inputsPreview: collectionIntent.inputsPreview,
      execution: {
        kind: "profile_collection",
        payload: collectionIntent.payload,
      },
    });

    return {
      ...base,
      status: "awaiting_approval",
      responseMode: "plan",
      assistantMessage: `I am ready to create this ${collectionIntent.inputsPreview.section?.toString().toLowerCase() ?? "record"} for ${clientName}. I will save it to the selected client profile after approval.`,
      plan: {
        planId,
        summary: collectionIntent.summary,
        requiresApproval: true,
        steps: [
          {
            stepId,
            toolName: collectionIntent.toolName,
            kind: "write",
            status: "pending",
            description: collectionIntent.description,
            inputsPreview: collectionIntent.inputsPreview,
          },
        ],
      },
      results: [],
      missingInformation: [],
      warnings: [],
      errors: [],
      displayCard: null,
      editorCard: collectionIntent.editorCard ?? null,
      suggestedActions: [
        { label: "Approve and run", action: "approve_plan", planId },
        { label: "Cancel", action: "cancel_plan", planId },
      ],
    };
  }

  if (collectionUpdateIntent) {
    return buildCollectionUpdatePlanResponse(base, liveContext, collectionUpdateIntent);
  }

  const wantsClarificationHelp =
    lower.includes("what else do you need") ||
    lower.includes("what do you need") ||
    lower.includes("what details do you need") ||
    lower.includes("what information do you need");

  if (wantsClarificationHelp) {
    const recentUserMessage = getRecentRelevantUserMessage(request.recentMessages);
    const recentCollectionIntent = recentUserMessage ? extractCollectionIntent(recentUserMessage, liveContext) : null;

    if (recentCollectionIntent?.missingInformation.length) {
      return {
        ...base,
        status: "needs_clarification",
        responseMode: "clarification",
        assistantMessage: `To create this ${recentCollectionIntent.inputsPreview.section?.toString().toLowerCase() ?? "record"} for ${clientName}, I still need: ${recentCollectionIntent.missingInformation.join(", ")}.`,
        plan: null,
        results: [],
        missingInformation: recentCollectionIntent.missingInformation.map((field) => ({
          field,
          question: `Provide the ${field} for this new ${recentCollectionIntent.inputsPreview.section?.toString().toLowerCase() ?? "record"}.`,
        })),
        warnings: [],
        errors: [],
        suggestedActions: [],
      };
    }
  }

  const looksLikeMissingInfoReview =
    lower.includes("missing") ||
    lower.includes("missing information") ||
    lower.includes("missing info") ||
    lower.includes("annual review") ||
    lower.includes("review preparation") ||
    lower.includes("prepare for review") ||
    lower.includes("review checklist");

  if (looksLikeMissingInfoReview) {
    const missing = countMissingFields(liveContext.profile);
    const recentNotes = liveContext.fileNotes.length;
    const summary =
      missing.length > 0
        ? `${clientName} is missing ${missing.join(", ")}. I also found ${recentNotes} recent file note${recentNotes === 1 ? "" : "s"} to review before annual review preparation.`
        : `${clientName} has the main core details populated. I found ${recentNotes} recent file note${recentNotes === 1 ? "" : "s"} to check before annual review preparation.`;

    return {
      ...base,
      status: "completed",
      responseMode: "inform",
      assistantMessage: summary,
      plan: {
        planId: makeId("plan"),
        summary: `Review ${clientName} for missing information`,
        requiresApproval: false,
        steps: [
          buildPlanStep("get_client_summary", "Load the selected client's profile, adviser context, and recent activity."),
          buildPlanStep("find_missing_client_fields", "Check for missing data needed before annual review preparation."),
          buildPlanStep("list_client_file_notes", "Inspect recent client file notes for follow-up items.", "pending", {
            clientId: liveContext.resolvedClientId,
            noteCount: recentNotes,
          }),
        ],
      },
      results: [],
      missingInformation: missing.map((field) => ({
        field,
        question: `Provide the client's ${field} so Finley can complete review preparation.`,
      })),
      warnings: liveContext.profile ? [] : ["Live client profile was not available, so this checklist may be incomplete."],
      errors: [],
      suggestedActions: [],
    };
  }

  if (lower.includes("update") || lower.includes("change") || lower.includes("mobile") || lower.includes("email") || lower.includes("address")) {
    const planId = makeId("plan");
    const stepId = makeId("step");
    const extracted = extractClientUpdatePayload(message, request.recentMessages);
    const extractedFields = Object.keys(extracted.changes);
    const isPartner = extracted.target === "partner";
    const personId = isPartner ? liveContext.profile?.partner?.id ?? null : liveContext.profile?.client?.id ?? null;
    const toolName = isPartner ? "update_partner_person_details" : "update_client_person_details";

    persistPlan({
      planId,
      threadId: base.threadId,
      createdAt: base.timestamp,
      clientId: liveContext.resolvedClientId,
      clientName,
      profileId: liveContext.profile?.id ?? undefined,
      userId: liveContext.currentUser?.id ?? null,
      userRole: liveContext.currentUser?.userRole ?? null,
      status: "pending",
      summary: `Update ${isPartner ? "partner" : "client"} details for ${clientName}`,
      toolName,
      stepId,
      description: `Prepare a patch for the selected ${isPartner ? "partner" : "client"}'s contact and profile changes.`,
      inputsPreview: {
        clientId: liveContext.resolvedClientId,
        requestedChange: message,
        extractedFields,
        target: extracted.target,
      },
      execution: {
        kind: "client_update",
        payload: {
          requestedChange: message,
          target: extracted.target,
          personId,
          changes: extracted.changes,
        },
      },
    });

    return {
      ...base,
      status: "awaiting_approval",
      responseMode: "plan",
      assistantMessage: `I can prepare an update plan for ${clientName}. The next step is to confirm the exact ${isPartner ? "partner" : "client"} field changes, then apply them through the profile update tool.`,
      plan: {
        planId,
        summary: `Update ${isPartner ? "partner" : "client"} details for ${clientName}`,
        requiresApproval: true,
        steps: [
          buildPlanStep("get_client_summary", "Load the latest client profile before preparing the field changes.", "pending", {
            profileId: liveContext.profile?.id ?? null,
          }),
          {
            stepId,
            toolName,
            kind: "write",
            status: "pending",
            description: `Prepare a patch for the selected ${isPartner ? "partner" : "client"}'s contact and profile changes.`,
            inputsPreview: {
              clientId: liveContext.resolvedClientId,
              requestedChange: message,
              extractedFields,
              target: extracted.target,
            },
          },
        ],
      },
      results: [],
      missingInformation: [],
      warnings:
        extractedFields.length > 0
          ? [`Finley extracted these update fields for execution: ${extractedFields.join(", ")}.`]
          : ["Finley could not safely extract concrete fields from this request yet, so use the editor below to confirm the details before approval."],
      errors: [],
      editorCard: buildClientUpdateEditorCard(toolName, extracted.target, extracted.changes),
      suggestedActions: [
        { label: "Approve and run", action: "approve_plan", planId },
        { label: "Cancel", action: "cancel_plan", planId },
      ],
    };
  }

  return {
    ...base,
    status: "needs_clarification",
    responseMode: "clarification",
    assistantMessage: `I understand the request for ${clientName}, but I need a little more specificity before I map it to the correct client workflow.`,
    plan: null,
    results: [],
    missingInformation: [
      {
        field: "intent",
        question: "Do you want Finley to update client details, create a note, review missing information, or handle a document workflow?",
      },
    ],
    warnings: [],
    errors: [],
    displayCard: null,
    editorCard: null,
    suggestedActions: [],
  };
}
