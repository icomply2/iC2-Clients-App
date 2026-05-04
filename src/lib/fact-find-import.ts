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
