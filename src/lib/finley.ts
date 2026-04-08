import { getClientProfile, getClientProfileId } from "@/lib/api/clients";
import type { ClientProfile, FileNoteRecord, UserSummary } from "@/lib/api/types";
import { readAuthTokenFromCookies } from "@/lib/auth";
import { API_BASE_URL, requireCurrentUser } from "@/app/api/client-profiles/_shared";
import {
  FINLEY_FILE_NOTE_SUBTYPE_OPTIONS,
  FINLEY_FILE_NOTE_TYPE_OPTIONS,
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
  toolName: "create_file_note" | "update_client_person_details" | "update_partner_person_details";
  stepId: string;
  description: string;
  inputsPreview?: Record<string, unknown>;
  execution: {
    kind: "file_note" | "client_update";
    payload: Record<string, unknown>;
  };
};

type PlanExecutionOverrides = {
  type?: string;
  subType?: string;
};

declare global {
  var __finleyPlanStore: Map<string, StoredPlan> | undefined;
}

const planStore = globalThis.__finleyPlanStore ?? new Map<string, StoredPlan>();

if (!globalThis.__finleyPlanStore) {
  globalThis.__finleyPlanStore = planStore;
}

function normalizeFileNoteText(message: string) {
  const trimmed = message.trim();
  const cleaned = trimmed
    .replace(/^create\s+a\s+file\s+note\s+(saying|that)\s+/i, "")
    .replace(/^create\s+a\s+file\s+note\s+/i, "")
    .replace(/^add\s+a\s+file\s+note\s+(saying|that)\s+/i, "")
    .replace(/^add\s+a\s+file\s+note\s+/i, "")
    .replace(/^note\s+(that|saying)\s+/i, "")
    .trim();

  return cleaned || trimmed;
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

function applyFileNoteOverrides(plan: StoredPlan, overrides?: PlanExecutionOverrides | null) {
  if (!overrides || plan.execution.kind !== "file_note") return plan;

  const payload = { ...plan.execution.payload };
  const inputsPreview = { ...(plan.inputsPreview ?? {}) };

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

function extractClientUpdatePayload(message: string, recentMessages?: FinleyChatRequest["recentMessages"]) {
  const payload: Record<string, unknown> = {};
  const lower = message.toLowerCase();
  const target = /\bpartner\b/.test(lower) ? "partner" : "client";

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
    /\b(?:dob|date of birth)\s*(?:to|is|=|:)?\s*([A-Za-z0-9/\-\s]+)/i,
  ]);
  const normalizedDob = dobValue ? normalizeDateToIso(dobValue) : null;
  if (normalizedDob) {
    payload.dateOfBirth = normalizedDob;
  }

  const inferredContextField = inferContextField(message, recentMessages);
  const genericValue = extractAfterLabel([
    /\b(?:update|change)(?:\s+it)?\s+to\s+([A-Za-z0-9@./\-\s]+)\b/i,
    /\bset(?:\s+it)?\s+to\s+([A-Za-z0-9@./\-\s]+)\b/i,
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
    /\b(?:next anniversary date|anniversary date)\s*(?:to|is|=|:)?\s*([A-Za-z0-9/\-\s]+)/i,
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

async function executeFileNotePlan(plan: StoredPlan, token: string, origin?: string | null, cookieHeader?: string | null) {
  if (!API_BASE_URL) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured.");
  }

  if (origin && cookieHeader) {
    const response = await fetch(`${origin}/api/client-profiles/file-notes`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        request: plan.execution.payload,
      }),
      cache: "no-store",
    });

    const responseText = await response.text();
    const body = (() => {
      if (!responseText) return null;
      try {
        return JSON.parse(responseText) as
          | { message?: string | null; modelErrors?: { errorMessage?: string | null }[] | null }
          | null;
      } catch {
        return null;
      }
    })();

    if (!response.ok) {
      const modelError = Array.isArray(body?.modelErrors)
        ? body?.modelErrors.find((entry) => entry?.errorMessage)?.errorMessage
        : null;
      throw new Error((modelError ?? body?.message ?? responseText) || "Unable to create the file note.");
    }

    return;
  }

  const currentUserResult = await requireCurrentUser(token);
  if ("error" in currentUserResult) {
    throw new Error(currentUserResult.error.message);
  }

  const response = await fetch(new URL("/api/ClientProfiles/FileNote", API_BASE_URL), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      request: plan.execution.payload,
      currentUser: currentUserResult.currentUser,
    }),
    cache: "no-store",
  });

  const responseText = await response.text();
  const body = (() => {
    if (!responseText) return null;
    try {
      return JSON.parse(responseText) as
        | { message?: string | null; modelErrors?: { errorMessage?: string | null }[] | null }
        | null;
    } catch {
      return null;
    }
  })() as
    | { message?: string | null; modelErrors?: { errorMessage?: string | null }[] | null }
    | null;
  if (!response.ok) {
    const modelError = Array.isArray(body?.modelErrors)
      ? body?.modelErrors.find((entry) => entry?.errorMessage)?.errorMessage
      : null;
    throw new Error((modelError ?? body?.message ?? responseText) || "Unable to create the file note.");
  }
}

async function executeClientUpdatePlan(plan: StoredPlan, token: string) {
  if (!API_BASE_URL) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured.");
  }

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

  const executableChanges: Record<string, unknown> = { ...changes };

  if (typeof changes.dateOfBirth === "string" && !("dob" in executableChanges)) {
    executableChanges.dob = changes.dateOfBirth;
  }

  if (typeof changes.preferredPhone === "string") {
    executableChanges.phone = changes.preferredPhone;
    executableChanges.mobile = changes.preferredPhone;
    executableChanges.mobilePhone = changes.preferredPhone;
    executableChanges.contact = {
      preferredPhone: changes.preferredPhone,
      phone: changes.preferredPhone,
    };
  }

  if (
    typeof changes.street === "string" ||
    typeof changes.suburb === "string" ||
    typeof changes.state === "string" ||
    typeof changes.postCode === "string"
  ) {
    executableChanges.address = {
      ...(typeof changes.street === "string" ? { street: changes.street } : {}),
      ...(typeof changes.suburb === "string" ? { suburb: changes.suburb } : {}),
      ...(typeof changes.state === "string" ? { state: changes.state } : {}),
      ...(typeof changes.postCode === "string" ? { postCode: changes.postCode, postcode: changes.postCode } : {}),
    };
  }

  const targetSegment = target === "partner" ? "Partner" : "Client";

  const response = await fetch(new URL(`/api/ClientProfiles/${encodeURIComponent(profileId)}/${targetSegment}/${encodeURIComponent(personId)}`, API_BASE_URL), {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(executableChanges),
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as { message?: string } | null;
  if (!response.ok) {
    throw new Error(body?.message ?? "Unable to update the client details.");
  }
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
      await executeFileNotePlan(plan, token, requestContext?.origin, requestContext?.cookieHeader);
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
      await executeClientUpdatePlan(plan, token);
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
          : ["Finley could not safely extract concrete fields from this request yet, so approval will still fail until the request is more specific."],
      errors: [],
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
    plan: {
      planId: makeId("plan"),
      summary: `Clarify the requested workflow for ${clientName}`,
      requiresApproval: false,
      steps: [
        buildPlanStep("classify_request", "Determine whether this is a read request, a profile update, a document task, or a note workflow."),
      ],
    },
    results: [],
    missingInformation: [
      {
        field: "intent",
        question: "Do you want Finley to update client details, create a note, review missing information, or handle a document workflow?",
      },
    ],
    warnings: [],
    errors: [],
    suggestedActions: [],
  };
}
