"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ClientAssetRecord,
  ClientDependantRecord,
  ClientEmploymentRecord,
  ClientEntityRecord,
  ClientExpenseRecord,
  ClientIncomeRecord,
  ClientInsuranceRecord,
  ClientLiabilityRecord,
  ClientPensionRecord,
  ClientPolicyRecord,
  ClientProfile,
  ClientSuperannuationRecord,
  PolicyCoverRecord,
} from "@/lib/api/types";
import type { FinancialCollectionKind, ProfileCollectionRecord } from "@/lib/api/contracts/profile-collections";
import type { FinleyDisplayCard, FinleyEditorCard, FinleyFactFindWorkflow, FinleyTableEditorCard } from "@/lib/finley-shared";
import { listAdminLicensees } from "@/lib/api/admin";
import {
  DEFAULT_RISK_PROFILE_OPTIONS,
  isRiskProfileFieldKey,
  resolveRiskProfileOptions,
  withCurrentRiskProfileOption,
  type SelectOption,
} from "@/lib/risk-profile-options";
import { updateClientDetails, updatePartnerDetails, updatePersonRiskProfile, upsertEmploymentRecords } from "@/lib/services/client-updates";
import {
  deleteDependantCollectionItem,
  deleteEntityCollectionItem,
  saveDependantCollection,
  saveEntityCollection,
  upsertDependantCollection,
  upsertEntityCollection,
} from "@/lib/services/identity-relations";
import {
  deleteAssetCollectionItem,
  deleteFinancialCollectionItem,
  saveAssetCollection,
  saveFinancialCollection,
  upsertAssetCollection,
  upsertFinancialCollection,
} from "@/lib/services/profile-collections";
import styles from "./page.module.css";

type FactFindSectionProps = {
  clientId: string;
  profile: ClientProfile;
};

type FactFindPopupSection =
  | "dependants"
  | "entities"
  | "assets"
  | "liabilities"
  | "employment"
  | "income"
  | "expenses"
  | "superannuation"
  | "retirement-income"
  | "insurance";

type PopupField = {
  key: string;
  label: string;
  input: "text" | "select" | "date" | "currency" | "percentage";
  options?: Array<{ label: string; value: string }>;
};

type FactFindRecordModalState = {
  section: FactFindPopupSection;
  recordId?: string | null;
};

type FactFindDeleteConfirmState = {
  section: FactFindPopupSection;
  recordId: string;
  label: string;
};

type InsuranceBenefitDraft = {
  id: string;
  coverRequired: string;
  sumInsured: string;
  premiumAmount: string;
  frequency: string;
};

type InsurancePolicyView = ClientPolicyRecord;

const FACT_FIND_POPUP_SECTIONS: Record<FactFindPopupSection, true> = {
  assets: true,
  dependants: true,
  employment: true,
  entities: true,
  expenses: true,
  income: true,
  insurance: true,
  liabilities: true,
  "retirement-income": true,
  superannuation: true,
};

const JOINT_OWNER_VALUE = "__joint__";
const FREQUENCY_OPTIONS = ["Weekly", "Fortnightly", "Monthly", "Quarterly", "Annually"];
const ASSET_CATEGORY_OPTIONS = ["Cash", "Investment", "Property", "Superannuation", "Business", "Personal"];
const ASSET_TYPE_OPTIONS = [
  "Cash on Hand",
  "Current Savings",
  "Fixed Deposits",
  "Bonds",
  "Shares",
  "Stocks",
  "Unit Trusts",
  "Annuity",
  "Other Investments",
  "Primary Residence",
  "Investment Property",
  "Superannuation",
  "Pension",
  "Household Contents",
  "Motor Vehicle",
  "Artwork",
  "Jewellery",
  "Antiques",
  "Other Life Style",
];
const LIABILITY_TYPE_OPTIONS = ["Home Loan", "Investment Loan", "Personal Loan", "Credit Card", "Other"];
const INCOME_TYPE_OPTIONS = ["Salary", "Bonus", "Rental", "Investment", "Pension", "Other"];
const EXPENSE_TYPE_OPTIONS = ["Living", "Mortgage", "Rent", "Utilities", "Insurance", "Other"];
const SUPER_TYPE_OPTIONS = ["Industry Fund", "Retail Fund", "SMSF", "Defined Benefit", "Other"];
const PENSION_TYPE_OPTIONS = ["Account Based Pension", "Allocated Pension", "Annuity", "Other"];
const INSURANCE_COVER_OPTIONS = ["Life", "TPD", "Trauma", "Income Protection"];
const INSURANCE_STATUS_OPTIONS = ["Active", "Pending", "Cancelled", "Claimed"];
const ENTITY_TYPE_OPTIONS = ["SMSF", "Trust", "Company", "Partnership"];
const DEPENDANT_TYPE_OPTIONS = ["Child", "Grandchild", "Parent", "Sibling", "Other"];
const EMPLOYMENT_STATUS_OPTIONS = ["Full-time", "Part-time", "Casual", "Contract", "Self-employed", "Retired", "Unemployed"];
const TAX_TYPE_OPTIONS = ["Taxable", "Non-taxable"];

function isFactFindPopupSection(stepId?: string | null): stepId is FactFindPopupSection {
  return Boolean(stepId && stepId in FACT_FIND_POPUP_SECTIONS);
}

function isFinancialPopupSection(section: FactFindPopupSection): section is FinancialCollectionKind {
  return (
    section === "liabilities" ||
    section === "income" ||
    section === "expenses" ||
    section === "superannuation" ||
    section === "retirement-income" ||
    section === "insurance"
  );
}

function buildClientName(profile: ClientProfile) {
  const names = [profile.client?.name, profile.partner?.name].filter(Boolean);
  return names.length ? names.join(" & ") : "this client";
}

function formatFieldValue(key: string, value: string) {
  if (!value.trim()) return value;

  if (
    ["amount", "currentValue", "balance", "payment", "repaymentAmount", "contributionAmount", "cost", "incomeAmount", "outstandingBalance"].includes(
      key,
    )
  ) {
    const numeric = Number(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(numeric)) {
      return new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(numeric);
    }
  }

  if (["interestRate", "indexation", "annualReturn"].includes(key)) {
    const numeric = Number(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(numeric)) {
      return `${new Intl.NumberFormat("en-AU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(numeric)}%`;
    }
  }

  const slashMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (slashMatch && ["dateOfBirth", "nextAnniversaryDate", "serviceDate", "acquisitionDate", "birthday"].includes(key)) {
    return `${slashMatch[3]}/${slashMatch[2]}/${slashMatch[1]}`;
  }

  return value;
}

function parseDateValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return trimmed;
  }

  const slashMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, "0");
    const month = slashMatch[2].padStart(2, "0");
    const year =
      slashMatch[3].length === 2
        ? `${Number(slashMatch[3]) >= 50 ? "19" : "20"}${slashMatch[3]}`
        : slashMatch[3];
    return `${year}-${month}-${day}`;
  }

  return trimmed;
}

function formatDateInput(value?: string | null) {
  return (value ?? "").slice(0, 10);
}

function normalizeNumberValue(value: string) {
  const numeric = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function formatCurrencyInput(value: string) {
  const numeric = normalizeNumberValue(value);
  if (numeric == null) return value.trim();

  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

function formatPercentageInput(value: string) {
  const numeric = normalizeNumberValue(value);
  if (numeric == null) return value.trim();

  return `${new Intl.NumberFormat("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric)}%`;
}

function cleanCurrencyLike(value: string) {
  return value.replace(/[^0-9.-]/g, "").trim() || null;
}

function boolFromYesNo(value: string) {
  return value === "Yes";
}

function options(values: string[]) {
  return values.map((value) => ({ label: value, value }));
}

function buildOwnerOptions(profile: ClientProfile) {
  const hasPartner = Boolean(profile.client?.id && profile.partner?.id);

  return [
    profile.client?.id && profile.client.name ? { label: profile.client.name, value: profile.client.id } : null,
    profile.partner?.id && profile.partner.name ? { label: profile.partner.name, value: profile.partner.id } : null,
    hasPartner ? { label: "Joint", value: JOINT_OWNER_VALUE } : null,
    ...((profile.entities ?? [])
      .filter((entity) => entity.id && entity.name)
      .map((entity) => ({ label: entity.name!, value: entity.id! }))),
  ].filter((entry): entry is { label: string; value: string } => Boolean(entry));
}

function buildSuperFundOptions(profile: ClientProfile) {
  return (profile.superannuation ?? [])
    .filter((item) => item.id && (item.superFund || item.type))
    .map((item) => ({ label: item.superFund ?? item.type ?? "Super Fund", value: item.id ?? "" }));
}

function ownerFromValue(profile: ClientProfile, ownerId: string) {
  if (ownerId === JOINT_OWNER_VALUE) {
    return profile.client?.id
      ? {
          id: profile.client.id,
          name: [profile.client.name, profile.partner?.name].filter(Boolean).join(" and "),
        }
      : null;
  }

  const owner = buildOwnerOptions(profile).find((option) => option.value === ownerId);
  return owner ? { id: owner.value, name: owner.label } : null;
}

function optionFromValue(value: string) {
  return value ? { type: value, value } : { type: "", value: "" };
}

function numberFromCurrencyLike(value?: string | null) {
  const cleaned = cleanCurrencyLike(value ?? "");
  if (!cleaned) return null;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function findOptionByValueOrLabel(rawValue: string | null | undefined, options: Array<{ label: string; value: string }>) {
  const normalized = rawValue?.trim().toLowerCase();
  if (!normalized) return null;

  return (
    options.find((option) => option.value.trim().toLowerCase() === normalized) ??
    options.find((option) => option.label.trim().toLowerCase() === normalized) ??
    null
  );
}

function formatMoneyValue(value?: string | number | null) {
  if (value == null || value === "") return "";
  return formatCurrencyInput(String(value));
}

function insuranceCoverSummary(cover: PolicyCoverRecord) {
  return [cover.coverType, formatMoneyValue(cover.sumInsured)].filter(Boolean).join(" ");
}

function buildInsurancePolicyDisplayCard(clientName: string, policies: InsurancePolicyView[]) {
  if (!policies.length) return null;

  return {
    kind: "collection_summary",
    title: `${clientName} Insurance`,
    columns: ["Owner", "Insurer", "Policy No", "Covers", "Total Premium", "Linked Super"],
    rows: policies.map((policy, index) => {
      const totalPremium = (policy.covers ?? []).reduce((total, cover) => total + (cover.premiumAmount ?? 0), 0);
      return {
        id: policy.id ?? `insurance-policy-${index}`,
        cells: [
          policy.policyOwner ?? "",
          policy.insurer ?? "",
          policy.policyNumber ?? "",
          (policy.covers ?? []).map(insuranceCoverSummary).filter(Boolean).join("; "),
          formatMoneyValue(totalPremium),
          policy.linkedSuperFund ?? "",
        ],
        editAction: policy.id ? { kind: "insurance", recordId: policy.id, label: "Edit" } : null,
      };
    }),
    footer: null,
  } satisfies FinleyDisplayCard;
}

function getApiErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  if ("message" in payload && typeof payload.message === "string" && payload.message.trim()) {
    return payload.message;
  }

  if ("error" in payload && typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }

  if ("errors" in payload && payload.errors && typeof payload.errors === "object") {
    const messages = Object.values(payload.errors as Record<string, unknown>).flatMap((value) =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [],
    );
    if (messages.length) {
      return messages[0];
    }
  }

  return fallback;
}

function hasLinkedPartner(profile: ClientProfile) {
  return Boolean(profile.client?.id && profile.partner?.id);
}

function resolveFinancialRecords<K extends FinancialCollectionKind>(
  profile: ClientProfile,
  kind: K,
): Array<ProfileCollectionRecord<K>> {
  switch (kind) {
    case "liabilities":
      return (profile.liabilities ?? []) as Array<ProfileCollectionRecord<K>>;
    case "income":
      return (profile.income ?? []) as Array<ProfileCollectionRecord<K>>;
    case "expenses":
      return (profile.expense ?? []) as Array<ProfileCollectionRecord<K>>;
    case "superannuation":
      return (profile.superannuation ?? []) as Array<ProfileCollectionRecord<K>>;
    case "retirement-income":
      return (profile.pension ?? []) as Array<ProfileCollectionRecord<K>>;
    case "insurance":
      return (profile.insurance ?? []) as Array<ProfileCollectionRecord<K>>;
  }
}

function assignFinancialRecords<K extends FinancialCollectionKind>(
  profile: ClientProfile,
  kind: K,
  records: Array<ProfileCollectionRecord<K>>,
) {
  switch (kind) {
    case "liabilities":
      return { ...profile, liabilities: records as ClientLiabilityRecord[] };
    case "income":
      return { ...profile, income: records as ClientIncomeRecord[] };
    case "expenses":
      return { ...profile, expense: records as ClientExpenseRecord[] };
    case "superannuation":
      return { ...profile, superannuation: records as ClientSuperannuationRecord[] };
    case "retirement-income":
      return { ...profile, pension: records as ClientPensionRecord[] };
    case "insurance":
      return { ...profile, insurance: records as ClientInsuranceRecord[] };
  }
}

function getPopupFields(
  section: FactFindPopupSection,
  ownerOptions: Array<{ label: string; value: string }>,
  superFundOptions: Array<{ label: string; value: string }>,
): PopupField[] {
  const ownerField: PopupField = { key: "ownerId", label: "Owner", input: "select", options: ownerOptions };
  const frequencyField: PopupField = { key: "frequency", label: "Frequency", input: "select", options: options(FREQUENCY_OPTIONS) };
  const jointField: PopupField = { key: "joint", label: "Joint", input: "select", options: options(["No", "Yes"]) };

  switch (section) {
    case "dependants":
      return [
        { key: "name", label: "Name", input: "text" },
        { key: "type", label: "Type", input: "select", options: options(DEPENDANT_TYPE_OPTIONS) },
        { key: "birthday", label: "Birthday", input: "date" },
      ];
    case "entities":
      return [
        ownerField,
        { key: "name", label: "Entity Name", input: "text" },
        { key: "type", label: "Entity Type", input: "select", options: options(ENTITY_TYPE_OPTIONS) },
      ];
    case "assets":
      return [
        ownerField,
        { key: "type", label: "Category", input: "select", options: options(ASSET_CATEGORY_OPTIONS) },
        { key: "assetType", label: "Asset Type", input: "select", options: options(ASSET_TYPE_OPTIONS) },
        { key: "description", label: "Description", input: "text" },
        { key: "currentValue", label: "Current Value", input: "currency" },
        { key: "cost", label: "Cost Base", input: "currency" },
        { key: "incomeAmount", label: "Income Amount", input: "currency" },
        { key: "incomeFrequency", label: "Income Frequency", input: "select", options: options(FREQUENCY_OPTIONS) },
        { key: "acquisitionDate", label: "Acquisition Date", input: "date" },
        jointField,
      ];
    case "liabilities":
      return [
        ownerField,
        { key: "loanType", label: "Liability Type", input: "select", options: options(LIABILITY_TYPE_OPTIONS) },
        { key: "bankName", label: "Provider", input: "text" },
        { key: "outstandingBalance", label: "Balance", input: "currency" },
        { key: "repaymentAmount", label: "Repayment", input: "currency" },
        { key: "interestRate", label: "Interest Rate", input: "percentage" },
        frequencyField,
        jointField,
      ];
    case "employment":
      return [
        ownerField,
        { key: "jobTitle", label: "Job Title", input: "text" },
        { key: "status", label: "Status", input: "select", options: options(EMPLOYMENT_STATUS_OPTIONS) },
        { key: "employer", label: "Employer", input: "text" },
        { key: "salary", label: "Salary", input: "currency" },
        frequencyField,
        { key: "primaryEmployment", label: "Primary Employment", input: "select", options: options(["Yes", "No"]) },
        { key: "startDate", label: "Start Date", input: "date" },
        { key: "endDate", label: "End Date", input: "date" },
      ];
    case "income":
      return [
        ownerField,
        { key: "type", label: "Income Type", input: "select", options: options(INCOME_TYPE_OPTIONS) },
        { key: "description", label: "Description", input: "text" },
        { key: "amount", label: "Amount", input: "currency" },
        frequencyField,
        { key: "taxType", label: "Tax Type", input: "select", options: options(TAX_TYPE_OPTIONS) },
        jointField,
      ];
    case "expenses":
      return [
        ownerField,
        { key: "type", label: "Expense Type", input: "select", options: options(EXPENSE_TYPE_OPTIONS) },
        { key: "description", label: "Description", input: "text" },
        { key: "amount", label: "Amount", input: "currency" },
        frequencyField,
        { key: "indexation", label: "Indexation", input: "percentage" },
        jointField,
      ];
    case "superannuation":
      return [
        ownerField,
        { key: "type", label: "Type", input: "select", options: options(SUPER_TYPE_OPTIONS) },
        { key: "superFund", label: "Fund", input: "text" },
        { key: "accountNumber", label: "Account Number", input: "text" },
        { key: "balance", label: "Balance", input: "currency" },
        { key: "contributionAmount", label: "Contribution", input: "currency" },
        frequencyField,
        jointField,
      ];
    case "retirement-income":
      return [
        ownerField,
        { key: "type", label: "Type", input: "select", options: options(PENSION_TYPE_OPTIONS) },
        { key: "superFund", label: "Provider/Fund", input: "text" },
        { key: "accountNumber", label: "Account Number", input: "text" },
        { key: "balance", label: "Balance", input: "currency" },
        { key: "payment", label: "Payment", input: "currency" },
        { key: "annualReturn", label: "Annual Return", input: "percentage" },
        frequencyField,
      ];
    case "insurance":
      return [
        { key: "ownerId", label: "Policy Owner", input: "select", options: ownerOptions },
        { key: "insurer", label: "Insurer", input: "text" },
        { key: "policyNumber", label: "Policy Number", input: "text" },
        { key: "status", label: "Policy Status", input: "select", options: options(INSURANCE_STATUS_OPTIONS) },
        { key: "linkedSuperFundId", label: "Linked Super Fund", input: "select", options: [{ label: "None", value: "" }, ...superFundOptions] },
      ];
  }
}

function modalTitle(section: FactFindPopupSection, isEdit: boolean) {
  if (section === "insurance") {
    return `${isEdit ? "Edit" : "Add"} Insurance Policy`;
  }

  const label = section === "retirement-income" ? "Retirement Income" : section.replace("-", " ");
  return `${isEdit ? "Edit" : "Add"} ${label.replace(/\b\w/g, (letter) => letter.toUpperCase())}`;
}

function getRecordOwnerValue(record?: { owner?: { id?: string | null } | null; joint?: boolean | null } | null) {
  return record?.joint ? JOINT_OWNER_VALUE : record?.owner?.id ?? "";
}

function getModalInitialValues(
  profile: ClientProfile,
  modal: FactFindRecordModalState,
  ownerOptions: Array<{ label: string; value: string }>,
): Record<string, string> {
  const ownerFallback = ownerOptions[0]?.value ?? "";
  const recordId = modal.recordId ?? "";

  switch (modal.section) {
    case "dependants": {
      const item = profile.dependants?.find((record) => record.id === recordId);
      return { name: item?.name ?? "", type: item?.type ?? "Child", birthday: formatDateInput(item?.birthday) };
    }
    case "entities": {
      const item = profile.entities?.find((record) => record.id === recordId);
      return { ownerId: item?.owner?.id ?? ownerFallback, name: item?.name ?? "", type: item?.type ?? "" };
    }
    case "assets": {
      const item = profile.assets?.find((record) => record.id === recordId);
      return {
        ownerId: getRecordOwnerValue(item) || ownerFallback,
        type: item?.type ?? "",
        assetType: item?.assetType ?? "",
        description: item?.description ?? "",
        currentValue: item?.currentValue ? formatCurrencyInput(item.currentValue) : "",
        cost: item?.cost ? formatCurrencyInput(item.cost) : "",
        incomeAmount: item?.incomeAmount ? formatCurrencyInput(item.incomeAmount) : "",
        incomeFrequency: item?.incomeFrequency?.value ?? item?.incomeFrequency?.type ?? "",
        acquisitionDate: formatDateInput(item?.acquisitionDate),
        joint: item?.joint ? "Yes" : "No",
      };
    }
    case "liabilities": {
      const item = profile.liabilities?.find((record) => record.id === recordId);
      return {
        ownerId: getRecordOwnerValue(item) || ownerFallback,
        loanType: item?.loanType ?? "",
        bankName: item?.bankName ?? "",
        outstandingBalance: item?.outstandingBalance ? formatCurrencyInput(item.outstandingBalance) : "",
        repaymentAmount: item?.repaymentAmount ? formatCurrencyInput(item.repaymentAmount) : "",
        interestRate: item?.interestRate ?? "",
        frequency: item?.repaymentFrequency?.value ?? item?.repaymentFrequency?.type ?? "",
        joint: item?.joint ? "Yes" : "No",
      };
    }
    case "employment": {
      const item = profile.employment?.find((record) => record.id === recordId);
      return {
        ownerId: item?.owner?.id ?? profile.client?.id ?? ownerFallback,
        jobTitle: item?.jobTitle ?? item?.job_title ?? "",
        status: item?.status ?? "",
        employer: item?.employer ?? "",
        salary: item?.salary ? formatCurrencyInput(item.salary) : "",
        frequency: typeof item?.frequency === "string" ? item.frequency : item?.frequency?.value ?? item?.frequency?.type ?? "",
        primaryEmployment: item?.primaryEmployment === false ? "No" : "Yes",
        startDate: formatDateInput(item?.startDate),
        endDate: formatDateInput(item?.endDate),
      };
    }
    case "income": {
      const item = profile.income?.find((record) => record.id === recordId);
      return {
        ownerId: getRecordOwnerValue(item) || ownerFallback,
        type: item?.type ?? "",
        description: item?.description ?? "",
        amount: item?.amount ? formatCurrencyInput(item.amount) : "",
        frequency: item?.frequency?.value ?? item?.frequency?.type ?? "",
        taxType: item?.taxType ?? "",
        joint: item?.joint ? "Yes" : "No",
      };
    }
    case "expenses": {
      const item = profile.expense?.find((record) => record.id === recordId);
      return {
        ownerId: getRecordOwnerValue(item) || ownerFallback,
        type: item?.type ?? "",
        description: item?.description ?? "",
        amount: item?.amount ? formatCurrencyInput(item.amount) : "",
        frequency: item?.frequency?.value ?? item?.frequency?.type ?? "",
        indexation: item?.indexation ?? "",
        joint: item?.joint ? "Yes" : "No",
      };
    }
    case "superannuation": {
      const item = profile.superannuation?.find((record) => record.id === recordId);
      return {
        ownerId: getRecordOwnerValue(item) || ownerFallback,
        type: item?.type ?? "",
        superFund: item?.superFund ?? "",
        accountNumber: item?.accountNumber ?? "",
        balance: item?.balance ? formatCurrencyInput(item.balance) : "",
        contributionAmount: item?.contributionAmount ? formatCurrencyInput(item.contributionAmount) : "",
        frequency: item?.frequency?.value ?? item?.frequency?.type ?? "",
        joint: item?.joint ? "Yes" : "No",
      };
    }
    case "retirement-income": {
      const item = profile.pension?.find((record) => record.id === recordId);
      return {
        ownerId: getRecordOwnerValue(item) || ownerFallback,
        type: item?.type ?? "",
        superFund: item?.superFund ?? "",
        accountNumber: item?.accountNumber ?? "",
        balance: item?.balance ? formatCurrencyInput(item.balance) : "",
        payment: item?.payment ? formatCurrencyInput(item.payment) : "",
        annualReturn: item?.annualReturn ?? "",
        frequency: item?.frequency?.value ?? item?.frequency?.type ?? "",
      };
    }
    case "insurance": {
      const item = profile.insurance?.find((record) => record.id === recordId);
      return {
        ownerId: getRecordOwnerValue(item) || ownerFallback,
        coverRequired: item?.coverRequired ?? "",
        insurer: item?.insurer ?? "",
        policyNumber: "",
        linkedSuperFundId: "",
        sumInsured: item?.sumInsured ? formatCurrencyInput(item.sumInsured) : "",
        premiumAmount: item?.premiumAmount ? formatCurrencyInput(item.premiumAmount) : "",
        frequency: item?.frequency?.value ?? item?.frequency?.type ?? "Monthly",
        status: item?.status ?? "Active",
      };
    }
  }
}

function createInsuranceBenefitDraft(record?: ClientInsuranceRecord | null): InsuranceBenefitDraft {
  return {
    id: `benefit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    coverRequired: record?.coverRequired ?? "",
    sumInsured: record?.sumInsured ? formatCurrencyInput(record.sumInsured) : "",
    premiumAmount: record?.premiumAmount ? formatCurrencyInput(record.premiumAmount) : "",
    frequency: record?.frequency?.value ?? record?.frequency?.type ?? "Monthly",
  };
}

function createInsuranceBenefitDraftFromCover(cover?: PolicyCoverRecord | null): InsuranceBenefitDraft {
  return {
    id: cover?.id ?? `benefit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    coverRequired: cover?.coverType ?? "",
    sumInsured: formatMoneyValue(cover?.sumInsured),
    premiumAmount: formatMoneyValue(cover?.premiumAmount),
    frequency: cover?.premiumFrequency ?? "Monthly",
  };
}

const DETAIL_FIELD_SECTIONS = [
  {
    title: "Overview",
    keys: ["target", "name", "status", "clientCategory", "riskProfile"],
  },
  {
    title: "Client Details",
    keys: ["dateOfBirth", "maritalStatus", "residentStatus", "gender"],
  },
  {
    title: "Contact Details",
    keys: ["street", "suburb", "state", "postCode", "email", "preferredPhone"],
  },
  {
    title: "Advice Agreement",
    keys: ["adviceAgreementRequired", "agreementType", "nextAnniversaryDate"],
  },
];

function isPersonDetailsEditorCard(editorCard: FinleyEditorCard) {
  return editorCard.toolName === "update_client_person_details" || editorCard.toolName === "update_partner_person_details";
}

function renderEditorField(
  field: FinleyEditorCard["fields"][number],
  onFieldChange: (fieldKey: string, value: string, rowId?: string) => void,
  riskProfileOptions: SelectOption[] = DEFAULT_RISK_PROFILE_OPTIONS,
) {
  const selectOptions =
    field.input === "select" && isRiskProfileFieldKey(field.key)
      ? withCurrentRiskProfileOption(riskProfileOptions, field.value)
      : field.options ?? [];

  return (
    <label
      key={field.key}
      className={`${styles.factFindField} ${field.input === "textarea" ? styles.factFindFieldFull : ""}`.trim()}
    >
      <span className={styles.factFindFieldLabel}>{field.label}</span>
      {field.input === "select" ? (
        <select
          className={styles.factFindInput}
          value={field.value}
          onChange={(event) => onFieldChange(field.key, event.target.value)}
        >
          <option value="">Select...</option>
          {selectOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.input === "textarea" ? (
        <textarea
          className={`${styles.factFindInput} ${styles.factFindTextarea}`.trim()}
          rows={6}
          value={field.value}
          onChange={(event) => onFieldChange(field.key, event.target.value)}
        />
      ) : (
        <input
          className={styles.factFindInput}
          value={formatFieldValue(field.key, field.value)}
          onChange={(event) => onFieldChange(field.key, event.target.value)}
        />
      )}
    </label>
  );
}

function renderDisplayCard(
  displayCard: FinleyDisplayCard,
  onEditRecord: (section: FactFindPopupSection, recordId: string) => void,
  onDeleteRecord: (section: FactFindPopupSection, recordId: string, label: string) => void,
  selectedRecordIds: string[],
  onToggleRecordSelection: (recordId: string, selected: boolean) => void,
  onToggleAllRecordSelection: (recordIds: string[], selected: boolean) => void,
  onBulkDeleteRecords: (section: FactFindPopupSection, recordIds: string[]) => void,
  isBulkDeleting: boolean,
) {
  const hasActions = displayCard.rows.some((row) => row.editAction);
  const columns = hasActions ? ["Select", ...displayCard.columns, "Action"] : displayCard.columns;
  const gridTemplateColumns = hasActions
    ? `minmax(2.75rem, 3rem) ${displayCard.columns.map(() => "minmax(0, 1fr)").join(" ")} minmax(7rem, 8rem)`
    : `repeat(${columns.length}, minmax(0, 1fr))`;
  const selectableRows = displayCard.rows.filter((row) => row.editAction);
  const selectableRecordIds = selectableRows.map((row) => row.editAction!.recordId);
  const selectedIdsInCard = selectedRecordIds.filter((recordId) => selectableRecordIds.includes(recordId));
  const allSelectableRowsSelected = selectableRecordIds.length > 0 && selectedIdsInCard.length === selectableRecordIds.length;
  const bulkDeleteSection = selectableRows[0]?.editAction?.kind ?? null;

  return (
    <div className={styles.factFindDataCard}>
      <div className={styles.factFindDataTitleRow}>
        <div className={styles.factFindDataTitle}>{displayCard.title}</div>
        {hasActions ? (
          <button
            type="button"
            className={styles.factFindBulkDeleteButton}
            onClick={() => {
              if (bulkDeleteSection) {
                onBulkDeleteRecords(bulkDeleteSection, selectedIdsInCard);
              }
            }}
            disabled={!selectedIdsInCard.length || isBulkDeleting}
          >
            {isBulkDeleting ? "Deleting..." : `Delete selected${selectedIdsInCard.length ? ` (${selectedIdsInCard.length})` : ""}`}
          </button>
        ) : null}
      </div>
      <div className={styles.factFindDataTableWrap}>
        <div
          className={styles.factFindDataTableHeader}
          style={{ gridTemplateColumns }}
        >
          {columns.map((column) => (
            <div
              key={column}
              className={`${styles.factFindDataTableHeaderCell} ${
                column === "Action" ? styles.factFindDataTableActionHeaderCell : column === "Select" ? styles.factFindDataTableSelectCell : ""
              }`.trim()}
            >
              {column === "Select" ? (
                <input
                  type="checkbox"
                  className={styles.factFindRowCheckbox}
                  aria-label="Select all rows"
                  checked={allSelectableRowsSelected}
                  disabled={!selectableRecordIds.length}
                  onChange={(event) => onToggleAllRecordSelection(selectableRecordIds, event.target.checked)}
                />
              ) : (
                column
              )}
            </div>
          ))}
        </div>
        {displayCard.rows.map((row) => (
          <div
            key={row.id}
            className={styles.factFindDataTableRow}
            style={{ gridTemplateColumns }}
          >
            {hasActions ? (
              <div className={`${styles.factFindDataTableCell} ${styles.factFindDataTableSelectCell}`.trim()}>
                {row.editAction ? (
                  <input
                    type="checkbox"
                    className={styles.factFindRowCheckbox}
                    aria-label={`Select ${row.cells.filter(Boolean).slice(0, 2).join(" | ") || row.editAction.kind.replace("-", " ")} record`}
                    checked={selectedRecordIds.includes(row.editAction.recordId)}
                    onChange={(event) => onToggleRecordSelection(row.editAction!.recordId, event.target.checked)}
                  />
                ) : (
                  <span className={styles.factFindDataTableActionPlaceholder}>—</span>
                )}
              </div>
            ) : null}
            {row.cells.map((cell, cellIndex) => (
              <div key={`${row.id}-${cellIndex}`} className={styles.factFindDataTableCell}>
                {cell || "—"}
              </div>
            ))}
            {hasActions ? (
              <div className={`${styles.factFindDataTableCell} ${styles.factFindDataTableActionCell}`.trim()}>
                {row.editAction ? (
                  <>
                    <button
                      type="button"
                      className={styles.factFindEditButton}
                      onClick={() => onEditRecord(row.editAction!.kind, row.editAction!.recordId)}
                      aria-label={`Edit ${row.editAction.kind.replace("-", " ")} record`}
                      title={`Edit ${row.editAction.kind.replace("-", " ")} record`}
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                        <path d="M16.9 4.4 19.6 7.1 8.8 17.9 5.3 18.7 6.1 15.2 16.9 4.4Z" />
                        <path d="M14.9 6.4 17.6 9.1" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={`${styles.factFindEditButton} ${styles.factFindDeleteButton}`.trim()}
                      onClick={() =>
                        onDeleteRecord(
                          row.editAction!.kind,
                          row.editAction!.recordId,
                          row.cells.filter(Boolean).slice(0, 2).join(" | ") || row.editAction!.kind.replace("-", " "),
                        )
                      }
                      aria-label={`Delete ${row.editAction.kind.replace("-", " ")} record`}
                      title={`Delete ${row.editAction.kind.replace("-", " ")} record`}
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                        <path d="M4 7h16" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                        <path d="M6 7l1 13h10l1-13" />
                        <path d="M9 7V4h6v3" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <span className={styles.factFindDataTableActionPlaceholder}>—</span>
                )}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {displayCard.footer ? <div className={styles.factFindFooter}>{displayCard.footer}</div> : null}
    </div>
  );
}

function renderEditorCard(
  editorCard: FinleyEditorCard | FinleyTableEditorCard,
  onFieldChange: (fieldKey: string, value: string, rowId?: string) => void,
  riskProfileOptions: SelectOption[] = DEFAULT_RISK_PROFILE_OPTIONS,
) {
  if (editorCard.kind === "collection_table") {
    return (
      <div className={styles.factFindEditorCard}>
        <div className={styles.factFindEditorTitle}>{editorCard.title}</div>
        <div className={styles.factFindBatchTableWrap}>
          <div
            className={styles.factFindBatchTableHeader}
            style={{ gridTemplateColumns: `repeat(${editorCard.columns.length}, minmax(0, 1fr))` }}
          >
            {editorCard.columns.map((column) => (
              <div key={column.key} className={styles.factFindDataTableHeaderCell}>
                {column.label}
              </div>
            ))}
          </div>
          {editorCard.rows.map((row) => (
            <div
              key={row.id}
              className={styles.factFindBatchTableRow}
              style={{ gridTemplateColumns: `repeat(${editorCard.columns.length}, minmax(0, 1fr))` }}
            >
              {editorCard.columns.map((column) =>
                column.input === "select" ? (
                  <select
                    key={`${row.id}-${column.key}`}
                    className={styles.factFindInput}
                    value={row.values[column.key] ?? ""}
                    onChange={(event) => onFieldChange(column.key, event.target.value, row.id)}
                  >
                    <option value="">Select...</option>
                    {(column.options ?? []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    key={`${row.id}-${column.key}`}
                    className={styles.factFindInput}
                    value={formatFieldValue(column.key, row.values[column.key] ?? "")}
                    onChange={(event) => onFieldChange(column.key, event.target.value, row.id)}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.factFindEditorCard}>
      <div className={styles.factFindEditorTitle}>{editorCard.title}</div>
      {isPersonDetailsEditorCard(editorCard) ? (
        <div className={styles.factFindDetailSections}>
          {DETAIL_FIELD_SECTIONS.map((section) => {
            const fields = editorCard.fields.filter((field) => section.keys.includes(field.key));
            if (!fields.length) return null;

            return (
              <section key={section.title} className={styles.factFindDetailSection}>
                <div className={styles.factFindDetailSectionTitle}>{section.title}</div>
                <div className={styles.factFindEditorGrid}>
                  {fields.map((field) => renderEditorField(field, onFieldChange, riskProfileOptions))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className={styles.factFindEditorGrid}>
          {editorCard.fields.map((field) => renderEditorField(field, onFieldChange, riskProfileOptions))}
        </div>
      )}
    </div>
  );
}

export function FactFindSection({ clientId, profile }: FactFindSectionProps) {
  const [profileState, setProfileState] = useState(profile);
  const [workflow, setWorkflow] = useState<FinleyFactFindWorkflow | null>(null);
  const [insurancePolicies, setInsurancePolicies] = useState<InsurancePolicyView[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingDocx, setIsGeneratingDocx] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [isSavingStep, setIsSavingStep] = useState(false);
  const [recordModal, setRecordModal] = useState<FactFindRecordModalState | null>(null);
  const [recordValues, setRecordValues] = useState<Record<string, string>>({});
  const [insuranceBenefits, setInsuranceBenefits] = useState<InsuranceBenefitDraft[]>([createInsuranceBenefitDraft()]);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<FactFindDeleteConfirmState | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletingRecord, setIsDeletingRecord] = useState(false);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [riskProfileOptions, setRiskProfileOptions] = useState<SelectOption[]>(DEFAULT_RISK_PROFILE_OPTIONS);
  const clientName = useMemo(() => buildClientName(profileState), [profileState]);
  const currentStep = workflow?.steps?.[stepIndex] ?? null;
  const currentStepPopupSection = isFactFindPopupSection(currentStep?.id) ? currentStep.id : null;
  const isLastStep = Boolean(workflow && stepIndex >= workflow.steps.length - 1);
  const ownerOptions = useMemo(() => buildOwnerOptions(profileState), [profileState]);
  const superFundOptions = useMemo(() => buildSuperFundOptions(profileState), [profileState]);
  const recordModalFields = recordModal ? getPopupFields(recordModal.section, ownerOptions, superFundOptions) : [];
  const currentDisplayCard = currentStep?.id === "insurance" && insurancePolicies.length
    ? buildInsurancePolicyDisplayCard(clientName, insurancePolicies)
    : currentStep?.displayCard ?? null;

  useEffect(() => {
    setProfileState(profile);
  }, [profile]);

  useEffect(() => {
    let isMounted = true;

    async function loadRiskProfileOptions() {
      try {
        const response = await listAdminLicensees();
        if (!isMounted) return;
        setRiskProfileOptions(resolveRiskProfileOptions(response?.data ?? [], profileState));
      } catch {
        if (isMounted) {
          setRiskProfileOptions(DEFAULT_RISK_PROFILE_OPTIONS);
        }
      }
    }

    void loadRiskProfileOptions();

    return () => {
      isMounted = false;
    };
  }, [profileState]);

  const loadInsurancePolicies = useCallback(
    async (profileId?: string | null) => {
      const resolvedProfileId = profileId?.trim() || profileState.id?.trim() || clientId;
      if (!resolvedProfileId) {
        setInsurancePolicies([]);
        return;
      }

      try {
        const response = await fetch(`/api/insurance/${encodeURIComponent(resolvedProfileId)}/policies`, { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as { data?: ClientPolicyRecord[] | null } | null;
        if (!response.ok) {
          throw new Error("Unable to load nested insurance policies.");
        }

        setInsurancePolicies(body?.data ?? []);
      } catch {
        setInsurancePolicies([]);
      }
    },
    [clientId, profileState.id],
  );

  const loadWorkflow = useCallback(
    async (options?: { resetStep?: boolean }) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/finley/fact-find", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            activeClientId: clientId,
            activeClientName: clientName,
          }),
        });

        const body = (await response.json().catch(() => null)) as { workflow?: FinleyFactFindWorkflow | null } | null;
        if (!response.ok || !body?.workflow) {
          throw new Error("Unable to load the fact find workflow right now.");
        }

        setWorkflow(body.workflow);
        if (options?.resetStep ?? true) {
          setStepIndex(0);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load the fact find workflow right now.");
      } finally {
        setIsLoading(false);
      }
    },
    [clientId, clientName],
  );

  useEffect(() => {
    void loadWorkflow();
  }, [loadWorkflow]);

  useEffect(() => {
    void loadInsurancePolicies();
  }, [loadInsurancePolicies]);

  useEffect(() => {
    setSelectedRecordIds([]);
    setBulkDeleteError(null);
  }, [currentStep?.id]);

  function openRecordModal(section: FactFindPopupSection, recordId?: string | null) {
    const nextModal = { section, recordId };
    setRecordModal(nextModal);
    setRecordValues(getModalInitialValues(profileState, nextModal, ownerOptions));
    if (section === "insurance") {
      const existingPolicy = recordId ? insurancePolicies.find((policy) => policy.id === recordId) ?? null : null;
      if (existingPolicy) {
        const ownerOption = findOptionByValueOrLabel(existingPolicy.policyOwner, ownerOptions);
        const superOption = findOptionByValueOrLabel(existingPolicy.linkedSuperFund, superFundOptions);
        setRecordValues({
          ownerId: ownerOption?.value ?? ownerOptions[0]?.value ?? "",
          insurer: existingPolicy.insurer ?? "",
          policyNumber: existingPolicy.policyNumber ?? "",
          status: existingPolicy.status ?? "Active",
          linkedSuperFundId: superOption?.value ?? "",
        });
        setInsuranceBenefits(
          existingPolicy.covers?.length
            ? existingPolicy.covers.map(createInsuranceBenefitDraftFromCover)
            : [createInsuranceBenefitDraftFromCover()],
        );
      } else {
        const existingRecord = recordId ? profileState.insurance?.find((record) => record.id === recordId) ?? null : null;
        setInsuranceBenefits([createInsuranceBenefitDraft(existingRecord)]);
      }
    }
    setRecordError(null);
  }

  function closeRecordModal() {
    if (isSavingRecord) return;
    setRecordModal(null);
    setRecordValues({});
    setInsuranceBenefits([createInsuranceBenefitDraft()]);
    setRecordError(null);
  }

  function openDeleteConfirm(section: FactFindPopupSection, recordId: string, label: string) {
    setDeleteConfirm({ section, recordId, label });
    setDeleteError(null);
  }

  function toggleRecordSelection(recordId: string, selected: boolean) {
    setSelectedRecordIds((current) =>
      selected
        ? current.includes(recordId)
          ? current
          : [...current, recordId]
        : current.filter((id) => id !== recordId),
    );
  }

  function toggleAllRecordSelection(recordIds: string[], selected: boolean) {
    setSelectedRecordIds((current) => {
      const recordIdSet = new Set(recordIds);
      if (!selected) {
        return current.filter((id) => !recordIdSet.has(id));
      }

      const next = new Set(current);
      for (const recordId of recordIds) {
        next.add(recordId);
      }
      return Array.from(next);
    });
  }

  function closeDeleteConfirm() {
    if (isDeletingRecord) return;
    setDeleteConfirm(null);
    setDeleteError(null);
  }

  function updateRecordValue(fieldKey: string, value: string) {
    setRecordValues((current) => ({ ...current, [fieldKey]: value }));
  }

  function updateInsuranceBenefit(benefitId: string, fieldKey: keyof Omit<InsuranceBenefitDraft, "id">, value: string) {
    setInsuranceBenefits((current) =>
      current.map((benefit) => (benefit.id === benefitId ? { ...benefit, [fieldKey]: value } : benefit)),
    );
  }

  function addInsuranceBenefit() {
    setInsuranceBenefits((current) => [...current, createInsuranceBenefitDraft()]);
  }

  function removeInsuranceBenefit(benefitId: string) {
    setInsuranceBenefits((current) => (current.length > 1 ? current.filter((benefit) => benefit.id !== benefitId) : current));
  }

  function formatInsuranceBenefitCurrencyOnBlur(benefitId: string, fieldKey: "sumInsured" | "premiumAmount") {
    const benefit = insuranceBenefits.find((item) => item.id === benefitId);
    updateInsuranceBenefit(benefitId, fieldKey, formatCurrencyInput(benefit?.[fieldKey] ?? ""));
  }

  function formatRecordValueOnBlur(field: PopupField) {
    if (field.input === "currency") {
      updateRecordValue(field.key, formatCurrencyInput(recordValues[field.key] ?? ""));
      return;
    }

    if (field.input === "percentage") {
      updateRecordValue(field.key, formatPercentageInput(recordValues[field.key] ?? ""));
    }
  }

  async function saveFinancialRecordModal<K extends FinancialCollectionKind>(
    profileId: string,
    kind: K,
    values: Record<string, string>,
    editingId?: string | null,
  ) {
    const owner = ownerFromValue(profileState, values.ownerId ?? "");
    const hasPartner = hasLinkedPartner(profileState);
    const joint = hasPartner && (values.ownerId === JOINT_OWNER_VALUE || boolFromYesNo(values.joint ?? ""));

    if (!owner) {
      throw new Error("Please choose an owner.");
    }

    let record: ProfileCollectionRecord<K>;

    switch (kind) {
      case "liabilities":
        if (!values.loanType) throw new Error("Please choose a liability type.");
        record = {
          loanType: values.loanType,
          bankName: values.bankName?.trim() || null,
          outstandingBalance: cleanCurrencyLike(values.outstandingBalance ?? ""),
          repaymentAmount: cleanCurrencyLike(values.repaymentAmount ?? ""),
          interestRate: cleanCurrencyLike(values.interestRate ?? ""),
          repaymentFrequency: optionFromValue(values.frequency ?? ""),
          joint,
          owner,
        } as ProfileCollectionRecord<K>;
        break;
      case "income":
        if (!values.type) throw new Error("Please choose an income type.");
        record = {
          type: values.type,
          description: values.description?.trim() || null,
          amount: cleanCurrencyLike(values.amount ?? ""),
          frequency: optionFromValue(values.frequency ?? ""),
          taxType: values.taxType?.trim() || null,
          joint,
          owner,
        } as ProfileCollectionRecord<K>;
        break;
      case "expenses":
        if (!values.type) throw new Error("Please choose an expense type.");
        record = {
          type: values.type,
          description: values.description?.trim() || null,
          amount: cleanCurrencyLike(values.amount ?? ""),
          frequency: optionFromValue(values.frequency ?? ""),
          indexation: cleanCurrencyLike(values.indexation ?? ""),
          joint,
          owner,
        } as ProfileCollectionRecord<K>;
        break;
      case "superannuation":
        if (!values.type) throw new Error("Please choose a superannuation type.");
        record = {
          type: values.type,
          superFund: values.superFund?.trim() || null,
          accountNumber: values.accountNumber?.trim() || null,
          balance: cleanCurrencyLike(values.balance ?? ""),
          contributionAmount: cleanCurrencyLike(values.contributionAmount ?? ""),
          frequency: optionFromValue(values.frequency ?? ""),
          joint,
          owner,
        } as ProfileCollectionRecord<K>;
        break;
      case "retirement-income":
        if (!values.type) throw new Error("Please choose a retirement income type.");
        record = {
          type: values.type,
          superFund: values.superFund?.trim() || null,
          accountNumber: values.accountNumber?.trim() || null,
          balance: cleanCurrencyLike(values.balance ?? ""),
          payment: cleanCurrencyLike(values.payment ?? ""),
          annualReturn: cleanCurrencyLike(values.annualReturn ?? ""),
          frequency: optionFromValue(values.frequency ?? ""),
          joint,
          owner,
        } as ProfileCollectionRecord<K>;
        break;
      case "insurance":
        if (!values.coverRequired) throw new Error("Please choose a cover type.");
        record = {
          coverRequired: values.coverRequired,
          insurer: values.insurer?.trim() || null,
          sumInsured: cleanCurrencyLike(values.sumInsured ?? ""),
          premiumAmount: cleanCurrencyLike(values.premiumAmount ?? ""),
          frequency: optionFromValue(values.frequency ?? ""),
          status: values.status?.trim() || null,
          joint,
          owner,
        } as ProfileCollectionRecord<K>;
        break;
    }

    const currentRecords = resolveFinancialRecords(profileState, kind);
    const nextRecords = upsertFinancialCollection(kind, currentRecords, record, editingId);
    const savedRecords = await saveFinancialCollection(kind, profileId, nextRecords);
    setProfileState((current) => assignFinancialRecords(current, kind, savedRecords));
  }

  async function saveInsurancePolicyModal(
    profileId: string,
    values: Record<string, string>,
    benefits: InsuranceBenefitDraft[],
    policyId?: string | null,
  ) {
    const owner = ownerFromValue(profileState, values.ownerId ?? "");
    if (!owner) {
      throw new Error("Please choose a policy owner.");
    }

    const coverPayloads = benefits
      .filter((benefit) => benefit.coverRequired || benefit.sumInsured || benefit.premiumAmount)
      .map((benefit) => ({
        id: null,
        coverType: benefit.coverRequired || null,
        sumInsured: numberFromCurrencyLike(benefit.sumInsured),
        premiumAmount: numberFromCurrencyLike(benefit.premiumAmount),
        premiumFrequency: benefit.frequency?.trim() || null,
      }) satisfies PolicyCoverRecord);

    if (!coverPayloads.length || coverPayloads.some((benefit) => !benefit.coverType)) {
      throw new Error("Please add at least one benefit and choose a cover type for each benefit.");
    }

    const linkedSuperFund = superFundOptions.find((option) => option.value === values.linkedSuperFundId);
    const policyPayload: ClientPolicyRecord = {
      id: policyId ?? null,
      clientId: profileId,
      policyOwner: owner.name ?? null,
      insurer: values.insurer?.trim() || null,
      policyNumber: values.policyNumber?.trim() || null,
      status: values.status?.trim() || "Active",
      linkedSuperFund: linkedSuperFund?.label ?? null,
      covers: coverPayloads,
    };

    const policyEndpoint = policyId
      ? `/api/insurance/${encodeURIComponent(profileId)}/policy/${encodeURIComponent(policyId)}`
      : `/api/insurance/${encodeURIComponent(profileId)}/policy`;
    const policyResponse = await fetch(policyEndpoint, {
      method: policyId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(policyPayload),
    });
    const policyBody = (await policyResponse.json().catch(() => null)) as { data?: ClientPolicyRecord | null; message?: string | null } | null;

    if (!policyResponse.ok) {
      throw new Error(getApiErrorMessage(policyBody, `Unable to save insurance policy right now (status ${policyResponse.status}).`));
    }

    const savedPolicyId = policyBody?.data?.id?.trim() || policyId?.trim();
    if (!savedPolicyId) {
      throw new Error("The insurance policy was created, but the API did not return a policy id for the cover.");
    }

    if (policyId) {
      const existingPolicy = insurancePolicies.find((policy) => policy.id === policyId);
      for (const cover of existingPolicy?.covers ?? []) {
        if (!cover.id) continue;
        const deleteResponse = await fetch(
          `/api/insurance/${encodeURIComponent(profileId)}/policy/${encodeURIComponent(savedPolicyId)}/covers/${encodeURIComponent(cover.id)}`,
          { method: "DELETE" },
        );
        if (!deleteResponse.ok) {
          const deleteBody = (await deleteResponse.json().catch(() => null)) as { message?: string | null } | null;
          throw new Error(getApiErrorMessage(deleteBody, `Unable to replace insurance cover right now (status ${deleteResponse.status}).`));
        }
      }
    }

    const returnedCovers = policyBody?.data?.covers ?? [];
    if (!returnedCovers.length) {
      const coverResponse = await fetch(`/api/insurance/${encodeURIComponent(profileId)}/policy/${encodeURIComponent(savedPolicyId)}/covers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(coverPayloads.map((cover) => ({ ...cover, id: null }))),
      });
      const coverBody = (await coverResponse.json().catch(() => null)) as { data?: PolicyCoverRecord[] | null; message?: string | null } | null;

      if (!coverResponse.ok) {
        throw new Error(getApiErrorMessage(coverBody, `Unable to save insurance cover right now (status ${coverResponse.status}).`));
      }
    }

    await loadInsurancePolicies(profileId);
  }

  async function handleSaveRecordModal() {
    if (!recordModal) return;

    const profileId = profileState.id?.trim() || "";
    if (!profileId) {
      setRecordError("This client profile does not have a profile id yet.");
      return;
    }

    setIsSavingRecord(true);
    setRecordError(null);

    try {
      const values = recordValues;
      const editingId = recordModal.recordId ?? null;

      switch (recordModal.section) {
        case "dependants": {
          if (!values.name?.trim()) throw new Error("Please enter a dependant name.");
          const owner = profileState.client?.id
            ? { id: profileState.client.id, name: profileState.client.name ?? "Client" }
            : ownerFromValue(profileState, ownerOptions[0]?.value ?? "");
          if (!owner) throw new Error("Please choose an owner.");

          const record: ClientDependantRecord = {
            name: values.name.trim(),
            type: values.type || "Child",
            birthday: parseDateValue(values.birthday ?? "") || null,
            owner,
          };
          const nextRecords = upsertDependantCollection(profileState.dependants ?? [], record, editingId);
          const savedRecords = await saveDependantCollection(profileId, nextRecords);
          setProfileState((current) => ({ ...current, dependants: savedRecords }));
          break;
        }
        case "entities": {
          const owner = ownerFromValue(profileState, values.ownerId ?? "");
          if (!owner) throw new Error("Please choose an owner.");
          if (!values.name?.trim()) throw new Error("Please enter an entity name.");
          if (!values.type) throw new Error("Please choose an entity type.");

          const record: ClientEntityRecord = {
            name: values.name.trim(),
            type: values.type,
            owner,
          };
          const nextRecords = upsertEntityCollection(profileState.entities ?? [], record, editingId);
          const savedRecords = await saveEntityCollection(profileId, nextRecords);
          setProfileState((current) => ({ ...current, entities: savedRecords }));
          break;
        }
        case "assets": {
          const owner = ownerFromValue(profileState, values.ownerId ?? "");
          if (!owner) throw new Error("Please choose an owner.");
          if (!values.type) throw new Error("Please choose an asset category.");
          if (!values.assetType) throw new Error("Please choose an asset type.");
          if (!values.description?.trim()) throw new Error("Please enter an asset description.");

          const record: ClientAssetRecord = {
            type: values.type,
            assetType: values.assetType,
            description: values.description.trim(),
            currentValue: cleanCurrencyLike(values.currentValue ?? ""),
            cost: cleanCurrencyLike(values.cost ?? ""),
            incomeAmount: cleanCurrencyLike(values.incomeAmount ?? ""),
            incomeFrequency: optionFromValue(values.incomeFrequency ?? ""),
            acquisitionDate: parseDateValue(values.acquisitionDate ?? "") || null,
            joint: hasLinkedPartner(profileState) && (values.ownerId === JOINT_OWNER_VALUE || boolFromYesNo(values.joint ?? "")),
            owner,
          };
          const nextRecords = upsertAssetCollection(profileState.assets ?? [], record, editingId);
          const savedRecords = await saveAssetCollection(profileId, nextRecords);
          setProfileState((current) => ({ ...current, assets: savedRecords }));
          break;
        }
        case "employment": {
          const owner = ownerFromValue(profileState, values.ownerId ?? "");
          if (!owner) throw new Error("Please choose an owner.");

          const existingForOwner = (profileState.employment ?? [])
            .filter((item) => item.owner?.id === owner.id)
            .filter((item) => !editingId || item.id !== editingId);
          const request = [
            ...existingForOwner.map((item) => ({
              id: item.id ?? undefined,
              jobTitle: item.jobTitle ?? item.job_title ?? "",
              status: item.status ?? "",
              employer: item.employer ?? "",
              salary: item.salary ?? "",
              frequency: typeof item.frequency === "string" ? item.frequency : item.frequency?.value ?? item.frequency?.type ?? "",
              primaryEmployment: item.primaryEmployment ? "Yes" : "No",
              startDate: item.startDate ?? "",
              endDate: item.endDate ?? "",
            })),
            {
              id: editingId ?? undefined,
              jobTitle: values.jobTitle?.trim() || "",
              status: values.status ?? "",
              employer: values.employer?.trim() || "",
              salary: cleanCurrencyLike(values.salary ?? "") ?? "",
              frequency: values.frequency ?? "",
              primaryEmployment: values.primaryEmployment === "No" ? "No" : "Yes",
              startDate: parseDateValue(values.startDate ?? ""),
              endDate: parseDateValue(values.endDate ?? ""),
            },
          ];
          const savedEmployment = (await upsertEmploymentRecords({ profileId, owner, request })) as ClientEmploymentRecord[];
          setProfileState((current) => ({
            ...current,
            employment: [
              ...(current.employment ?? []).filter((item) => item.owner?.id !== owner.id),
              ...savedEmployment.map((item) => ({ ...item, owner })),
            ],
          }));
          break;
        }
        case "insurance":
          if (editingId && !insurancePolicies.some((policy) => policy.id === editingId)) {
            const benefit = insuranceBenefits[0] ?? createInsuranceBenefitDraft();
            await saveFinancialRecordModal(
              profileId,
              recordModal.section,
              {
                ...values,
                coverRequired: benefit.coverRequired,
                sumInsured: benefit.sumInsured,
                premiumAmount: benefit.premiumAmount,
                frequency: benefit.frequency,
              },
              editingId,
            );
          } else {
            await saveInsurancePolicyModal(profileId, values, insuranceBenefits, editingId);
          }
          break;
        default:
          await saveFinancialRecordModal(profileId, recordModal.section, values, editingId);
      }

      setRecordModal(null);
      setRecordValues({});
      setInsuranceBenefits([createInsuranceBenefitDraft()]);
      await loadWorkflow({ resetStep: false });
      await loadInsurancePolicies(profileId);
    } catch (saveError) {
      setRecordError(saveError instanceof Error ? saveError.message : "Unable to save this record right now.");
    } finally {
      setIsSavingRecord(false);
    }
  }

  async function deleteRecordBySection(profileId: string, section: FactFindPopupSection, recordId: string) {
    switch (section) {
      case "dependants":
        await deleteDependantCollectionItem(profileId, recordId);
        return;
      case "entities":
        await deleteEntityCollectionItem(profileId, recordId);
        return;
      case "assets":
        await deleteAssetCollectionItem(profileId, recordId);
        return;
      case "employment": {
        const response = await fetch(`/api/client-profiles/${encodeURIComponent(profileId)}/employments/${encodeURIComponent(recordId)}`, {
          method: "DELETE",
          cache: "no-store",
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
          throw new Error(body?.message || body?.error || "Unable to delete this employment record right now.");
        }
        return;
      }
      case "insurance":
        if (insurancePolicies.some((policy) => policy.id === recordId)) {
          const response = await fetch(`/api/insurance/${encodeURIComponent(profileId)}/policy/${encodeURIComponent(recordId)}`, {
            method: "DELETE",
            cache: "no-store",
          });
          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
            throw new Error(body?.message || body?.error || "Unable to delete this insurance policy right now.");
          }
          return;
        }
        await deleteFinancialCollectionItem(section, profileId, recordId);
        return;
      default:
        if (!isFinancialPopupSection(section)) {
          throw new Error("This fact find section cannot be deleted from here yet.");
        }
        await deleteFinancialCollectionItem(section, profileId, recordId);
    }
  }

  function removeDeletedRecordsFromProfile(section: FactFindPopupSection, recordIds: string[]) {
    const recordIdSet = new Set(recordIds);
    if (section === "insurance") {
      setInsurancePolicies((current) => current.filter((policy) => !policy.id || !recordIdSet.has(policy.id)));
    }

    setProfileState((current) => {
      switch (section) {
        case "dependants":
          return { ...current, dependants: (current.dependants ?? []).filter((item) => !item.id || !recordIdSet.has(item.id)) };
        case "entities":
          return { ...current, entities: (current.entities ?? []).filter((item) => !item.id || !recordIdSet.has(item.id)) };
        case "assets":
          return { ...current, assets: (current.assets ?? []).filter((item) => !item.id || !recordIdSet.has(item.id)) };
        case "employment":
          return { ...current, employment: (current.employment ?? []).filter((item) => !item.id || !recordIdSet.has(item.id)) };
        default:
          if (!isFinancialPopupSection(section)) return current;
          return assignFinancialRecords(
            current,
            section,
            resolveFinancialRecords(current, section).filter((item) => !item.id || !recordIdSet.has(item.id)),
          );
      }
    });
  }

  async function handleDeleteConfirmed() {
    if (!deleteConfirm) return;

    const profileId = profileState.id?.trim() || "";
    if (!profileId) {
      setDeleteError("This client profile does not have a profile id yet.");
      return;
    }

    setIsDeletingRecord(true);
    setDeleteError(null);

    try {
      await deleteRecordBySection(profileId, deleteConfirm.section, deleteConfirm.recordId);
      removeDeletedRecordsFromProfile(deleteConfirm.section, [deleteConfirm.recordId]);
      setSelectedRecordIds((current) => current.filter((id) => id !== deleteConfirm.recordId));

      setDeleteConfirm(null);
      await loadWorkflow({ resetStep: false });
      await loadInsurancePolicies(profileId);
    } catch (deleteRecordError) {
      setDeleteError(deleteRecordError instanceof Error ? deleteRecordError.message : "Unable to delete this record right now.");
    } finally {
      setIsDeletingRecord(false);
    }
  }

  async function handleBulkDeleteRecords(section: FactFindPopupSection, recordIds: string[]) {
    const uniqueRecordIds = Array.from(new Set(recordIds)).filter(Boolean);
    if (!uniqueRecordIds.length) return;

    const profileId = profileState.id?.trim() || "";
    if (!profileId) {
      setBulkDeleteError("This client profile does not have a profile id yet.");
      return;
    }

    const label = section === "retirement-income" ? "retirement income" : section.replace("-", " ");
    const confirmed = window.confirm(
      `Delete ${uniqueRecordIds.length} selected ${label} record${uniqueRecordIds.length === 1 ? "" : "s"}? This cannot be undone.`,
    );
    if (!confirmed) return;

    setIsBulkDeleting(true);
    setBulkDeleteError(null);

    try {
      for (const recordId of uniqueRecordIds) {
        await deleteRecordBySection(profileId, section, recordId);
      }

      removeDeletedRecordsFromProfile(section, uniqueRecordIds);
      setSelectedRecordIds((current) => current.filter((id) => !uniqueRecordIds.includes(id)));
      await loadWorkflow({ resetStep: false });
      await loadInsurancePolicies(profileId);
    } catch (bulkDeleteErrorResult) {
      setBulkDeleteError(
        bulkDeleteErrorResult instanceof Error ? bulkDeleteErrorResult.message : "Unable to delete the selected records right now.",
      );
    } finally {
      setIsBulkDeleting(false);
    }
  }

  function updateStepField(fieldKey: string, value: string, rowId?: string) {
    setWorkflow((current) => {
      if (!current) return current;

      const nextSteps = current.steps.map((step, index) => {
        if (index !== stepIndex) return step;

        if (step.editorCard?.kind === "collection_table" && rowId) {
          return {
            ...step,
            editorCard: {
              ...step.editorCard,
              rows: step.editorCard.rows.map((row) =>
                row.id === rowId
                  ? {
                      ...row,
                      values: {
                        ...row.values,
                        [fieldKey]: value,
                      },
                    }
                  : row,
              ),
            },
          };
        }

        if (step.editorCard?.kind === "collection_form") {
          return {
            ...step,
            editorCard: {
              ...step.editorCard,
              fields: step.editorCard.fields.map((field) =>
                field.key === fieldKey
                  ? {
                      ...field,
                      value,
                    }
                  : field,
              ),
            },
          };
        }

        return step;
      });

      return {
        ...current,
        steps: nextSteps,
      };
    });
  }

  function updateRiskProfileState(target: "client" | "partner", riskProfile: string) {
    setProfileState((current) => {
      const person = target === "partner" ? current.partner : current.client;
      if (!person) return current;

      return {
        ...current,
        [target]: {
          ...person,
          riskProfileResponse: {
            ...(person.riskProfileResponse && typeof person.riskProfileResponse === "object" ? person.riskProfileResponse : {}),
            resultDisplay: riskProfile,
          },
        },
      };
    });
  }

  async function saveCurrentStepIfNeeded() {
    if (!currentStep?.editorCard || currentStep.editorCard.kind !== "collection_form") {
      return;
    }

    if (currentStep.id === "risk-profile") {
      const values = Object.fromEntries(currentStep.editorCard.fields.map((field) => [field.key, field.value]));
      const profileId = profileState.id?.trim() || "";

      if (!profileId) {
        throw new Error("Finley could not determine which profile to save for this step.");
      }

      if (typeof values.clientRiskProfile === "string" && values.clientRiskProfile.trim() && profileState.client?.id?.trim()) {
        await updatePersonRiskProfile(
          {
            profileId,
            personId: profileState.client.id.trim(),
            person: profileState.client,
            changes: { riskProfile: values.clientRiskProfile },
            target: "client",
          },
          values.clientRiskProfile,
        );
        updateRiskProfileState("client", values.clientRiskProfile);
      }

      if (typeof values.partnerRiskProfile === "string" && values.partnerRiskProfile.trim() && profileState.partner?.id?.trim()) {
        await updatePersonRiskProfile(
          {
            profileId,
            personId: profileState.partner.id.trim(),
            person: profileState.partner,
            changes: { riskProfile: values.partnerRiskProfile },
            target: "partner",
          },
          values.partnerRiskProfile,
        );
        updateRiskProfileState("partner", values.partnerRiskProfile);
      }

      return;
    }

    const isClientStep =
      currentStep.id === "household-details" || currentStep.id === "partner-details";

    if (!isClientStep) {
      return;
    }

    const values = Object.fromEntries(currentStep.editorCard.fields.map((field) => [field.key, field.value]));
    const target: "client" | "partner" = currentStep.id === "partner-details" || values.target === "partner" ? "partner" : "client";
    const personId =
      target === "partner"
        ? profileState.partner?.id?.trim() || ""
        : profileState.client?.id?.trim() || "";
    const profileId = profileState.id?.trim() || "";

    if (!profileId || !personId) {
      throw new Error("Finley could not determine which person record to save for this step.");
    }

    const changes = {
      ...(typeof values.name === "string" ? { name: values.name } : {}),
      ...(typeof values.email === "string" ? { email: values.email } : {}),
      ...(typeof values.preferredPhone === "string" ? { preferredPhone: values.preferredPhone } : {}),
      ...(typeof values.dateOfBirth === "string" ? { dateOfBirth: parseDateValue(values.dateOfBirth) } : {}),
      ...(typeof values.street === "string" ? { street: values.street } : {}),
      ...(typeof values.suburb === "string" ? { suburb: values.suburb } : {}),
      ...(typeof values.state === "string" ? { state: values.state } : {}),
      ...(typeof values.postCode === "string" ? { postCode: values.postCode } : {}),
      ...(typeof values.maritalStatus === "string" ? { maritalStatus: values.maritalStatus } : {}),
      ...(typeof values.residentStatus === "string" ? { residentStatus: values.residentStatus } : {}),
      ...(typeof values.gender === "string" ? { gender: values.gender } : {}),
      ...(typeof values.status === "string" ? { status: values.status } : {}),
      ...(typeof values.clientCategory === "string" ? { clientCategory: values.clientCategory } : {}),
      ...(typeof values.riskProfile === "string" ? { riskProfile: values.riskProfile } : {}),
      ...(typeof values.adviceAgreementRequired === "string" ? { adviceAgreementRequired: values.adviceAgreementRequired } : {}),
      ...(typeof values.agreementType === "string" ? { agreementType: values.agreementType } : {}),
      ...(typeof values.nextAnniversaryDate === "string"
        ? { nextAnniversaryDate: parseDateValue(values.nextAnniversaryDate) }
        : {}),
    };

    const updateInput = {
      profileId,
      personId,
      person: target === "partner" ? profileState.partner ?? null : profileState.client ?? null,
      changes,
      target,
    };

    if (target === "partner") {
      await updatePartnerDetails(updateInput);
      if (typeof values.riskProfile === "string") {
        await updatePersonRiskProfile(updateInput, values.riskProfile);
      }
      return;
    }

    await updateClientDetails(updateInput);
    if (typeof values.riskProfile === "string") {
      await updatePersonRiskProfile(updateInput, values.riskProfile);
    }
  }

  async function handleNext() {
    if (!workflow) return;

    setIsSavingStep(true);
    setGenerateError(null);

    try {
      await saveCurrentStepIfNeeded();
      if (isLastStep) {
        await loadWorkflow({ resetStep: false });
      } else {
        setStepIndex((current) => Math.min(workflow.steps.length - 1, current + 1));
      }
    } catch (saveError) {
      setGenerateError(
        saveError instanceof Error ? saveError.message : "Unable to save this fact find step right now.",
      );
    } finally {
      setIsSavingStep(false);
    }
  }

  async function handleGenerateDocx() {
    setIsGeneratingDocx(true);
    setGenerateError(null);

    try {
      await saveCurrentStepIfNeeded();

      const response = await fetch("/api/wizards/fact-find/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clientId }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "Unable to generate the fact find document right now.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const fileNameMatch = disposition.match(/filename="?([^"]+)"?/i);
      const fileName = fileNameMatch?.[1] ?? "FactFind.docx";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (generationError) {
      setGenerateError(
        generationError instanceof Error
          ? generationError.message
          : "Unable to generate the fact find document right now.",
      );
    } finally {
      setIsGeneratingDocx(false);
    }
  }

  function renderRecordModalField(field: PopupField) {
    return (
      <label key={field.key} className={styles.modalField}>
        <span>{field.label}</span>
        {field.input === "select" ? (
          <select
            value={recordValues[field.key] ?? ""}
            onChange={(event) => updateRecordValue(field.key, event.target.value)}
          >
            <option value="">Select...</option>
            {(field.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={field.input === "date" ? "date" : "text"}
            inputMode={field.input === "currency" || field.input === "percentage" ? "decimal" : undefined}
            value={recordValues[field.key] ?? ""}
            onChange={(event) => updateRecordValue(field.key, event.target.value)}
            onBlur={() => formatRecordValueOnBlur(field)}
          />
        )}
      </label>
    );
  }

  return (
    <>
      <div className={styles.sectionHeader}>
        <h1 className={styles.title}>Fact Find</h1>
        <button
          type="button"
          className={styles.wizardPrimaryButton}
          onClick={() => void handleGenerateDocx()}
          disabled={isGeneratingDocx || isLoading || !!error}
        >
          {isGeneratingDocx ? "Generating..." : "Generate Fact Find Document"}
        </button>
      </div>

      {generateError ? (
        <div className={styles.actionNotice} role="alert">
          {generateError}
        </div>
      ) : null}

      <section className={styles.wizardsSection}>
        {isLoading ? (
          <div className={styles.emptyStateCard}>Loading the fact find workflow...</div>
        ) : error ? (
          <div className={styles.emptyStateCard}>{error}</div>
        ) : workflow && currentStep ? (
          <div className={styles.factFindWorkflowCard}>
            <div className={styles.factFindWorkflowHeader}>
              <div>
                <div className={styles.factFindEyebrow}>Update Fact Find</div>
                <h2 className={styles.factFindStepTitle}>{currentStep.title}</h2>
              </div>
              <div className={styles.factFindHeaderActions}>
                {currentStepPopupSection ? (
                  <button
                    type="button"
                    className={styles.factFindAddButton}
                    onClick={() => openRecordModal(currentStepPopupSection)}
                    disabled={isSavingStep || isGeneratingDocx || isSavingRecord}
                  >
                    <span aria-hidden="true">+</span>
                    Add {currentStep.title}
                  </button>
                ) : null}
                <div className={styles.factFindStepBadge}>
                  Step {stepIndex + 1} of {workflow.steps.length}
                </div>
              </div>
            </div>

            <div className={styles.factFindStepper}>
              {workflow.steps.map((step, index) => (
                <button
                  key={step.id}
                  type="button"
                  className={`${styles.factFindStepPill} ${index === stepIndex ? styles.factFindStepPillActive : ""}`.trim()}
                  onClick={() => setStepIndex(index)}
                >
                  {step.title}
                </button>
              ))}
            </div>

            {currentStep.editorCard ? renderEditorCard(currentStep.editorCard, updateStepField, riskProfileOptions) : null}
            {bulkDeleteError ? <p className={styles.modalError}>{bulkDeleteError}</p> : null}
            {currentDisplayCard
              ? renderDisplayCard(
                  currentDisplayCard,
                  openRecordModal,
                  openDeleteConfirm,
                  selectedRecordIds,
                  toggleRecordSelection,
                  toggleAllRecordSelection,
                  handleBulkDeleteRecords,
                  isBulkDeleting,
                )
              : null}

            <div className={styles.factFindWorkflowActions}>
              <button
                type="button"
                className={styles.wizardSecondaryButton}
                onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
                disabled={stepIndex === 0}
              >
                Back
              </button>
              <div className={styles.factFindWorkflowActionsRight}>
                <button
                  type="button"
                  className={styles.wizardSecondaryButton}
                  onClick={() => window.location.reload()}
                  disabled={isSavingStep || isGeneratingDocx}
                >
                  Refresh
                </button>
                <button
                  type="button"
                  className={styles.wizardPrimaryButton}
                  onClick={() => void handleNext()}
                  disabled={isSavingStep || isGeneratingDocx}
                >
                  {isSavingStep ? "Saving..." : isLastStep ? "Save" : "Next"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.emptyStateCard}>No fact find workflow is available for this client yet.</div>
        )}
      </section>

      {recordModal ? (
        <div className={styles.modalOverlay} role="presentation" onClick={closeRecordModal}>
          <div
            className={styles.modalCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="fact-find-record-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h2 id="fact-find-record-modal-title" className={styles.modalTitle}>
                {modalTitle(recordModal.section, Boolean(recordModal.recordId))}
              </h2>
              <button type="button" className={styles.modalClose} onClick={closeRecordModal} aria-label="Close">
                ×
              </button>
            </div>

            {recordModal.section === "insurance" ? (
              <div className={styles.modalSectionStack}>
                <div className={styles.modalGrid}>{recordModalFields.map(renderRecordModalField)}</div>
                <section className={styles.insuranceBenefitSection}>
                  <div className={styles.insuranceBenefitHeader}>
                    <strong>Benefits</strong>
                    <button type="button" className={styles.modalSecondary} onClick={addInsuranceBenefit}>
                      Add benefit
                    </button>
                  </div>
                  <div className={styles.insuranceBenefitTable}>
                    <div className={styles.insuranceBenefitTableHeader}>
                      <span>Cover Type</span>
                      <span>Sum Insured</span>
                      <span>Premium</span>
                      <span>Frequency</span>
                      <span />
                    </div>
                    {insuranceBenefits.map((benefit) => (
                      <div key={benefit.id} className={styles.insuranceBenefitRow}>
                        <select
                          value={benefit.coverRequired}
                          onChange={(event) => updateInsuranceBenefit(benefit.id, "coverRequired", event.target.value)}
                        >
                          <option value="">Select...</option>
                          {INSURANCE_COVER_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <input
                          value={benefit.sumInsured}
                          inputMode="decimal"
                          onChange={(event) => updateInsuranceBenefit(benefit.id, "sumInsured", event.target.value)}
                          onBlur={() => formatInsuranceBenefitCurrencyOnBlur(benefit.id, "sumInsured")}
                        />
                        <input
                          value={benefit.premiumAmount}
                          inputMode="decimal"
                          onChange={(event) => updateInsuranceBenefit(benefit.id, "premiumAmount", event.target.value)}
                          onBlur={() => formatInsuranceBenefitCurrencyOnBlur(benefit.id, "premiumAmount")}
                        />
                        <select
                          value={benefit.frequency}
                          onChange={(event) => updateInsuranceBenefit(benefit.id, "frequency", event.target.value)}
                        >
                          {FREQUENCY_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className={styles.insuranceBenefitRemoveButton}
                          onClick={() => removeInsuranceBenefit(benefit.id)}
                          disabled={insuranceBenefits.length === 1}
                          aria-label="Remove benefit"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            ) : (
              <div className={styles.modalGrid}>{recordModalFields.map(renderRecordModalField)}</div>
            )}

            {recordError ? <p className={styles.modalError}>{recordError}</p> : null}

            <div className={styles.modalActions}>
              <button type="button" className={styles.modalSecondary} onClick={closeRecordModal} disabled={isSavingRecord}>
                Cancel
              </button>
              <button type="button" className={styles.modalPrimary} onClick={() => void handleSaveRecordModal()} disabled={isSavingRecord}>
                {isSavingRecord ? "Saving..." : "Save record"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteConfirm ? (
        <div className={styles.modalOverlay} role="presentation" onClick={closeDeleteConfirm}>
          <div
            className={styles.confirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="fact-find-delete-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="fact-find-delete-title" className={styles.confirmTitle}>
              Delete record?
            </h2>
            <p className={styles.confirmText}>
              This will delete {deleteConfirm.label} from the client profile. This action cannot be undone.
            </p>
            {deleteError ? <p className={styles.modalError}>{deleteError}</p> : null}
            <div className={styles.confirmActions}>
              <button type="button" className={styles.modalSecondary} onClick={closeDeleteConfirm} disabled={isDeletingRecord}>
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.modalPrimary} ${styles.confirmDanger}`.trim()}
                onClick={() => void handleDeleteConfirmed()}
                disabled={isDeletingRecord}
              >
                {isDeletingRecord ? "Deleting..." : "Delete record"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
