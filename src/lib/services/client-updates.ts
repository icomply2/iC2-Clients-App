import type { UpdateClientDetailsInput } from "@/lib/api/contracts/client-updates";
import type { PersonRecord } from "@/lib/api/types";
import { updatePersonDetails } from "@/lib/api/adapters/client-updates";

type RequestContext = {
  origin?: string | null;
  cookieHeader?: string | null;
};

type MutablePersonRecord = PersonRecord & Record<string, unknown>;

type EmploymentUpsertInput = {
  profileId: string;
  owner: {
    id: string;
    name: string;
  };
  request: {
    id?: string;
    jobTitle?: string;
    status?: string;
    employer?: string;
    salary?: string;
    frequency?: string;
  }[];
};

function getStringValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return "";
}

function parseBooleanValue(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "yes" || normalized === "true") {
      return true;
    }

    if (normalized === "no" || normalized === "false") {
      return false;
    }
  }

  return null;
}

function buildClientPersonPayload(input: UpdateClientDetailsInput) {
  const current = ((input.person ?? {}) as MutablePersonRecord) || {};
  const { changes } = input;

  const statusValue =
    typeof changes.status === "string" && changes.status.trim()
      ? changes.status.trim()
      : getStringValue(current, ["accountStatus", "status", "clientStatus"]);

  const categoryValue =
    typeof changes.clientCategory === "string" && changes.clientCategory.trim()
      ? changes.clientCategory.trim()
      : getStringValue(current, ["category", "clientCategory"]);

  const preferredPhoneValue =
    typeof changes.preferredPhone === "string" && changes.preferredPhone.trim()
      ? changes.preferredPhone.trim()
      : getStringValue(current, ["preferredPhone", "phone", "mobile", "mobilePhone"]);

  const adviceAgreementRaw =
    typeof changes.adviceAgreementRequired === "string" && changes.adviceAgreementRequired.trim()
      ? changes.adviceAgreementRequired
      : current.fdsAnnualAgreementRequired ?? current.annualAgreementRequired ?? current.fdsRequired ?? null;

  const payload: Record<string, unknown> = {
    id: input.personId,
    ic2AppId: current.ic2AppId ?? null,
    declaration: typeof current.declaration === "boolean" ? current.declaration : null,
    picture: typeof current.picture === "string" ? current.picture : null,
    fdsAnnualAgreementRequired: parseBooleanValue(adviceAgreementRaw),
    annualAgreementStatus:
      typeof changes.agreementType === "string" && changes.agreementType.trim()
        ? changes.agreementType.trim()
        : getStringValue(current, ["annualAgreementStatus", "agreementType"]),
    nextAnniversaryDate:
      typeof changes.nextAnniversaryDate === "string" && changes.nextAnniversaryDate.trim()
        ? changes.nextAnniversaryDate.trim()
        : getStringValue(current, ["nextAnniversaryDate"]),
    category: categoryValue || null,
    preferredPhone: preferredPhoneValue || null,
    entityId: typeof current.entityId === "string" ? current.entityId : null,
    sharedWith: Array.isArray(current.sharedWith) ? current.sharedWith : [],
    accountStatus: statusValue || null,
    onboardingStatus: current.onboardingStatus ?? null,
    title:
      typeof changes.title === "string"
        ? changes.title.trim() || null
        : typeof current.title === "string"
          ? current.title
          : null,
    name:
      typeof changes.name === "string"
        ? changes.name.trim() || null
        : typeof current.name === "string"
          ? current.name
          : null,
    email:
      typeof changes.email === "string"
        ? changes.email.trim() || null
        : typeof current.email === "string"
          ? current.email
          : null,
    dob:
      typeof changes.dateOfBirth === "string"
        ? changes.dateOfBirth.trim() || null
        : typeof current.dob === "string"
          ? current.dob
          : null,
    gender:
      typeof changes.gender === "string"
        ? changes.gender.trim() || null
        : typeof current.gender === "string"
          ? current.gender
          : null,
    maritalStatus:
      typeof changes.maritalStatus === "string"
        ? changes.maritalStatus.trim() || null
        : getStringValue(current, ["maritalStatus"]) || null,
    nationalId: current.nationalId ?? {},
    nationalIds: current.nationalId ?? {},
    nationality: typeof current.nationality === "string" ? current.nationality : null,
    timeZone: typeof current.timeZone === "string" ? current.timeZone : null,
    addressPostCode:
      typeof changes.postCode === "string"
        ? changes.postCode.trim() || null
        : getStringValue(current, ["addressPostCode", "postCode", "postcode"]),
    addressState:
      typeof changes.state === "string"
        ? changes.state.trim() || null
        : getStringValue(current, ["addressState", "state"]),
    addressStreet:
      typeof changes.street === "string"
        ? changes.street.trim() || null
        : getStringValue(current, ["addressStreet", "street"]),
    addressSuburb:
      typeof changes.suburb === "string"
        ? changes.suburb.trim() || null
        : getStringValue(current, ["addressSuburb", "suburb"]),
    residentStatus:
      typeof changes.residentStatus === "string"
        ? changes.residentStatus.trim() || null
        : getStringValue(current, ["residentStatus"]) || null,
    healthStatus:
      typeof changes.healthStatus === "string"
        ? changes.healthStatus.trim() || null
        : getStringValue(current, ["healthStatus", "health_status"]) || null,
    healthHistory:
      typeof changes.healthHistory === "string"
        ? changes.healthHistory.trim() || null
        : getStringValue(current, ["healthHistory", "health_history"]) || null,
    riskProfileStatus: getStringValue(current, ["riskProfileStatus"]) || null,
    healthInsurance:
      typeof changes.healthInsurance === "string"
        ? changes.healthInsurance.trim() || null
        : getStringValue(current, ["healthInsurance", "health_insurance"]) || null,
    smoker:
      typeof changes.smoker === "string"
        ? changes.smoker.trim() || null
        : getStringValue(current, ["smoker"]) || null,
    riskProfileResponse: current.riskProfileResponse ?? null,
  };

  return payload;
}

export async function updateClientDetails(input: UpdateClientDetailsInput, context?: RequestContext) {
  return updatePersonDetails({ ...input, target: "client" }, buildClientPersonPayload(input), context);
}

export async function updatePartnerDetails(input: UpdateClientDetailsInput, context?: RequestContext) {
  return updatePersonDetails({ ...input, target: "partner" }, buildClientPersonPayload(input), context);
}

function resolveUrl(path: string, context?: RequestContext) {
  return context?.origin ? `${context.origin}${path}` : path;
}

function buildHeaders(context?: RequestContext) {
  return {
    "Content-Type": "application/json",
    ...(context?.cookieHeader ? { Cookie: context.cookieHeader } : {}),
  };
}

export async function upsertEmploymentRecords(input: EmploymentUpsertInput, context?: RequestContext) {
  const response = await fetch(resolveUrl(`/api/client-profiles/${encodeURIComponent(input.profileId)}/employments`, context), {
    method: "POST",
    headers: buildHeaders(context),
    body: JSON.stringify({
      request: input.request.map((item, index) => ({
        id: item.id || null,
        jobTitle: item.jobTitle ?? "",
        status: item.status ?? "",
        employer: item.employer ?? "",
        salary: item.salary ?? "",
        frequency: item.frequency ?? "",
        primaryEmployment: index === 0,
        owner: input.owner,
      })),
    }),
    cache: "no-store",
  });

  const text = await response.text().catch(() => "");
  const body = (() => {
    if (!text) return null;
    try {
      return JSON.parse(text) as { message?: string | null; status?: boolean | null; data?: unknown };
    } catch {
      return null;
    }
  })();

  if (!response.ok || (body && body.status === false)) {
    throw new Error(body?.message ?? (text.trim() || "Unable to save employment details."));
  }

  return Array.isArray(body?.data) ? body.data : [];
}

export async function deleteEmploymentRecord(profileId: string, employmentId: string, context?: RequestContext) {
  const response = await fetch(
    resolveUrl(`/api/client-profiles/${encodeURIComponent(profileId)}/employments/${encodeURIComponent(employmentId)}`, context),
    {
      method: "DELETE",
      headers: buildHeaders(context),
      cache: "no-store",
    },
  );

  const text = await response.text().catch(() => "");
  const body = (() => {
    if (!text) return null;
    try {
      return JSON.parse(text) as { message?: string | null; status?: boolean | null; data?: boolean | null };
    } catch {
      return null;
    }
  })();

  if (!response.ok || (body && (body.status === false || body.data === false))) {
    throw new Error(body?.message ?? (text.trim() || "Unable to remove employment record."));
  }

  return body;
}

export async function updatePersonRiskProfile(
  input: UpdateClientDetailsInput,
  riskProfile: string,
  context?: RequestContext,
) {
  const target = input.target === "partner" ? "partner" : "client";
  const response = await fetch(
    resolveUrl(
      `/api/client-profiles/${encodeURIComponent(input.profileId)}/${target}/${encodeURIComponent(input.personId)}/risk-profile`,
      context,
    ),
    {
      method: "PUT",
      headers: buildHeaders(context),
      body: JSON.stringify({
        request: riskProfile.trim()
          ? {
              resultDisplay: riskProfile,
            }
          : {},
      }),
      cache: "no-store",
    },
  );

  const text = await response.text().catch(() => "");
  const body = (() => {
    if (!text) return null;
    try {
      return JSON.parse(text) as { message?: string | null; status?: boolean | null; data?: Record<string, unknown> | null };
    } catch {
      return null;
    }
  })();

  if (!response.ok || (body && body.status === false)) {
    throw new Error(body?.message ?? (text.trim() || "Unable to save risk profile."));
  }

  return body?.data ?? null;
}
