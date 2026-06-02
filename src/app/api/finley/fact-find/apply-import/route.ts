import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/api/client";
import { getClientProfile, getClientProfileId } from "@/lib/api/clients";
import type {
  ClientAssetRecord,
  ClientDependantRecord,
  ClientEntityRecord,
  ClientExpenseRecord,
  ClientIncomeRecord,
  ClientLiabilityRecord,
  ClientPensionRecord,
  ClientPolicyRecord,
  ClientProfile,
  ClientSuperannuationRecord,
  PersonRecord,
  PolicyCoverRecord,
} from "@/lib/api/types";
import { readAuthTokenFromCookies, readCurrentUserFromCookies, type CurrentUser } from "@/lib/auth";
import {
  getFactFindInsurancePolicies,
  sanitizeFactFindImportCandidate,
  type FactFindImportCandidate,
  type FactFindInsuranceCoverCandidate,
  type FactFindOwnerRecord,
} from "@/lib/fact-find-import";
import { normalizeInsurancePolicyPayload } from "@/lib/insurance-policy-payload";
import { updateClientDetails, updatePartnerDetails, updatePersonRiskProfile, upsertEmploymentRecords } from "@/lib/services/client-updates";
import { saveDependantCollection, saveEntityCollection } from "@/lib/services/identity-relations";
import { saveAssetCollection, saveFinancialCollection } from "@/lib/services/profile-collections";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const APPLY_IMPORT_ROUTE_VERSION = "2026-05-06-profile-verify-v2";

type Owner = {
  id?: string | null;
  name?: string | null;
};

function normalizeText(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function parseDateValue(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return "";

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return trimmed;

  const slashMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[2].padStart(2, "0")}-${slashMatch[1].padStart(2, "0")}`;
  }

  return trimmed;
}

function normalizeMoneyValue(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const lowered = trimmed.toLowerCase();
  if (["nil", "n/a", "na", "none", "no", "not applicable"].includes(lowered)) {
    return "0";
  }

  const negative = /\(([^)]+)\)/.test(trimmed) || /^-/.test(trimmed);
  const cleaned = trimmed.replace(/[^0-9.]/g, "");

  if (!cleaned) {
    return null;
  }

  return `${negative ? "-" : ""}${cleaned}`;
}

function normalizeMoneyNumber(value?: string | null) {
  const normalized = normalizeMoneyValue(value);
  if (normalized === null) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePercentValue(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[^0-9.-]/g, "");
  return cleaned || null;
}

async function loadProfile(clientId: string) {
  const token = await readAuthTokenFromCookies();

  if (!token) {
    throw new Error("You need to sign in again before applying fact find data.");
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
    throw new Error("Finley could not resolve the client profile needed to apply fact find data.");
  }

  return (await getClientProfile(profileIdResult.data, token)).data;
}

function getPersonName(person?: PersonRecord | null) {
  return person?.name?.trim() ?? "";
}

function resolveOwner(profile: ClientProfile, ownerName?: string | null, fallbackTarget: "client" | "partner" = "client"): Owner | null {
  const people = [
    { target: "client" as const, record: profile.client },
    { target: "partner" as const, record: profile.partner },
  ].filter((entry) => entry.record?.id);

  const normalizedOwner = normalizeText(ownerName);
  const matched =
    normalizedOwner
      ? people.find((entry) => {
          const name = normalizeText(entry.record?.name);
          return name === normalizedOwner || name.includes(normalizedOwner) || normalizedOwner.includes(name);
        })
      : null;

  const fallback = matched ?? people.find((entry) => entry.target === fallbackTarget) ?? people[0];

  return fallback?.record?.id
    ? {
        id: fallback.record.id,
        name: fallback.record.name ?? null,
      }
    : null;
}

function frequency(value?: string | null) {
  return value ? { type: value, value } : { type: "", value: "" };
}

function profileCollectionCounts(profile: ClientProfile | null) {
  return {
    dependants: profile?.dependants?.length ?? 0,
    entities: profile?.entities?.length ?? 0,
    assets: profile?.assets?.length ?? 0,
    income: profile?.income?.length ?? 0,
    expenses: profile?.expense?.length ?? 0,
    liabilities: profile?.liabilities?.length ?? 0,
    superannuation: profile?.superannuation?.length ?? 0,
    pensions: profile?.pension?.length ?? 0,
    insurance: profile?.insurance?.length ?? 0,
  };
}

function candidateCollectionCounts(candidate: FactFindImportCandidate) {
  const insurancePolicyCount = getFactFindInsurancePolicies(candidate).length;

  return {
    dependants: candidate.dependants.length,
    entities: candidate.entities.length,
    assets: candidate.assets.length,
    income: candidate.income.length,
    expenses: candidate.expenses.length,
    liabilities: candidate.liabilities.length,
    superannuation: candidate.superannuation.length,
    pensions: candidate.pensions.length,
    insurance: insurancePolicyCount || candidate.insurance.length,
  };
}

type ApplyAuditEntry = {
  section: string;
  requested: number;
  before: number;
  after?: number | null;
  note?: string | null;
};

async function loadProfileWithRetry(profileId: string, token: string, attempts = 4) {
  let lastProfile: ClientProfile | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
    }

    lastProfile = await getClientProfile(profileId, token).then((result) => result.data ?? null);
  }

  return lastProfile;
}

async function resolveCurrentUser(token: string) {
  const currentUser = await readCurrentUserFromCookies();

  if (!currentUser) {
    throw new Error("Unable to resolve the signed-in user for this request.");
  }

  if (!API_BASE_URL || currentUser.id) {
    return currentUser;
  }

  try {
    const response = await fetch(new URL("/api/Users", API_BASE_URL), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const body = (await response.json().catch(() => null)) as
      | {
          data?: CurrentUser[] | null;
        }
      | null;

    if (!response.ok || !body?.data?.length) {
      return currentUser;
    }

    const email = currentUser.email?.trim().toLowerCase();
    const name = currentUser.name?.trim().toLowerCase();
    const matchedUser =
      body.data.find((user) => email && user.email?.trim().toLowerCase() === email) ??
      body.data.find((user) => name && user.name?.trim().toLowerCase() === name);

    return matchedUser?.id
      ? {
          id: matchedUser.id,
          name: currentUser.name ?? matchedUser.name ?? null,
          email: currentUser.email ?? matchedUser.email ?? null,
        }
      : currentUser;
  } catch {
    return currentUser;
  }
}

function getPolicyOwnerName(profile: ClientProfile, ownerName?: string | null) {
  return resolveOwner(profile, ownerName)?.name ?? ownerName?.trim() ?? null;
}

function toPolicyCoverRecord(cover: FactFindInsuranceCoverCandidate): PolicyCoverRecord | null {
  const coverType = cover.coverType?.trim();
  const sumInsured = normalizeMoneyNumber(cover.sumInsured);
  const premiumAmount = normalizeMoneyNumber(cover.premiumAmount);
  const premiumFrequency = cover.premiumFrequency?.trim() || null;

  if (!coverType && sumInsured === null && premiumAmount === null && !premiumFrequency) {
    return null;
  }

  return {
    id: null,
    coverType: coverType ?? null,
    sumInsured,
    premiumAmount,
    premiumFrequency,
  };
}

async function createInsurancePolicy(profileId: string, policy: ClientPolicyRecord, token: string) {
  if (!API_BASE_URL) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured.");
  }

  const response = await fetch(new URL(`/api/Insurance/${encodeURIComponent(profileId)}/Policy`, API_BASE_URL), {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(policy),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as { data?: ClientPolicyRecord | null; message?: string | null } | ClientPolicyRecord | null;

  if (!response.ok) {
    throw new Error(
      body && "message" in body && body.message
        ? `Unable to create insurance policy (${response.status}): ${body.message}`
        : `Unable to create insurance policy (${response.status}).`,
    );
  }

  if (body && "data" in body) {
    return body.data ?? null;
  }

  return body as ClientPolicyRecord | null;
}

async function createInsurancePolicyCovers(profileId: string, policyId: string, covers: PolicyCoverRecord[], token: string) {
  if (!API_BASE_URL) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured.");
  }

  const response = await fetch(new URL(`/api/Insurance/${encodeURIComponent(profileId)}/Policy/${encodeURIComponent(policyId)}/Covers`, API_BASE_URL), {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(covers),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as { message?: string | null } | null;

  if (!response.ok) {
    throw new Error(
      body?.message
        ? `Unable to create insurance policy covers (${response.status}): ${body.message}`
        : `Unable to create insurance policy covers (${response.status}).`,
    );
  }
}

function ownerRecordToAsset(profile: ClientProfile, record: FactFindOwnerRecord): ClientAssetRecord {
  return {
    id: null,
    type: record.type ?? null,
    assetType: record.type ?? null,
    description: record.description ?? record.provider ?? record.type ?? null,
    currentValue: normalizeMoneyValue(record.amount),
    cost: null,
    incomeAmount: null,
    incomeFrequency: frequency(record.frequency),
    joint: false,
    owner: resolveOwner(profile, record.ownerName),
  };
}

function ownerRecordToIncome(profile: ClientProfile, record: FactFindOwnerRecord): ClientIncomeRecord {
  return {
    id: null,
    type: record.type ?? null,
    description: record.description ?? record.provider ?? record.type ?? null,
    amount: normalizeMoneyValue(record.amount),
    frequency: frequency(record.frequency),
    taxType: null,
    pension: null,
    joint: false,
    owner: resolveOwner(profile, record.ownerName),
  };
}

function ownerRecordToExpense(profile: ClientProfile, record: FactFindOwnerRecord): ClientExpenseRecord {
  return {
    id: null,
    type: record.type ?? null,
    description: record.description ?? record.provider ?? record.type ?? null,
    amount: normalizeMoneyValue(record.amount),
    frequency: frequency(record.frequency),
    indexation: null,
    liability: null,
    joint: false,
    owner: resolveOwner(profile, record.ownerName),
  };
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | {
        clientId?: string | null;
        candidate?: FactFindImportCandidate | null;
      }
    | null;

  const clientId = body?.clientId?.trim();
  const candidate = body?.candidate ? sanitizeFactFindImportCandidate(body.candidate) : null;

  if (!clientId || !candidate) {
    return NextResponse.json({ error: "Client id and extracted fact find data are required." }, { status: 400 });
  }

  try {
    const profile = await loadProfile(clientId);
    const profileId = profile.id?.trim();
    if (!profileId) {
      throw new Error("Finley could not determine the profile id for this client.");
    }
    if (!API_BASE_URL) {
      throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured.");
    }
    const token = await readAuthTokenFromCookies();
    if (!token) {
      throw new Error("You need to sign in again before applying fact find data.");
    }
    const currentUser = await resolveCurrentUser(token);
    if (!currentUser.id) {
      throw new Error("Unable to resolve the signed-in user's id for this request.");
    }

    const context = {
      origin: request.nextUrl.origin,
      cookieHeader: request.headers.get("cookie"),
      apiBaseUrl: API_BASE_URL,
      token,
      currentUser,
    };
    const applied: string[] = [];
    const beforeCounts = profileCollectionCounts(profile);
    const expectedCounts = candidateCollectionCounts(candidate);
    const audit: ApplyAuditEntry[] = [];

    for (const person of candidate.people) {
      const currentPerson = person.target === "partner" ? profile.partner : profile.client;
      const personId = currentPerson?.id?.trim();
      if (!personId) continue;

      const changes = {
        ...(person.name ? { name: person.name } : {}),
        ...(person.email ? { email: person.email } : {}),
        ...(person.preferredPhone ? { preferredPhone: person.preferredPhone } : {}),
        ...(person.dateOfBirth ? { dateOfBirth: parseDateValue(person.dateOfBirth) } : {}),
        ...(person.gender ? { gender: person.gender } : {}),
        ...(person.maritalStatus ? { maritalStatus: person.maritalStatus } : {}),
        ...(person.residentStatus ? { residentStatus: person.residentStatus } : {}),
        ...(person.street ? { street: person.street } : {}),
        ...(person.suburb ? { suburb: person.suburb } : {}),
        ...(person.state ? { state: person.state } : {}),
        ...(person.postCode ? { postCode: person.postCode } : {}),
        ...(person.healthStatus ? { healthStatus: person.healthStatus } : {}),
        ...(person.healthInsurance ? { healthInsurance: person.healthInsurance } : {}),
      };

      if (Object.keys(changes).length) {
        if (person.target === "partner") {
          await updatePartnerDetails({ profileId, personId, person: currentPerson ?? null, changes }, context);
        } else {
          await updateClientDetails({ profileId, personId, person: currentPerson ?? null, changes }, context);
        }
        applied.push(`${person.target} details`);
      }

      if (person.riskProfile) {
        await updatePersonRiskProfile({ profileId, personId, person: currentPerson ?? null, changes: {}, target: person.target }, person.riskProfile, context);
        applied.push(`${person.target} risk profile`);
      }

      if (person.employmentStatus || person.jobTitle || person.employer || person.salary) {
        await upsertEmploymentRecords(
          {
            profileId,
            owner: { id: personId, name: getPersonName(currentPerson) || person.name || person.target },
            request: [
              {
                jobTitle: person.jobTitle ?? "",
                status: person.employmentStatus ?? "",
                employer: person.employer ?? "",
                salary: person.salary ?? "",
                frequency: person.salaryFrequency ?? "",
              },
            ],
          },
          context,
        );
        applied.push(`${person.target} employment`);
      }
    }

    if (candidate.dependants.length) {
      const dependants: ClientDependantRecord[] = candidate.dependants
        .filter((item) => item.name)
        .map((item) => ({
          id: null,
          name: item.name ?? null,
          birthday: parseDateValue(item.birthday),
          type: item.type ?? "Child",
          owner: resolveOwner(profile, item.ownerName),
        }));
      if (dependants.length) {
        await saveDependantCollection(profileId, dependants, context);
        applied.push(`${dependants.length} dependants`);
        audit.push({ section: "dependants", requested: dependants.length, before: beforeCounts.dependants });
      }
    }

    if (candidate.entities.length) {
      const entities: ClientEntityRecord[] = candidate.entities
        .filter((item) => item.name)
        .map((item) => ({
          id: null,
          entitiesId: null,
          name: item.name ?? null,
          type: item.type ?? null,
          owner: resolveOwner(profile, item.ownerName),
        }));
      if (entities.length) {
        await saveEntityCollection(profileId, entities, context);
        applied.push(`${entities.length} entities`);
        audit.push({ section: "entities", requested: entities.length, before: beforeCounts.entities });
      }
    }

    if (candidate.assets.length) {
      const assets = candidate.assets.map((item) => ownerRecordToAsset(profile, item));
      await saveAssetCollection(profileId, assets, context);
      applied.push(`${assets.length} assets`);
      audit.push({ section: "assets", requested: assets.length, before: beforeCounts.assets });
    }

    if (candidate.income.length) {
      const income = candidate.income.map((item) => ownerRecordToIncome(profile, item));
      await saveFinancialCollection("income", profileId, income, context);
      applied.push(`${income.length} income records`);
      audit.push({ section: "income", requested: income.length, before: beforeCounts.income });
    }

    if (candidate.expenses.length) {
      const expenses = candidate.expenses.map((item) => ownerRecordToExpense(profile, item));
      await saveFinancialCollection("expenses", profileId, expenses, context);
      applied.push(`${expenses.length} expense records`);
      audit.push({ section: "expenses", requested: expenses.length, before: beforeCounts.expenses });
    }

    if (candidate.liabilities.length) {
      const liabilities: ClientLiabilityRecord[] = candidate.liabilities.map((item) => ({
        id: null,
        loanType: item.type ?? item.description ?? null,
        accountNumber: item.accountNumber ?? null,
        bankName: item.bankName ?? item.provider ?? null,
        outstandingBalance: normalizeMoneyValue(item.outstandingBalance ?? item.amount),
        interestRate: normalizePercentValue(item.interestRate),
        repaymentAmount: normalizeMoneyValue(item.repaymentAmount),
        repaymentFrequency: frequency(item.repaymentFrequency ?? item.frequency),
        joint: false,
        owner: resolveOwner(profile, item.ownerName),
        securityAssets: null,
      }));
      await saveFinancialCollection("liabilities", profileId, liabilities, context);
      applied.push(`${liabilities.length} liabilities`);
      audit.push({ section: "liabilities", requested: liabilities.length, before: beforeCounts.liabilities });
    }

    if (candidate.superannuation.length) {
      const superannuation: ClientSuperannuationRecord[] = candidate.superannuation.map((item) => ({
        id: null,
        joint: false,
        type: item.type ?? "Accumulation",
        balance: normalizeMoneyValue(item.amount),
        superFund: item.provider ?? item.description ?? null,
        accountNumber: item.accountNumber ?? null,
        contributionAmount: null,
        frequency: frequency(item.frequency),
        owner: resolveOwner(profile, item.ownerName),
      }));
      await saveFinancialCollection("superannuation", profileId, superannuation, context);
      applied.push(`${superannuation.length} superannuation records`);
      audit.push({ section: "superannuation", requested: superannuation.length, before: beforeCounts.superannuation });
    }

    if (candidate.pensions.length) {
      const pensions: ClientPensionRecord[] = candidate.pensions.map((item) => ({
        id: null,
        type: item.type ?? "Pension",
        balance: normalizeMoneyValue(item.amount),
        superFund: item.provider ?? item.description ?? null,
        accountNumber: item.accountNumber ?? null,
        annualReturn: null,
        payment: null,
        joint: false,
        frequency: frequency(item.frequency),
        owner: resolveOwner(profile, item.ownerName),
      }));
      await saveFinancialCollection("retirement-income", profileId, pensions, context);
      applied.push(`${pensions.length} pension records`);
      audit.push({ section: "pensions", requested: pensions.length, before: beforeCounts.pensions });
    }

    const insurancePolicies = getFactFindInsurancePolicies(candidate);
    let savedInsuranceViaPolicyEndpoint = false;
    if (insurancePolicies.length) {
      let coverCount = 0;
      for (const item of insurancePolicies) {
        const covers = item.covers.map(toPolicyCoverRecord).filter((cover): cover is PolicyCoverRecord => Boolean(cover));
        const policy = await createInsurancePolicy(
          profileId,
          normalizeInsurancePolicyPayload({
            id: null,
            clientId: profileId,
            policyOwner: getPolicyOwnerName(profile, item.ownerName),
            insurer: item.insurer ?? item.provider ?? null,
            policyNumber: item.policyNumber ?? item.accountNumber ?? null,
            status: item.status ?? "Active",
            linkedSuperFund: item.linkedSuperFund ?? null,
            covers: [],
          }),
          token,
        );
        const policyId = policy?.id?.trim();
        if (policyId && covers.length) {
          await createInsurancePolicyCovers(profileId, policyId, covers, token);
          coverCount += covers.length;
        }
      }
      savedInsuranceViaPolicyEndpoint = true;
      applied.push(`${insurancePolicies.length} insurance policies`);
      if (coverCount) {
        applied.push(`${coverCount} insurance covers`);
      }
      audit.push({
        section: "insurance",
        requested: insurancePolicies.length,
        before: beforeCounts.insurance,
        note: "Saved through the insurance policy and cover endpoints.",
      });
    }

    const verifiedProfile = await loadProfileWithRetry(profileId, token);
    const afterCounts = profileCollectionCounts(verifiedProfile);
    const auditWithAfter = audit.map((entry) => ({
      ...entry,
      after: afterCounts[entry.section as keyof typeof afterCounts] ?? null,
      note:
        entry.note ??
        ((afterCounts[entry.section as keyof typeof afterCounts] ?? 0) > entry.before
          ? "Persisted on reload"
          : "Not present after reload"),
    }));
    const missingPersistedSections = Object.entries(expectedCounts)
      .filter(([, expected]) => expected > 0)
      .filter(([key]) => !(key === "insurance" && savedInsuranceViaPolicyEndpoint))
      .filter(([key]) => afterCounts[key as keyof typeof afterCounts] <= beforeCounts[key as keyof typeof beforeCounts])
      .map(([key]) => key);

    if (missingPersistedSections.length) {
      return NextResponse.json(
        {
          ok: false,
          error: `The client profile API accepted the apply request, but these sections were not present when Finley reloaded the profile: ${missingPersistedSections.join(", ")}.`,
          routeVersion: APPLY_IMPORT_ROUTE_VERSION,
          profileId,
          applied,
          beforeCounts,
          afterCounts,
          expectedCounts,
          audit: auditWithAfter,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      routeVersion: APPLY_IMPORT_ROUTE_VERSION,
      profileId,
      applied,
      beforeCounts,
      afterCounts,
      expectedCounts,
      audit: auditWithAfter,
    });
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Unable to apply fact find data (${error.statusCode}): ${error.message}`
        : error instanceof Error
          ? error.message
          : "Unable to apply fact find data right now.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
