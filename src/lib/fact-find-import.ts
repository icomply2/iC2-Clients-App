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
  coverRequired?: string | null;
  sumInsured?: string | null;
  premiumAmount?: string | null;
  premiumFrequency?: string | null;
  status?: string | null;
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
    insurance: candidate.insurance.length,
  };
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
    confirmationsRequired: ["Confirm whether this file contains a standard fact find or a scanned/unsupported document."],
    warnings: [],
  };
}
