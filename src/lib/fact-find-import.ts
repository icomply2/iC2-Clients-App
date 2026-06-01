export type FactFindPersonCandidate = {
  target: "client" | "partner";
  name?: string | null;
  email?: string | null;
  preferredPhone?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  maritalStatus?: string | null;
  residentStatus?: string | null;
  street?: string | null;
  suburb?: string | null;
  state?: string | null;
  postCode?: string | null;
  healthStatus?: string | null;
  healthInsurance?: string | null;
  riskProfile?: string | null;
  employmentStatus?: string | null;
  jobTitle?: string | null;
  employer?: string | null;
  salary?: string | null;
  salaryFrequency?: string | null;
};

export type FactFindOwnerRecord = {
  ownerName?: string | null;
  description?: string | null;
  type?: string | null;
  amount?: string | null;
  frequency?: string | null;
  provider?: string | null;
  accountNumber?: string | null;
  notes?: string | null;
};

export type FactFindLiabilityCandidate = FactFindOwnerRecord & {
  bankName?: string | null;
  outstandingBalance?: string | null;
  interestRate?: string | null;
  repaymentAmount?: string | null;
  repaymentFrequency?: string | null;
};

export type FactFindEntityCandidate = {
  ownerName?: string | null;
  name?: string | null;
  type?: string | null;
};

export type FactFindDependantCandidate = {
  ownerName?: string | null;
  name?: string | null;
  birthday?: string | null;
  type?: string | null;
};

export type FactFindInsuranceCandidate = FactFindOwnerRecord & {
  insurer?: string | null;
  policyNumber?: string | null;
  linkedSuperFund?: string | null;
  coverRequired?: string | null;
  sumInsured?: string | null;
  premiumAmount?: string | null;
  premiumFrequency?: string | null;
  status?: string | null;
};

export type FactFindInsuranceCoverCandidate = {
  coverType?: string | null;
  sumInsured?: string | null;
  premiumAmount?: string | null;
  premiumFrequency?: string | null;
  notes?: string | null;
};

export type FactFindInsurancePolicyCandidate = FactFindOwnerRecord & {
  insurer?: string | null;
  policyNumber?: string | null;
  status?: string | null;
  linkedSuperFund?: string | null;
  covers: FactFindInsuranceCoverCandidate[];
};

export type FactFindImportCandidate = {
  sourceFileName: string;
  summary: string;
  people: FactFindPersonCandidate[];
  dependants: FactFindDependantCandidate[];
  entities: FactFindEntityCandidate[];
  income: FactFindOwnerRecord[];
  expenses: FactFindOwnerRecord[];
  assets: FactFindOwnerRecord[];
  liabilities: FactFindLiabilityCandidate[];
  superannuation: FactFindOwnerRecord[];
  pensions: FactFindOwnerRecord[];
  insurance: FactFindInsuranceCandidate[];
  insurancePolicies?: FactFindInsurancePolicyCandidate[];
  confirmationsRequired: string[];
  warnings: string[];
};

export type FactFindImportCounts = {
  people: number;
  dependants: number;
  entities: number;
  income: number;
  expenses: number;
  assets: number;
  liabilities: number;
  superannuation: number;
  pensions: number;
  insurance: number;
};

export function getFactFindImportCounts(candidate: FactFindImportCandidate): FactFindImportCounts {
  const insurancePolicyCount = getFactFindInsurancePolicies(candidate).length;

  return {
    people: candidate.people.length,
    dependants: candidate.dependants.length,
    entities: candidate.entities.length,
    income: candidate.income.length,
    expenses: candidate.expenses.length,
    assets: candidate.assets.length,
    liabilities: candidate.liabilities.length,
    superannuation: candidate.superannuation.length,
    pensions: candidate.pensions.length,
    insurance: insurancePolicyCount || candidate.insurance.length,
  };
}

function candidateTextKey(value?: string | null) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

export function groupInsuranceCandidatesIntoPolicies(records: FactFindInsuranceCandidate[]): FactFindInsurancePolicyCandidate[] {
  const policies = new Map<string, FactFindInsurancePolicyCandidate>();

  for (const record of records) {
    const insurer = record.insurer ?? record.provider ?? null;
    const policyNumber = record.policyNumber ?? record.accountNumber ?? null;
    const linkedSuperFund = record.linkedSuperFund ?? null;
    const status = record.status ?? null;
    const policyKey = [
      candidateTextKey(record.ownerName),
      candidateTextKey(insurer),
      candidateTextKey(policyNumber),
      candidateTextKey(linkedSuperFund),
      candidateTextKey(status),
    ].join("|");
    const existing = policies.get(policyKey);
    const policy =
      existing ??
      {
        ownerName: record.ownerName ?? null,
        description: record.description ?? insurer ?? record.type ?? null,
        type: "Insurance policy",
        amount: null,
        frequency: null,
        provider: insurer,
        accountNumber: policyNumber,
        notes: record.notes ?? null,
        insurer,
        policyNumber,
        status,
        linkedSuperFund,
        covers: [],
      };

    const coverType = record.coverRequired ?? record.type ?? record.description ?? null;
    if (coverType || record.sumInsured || record.amount || record.premiumAmount) {
      policy.covers.push({
        coverType,
        sumInsured: record.sumInsured ?? record.amount ?? null,
        premiumAmount: record.premiumAmount ?? null,
        premiumFrequency: record.premiumFrequency ?? record.frequency ?? null,
        notes: record.notes ?? null,
      });
    }

    policies.set(policyKey, policy);
  }

  return [...policies.values()].filter((policy) => policy.insurer || policy.policyNumber || policy.covers.length);
}

export function getFactFindInsurancePolicies(candidate: FactFindImportCandidate): FactFindInsurancePolicyCandidate[] {
  const explicitPolicies = candidate.insurancePolicies?.filter((policy) => policy.insurer || policy.policyNumber || policy.covers?.length) ?? [];
  return explicitPolicies.length ? explicitPolicies : groupInsuranceCandidatesIntoPolicies(candidate.insurance);
}

function parseCandidateMoneyValue(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const lowered = trimmed.toLowerCase();
  if (["nil", "n/a", "na", "none", "no", "not applicable", "-"].includes(lowered)) {
    return 0;
  }

  const cleaned = trimmed.replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "." || cleaned === "-") {
    return null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.abs(parsed) : null;
}

function hasNonZeroMoney(value?: string | null) {
  const parsed = parseCandidateMoneyValue(value);
  return parsed !== null && parsed > 0;
}

function liabilityText(record: FactFindLiabilityCandidate) {
  return [
    record.description,
    record.type,
    record.bankName,
    record.provider,
    record.accountNumber,
    record.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isLikelyFactFindLiability(record: FactFindLiabilityCandidate) {
  const text = liabilityText(record);
  const hasLiabilitySignal =
    /\b(?:mortgage|home loan|loan|line of credit|credit card|overdraft|debt|liabilit|hecs|help|margin loan|lease|finance)\b/i.test(text);
  const hasPromptOrSectionSignal =
    /\b(?:additional information|life insured|total issued shares|retirement goals|advice limitations|incomplete|risk profile|ease of management|access to|client declaration|category|short term|initial reason|financial adviser|superannuation objectives)\b/i.test(text) ||
    /^(?:type|high|medium|low|client\s*\d|suzanne|mark|yes|no|n\/a|\(net of tax\))$/i.test(text.trim());
  const hasExplicitBalance = hasNonZeroMoney(record.outstandingBalance);
  const hasFallbackAmount = hasNonZeroMoney(record.amount);
  const hasRepayment = hasNonZeroMoney(record.repaymentAmount);
  const hasInterestRate = Boolean(record.interestRate?.trim());
  const hasLender = Boolean(record.bankName?.trim() || record.provider?.trim());
  const hasFinancialEvidence = hasExplicitBalance || (hasFallbackAmount && (hasLender || hasRepayment || hasInterestRate));

  if (hasPromptOrSectionSignal && !hasLiabilitySignal) {
    return false;
  }

  return hasFinancialEvidence && (hasLiabilitySignal || (hasLender && (hasRepayment || hasInterestRate)));
}

export function sanitizeFactFindImportCandidate(candidate: FactFindImportCandidate): FactFindImportCandidate {
  const liabilities = candidate.liabilities.filter(isLikelyFactFindLiability);
  const removedLiabilityCount = candidate.liabilities.length - liabilities.length;

  return {
    ...candidate,
    liabilities,
    warnings: removedLiabilityCount > 0
      ? [
          ...candidate.warnings,
          `Skipped ${removedLiabilityCount} non-liability row${removedLiabilityCount === 1 ? "" : "s"} from the fact find liability mapping.`,
        ]
      : candidate.warnings,
  };
}

export function createEmptyFactFindImportCandidate(sourceFileName: string): FactFindImportCandidate {
  return {
    sourceFileName,
    summary: "Finley could not extract structured fact find records from this file yet. You can still use the document as context in the SOA intake chat.",
    people: [],
    dependants: [],
    entities: [],
    income: [],
    expenses: [],
    assets: [],
    liabilities: [],
    superannuation: [],
    pensions: [],
    insurance: [],
    insurancePolicies: [],
    confirmationsRequired: ["Confirm whether this file contains a standard fact find or a scanned/unsupported document."],
    warnings: [],
  };
}
