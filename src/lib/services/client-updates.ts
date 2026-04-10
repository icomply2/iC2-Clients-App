import type { ClientDetailChanges, UpdateClientDetailsInput } from "@/lib/api/contracts/client-updates";
import { updatePersonDetails } from "@/lib/api/adapters/client-updates";

type RequestContext = {
  origin?: string | null;
  cookieHeader?: string | null;
};

export function buildClientPatchPayload(changes: ClientDetailChanges) {
  const payload: Record<string, unknown> = {};

  if (typeof changes.title === "string") {
    payload.title = changes.title;
  }

  if (typeof changes.name === "string") {
    payload.name = changes.name;
  }

  if (typeof changes.email === "string") {
    payload.email = changes.email;
  }

  if (typeof changes.gender === "string") {
    payload.gender = changes.gender;
  }

  if (typeof changes.dateOfBirth === "string") {
    payload.dateOfBirth = changes.dateOfBirth;
  }

  if (typeof changes.maritalStatus === "string") {
    payload.maritalStatus = changes.maritalStatus;
  }

  if (typeof changes.residentStatus === "string") {
    payload.residentStatus = changes.residentStatus;
  }

  if (
    typeof changes.street === "string" ||
    typeof changes.suburb === "string" ||
    typeof changes.state === "string" ||
    typeof changes.postCode === "string"
  ) {
    payload.address = [
      typeof changes.street === "string" ? changes.street.trim() : "",
    ].filter(Boolean).join(", ");
    payload.suburb = typeof changes.suburb === "string" ? changes.suburb.trim() : "";
    payload.state = typeof changes.state === "string" ? changes.state.trim() : "";
    payload.postcode = typeof changes.postCode === "string" ? changes.postCode.trim() : "";
  }

  if (
    typeof changes.healthStatus === "string" ||
    typeof changes.healthHistory === "string" ||
    typeof changes.smoker === "string" ||
    typeof changes.healthInsurance === "string"
  ) {
    if (typeof changes.healthStatus === "string") {
      payload.healthStatus = changes.healthStatus;
    }

    if (typeof changes.healthHistory === "string") {
      payload.healthHistory = changes.healthHistory;
    }

    if (typeof changes.smoker === "string") {
      payload.smoker = changes.smoker;
    }

    if (typeof changes.healthInsurance === "string") {
      payload.healthInsurance = changes.healthInsurance;
    }
  }

  return payload;
}

export async function updateClientDetails(input: UpdateClientDetailsInput, context?: RequestContext) {
  return updatePersonDetails({ ...input, target: "client" }, buildClientPatchPayload(input.changes), context);
}

export async function updatePartnerDetails(input: UpdateClientDetailsInput, context?: RequestContext) {
  return updatePersonDetails({ ...input, target: "partner" }, buildClientPatchPayload(input.changes), context);
}

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
