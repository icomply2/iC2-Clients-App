import type { UpdateClientDetailsInput } from "@/lib/api/contracts/client-updates";
import type { ClientAdviserRecord, PersonRecord } from "@/lib/api/types";
import { updatePersonDetails } from "@/lib/api/adapters/client-updates";

type RequestContext = {
  origin?: string | null;
  cookieHeader?: string | null;
  apiBaseUrl?: string | null;
  token?: string | null;
  currentUser?: { id?: string | null; name?: string | null; email?: string | null } | null;
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
    primaryEmployment?: string;
    startDate?: string;
    endDate?: string;
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

function getStringCandidate(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();

  return values.filter((value) => {
    const normalized = value.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
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

  const changedStatusValue = typeof changes.status === "string" && changes.status.trim() ? changes.status.trim() : "";
  const currentClientStatusValue = getStringValue(current, ["status", "clientStatus"]);
  const currentAccountStatusValue = getStringValue(current, ["accountStatus"]);
  const statusValue =
    changedStatusValue || currentClientStatusValue || (currentAccountStatusValue === "Archived" ? currentAccountStatusValue : "");
  const accountStatusValue = (changedStatusValue || currentAccountStatusValue || currentClientStatusValue) === "Archived" ? "Archived" : "Active";

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
  const adviceAgreementValue = parseBooleanValue(adviceAgreementRaw);
  const agreementTypeValue =
    typeof changes.agreementType === "string" && changes.agreementType.trim()
      ? changes.agreementType.trim()
      : getStringValue(current, ["agreementType", "annualAgreementStatus"]);
  const nextAnniversaryDateValue =
    typeof changes.nextAnniversaryDate === "string" && changes.nextAnniversaryDate.trim()
      ? changes.nextAnniversaryDate.trim()
      : getStringValue(current, ["nextAnniversaryDate"]);
  const currentAnnualAgreement =
    current.annualAgreement && typeof current.annualAgreement === "object"
      ? (current.annualAgreement as Record<string, unknown>)
      : {};
  const riskProfileResponse =
    typeof changes.riskProfile === "string"
      ? {
          ...(current.riskProfileResponse && typeof current.riskProfileResponse === "object"
            ? (current.riskProfileResponse as Record<string, unknown>)
            : {}),
          resultDisplay: changes.riskProfile.trim(),
        }
      : current.riskProfileResponse ?? null;

  const payload: Record<string, unknown> = {
    id: input.personId,
    ic2AppId: current.ic2AppId ?? null,
    declaration:
      typeof changes.declaration === "boolean"
        ? changes.declaration
        : typeof current.declaration === "boolean"
          ? current.declaration
          : null,
    picture: typeof current.picture === "string" ? current.picture : null,
    fdsAnnualAgreementRequired: adviceAgreementValue,
    annualAgreementRequired: adviceAgreementValue,
    fdsRequired: adviceAgreementValue,
    annualAgreementStatus: agreementTypeValue || null,
    agreementType: agreementTypeValue || null,
    nextAnniversaryDate: nextAnniversaryDateValue || null,
    annualAgreement: {
      ...currentAnnualAgreement,
      type: agreementTypeValue || null,
      agreementType: agreementTypeValue || null,
      nextDueDate: nextAnniversaryDateValue || null,
      nextAnniversaryDate: nextAnniversaryDateValue || null,
    },
    category: categoryValue || null,
    clientCategory: categoryValue || null,
    preferredPhone: preferredPhoneValue || null,
    entityId: typeof current.entityId === "string" ? current.entityId : null,
    sharedWith: Array.isArray(current.sharedWith) ? current.sharedWith : [],
    accountStatus: accountStatusValue,
    status: statusValue || null,
    clientStatus: statusValue || null,
    onboardingStatus:
      typeof changes.onboardingStatus === "string" && changes.onboardingStatus.trim()
        ? changes.onboardingStatus.trim()
        : current.onboardingStatus ?? null,
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
    nationality:
      typeof changes.nationality === "string"
        ? changes.nationality.trim() || null
        : typeof current.nationality === "string"
          ? current.nationality
          : null,
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
    riskProfileResponse,
  };

  return payload;
}

export async function updateClientDetails(input: UpdateClientDetailsInput, context?: RequestContext) {
  const personRecord = ((input.person ?? {}) as MutablePersonRecord) || {};
  const candidateIds = uniqueStrings([
    input.personId,
    getStringCandidate(personRecord.id),
    getStringCandidate(personRecord.ic2AppId),
    getStringCandidate(personRecord.entityId),
    input.profileId,
  ]);
  let lastClientNotFoundError: unknown = null;

  for (const candidateId of candidateIds) {
    const candidateInput = { ...input, target: "client" as const, personId: candidateId };
    const payload = buildClientPersonPayload(candidateInput);

    try {
      return await updatePersonDetails(candidateInput, payload, context);
    } catch (error) {
      if (!(error instanceof Error) || !/client\s+id\b.*was not found/i.test(error.message)) {
        throw error;
      }

      lastClientNotFoundError = error;
    }
  }

  try {
    return await patchClientOnProfile(
      { ...input, target: "client", personId: candidateIds[0] ?? input.personId },
      buildClientPersonPayload({ ...input, target: "client", personId: candidateIds[0] ?? input.personId }),
      context,
    );
  } catch (error) {
    if (lastClientNotFoundError instanceof Error && error instanceof Error && /client\s+id\b.*was not found/i.test(error.message)) {
      throw lastClientNotFoundError;
    }

    throw error;
  }
}

export async function updatePartnerDetails(input: UpdateClientDetailsInput, context?: RequestContext) {
  return updatePersonDetails({ ...input, target: "partner" }, buildClientPersonPayload(input), context);
}

export async function updateClientProfileAdviser(
  profileId: string,
  payload: {
    adviser: ClientAdviserRecord | null;
    practiceName?: string | null;
    licenseeName?: string | null;
  },
  context?: RequestContext,
) {
  const response = await fetch(resolveUrl(`/api/client-profiles/${encodeURIComponent(profileId)}`, context), {
    method: "PATCH",
    headers: buildHeaders(context),
    body: JSON.stringify({
      adviser: payload.adviser,
    }),
    cache: "no-store",
  });

  const text = await response.text().catch(() => "");
  const body = (() => {
    if (!text) return null;
    try {
      return JSON.parse(text) as { message?: string | null; status?: boolean | null; data?: boolean | null };
    } catch {
      return null;
    }
  })();

  if (!response.ok || (body && body.status === false)) {
    throw new Error(body?.message ?? (text.trim() || "Unable to save adviser details."));
  }

  return body?.data ?? true;
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

function canWriteDirect(context?: RequestContext) {
  return Boolean(context?.apiBaseUrl && context.token && context.currentUser?.id);
}

function canPatchDirect(context?: RequestContext) {
  return Boolean(context?.apiBaseUrl && context.token);
}

async function patchClientOnProfile(
  input: UpdateClientDetailsInput,
  payload: Record<string, unknown>,
  context?: RequestContext,
) {
  const profilePatch = {
    client: payload,
  };
  const response = canPatchDirect(context)
    ? await fetch(new URL(`/api/ClientProfiles/${encodeURIComponent(input.profileId)}`, context!.apiBaseUrl!), {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${context!.token}`,
        },
        body: JSON.stringify(profilePatch),
        cache: "no-store",
      })
    : await fetch(resolveUrl(`/api/client-profiles/${encodeURIComponent(input.profileId)}`, context), {
        method: "PATCH",
        headers: buildHeaders(context),
        body: JSON.stringify(profilePatch),
        cache: "no-store",
      });

  const text = await response.text().catch(() => "");
  const body = (() => {
    if (!text) return null;
    try {
      return JSON.parse(text) as { message?: string | null; status?: boolean | null; data?: boolean | Record<string, unknown> | null };
    } catch {
      return null;
    }
  })();

  if (!response.ok || (body && body.status === false)) {
    throw new Error(body?.message ?? (text.trim() || "Unable to save changes."));
  }

  return body;
}

export async function upsertEmploymentRecords(input: EmploymentUpsertInput, context?: RequestContext) {
  const payload = {
    request: input.request.map((item, index) => ({
      id: item.id || null,
      jobTitle: item.jobTitle ?? "",
      status: item.status ?? "",
      employer: item.employer ?? "",
      salary: item.salary ?? "",
      frequency: item.frequency ?? "",
      primaryEmployment: item.primaryEmployment ? item.primaryEmployment === "Yes" : index === 0,
      startDate: item.startDate || null,
      endDate: item.endDate || null,
      owner: input.owner,
    })),
  };
  const response = canWriteDirect(context)
    ? await fetch(new URL(`/api/ClientProfiles/${encodeURIComponent(input.profileId)}/Employments`, context!.apiBaseUrl!), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${context!.token}`,
        },
        body: JSON.stringify({
          ...payload,
          currentUser: context!.currentUser,
        }),
        cache: "no-store",
      })
    : await fetch(resolveUrl(`/api/client-profiles/${encodeURIComponent(input.profileId)}/employments`, context), {
        method: "POST",
        headers: buildHeaders(context),
        body: JSON.stringify(payload),
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
  const payload = {
    request: riskProfile.trim()
      ? {
          resultDisplay: riskProfile,
        }
      : {},
  };
  const response = context?.apiBaseUrl && context.token
    ? await fetch(
        new URL(
          `/api/ClientProfiles/${encodeURIComponent(input.profileId)}/${target === "partner" ? "Partner" : "Client"}/${encodeURIComponent(input.personId)}/RiskProfile`,
          context.apiBaseUrl,
        ),
        {
          method: "PUT",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${context.token}`,
          },
          body: JSON.stringify({
            ...payload,
            currentUser: context.currentUser,
          }),
          cache: "no-store",
        },
      )
    : await fetch(
        resolveUrl(
          `/api/client-profiles/${encodeURIComponent(input.profileId)}/${target}/${encodeURIComponent(input.personId)}/risk-profile`,
          context,
        ),
        {
          method: "PUT",
          headers: buildHeaders(context),
          body: JSON.stringify(payload),
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
