"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { currentProjectionAssumptions } from "@/lib/projections/assumptions";
import { runProjection } from "@/lib/projections/engine";
import type { ProjectionScenario } from "@/lib/projections/types";
import { writeSoaProjectionScenarioOptions } from "@/lib/projections/soa-projection-package";
import type { ClientProfile, PersonRecord } from "@/lib/api/types";
import type { FinancialProjectionV1 } from "@/lib/soa-types";
import styles from "./projections.module.css";

type ScenarioMapResponse = {
  scenario?: ProjectionScenario;
  source?: "llm" | "fallback";
  model?: string | null;
  mappingNotes?: string[];
  confirmationsRequired?: string[];
  warning?: string;
  error?: string;
};

type ProjectionSection =
  | "scenario-inputs"
  | "personal-cashflow"
  | "taxation"
  | "assets-liabilities"
  | "superannuation"
  | "pensions"
  | "centrelink"
  | "assumptions";

type ScenarioInputTab =
  | "scenario-details"
  | "scenario-assumptions"
  | "cashflow"
  | "assets-liabilities"
  | "superannuation"
  | "pensions";

type ScenarioAssumptionOverrides = {
  cpiRate: number;
  superGuaranteeRate: number;
  concessionalContributionsCap: number;
  contributionsTaxRate: number;
  investmentEarningsTaxRate: number;
  riskProfiles: Record<
    string,
    {
      incomeRate: number;
      growthRate: number;
      standardDeviation?: number | null;
      defensivePct?: number | null;
      growthPct?: number | null;
    }
  >;
};

type ProjectionTableRow = {
  label: string;
  values: string[];
  isSection?: boolean;
  isTotal?: boolean;
  control?: "surplus-allocation";
};

type ProjectionTableGroup = {
  groupId: string;
  title: string;
  ownerPersonId: string;
  ownerName: string;
  subtitle: string;
  rows: ProjectionTableRow[];
};

type ClientImportStatus = "idle" | "importing" | "imported" | "error";

type StoredProjectionWorkspaceState = {
  scenarios: ProjectionScenario[];
  activeScenarioId: string | null;
  scenarioAssumptionOverrides: ScenarioAssumptionOverrides;
  activeSection: ProjectionSection;
  activeScenarioInputTab: ScenarioInputTab;
  updatedAt: string;
};

const projectionSections: Array<{ id: ProjectionSection; label: string }> = [
  { id: "scenario-inputs", label: "Scenario inputs" },
  { id: "personal-cashflow", label: "Personal cash flow" },
  { id: "taxation", label: "Taxation" },
  { id: "assets-liabilities", label: "Asset and Liabilities" },
  { id: "superannuation", label: "Superannuation" },
  { id: "pensions", label: "Pensions" },
  { id: "centrelink", label: "Centrelink" },
  { id: "assumptions", label: "Assumptions" },
];

const scenarioInputTabs: Array<{ id: ScenarioInputTab; label: string }> = [
  { id: "scenario-details", label: "Scenario details" },
  { id: "scenario-assumptions", label: "Scenario assumptions" },
  { id: "cashflow", label: "Cashflow" },
  { id: "assets-liabilities", label: "Assets and liabilities" },
  { id: "superannuation", label: "Superannuation" },
  { id: "pensions", label: "Pensions" },
];

const editableRiskProfileNames = ["Cash", "Defensive", "Moderate", "Balanced", "Growth", "High Growth"];
const jointOwnerId = "joint";

const blankProjectionScenario: ProjectionScenario = {
  scenarioId: "blank-scenario",
  scenarioName: "Blank scenario",
  startYear: 2026,
  startMonth: 7,
  primaryPersonId: "client",
  projectionEnd: {
    type: "life-expectancy",
    personId: "client",
  },
  people: [
    {
      personId: "client",
      name: "Client",
      role: "client",
      gender: "unknown",
      dateOfBirth: null,
      startAge: 18,
      retirementAge: null,
      relationshipStatus: null,
      isHomeowner: false,
    },
  ],
  assets: [],
  liabilities: [],
  retirementAccounts: [],
  cashflowItems: [],
  cashflowAllocation: {
    surplusTarget: null,
  },
};

function getInitialRiskProfileAssumptions() {
  return Object.fromEntries(
    editableRiskProfileNames.map((profileName) => {
      const profile = currentProjectionAssumptions.investmentProfiles.profiles[profileName];

      return [
        profileName,
        {
          incomeRate: profile?.incomeRate ?? 0,
          growthRate: profile?.growthRate ?? 0,
          standardDeviation: profile?.standardDeviation ?? null,
          defensivePct: profile?.defensivePct ?? null,
          growthPct: profile?.growthPct ?? null,
        },
      ];
    }),
  );
}

function getInitialScenarioAssumptionOverrides(): ScenarioAssumptionOverrides {
  return {
    cpiRate: currentProjectionAssumptions.economic.cpiRate,
    superGuaranteeRate: currentProjectionAssumptions.legislative.superannuation.superGuaranteeRate,
    concessionalContributionsCap: currentProjectionAssumptions.legislative.superannuation.concessionalContributionsCap,
    contributionsTaxRate: currentProjectionAssumptions.legislative.superannuation.contributionsTaxRate,
    investmentEarningsTaxRate: currentProjectionAssumptions.legislative.superannuation.investmentEarningsTaxRate,
    riskProfiles: getInitialRiskProfileAssumptions(),
  };
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function projectionWorkspaceStorageKey(clientId: string, soaId: string) {
  return clientId && soaId
    ? `ic2:projection-workspace:${clientId}:${soaId}`
    : "ic2:projection-workspace:standalone";
}

function buildStoredProjectionWorkspaceState(
  state: Omit<StoredProjectionWorkspaceState, "updatedAt">,
): StoredProjectionWorkspaceState {
  return {
    ...state,
    updatedAt: new Date().toISOString(),
  };
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numericValue(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value !== "string") {
    return 0;
  }

  const parsed = Number(value.replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRateValue(value: unknown) {
  const parsed = numericValue(value);
  if (parsed <= 0) return 0;
  return parsed > 1 ? parsed / 100 : parsed;
}

function frequencyLabel(value: unknown) {
  if (typeof value === "string") return value.toLowerCase();
  if (value && typeof value === "object") {
    const record = value as { type?: string | null; value?: string | null };
    return (record.type ?? record.value ?? "").toLowerCase();
  }
  return "";
}

function annualizeAmount(amount: unknown, frequency: unknown) {
  const value = numericValue(amount);
  const frequencyText = frequencyLabel(frequency);
  if (frequencyText.includes("week") && !frequencyText.includes("fortnight")) return value * 52;
  if (frequencyText.includes("fortnight")) return value * 26;
  if (frequencyText.includes("month")) return value * 12;
  if (frequencyText.includes("quarter")) return value * 4;
  return value;
}

function calculateStartAge(dateOfBirth: string | null | undefined, startYear: number, startMonth: number) {
  if (!dateOfBirth) {
    return 18;
  }

  const parsed = new Date(dateOfBirth);
  if (Number.isNaN(parsed.getTime())) {
    return 18;
  }

  const projectionStart = new Date(startYear, startMonth - 1, 1);
  let age = projectionStart.getFullYear() - parsed.getFullYear();
  const birthdayThisYear = new Date(projectionStart.getFullYear(), parsed.getMonth(), parsed.getDate());
  if (birthdayThisYear > projectionStart) {
    age -= 1;
  }
  return Math.max(18, age);
}

function personName(person?: PersonRecord | null, fallback = "Client") {
  return textValue(person?.name) || fallback;
}

function personGender(person?: PersonRecord | null): ProjectionScenario["people"][number]["gender"] {
  const gender = textValue(person?.gender).toLowerCase();
  if (gender.includes("female")) return "female";
  if (gender.includes("male")) return "male";
  return "unknown";
}

function mapClientProfileToProjectionScenario(profile: ClientProfile): ProjectionScenario {
  const startYear = blankProjectionScenario.startYear;
  const startMonth = blankProjectionScenario.startMonth;
  const hasPartner = Boolean(textValue(profile.partner?.name));
  const people: ProjectionScenario["people"] = [
    {
      personId: "client",
      name: personName(profile.client, "Client"),
      role: "client",
      gender: personGender(profile.client),
      dateOfBirth: profile.client?.dob ?? null,
      startAge: calculateStartAge(profile.client?.dob, startYear, startMonth),
      retirementAge: null,
      relationshipStatus: hasPartner ? "couple" : profile.client?.maritalStatus ?? null,
      isHomeowner: false,
    },
    ...(hasPartner
      ? [
          {
            personId: "partner" as const,
            name: personName(profile.partner, "Partner"),
            role: "partner" as const,
            gender: personGender(profile.partner),
            dateOfBirth: profile.partner?.dob ?? null,
            startAge: calculateStartAge(profile.partner?.dob, startYear, startMonth),
            retirementAge: null,
            relationshipStatus: "couple",
            isHomeowner: false,
          },
        ]
      : []),
  ];
  const clientNameLower = people[0]?.name.toLowerCase() ?? "";
  const partnerNameLower = people.find((person) => person.role === "partner")?.name.toLowerCase() ?? "";
  const ownerPersonId = (record?: { joint?: boolean | null; owner?: { id?: string | null; name?: string | null } | null }) => {
    if (record?.joint) return jointOwnerId;
    const ownerName = textValue(record?.owner?.name).toLowerCase();
    if (ownerName && partnerNameLower && (ownerName === partnerNameLower || partnerNameLower.includes(ownerName) || ownerName.includes(partnerNameLower))) {
      return "partner";
    }
    if (ownerName && clientNameLower && (ownerName === clientNameLower || clientNameLower.includes(ownerName) || ownerName.includes(clientNameLower))) {
      return "client";
    }
    return "client";
  };
  const assetType = (value: string): ProjectionScenario["assets"][number]["type"] => {
    const normalized = value.toLowerCase();
    if (/home|residence|property.*home|principal|primary/.test(normalized)) return "primary-residence";
    if (/cash|bank|savings|offset/.test(normalized)) return "cash";
    if (/funeral/.test(normalized)) return "funeral-bond";
    if (/share|etf|managed|investment|portfolio|term deposit/.test(normalized)) return "investment";
    return "personal-asset";
  };
  const liabilityType = (value: string): ProjectionScenario["liabilities"][number]["type"] => {
    const normalized = value.toLowerCase();
    if (/mortgage|home loan/.test(normalized)) return "mortgage";
    if (/credit card/.test(normalized)) return "credit-card";
    if (/loan|debt|hecs|help/.test(normalized)) return "personal-loan";
    return "other";
  };
  const investmentProfile = (value: string) => {
    const normalized = value.toLowerCase();
    if (normalized.includes("high")) return "High Growth";
    if (normalized.includes("growth")) return "Growth";
    if (normalized.includes("balanced")) return "Balanced";
    if (normalized.includes("moderate")) return "Moderate";
    if (normalized.includes("defensive") || normalized.includes("conservative")) return "Defensive";
    return "Balanced";
  };
  const assets = (profile.assets ?? []).map((asset, index) => {
    const name = textValue(asset.description) || textValue(asset.type) || textValue(asset.assetType) || `Asset ${index + 1}`;
    const type = assetType(`${asset.type ?? ""} ${asset.assetType ?? ""} ${asset.description ?? ""}`);

    return {
      assetId: slug(asset.id || name) || `asset-${index + 1}`,
      ownerPersonId: ownerPersonId(asset),
      type,
      name,
      openingValue: numericValue(asset.currentValue),
      annualIncome: annualizeAmount(asset.incomeAmount, asset.incomeFrequency),
      growthRateKey:
        type === "cash"
          ? /offset/i.test(name)
            ? "none" as const
            : "cash" as const
          : type === "primary-residence"
            ? "cpi" as const
            : type === "investment"
              ? "Balanced" as const
              : "none" as const,
      centrelink: type === "primary-residence" || type === "funeral-bond" ? "exempt" as const : type === "cash" || type === "investment" ? "financial-asset" as const : "assessable" as const,
      reserveTarget: type === "cash" ? 60000 : null,
    };
  });
  const hasPrimaryResidence = assets.some((asset) => asset.type === "primary-residence");
  people.forEach((person) => {
    person.isHomeowner = hasPrimaryResidence;
  });
  const liabilities = (profile.liabilities ?? []).map((liability, index) => {
    const name = textValue(liability.bankName) || textValue(liability.loanType) || textValue(liability.accountNumber) || `Liability ${index + 1}`;

    return {
      liabilityId: slug(liability.id || name) || `liability-${index + 1}`,
      ownerPersonId: ownerPersonId(liability),
      type: liabilityType(`${liability.loanType ?? ""} ${liability.bankName ?? ""}`),
      name,
      openingBalance: numericValue(liability.outstandingBalance),
      annualInterestRate: normalizeRateValue(liability.interestRate),
      annualRepayment: annualizeAmount(liability.repaymentAmount, liability.repaymentFrequency),
      repaymentTiming: "end-of-year" as const,
    };
  });
  const employmentRecords = [...(profile.employment ?? []), ...(profile.client?.employment ?? []), ...(profile.partner?.employment ?? [])];
  const employmentItems = employmentRecords
    .filter((entry) => numericValue(entry.salary) > 0)
    .map((entry, index) => {
      const ownerId = ownerPersonId(entry);
      const owner = people.find((person) => person.personId === ownerId);

      return {
        itemId: slug(entry.id || `${entry.owner?.name ?? "employment"}-${index}`) || `employment-${index + 1}`,
        ownerPersonId: ownerId,
        category: "other-income" as const,
        label: `${owner?.name ?? people[0]?.name ?? "Client"} employment income`,
        annualAmount: annualizeAmount(entry.salary, entry.frequency),
        startDate: entry.startDate ?? null,
        endDate: entry.endDate ?? null,
        indexedToCpi: true,
        taxable: true,
      };
    });
  const incomeItems = (profile.income ?? [])
    .filter((entry) => numericValue(entry.amount) > 0 && !/age pension/i.test(`${entry.type ?? ""} ${entry.description ?? ""}`))
    .map((entry, index) => ({
      itemId: slug(entry.id || entry.description || entry.type || `income-${index + 1}`) || `income-${index + 1}`,
      ownerPersonId: ownerPersonId(entry),
      category: "other-income" as const,
      label: textValue(entry.description) || textValue(entry.type) || `Income ${index + 1}`,
      annualAmount: annualizeAmount(entry.amount, entry.frequency),
      startDate: null,
      endDate: null,
      indexedToCpi: true,
      taxable: !/tax.?free|non.?tax/i.test(`${entry.taxType ?? ""} ${entry.type ?? ""} ${entry.description ?? ""}`),
    }));
  const expenseItems = (profile.expense ?? [])
    .filter((entry) => numericValue(entry.amount) > 0)
    .map((entry, index) => ({
      itemId: slug(entry.id || entry.description || entry.type || `expense-${index + 1}`) || `expense-${index + 1}`,
      ownerPersonId: ownerPersonId(entry),
      category: /living|household|expense/i.test(`${entry.type ?? ""} ${entry.description ?? ""}`) ? "living-expense" as const : "other-expense" as const,
      label: textValue(entry.description) || textValue(entry.type) || `Expense ${index + 1}`,
      annualAmount: annualizeAmount(entry.amount, entry.frequency),
      startDate: null,
      endDate: null,
      indexedToCpi: !/no|false|0/i.test(textValue(entry.indexation)),
      taxable: false,
    }));
  const superAccounts = (profile.superannuation ?? []).map((account, index) => ({
    accountId: slug(account.id || account.superFund || `super-${index + 1}`) || `super-${index + 1}`,
    ownerPersonId: ownerPersonId(account),
    accountType: "super-accumulation" as const,
    provider: textValue(account.superFund) || "Super fund",
    productName: textValue(account.type) || textValue(account.superFund) || `Super account ${index + 1}`,
    openingBalance: numericValue(account.balance),
    annualFeeRate: 0.015,
    annualContribution: annualizeAmount(account.contributionAmount, account.frequency),
    annualContributionType: "concessional" as const,
    rolloverToPensionDate: null,
    rolloverPensionName: null,
    rolloverAnnualDrawdown: 0,
    rolloverDrawdownIndexedToCpi: false,
    investmentProfileKey: investmentProfile(`${account.type ?? ""} ${account.superFund ?? ""}`),
    annualDrawdown: 0,
    drawdownIndexedToCpi: false,
    taxableToClient: false,
    centrelink: "financial-asset" as const,
  }));
  const pensionAccounts = (profile.pension ?? []).map((account, index) => ({
    accountId: slug(account.id || account.superFund || `pension-${index + 1}`) || `pension-${index + 1}`,
    ownerPersonId: ownerPersonId(account),
    accountType: "account-based-pension" as const,
    provider: textValue(account.superFund) || "Pension provider",
    productName: textValue(account.type) || textValue(account.superFund) || `Pension account ${index + 1}`,
    openingBalance: numericValue(account.balance),
    annualFeeRate: 0.015,
    annualContribution: 0,
    annualContributionType: "concessional" as const,
    rolloverToPensionDate: null,
    rolloverPensionName: null,
    rolloverAnnualDrawdown: 0,
    rolloverDrawdownIndexedToCpi: false,
    investmentProfileKey: investmentProfile(`${account.type ?? ""} ${account.superFund ?? ""} ${account.annualReturn ?? ""}`),
    annualDrawdown: annualizeAmount(account.payment, account.frequency),
    drawdownIndexedToCpi: true,
    taxableToClient: false,
    centrelink: "financial-asset" as const,
  }));

  return {
    scenarioId: makeId("client-profile"),
    scenarioName: "Current Situation",
    startYear,
    startMonth,
    people,
    primaryPersonId: "client",
    projectionEnd: { type: "life-expectancy", personId: "client" },
    assets,
    liabilities,
    retirementAccounts: [...superAccounts, ...pensionAccounts],
    cashflowItems: [...employmentItems, ...incomeItems, ...expenseItems],
  };
}

function buildProjectionViewModel(activeScenario: ProjectionScenario, projectionAssumptions = currentProjectionAssumptions) {
const projectionResult = runProjection(activeScenario, projectionAssumptions);
const projectionRows = projectionResult.years;
const primaryPersonId = activeScenario.primaryPersonId;
const projectionStartYear = activeScenario.startYear;
const endAge = projectionRows.at(-1)?.ageByPersonId[primaryPersonId] ?? 0;
const cashAsset = activeScenario.assets.find((asset) => asset.type === "cash");
const cashReserveTarget = cashAsset?.reserveTarget ?? 0;
const openingCash = cashAsset?.openingValue ?? 0;
const cashAssetName = cashAsset?.name ?? "cash reserve";
const openingAmpPension =
  activeScenario.retirementAccounts.find((account) => account.accountType === "account-based-pension")?.openingBalance ?? 0;
const startingNetWorth =
  activeScenario.assets.reduce((total, asset) => total + asset.openingValue, 0) +
  activeScenario.retirementAccounts.reduce((total, account) => total + account.openingBalance, 0) -
  activeScenario.liabilities.reduce((total, liability) => total + liability.openingBalance, 0);

function money(value: number) {
  const rounded = Math.round(value);
  const formatted = Math.abs(rounded).toLocaleString("en-AU", {
    maximumFractionDigits: 0,
  });

  return rounded < 0 ? `($${formatted})` : `$${formatted}`;
}

function hasAnyAmount(values: number[]) {
  return values.some((value) => Math.abs(Math.round(value)) > 0);
}

const finalProjectionYear = projectionRows.at(-1);
const firstReserveBreach = projectionRows.find((row) => row.cashReserve < cashReserveTarget);
const primaryPersonName = activeScenario.people.find((person) => person.personId === primaryPersonId)?.name ?? "Client";
const personNameById = Object.fromEntries(activeScenario.people.map((person) => [person.personId, person.name]));
const liabilityRepaymentItemIds = new Set(activeScenario.liabilities.map((liability) => `${liability.liabilityId}-repayment`));
const duplicatedCashflowLabels = new Set(
  activeScenario.cashflowItems
    .map((item) => item.label)
    .filter((label, index, labels) => labels.indexOf(label) !== index),
);

function cashflowItemLabel(item: ProjectionScenario["cashflowItems"][number]) {
  return duplicatedCashflowLabels.has(item.label) ? `${ownerName(item.ownerPersonId)} - ${item.label}` : item.label;
}

function ownerName(ownerPersonId: string) {
  return ownerPersonId === jointOwnerId ? "Joint" : personNameById[ownerPersonId] ?? "Client";
}

function ownerIncludesPerson(ownerPersonId: string, personId: string) {
  return ownerPersonId === personId || ownerPersonId === jointOwnerId;
}

function ownerShare(activeOwnerPersonId: string) {
  const householdPeople = activeScenario.people.filter((person) => person.role === "client" || person.role === "partner");
  return activeOwnerPersonId === jointOwnerId && householdPeople.length > 1 ? 1 / householdPeople.length : 1;
}

function rolloverPensionAccountId(accountId: string) {
  return `${accountId}-rollover-pension`;
}

function createRolloverPensionAccount(account: ProjectionScenario["retirementAccounts"][number]) {
  return {
    ...account,
    accountId: rolloverPensionAccountId(account.accountId),
    accountType: "account-based-pension" as const,
    productName: account.rolloverPensionName?.trim() || `${account.productName} pension`,
    annualContribution: 0,
    annualContributionType: "concessional" as const,
    annualDrawdown: account.rolloverAnnualDrawdown ?? 0,
    drawdownIndexedToCpi: account.rolloverDrawdownIndexedToCpi ?? false,
    taxableToClient: false,
  };
}

const rolloverPensionAccounts = activeScenario.retirementAccounts
  .filter((account) => account.accountType === "super-accumulation" && account.rolloverToPensionDate)
  .map(createRolloverPensionAccount);
const retirementDisplayAccounts = [...activeScenario.retirementAccounts, ...rolloverPensionAccounts];

const mappedIncomeRows = activeScenario.cashflowItems
  .filter((item) => item.category === "other-income")
  .map((item) => ({
    label: cashflowItemLabel(item),
    values: projectionRows.map((row) => money(row.cashflowItemValues[item.itemId] ?? 0)),
  }));
const assetIncomeRows = activeScenario.assets
  .map((asset) => ({
    label: `${asset.name} income`,
    rawValues: projectionRows.map((row) => row.assetIncomeValues[asset.assetId] ?? 0),
  }))
  .filter((row) => hasAnyAmount(row.rawValues))
  .map((row) => ({
    label: row.label,
    values: row.rawValues.map((value) => money(value)),
  }));
const mappedExpenseRows = activeScenario.cashflowItems
  .filter(
    (item) =>
      (item.category === "living-expense" || item.category === "other-expense") &&
      !liabilityRepaymentItemIds.has(item.itemId),
  )
  .map((item) => ({
    label: cashflowItemLabel(item),
    values: projectionRows.map((row) => money(row.cashflowItemValues[item.itemId] ?? 0)),
  }));
const liabilityRepaymentRows = activeScenario.liabilities
  .filter((liability) => liability.annualRepayment > 0)
  .map((liability) => ({
    label: `${liability.name} repayment`,
    values: projectionRows.map((row) => money(row.liabilityRepaymentValues[liability.liabilityId] ?? 0)),
  }));
const taxPayableRows = activeScenario.people
  .map((person) => ({
    label: `${person.name} tax payable`,
    rawValues: projectionRows.map((row) => row.taxByPersonId[person.personId]?.taxPayable ?? 0),
  }))
  .filter((row) => hasAnyAmount(row.rawValues))
  .map((row) => ({
    label: row.label,
    values: row.rawValues.map((value) => money(value)),
  }));
const calculatedIncomeRows = [
  {
    label: "Account-based pension",
    rawValues: projectionRows.map((row) => row.accountBasedPension),
  },
  {
    label: "Age Pension",
    rawValues: projectionRows.map((row) => row.agePension.annualPayment),
  },
  {
    label: "Bank interest",
    rawValues: projectionRows.map((row) => row.bankInterest),
  },
].filter((row) => hasAnyAmount(row.rawValues));
const surplusAllocationTarget = activeScenario.cashflowAllocation?.surplusTarget ?? null;
const surplusTargetAsset = surplusAllocationTarget?.targetType === "cash-asset"
  ? activeScenario.assets.find((asset) => asset.assetId === surplusAllocationTarget.targetId)
  : null;
const surplusTargetLiability = surplusAllocationTarget?.targetType === "liability"
  ? activeScenario.liabilities.find((liability) => liability.liabilityId === surplusAllocationTarget.targetId)
  : null;
const surplusAllocationLabel = surplusTargetLiability
  ? `Surplus to ${surplusTargetLiability.name}`
  : `Surplus to ${surplusTargetAsset?.name ?? cashAssetName}`;

const fallbackAllocationRows = [
  {
    label: surplusAllocationLabel,
    control: "surplus-allocation" as const,
    rawValues: projectionRows.map(
      (row) => row.cashflowFallbackAllocation.surplusToCash + row.cashflowFallbackAllocation.surplusToLiability,
    ),
  },
  {
    label: `Shortfall funded from ${cashAssetName}`,
    rawValues: projectionRows.map((row) => row.cashflowFallbackAllocation.shortfallFromCash),
  },
  {
    label: "Extra account-based pension drawdown",
    rawValues: projectionRows.map((row) => row.cashflowFallbackAllocation.extraAccountBasedPensionDrawdown),
  },
  {
    label: "Non-super investment sale",
    rawValues: projectionRows.map((row) => row.cashflowFallbackAllocation.nonSuperInvestmentSale),
  },
  {
    label: "Debt drawdown",
    rawValues: projectionRows.map((row) => row.cashflowFallbackAllocation.debtDrawdown),
  },
  {
    label: "Unresolved shortfall",
    rawValues: projectionRows.map((row) => row.cashflowFallbackAllocation.unresolvedShortfall),
  },
]
  .filter((row) => hasAnyAmount(row.rawValues))
  .map((row) => ({
    label: row.label,
    control: row.control,
    values: row.rawValues.map((value) => money(value)),
  }));

const cashflowProjectionRows: ProjectionTableRow[] = [
  { label: `Age - ${primaryPersonName}`, values: projectionRows.map((row) => `${row.ageByPersonId[primaryPersonId]}`) },
  { label: "Income", values: [], isSection: true },
  ...mappedIncomeRows,
  ...assetIncomeRows,
  ...calculatedIncomeRows.map((row) => ({
    label: row.label,
    values: row.rawValues.map((value) => money(value)),
  })),
  { label: "Total income", values: projectionRows.map((row) => money(row.totalIncome)), isTotal: true },
  { label: "Expenses", values: [], isSection: true },
  ...mappedExpenseRows,
  ...liabilityRepaymentRows,
  ...taxPayableRows,
  {
    label: "Total expenses including tax",
    values: projectionRows.map((row) => money(row.expenses + row.tax.taxPayable)),
    isTotal: true,
  },
  { label: "Net cashflow after tax", values: projectionRows.map((row) => money(row.netCashflowAfterTax)) },
  ...(fallbackAllocationRows.length
    ? [{ label: "Surplus / shortfall allocation", values: [], isSection: true }, ...fallbackAllocationRows]
    : []),
];
const superProjectionGroups = activeScenario.retirementAccounts
  .filter((account) => account.accountType === "super-accumulation")
  .map<ProjectionTableGroup>((account) => {
    const ownerName = personNameById[account.ownerPersonId] ?? "Client";

    return {
      groupId: account.accountId,
      title: account.productName,
      ownerPersonId: account.ownerPersonId,
      ownerName,
      subtitle: account.rolloverToPensionDate
        ? `Owner: ${ownerName} | Investment option: ${account.investmentProfileKey} | Rolls to pension from ${account.rolloverToPensionDate}`
        : `Owner: ${ownerName} | Investment option: ${account.investmentProfileKey}`,
      rows: [
        { label: `Age - ${ownerName}`, values: projectionRows.map((row) => `${row.ageByPersonId[account.ownerPersonId] ?? ""}`) },
        {
          label: "Opening balance",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.openingBalance ?? 0)),
          isTotal: true,
        },
        { label: "Money in", values: [], isSection: true },
        {
          label: "Employer contributions",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.grossEmployerContribution ?? 0)),
        },
        {
          label: "Additional contributions",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.additionalContribution ?? 0)),
        },
        {
          label: "Investment income",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.investmentIncome ?? 0)),
        },
        {
          label: "Investment growth",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.investmentGrowth ?? 0)),
        },
        { label: "Money out", values: [], isSection: true },
        {
          label: "Contributions tax",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.contributionTax ?? 0)),
        },
        {
          label: "Investment earnings tax",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.investmentTax ?? 0)),
        },
        {
          label: "Fees",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.fees ?? 0)),
        },
        {
          label: "Total tax payable",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.taxPayable ?? 0)),
          isTotal: true,
        },
        ...(account.rolloverToPensionDate
          ? [
              {
                label: "Rollover to pension",
                values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.rolloverOut ?? 0)),
              },
            ]
          : []),
        {
          label: "Closing balance",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.closingBalance ?? 0)),
          isTotal: true,
        },
      ],
    };
  });
const pensionProjectionGroups = retirementDisplayAccounts
  .filter((account) => account.accountType === "account-based-pension")
  .map<ProjectionTableGroup>((account) => {
    const ownerName = personNameById[account.ownerPersonId] ?? "Client";

    return {
      groupId: account.accountId,
      title: account.productName,
      ownerPersonId: account.ownerPersonId,
      ownerName,
      subtitle: `Owner: ${ownerName} | Investment option: ${account.investmentProfileKey}`,
      rows: [
        { label: `Age - ${ownerName}`, values: projectionRows.map((row) => `${row.ageByPersonId[account.ownerPersonId] ?? ""}`) },
        {
          label: "Opening balance",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.openingBalance ?? 0)),
          isTotal: true,
        },
        { label: "Money in", values: [], isSection: true },
        {
          label: "Rollover from super",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.rolloverIn ?? 0)),
        },
        {
          label: "Investment income",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.investmentIncome ?? 0)),
        },
        {
          label: "Investment growth",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.investmentGrowth ?? 0)),
        },
        { label: "Money out", values: [], isSection: true },
        {
          label: "Pension drawdown",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.drawdown ?? 0)),
        },
        {
          label: "Tax payable",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.taxPayable ?? 0)),
        },
        {
          label: "Fees",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.fees ?? 0)),
        },
        {
          label: "Closing balance",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.closingBalance ?? 0)),
          isTotal: true,
        },
      ],
    };
  });
const taxProjectionRowsByPersonId = Object.fromEntries(
  activeScenario.people.map((person) => {
    const taxableIncomeRows = activeScenario.cashflowItems
      .filter((item) => item.category === "other-income" && item.taxable && ownerIncludesPerson(item.ownerPersonId, person.personId))
      .map((item) => ({
        label: cashflowItemLabel(item),
        values: projectionRows.map((row) => money((row.cashflowItemValues[item.itemId] ?? 0) * ownerShare(item.ownerPersonId))),
      }));
    const taxableAssetIncomeRows = activeScenario.assets
      .filter((asset) => ownerIncludesPerson(asset.ownerPersonId, person.personId))
      .map((asset) => ({
        label: `${asset.name} taxable income`,
        rawValues: projectionRows.map((row) => (row.assetIncomeValues[asset.assetId] ?? 0) * ownerShare(asset.ownerPersonId)),
      }))
      .filter((row) => hasAnyAmount(row.rawValues))
      .map((row) => ({
        label: row.label,
        values: row.rawValues.map((value) => money(value)),
      }));
    const excludedPensionRows = activeScenario.retirementAccounts
      .filter((account) => account.accountType === "account-based-pension" && account.ownerPersonId === person.personId)
      .map((account) => ({
        label: `${account.productName} excluded from tax`,
        rawValues: projectionRows.map((row) => row.retirementAccountDetails[account.accountId]?.drawdown ?? 0),
      }))
      .filter((row) => hasAnyAmount(row.rawValues))
      .map((row) => ({
        label: row.label,
        values: row.rawValues.map((value) => money(value)),
      }));
    const taxRows = projectionRows.map((row) => row.taxByPersonId[person.personId] ?? row.tax);

    return [
      person.personId,
      [
        { label: `Age - ${person.name}`, values: projectionRows.map((row) => `${row.ageByPersonId[person.personId] ?? ""}`) },
        ...taxableIncomeRows,
        ...taxableAssetIncomeRows,
        ...[
          {
            label: "Taxable bank interest",
            rawValues: taxRows.map((row) => row.taxableBankInterest),
          },
          {
            label: "Age Pension excluded from tax",
            rawValues: person.personId === primaryPersonId ? projectionRows.map((row) => row.agePension.annualPayment) : [],
          },
        ]
          .filter((row) => hasAnyAmount(row.rawValues))
          .map((row) => ({
            label: row.label,
            values: row.rawValues.map((value) => money(value)),
          })),
        ...excludedPensionRows,
        { label: "Taxable income", values: taxRows.map((row) => money(row.taxableIncome)), isTotal: true },
        { label: "Gross tax", values: taxRows.map((row) => money(row.grossTax)) },
        { label: "Medicare levy", values: taxRows.map((row) => money(row.medicareLevy)) },
        ...(hasAnyAmount(taxRows.map((row) => row.taxOffsets))
          ? [{ label: "Configured offsets", values: taxRows.map((row) => money(row.taxOffsets)) }]
          : []),
        { label: "Tax payable", values: taxRows.map((row) => money(row.taxPayable)), isTotal: true },
      ],
    ];
  }),
);
const taxProjectionRows = taxProjectionRowsByPersonId[primaryPersonId] ?? [];
const agePensionProjectionRows = [
  { label: `Age - ${primaryPersonName}`, values: projectionRows.map((row) => `${row.ageByPersonId[primaryPersonId]}`) },
  { label: "Assessment inputs", values: [], isSection: true },
  { label: "Assessable assets", values: projectionRows.map((row) => money(row.agePension.assessableAssets)) },
  { label: "Deemed income", values: projectionRows.map((row) => money(row.agePension.deemedIncome)) },
  { label: "Legislative test outcomes", values: [], isSection: true },
  { label: "Maximum annual rate", values: projectionRows.map((row) => money(row.agePension.maximumAnnualRate)) },
  { label: "Assets test rate", values: projectionRows.map((row) => money(row.agePension.assetsTestAnnualRate)) },
  { label: "Income test rate", values: projectionRows.map((row) => money(row.agePension.incomeTestAnnualRate)) },
  { label: "Result", values: [], isSection: true },
  { label: "Modelled Age Pension", values: projectionRows.map((row) => money(row.agePension.annualPayment)), isTotal: true },
  { label: "Binding test", values: projectionRows.map((row) => row.agePension.bindingTest) },
];
const balanceSheetProjectionRows = [
  { label: `Age - ${primaryPersonName}`, values: projectionRows.map((row) => `${row.ageByPersonId[primaryPersonId]}`) },
  { label: "Assets", values: [], isSection: true },
  ...activeScenario.assets.map((asset) => ({
    label: asset.name,
    values: projectionRows.map((row) => money(row.assetValues[asset.assetId] ?? 0)),
  })),
  ...(activeScenario.retirementAccounts.length ? [{ label: "Retirement accounts", values: [], isSection: true }] : []),
  ...retirementDisplayAccounts.map((account) => ({
    label: account.productName,
    values: projectionRows.map((row) => money(row.retirementAccountBalances[account.accountId] ?? 0)),
  })),
  { label: "Total assets", values: projectionRows.map((row) => money(row.totalAssets)), isTotal: true },
  ...(activeScenario.liabilities.length ? [{ label: "Liabilities", values: [], isSection: true }] : []),
  ...activeScenario.liabilities.map((liability) => ({
    label: liability.name,
    values: projectionRows.map((row) => money(row.liabilityBalances[liability.liabilityId] ?? 0)),
  })),
  { label: "Total liabilities", values: projectionRows.map((row) => money(row.totalLiabilities)), isTotal: true },
  { label: "Net position", values: [], isSection: true },
  { label: "Net worth", values: projectionRows.map((row) => money(row.netWorth)), isTotal: true },
];

const assets = [
  ...activeScenario.assets.map((asset) => ({
    name: asset.name,
    owner: ownerName(asset.ownerPersonId),
    type: asset.type,
    value: money(asset.openingValue),
    treatment:
      asset.centrelink === "exempt"
        ? "Excluded from Centrelink assessment in this scenario"
        : asset.centrelink === "financial-asset"
          ? "Financial asset; included for deeming and assets test"
          : "Assessable asset; confirm treatment before relying on outputs",
  })),
  ...retirementDisplayAccounts.map((account) => ({
    name: account.productName,
    owner: ownerName(account.ownerPersonId),
    type: account.accountType,
    value: money(account.openingBalance),
    treatment: "Retirement account projected by the engine",
  })),
];

const cashflowRows = [
  ...activeScenario.cashflowItems
    .filter((item) => item.category === "other-income")
    .map((item) => ({
      section: "Inflow",
      item: item.label,
      annual: money(item.annualAmount),
      notes: item.taxable ? "Taxable income mapped from uploaded scenario" : "Non-taxable income mapped from uploaded scenario",
    })),
  {
    section: "Super",
    item: "Employer SG contributions",
    annual: money(projectionRows[0].employerSuperContributions),
    notes: "Calculated by the engine from taxable employment income and legislative SG assumptions",
  },
  {
    section: "Super",
    item: "Contributions tax",
    annual: money(-projectionRows[0].concessionalContributionsTax),
    notes: "15% contributions tax deducted inside super before investment earnings",
  },
  {
    section: "Super",
    item: "Net employer SG invested",
    annual: money(projectionRows[0].netEmployerSuperContributions),
    notes: "Allocated to each person's mapped accumulation account",
  },
  {
    section: "Inflow",
    item: "Account-based pension",
    annual: money(projectionRows[0].accountBasedPension),
    notes: activeScenario.retirementAccounts.some((account) => account.accountType === "account-based-pension")
      ? "Drawdown mapped from uploaded pension accounts"
      : "No account-based pension drawdown mapped",
  },
  { section: "Inflow", item: "Modelled Age Pension", annual: money(projectionRows[0].agePension.annualPayment), notes: `Calculated from ${projectionRows[0].agePension.bindingTest} test` },
  { section: "Inflow", item: "Bank interest", annual: money(projectionRows[0].bankInterest), notes: "Cash reserve interest taxed personally" },
  ...activeScenario.cashflowItems
    .filter(
      (item) =>
        (item.category === "living-expense" || item.category === "other-expense") &&
        !liabilityRepaymentItemIds.has(item.itemId),
    )
    .map((item) => ({
      section: "Outflow",
      item: item.label,
      annual: money(-item.annualAmount),
      notes: item.indexedToCpi ? "Mapped outflow indexed by CPI" : "Mapped outflow held flat",
    })),
  ...activeScenario.liabilities
    .filter((liability) => liability.annualRepayment > 0)
    .map((liability) => ({
      section: "Outflow",
      item: `${liability.name} repayment`,
      annual: money(-(projectionRows[0].liabilityRepaymentValues[liability.liabilityId] ?? 0)),
      notes: "Generated from the liability repayment input",
    })),
  { section: "Outflow", item: "Tax payable", annual: money(projectionRows[0].tax.taxPayable), notes: "Calculated from legislative assumptions below" },
  { section: "Net", item: "Estimated surplus / shortfall", annual: money(projectionRows[0].netCashflowAfterTax), notes: "After modelled tax, before ad hoc expenses" },
];

const retirementAccounts = retirementDisplayAccounts.map((account) => ({
  account: account.productName,
  balance: money(account.openingBalance),
  profile: account.investmentProfileKey,
  drawdown: account.annualDrawdown ? `${money(account.annualDrawdown)} p.a.` : "N/A",
  schemaRows: ["Opening Value", "Transaction (SOP)", "Earnings", "Ongoing Fee", "Tax Payable (EOP)", "Closing Value"],
}));

const projectionChecks = [
  "Confirm age, residency, and Age Pension eligibility before relying on Centrelink outputs.",
  "Age Pension is currently excluded from taxable income in this prototype per the modelling instruction; confirm if taxable treatment should be reinstated with SAPTO/LITO.",
  "Confirm pension minimum drawdown and current pension features where a pension account exists.",
  "Confirm current pension tax components and Centrelink assessment treatment.",
  "Confirm product fees, transaction costs, buy/sell spreads, and any loss of existing features before replacement modelling.",
  "Keep closing balances and tax outcomes locked as calculated outputs, not editable LLM fields.",
];

const assumptionSources = [
  { layer: "Economic", source: "Assumption_Economic.csv", use: "CPI, AWOTE, life expectancy factors, asset class growth and income assumptions" },
  { layer: "Investment profiles", source: "Assumption_Investment profiles.csv", use: "Balanced, Conservative, and Conservative/Balanced return profiles" },
  { layer: "Legislative", source: "Assumption_Legislative.csv", use: "Tax rates, offsets, Medicare, and general legislative settings" },
  { layer: "Account-based pension", source: "Assumption_Legislative - Account Based Pension.csv", use: "Minimum drawdown factors and pension constraints" },
  { layer: "Superannuation", source: "Assumption_Legislative_Superannuation.csv", use: "Contribution caps and super-specific rules" },
];

  return {
    activeScenario,
    money,
    projectionRows,
    primaryPersonId,
    projectionStartYear,
    endAge,
    cashReserveTarget,
    openingCash,
    openingAmpPension,
    startingNetWorth,
    finalProjectionYear,
    firstReserveBreach,
    cashflowProjectionRows,
    superProjectionGroups,
    pensionProjectionGroups,
    taxProjectionRows,
    taxProjectionRowsByPersonId,
    agePensionProjectionRows,
    balanceSheetProjectionRows,
    assets,
    cashflowRows,
    retirementAccounts,
    projectionChecks,
    assumptions: assumptionSources,
  };
}

function ProjectionsPageContent() {
  const searchParams = useSearchParams();
  const linkedClientId = searchParams.get("clientId")?.trim() ?? "";
  const linkedSoaId = searchParams.get("soaId")?.trim() ?? "";
  const hasLinkedSoaContext = Boolean(linkedClientId && linkedSoaId);
  const [scenarioUploadName, setScenarioUploadName] = useState<string | null>(null);
  const [scenarioFile, setScenarioFile] = useState<File | null>(null);
  const [pendingClientProfileScenario, setPendingClientProfileScenario] = useState<ProjectionScenario | null>(null);
  const [scenarios, setScenarios] = useState<ProjectionScenario[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [workspaceStateLoaded, setWorkspaceStateLoaded] = useState(false);
  const [mappingResult, setMappingResult] = useState<ScenarioMapResponse | null>(null);
  const [mappingStatus, setMappingStatus] = useState<"idle" | "mapping" | "mapped" | "error">("idle");
  const [clientImportStatus, setClientImportStatus] = useState<ClientImportStatus>("idle");
  const [clientImportMessage, setClientImportMessage] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<ProjectionSection>("scenario-inputs");
  const [activeScenarioInputTab, setActiveScenarioInputTab] = useState<ScenarioInputTab>("scenario-details");
  const [superOwnerFilter, setSuperOwnerFilter] = useState("all");
  const [taxPersonFilter, setTaxPersonFilter] = useState<string | null>(null);
  const [scenarioAssumptionOverrides, setScenarioAssumptionOverrides] = useState<ScenarioAssumptionOverrides>(
    getInitialScenarioAssumptionOverrides,
  );
  const workspaceStorageKey = useMemo(
    () => projectionWorkspaceStorageKey(linkedClientId, linkedSoaId),
    [linkedClientId, linkedSoaId],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      setWorkspaceStateLoaded(true);
      return;
    }

    const raw = window.localStorage.getItem(workspaceStorageKey);
    if (!raw) {
      setWorkspaceStateLoaded(true);
      return;
    }

    try {
      const stored = JSON.parse(raw) as StoredProjectionWorkspaceState;
      if (Array.isArray(stored.scenarios) && stored.scenarios.length) {
        setScenarios(stored.scenarios);
        setActiveScenarioId(
          stored.activeScenarioId && stored.scenarios.some((scenario) => scenario.scenarioId === stored.activeScenarioId)
            ? stored.activeScenarioId
            : stored.scenarios[0]?.scenarioId ?? null,
        );
        const fallbackAssumptions = getInitialScenarioAssumptionOverrides();
        setScenarioAssumptionOverrides({
          ...fallbackAssumptions,
          ...stored.scenarioAssumptionOverrides,
          riskProfiles: {
            ...fallbackAssumptions.riskProfiles,
            ...(stored.scenarioAssumptionOverrides?.riskProfiles ?? {}),
          },
        });
        setActiveSection(stored.activeSection ?? "scenario-inputs");
        setActiveScenarioInputTab(stored.activeScenarioInputTab ?? "scenario-details");
      }
    } catch {
      // Ignore corrupted local workspace state and start clean.
    } finally {
      setWorkspaceStateLoaded(true);
    }
  }, [workspaceStorageKey]);

  useEffect(() => {
    if (!workspaceStateLoaded || typeof window === "undefined") {
      return;
    }

    const stored = buildStoredProjectionWorkspaceState({
      scenarios,
      activeScenarioId,
      scenarioAssumptionOverrides,
      activeSection,
      activeScenarioInputTab,
    });
    window.localStorage.setItem(workspaceStorageKey, JSON.stringify(stored));

    if (hasLinkedSoaContext) {
      writeSoaProjectionScenarioOptions(
        linkedClientId,
        linkedSoaId,
        scenarios.map((scenario) => createProjectionPackageForScenario(scenario)),
      );
    }
  }, [
    activeScenarioId,
    activeScenarioInputTab,
    activeSection,
    hasLinkedSoaContext,
    linkedClientId,
    linkedSoaId,
    scenarioAssumptionOverrides,
    scenarios,
    workspaceStateLoaded,
    workspaceStorageKey,
  ]);

  const mappedScenario = scenarios.find((scenario) => scenario.scenarioId === activeScenarioId) ?? null;
  const hasSourceDataReady = Boolean(scenarioFile || pendingClientProfileScenario);
  const activeAssumptions = useMemo(
    () => {
      const riskProfiles = Object.fromEntries(
        Object.entries(currentProjectionAssumptions.investmentProfiles.profiles).map(([profileName, profile]) => {
          const override = scenarioAssumptionOverrides.riskProfiles[profileName];
          const incomeRate = override?.incomeRate ?? profile.incomeRate;
          const growthRate = override?.growthRate ?? profile.growthRate;

          return [
            profileName,
            {
              ...profile,
              incomeRate,
              growthRate,
              totalReturn: incomeRate + growthRate,
              standardDeviation: override?.standardDeviation ?? profile.standardDeviation,
              defensivePct: override?.defensivePct ?? profile.defensivePct,
              growthPct: override?.growthPct ?? profile.growthPct,
            },
          ];
        }),
      );

      return {
        ...currentProjectionAssumptions,
        economic: {
          ...currentProjectionAssumptions.economic,
          cpiRate: scenarioAssumptionOverrides.cpiRate,
        },
        legislative: {
          ...currentProjectionAssumptions.legislative,
          superannuation: {
            ...currentProjectionAssumptions.legislative.superannuation,
            superGuaranteeRate: scenarioAssumptionOverrides.superGuaranteeRate,
            concessionalContributionsCap: scenarioAssumptionOverrides.concessionalContributionsCap,
            contributionsTaxRate: scenarioAssumptionOverrides.contributionsTaxRate,
            investmentEarningsTaxRate: scenarioAssumptionOverrides.investmentEarningsTaxRate,
          },
        },
        investmentProfiles: {
          profiles: riskProfiles,
        },
      };
    },
    [scenarioAssumptionOverrides],
  );
  const viewModel = useMemo(
    () => buildProjectionViewModel(mappedScenario ?? blankProjectionScenario, activeAssumptions),
    [activeAssumptions, mappedScenario],
  );
  const {
    activeScenario,
    money,
    projectionRows,
    primaryPersonId,
    projectionStartYear,
    endAge,
    cashReserveTarget,
    openingCash,
    openingAmpPension,
    startingNetWorth,
    finalProjectionYear,
    firstReserveBreach,
    cashflowProjectionRows,
    superProjectionGroups,
    pensionProjectionGroups,
    taxProjectionRows,
    taxProjectionRowsByPersonId,
    agePensionProjectionRows,
    balanceSheetProjectionRows,
    assets,
    cashflowRows,
    retirementAccounts,
    projectionChecks,
    assumptions,
  } = viewModel;
  const primaryPerson = activeScenario.people.find((person) => person.personId === activeScenario.primaryPersonId);
  const activeClientName = mappedScenario ? primaryPerson?.name ?? activeScenario.scenarioName : "Blank scenario";
  const selectedTaxPersonId = activeScenario.people.some((person) => person.personId === taxPersonFilter)
    ? taxPersonFilter
    : activeScenario.primaryPersonId;
  const selectedTaxProjectionRows = taxProjectionRowsByPersonId[selectedTaxPersonId ?? activeScenario.primaryPersonId] ?? taxProjectionRows;
  const filteredSuperProjectionGroups =
    superOwnerFilter === "all"
      ? superProjectionGroups
      : superProjectionGroups.filter((group) => group.ownerPersonId === superOwnerFilter);
  const filteredPensionProjectionGroups =
    superOwnerFilter === "all"
      ? pensionProjectionGroups
      : pensionProjectionGroups.filter((group) => group.ownerPersonId === superOwnerFilter);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const activeLiabilityRepaymentItemIds = new Set(
    activeScenario.liabilities.map((liability) => `${liability.liabilityId}-repayment`),
  );

  function scenarioVersionId(prefix = "scenario") {
    return makeId(prefix);
  }

  function updateActiveScenario(applyUpdate: (draft: ProjectionScenario) => void) {
    const nextScenario = structuredClone(activeScenario) as ProjectionScenario;
    applyUpdate(nextScenario);
    const scenarioId = !activeScenarioId || activeScenarioId === blankProjectionScenario.scenarioId
      ? scenarioVersionId("manual")
      : activeScenarioId;
    nextScenario.scenarioId = scenarioId;

    setScenarios((currentScenarios) => {
      if (!currentScenarios.some((scenario) => scenario.scenarioId === scenarioId)) {
        return [nextScenario];
      }

      return currentScenarios.map((scenario) => (scenario.scenarioId === scenarioId ? nextScenario : scenario));
    });
    setActiveScenarioId(scenarioId);
  }

  function numberFromInput(value: string, fallback = 0) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
  }

  function numberFromCurrencyInput(value: string, fallback = 0) {
    const isNegativeParentheses = /^\s*\(.*\)\s*$/.test(value);
    const numericValue = Number(value.replace(/[,$\s()]/g, ""));

    if (!Number.isFinite(numericValue)) {
      return fallback;
    }

    return isNegativeParentheses ? -Math.abs(numericValue) : numericValue;
  }

  function currencyInputValue(value: number) {
    if (!Number.isFinite(value)) {
      return "";
    }

    return value.toLocaleString("en-AU", {
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    });
  }

  function percentInputValue(value: number) {
    return Math.round(value * 10000) / 100;
  }

  function renderCurrencyInput(input: { value: number; onChange: (value: number) => void }) {
    return (
      <div className={styles.affixInput}>
        <span>$</span>
        <input
          type="text"
          inputMode="decimal"
          value={currencyInputValue(input.value)}
          onChange={(event) => input.onChange(numberFromCurrencyInput(event.target.value, input.value))}
        />
      </div>
    );
  }

  function renderPercentInput(input: { value: number; onChange: (value: number) => void; compact?: boolean }) {
    return (
      <div className={`${styles.affixInput} ${input.compact ? styles.compactAffixInput : ""}`.trim()}>
        <input
          type="number"
          step="0.1"
          value={percentInputValue(input.value)}
          onChange={(event) => input.onChange(numberFromInput(event.target.value, percentInputValue(input.value)) / 100)}
        />
        <span>%</span>
      </div>
    );
  }

  function updateRiskProfileAssumption(
    profileName: string,
    applyUpdate: (profile: ScenarioAssumptionOverrides["riskProfiles"][string]) => void,
  ) {
    setScenarioAssumptionOverrides((current) => {
      const existingProfile = current.riskProfiles[profileName] ?? {
        incomeRate: 0,
        growthRate: 0,
        standardDeviation: null,
        defensivePct: null,
        growthPct: null,
      };
      const nextProfile = { ...existingProfile };
      applyUpdate(nextProfile);

      return {
        ...current,
        riskProfiles: {
          ...current.riskProfiles,
          [profileName]: nextProfile,
        },
      };
    });
  }

  function updatePerson(personId: string, applyUpdate: (person: ProjectionScenario["people"][number]) => void) {
    updateActiveScenario((draft) => {
      const person = draft.people.find((entry) => entry.personId === personId);
      if (person) {
        applyUpdate(person);
      }
    });
  }

  function updateCashflowItem(itemId: string, applyUpdate: (item: ProjectionScenario["cashflowItems"][number]) => void) {
    updateActiveScenario((draft) => {
      const item = draft.cashflowItems.find((entry) => entry.itemId === itemId);
      if (item) {
        applyUpdate(item);
      }
    });
  }

  function updateAsset(assetId: string, applyUpdate: (asset: ProjectionScenario["assets"][number]) => void) {
    updateActiveScenario((draft) => {
      const asset = draft.assets.find((entry) => entry.assetId === assetId);
      if (asset) {
        applyUpdate(asset);
      }
    });
  }

  function updateLiability(liabilityId: string, applyUpdate: (liability: ProjectionScenario["liabilities"][number]) => void) {
    updateActiveScenario((draft) => {
      const liability = draft.liabilities.find((entry) => entry.liabilityId === liabilityId);
      if (liability) {
        applyUpdate(liability);
      }
    });
  }

  function updateRetirementAccount(
    accountId: string,
    applyUpdate: (account: ProjectionScenario["retirementAccounts"][number]) => void,
  ) {
    updateActiveScenario((draft) => {
      const account = draft.retirementAccounts.find((entry) => entry.accountId === accountId);
      if (account) {
        applyUpdate(account);
      }
    });
  }

  function createScenarioInputId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function addCashflowItem(category: ProjectionScenario["cashflowItems"][number]["category"]) {
    updateActiveScenario((draft) => {
      draft.cashflowItems.push({
        itemId: createScenarioInputId("cashflow"),
        ownerPersonId: draft.primaryPersonId,
        category,
        label:
          category === "other-income"
            ? "New income"
            : category === "living-expense"
              ? "New living expense"
              : "New other expense",
        annualAmount: 0,
        startDate: null,
        endDate: null,
        indexedToCpi: category !== "other-income",
        taxable: category === "other-income",
      });
    });
  }

  function deleteCashflowItem(itemId: string) {
    updateActiveScenario((draft) => {
      draft.cashflowItems = draft.cashflowItems.filter((item) => item.itemId !== itemId);
    });
  }

  function addAsset(type: ProjectionScenario["assets"][number]["type"]) {
    updateActiveScenario((draft) => {
      draft.assets.push({
        assetId: createScenarioInputId("asset"),
        ownerPersonId: draft.primaryPersonId,
        type,
        name: type === "cash" ? "New cash reserve" : type === "investment" ? "New investment" : "New asset",
        openingValue: 0,
        annualIncome: 0,
        growthRateKey: type === "cash" ? "cash" : type === "primary-residence" ? "cpi" : "none",
        centrelink: type === "primary-residence" ? "exempt" : type === "cash" || type === "investment" ? "financial-asset" : "assessable",
        reserveTarget: type === "cash" ? 0 : null,
      });
    });
  }

  function deleteAsset(assetId: string) {
    updateActiveScenario((draft) => {
      draft.assets = draft.assets.filter((asset) => asset.assetId !== assetId);
    });
  }

  function addLiability(type: ProjectionScenario["liabilities"][number]["type"]) {
    updateActiveScenario((draft) => {
      draft.liabilities.push({
        liabilityId: createScenarioInputId("liability"),
        ownerPersonId: draft.primaryPersonId,
        type,
        name: type === "mortgage" ? "New home loan" : type === "credit-card" ? "New credit card" : "New liability",
        openingBalance: 0,
        annualInterestRate: 0,
        annualRepayment: 0,
        repaymentTiming: "end-of-year",
      });
    });
  }

  function deleteLiability(liabilityId: string) {
    updateActiveScenario((draft) => {
      draft.liabilities = draft.liabilities.filter((liability) => liability.liabilityId !== liabilityId);
    });
  }

  function addRetirementAccount(accountType: ProjectionScenario["retirementAccounts"][number]["accountType"]) {
    updateActiveScenario((draft) => {
      draft.retirementAccounts.push({
        accountId: createScenarioInputId("retirement"),
        ownerPersonId: draft.primaryPersonId,
        accountType,
        provider: "To be confirmed",
        productName: accountType === "account-based-pension" ? "New account-based pension" : "New super account",
        openingBalance: 0,
        annualFeeRate: 0.015,
        annualContribution: 0,
        annualContributionType: "concessional",
        rolloverToPensionDate: null,
        rolloverPensionName: null,
        rolloverAnnualDrawdown: 0,
        rolloverDrawdownIndexedToCpi: false,
        investmentProfileKey: "Balanced",
        annualDrawdown: accountType === "account-based-pension" ? 0 : 0,
        drawdownIndexedToCpi: false,
        taxableToClient: false,
        centrelink: "financial-asset",
      });
    });
  }

  function deleteRetirementAccount(accountId: string) {
    updateActiveScenario((draft) => {
      draft.retirementAccounts = draft.retirementAccounts.filter((account) => account.accountId !== accountId);
    });
  }

  async function handleRunScenario() {
    if (pendingClientProfileScenario && !scenarioFile) {
      const scenarioId = scenarioVersionId("client-profile");
      const importedScenario = {
        ...pendingClientProfileScenario,
        scenarioId,
        scenarioName: scenarios.length ? pendingClientProfileScenario.scenarioName : "Current Situation",
      };

      setScenarios((currentScenarios) => [...currentScenarios, importedScenario]);
      setActiveScenarioId(scenarioId);
      setActiveSection("scenario-inputs");
      setActiveScenarioInputTab("scenario-details");
      setMappingResult({
        source: "fallback",
        mappingNotes: ["Imported structured client fact find data from the app into the projection model."],
      });
      setMappingStatus("mapped");
      setClientImportStatus("idle");
      setClientImportMessage(null);
      setPendingClientProfileScenario(null);
      return;
    }

    if (!scenarioFile) {
      setMappingResult({ error: "Upload or import a fact find before running the projection model." });
      setMappingStatus("error");
      return;
    }

    setMappingStatus("mapping");
    setMappingResult(null);

    const formData = new FormData();
    formData.append("file", scenarioFile);

    try {
      const response = await fetch("/api/projections/scenario-map", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json().catch(() => null)) as ScenarioMapResponse | null;

      if (!response.ok || !body?.scenario) {
        throw new Error(body?.error ?? "Finley could not map this fact find into a projection scenario.");
      }

      const scenarioId = scenarioVersionId("uploaded");
      const uploadedScenario = {
        ...body.scenario,
        scenarioId,
        scenarioName: scenarios.length ? body.scenario.scenarioName : "Current Situation",
      };
      setScenarios((currentScenarios) => [...currentScenarios, uploadedScenario]);
      setActiveScenarioId(scenarioId);
      setMappingResult(body);
      setMappingStatus("mapped");
      setPendingClientProfileScenario(null);
    } catch (error) {
      setMappingResult({ error: error instanceof Error ? error.message : "Finley could not map this fact find." });
      setMappingStatus("error");
    }
  }

  async function handleImportClientProfileScenario() {
    if (!linkedClientId) {
      setClientImportStatus("error");
      setClientImportMessage("Open projections from an SOA or client record before importing the app fact find.");
      return;
    }

    setClientImportStatus("importing");
    setClientImportMessage(null);

    try {
      const response = await fetch(`/api/finley/soa/client-profile?clientId=${encodeURIComponent(linkedClientId)}`, {
        method: "GET",
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as { profile?: ClientProfile; error?: string } | null;

      if (!response.ok || !body?.profile) {
        throw new Error(body?.error ?? "Finley could not load the app fact find for this client.");
      }

      const importedScenario = mapClientProfileToProjectionScenario(body.profile);
      importedScenario.scenarioName = scenarios.length ? `${personName(body.profile.client, "Client")} current situation` : "Current Situation";

      setPendingClientProfileScenario(importedScenario);
      setScenarioFile(null);
      setScenarioUploadName(null);
      setClientImportStatus("imported");
      setClientImportMessage("App fact find loaded. Run the projection model to create the scenario.");
      setMappingResult(null);
      setMappingStatus("idle");
    } catch (error) {
      setClientImportStatus("error");
      setClientImportMessage(error instanceof Error ? error.message : "Finley could not import the app fact find.");
    }
  }

  function duplicateActiveScenario() {
    if (!mappedScenario) {
      return;
    }

    const scenarioId = scenarioVersionId("recommended");
    const copiedScenario = structuredClone(mappedScenario) as ProjectionScenario;
    copiedScenario.scenarioId = scenarioId;
    copiedScenario.scenarioName = /current situation/i.test(mappedScenario.scenarioName)
      ? "Recommended Scenario"
      : `${mappedScenario.scenarioName} - copy`;

    setScenarios((currentScenarios) => [...currentScenarios, copiedScenario]);
    setActiveScenarioId(scenarioId);
    setActiveSection("scenario-inputs");
    setActiveScenarioInputTab("scenario-details");
  }

  function deleteActiveScenario() {
    if (!mappedScenario) {
      return;
    }

    setScenarios((currentScenarios) => {
      const scenarioIndex = currentScenarios.findIndex((scenario) => scenario.scenarioId === mappedScenario.scenarioId);
      const nextScenarios = currentScenarios.filter((scenario) => scenario.scenarioId !== mappedScenario.scenarioId);
      const nextScenario = nextScenarios[Math.max(0, scenarioIndex - 1)] ?? nextScenarios[0] ?? null;

      setActiveScenarioId(nextScenario?.scenarioId ?? null);
      return nextScenarios;
    });
    setActiveSection("scenario-inputs");
    setActiveScenarioInputTab("scenario-details");
  }

  function createFinancialProjectionForScenario(scenario: ProjectionScenario): FinancialProjectionV1 {
    const scenarioViewModel =
      scenario.scenarioId === activeScenario.scenarioId ? viewModel : buildProjectionViewModel(scenario, activeAssumptions);
    const {
      activeScenario: outputScenario,
      money: outputMoney,
      projectionRows: outputProjectionRows,
      primaryPersonId: outputPrimaryPersonId,
      endAge: outputEndAge,
      startingNetWorth: outputStartingNetWorth,
      finalProjectionYear: outputFinalProjectionYear,
      cashflowProjectionRows: outputCashflowProjectionRows,
    } = scenarioViewModel;
    const outputPrimaryPerson = outputScenario.people.find((person) => person.personId === outputScenario.primaryPersonId);
    const outputClientName = outputPrimaryPerson?.name ?? outputScenario.scenarioName;
    const projectionType = /recommended/i.test(outputScenario.scenarioName)
      ? ("recommended-position" as const)
      : ("current-position" as const);
    const firstProjectionYear = outputProjectionRows[0];
    const cashflowTableColumnCount = Math.min(5, outputProjectionRows.length);
    const currentValueKey = projectionType === "recommended-position" ? "recommendedValue" : "currentValue";
    const percentForSoa = (value: number | null | undefined) =>
      value === null || value === undefined || Number.isNaN(value) ? "-" : `${Math.round(value * 10000) / 100}%`;
    const metric = (metricId: string, name: string, value: number | null, unit: "currency" | "percent" | "years" | "other" = "currency") => ({
      metricId,
      name,
      currentValue: currentValueKey === "currentValue" ? value : null,
      recommendedValue: currentValueKey === "recommendedValue" ? value : null,
      differenceValue: null,
      unit,
      notes: null,
    });

    return {
      projectionId: `projection-${outputScenario.scenarioId}`,
      name: outputScenario.scenarioName || "Projection scenario",
      projectionType,
      purpose: `Projection output selected from the projections workspace for ${outputClientName}.`,
      timeframe: {
        startDate: `${outputScenario.startYear}-${String(outputScenario.startMonth).padStart(2, "0")}-01`,
        projectionYears: outputProjectionRows.length,
        retirementAge: outputPrimaryPerson?.retirementAge ?? null,
        endAge: outputEndAge,
      },
      assumptions: {
        inflationPct: activeAssumptions.economic.cpiRate * 100,
        earningsRatePct: null,
        salaryGrowthPct: activeAssumptions.economic.cpiRate * 100,
        contributionGrowthPct: activeAssumptions.economic.cpiRate * 100,
        drawdownRatePct: null,
        taxAssumptions: "Individual tax calculated from legislative resident tax rates and Medicare levy assumptions.",
        legislativeAssumptions: `Legislative assumption set effective ${activeAssumptions.legislative.effectiveDate}.`,
        notes: "Projection tables are calculated by the projections engine and selected for SOA use by the adviser.",
      },
      inputsSummary: `${outputScenario.people.length} person(s), ${outputScenario.assets.length} asset(s), ${outputScenario.liabilities.length} liabilit${outputScenario.liabilities.length === 1 ? "y" : "ies"}, and ${outputScenario.retirementAccounts.length} retirement account(s) were modelled.`,
      outputs: {
        currentPositionSummary:
          projectionType === "current-position" && outputFinalProjectionYear
            ? `Projected net worth at age ${outputEndAge} is ${outputMoney(outputFinalProjectionYear.netWorth)}.`
            : null,
        recommendedPositionSummary:
          projectionType === "recommended-position" && outputFinalProjectionYear
            ? `Projected net worth at age ${outputEndAge} is ${outputMoney(outputFinalProjectionYear.netWorth)}.`
            : null,
        betterPositionSummary: outputFinalProjectionYear
          ? `Final projected cash reserve is ${outputMoney(outputFinalProjectionYear.cashReserve)} and final net cashflow is ${outputMoney(outputFinalProjectionYear.netCashflowAfterTax)}.`
          : null,
        keyMetrics: [
          metric("opening-net-worth", "Opening net worth", outputStartingNetWorth),
          metric("projected-net-worth", `Projected net worth at age ${outputEndAge}`, outputFinalProjectionYear?.netWorth ?? null),
          metric("final-net-cashflow", "Final annual net cashflow after tax", outputFinalProjectionYear?.netCashflowAfterTax ?? null),
          metric("final-cash-reserve", "Final cash reserve", outputFinalProjectionYear?.cashReserve ?? null),
          metric("first-year-tax", "First year tax payable", firstProjectionYear?.tax.taxPayable ?? null),
        ],
        yearlySeries: outputProjectionRows.map((row, index) => ({
          yearIndex: index,
          age: row.ageByPersonId[outputPrimaryPersonId] ?? null,
          calendarYear: row.year,
          currentValue: currentValueKey === "currentValue" ? row.netWorth : null,
          recommendedValue: currentValueKey === "recommendedValue" ? row.netWorth : null,
          differenceValue: null,
        })),
        cashflowTable: {
          tableId: "personal-cashflow",
          title: "Personal cash flow",
          columns: outputProjectionRows.slice(0, cashflowTableColumnCount).map((row) => `1 Jul ${String(row.year).slice(-2)}`),
          rows: outputCashflowProjectionRows.map((row) => ({
            label: row.label,
            values: row.values.slice(0, cashflowTableColumnCount),
            isSection: "isSection" in row ? row.isSection ?? false : false,
            isTotal: "isTotal" in row ? row.isTotal ?? false : false,
          })),
        },
        assumptionTables: [
          {
            tableId: "core-modelling-assumptions",
            title: "Core modelling assumptions",
            columns: ["Value"],
            rows: [
              { label: "CPI indexation (% p.a.)", values: [percentForSoa(activeAssumptions.economic.cpiRate)] },
              { label: "Employer SG (%)", values: [percentForSoa(activeAssumptions.legislative.superannuation.superGuaranteeRate)] },
              { label: "Concessional cap", values: [money(activeAssumptions.legislative.superannuation.concessionalContributionsCap)] },
              { label: "Contributions tax (%)", values: [percentForSoa(activeAssumptions.legislative.superannuation.contributionsTaxRate)] },
              { label: "Super earnings tax (%)", values: [percentForSoa(activeAssumptions.legislative.superannuation.investmentEarningsTaxRate)] },
            ],
          },
          {
            tableId: "risk-profile-return-assumptions",
            title: "Risk profile return assumptions",
            columns: ["Income return", "Growth return", "Total return", "Volatility", "Defensive assets", "Growth assets"],
            rows: editableRiskProfileNames.map((profileName) => {
              const profile = activeAssumptions.investmentProfiles.profiles[profileName];
              const incomeRate = profile?.incomeRate ?? 0;
              const growthRate = profile?.growthRate ?? 0;

              return {
                label: profileName,
                values: [
                  percentForSoa(incomeRate),
                  percentForSoa(growthRate),
                  percentForSoa(incomeRate + growthRate),
                  percentForSoa(profile?.standardDeviation),
                  percentForSoa(profile?.defensivePct),
                  percentForSoa(profile?.growthPct),
                ],
              };
            }),
          },
        ],
      },
      linkedRecommendationIds: [],
      rationale: "Selected projection package from the standalone projections module.",
    };
  }

  function createProjectionPackageForScenario(scenario: ProjectionScenario) {
    return {
      packageId: makeId("projection-package"),
      clientId: linkedClientId,
      soaId: linkedSoaId,
      projectionCaseId: `projection-case-${linkedSoaId}`,
      selectedScenarioId: scenario.scenarioId,
      selectedScenarioName: scenario.scenarioName,
      financialProjection: createFinancialProjectionForScenario(scenario),
      createdAt: new Date().toISOString(),
      status: "selected-for-soa" as const,
    };
  }

  function getSurplusAllocationSelectValue() {
    const target = activeScenario.cashflowAllocation?.surplusTarget;

    if (target?.targetType === "cash-asset") {
      return `cash-asset:${target.targetId}`;
    }

    if (target?.targetType === "liability") {
      return `liability:${target.targetId}`;
    }

    const defaultCashAssetId = activeScenario.assets.find((asset) => asset.type === "cash")?.assetId;
    return defaultCashAssetId ? `cash-asset:${defaultCashAssetId}` : "";
  }

  function updateSurplusAllocationTarget(value: string) {
    const [targetType, targetId] = value.split(":");

    updateActiveScenario((draft) => {
      draft.cashflowAllocation = {
        ...(draft.cashflowAllocation ?? {}),
        surplusTarget:
          (targetType === "cash-asset" || targetType === "liability") && targetId
            ? { targetType, targetId }
            : null,
      };
    });
  }

  function renderSurplusAllocationControl() {
    const cashAssets = activeScenario.assets.filter((asset) => asset.type === "cash");
    const liabilities = activeScenario.liabilities;
    const hasOptions = cashAssets.length > 0 || liabilities.length > 0;

    return (
      <label className={styles.allocationControl}>
        <span>Surplus to</span>
        <select
          value={getSurplusAllocationSelectValue()}
          disabled={!hasOptions}
          onChange={(event) => updateSurplusAllocationTarget(event.target.value)}
        >
          {cashAssets.map((asset) => (
            <option key={asset.assetId} value={`cash-asset:${asset.assetId}`}>
              {asset.name}
            </option>
          ))}
          {liabilities.map((liability) => (
            <option key={liability.liabilityId} value={`liability:${liability.liabilityId}`}>
              {liability.name}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function renderProjectionTable(rows: ProjectionTableRow[], highlightNetCashflow = false) {
    if (rows.length <= 1) {
      return <p className={styles.emptyState}>No projection rows have been mapped for this section yet.</p>;
    }

    return (
      <div className={styles.tableWrap}>
        <table className={`${styles.dataTable} ${styles.projectionTable}`.trim()}>
          <thead>
            <tr>
              <th className={styles.stickyLabelCell}>Date</th>
              {projectionRows.map((row) => (
                <th key={row.year}>1 Jul {String(row.year).slice(-2)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) =>
              row.isSection ? (
                <tr key={row.label} className={styles.projectionSectionRow}>
                  <td colSpan={projectionRows.length + 1}>{row.label}</td>
                </tr>
              ) : (
                <tr key={row.label} className={row.isTotal ? styles.totalProjectionRow : undefined}>
                  <td className={styles.stickyLabelCell}>
                    {row.control === "surplus-allocation" ? renderSurplusAllocationControl() : row.label}
                  </td>
                  {row.values.map((value, index) => {
                    const projectionRow = projectionRows[index];
                    const isNegativeCashflow =
                      highlightNetCashflow && row.label === "Net cashflow after tax" && projectionRow.netCashflowAfterTax < 0;
                    const isPositiveCashflow =
                      highlightNetCashflow && row.label === "Net cashflow after tax" && projectionRow.netCashflowAfterTax >= 0;
                    const isCashReserveWarning = row.label === "Cash reserve" && projectionRow.cashReserve < cashReserveTarget;

                    return (
                      <td
                        key={`${row.label}-${projectionRow.year}`}
                        className={[
                          styles.numberCell,
                          isNegativeCashflow ? styles.negativeCell : "",
                          isPositiveCashflow ? styles.positiveCell : "",
                          isCashReserveWarning ? styles.warningText : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    );
  }

  function renderGroupedProjectionTable(groups: ProjectionTableGroup[]) {
    if (!groups.length) {
      return <p className={styles.emptyState}>No superannuation accounts match this view.</p>;
    }

    return (
      <div className={styles.tableWrap}>
        <table className={`${styles.dataTable} ${styles.projectionTable}`.trim()}>
          <thead>
            <tr>
              <th className={styles.stickyLabelCell}>Date</th>
              {projectionRows.map((row) => (
                <th key={row.year}>1 Jul {String(row.year).slice(-2)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.flatMap((group) => [
              <tr key={`${group.groupId}-heading`} className={styles.projectionGroupRow}>
                <td colSpan={projectionRows.length + 1}>
                  <strong>{group.title}</strong>
                  <span>{group.subtitle}</span>
                </td>
              </tr>,
              ...group.rows.map((row) =>
                row.isSection ? (
                  <tr key={`${group.groupId}-${row.label}`} className={styles.projectionSectionRow}>
                    <td colSpan={projectionRows.length + 1}>{row.label}</td>
                  </tr>
                ) : (
                  <tr key={`${group.groupId}-${row.label}`} className={row.isTotal ? styles.totalProjectionRow : undefined}>
                    <td className={styles.stickyLabelCell}>
                      {row.control === "surplus-allocation" ? renderSurplusAllocationControl() : row.label}
                    </td>
                    {row.values.map((value, index) => (
                      <td key={`${group.groupId}-${row.label}-${projectionRows[index].year}`} className={styles.numberCell}>
                        {value}
                      </td>
                    ))}
                  </tr>
                ),
              ),
            ])}
          </tbody>
        </table>
      </div>
    );
  }

  function renderScenarioInputContent() {
    if (activeScenarioInputTab === "scenario-details") {
      return (
        <div className={styles.inputStack}>
          <div className={styles.inputCard}>
            <h4>Scenario setup</h4>
            <div className={styles.inputGrid}>
              <label>
                Scenario name
                <input
                  value={activeScenario.scenarioName}
                  onChange={(event) => updateActiveScenario((draft) => {
                    draft.scenarioName = event.target.value;
                  })}
                />
              </label>
              <label>
                Start month
                <select
                  value={activeScenario.startMonth}
                  onChange={(event) => updateActiveScenario((draft) => {
                    draft.startMonth = numberFromInput(event.target.value, draft.startMonth);
                  })}
                >
                  {monthNames.map((month, index) => (
                    <option key={month} value={index + 1}>
                      {month}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Start year
                <input
                  type="number"
                  value={activeScenario.startYear}
                  onChange={(event) => updateActiveScenario((draft) => {
                    draft.startYear = numberFromInput(event.target.value, draft.startYear);
                  })}
                />
              </label>
              <label>
                Primary client
                <select
                  value={activeScenario.primaryPersonId}
                  onChange={(event) => updateActiveScenario((draft) => {
                    draft.primaryPersonId = event.target.value;
                    draft.projectionEnd.personId = event.target.value;
                  })}
                >
                  {activeScenario.people.map((person) => (
                    <option key={person.personId} value={person.personId}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className={styles.inputCard}>
            <h4>People</h4>
            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Start age</th>
                    <th>Retirement age</th>
                    <th>Homeowner</th>
                  </tr>
                </thead>
                <tbody>
                  {activeScenario.people.map((person) => (
                    <tr key={person.personId}>
                      <td>{person.name}</td>
                      <td>{person.role}</td>
                      <td>
                        <input
                          className={styles.compactInput}
                          type="number"
                          value={person.startAge}
                          onChange={(event) => updatePerson(person.personId, (draft) => {
                            draft.startAge = numberFromInput(event.target.value, draft.startAge);
                          })}
                        />
                      </td>
                      <td>
                        <input
                          className={styles.compactInput}
                          type="number"
                          value={person.retirementAge ?? ""}
                          placeholder="Not set"
                          onChange={(event) => updatePerson(person.personId, (draft) => {
                            draft.retirementAge = event.target.value ? numberFromInput(event.target.value) : null;
                          })}
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={person.isHomeowner}
                          onChange={(event) => updatePerson(person.personId, (draft) => {
                            draft.isHomeowner = event.target.checked;
                          })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }

    if (activeScenarioInputTab === "scenario-assumptions") {
      return (
        <div className={styles.inputStack}>
          <div className={styles.inputCard}>
            <h4>Core modelling assumptions</h4>
            <div className={styles.inputGrid}>
              <label>
                CPI indexation (% p.a.)
                {renderPercentInput({
                  value: activeAssumptions.economic.cpiRate,
                  onChange: (value) => setScenarioAssumptionOverrides((current) => ({
                    ...current,
                    cpiRate: value,
                  })),
                })}
              </label>
              <label>
                Employer SG (%)
                {renderPercentInput({
                  value: activeAssumptions.legislative.superannuation.superGuaranteeRate,
                  onChange: (value) => setScenarioAssumptionOverrides((current) => ({
                    ...current,
                    superGuaranteeRate: value,
                  })),
                })}
              </label>
              <label>
                Concessional cap
                {renderCurrencyInput({
                  value: activeAssumptions.legislative.superannuation.concessionalContributionsCap,
                  onChange: (value) => setScenarioAssumptionOverrides((current) => ({
                    ...current,
                    concessionalContributionsCap: value,
                  })),
                })}
              </label>
              <label>
                Contributions tax (%)
                {renderPercentInput({
                  value: activeAssumptions.legislative.superannuation.contributionsTaxRate,
                  onChange: (value) => setScenarioAssumptionOverrides((current) => ({
                    ...current,
                    contributionsTaxRate: value,
                  })),
                })}
              </label>
              <label>
                Super earnings tax (%)
                {renderPercentInput({
                  value: activeAssumptions.legislative.superannuation.investmentEarningsTaxRate,
                  onChange: (value) => setScenarioAssumptionOverrides((current) => ({
                    ...current,
                    investmentEarningsTaxRate: value,
                  })),
                })}
              </label>
            </div>
          </div>

          <div className={styles.inputCard}>
            <h4>Risk profile return assumptions</h4>
            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Risk profile</th>
                    <th>Income return</th>
                    <th>Growth return</th>
                    <th>Total return</th>
                    <th>Volatility</th>
                    <th>Defensive assets</th>
                    <th>Growth assets</th>
                  </tr>
                </thead>
                <tbody>
                  {editableRiskProfileNames.map((profileName) => {
                    const profile = scenarioAssumptionOverrides.riskProfiles[profileName];
                    const incomeRate = profile?.incomeRate ?? 0;
                    const growthRate = profile?.growthRate ?? 0;

                    return (
                      <tr key={profileName}>
                        <td>{profileName}</td>
                        <td>
                          {renderPercentInput({
                            value: incomeRate,
                            onChange: (value) => updateRiskProfileAssumption(profileName, (draft) => {
                              draft.incomeRate = value;
                            }),
                          })}
                        </td>
                        <td>
                          {renderPercentInput({
                            value: growthRate,
                            onChange: (value) => updateRiskProfileAssumption(profileName, (draft) => {
                              draft.growthRate = value;
                            }),
                          })}
                        </td>
                        <td>{percentInputValue(incomeRate + growthRate)}%</td>
                        <td>
                          {renderPercentInput({
                            value: profile?.standardDeviation ?? 0,
                            onChange: (value) => updateRiskProfileAssumption(profileName, (draft) => {
                              draft.standardDeviation = value;
                            }),
                          })}
                        </td>
                        <td>
                          {renderPercentInput({
                            value: profile?.defensivePct ?? 0,
                            onChange: (value) => updateRiskProfileAssumption(profileName, (draft) => {
                              draft.defensivePct = value;
                              draft.growthPct = Math.max(0, 1 - value);
                            }),
                          })}
                        </td>
                        <td>{percentInputValue(profile?.growthPct ?? 0)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }

    if (activeScenarioInputTab === "cashflow") {
      return (
        <div className={styles.inputStack}>
          <div className={styles.tableActions}>
            <button type="button" className={styles.secondaryButton} onClick={() => addCashflowItem("other-income")}>
              Add income
            </button>
            <button type="button" className={styles.secondaryButton} onClick={() => addCashflowItem("living-expense")}>
              Add expense
            </button>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Owner</th>
                  <th>Annual amount</th>
                  <th>Start date</th>
                  <th>End date</th>
                  <th>Indexed</th>
                  <th>Taxable</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
              {activeScenario.cashflowItems.filter((item) => !activeLiabilityRepaymentItemIds.has(item.itemId)).map((item) => (
                  <tr key={item.itemId}>
                    <td>
                      <input
                        className={styles.compactInput}
                        value={item.label}
                        onChange={(event) => updateCashflowItem(item.itemId, (draft) => {
                          draft.label = event.target.value;
                        })}
                      />
                    </td>
                    <td>
                      <select
                        className={styles.compactInput}
                        value={item.category}
                        onChange={(event) => updateCashflowItem(item.itemId, (draft) => {
                          draft.category = event.target.value as ProjectionScenario["cashflowItems"][number]["category"];
                        })}
                      >
                        <option value="other-income">Income</option>
                        <option value="living-expense">Living expense</option>
                        <option value="other-expense">Other expense</option>
                      </select>
                    </td>
                    <td>
                      <select
                        className={styles.compactInput}
                        value={item.ownerPersonId}
                        onChange={(event) => updateCashflowItem(item.itemId, (draft) => {
                          draft.ownerPersonId = event.target.value;
                        })}
                      >
                        {activeScenario.people.length > 1 ? <option value={jointOwnerId}>Joint</option> : null}
                        {activeScenario.people.map((person) => (
                          <option key={person.personId} value={person.personId}>
                            {person.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {renderCurrencyInput({
                        value: item.annualAmount,
                        onChange: (value) => updateCashflowItem(item.itemId, (draft) => {
                          draft.annualAmount = value;
                        }),
                      })}
                    </td>
                    <td>
                      <input
                        type="date"
                        className={styles.compactInput}
                        value={item.startDate ?? ""}
                        onChange={(event) => updateCashflowItem(item.itemId, (draft) => {
                          draft.startDate = event.target.value || null;
                        })}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        className={styles.compactInput}
                        value={item.endDate ?? ""}
                        onChange={(event) => updateCashflowItem(item.itemId, (draft) => {
                          draft.endDate = event.target.value || null;
                        })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={item.indexedToCpi}
                        onChange={(event) => updateCashflowItem(item.itemId, (draft) => {
                          draft.indexedToCpi = event.target.checked;
                        })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={item.taxable}
                        onChange={(event) => updateCashflowItem(item.itemId, (draft) => {
                          draft.taxable = event.target.checked;
                        })}
                      />
                    </td>
                    <td>
                      <button type="button" className={styles.dangerButton} onClick={() => deleteCashflowItem(item.itemId)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (activeScenarioInputTab === "assets-liabilities") {
      return (
        <div className={styles.inputStack}>
          <div className={styles.inputCard}>
            <div className={styles.inputCardHeader}>
              <h4>Assets</h4>
              <div className={styles.tableActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => addAsset("cash")}>
                  Add cash
                </button>
                <button type="button" className={styles.secondaryButton} onClick={() => addAsset("personal-asset")}>
                  Add asset
                </button>
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Owner</th>
                    <th>Type</th>
                    <th>Opening value</th>
                    <th>Income</th>
                    <th>Growth</th>
                    <th>Centrelink</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeScenario.assets.map((asset) => (
                    <tr key={asset.assetId}>
                      <td>
                        <input
                          className={styles.compactInput}
                          value={asset.name}
                          onChange={(event) => updateAsset(asset.assetId, (draft) => {
                            draft.name = event.target.value;
                          })}
                        />
                      </td>
                      <td>
                        <select
                          className={styles.compactInput}
                          value={asset.ownerPersonId}
                          onChange={(event) => updateAsset(asset.assetId, (draft) => {
                            draft.ownerPersonId = event.target.value;
                          })}
                        >
                          {activeScenario.people.length > 1 ? <option value={jointOwnerId}>Joint</option> : null}
                          {activeScenario.people.map((person) => (
                            <option key={person.personId} value={person.personId}>
                              {person.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className={styles.compactInput}
                          value={asset.type}
                          onChange={(event) => updateAsset(asset.assetId, (draft) => {
                            draft.type = event.target.value as ProjectionScenario["assets"][number]["type"];
                          })}
                        >
                          <option value="primary-residence">Primary residence</option>
                          <option value="cash">Cash</option>
                          <option value="funeral-bond">Funeral bond</option>
                          <option value="personal-asset">Personal asset</option>
                          <option value="investment">Investment</option>
                        </select>
                      </td>
                      <td>
                        {renderCurrencyInput({
                          value: asset.openingValue,
                          onChange: (value) => updateAsset(asset.assetId, (draft) => {
                            draft.openingValue = value;
                          }),
                        })}
                      </td>
                      <td>
                        {renderCurrencyInput({
                          value: asset.annualIncome ?? 0,
                          onChange: (value) => updateAsset(asset.assetId, (draft) => {
                            draft.annualIncome = value;
                          }),
                        })}
                      </td>
                      <td>
                        <select
                          className={styles.compactInput}
                          value={asset.growthRateKey}
                          onChange={(event) => updateAsset(asset.assetId, (draft) => {
                            draft.growthRateKey = event.target.value as ProjectionScenario["assets"][number]["growthRateKey"];
                          })}
                        >
                          <option value="none">None</option>
                          <option value="cpi">CPI</option>
                          <option value="cash">Cash</option>
                          <option value="Defensive">Defensive</option>
                          <option value="Moderate">Moderate</option>
                          <option value="Balanced">Balanced</option>
                          <option value="Growth">Growth</option>
                          <option value="High Growth">High Growth</option>
                        </select>
                      </td>
                      <td>
                        <select
                          className={styles.compactInput}
                          value={asset.centrelink}
                          onChange={(event) => updateAsset(asset.assetId, (draft) => {
                            draft.centrelink = event.target.value as ProjectionScenario["assets"][number]["centrelink"];
                          })}
                        >
                          <option value="assessable">Assessable</option>
                          <option value="exempt">Exempt</option>
                          <option value="financial-asset">Financial asset</option>
                          <option value="unknown">Unknown</option>
                        </select>
                      </td>
                      <td>
                        <button type="button" className={styles.dangerButton} onClick={() => deleteAsset(asset.assetId)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={styles.inputCard}>
            <div className={styles.inputCardHeader}>
              <h4>Liabilities</h4>
              <div className={styles.tableActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => addLiability("other")}>
                  Add liability
                </button>
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Liability</th>
                    <th>Owner</th>
                    <th>Type</th>
                    <th>Opening balance</th>
                    <th>Interest rate</th>
                    <th>Annual repayment</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeScenario.liabilities.map((liability) => (
                    <tr key={liability.liabilityId}>
                      <td>
                        <input
                          className={styles.compactInput}
                          value={liability.name}
                          onChange={(event) => updateLiability(liability.liabilityId, (draft) => {
                            draft.name = event.target.value;
                          })}
                        />
                      </td>
                      <td>
                        <select
                          className={styles.compactInput}
                          value={liability.ownerPersonId}
                          onChange={(event) => updateLiability(liability.liabilityId, (draft) => {
                            draft.ownerPersonId = event.target.value;
                          })}
                        >
                          {activeScenario.people.length > 1 ? <option value={jointOwnerId}>Joint</option> : null}
                          {activeScenario.people.map((person) => (
                            <option key={person.personId} value={person.personId}>
                              {person.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className={styles.compactInput}
                          value={liability.type}
                          onChange={(event) => updateLiability(liability.liabilityId, (draft) => {
                            draft.type = event.target.value as ProjectionScenario["liabilities"][number]["type"];
                          })}
                        >
                          <option value="credit-card">Credit card</option>
                          <option value="mortgage">Mortgage</option>
                          <option value="personal-loan">Personal loan</option>
                          <option value="other">Other</option>
                        </select>
                      </td>
                      <td>
                        {renderCurrencyInput({
                          value: liability.openingBalance,
                          onChange: (value) => updateLiability(liability.liabilityId, (draft) => {
                            draft.openingBalance = value;
                          }),
                        })}
                      </td>
                      <td>
                        {renderPercentInput({
                          value: liability.annualInterestRate,
                          onChange: (value) => updateLiability(liability.liabilityId, (draft) => {
                            draft.annualInterestRate = value;
                          }),
                        })}
                      </td>
                      <td>
                        {renderCurrencyInput({
                          value: liability.annualRepayment,
                          onChange: (value) => updateLiability(liability.liabilityId, (draft) => {
                            draft.annualRepayment = value;
                          }),
                        })}
                      </td>
                      <td>
                        <button type="button" className={styles.dangerButton} onClick={() => deleteLiability(liability.liabilityId)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }

    const accountType = activeScenarioInputTab === "superannuation" ? "super-accumulation" : "account-based-pension";
    const accounts = activeScenario.retirementAccounts.filter((account) => account.accountType === accountType);

    return (
      <div className={styles.inputStack}>
        <div className={styles.tableActions}>
          <button type="button" className={styles.secondaryButton} onClick={() => addRetirementAccount(accountType)}>
            {accountType === "account-based-pension" ? "Add pension" : "Add super account"}
          </button>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Account</th>
                <th>Owner</th>
                <th>Opening balance</th>
                <th>Fees</th>
                {accountType === "super-accumulation" ? <th>Additional contributions</th> : null}
                {accountType === "super-accumulation" ? <th>Contribution type</th> : null}
                {accountType === "super-accumulation" ? <th>Rollover date</th> : null}
                {accountType === "super-accumulation" ? <th>Pension account</th> : null}
                {accountType === "super-accumulation" ? <th>Pension payment</th> : null}
                <th>Investment profile</th>
                {accountType === "account-based-pension" ? <th>Annual drawdown</th> : null}
                {accountType === "account-based-pension" ? <th>Indexed</th> : null}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.accountId}>
                  <td>
                    <input
                      className={styles.compactInput}
                      value={account.productName}
                      onChange={(event) => updateRetirementAccount(account.accountId, (draft) => {
                        draft.productName = event.target.value;
                      })}
                    />
                  </td>
                  <td>
                    <select
                      className={styles.compactInput}
                      value={account.ownerPersonId}
                      onChange={(event) => updateRetirementAccount(account.accountId, (draft) => {
                        draft.ownerPersonId = event.target.value;
                      })}
                    >
                      {activeScenario.people.map((person) => (
                        <option key={person.personId} value={person.personId}>
                          {person.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {renderCurrencyInput({
                      value: account.openingBalance,
                      onChange: (value) => updateRetirementAccount(account.accountId, (draft) => {
                        draft.openingBalance = value;
                      }),
                    })}
                  </td>
                  <td>
                    {renderPercentInput({
                      value: account.annualFeeRate ?? 0.015,
                      compact: true,
                      onChange: (value) => updateRetirementAccount(account.accountId, (draft) => {
                        draft.annualFeeRate = value;
                      }),
                    })}
                  </td>
                  {accountType === "super-accumulation" ? (
                    <td>
                      {renderCurrencyInput({
                        value: account.annualContribution ?? 0,
                        onChange: (value) => updateRetirementAccount(account.accountId, (draft) => {
                          draft.annualContribution = value;
                        }),
                      })}
                    </td>
                  ) : null}
                  {accountType === "super-accumulation" ? (
                    <td>
                      <select
                        className={styles.compactInput}
                        value={account.annualContributionType ?? "concessional"}
                        onChange={(event) => updateRetirementAccount(account.accountId, (draft) => {
                          draft.annualContributionType = event.target.value as NonNullable<
                            ProjectionScenario["retirementAccounts"][number]["annualContributionType"]
                          >;
                        })}
                      >
                        <option value="concessional">Concessional</option>
                        <option value="non-concessional">Non-concessional</option>
                      </select>
                    </td>
                  ) : null}
                  {accountType === "super-accumulation" ? (
                    <td>
                      <input
                        type="date"
                        className={styles.compactInput}
                        value={account.rolloverToPensionDate ?? ""}
                        onChange={(event) => updateRetirementAccount(account.accountId, (draft) => {
                          draft.rolloverToPensionDate = event.target.value || null;
                        })}
                      />
                    </td>
                  ) : null}
                  {accountType === "super-accumulation" ? (
                    <td>
                      <input
                        className={styles.compactInput}
                        value={account.rolloverPensionName ?? `${account.productName} pension`}
                        onChange={(event) => updateRetirementAccount(account.accountId, (draft) => {
                          draft.rolloverPensionName = event.target.value;
                        })}
                      />
                    </td>
                  ) : null}
                  {accountType === "super-accumulation" ? (
                    <td>
                      <div className={styles.inlineFieldStack}>
                        {renderCurrencyInput({
                          value: account.rolloverAnnualDrawdown ?? 0,
                          onChange: (value) => updateRetirementAccount(account.accountId, (draft) => {
                            draft.rolloverAnnualDrawdown = value;
                          }),
                        })}
                        <label className={styles.inlineCheckbox}>
                          <input
                            type="checkbox"
                            checked={account.rolloverDrawdownIndexedToCpi ?? false}
                            onChange={(event) => updateRetirementAccount(account.accountId, (draft) => {
                              draft.rolloverDrawdownIndexedToCpi = event.target.checked;
                            })}
                          />
                          Indexed
                        </label>
                      </div>
                    </td>
                  ) : null}
                  <td>
                    <select
                      className={styles.compactInput}
                      value={account.investmentProfileKey}
                      onChange={(event) => updateRetirementAccount(account.accountId, (draft) => {
                        draft.investmentProfileKey = event.target.value;
                      })}
                    >
                      <option value="Defensive">Defensive</option>
                      <option value="Moderate">Moderate</option>
                      <option value="Balanced">Balanced</option>
                      <option value="Growth">Growth</option>
                      <option value="High Growth">High Growth</option>
                    </select>
                  </td>
                  {accountType === "account-based-pension" ? (
                    <td>
                      {renderCurrencyInput({
                        value: account.annualDrawdown,
                        onChange: (value) => updateRetirementAccount(account.accountId, (draft) => {
                          draft.annualDrawdown = value;
                        }),
                      })}
                    </td>
                  ) : null}
                  {accountType === "account-based-pension" ? (
                    <td>
                      <input
                        type="checkbox"
                        checked={account.drawdownIndexedToCpi}
                        onChange={(event) => updateRetirementAccount(account.accountId, (draft) => {
                          draft.drawdownIndexedToCpi = event.target.checked;
                        })}
                      />
                    </td>
                  ) : null}
                  <td>
                    <button type="button" className={styles.dangerButton} onClick={() => deleteRetirementAccount(account.accountId)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderActiveProjectionSection() {
    if (activeSection === "scenario-inputs") {
      return (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Scenario inputs</p>
              <h3>Configure scenario variables</h3>
            </div>
            <span className={styles.badge}>Editable inputs</span>
          </div>
          <div className={styles.inputTabList} aria-label="Scenario input tabs">
            {scenarioInputTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={activeScenarioInputTab === tab.id ? styles.inputTabActive : styles.inputTab}
                onClick={() => setActiveScenarioInputTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {renderScenarioInputContent()}
        </section>
      );
    }

    if (!mappedScenario) {
      return (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Projection workspace</p>
              <h3>No scenario loaded</h3>
            </div>
            <span className={styles.badge}>Awaiting fact find</span>
          </div>
          <p className={styles.subtitle}>
            Upload a fact find or client pack, then run the projection model to map the scenario inputs and generate the projection tables.
          </p>
        </section>
      );
    }

    if (activeSection === "personal-cashflow") {
      return (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Personal cash flow</p>
              <h3>Cashflow to life expectancy</h3>
            </div>
            <span className={styles.badge}>Deterministic prototype</span>
          </div>
          <div className={styles.assumptionStrip}>
            <span>Mapped income and expenses from the scenario</span>
            <span>Loan repayments itemised where supplied</span>
            <span>Calculated income rows appear only where relevant</span>
          </div>
          {renderProjectionTable(cashflowProjectionRows, true)}
        </section>
      );
    }

    if (activeSection === "taxation") {
      return (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Taxation</p>
              <h3>Tax payable under legislative assumptions</h3>
            </div>
            <span className={styles.badge}>Feeds cashflow</span>
          </div>
          <div className={styles.assumptionStrip}>
            <span>Resident rates: 0%, 16%, 30%, 37%, 45%</span>
            <span>Medicare levy: 2.00%</span>
            <span>Age Pension excluded from taxable income in this prototype</span>
          </div>
          <div className={styles.tableControls}>
            <label>
              View tax for
              <select
                value={selectedTaxPersonId ?? activeScenario.primaryPersonId}
                onChange={(event) => setTaxPersonFilter(event.target.value)}
              >
                {activeScenario.people.map((person) => (
                  <option key={person.personId} value={person.personId}>
                    {person.role === "partner" ? "Partner" : "Client"}: {person.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {renderProjectionTable(selectedTaxProjectionRows)}
        </section>
      );
    }

    if (activeSection === "assets-liabilities") {
      return (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Asset and liabilities</p>
              <h3>Assets, liabilities and net worth to life expectancy</h3>
            </div>
            <span className={styles.badge}>Balance sheet</span>
          </div>
          {renderProjectionTable(balanceSheetProjectionRows)}
        </section>
      );
    }

    if (activeSection === "superannuation") {
      return (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Superannuation</p>
              <h3>Accumulation balances and employer contributions</h3>
            </div>
            <span className={styles.badge}>SG calculated</span>
          </div>
          <div className={styles.assumptionStrip}>
            <span>Employer SG: 12.00%</span>
            <span>Concessional cap: $30,000</span>
            <span>Contributions tax: 15.00%</span>
            <span>Account fees: configured per fund</span>
          </div>
          <div className={styles.tableControls}>
            <label>
              View funds for
              <select value={superOwnerFilter} onChange={(event) => setSuperOwnerFilter(event.target.value)}>
                <option value="all">Client and partner</option>
                {activeScenario.people.map((person) => (
                  <option key={person.personId} value={person.personId}>
                    {person.role === "partner" ? "Partner" : "Client"}: {person.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {renderGroupedProjectionTable(filteredSuperProjectionGroups)}
        </section>
      );
    }

    if (activeSection === "pensions") {
      return (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Pensions</p>
              <h3>Account-based pension drawdowns and balances</h3>
            </div>
            <span className={styles.badge}>Account based</span>
          </div>
          <div className={styles.assumptionStrip}>
            <span>Account fees: configured per account</span>
            <span>Drawdowns use mapped scenario values and fallback funding where required</span>
          </div>
          <div className={styles.tableControls}>
            <label>
              View pensions for
              <select value={superOwnerFilter} onChange={(event) => setSuperOwnerFilter(event.target.value)}>
                <option value="all">Client and partner</option>
                {activeScenario.people.map((person) => (
                  <option key={person.personId} value={person.personId}>
                    {person.role === "partner" ? "Partner" : "Client"}: {person.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {renderGroupedProjectionTable(filteredPensionProjectionGroups)}
        </section>
      );
    }

    if (activeSection === "centrelink") {
      return (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Centrelink</p>
              <h3>Age Pension under legislative assumptions</h3>
            </div>
            <span className={styles.badge}>Eligibility gated</span>
          </div>
          <div className={styles.assumptionStrip}>
            <span>Qualifying age: 67</span>
            <span>Assets and income tests apply only once eligible</span>
            <span>Age Pension excluded from taxable income in this prototype</span>
          </div>
          {renderProjectionTable(agePensionProjectionRows)}
        </section>
      );
    }

    return (
      <section className={styles.twoColumn}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Assumptions</p>
              <h3>Files driving the model</h3>
            </div>
            <span className={styles.badge}>Version required</span>
          </div>
          <div className={styles.assumptionList}>
            {assumptions.map((assumption) => (
              <div key={assumption.layer} className={styles.assumptionItem}>
                <strong>{assumption.layer}</strong>
                <span>{assumption.source}</span>
                <p>{assumption.use}</p>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Before relying on outputs</p>
              <h3>Required checks</h3>
            </div>
            <span className={styles.badge}>Adviser review</span>
          </div>
          <ul className={styles.checkList}>
            {projectionChecks.map((check) => (
              <li key={check}>{check}</li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  function renderStartProjectionPanel() {
    const isScenarioLoading = mappingStatus === "mapping" || clientImportStatus === "importing";

    return (
      <section className={styles.startPanel}>
        <div className={styles.startPanelContent}>
          <p className={styles.eyebrow}>Projection workspace</p>
          <h2>Start a projection scenario</h2>
          <p>
            Choose the source data first. Once the fact find data is loaded, run the projection model to create the editable
            scenario inputs and projection tables.
          </p>
          <div className={styles.startActions}>
            <label className={styles.uploadButton} htmlFor="projection-start-upload">
              Upload fact find
            </label>
            <input
              id="projection-start-upload"
              className={styles.uploadInput}
              type="file"
              accept=".docx,.pdf,.csv,.txt"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setScenarioFile(file);
                setScenarioUploadName(file?.name ?? null);
                setPendingClientProfileScenario(null);
                setClientImportStatus("idle");
                setClientImportMessage(null);
                setMappingResult(null);
                setMappingStatus("idle");
              }}
            />
            <button
              className={styles.uploadButton}
              type="button"
              disabled={!linkedClientId || clientImportStatus === "importing"}
              onClick={handleImportClientProfileScenario}
            >
              {clientImportStatus === "importing" ? "Importing fact find..." : "Import fact find"}
            </button>
            <button
              className={styles.runModelButton}
              type="button"
              disabled={!hasSourceDataReady || mappingStatus === "mapping" || clientImportStatus === "importing"}
              onClick={handleRunScenario}
            >
              {mappingStatus === "mapping" ? "Running model..." : "Run projection model"}
            </button>
          </div>
          {scenarioUploadName ? (
            <p className={styles.startStatus}>
              <strong>Selected file</strong>
              {scenarioUploadName}
            </p>
          ) : null}
          {clientImportMessage ? (
            <p className={clientImportStatus === "error" ? styles.startError : styles.startStatus}>
              {clientImportMessage}
            </p>
          ) : null}
          {isScenarioLoading ? (
            <div className={styles.startLoader} role="status" aria-live="polite">
              <span className={styles.loaderDots} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span>
                {mappingStatus === "mapping"
                  ? "Finley is reading the source data and building the projection scenario."
                  : "Finley is loading the app fact find."}
              </span>
            </div>
          ) : null}
          {mappingResult?.error ? <p className={styles.startError}>{mappingResult.error}</p> : null}
        </div>
      </section>
    );
  }

  function renderLoadingProjectionPanel() {
    return (
      <section className={styles.startPanel}>
        <div className={styles.startPanelContent}>
          <p className={styles.eyebrow}>Projection workspace</p>
          <h2>Loading projection scenario</h2>
          <p>Restoring the saved projection workspace for this SOA.</p>
        </div>
      </section>
    );
  }

  return (
    <div className={styles.projectionsShell}>
      <aside className={styles.projectionsSidebar} aria-label="Projection workspace navigation">
        <div className={styles.sidebarBrand}>
          <span>iC2 Clients</span>
          <strong>Projection Workspace</strong>
          <p>Scenario modelling, assumptions, and projection outputs.</p>
        </div>

        <nav className={styles.sidebarNav}>
          {scenarios.length ? (
            <div className={styles.scenarioUploadCard}>
              <div>
                <strong>Scenarios</strong>
                <span>Select or copy a scenario.</span>
              </div>
              <select
                className={styles.sidebarSelect}
                value={activeScenarioId ?? ""}
                onChange={(event) => setActiveScenarioId(event.target.value)}
              >
                {scenarios.map((scenario) => (
                  <option key={scenario.scenarioId} value={scenario.scenarioId}>
                    {scenario.scenarioName}
                  </option>
                ))}
              </select>
              <button
                className={styles.runModelButton}
                type="button"
                disabled={!mappedScenario}
                onClick={duplicateActiveScenario}
              >
                Copy to new scenario
              </button>
              <button
                className={styles.deleteScenarioButton}
                type="button"
                disabled={!mappedScenario}
                onClick={deleteActiveScenario}
              >
                Delete scenario
              </button>
            </div>
          ) : null}

          {mappedScenario ? (
          <div className={styles.sectionNav} aria-label="Projection sections">
            {projectionSections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={section.id === activeSection ? styles.sectionNavItemActive : styles.sectionNavItem}
                onClick={() => setActiveSection(section.id)}
              >
                {section.label}
              </button>
            ))}
          </div>
          ) : null}
        </nav>
      </aside>

      <main className={styles.content}>
        <div className={styles.page}>
        {hasLinkedSoaContext ? (
          <section className={styles.contextBand}>
            <div>
              <p className={styles.eyebrow}>Linked SOA workflow</p>
              <h3>Projection case for this SOA</h3>
              <p>Client ID: {linkedClientId}</p>
              <p>SOA ID: {linkedSoaId}</p>
            </div>
          </section>
        ) : null}
        {!workspaceStateLoaded ? (
          renderLoadingProjectionPanel()
        ) : !mappedScenario ? (
          renderStartProjectionPanel()
        ) : (
          <>
        <section className={styles.headerBand}>
          <div>
            <p className={styles.eyebrow}>Projection workspace</p>
            <h2 className={styles.title}>{activeClientName} projection model</h2>
            <p className={styles.subtitle}>
              {mappedScenario
                ? "Uploaded fact find scenario mapped into the projection schema. This view projects the mapped cashflow, assets, liabilities, and retirement accounts through life expectancy using the assumption pack."
                : "Upload a fact find or client pack to map a new scenario into the projection engine. No client data is preloaded."}
            </p>
            {mappingResult?.mappingNotes?.length || mappingResult?.confirmationsRequired?.length || mappingResult?.warning ? (
              <div className={styles.mappingNotice}>
                {mappingResult.warning ? <p>{mappingResult.warning}</p> : null}
                {mappingResult.mappingNotes?.slice(0, 3).map((note) => (
                  <p key={note}>{note}</p>
                ))}
                {mappingResult.confirmationsRequired?.length ? (
                  <p>Confirm: {mappingResult.confirmationsRequired.slice(0, 2).join(" ")}</p>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className={styles.statusPanel}>
            <span className={styles.statusLabel}>Scenario</span>
            {mappedScenario ? (
              <>
                <strong>{activeScenario.scenarioName}</strong>
                <span>
                  Start date: 1 {monthNames[activeScenario.startMonth - 1] ?? "Jul"} {projectionStartYear}
                </span>
                <span>Projected to age {endAge}</span>
              </>
            ) : (
              <>
                <strong>No scenario loaded</strong>
                <span>Upload a fact find to begin</span>
              </>
            )}
          </div>
        </section>

        {renderActiveProjectionSection()}
          </>
        )}

        <div className={styles.hiddenLegacySections} aria-hidden="true">
        <section className={styles.twoColumn}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Projection inputs</p>
                <h3>Cashflow baseline</h3>
              </div>
              <span className={styles.badge}>Editable levers</span>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Section</th>
                    <th>Item</th>
                    <th>Annual amount</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {cashflowRows.map((row) => (
                    <tr key={`${row.section}-${row.item}`}>
                      <td>{row.section}</td>
                      <td>{row.item}</td>
                      <td className={styles.numberCell}>{row.annual}</td>
                      <td>{row.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Model boundary</p>
                <h3>How Finley should interact</h3>
              </div>
              <span className={styles.badge}>Controlled</span>
            </div>
            <div className={styles.ruleStack}>
              <div>
                <strong>LLM role</strong>
                <p>Interpret adviser instructions, identify projection levers, explain affected areas, and ask for missing assumptions.</p>
              </div>
              <div>
                <strong>Engine role</strong>
                <p>Calculate cashflow, tax, pension balances, Age Pension impacts, fees, and closing values deterministically.</p>
              </div>
              <div>
                <strong>Locked outputs</strong>
                <p>Closing values, tax outcomes, and sustainability results should be generated by the engine, not manually edited by Finley.</p>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Centrelink calculation</p>
              <h3>Age Pension under legislative assumptions</h3>
            </div>
            <span className={styles.badge}>Feeds cashflow</span>
          </div>
          <div className={styles.assumptionStrip}>
            <span>Single homeowner asset threshold: $321,500</span>
            <span>Assets taper: $3 per $1,000 per fortnight</span>
            <span>Income threshold: $5,668 p.a.</span>
            <span>Income taper: $0.50 per dollar</span>
            <span>Deeming: 1.25% / 3.25%</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={`${styles.dataTable} ${styles.projectionTable}`.trim()}>
              <thead>
                <tr>
                  <th className={styles.stickyLabelCell}>Date</th>
                  {projectionRows.map((row) => (
                    <th key={row.year}>1 Jul {String(row.year).slice(-2)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agePensionProjectionRows.map((row) => (
                  <tr key={row.label}>
                    <td className={styles.stickyLabelCell}>{row.label}</td>
                    {row.values.map((value, index) => (
                      <td key={`${row.label}-${projectionRows[index].year}`} className={styles.numberCell}>
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Current-situation projection</p>
              <h3>Cashflow to life expectancy</h3>
            </div>
            <span className={styles.badge}>Deterministic prototype</span>
          </div>
          <div className={styles.assumptionStrip}>
            <span>CPI indexed eligible Age Pension and expenses: 3.00% p.a.</span>
            <span>Account-based pension drawdowns use mapped scenario values</span>
            <span>Employer SG: 12.00% up to cap, less 15.00% contributions tax</span>
            <span>Retirement returns use mapped investment profiles</span>
            <span>Cash reserve return: 2.50% p.a.</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={`${styles.dataTable} ${styles.projectionTable}`.trim()}>
              <thead>
                <tr>
                  <th className={styles.stickyLabelCell}>Date</th>
                  {projectionRows.map((row) => (
                    <th key={row.year}>1 Jul {String(row.year).slice(-2)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cashflowProjectionRows.map((row) => (
                  <tr key={row.label}>
                    <td className={styles.stickyLabelCell}>
                      {row.control === "surplus-allocation" ? renderSurplusAllocationControl() : row.label}
                    </td>
                    {row.values.map((value, index) => {
                      const projectionRow = projectionRows[index];
                      const isNegativeCashflow = row.label === "Net cashflow after tax" && projectionRow.netCashflowAfterTax < 0;
                      const isPositiveCashflow = row.label === "Net cashflow after tax" && projectionRow.netCashflowAfterTax >= 0;

                      return (
                        <td
                          key={`${row.label}-${projectionRow.year}`}
                          className={[
                            styles.numberCell,
                            isNegativeCashflow ? styles.negativeCell : "",
                            isPositiveCashflow ? styles.positiveCell : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Taxation calculation</p>
              <h3>Tax payable under legislative assumptions</h3>
            </div>
            <span className={styles.badge}>Feeds cashflow</span>
          </div>
          <div className={styles.assumptionStrip}>
            <span>Resident rates: 0%, 16%, 30%, 37%, 45%</span>
            <span>Medicare levy: 2.00%</span>
            <span>Medicare threshold: $27,222</span>
            <span>Shade-in threshold: $34,028</span>
            <span>Age Pension excluded from taxable income in this prototype</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={`${styles.dataTable} ${styles.projectionTable}`.trim()}>
              <thead>
                <tr>
                  <th className={styles.stickyLabelCell}>Date</th>
                  {projectionRows.map((row) => (
                    <th key={row.year}>1 Jul {String(row.year).slice(-2)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {taxProjectionRows.map((row) => (
                  <tr key={row.label}>
                    <td className={styles.stickyLabelCell}>{row.label}</td>
                    {row.values.map((value, index) => (
                      <td key={`${row.label}-${projectionRows[index].year}`} className={styles.numberCell}>
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Current-situation projection</p>
              <h3>Assets, liabilities and net worth to life expectancy</h3>
            </div>
            <span className={styles.badge}>Balance sheet</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={`${styles.dataTable} ${styles.projectionTable}`.trim()}>
              <thead>
                <tr>
                  <th className={styles.stickyLabelCell}>Date</th>
                  {projectionRows.map((row) => (
                    <th key={row.year}>1 Jul {String(row.year).slice(-2)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {balanceSheetProjectionRows.map((row) => (
                  <tr key={row.label}>
                    <td className={styles.stickyLabelCell}>{row.label}</td>
                    {row.values.map((value, index) => {
                      const projectionRow = projectionRows[index];
                      const isCashReserveWarning = row.label === "Cash reserve" && projectionRow.cashReserve < cashReserveTarget;

                      return (
                        <td
                          key={`${row.label}-${projectionRow.year}`}
                          className={[styles.numberCell, isCashReserveWarning ? styles.warningText : ""]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.twoColumn}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Sustainability read</p>
                <h3>What the current settings imply</h3>
              </div>
              <span className={styles.badge}>Current only</span>
            </div>
            <div className={styles.ruleStack}>
              <div>
                <strong>Cash reserve pressure</strong>
                <p>
                  The reserve starts at {money(openingCash)} and is projected to be {finalProjectionYear ? money(finalProjectionYear.cashReserve) : "$0"} by age {endAge}.{" "}
                  {firstReserveBreach
                    ? `It first falls below the ${money(cashReserveTarget)} target in ${firstReserveBreach.year}.`
                    : `It remains above the ${money(cashReserveTarget)} target.`}
                </p>
              </div>
              <div>
                <strong>Retirement capital</strong>
                <p>
                  The first mapped retirement account is projected from {money(openingAmpPension)} to{" "}
                  {finalProjectionYear ? money(Object.values(finalProjectionYear.retirementAccountBalances)[0] ?? 0) : "$0"} after current withdrawals and investment-profile earnings.
                </p>
              </div>
              <div>
                <strong>Net worth</strong>
                <p>
                  Net worth starts at approximately {money(startingNetWorth)} and is projected to {finalProjectionYear ? money(finalProjectionYear.netWorth) : "$0"}, with the home unit indexed by CPI.
                </p>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Visual check</p>
                <h3>Cash reserve path</h3>
              </div>
              <span className={styles.badge}>Target {money(cashReserveTarget)}</span>
            </div>
            <div className={styles.reserveChart} aria-label="Projected cash reserve by year">
              {projectionRows.map((row) => {
                const width = Math.min(100, Math.max(2, (row.cashReserve / openingCash) * 100));

                return (
                  <div key={row.year} className={styles.reserveRow}>
                    <span>{row.year}</span>
                    <div className={styles.reserveTrack}>
                      <div
                        className={row.cashReserve < cashReserveTarget ? styles.reserveBarWarning : styles.reserveBar}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <strong>{money(row.cashReserve)}</strong>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Assets and liabilities</p>
              <h3>Current balance sheet mapping</h3>
            </div>
            <span className={styles.badge}>Source: fact find</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Owner</th>
                  <th>Type</th>
                  <th>Value</th>
                  <th>Projection treatment</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => (
                  <tr key={asset.name}>
                    <td>{asset.name}</td>
                    <td>{asset.owner}</td>
                    <td>{asset.type}</td>
                    <td className={styles.numberCell}>{asset.value}</td>
                    <td>{asset.treatment}</td>
                  </tr>
                ))}
                <tr>
                  <td>Credit card</td>
                  <td>Margaret</td>
                  <td>Liability</td>
                  <td className={styles.numberCell}>($1,200)</td>
                  <td>Repaid monthly; no interest modelled unless adviser changes assumption</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.twoColumn}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Super and pension</p>
                <h3>Account schema mapping</h3>
              </div>
              <span className={styles.badge}>Calculated outputs</span>
            </div>
            <div className={styles.accountStack}>
              {retirementAccounts.map((account) => (
                <article key={account.account} className={styles.accountItem}>
                  <div className={styles.accountTop}>
                    <strong>{account.account}</strong>
                    <span>{account.balance}</span>
                  </div>
                  <dl className={styles.definitionGrid}>
                    <div>
                      <dt>Investment profile</dt>
                      <dd>{account.profile}</dd>
                    </div>
                    <div>
                      <dt>Drawdown</dt>
                      <dd>{account.drawdown}</dd>
                    </div>
                  </dl>
                  <div className={styles.tagRow}>
                    {account.schemaRows.map((row) => (
                      <span key={row}>{row}</span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Assumption set</p>
                <h3>Files driving the model</h3>
              </div>
              <span className={styles.badge}>Version required</span>
            </div>
            <div className={styles.assumptionList}>
              {assumptions.map((assumption) => (
                <div key={assumption.layer} className={styles.assumptionItem}>
                  <strong>{assumption.layer}</strong>
                  <span>{assumption.source}</span>
                  <p>{assumption.use}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Projection years</p>
              <h3>Baseline timeline summary</h3>
            </div>
            <span className={styles.badge}>To life expectancy</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Margaret age</th>
                  <th>Income</th>
                  <th>Expenses</th>
                  <th>Retirement balance</th>
                  <th>Cash reserve</th>
                </tr>
              </thead>
              <tbody>
                {projectionRows.filter((_, index) => index % 3 === 0 || index === projectionRows.length - 1).map((row) => (
                  <tr key={row.year}>
                    <td>{row.year}</td>
                    <td>{row.ageByPersonId[primaryPersonId]}</td>
                    <td>{money(row.totalIncome)}</td>
                    <td>{money(row.expenses)}</td>
                    <td>{money(Object.values(row.retirementAccountBalances)[0] ?? 0)}</td>
                    <td>{money(row.cashReserve)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Before modelling recommendations</p>
              <h3>Required checks</h3>
            </div>
            <span className={styles.badge}>Adviser review</span>
          </div>
          <ul className={styles.checkList}>
            {projectionChecks.map((check) => (
              <li key={check}>{check}</li>
            ))}
          </ul>
        </section>
        </div>
        </div>
      </main>
    </div>
  );
}

export default function ProjectionsPage() {
  return (
    <Suspense fallback={<div className={styles.loadingState}>Loading projections...</div>}>
      <ProjectionsPageContent />
    </Suspense>
  );
}
