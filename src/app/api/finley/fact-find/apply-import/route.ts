import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/api/client";
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
  PersonRecord,
} from "@/lib/api/types";
import { readAuthTokenFromCookies } from "@/lib/auth";
import type { FactFindImportCandidate, FactFindOwnerRecord } from "@/lib/fact-find-import";
import { updateClientDetails, updatePartnerDetails, updatePersonRiskProfile, upsertEmploymentRecords } from "@/lib/services/client-updates";
import { saveDependantCollection, saveEntityCollection } from "@/lib/services/identity-relations";
import { saveAssetCollection, saveFinancialCollection } from "@/lib/services/profile-collections";

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

function hasSameRecord(current: Array<{ owner?: Owner | null; description?: string | null; type?: string | null }>, next: { owner?: Owner | null; description?: string | null; type?: string | null }) {
  return current.some(
    (record) =>
      normalizeText(record.owner?.id) === normalizeText(next.owner?.id) &&
      normalizeText(record.description) === normalizeText(next.description) &&
      normalizeText(record.type) === normalizeText(next.type),
  );
}

function frequency(value?: string | null) {
  return value ? { type: value, value } : { type: "", value: "" };
}

function ownerRecordToAsset(profile: ClientProfile, record: FactFindOwnerRecord): ClientAssetRecord {
  return {
    id: null,
    type: record.type ?? null,
    assetType: record.type ?? null,
    description: record.description ?? record.provider ?? record.type ?? null,
    currentValue: record.amount ?? null,
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
    amount: record.amount ?? null,
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
    amount: record.amount ?? null,
    frequency: frequency(record.frequency),
    indexation: null,
    liability: null,
    joint: false,
    owner: resolveOwner(profile, record.ownerName),
  };
}

function mergeUnique<T extends { owner?: Owner | null; description?: string | null; type?: string | null }>(current: T[], next: T[]) {
  return next.reduce<T[]>((records, record) => (hasSameRecord(records, record) ? records : [...records, record]), [...current]);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | {
        clientId?: string | null;
        candidate?: FactFindImportCandidate | null;
      }
    | null;

  const clientId = body?.clientId?.trim();
  const candidate = body?.candidate;

  if (!clientId || !candidate) {
    return NextResponse.json({ error: "Client id and extracted fact find data are required." }, { status: 400 });
  }

  try {
    const profile = await loadProfile(clientId);
    const profileId = profile.id?.trim();
    if (!profileId) {
      throw new Error("Finley could not determine the profile id for this client.");
    }

    const context = {
      origin: request.nextUrl.origin,
      cookieHeader: request.headers.get("cookie"),
    };
    const applied: string[] = [];

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
        await saveDependantCollection(profileId, [...(profile.dependants ?? []), ...dependants], context);
        applied.push(`${dependants.length} dependants`);
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
        await saveEntityCollection(profileId, [...(profile.entities ?? []), ...entities], context);
        applied.push(`${entities.length} entities`);
      }
    }

    if (candidate.assets.length) {
      const assets = candidate.assets.map((item) => ownerRecordToAsset(profile, item));
      await saveAssetCollection(profileId, mergeUnique(profile.assets ?? [], assets), context);
      applied.push(`${assets.length} assets`);
    }

    if (candidate.income.length) {
      const income = candidate.income.map((item) => ownerRecordToIncome(profile, item));
      await saveFinancialCollection("income", profileId, mergeUnique(profile.income ?? [], income), context);
      applied.push(`${income.length} income records`);
    }

    if (candidate.expenses.length) {
      const expenses = candidate.expenses.map((item) => ownerRecordToExpense(profile, item));
      await saveFinancialCollection("expenses", profileId, mergeUnique(profile.expense ?? [], expenses), context);
      applied.push(`${expenses.length} expense records`);
    }

    if (candidate.liabilities.length) {
      const liabilities: ClientLiabilityRecord[] = candidate.liabilities.map((item) => ({
        id: null,
        loanType: item.type ?? item.description ?? null,
        accountNumber: item.accountNumber ?? null,
        bankName: item.bankName ?? item.provider ?? null,
        outstandingBalance: item.outstandingBalance ?? item.amount ?? null,
        interestRate: item.interestRate ?? null,
        repaymentAmount: item.repaymentAmount ?? null,
        repaymentFrequency: frequency(item.repaymentFrequency ?? item.frequency),
        joint: false,
        owner: resolveOwner(profile, item.ownerName),
        securityAssets: null,
      }));
      await saveFinancialCollection("liabilities", profileId, [...(profile.liabilities ?? []), ...liabilities], context);
      applied.push(`${liabilities.length} liabilities`);
    }

    if (candidate.superannuation.length) {
      const superannuation: ClientSuperannuationRecord[] = candidate.superannuation.map((item) => ({
        id: null,
        joint: false,
        type: item.type ?? "Accumulation",
        balance: item.amount ?? null,
        superFund: item.provider ?? item.description ?? null,
        accountNumber: item.accountNumber ?? null,
        contributionAmount: null,
        frequency: frequency(item.frequency),
        owner: resolveOwner(profile, item.ownerName),
      }));
      await saveFinancialCollection("superannuation", profileId, [...(profile.superannuation ?? []), ...superannuation], context);
      applied.push(`${superannuation.length} superannuation records`);
    }

    if (candidate.pensions.length) {
      const pensions: ClientPensionRecord[] = candidate.pensions.map((item) => ({
        id: null,
        type: item.type ?? "Pension",
        balance: item.amount ?? null,
        superFund: item.provider ?? item.description ?? null,
        accountNumber: item.accountNumber ?? null,
        annualReturn: null,
        payment: null,
        joint: false,
        frequency: frequency(item.frequency),
        owner: resolveOwner(profile, item.ownerName),
      }));
      await saveFinancialCollection("retirement-income", profileId, [...(profile.pension ?? []), ...pensions], context);
      applied.push(`${pensions.length} pension records`);
    }

    if (candidate.insurance.length) {
      const insurance: ClientInsuranceRecord[] = candidate.insurance.map((item) => ({
        id: null,
        coverRequired: item.coverRequired ?? item.type ?? item.description ?? null,
        sumInsured: item.sumInsured ?? item.amount ?? null,
        premiumAmount: item.premiumAmount ?? null,
        frequency: frequency(item.premiumFrequency ?? item.frequency),
        joint: false,
        insurer: item.insurer ?? item.provider ?? null,
        status: item.status ?? "Active",
        superFund: null,
        owner: resolveOwner(profile, item.ownerName),
      }));
      await saveFinancialCollection("insurance", profileId, [...(profile.insurance ?? []), ...insurance], context);
      applied.push(`${insurance.length} insurance records`);
    }

    return NextResponse.json({ ok: true, applied });
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
