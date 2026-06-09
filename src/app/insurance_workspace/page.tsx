"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ClientInsuranceRecord, ClientPolicyRecord, ClientProfile, InsurancePolicyRecord, PersonRecord, PolicyCoverRecord } from "@/lib/api/types";
import type {
  AdvicePersonV1,
  InsuranceAdvicePersonV1,
  InsuranceCurrentCoverBenefitV1,
  InsuranceCurrentPolicyReviewV1,
  InsuranceInsurabilityAssessmentV1,
  InsuranceNeedsAnalysisV1,
  InsuranceNeedsAnalysisLineItemV1,
  InsuranceNeedsAnalysisSourceItemV1,
  InsurancePolicyActionV1,
  InsurancePolicyCoverComponentV1,
  InsurancePolicyCoverTypeV1,
  InsurancePolicyOwnershipV1,
  InsurancePolicyOwnershipGroupV1,
  InsurancePolicyRecommendationV1,
  InsurancePolicyReplacementV1,
  InsuranceProductResearchOptionV1,
} from "@/lib/soa-types";
import {
  createEmptyInsuranceCurrentCoverReview,
  createEmptyInsuranceInsurabilityAssessment,
} from "@/lib/soa-insurance-advice";
import {
  INSURANCE_NEEDS_PROVISION_ITEMS,
  INSURANCE_NEEDS_REQUIREMENT_ITEMS,
  getInsuranceNeedsTotalsForPolicyType,
  normalizeInsuranceNeedsLineItems,
  type InsuranceNeedsCoverColumnKey,
} from "@/lib/soa-insurance-needs";
import { insuranceWorkspaceStorageKey } from "@/lib/insurance-workspace-storage";
import styles from "./insurance-workspace.module.css";

type InsuranceWorkspaceTab = "scenario-details" | "cashflow" | "assets-liabilities" | "superannuation" | "pensions";

type InsuranceWorkspaceState = {
  clientProfileId: string | null;
  clientName: string;
  people: AdvicePersonV1[];
  insuranceAdvice: InsuranceAdvicePersonV1[];
  activeTab: InsuranceWorkspaceTab;
  updatedAt: string;
};

type ClientProfileResponse = {
  profile?: ClientProfile;
  error?: string;
};

type ClientPoliciesResponse = {
  data?: ClientPolicyRecord[] | null;
  message?: string | null;
};

type InsuranceWorkspaceIntakeResponse = {
  people?: AdvicePersonV1[];
  clientName?: string;
  insuranceAdvice?: InsuranceAdvicePersonV1[];
  source?: "llm" | "fallback";
  model?: string | null;
  warning?: string | null;
  error?: string;
};

type NeedsPolicyType = (typeof needsCoverColumns)[number]["value"];

type NeedsRowEditorTarget = {
  category: "requirement" | "provision";
  key: NonNullable<InsuranceNeedsAnalysisLineItemV1["key"]>;
  title: string;
};

type NeedsSourceMatrixRow = {
  rowId: string;
  label: string;
  ownerLabel: string | null;
  included: boolean;
  sourceType: InsuranceNeedsAnalysisSourceItemV1["sourceType"];
  sourceRecordId: string | null;
  items: Partial<Record<NeedsPolicyType, InsuranceNeedsAnalysisSourceItemV1>>;
};

const inputTabs: Array<{ id: InsuranceWorkspaceTab; label: string; meaning: string }> = [
  { id: "scenario-details", label: "Client details", meaning: "Health, underwriting, and assumptions" },
  { id: "cashflow", label: "Current cover", meaning: "Current cover review" },
  { id: "assets-liabilities", label: "Needs analysis", meaning: "Insurance needs analysis" },
  { id: "superannuation", label: "Recommendations", meaning: "Product research and recommended policies" },
  { id: "pensions", label: "Replacement advice", meaning: "Replacement advice" },
];

const coverTypeOptions: Array<{ value: InsurancePolicyCoverTypeV1; label: string }> = [
  { value: "life", label: "Life" },
  { value: "tpd", label: "TPD" },
  { value: "trauma", label: "Trauma" },
  { value: "income-protection", label: "Income Protection" },
];

const needsCoverColumns: Array<{ value: "life" | "tpd" | "trauma" | "income-protection"; label: string }> = [
  { value: "life", label: "Life" },
  { value: "tpd", label: "TPD" },
  { value: "trauma", label: "Trauma" },
  { value: "income-protection", label: "IP (monthly)" },
];

const actionOptions: Array<{ value: InsurancePolicyActionV1; label: string }> = [
  { value: "retain-existing", label: "Retain" },
  { value: "vary-existing", label: "Vary" },
  { value: "replace-existing", label: "Replace" },
  { value: "apply-new", label: "Apply new" },
  { value: "cancel", label: "Cancel" },
  { value: "not-recommended", label: "No recommendation" },
];

const currentCoverActionOptions = actionOptions.filter((option) => option.value !== "apply-new" && option.value !== "not-recommended");

const healthDisclosureOptions: Array<{
  value: NonNullable<InsuranceInsurabilityAssessmentV1["healthDisclosureStatus"]>;
  label: string;
}> = [
  { value: "unknown", label: "Unknown" },
  { value: "not-discussed", label: "Not discussed" },
  { value: "no-concerns-disclosed", label: "No concerns disclosed" },
  { value: "concerns-disclosed", label: "Concerns disclosed" },
  { value: "requires-underwriting", label: "Requires underwriting" },
];

const abilityOptions: Array<{
  value: NonNullable<InsuranceInsurabilityAssessmentV1["abilityToObtainCover"]>;
  label: string;
}> = [
  { value: "unknown", label: "Unknown" },
  { value: "likely", label: "Likely" },
  { value: "needs-underwriting", label: "Needs underwriting" },
  { value: "restricted", label: "Restricted" },
  { value: "unlikely", label: "Unlikely" },
];

const premiumFrequencyOptions: Array<{
  value: NonNullable<InsuranceCurrentCoverBenefitV1["premiumFrequency"]>;
  label: string;
}> = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "half-yearly", label: "Half-yearly" },
  { value: "annually", label: "Annually" },
  { value: "unknown", label: "Unknown" },
];

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function stableId(prefix: string, seed: string | number | null | undefined) {
  const normalized = String(seed || prefix)
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${prefix}-${normalized || "item"}`;
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return "-";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

function amountInputValue(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "";
  return money(value);
}

function rawAmountInputValue(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "";
  return String(value);
}

function CurrencyInput({
  value,
  onValueChange,
  placeholder = "$0",
  ariaLabel,
}: {
  value: number | null | undefined;
  onValueChange: (value: number | null) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [draftValue, setDraftValue] = useState(rawAmountInputValue(value));

  useEffect(() => {
    if (!isFocused) setDraftValue(rawAmountInputValue(value));
  }, [isFocused, value]);

  return (
    <input
      aria-label={ariaLabel}
      inputMode="decimal"
      placeholder={placeholder}
      value={isFocused ? draftValue : amountInputValue(value)}
      onFocus={() => {
        setIsFocused(true);
        setDraftValue(rawAmountInputValue(value));
      }}
      onChange={(event) => {
        setDraftValue(event.target.value);
        onValueChange(event.target.value.trim() ? numberValue(event.target.value) : null);
      }}
      onBlur={() => setIsFocused(false)}
    />
  );
}

function splitLines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function joinLines(value: string[] | null | undefined) {
  return (value ?? []).join("\n");
}

function coverAmountLabel(cover: InsurancePolicyCoverComponentV1) {
  const amount = cover.coverType === "income-protection" ? cover.monthlyBenefit : cover.sumInsured;
  return money(amount);
}

function ownershipGroupPremiumTotal(group: InsurancePolicyOwnershipGroupV1) {
  return group.covers.reduce((total, cover) => total + (cover.premiumAmount ?? 0), 0);
}

function recommendationPremiumTotal(policy: InsurancePolicyRecommendationV1) {
  return policy.ownershipGroups.reduce((total, group) => total + ownershipGroupPremiumTotal(group), 0);
}

function annualisedBenefitPremium(benefit: { premiumAmount?: number | null; premiumFrequency?: InsuranceCurrentCoverBenefitV1["premiumFrequency"] }) {
  return annualisePremium(benefit.premiumAmount, benefit.premiumFrequency ?? "unknown") ?? 0;
}

function currentPolicySnapshot(policy: InsuranceCurrentPolicyReviewV1): InsurancePolicyReplacementV1["currentPolicy"] {
  const benefitPremiumTotal = policy.benefits.reduce((total, benefit) => total + annualisedBenefitPremium(benefit), 0);
  const fallbackPremium = policy.annualisedPremium ?? annualisePremium(policy.premiumAmount, policy.premiumFrequency ?? "unknown");

  return {
    insurer: policy.insurerName ?? null,
    policyName: policy.policyName ?? policy.productName ?? null,
    policyNumber: policy.policyNumber ?? null,
    totalLifeCover: policy.benefits.reduce((total, benefit) => total + (benefit.coverType === "life" ? benefit.sumInsured ?? 0 : 0), 0),
    totalTpdCover: policy.benefits.reduce((total, benefit) => total + (benefit.coverType === "tpd" ? benefit.sumInsured ?? 0 : 0), 0),
    totalTraumaCover: policy.benefits.reduce((total, benefit) => total + (benefit.coverType === "trauma" ? benefit.sumInsured ?? 0 : 0), 0),
    totalIncomeProtectionCover: policy.benefits.reduce((total, benefit) => total + (benefit.coverType === "income-protection" ? benefit.monthlyBenefit ?? 0 : 0), 0),
    totalAnnualPremium: benefitPremiumTotal || fallbackPremium || null,
  };
}

function recommendedPolicySnapshot(policy: InsurancePolicyRecommendationV1): InsurancePolicyReplacementV1["recommendedPolicy"] {
  const covers = policy.ownershipGroups.flatMap((group) => group.covers);
  const benefitPremiumTotal = covers.reduce((total, cover) => total + annualisedBenefitPremium(cover), 0);
  const fallbackPremium = policy.ownershipGroups.reduce((total, group) => total + (group.annualisedPremium ?? annualisePremium(group.premiumAmount, group.premiumFrequency ?? "unknown") ?? 0), 0);

  return {
    insurer: policy.insurerName ?? null,
    policyName: policy.policyName ?? policy.productName ?? null,
    policyNumber: policy.policyNumber ?? null,
    totalLifeCover: covers.reduce((total, cover) => total + (cover.coverType === "life" ? cover.sumInsured ?? 0 : 0), 0),
    totalTpdCover: covers.reduce((total, cover) => total + (cover.coverType === "tpd" ? cover.sumInsured ?? 0 : 0), 0),
    totalTraumaCover: covers.reduce((total, cover) => total + (cover.coverType === "trauma" ? cover.sumInsured ?? 0 : 0), 0),
    totalIncomeProtectionCover: covers.reduce((total, cover) => total + (cover.coverType === "income-protection" ? cover.monthlyBenefit ?? 0 : 0), 0),
    totalAnnualPremium: benefitPremiumTotal || fallbackPremium || null,
  };
}

function policySnapshotLabel(snapshot: InsurancePolicyReplacementV1["currentPolicy"]) {
  return [snapshot.insurer, snapshot.policyName, snapshot.policyNumber].filter(Boolean).join(" - ") || "Policy";
}

function getNeedsAmountKey(coverType: (typeof needsCoverColumns)[number]["value"]): InsuranceNeedsCoverColumnKey {
  return coverType === "income-protection" ? "incomeProtection" : coverType;
}

function sourceItemAmountTotal(items: InsuranceNeedsAnalysisSourceItemV1[]) {
  return items.reduce((total, item) => (item.included === false ? total : total + (item.amount ?? 0)), 0);
}

function sourceItemAmountTotalForCover(items: InsuranceNeedsAnalysisSourceItemV1[], coverType: NeedsPolicyType) {
  return items.reduce((total, item) => {
    if (item.included === false || item.coverType !== coverType) return total;
    return total + (item.amount ?? 0);
  }, 0);
}

function sourceItemMatrixLabel(label: string) {
  return label
    .replace(/\s+-\s+(Life|TPD|Trauma|Income Protection|IP \(monthly\))$/i, "")
    .trim() || "Needs analysis item";
}

function sourceItemMatrixRowKey(item: InsuranceNeedsAnalysisSourceItemV1) {
  return [
    item.sourceType ?? "manual",
    item.sourceRecordId ?? sourceItemMatrixLabel(item.label),
  ].join(":");
}

function sourceItemMatrixRows(items: InsuranceNeedsAnalysisSourceItemV1[]): NeedsSourceMatrixRow[] {
  const rows = new Map<string, NeedsSourceMatrixRow>();

  for (const item of items) {
    const rowId = sourceItemMatrixRowKey(item);
    const row = rows.get(rowId) ?? {
      rowId,
      label: sourceItemMatrixLabel(item.label),
      ownerLabel: item.ownerLabel ?? null,
      included: item.included !== false,
      sourceType: item.sourceType ?? null,
      sourceRecordId: item.sourceRecordId ?? null,
      items: {},
    };
    if (!row.ownerLabel && item.ownerLabel) row.ownerLabel = item.ownerLabel;
    row.included = row.included || item.included !== false;
    if (item.coverType) row.items[item.coverType] = item;
    rows.set(rowId, row);
  }

  return [...rows.values()];
}

function personName(person?: PersonRecord | null, fallback = "Client") {
  return textValue(person?.name) || fallback;
}

function personHealthNotes(person?: PersonRecord | null) {
  return [
    textValue(person?.healthStatus || person?.health_status),
    textValue(person?.healthHistory || person?.health_history),
    textValue(person?.smoker) ? `Smoker status: ${textValue(person?.smoker)}` : "",
  ].filter(Boolean).join("\n");
}

function peopleFromProfile(profile: ClientProfile): AdvicePersonV1[] {
  const people: AdvicePersonV1[] = [
    {
      personId: "client",
      role: "client",
      fullName: personName(profile.client, "Client"),
    },
  ];

  if (textValue(profile.partner?.name)) {
    people.push({
      personId: "partner",
      role: "partner",
      fullName: personName(profile.partner, "Partner"),
    });
  }

  return people;
}

function ownerIdsForInsurance(record: ClientInsuranceRecord, people: AdvicePersonV1[]) {
  if (record.joint && people.length > 1) return people.map((person) => person.personId);
  const ownerName = textValue(record.owner?.name).toLowerCase();
  const matched = people.find((person) => {
    const name = person.fullName.toLowerCase();
    return ownerName && (name === ownerName || name.includes(ownerName) || ownerName.includes(name));
  });
  return [matched?.personId ?? people[0]?.personId ?? "client"];
}

function coverTypeFromText(value: string): InsurancePolicyCoverTypeV1 {
  const normalized = value.toLowerCase();
  if (/income|ip|salary continuance/.test(normalized)) return "income-protection";
  if (/trauma|critical/.test(normalized)) return "trauma";
  if (/\btpd\b|disable/.test(normalized)) return "tpd";
  if (/life|death/.test(normalized)) return "life";
  return "life";
}

function premiumFrequencyFromText(value: string): InsuranceCurrentCoverBenefitV1["premiumFrequency"] {
  const normalized = value.toLowerCase();
  if (/week/.test(normalized)) return "weekly";
  if (/fortnight/.test(normalized)) return "fortnightly";
  if (/quarter/.test(normalized)) return "quarterly";
  if (/half|semi/.test(normalized)) return "half-yearly";
  if (/annual|year/.test(normalized)) return "annually";
  if (/month/.test(normalized)) return "monthly";
  return "unknown";
}

function annualisePremium(amount: number | null | undefined, frequency: InsuranceCurrentCoverBenefitV1["premiumFrequency"]) {
  if (!Number.isFinite(amount ?? NaN)) return null;

  switch (frequency) {
    case "weekly":
      return (amount ?? 0) * 52;
    case "fortnightly":
      return (amount ?? 0) * 26;
    case "monthly":
      return (amount ?? 0) * 12;
    case "quarterly":
      return (amount ?? 0) * 4;
    case "half-yearly":
      return (amount ?? 0) * 2;
    case "annually":
      return amount ?? 0;
    default:
      return null;
  }
}

function benefitFromPolicyDetail(detail: InsurancePolicyRecord, index: number): InsuranceCurrentCoverBenefitV1 {
  const premiumFrequency = premiumFrequencyFromText(
    textValue(detail.premiumFrequency?.type) || textValue(detail.premiumFrequency?.value),
  );

  return {
    benefitId: stableId("benefit", detail.id || `${detail.coverType}-${index}`),
    coverType: coverTypeFromText(`${detail.coverType ?? ""} ${detail.benefitType ?? ""}`),
    details: textValue(detail.benefitType) || null,
    sumInsured: coverTypeFromText(`${detail.coverType ?? ""} ${detail.benefitType ?? ""}`) === "income-protection"
      ? null
      : numberValue(detail.sumInsured),
    monthlyBenefit: coverTypeFromText(`${detail.coverType ?? ""} ${detail.benefitType ?? ""}`) === "income-protection"
      ? numberValue(detail.sumInsured)
      : null,
    premiumAmount: numberValue(detail.premiumAmount),
    premiumFrequency,
    waitingPeriod: textValue(detail.waitingPeriod) || null,
    benefitPeriod: textValue(detail.benefitPeriod) || null,
    status: null,
    exclusionsOrLoadings: null,
    notes: null,
  };
}

function benefitFromNestedCover(cover: PolicyCoverRecord, policyId: string | null | undefined, index: number): InsuranceCurrentCoverBenefitV1 {
  const coverType = coverTypeFromText(cover.coverType ?? "");

  return {
    benefitId: stableId("benefit", `${policyId ?? "policy"}-${cover.id ?? cover.coverType ?? index}`),
    coverType,
    details: textValue(cover.coverType) || null,
    sumInsured: coverType === "income-protection" ? null : numberValue(cover.sumInsured),
    monthlyBenefit: coverType === "income-protection" ? numberValue(cover.sumInsured) : null,
    premiumAmount: numberValue(cover.premiumAmount),
    premiumFrequency: premiumFrequencyFromText(cover.premiumFrequency ?? ""),
    waitingPeriod: null,
    benefitPeriod: null,
    status: null,
    exclusionsOrLoadings: null,
    notes: null,
  };
}

function benefitFromFlatInsurance(record: ClientInsuranceRecord, index: number): InsuranceCurrentCoverBenefitV1 {
  const coverType = coverTypeFromText(record.coverRequired ?? "");
  return {
    benefitId: stableId("benefit", record.id || `${record.coverRequired}-${index}`),
    coverType,
    details: textValue(record.coverRequired) || null,
    sumInsured: coverType === "income-protection" ? null : numberValue(record.sumInsured),
    monthlyBenefit: coverType === "income-protection" ? numberValue(record.sumInsured) : null,
    premiumAmount: numberValue(record.premiumAmount),
    premiumFrequency: premiumFrequencyFromText(textValue(record.frequency?.type) || textValue(record.frequency?.value)),
    waitingPeriod: null,
    benefitPeriod: null,
    status: record.status ?? null,
    exclusionsOrLoadings: null,
    notes: null,
  };
}

function personIdFromOwnerName(ownerName: string | null | undefined, people: AdvicePersonV1[]) {
  const normalizedOwnerName = textValue(ownerName).toLowerCase();
  const matchedPerson = people.find((person) => {
    const normalizedPersonName = person.fullName.toLowerCase();
    return normalizedOwnerName && (normalizedPersonName === normalizedOwnerName || normalizedPersonName.includes(normalizedOwnerName) || normalizedOwnerName.includes(normalizedPersonName));
  });

  return matchedPerson?.personId ?? people[0]?.personId ?? "client";
}

function personIdFromProfileClientId(clientId: string | null | undefined, profile: ClientProfile) {
  const normalizedClientId = textValue(clientId).toLowerCase();
  if (!normalizedClientId) return null;

  if (textValue(profile.client?.id).toLowerCase() === normalizedClientId) return "client";
  if (textValue(profile.partner?.id).toLowerCase() === normalizedClientId) return "partner";

  return null;
}

function policyBelongsToPerson(policy: InsuranceCurrentPolicyReviewV1, personId: string) {
  return policy.insuredPersonId === personId || policy.ownerPersonIds.includes(personId);
}

function policyOwnershipFromLinkedSuper(linkedSuperFund: string | null | undefined): InsurancePolicyOwnershipV1 {
  const normalized = textValue(linkedSuperFund).toLowerCase();
  if (!normalized || normalized === "held personally") return "outside-super";
  if (/smsf/.test(normalized)) return "smsf";
  return "inside-super";
}

function ownerPersonIdsFromRecord(
  record: {
    joint?: boolean | null;
    owner?: { id?: string | null; name?: string | null } | null;
    clientId?: string | null;
    ownerId?: string | null;
  },
  people: AdvicePersonV1[],
  profile?: ClientProfile,
) {
  if (record.joint && people.length > 1) return people.map((person) => person.personId);
  const profileMatchedOwner = profile
    ? personIdFromProfileClientId(record.owner?.id ?? record.clientId ?? record.ownerId, profile)
    : null;
  if (profileMatchedOwner) return [profileMatchedOwner];
  return [personIdFromOwnerName(record.owner?.name, people)];
}

function ownerLabelFromPersonIds(ownerPersonIds: string[], people: AdvicePersonV1[]) {
  return ownerPersonIds
    .map((personId) => people.find((person) => person.personId === personId)?.fullName)
    .filter(Boolean)
    .join(" & ") || null;
}

function sourceItemsForPerson<TRecord>(
  records: TRecord[] | null | undefined,
  people: AdvicePersonV1[],
  personId: string,
  sourceType: NonNullable<InsuranceNeedsAnalysisSourceItemV1["sourceType"]>,
  amount: (record: TRecord) => number,
  label: (record: TRecord, index: number) => string,
  owners: (record: TRecord) => string[],
  sourceRecordId: (record: TRecord, index: number) => string | null | undefined,
): InsuranceNeedsAnalysisSourceItemV1[] {
  return (records ?? []).flatMap((record, index) => {
    const ownerPersonIds = owners(record);
    if (!ownerPersonIds.includes(personId)) return [];
    const value = amount(record);
    if (!value) return [];
    return [{
      sourceItemId: stableId(`needs-source-${sourceType}`, sourceRecordId(record, index) ?? `${personId}-${index}`),
      label: label(record, index),
      ownerLabel: ownerLabelFromPersonIds(ownerPersonIds, people),
      amount: value,
      included: true,
      coverType: null,
      sourceType,
      sourceRecordId: sourceRecordId(record, index) ?? null,
    }];
  });
}

function isAvailableInvestmentAsset(record: ClientProfile["assets"] extends Array<infer TAsset> | null | undefined ? TAsset : never) {
  const text = [record.type, record.assetType, record.description].map(textValue).join(" ").toLowerCase();
  if (!text) return false;
  if (
    /\b(primary[-\s]?residence|principal[-\s]?residence|main[-\s]?residence|family[-\s]?home)\b/.test(text) ||
    /\b(home|house)\b/.test(text)
  ) {
    return false;
  }
  if (/\b(car|vehicle|motor vehicle|boat|contents|personal effects|household)\b/.test(text)) return false;
  return true;
}

function coverAmountForNeeds(benefit: InsuranceCurrentCoverBenefitV1, coverType: InsurancePolicyCoverTypeV1) {
  if (benefit.coverType !== coverType) return 0;
  return coverType === "income-protection" ? benefit.monthlyBenefit ?? 0 : benefit.sumInsured ?? 0;
}

function sourceItemsForExistingCover(advice: InsuranceAdvicePersonV1, people: AdvicePersonV1[], policyType: NeedsPolicyType): InsuranceNeedsAnalysisSourceItemV1[] {
  return advice.currentCoverReview.policies.filter((policy) => policyBelongsToPerson(policy, advice.personId)).flatMap((policy, policyIndex) => {
    const value = policy.benefits.reduce((total, benefit) => total + coverAmountForNeeds(benefit, policyType), 0);
    if (!value) return [];
    const ownerPersonIds = policy.ownerPersonIds.length ? policy.ownerPersonIds : [policy.insuredPersonId ?? advice.personId];
    const policyRecordId = policy.policyId || `${advice.personId}-policy-${policyIndex}`;

    return [{
      sourceItemId: stableId("needs-source-existing-cover", `${policyRecordId}-${policyType}`),
      label: policy.insurerName || policy.policyName || policy.productName || `Policy ${policyIndex + 1}`,
      ownerLabel: ownerLabelFromPersonIds(ownerPersonIds.filter(Boolean) as string[], people),
      amount: value,
      included: true,
      coverType: policyType,
      sourceType: "existing-cover",
      sourceRecordId: policyRecordId,
    }];
  });
}

function seededLineItem(
  analysisId: string,
  key: InsuranceNeedsAnalysisLineItemV1["key"],
  category: InsuranceNeedsAnalysisLineItemV1["category"],
  title: string,
  amountKey: InsuranceNeedsCoverColumnKey,
  value: number | null,
  sourceItems: InsuranceNeedsAnalysisSourceItemV1[] | null = null,
): InsuranceNeedsAnalysisLineItemV1 {
  return {
    itemId: `${analysisId}-${key}`,
    key,
    category,
    title,
    sourceItems,
    life: amountKey === "life" ? value : null,
    tpd: amountKey === "tpd" ? value : null,
    trauma: amountKey === "trauma" ? value : null,
    incomeProtection: amountKey === "incomeProtection" ? value : null,
  };
}

function createProfileSeededNeedsAnalysis(
  profile: ClientProfile,
  advice: InsuranceAdvicePersonV1,
  people: AdvicePersonV1[],
  policyType: "life" | "tpd" | "trauma" | "income-protection",
): InsuranceNeedsAnalysisV1 {
  const amountKey = policyType === "income-protection" ? "incomeProtection" : policyType;
  const analysisId = stableId("needs", `${advice.personId}-${policyType}`);
  const liabilitySourceItems = sourceItemsForPerson(
    profile.liabilities,
    people,
    advice.personId,
    "liability",
    (record) => numberValue(record.outstandingBalance),
    (record, index) => textValue(record.loanType) || textValue(record.bankName) || `Liability ${index + 1}`,
    (record) => ownerPersonIdsFromRecord(record, people, profile),
    (record, index) => record.id ?? `${record.bankName ?? "liability"}-${record.loanType ?? index}`,
  );
  const liabilitiesToRepay = sourceItemAmountTotal(liabilitySourceItems);
  const matchingPolicies = advice.currentCoverReview.policies.filter((policy) => policyBelongsToPerson(policy, advice.personId));
  const existingCoverAmount = matchingPolicies.reduce(
    (total, policy) => total + policy.benefits.reduce((policyTotal, benefit) => policyTotal + coverAmountForNeeds(benefit, policyType), 0),
    0,
  );
  const existingCoverSourceItems = sourceItemsForExistingCover(advice, people, policyType);
  const superannuationSourceItems = policyType === "income-protection"
    ? []
    : sourceItemsForPerson(
        profile.superannuation,
        people,
        advice.personId,
        "superannuation",
        (record) => numberValue(record.balance),
        (record, index) => textValue(record.superFund) || `Superannuation ${index + 1}`,
        (record) => ownerPersonIdsFromRecord(record, people, profile),
        (record, index) => record.id ?? `${record.superFund ?? "super"}-${index}`,
      );
  const superannuationBalance = policyType === "income-protection"
    ? 0
    : sourceItemAmountTotal(superannuationSourceItems);
  const assetSourceItems = policyType === "income-protection"
    ? []
    : sourceItemsForPerson(
        (profile.assets ?? []).filter(isAvailableInvestmentAsset),
        people,
        advice.personId,
        "asset",
        (record) => numberValue(record.currentValue),
        (record, index) => textValue(record.description) || textValue(record.assetType) || textValue(record.type) || `Asset ${index + 1}`,
        (record) => ownerPersonIdsFromRecord(record, people, profile),
        (record, index) => record.id ?? `${record.description ?? record.assetType ?? "asset"}-${index}`,
      );
  const otherAssetsAvailable = policyType === "income-protection"
    ? 0
    : sourceItemAmountTotal(assetSourceItems);

  const requirements = INSURANCE_NEEDS_REQUIREMENT_ITEMS.map((item) =>
    seededLineItem(
      analysisId,
      item.key,
      "requirement",
      item.title,
      amountKey,
      item.key === "debt-repayment" && policyType !== "income-protection" ? liabilitiesToRepay : null,
      item.key === "debt-repayment" && policyType !== "income-protection" ? liabilitySourceItems : null,
    ),
  );
  const provisions = INSURANCE_NEEDS_PROVISION_ITEMS.map((item) =>
    seededLineItem(
      analysisId,
      item.key,
      "provision",
      item.title,
      amountKey,
      item.key === "existing-cover"
        ? existingCoverAmount
        : item.key === "superannuation-balance"
          ? superannuationBalance
          : item.key === "available-assets"
            ? otherAssetsAvailable
            : null,
      item.key === "existing-cover"
        ? existingCoverSourceItems
        : item.key === "superannuation-balance"
          ? superannuationSourceItems
          : item.key === "available-assets"
            ? assetSourceItems
            : null,
    ),
  );

  return {
    analysisId,
    ownerPersonIds: [advice.personId],
    policyType,
    methodology: policyType === "income-protection" ? "income-replacement" : "capital-needs",
    purpose: "Seeded from current client profile data.",
    inputs: {
      annualIncome: null,
      annualLivingExpenses: null,
      liabilitiesToRepay: policyType === "income-protection" ? null : liabilitiesToRepay,
      dependantsCount: null,
      dependantSupportYears: null,
      educationCosts: null,
      existingCoverAmount,
      superannuationBalance,
      emergencyReserve: null,
      otherAssetsAvailable,
      waitingPeriodMonths: null,
      benefitPeriodYears: null,
      notes: "Imported from fact find profile data. Review and adjust before relying on the analysis.",
    },
    outputs: {
      targetCoverAmount: null,
      coverGapAmount: null,
      suggestedWaitingPeriod: null,
      suggestedBenefitPeriod: null,
      suggestedPolicyOwnership: "unknown",
      suggestedStructureNotes: null,
    },
    requirements,
    provisions,
    rationale: null,
  };
}

function policyFromNestedPolicy(policy: ClientPolicyRecord, people: AdvicePersonV1[], profile: ClientProfile, index: number): InsuranceCurrentPolicyReviewV1 {
  const ownerPersonId = personIdFromProfileClientId(policy.clientId, profile) ?? personIdFromOwnerName(policy.policyOwner, people);
  const benefits = (policy.covers ?? []).map((cover, coverIndex) => benefitFromNestedCover(cover, policy.id, coverIndex));
  const premiumFrequency = benefits[0]?.premiumFrequency ?? "unknown";
  const totalPremium = benefits.reduce((total, benefit) => total + (benefit.premiumAmount ?? 0), 0);
  const linkedSuperFund = textValue(policy.linkedSuperFund) || null;

  return {
    policyId: stableId("policy", policy.id || `${policy.insurer}-${policy.policyNumber}-${index}`),
    ownerPersonIds: [ownerPersonId],
    insuredPersonId: ownerPersonId,
    insurerName: textValue(policy.insurer) || null,
    productName: null,
    policyName: textValue(policy.insurer) || "Existing policy",
    policyNumber: textValue(policy.policyNumber) || null,
    ownership: policyOwnershipFromLinkedSuper(policy.linkedSuperFund),
    fundingSource: linkedSuperFund,
    linkedSuperFund,
    status: textValue(policy.status) || "Existing",
    premiumAmount: totalPremium || null,
    premiumFrequency,
    annualisedPremium: annualisePremium(totalPremium, premiumFrequency),
    benefits,
    exclusionsOrLoadings: null,
    retainabilityNotes: null,
    variationOptions: null,
    replacementRiskNotes: null,
    sourceEvidence: "Imported from current client profile insurance policies.",
  };
}

function policyFromInsuranceRecord(record: ClientInsuranceRecord, people: AdvicePersonV1[], index: number): InsuranceCurrentPolicyReviewV1 {
  const ownerPersonIds = ownerIdsForInsurance(record, people);
  const details = record.policyDetails ?? [];
  const benefits = details.length
    ? details.map(benefitFromPolicyDetail)
    : [benefitFromFlatInsurance(record, index)];
  const firstDetail = details[0] ?? null;

  return {
    policyId: stableId("policy", record.id || `${record.insurer}-${index}`),
    ownerPersonIds,
    insuredPersonId: ownerPersonIds[0] ?? null,
    insurerName: textValue(record.insurer) || textValue(firstDetail?.insurerName) || null,
    productName: null,
    policyName: textValue(record.insurer) || textValue(firstDetail?.insurerName) || "Existing policy",
    policyNumber: null,
    ownership: textValue(record.superFund?.type) || textValue(firstDetail?.heldSuper) ? "inside-super" : "unknown",
    fundingSource: textValue(record.superFund?.type) || null,
    linkedSuperFund: textValue(record.superFund?.type) || null,
    status: textValue(record.status) || "Existing",
    premiumAmount: numberValue(record.premiumAmount),
    premiumFrequency: premiumFrequencyFromText(textValue(record.frequency?.type) || textValue(record.frequency?.value)),
    annualisedPremium: null,
    benefits,
    exclusionsOrLoadings: null,
    retainabilityNotes: null,
    variationOptions: null,
    replacementRiskNotes: null,
    sourceEvidence: "Imported from current client profile insurance records.",
  };
}

function baseAdvicePerson(person: AdvicePersonV1, profile: ClientProfile): InsuranceAdvicePersonV1 {
  const relatedPerson = person.role === "partner" ? profile.partner : profile.client;
  return {
    adviceId: stableId("insurance-advice", person.personId),
    personId: person.personId,
    currentCoverReview: createEmptyInsuranceCurrentCoverReview(),
    insurabilityAssessment: {
      ...createEmptyInsuranceInsurabilityAssessment(),
      healthNotes: personHealthNotes(relatedPerson) || null,
    },
    needsAnalyses: [],
    productResearchOptions: [],
    recommendations: [],
    replacementAnalyses: [],
  };
}

function mapClientProfileToInsuranceWorkspace(profile: ClientProfile, nestedPolicies: ClientPolicyRecord[] = []): InsuranceWorkspaceState {
  const people = peopleFromProfile(profile);
  const adviceByPerson = new Map(people.map((person) => [person.personId, baseAdvicePerson(person, profile)]));

  if (nestedPolicies.length) {
    nestedPolicies.forEach((record, index) => {
      const policy = policyFromNestedPolicy(record, people, profile, index);
      const personId = policy.insuredPersonId ?? people[0]?.personId ?? "client";
      const advice = adviceByPerson.get(personId) ?? adviceByPerson.get("client");
      advice?.currentCoverReview.policies.push(policy);
    });
  } else {
    (profile.insurance ?? []).forEach((record, index) => {
      const policy = policyFromInsuranceRecord(record, people, index);
      const personId = policy.insuredPersonId ?? people[0]?.personId ?? "client";
      const advice = adviceByPerson.get(personId) ?? adviceByPerson.get("client");
      advice?.currentCoverReview.policies.push(policy);
    });
  }

  for (const advice of adviceByPerson.values()) {
    advice.needsAnalyses = needsCoverColumns.map((column) =>
      createProfileSeededNeedsAnalysis(profile, advice, people, column.value),
    );

    if (advice.currentCoverReview.policies.length) {
      advice.currentCoverReview.summary = "Review current cover and decide whether each benefit should be retained, varied, replaced, or cancelled.";
    }
  }

  return {
    clientProfileId: profile.id ?? null,
    clientName: people.map((person) => person.fullName).join(" & ") || "Client",
    people,
    insuranceAdvice: Array.from(adviceByPerson.values()),
    activeTab: "scenario-details",
    updatedAt: new Date().toISOString(),
  };
}

function emptyWorkspace(clientId: string | null): InsuranceWorkspaceState {
  const people = [{ personId: "client", role: "client" as const, fullName: "Selected client" }];
  return {
    clientProfileId: clientId,
    clientName: "Selected client",
    people,
    insuranceAdvice: [
      {
        adviceId: "insurance-advice-client",
        personId: "client",
        currentCoverReview: createEmptyInsuranceCurrentCoverReview(),
        insurabilityAssessment: createEmptyInsuranceInsurabilityAssessment(),
        needsAnalyses: [],
        productResearchOptions: [],
        recommendations: [],
        replacementAnalyses: [],
      },
    ],
    activeTab: "scenario-details",
    updatedAt: new Date().toISOString(),
  };
}

function InsuranceWorkspaceContent() {
  const searchParams = useSearchParams();
  const linkedClientId = (searchParams.get("clientId") ?? searchParams.get("clientid"))?.trim() || null;
  const workspaceStorageKey = useMemo(() => insuranceWorkspaceStorageKey(linkedClientId), [linkedClientId]);
  const [workspace, setWorkspace] = useState<InsuranceWorkspaceState>(() => emptyWorkspace(linkedClientId));
  const [activePersonId, setActivePersonId] = useState("client");
  const [loadStatus, setLoadStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [loadMessage, setLoadMessage] = useState<string | null>(null);
  const [intakeStatus, setIntakeStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [intakeMessage, setIntakeMessage] = useState<string | null>(null);
  const [addOptionPicker, setAddOptionPicker] = useState<"closed" | "type" | "existing">("closed");
  const [needsRowEditor, setNeedsRowEditor] = useState<NeedsRowEditorTarget | null>(null);
  const [needsRowEditorItems, setNeedsRowEditorItems] = useState<InsuranceNeedsAnalysisSourceItemV1[]>([]);
  const activeAdvice = workspace.insuranceAdvice.find((entry) => entry.personId === activePersonId) ?? workspace.insuranceAdvice[0];
  const activeTab = workspace.activeTab;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(workspaceStorageKey);
    if (!raw) return;

    try {
      const stored = JSON.parse(raw) as InsuranceWorkspaceState;
      if (Array.isArray(stored.people) && Array.isArray(stored.insuranceAdvice)) {
        setWorkspace(stored);
        setActivePersonId(stored.people[0]?.personId ?? "client");
        setLoadStatus("loaded");
      }
    } catch {
      // Start fresh if the local workspace state is unreadable.
    }
  }, [workspaceStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(workspaceStorageKey, JSON.stringify({ ...workspace, updatedAt: new Date().toISOString() }));
  }, [workspace, workspaceStorageKey]);

  function updateWorkspace(updater: (draft: InsuranceWorkspaceState) => void) {
    setWorkspace((current) => {
      const draft = structuredClone(current) as InsuranceWorkspaceState;
      updater(draft);
      draft.updatedAt = new Date().toISOString();
      return draft;
    });
  }

  function updateActiveAdvice(updater: (draft: InsuranceAdvicePersonV1) => void) {
    updateWorkspace((draft) => {
      const advice = draft.insuranceAdvice.find((entry) => entry.personId === activePersonId) ?? draft.insuranceAdvice[0];
      if (advice) updater(advice);
    });
  }

  async function importClientProfile() {
    if (!linkedClientId) {
      setLoadStatus("error");
      setLoadMessage("Open the insurance workspace from a client record before importing profile data.");
      return;
    }

    setLoadStatus("loading");
    setLoadMessage(null);

    try {
      const response = await fetch(`/api/finley/soa/client-profile?clientId=${encodeURIComponent(linkedClientId)}`, {
        method: "GET",
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as ClientProfileResponse | null;
      if (!response.ok || !body?.profile) {
        throw new Error(body?.error ?? "Unable to load the client profile.");
      }

      const policiesResponse = await fetch(`/api/insurance/${encodeURIComponent(linkedClientId)}/policies`, { cache: "no-store" });
      const policiesBody = (await policiesResponse.json().catch(() => null)) as ClientPoliciesResponse | null;
      const nestedPolicies = policiesResponse.ok ? policiesBody?.data ?? [] : [];
      const nextWorkspace = mapClientProfileToInsuranceWorkspace(body.profile, nestedPolicies);
      setWorkspace(nextWorkspace);
      setActivePersonId(nextWorkspace.people[0]?.personId ?? "client");
      setLoadStatus("loaded");
      setLoadMessage(
        nestedPolicies.length
          ? `Client profile insurance data loaded into the workspace (${nestedPolicies.length} current policies).`
          : "Client profile insurance data loaded into the workspace.",
      );
    } catch (error) {
      setLoadStatus("error");
      setLoadMessage(error instanceof Error ? error.message : "Unable to import the client profile.");
    }
  }

  async function generateInsuranceIntake() {
    if (!linkedClientId) {
      setIntakeStatus("error");
      setIntakeMessage("Open the insurance workspace from a client record before generating insurance intake.");
      return;
    }

    setIntakeStatus("loading");
    setIntakeMessage(null);

    try {
      const response = await fetch("/api/finley/insurance-workspace/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          clientId: linkedClientId,
          adviserInstruction:
            "Draft the insurance workspace from the selected client profile. Where insurance evidence is incomplete, leave notes for adviser confirmation.",
          workspaceContext: {
            clientName: workspace.clientName,
            people: workspace.people,
            insuranceAdvice: workspace.insuranceAdvice,
          },
        }),
      });
      const body = (await response.json().catch(() => null)) as InsuranceWorkspaceIntakeResponse | null;
      if (!response.ok || !body?.insuranceAdvice?.length || !body.people?.length) {
        throw new Error(body?.error ?? "Finley could not generate the insurance workspace intake.");
      }

      setWorkspace((current) => ({
        ...current,
        clientProfileId: linkedClientId,
        clientName: body.clientName ?? current.clientName,
        people: body.people ?? current.people,
        insuranceAdvice: body.insuranceAdvice ?? current.insuranceAdvice,
        activeTab: "scenario-details",
        updatedAt: new Date().toISOString(),
      }));
      setActivePersonId(body.people[0]?.personId ?? "client");
      setIntakeStatus("loaded");
      setIntakeMessage(
        body.warning
          ? `Generated insurance workspace with a warning: ${body.warning}`
          : `Generated insurance workspace from ${body.source === "llm" ? "Finley intake" : "local fallback intake"}.`,
      );
    } catch (error) {
      setIntakeStatus("error");
      setIntakeMessage(error instanceof Error ? error.message : "Unable to generate insurance workspace intake.");
    }
  }

  function addCurrentPolicy() {
    updateActiveAdvice((draft) => {
      draft.currentCoverReview.policies.push({
        policyId: makeId("policy"),
        ownerPersonIds: [draft.personId],
        insuredPersonId: draft.personId,
        insurerName: null,
        productName: null,
        policyName: "New current policy",
        policyNumber: null,
        ownership: "unknown",
        fundingSource: null,
        linkedSuperFund: null,
        status: "Existing",
        premiumAmount: null,
        premiumFrequency: "monthly",
        annualisedPremium: null,
        benefits: [],
        exclusionsOrLoadings: null,
        retainabilityNotes: null,
        variationOptions: null,
        replacementRiskNotes: null,
        sourceEvidence: null,
      });
    });
  }

  function updateCurrentPolicy(policyId: string, updater: (policy: InsuranceCurrentPolicyReviewV1) => void) {
    updateActiveAdvice((draft) => {
      const policy = draft.currentCoverReview.policies.find((entry) => entry.policyId === policyId);
      if (policy) updater(policy);
    });
  }

  function addCurrentBenefit(policyId: string) {
    updateCurrentPolicy(policyId, (policy) => {
      policy.benefits.push({
        benefitId: makeId("benefit"),
        coverType: "life",
        details: null,
        sumInsured: null,
        monthlyBenefit: null,
        premiumAmount: null,
        premiumFrequency: "monthly",
        waitingPeriod: null,
        benefitPeriod: null,
        status: "Existing",
        exclusionsOrLoadings: null,
        notes: null,
      });
    });
  }

  function updateCurrentBenefit(policyId: string, benefitId: string, updater: (benefit: InsuranceCurrentCoverBenefitV1) => void) {
    updateCurrentPolicy(policyId, (policy) => {
      const benefit = policy.benefits.find((entry) => entry.benefitId === benefitId);
      if (benefit) updater(benefit);
    });
  }

  function createNeedsAnalysis(policyType: (typeof needsCoverColumns)[number]["value"]): InsuranceNeedsAnalysisV1 {
    const analysisId = makeId("needs");
    const createLineItem = (
      item: (typeof INSURANCE_NEEDS_REQUIREMENT_ITEMS | typeof INSURANCE_NEEDS_PROVISION_ITEMS)[number],
      category: "requirement" | "provision",
    ) => ({
      itemId: `${analysisId}-${item.key}`,
      key: item.key,
      category,
      title: item.title,
      life: null,
      tpd: null,
      trauma: null,
      incomeProtection: null,
    });

    return {
      analysisId,
      ownerPersonIds: [activePersonId],
      policyType,
      methodology: policyType === "income-protection" ? "income-replacement" : "capital-needs",
      purpose: "",
      inputs: {
        annualIncome: null,
        annualLivingExpenses: null,
        liabilitiesToRepay: null,
        dependantsCount: null,
        dependantSupportYears: null,
        educationCosts: null,
        existingCoverAmount: null,
        superannuationBalance: null,
        emergencyReserve: null,
        otherAssetsAvailable: null,
        waitingPeriodMonths: null,
        benefitPeriodYears: null,
        notes: null,
      },
      outputs: {
        targetCoverAmount: null,
        coverGapAmount: null,
        suggestedWaitingPeriod: null,
        suggestedBenefitPeriod: null,
        suggestedPolicyOwnership: "unknown",
        suggestedStructureNotes: null,
      },
      requirements: INSURANCE_NEEDS_REQUIREMENT_ITEMS.map((item) => createLineItem(item, "requirement")),
      provisions: INSURANCE_NEEDS_PROVISION_ITEMS.map((item) => createLineItem(item, "provision")),
      rationale: null,
    };
  }

  function syncNeedsAnalysisTotals(analysis: InsuranceNeedsAnalysisV1): InsuranceNeedsAnalysisV1 {
    const totals = getInsuranceNeedsTotalsForPolicyType(analysis);

    return {
      ...analysis,
      inputs: {
        ...analysis.inputs,
        existingCoverAmount: totals.existingCoverAmount,
      },
      outputs: {
        ...analysis.outputs,
        targetCoverAmount: totals.targetCoverAmount,
        coverGapAmount: totals.coverGapAmount,
      },
    };
  }

  function addNeedsAnalysis(policyType: (typeof needsCoverColumns)[number]["value"]) {
    updateActiveAdvice((draft) => {
      draft.needsAnalyses.push(createNeedsAnalysis(policyType));
    });
  }

  function updateNeedsAnalysis(analysisId: string, updater: (analysis: InsuranceNeedsAnalysisV1) => void) {
    updateActiveAdvice((draft) => {
      const analysis = draft.needsAnalyses.find((entry) => entry.analysisId === analysisId);
      if (analysis) updater(analysis);
    });
  }

  function updateNeedsLineItemAmount(
    analysisId: string,
    category: "requirement" | "provision",
    itemId: string,
    amountKey: InsuranceNeedsCoverColumnKey,
    amount: number | null,
  ) {
    updateActiveAdvice((draft) => {
      draft.needsAnalyses = draft.needsAnalyses.map((entry) => {
        if (entry.analysisId !== analysisId) return entry;

        const normalized = normalizeInsuranceNeedsLineItems(entry);
        const nextEntry: InsuranceNeedsAnalysisV1 = {
          ...entry,
          requirements: category === "requirement"
            ? normalized.requirements.map((item) => (item.itemId === itemId ? { ...item, [amountKey]: amount } : item))
            : normalized.requirements,
          provisions: category === "provision"
            ? normalized.provisions.map((item) => (item.itemId === itemId ? { ...item, [amountKey]: amount } : item))
            : normalized.provisions,
        };

        return syncNeedsAnalysisTotals(nextEntry);
      });
    });
  }

  function collectNeedsRowSourceItems(target: NeedsRowEditorTarget): InsuranceNeedsAnalysisSourceItemV1[] {
    if (!activeAdvice) return [];
    const seen = new Set<string>();
    const collected: InsuranceNeedsAnalysisSourceItemV1[] = [];

    for (const analysis of activeAdvice.needsAnalyses) {
      const normalized = normalizeInsuranceNeedsLineItems(analysis);
      const lineItems = target.category === "requirement" ? normalized.requirements : normalized.provisions;
      const lineItem = lineItems.find((entry) => entry.key === target.key);
      const amountKey = getNeedsAmountKey(analysis.policyType as NeedsPolicyType);
      const existingAmount = lineItem?.[amountKey] ?? null;

      for (const sourceItem of lineItem?.sourceItems ?? []) {
        const coverType = sourceItem.coverType ?? analysis.policyType as NeedsPolicyType;
        const sourceItemId = `${sourceItem.sourceItemId}-${coverType}`;
        if (seen.has(sourceItemId)) continue;
        seen.add(sourceItemId);
        collected.push({
          ...sourceItem,
          sourceItemId,
          label: sourceItemMatrixLabel(sourceItem.label),
          ownerLabel: sourceItem.ownerLabel ?? null,
          coverType,
        });
      }

      if (!lineItem?.sourceItems?.length && existingAmount) {
        const coverType = analysis.policyType as NeedsPolicyType;
        const sourceItemId = stableId("needs-source-manual", `${target.key}-${coverType}`);
        if (!seen.has(sourceItemId)) {
          seen.add(sourceItemId);
          collected.push({
            sourceItemId,
            label: target.title,
            amount: existingAmount,
            ownerLabel: null,
            included: true,
            coverType,
            sourceType: "manual",
            sourceRecordId: null,
          });
        }
      }
    }

    return collected;
  }

  function openNeedsRowEditor(target: NeedsRowEditorTarget) {
    setNeedsRowEditor(target);
    setNeedsRowEditorItems(collectNeedsRowSourceItems(target));
  }

  function applyNeedsRowEditor() {
    if (!needsRowEditor) return;
    const items = needsRowEditorItems.map((item) => ({
      ...item,
      label: item.label.trim() || "Needs analysis item",
      amount: item.amount ?? 0,
    }));

    updateActiveAdvice((draft) => {
      draft.needsAnalyses = draft.needsAnalyses.map((entry) => {
        const normalized = normalizeInsuranceNeedsLineItems(entry);
        const amountKey = getNeedsAmountKey(entry.policyType as NeedsPolicyType);
        const nextValue = sourceItemAmountTotalForCover(items, entry.policyType as NeedsPolicyType);
        const nextSourceItems = items.filter((item) => item.coverType === entry.policyType);

        const updateLineItem = (lineItem: InsuranceNeedsAnalysisLineItemV1) =>
          lineItem.key === needsRowEditor.key
            ? { ...lineItem, [amountKey]: nextValue, sourceItems: nextSourceItems }
            : lineItem;

        const nextEntry: InsuranceNeedsAnalysisV1 = {
          ...entry,
          requirements: needsRowEditor.category === "requirement"
            ? normalized.requirements.map(updateLineItem)
            : normalized.requirements,
          provisions: needsRowEditor.category === "provision"
            ? normalized.provisions.map(updateLineItem)
            : normalized.provisions,
        };

        return syncNeedsAnalysisTotals(nextEntry);
      });
    });
    setNeedsRowEditor(null);
    setNeedsRowEditorItems([]);
  }

  function updateNeedsEditorItem(sourceItemId: string, updater: (item: InsuranceNeedsAnalysisSourceItemV1) => InsuranceNeedsAnalysisSourceItemV1) {
    setNeedsRowEditorItems((items) => items.map((item) => (item.sourceItemId === sourceItemId ? updater(item) : item)));
  }

  function updateNeedsEditorRow(rowId: string, updater: (item: InsuranceNeedsAnalysisSourceItemV1) => InsuranceNeedsAnalysisSourceItemV1) {
    setNeedsRowEditorItems((items) => items.map((item) => (sourceItemMatrixRowKey(item) === rowId ? updater(item) : item)));
  }

  function updateNeedsEditorMatrixAmount(row: NeedsSourceMatrixRow, coverType: NeedsPolicyType, amount: number | null) {
    const existing = row.items[coverType];
    if (existing) {
      updateNeedsEditorItem(existing.sourceItemId, (draft) => ({
        ...draft,
        amount,
        coverType,
      }));
      return;
    }

    setNeedsRowEditorItems((items) => [
      ...items,
      {
        sourceItemId: `${makeId("needs-source")}-${coverType}`,
        label: row.label,
        ownerLabel: row.ownerLabel,
        amount,
        included: row.included,
        coverType,
        sourceType: row.sourceType ?? "manual",
        sourceRecordId: row.sourceRecordId,
      },
    ]);
  }

  function addNeedsEditorItem() {
    const rowId = makeId("needs-source");
    setNeedsRowEditorItems((items) => [
      ...items,
      ...needsCoverColumns.map((column): InsuranceNeedsAnalysisSourceItemV1 => ({
        sourceItemId: `${rowId}-${column.value}`,
        label: "New item",
        ownerLabel: null,
        amount: 0,
        included: true,
        coverType: column.value,
        sourceType: "manual",
        sourceRecordId: rowId,
      })),
    ]);
  }

  function addVariationRecommendationFromCurrentPolicy(currentPolicyId: string) {
    updateActiveAdvice((draft) => {
      const currentPolicy = draft.currentCoverReview.policies.find((policy) => policy.policyId === currentPolicyId);
      if (!currentPolicy) return;

      const optionId = makeId("option");
      const premiumFrequency = currentPolicy.premiumFrequency ?? "monthly";
      const benefitPremiumTotal = currentPolicy.benefits.reduce((total, benefit) => total + (benefit.premiumAmount ?? 0), 0);
      const premiumAmount = benefitPremiumTotal || currentPolicy.premiumAmount || null;
      const annualisedPremium = benefitPremiumTotal || currentPolicy.annualisedPremium || annualisePremium(premiumAmount, premiumFrequency);

      draft.productResearchOptions.push({
        optionId,
        insurerName: currentPolicy.insurerName,
        productName: currentPolicy.policyName ?? currentPolicy.productName,
        ownership: currentPolicy.ownership ?? "unknown",
        actionConsidered: "vary-existing",
        coverSummary: currentPolicy.benefits
          .map((benefit) => `${coverTypeOptions.find((option) => option.value === benefit.coverType)?.label ?? benefit.coverType} ${coverAmountLabel({
            coverId: benefit.benefitId,
            coverType: benefit.coverType,
            details: benefit.details,
            premiumType: "stepped",
            sumInsured: benefit.sumInsured ?? null,
            monthlyBenefit: benefit.monthlyBenefit ?? null,
            premiumAmount: benefit.premiumAmount ?? null,
            premiumFrequency: benefit.premiumFrequency ?? premiumFrequency,
            waitingPeriod: benefit.waitingPeriod ?? null,
            benefitPeriod: benefit.benefitPeriod ?? null,
          })}`)
          .join("; "),
        premiumAmount,
        premiumFrequency,
        annualisedPremium,
        keyFeatures: [],
        limitations: [],
        rationale: "Existing policy selected for variation.",
        status: "current",
        sourceEvidence: currentPolicy.sourceEvidence,
      });

      draft.recommendations.push({
        policyRecommendationId: makeId("recommended-policy"),
        insuredPersonId: currentPolicy.insuredPersonId ?? draft.personId,
        action: "vary-existing",
        insurerName: currentPolicy.insurerName,
        productName: currentPolicy.productName,
        policyName: currentPolicy.policyName ?? currentPolicy.productName ?? "Existing policy variation",
        policyNumber: currentPolicy.policyNumber ?? null,
        recommendationText: "Vary the existing policy as detailed below.",
        ownershipGroups: [
          {
            groupId: makeId("ownership"),
            ownership: currentPolicy.ownership ?? "unknown",
            fundingSource: currentPolicy.fundingSource ?? currentPolicy.linkedSuperFund ?? null,
            premiumFrequency,
            premiumAmount,
            annualisedPremium,
            covers: currentPolicy.benefits.map((benefit) => ({
              coverId: makeId("cover"),
              coverType: benefit.coverType,
              details: benefit.details,
              premiumType: "stepped",
              sumInsured: benefit.sumInsured ?? null,
              monthlyBenefit: benefit.monthlyBenefit ?? null,
              premiumAmount: benefit.premiumAmount ?? null,
              premiumFrequency: benefit.premiumFrequency ?? premiumFrequency,
              waitingPeriod: benefit.waitingPeriod ?? null,
              benefitPeriod: benefit.benefitPeriod ?? null,
            })),
          },
        ],
        optionalBenefits: [],
        premiumBreakdown: [],
        underwritingNotes: currentPolicy.exclusionsOrLoadings ?? null,
        replacementNotes: currentPolicy.replacementRiskNotes ?? null,
        sourceFileName: null,
        sourceEvidence: `product-option:${optionId}`,
      });
    });
  }

  function updateRecommendedPolicy(policyId: string, updater: (policy: InsurancePolicyRecommendationV1) => void) {
    updateActiveAdvice((draft) => {
      const policy = draft.recommendations.find((entry) => entry.policyRecommendationId === policyId);
      if (policy) updater(policy);
    });
  }

  function updateOwnershipGroup(policyId: string, groupId: string, updater: (group: InsurancePolicyOwnershipGroupV1) => void) {
    updateRecommendedPolicy(policyId, (policy) => {
      const group = policy.ownershipGroups.find((entry) => entry.groupId === groupId);
      if (group) updater(group);
    });
  }

  function syncRecommendedPolicyPremiums(policy: InsurancePolicyRecommendationV1, draft: InsuranceAdvicePersonV1) {
    for (const group of policy.ownershipGroups) {
      const premiumTotal = ownershipGroupPremiumTotal(group);
      group.premiumAmount = premiumTotal;
      group.annualisedPremium = premiumTotal;
    }

    const linkedOptionId = policy.sourceEvidence?.startsWith("product-option:")
      ? policy.sourceEvidence.replace("product-option:", "")
      : null;
    if (!linkedOptionId) return;

    const linkedOption = draft.productResearchOptions.find((option) => option.optionId === linkedOptionId);
    if (!linkedOption) return;

    const premiumTotal = recommendationPremiumTotal(policy);
    linkedOption.premiumAmount = premiumTotal;
    linkedOption.annualisedPremium = premiumTotal;
  }

  function addRecommendedCover(policyId: string, groupId: string) {
    updateActiveAdvice((draft) => {
      const policy = draft.recommendations.find((entry) => entry.policyRecommendationId === policyId);
      const group = policy?.ownershipGroups.find((entry) => entry.groupId === groupId);
      if (!policy || !group) return;

      group.covers.push({
          coverId: makeId("cover"),
          coverType: "life",
          details: null,
          premiumType: "stepped",
          sumInsured: null,
          monthlyBenefit: null,
          premiumAmount: null,
          premiumFrequency: group.premiumFrequency ?? "monthly",
          waitingPeriod: null,
          benefitPeriod: null,
      });

      syncRecommendedPolicyPremiums(policy, draft);
    });
  }

  function updateRecommendedCover(
    policyId: string,
    groupId: string,
    coverId: string,
    updater: (cover: InsurancePolicyCoverComponentV1) => void,
  ) {
    updateActiveAdvice((draft) => {
      const policy = draft.recommendations.find((entry) => entry.policyRecommendationId === policyId);
      const group = policy?.ownershipGroups.find((entry) => entry.groupId === groupId);
      const cover = group?.covers.find((entry) => entry.coverId === coverId);
      if (cover) updater(cover);
      if (policy) syncRecommendedPolicyPremiums(policy, draft);
    });
  }

  function addProductResearchOption() {
    updateActiveAdvice((draft) => {
      const optionId = makeId("option");

      draft.productResearchOptions.push({
        optionId,
        insurerName: null,
        productName: null,
        ownership: "unknown",
        actionConsidered: "apply-new",
        coverSummary: null,
        premiumAmount: null,
        premiumFrequency: "monthly",
        annualisedPremium: null,
        keyFeatures: [],
        limitations: [],
        underwritingAssumptions: null,
        status: "recommended",
        rationale: null,
        sourceEvidence: null,
      });

      draft.recommendations.push({
        policyRecommendationId: makeId("recommended-policy"),
        insuredPersonId: draft.personId,
        action: "apply-new",
        insurerName: null,
        productName: null,
        policyName: "New recommended policy",
        policyNumber: null,
        recommendationText: null,
        ownershipGroups: [
          {
            groupId: makeId("ownership"),
            ownership: "unknown",
            fundingSource: null,
            premiumFrequency: "monthly",
            premiumAmount: null,
            annualisedPremium: null,
            covers: [],
          },
        ],
        optionalBenefits: [],
        premiumBreakdown: [],
        underwritingNotes: null,
        replacementNotes: null,
        sourceFileName: null,
        sourceEvidence: `product-option:${optionId}`,
      });
    });
  }

  function updateProductOption(optionId: string, updater: (option: InsuranceProductResearchOptionV1) => void) {
    updateActiveAdvice((draft) => {
      const option = draft.productResearchOptions.find((entry) => entry.optionId === optionId);
      if (!option) return;

      updater(option);

      const linkedRecommendation = draft.recommendations.find((entry) => entry.sourceEvidence === `product-option:${optionId}`);
      if (!linkedRecommendation) return;

      linkedRecommendation.action = option.actionConsidered ?? "apply-new";
      linkedRecommendation.insurerName = option.insurerName ?? null;
      linkedRecommendation.productName = option.productName ?? null;
      linkedRecommendation.policyName = option.productName ?? option.insurerName ?? "New recommended policy";
      linkedRecommendation.recommendationText = option.rationale ?? null;
      for (const group of linkedRecommendation.ownershipGroups) {
        group.ownership = option.ownership ?? group.ownership;
        group.premiumFrequency = option.premiumFrequency ?? group.premiumFrequency;
        group.premiumAmount = option.premiumAmount ?? group.premiumAmount;
        group.annualisedPremium = option.annualisedPremium ?? group.annualisedPremium;
      }
    });
  }

  function addReplacementAnalysis() {
    updateActiveAdvice((draft) => {
      const currentPolicy = draft.currentCoverReview.policies.find((policy) => policy.retainabilityNotes === "replace-existing") ?? null;
      const recommendedPolicy = draft.recommendations.find((policy) => policy.action === "apply-new") ?? null;
      const currentSnapshot = currentPolicy ? currentPolicySnapshot(currentPolicy) : {};
      const recommendedSnapshot = recommendedPolicy ? recommendedPolicySnapshot(recommendedPolicy) : {};
      const premiumDifference = (recommendedSnapshot.totalAnnualPremium ?? 0) - (currentSnapshot.totalAnnualPremium ?? 0);

      draft.replacementAnalyses.push({
        replacementId: makeId("replacement"),
        ownerPersonId: draft.personId,
        currentPolicyId: currentPolicy?.policyId ?? null,
        recommendedPolicyRecommendationId: recommendedPolicy?.policyRecommendationId ?? null,
        currentPolicy: currentSnapshot,
        recommendedPolicy: recommendedSnapshot,
        premiumDifference: currentPolicy || recommendedPolicy ? premiumDifference : null,
        reasons: ["To be confirmed"],
        costs: [],
        benefitsGained: [],
        benefitsLost: [],
        notes: null,
        linkedPolicyRecommendationIds: recommendedPolicy ? [recommendedPolicy.policyRecommendationId] : [],
      });
    });
  }

  function updateReplacementAnalysis(replacementId: string, updater: (replacement: InsurancePolicyReplacementV1) => void) {
    updateActiveAdvice((draft) => {
      const replacement = draft.replacementAnalyses.find((entry) => entry.replacementId === replacementId);
      if (replacement) updater(replacement);
    });
  }

  function renderPersonTabs() {
    if (workspace.people.length <= 1) return null;

    return (
      <div className={styles.personTabs} aria-label="Insured person tabs">
        {workspace.people.map((person) => (
          <button
            key={person.personId}
            type="button"
            className={person.personId === activePersonId ? styles.personTabActive : styles.personTab}
            onClick={() => setActivePersonId(person.personId)}
          >
            {person.fullName}
          </button>
        ))}
      </div>
    );
  }

  function renderScenarioDetails() {
    if (!activeAdvice) return null;
    const assessment = activeAdvice.insurabilityAssessment;

    return (
      <div className={styles.sectionStack}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h4>Insurability and underwriting notes</h4>
              <p>Capture the considerations that affect whether new or replacement cover is practical.</p>
            </div>
          </div>
          <div className={styles.formGrid}>
            <label>
              Health disclosure status
              <select
                value={assessment.healthDisclosureStatus ?? "unknown"}
                onChange={(event) => updateActiveAdvice((draft) => {
                  draft.insurabilityAssessment.healthDisclosureStatus = event.target.value as InsuranceInsurabilityAssessmentV1["healthDisclosureStatus"];
                })}
              >
                {healthDisclosureOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              Ability to obtain cover
              <select
                value={assessment.abilityToObtainCover ?? "unknown"}
                onChange={(event) => updateActiveAdvice((draft) => {
                  draft.insurabilityAssessment.abilityToObtainCover = event.target.value as InsuranceInsurabilityAssessmentV1["abilityToObtainCover"];
                })}
              >
                {abilityOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className={styles.wideField}>
              Health notes
              <textarea
                value={assessment.healthNotes ?? ""}
                onChange={(event) => updateActiveAdvice((draft) => {
                  draft.insurabilityAssessment.healthNotes = event.target.value;
                })}
              />
            </label>
            <label>
              Occupation notes
              <textarea
                value={assessment.occupationNotes ?? ""}
                onChange={(event) => updateActiveAdvice((draft) => {
                  draft.insurabilityAssessment.occupationNotes = event.target.value;
                })}
              />
            </label>
            <label>
              Exclusions, loadings, or underwriting concerns
              <textarea
                value={assessment.underwritingConcerns ?? ""}
                onChange={(event) => updateActiveAdvice((draft) => {
                  draft.insurabilityAssessment.underwritingConcerns = event.target.value;
                })}
              />
            </label>
            <label className={styles.wideField}>
              Adviser assessment
              <textarea
                value={assessment.adviserAssessment ?? ""}
                onChange={(event) => updateActiveAdvice((draft) => {
                  draft.insurabilityAssessment.adviserAssessment = event.target.value;
                })}
              />
            </label>
          </div>
        </section>
      </div>
    );
  }

  function renderCurrentCover() {
    if (!activeAdvice) return null;

    return (
      <div className={styles.sectionStack}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h4>Current cover review</h4>
              <p>Review existing policies and decide whether each benefit should be retained, varied, replaced, or cancelled.</p>
            </div>
            <button type="button" className={styles.secondaryButton} onClick={addCurrentPolicy}>Add policy</button>
          </div>
          <label className={styles.fullWidthLabel}>
            Review summary
            <textarea
              value={activeAdvice.currentCoverReview.summary ?? ""}
              onChange={(event) => updateActiveAdvice((draft) => {
                draft.currentCoverReview.summary = event.target.value;
              })}
            />
          </label>
          {activeAdvice.currentCoverReview.policies.length ? (
            activeAdvice.currentCoverReview.policies.map((policy) => (
              <div key={policy.policyId} className={styles.subCard}>
                <div className={styles.inlineGrid}>
                  <label>
                    Insurer
                    <input
                      value={policy.insurerName ?? ""}
                      onChange={(event) => updateCurrentPolicy(policy.policyId, (draft) => {
                        draft.insurerName = event.target.value;
                      })}
                    />
                  </label>
                  <label>
                    Policy / product
                    <input
                      value={policy.policyName ?? policy.productName ?? ""}
                      onChange={(event) => updateCurrentPolicy(policy.policyId, (draft) => {
                        draft.policyName = event.target.value;
                      })}
                    />
                  </label>
                  <label>
                    Policy number
                    <input
                      value={policy.policyNumber ?? ""}
                      onChange={(event) => updateCurrentPolicy(policy.policyId, (draft) => {
                        draft.policyNumber = event.target.value;
                      })}
                    />
                  </label>
                  <label>
                    Action
                    <select
                      value={policy.retainabilityNotes ?? "retain-existing"}
                      onChange={(event) => updateCurrentPolicy(policy.policyId, (draft) => {
                        draft.retainabilityNotes = event.target.value;
                      })}
                    >
                      {currentCoverActionOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className={styles.tableToolbar}>
                  <strong>Benefits</strong>
                  <button type="button" className={styles.smallButton} onClick={() => addCurrentBenefit(policy.policyId)}>Add benefit</button>
                </div>
                <div className={styles.tableWrap}>
                  <table className={`${styles.dataTable} ${styles.coverTable}`}>
                    <thead>
                      <tr>
                        <th>Cover</th>
                        <th>Sum insured / benefit</th>
                        <th>Premium</th>
                        <th>Frequency</th>
                        <th>Waiting</th>
                        <th>Benefit period</th>
                        <th>Notes</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {policy.benefits.map((benefit) => (
                        <tr key={benefit.benefitId}>
                          <td>
                            <select
                              value={benefit.coverType}
                              onChange={(event) => updateCurrentBenefit(policy.policyId, benefit.benefitId, (draft) => {
                                draft.coverType = event.target.value as InsurancePolicyCoverTypeV1;
                              })}
                            >
                              {coverTypeOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <CurrencyInput
                              value={benefit.coverType === "income-protection" ? benefit.monthlyBenefit : benefit.sumInsured}
                              onValueChange={(amount) => updateCurrentBenefit(policy.policyId, benefit.benefitId, (draft) => {
                                if (draft.coverType === "income-protection") draft.monthlyBenefit = amount;
                                else draft.sumInsured = amount;
                              })}
                            />
                          </td>
                          <td>
                            <CurrencyInput
                              value={benefit.premiumAmount}
                              onValueChange={(amount) => updateCurrentBenefit(policy.policyId, benefit.benefitId, (draft) => {
                                draft.premiumAmount = amount;
                              })}
                            />
                          </td>
                          <td>
                            <select
                              value={benefit.premiumFrequency ?? "unknown"}
                              onChange={(event) => updateCurrentBenefit(policy.policyId, benefit.benefitId, (draft) => {
                                draft.premiumFrequency = event.target.value as NonNullable<InsuranceCurrentCoverBenefitV1["premiumFrequency"]>;
                              })}
                            >
                              {premiumFrequencyOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              value={benefit.waitingPeriod ?? ""}
                              onChange={(event) => updateCurrentBenefit(policy.policyId, benefit.benefitId, (draft) => {
                                draft.waitingPeriod = event.target.value;
                              })}
                            />
                          </td>
                          <td>
                            <input
                              value={benefit.benefitPeriod ?? ""}
                              onChange={(event) => updateCurrentBenefit(policy.policyId, benefit.benefitId, (draft) => {
                                draft.benefitPeriod = event.target.value;
                              })}
                            />
                          </td>
                          <td>
                            <input
                              value={benefit.notes ?? ""}
                              onChange={(event) => updateCurrentBenefit(policy.policyId, benefit.benefitId, (draft) => {
                                draft.notes = event.target.value;
                              })}
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className={styles.iconButton}
                              onClick={() => updateCurrentPolicy(policy.policyId, (draft) => {
                                draft.benefits = draft.benefits.filter((entry) => entry.benefitId !== benefit.benefitId);
                              })}
                              aria-label="Delete benefit"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!policy.benefits.length ? (
                        <tr><td colSpan={8}>No benefits recorded.</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          ) : (
            <div className={styles.emptyState}>No current policies recorded.</div>
          )}
        </section>
      </div>
    );
  }

  function renderNeedsAnalysis() {
    if (!activeAdvice) return null;
    const analysisByCover = new Map(
      needsCoverColumns.map((column) => [
        column.value,
        activeAdvice.needsAnalyses.find((analysis) => analysis.policyType === column.value) ?? null,
      ]),
    );
    const totals = activeAdvice.needsAnalyses.reduce(
      (nextTotals, analysis) => {
        const normalized = normalizeInsuranceNeedsLineItems(analysis);
        for (const column of needsCoverColumns) {
          const amountKey = getNeedsAmountKey(column.value);
          nextTotals.required[amountKey] += normalized.requiredTotals[amountKey];
          nextTotals.provisions[amountKey] += normalized.provisionTotals[amountKey];
          nextTotals.gap[amountKey] += normalized.coverGapTotals[amountKey];
        }
        return nextTotals;
      },
      {
        required: { life: 0, tpd: 0, trauma: 0, incomeProtection: 0 },
        provisions: { life: 0, tpd: 0, trauma: 0, incomeProtection: 0 },
        gap: { life: 0, tpd: 0, trauma: 0, incomeProtection: 0 },
      },
    );

    return (
      <div className={styles.sectionStack}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h4>Insurance needs analysis</h4>
              <p>Review the calculated needs, existing provisions and resulting cover gaps for each cover type.</p>
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table className={`${styles.dataTable} ${styles.needsMatrix}`}>
              <thead>
                <tr>
                  <th>Item</th>
                  {needsCoverColumns.map((column) => (
                    <th key={column.value}>{column.label}</th>
                  ))}
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                <tr className={styles.subheadingRow}>
                  <td colSpan={6}>Requirements</td>
                </tr>
                {INSURANCE_NEEDS_REQUIREMENT_ITEMS.map((item) => (
                  <tr key={`requirement-${item.key}`}>
                    <td>{item.title}</td>
                    {needsCoverColumns.map((column) => {
                      const analysis = analysisByCover.get(column.value);
                      const lineItem = analysis
                        ? normalizeInsuranceNeedsLineItems(analysis).requirements.find((entry) => entry.key === item.key)
                        : null;
                      const amountKey = getNeedsAmountKey(column.value);
                      return (
                        <td key={`${item.key}-${column.value}`}>
                          {analysis && lineItem ? (
                            <CurrencyInput
                              value={lineItem[amountKey]}
                              onValueChange={(amount) =>
                                updateNeedsLineItemAmount(
                                  analysis.analysisId,
                                  "requirement",
                                  lineItem.itemId,
                                  amountKey,
                                  amount,
                                )
                              }
                            />
                          ) : (
                            <button type="button" className={styles.inlineAddButton} onClick={() => addNeedsAnalysis(column.value)}>
                              Add
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td>
                      <button
                        type="button"
                        className={styles.neutralIconButton}
                        onClick={() => openNeedsRowEditor({ category: "requirement", key: item.key, title: item.title })}
                        aria-label={`Edit ${item.title}`}
                        title={`Edit ${item.title}`}
                      >
                        ✎
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className={styles.totalRow}>
                  <td>Total cover required</td>
                  {needsCoverColumns.map((column) => {
                    const amountKey = getNeedsAmountKey(column.value);
                    return <td key={`required-total-${column.value}`}>{money(totals.required[amountKey])}</td>;
                  })}
                  <td />
                </tr>
                <tr className={styles.subheadingRow}>
                  <td colSpan={6}>Provisions</td>
                </tr>
                {INSURANCE_NEEDS_PROVISION_ITEMS.map((item) => (
                  <tr key={`provision-${item.key}`}>
                    <td>{item.title}</td>
                    {needsCoverColumns.map((column) => {
                      const analysis = analysisByCover.get(column.value);
                      const lineItem = analysis
                        ? normalizeInsuranceNeedsLineItems(analysis).provisions.find((entry) => entry.key === item.key)
                        : null;
                      const amountKey = getNeedsAmountKey(column.value);
                      return (
                        <td key={`${item.key}-${column.value}`}>
                          {analysis && lineItem ? (
                            <CurrencyInput
                              value={lineItem[amountKey]}
                              onValueChange={(amount) =>
                                updateNeedsLineItemAmount(
                                  analysis.analysisId,
                                  "provision",
                                  lineItem.itemId,
                                  amountKey,
                                  amount,
                                )
                              }
                            />
                          ) : (
                            "-"
                          )}
                        </td>
                      );
                    })}
                    <td>
                      <button
                        type="button"
                        className={styles.neutralIconButton}
                        onClick={() => openNeedsRowEditor({ category: "provision", key: item.key, title: item.title })}
                        aria-label={`Edit ${item.title}`}
                        title={`Edit ${item.title}`}
                      >
                        ✎
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className={styles.totalRow}>
                  <td>Total provisions</td>
                  {needsCoverColumns.map((column) => {
                    const amountKey = getNeedsAmountKey(column.value);
                    return <td key={`provision-total-${column.value}`}>{money(totals.provisions[amountKey])}</td>;
                  })}
                  <td />
                </tr>
                <tr className={styles.totalRow}>
                  <td>Total cover gap</td>
                  {needsCoverColumns.map((column) => {
                    const amountKey = getNeedsAmountKey(column.value);
                    return <td key={`gap-total-${column.value}`}>{money(totals.gap[amountKey])}</td>;
                  })}
                  <td />
                </tr>
                <tr>
                  <td>Policy ownership</td>
                  {needsCoverColumns.map((column) => {
                    const analysis = analysisByCover.get(column.value);
                    return (
                      <td key={`ownership-${column.value}`}>
                        {analysis ? (
                          <select
                            value={analysis.outputs.suggestedPolicyOwnership ?? "unknown"}
                            onChange={(event) =>
                              updateNeedsAnalysis(analysis.analysisId, (draft) => {
                                draft.outputs.suggestedPolicyOwnership =
                                  event.target.value as NonNullable<InsuranceNeedsAnalysisV1["outputs"]["suggestedPolicyOwnership"]>;
                              })
                            }
                          >
                            <option value="super">Super</option>
                            <option value="retail">Personal</option>
                            <option value="either">Either</option>
                            <option value="unknown">Unknown</option>
                          </select>
                        ) : (
                          "-"
                        )}
                      </td>
                    );
                  })}
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  function renderRecommendedPolicies() {
    if (!activeAdvice) return null;
    const variationPolicyOptions = activeAdvice.currentCoverReview.policies.filter((policy) => policy.retainabilityNotes === "vary-existing");
    const productOptionPremium = (option: InsuranceProductResearchOptionV1) => {
      const linkedRecommendation = activeAdvice.recommendations.find((policy) => policy.sourceEvidence === `product-option:${option.optionId}`);
      return linkedRecommendation ? recommendationPremiumTotal(linkedRecommendation) : option.annualisedPremium ?? option.premiumAmount ?? 0;
    };

    return (
      <div className={styles.sectionStack}>
        <section className={styles.workflowCard}>
          <div className={styles.workflowHeader}>
            <div>
              <div className={styles.workflowLabel}>Product research options</div>
              <p className={styles.workflowPreview}>Record products considered before the final retain, vary, replace or apply-new recommendation.</p>
            </div>
            <div className={styles.inlinePicker}>
              {addOptionPicker === "closed" ? (
                <button type="button" className={styles.sectionActionButton} onClick={() => setAddOptionPicker("type")}>Add option</button>
              ) : null}
              {addOptionPicker === "type" ? (
                <>
                  <select
                    aria-label="Choose option type"
                    autoFocus
                    defaultValue=""
                    onChange={(event) => {
                      if (event.target.value === "new") {
                        addProductResearchOption();
                        setAddOptionPicker("closed");
                      }
                      if (event.target.value === "existing") {
                        setAddOptionPicker("existing");
                      }
                    }}
                  >
                    <option value="" disabled>Select option type...</option>
                    <option value="new">New policy</option>
                    <option value="existing">Existing policy</option>
                  </select>
                  <button type="button" className={styles.iconButton} onClick={() => setAddOptionPicker("closed")} aria-label="Cancel add option">×</button>
                </>
              ) : null}
              {addOptionPicker === "existing" ? (
                <>
                  <select
                    aria-label="Choose existing policy to vary"
                    autoFocus
                    defaultValue=""
                    onChange={(event) => {
                      if (!event.target.value) return;
                      addVariationRecommendationFromCurrentPolicy(event.target.value);
                      setAddOptionPicker("closed");
                    }}
                  >
                    <option value="" disabled>{variationPolicyOptions.length ? "Select policy to vary..." : "No varied policies available"}</option>
                    {variationPolicyOptions.map((policy) => (
                      <option key={policy.policyId} value={policy.policyId}>
                        {[policy.insurerName, policy.policyNumber].filter(Boolean).join(" - ") || "Existing policy"}
                      </option>
                    ))}
                  </select>
                  <button type="button" className={styles.iconButton} onClick={() => setAddOptionPicker("closed")} aria-label="Cancel add option">×</button>
                </>
              ) : null}
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table className={`${styles.dataTable} ${styles.soaLikeTable}`}>
              <thead>
                <tr>
                  <th>Insurer / product</th>
                  <th>Action</th>
                  <th>Status</th>
                  <th>Premium</th>
                  <th>Rationale</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {activeAdvice.productResearchOptions.map((option) => (
                  <tr key={option.optionId}>
                    <td>
                      <div className={styles.productOptionInputs}>
                        <input placeholder="Insurer" value={option.insurerName ?? ""} onChange={(event) => updateProductOption(option.optionId, (draft) => { draft.insurerName = event.target.value; })} />
                        <input placeholder="Product" value={option.productName ?? ""} onChange={(event) => updateProductOption(option.optionId, (draft) => { draft.productName = event.target.value; })} />
                      </div>
                    </td>
                    <td>
                      <select value={option.actionConsidered ?? "apply-new"} onChange={(event) => updateProductOption(option.optionId, (draft) => { draft.actionConsidered = event.target.value as InsurancePolicyActionV1; })}>
                        {actionOptions.map((action) => <option key={action.value} value={action.value}>{action.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={["recommended", "alternative", "current"].includes(option.status ?? "") ? option.status ?? "recommended" : "recommended"} onChange={(event) => updateProductOption(option.optionId, (draft) => { draft.status = event.target.value as NonNullable<InsuranceProductResearchOptionV1["status"]>; })}>
                        <option value="recommended">Recommended</option>
                        <option value="alternative">Alternative</option>
                        <option value="current">Current</option>
                      </select>
                    </td>
                    <td><input value={amountInputValue(productOptionPremium(option))} readOnly /></td>
                    <td><textarea className={styles.compactTextarea} value={option.rationale ?? ""} onChange={(event) => updateProductOption(option.optionId, (draft) => { draft.rationale = event.target.value; })} /></td>
                    <td><button type="button" className={styles.iconButton} onClick={() => updateActiveAdvice((draft) => {
                      draft.productResearchOptions = draft.productResearchOptions.filter((entry) => entry.optionId !== option.optionId);
                      draft.recommendations = draft.recommendations.filter((entry) => entry.sourceEvidence !== `product-option:${option.optionId}`);
                    })}>×</button></td>
                  </tr>
                ))}
                {!activeAdvice.productResearchOptions.length ? <tr><td colSpan={6}>No product research options recorded.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.workflowCard}>
          <div className={styles.workflowHeader}>
            <div>
              <div className={styles.workflowLabel}>Recommended insurance policies</div>
              <p className={styles.workflowPreview}>Extract quote details here, or let Finley populate them from insurance quote documents.</p>
            </div>
          </div>

          {activeAdvice.recommendations.map((policy) => (
            <div key={policy.policyRecommendationId} className={styles.policyDraftCard}>
              {policy.ownershipGroups.map((group, groupIndex) => (
                <div key={group.groupId} className={styles.ownershipCard}>
                  <div className={styles.recommendedPolicyHeader}>
                    <label>
                      Insurer
                      <input
                        value={group.fundingSource || policy.insurerName || policy.productName || ""}
                        onChange={(event) => updateOwnershipGroup(policy.policyRecommendationId, group.groupId, (draft) => { draft.fundingSource = event.target.value; })}
                      />
                    </label>
                    <label>
                      Policy number
                      <input
                        value={policy.policyNumber ?? ""}
                        onChange={(event) => updateRecommendedPolicy(policy.policyRecommendationId, (draft) => { draft.policyNumber = event.target.value; })}
                      />
                    </label>
                    <label>
                      Ownership
                      <select
                        value={group.ownership === "outside-super" ? "outside-super" : "inside-super"}
                        onChange={(event) => updateOwnershipGroup(policy.policyRecommendationId, group.groupId, (draft) => { draft.ownership = event.target.value as InsurancePolicyOwnershipGroupV1["ownership"]; })}
                      >
                        <option value="inside-super">Inside Super</option>
                        <option value="outside-super">Held Personally</option>
                      </select>
                    </label>
                    <label>
                      Premium
                      <input value={amountInputValue(ownershipGroupPremiumTotal(group))} readOnly />
                    </label>
                    <button type="button" className={styles.sectionActionButton} onClick={() => addRecommendedCover(policy.policyRecommendationId, group.groupId)}>Add cover</button>
                    <button type="button" className={styles.iconButton} onClick={() => updateRecommendedPolicy(policy.policyRecommendationId, (draft) => {
                      draft.ownershipGroups = draft.ownershipGroups.filter((entry) => entry.groupId !== group.groupId);
                    })} aria-label={`Remove ownership group ${groupIndex + 1}`}>×</button>
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={`${styles.dataTable} ${styles.coverTable}`}>
                      <thead><tr><th>Cover</th><th>Amount / benefit</th><th>Premium</th><th>Frequency</th><th>Waiting</th><th>Benefit period</th><th>Action</th></tr></thead>
                      <tbody>
                        {group.covers.map((cover) => (
                          <tr key={cover.coverId}>
                            <td><select value={cover.coverType} onChange={(event) => updateRecommendedCover(policy.policyRecommendationId, group.groupId, cover.coverId, (draft) => { draft.coverType = event.target.value as InsurancePolicyCoverTypeV1; })}>{coverTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></td>
                            <td><CurrencyInput value={cover.coverType === "income-protection" ? cover.monthlyBenefit : cover.sumInsured} onValueChange={(amount) => updateRecommendedCover(policy.policyRecommendationId, group.groupId, cover.coverId, (draft) => { if (draft.coverType === "income-protection") draft.monthlyBenefit = amount; else draft.sumInsured = amount; })} /></td>
                            <td><CurrencyInput value={cover.premiumAmount} onValueChange={(amount) => updateRecommendedCover(policy.policyRecommendationId, group.groupId, cover.coverId, (draft) => { draft.premiumAmount = amount; })} /></td>
                            <td>
                              <select
                                value={cover.premiumFrequency ?? group.premiumFrequency ?? "unknown"}
                                onChange={(event) => updateRecommendedCover(policy.policyRecommendationId, group.groupId, cover.coverId, (draft) => {
                                  draft.premiumFrequency = event.target.value as NonNullable<InsuranceCurrentCoverBenefitV1["premiumFrequency"]>;
                                })}
                              >
                                {premiumFrequencyOptions.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            </td>
                            <td><input value={cover.waitingPeriod ?? ""} onChange={(event) => updateRecommendedCover(policy.policyRecommendationId, group.groupId, cover.coverId, (draft) => { draft.waitingPeriod = event.target.value; })} /></td>
                            <td><input value={cover.benefitPeriod ?? ""} onChange={(event) => updateRecommendedCover(policy.policyRecommendationId, group.groupId, cover.coverId, (draft) => { draft.benefitPeriod = event.target.value; })} /></td>
                            <td><button type="button" className={styles.iconButton} onClick={() => updateActiveAdvice((draft) => {
                              const nextPolicy = draft.recommendations.find((entry) => entry.policyRecommendationId === policy.policyRecommendationId);
                              const nextGroup = nextPolicy?.ownershipGroups.find((entry) => entry.groupId === group.groupId);
                              if (!nextPolicy || !nextGroup) return;
                              nextGroup.covers = nextGroup.covers.filter((entry) => entry.coverId !== cover.coverId);
                              syncRecommendedPolicyPremiums(nextPolicy, draft);
                            })}>×</button></td>
                          </tr>
                        ))}
                        {!group.covers.length ? <tr><td colSpan={7}>No covers recorded.</td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              {!policy.ownershipGroups.length ? <div className={styles.emptyState}>No ownership groups recorded for this recommended policy.</div> : null}
              <div className={styles.policySummaryGrid}>
                <label>Optional benefits<textarea className={styles.compactTextarea} value={joinLines(policy.optionalBenefits)} onChange={(event) => updateRecommendedPolicy(policy.policyRecommendationId, (draft) => { draft.optionalBenefits = splitLines(event.target.value); })} /></label>
                <label>Underwriting / replacement notes<textarea className={styles.compactTextarea} value={[policy.underwritingNotes, policy.replacementNotes].filter(Boolean).join("\n")} onChange={(event) => updateRecommendedPolicy(policy.policyRecommendationId, (draft) => { draft.underwritingNotes = event.target.value; })} /></label>
              </div>
            </div>
          ))}
          {!activeAdvice.recommendations.length ? <div className={styles.emptyState}>No recommended policies recorded.</div> : null}
        </section>
      </div>
    );
  }

  function renderReplacementAdvice() {
    if (!activeAdvice) return null;
    const currentPolicyOptions = activeAdvice.currentCoverReview.policies.filter((policy) => policy.retainabilityNotes === "replace-existing");
    const recommendedPolicyOptions = activeAdvice.recommendations.filter((policy) => policy.action === "apply-new");
    const updateSnapshot = (
      replacementId: string,
      side: "currentPolicy" | "recommendedPolicy",
      patch: Partial<InsurancePolicyReplacementV1["currentPolicy"]>,
    ) => {
      updateReplacementAnalysis(replacementId, (draft) => {
        draft[side] = { ...draft[side], ...patch };
      });
    };

    return (
      <div className={styles.sectionStack}>
        <section className={styles.workflowCard}>
          <div className={styles.workflowHeader}>
            <div>
              <div className={styles.workflowLabel}>Insurance product replacement</div>
              <p className={styles.workflowPreview}>Compare current cover against the recommended replacement and record the reasons, costs, and benefits gained or lost.</p>
            </div>
            <button type="button" className={styles.sectionActionButton} onClick={addReplacementAnalysis}>Add replacement</button>
          </div>
          {!currentPolicyOptions.length || !recommendedPolicyOptions.length ? (
            <div className={styles.emptyState}>
              Mark a current policy as Replace in Current cover, then add a recommendation with action Apply new before completing replacement advice.
            </div>
          ) : null}
          {activeAdvice.replacementAnalyses.map((replacement, index) => (
            <div key={replacement.replacementId} className={styles.policyDraftCard}>
              <div className={styles.workflowHeader}>
                <div>
                  <div className={styles.workflowLabel}>Insurance replacement {index + 1}</div>
                  <p className={styles.workflowPreview}>{[policySnapshotLabel(replacement.currentPolicy), policySnapshotLabel(replacement.recommendedPolicy)].filter(Boolean).join(" to ")}</p>
                </div>
                <button type="button" className={styles.iconButton} onClick={() => updateActiveAdvice((draft) => {
                  draft.replacementAnalyses = draft.replacementAnalyses.filter((entry) => entry.replacementId !== replacement.replacementId);
                })}>×</button>
              </div>

              <div className={styles.policySummaryGrid}>
                <label>Policy owner<select value={replacement.ownerPersonId ?? ""} onChange={(event) => updateReplacementAnalysis(replacement.replacementId, (draft) => { draft.ownerPersonId = event.target.value || null; })}>
                  <option value="">Unspecified</option>
                  {workspace.people.map((person) => <option key={person.personId} value={person.personId}>{person.fullName}</option>)}
                </select></label>
                <label>Premium difference<CurrencyInput value={replacement.premiumDifference} onValueChange={(amount) => updateReplacementAnalysis(replacement.replacementId, (draft) => { draft.premiumDifference = amount; })} /></label>
              </div>

              <div className={styles.replacementComparisonGrid}>
                {(["currentPolicy", "recommendedPolicy"] as const).map((side) => {
                  const snapshot = replacement[side];
                  const isCurrent = side === "currentPolicy";
                  return (
                    <div key={side} className={styles.replacementSnapshotCard}>
                      <h5>{isCurrent ? "Current policy being replaced" : "New replacement policy"}</h5>
                      <div className={styles.replacementSnapshotBody}>
                        <label>
                          {isCurrent ? "Select current policy" : "Select new policy"}
                          <select
                            className={styles.replacementSnapshotSelect}
                            value={isCurrent ? replacement.currentPolicyId ?? "" : replacement.recommendedPolicyRecommendationId ?? replacement.linkedPolicyRecommendationIds?.[0] ?? ""}
                            onChange={(event) => updateReplacementAnalysis(replacement.replacementId, (draft) => {
                              if (isCurrent) {
                                const policy = activeAdvice.currentCoverReview.policies.find((entry) => entry.policyId === event.target.value);
                                draft.currentPolicyId = policy?.policyId ?? null;
                                draft.currentPolicy = policy ? currentPolicySnapshot(policy) : {};
                              } else {
                                const policy = activeAdvice.recommendations.find((entry) => entry.policyRecommendationId === event.target.value);
                                draft.recommendedPolicyRecommendationId = policy?.policyRecommendationId ?? null;
                                draft.linkedPolicyRecommendationIds = policy ? [policy.policyRecommendationId] : [];
                                draft.recommendedPolicy = policy ? recommendedPolicySnapshot(policy) : {};
                              }
                              draft.premiumDifference = (draft.recommendedPolicy.totalAnnualPremium ?? 0) - (draft.currentPolicy.totalAnnualPremium ?? 0);
                            })}
                          >
                            <option value="">Select policy...</option>
                            {(isCurrent ? currentPolicyOptions : recommendedPolicyOptions).map((policy) => {
                              const snapshotOption = isCurrent ? currentPolicySnapshot(policy as InsuranceCurrentPolicyReviewV1) : recommendedPolicySnapshot(policy as InsurancePolicyRecommendationV1);
                              const optionId = isCurrent ? (policy as InsuranceCurrentPolicyReviewV1).policyId : (policy as InsurancePolicyRecommendationV1).policyRecommendationId;
                              return <option key={optionId} value={optionId}>{policySnapshotLabel(snapshotOption)}</option>;
                            })}
                          </select>
                        </label>
                        <div className={styles.replacementSnapshotIdentity}>
                          <label>Insurer<input value={snapshot.insurer ?? ""} onChange={(event) => updateSnapshot(replacement.replacementId, side, { insurer: event.target.value })} /></label>
                          <label>Policy / product<input value={snapshot.policyName ?? ""} onChange={(event) => updateSnapshot(replacement.replacementId, side, { policyName: event.target.value })} /></label>
                          <label>Policy number<input value={snapshot.policyNumber ?? ""} onChange={(event) => updateSnapshot(replacement.replacementId, side, { policyNumber: event.target.value })} /></label>
                        </div>
                        <div className={styles.replacementMetricsGrid}>
                          <label>Life<CurrencyInput value={snapshot.totalLifeCover} onValueChange={(amount) => updateSnapshot(replacement.replacementId, side, { totalLifeCover: amount })} /></label>
                          <label>TPD<CurrencyInput value={snapshot.totalTpdCover} onValueChange={(amount) => updateSnapshot(replacement.replacementId, side, { totalTpdCover: amount })} /></label>
                          <label>Trauma<CurrencyInput value={snapshot.totalTraumaCover} onValueChange={(amount) => updateSnapshot(replacement.replacementId, side, { totalTraumaCover: amount })} /></label>
                          <label>IP monthly<CurrencyInput value={snapshot.totalIncomeProtectionCover} onValueChange={(amount) => updateSnapshot(replacement.replacementId, side, { totalIncomeProtectionCover: amount })} /></label>
                          <label>Annual premium<CurrencyInput value={snapshot.totalAnnualPremium} onValueChange={(amount) => updateSnapshot(replacement.replacementId, side, { totalAnnualPremium: amount })} /></label>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className={styles.policySummaryGrid}>
                <label>Reasons for replacement<textarea className={styles.compactTextarea} value={joinLines(replacement.reasons)} onChange={(event) => updateReplacementAnalysis(replacement.replacementId, (draft) => { draft.reasons = splitLines(event.target.value); })} /></label>
                <label>Costs of replacement<textarea className={styles.compactTextarea} value={joinLines(replacement.costs)} onChange={(event) => updateReplacementAnalysis(replacement.replacementId, (draft) => { draft.costs = splitLines(event.target.value); })} /></label>
                <label>Policy benefits gained<textarea className={styles.compactTextarea} value={joinLines(replacement.benefitsGained)} onChange={(event) => updateReplacementAnalysis(replacement.replacementId, (draft) => { draft.benefitsGained = splitLines(event.target.value); })} /></label>
                <label>Policy benefits lost<textarea className={styles.compactTextarea} value={joinLines(replacement.benefitsLost)} onChange={(event) => updateReplacementAnalysis(replacement.replacementId, (draft) => { draft.benefitsLost = splitLines(event.target.value); })} /></label>
                <label className={styles.wideField}>Replacement notes<textarea className={styles.compactTextarea} value={replacement.notes ?? ""} onChange={(event) => updateReplacementAnalysis(replacement.replacementId, (draft) => { draft.notes = event.target.value; })} /></label>
              </div>
            </div>
          ))}
          {!activeAdvice.replacementAnalyses.length ? <div className={styles.emptyState}>No replacement advice recorded.</div> : null}
        </section>
      </div>
    );
  }

  function renderNeedsRowEditorModal() {
    if (!needsRowEditor) return null;
    const matrixRows = sourceItemMatrixRows(needsRowEditorItems);

    return (
      <div className={styles.modalOverlay} role="presentation">
        <div className={styles.modalPanel} role="dialog" aria-modal="true" aria-labelledby="needs-row-editor-title">
          <div className={styles.modalHeader}>
            <div>
              <p className={styles.eyebrow}>Needs analysis source items</p>
              <h3 id="needs-row-editor-title">{needsRowEditor.title}</h3>
            </div>
            <button
              type="button"
              className={styles.neutralIconButton}
              onClick={() => {
                setNeedsRowEditor(null);
                setNeedsRowEditorItems([]);
              }}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <p className={styles.modalIntro}>
            Select the items to include in this needs-analysis row. You can add a manual item, edit the amount, or remove an item before applying the total.
          </p>

          <div className={styles.tableWrap}>
            <table className={`${styles.dataTable} ${styles.sourceItemTable}`}>
              <thead>
                <tr>
                  <th>Include</th>
                  <th>Item</th>
                  <th>Owner</th>
                  {needsCoverColumns.map((column) => (
                    <th key={column.value}>{column.label}</th>
                  ))}
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {matrixRows.map((row) => (
                  <tr key={row.rowId}>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.included}
                        onChange={(event) => updateNeedsEditorRow(row.rowId, (draft) => ({
                          ...draft,
                          included: event.target.checked,
                        }))}
                      />
                    </td>
                    <td>
                      <input
                        value={row.label}
                        onChange={(event) => updateNeedsEditorRow(row.rowId, (draft) => ({
                          ...draft,
                          label: event.target.value,
                        }))}
                      />
                    </td>
                    <td>{row.ownerLabel || "—"}</td>
                    {needsCoverColumns.map((column) => (
                      <td key={`${row.rowId}-${column.value}`}>
                        <CurrencyInput
                          value={row.items[column.value]?.amount ?? null}
                          onValueChange={(amount) => updateNeedsEditorMatrixAmount(row, column.value, amount)}
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => setNeedsRowEditorItems((items) => items.filter((entry) => sourceItemMatrixRowKey(entry) !== row.rowId))}
                        aria-label="Remove source item"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
                {!matrixRows.length ? (
                  <tr>
                    <td colSpan={8}>No source items recorded. Add an item to calculate this row from a list.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className={styles.modalSummary}>
            {needsCoverColumns.map((column) => (
              <span key={column.value}>{column.label}: {money(sourceItemAmountTotalForCover(needsRowEditorItems, column.value))}</span>
            ))}
          </div>

          <div className={styles.buttonRow}>
            <button type="button" className={styles.secondaryButton} onClick={addNeedsEditorItem}>Add item</button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => {
                setNeedsRowEditor(null);
                setNeedsRowEditorItems([]);
              }}
            >
              Cancel
            </button>
            <button type="button" className={styles.primaryButton} onClick={applyNeedsRowEditor}>Apply changes</button>
          </div>
        </div>
      </div>
    );
  }

  function renderActiveTab() {
    if (activeTab === "scenario-details") return renderScenarioDetails();
    if (activeTab === "cashflow") return renderCurrentCover();
    if (activeTab === "assets-liabilities") return renderNeedsAnalysis();
    if (activeTab === "superannuation") return renderRecommendedPolicies();
    if (activeTab === "pensions") return renderReplacementAdvice();
    return null;
  }

  const currentPolicyCount = activeAdvice?.currentCoverReview.policies.length ?? 0;
  const currentBenefitCount = activeAdvice?.currentCoverReview.policies.reduce((total, policy) => total + policy.benefits.length, 0) ?? 0;
  const recommendationsCount = activeAdvice?.recommendations.length ?? 0;

  return (
    <div className={styles.workspaceShell}>
      <main className={styles.content}>
        <section className={styles.headerBand}>
          <div>
            <p className={styles.eyebrow}>Insurance workspace</p>
            <h1>{workspace.clientName} insurance review</h1>
            <p>
              Build the insurance advice module in a standalone workspace before linking the final structure back into an SOA.
            </p>
            <div className={styles.headerActions}>
              <button type="button" className={styles.primaryButton} onClick={importClientProfile} disabled={loadStatus === "loading"}>
                {loadStatus === "loading" ? "Importing..." : "Import client profile"}
              </button>
              <button type="button" className={styles.secondaryButton} onClick={generateInsuranceIntake} disabled={intakeStatus === "loading"}>
                {intakeStatus === "loading" ? "Generating..." : "Generate from Finley intake"}
              </button>
              {loadMessage ? <span className={loadStatus === "error" ? styles.errorText : styles.statusText}>{loadMessage}</span> : null}
              {intakeMessage ? <span className={intakeStatus === "error" ? styles.errorText : styles.statusText}>{intakeMessage}</span> : null}
            </div>
          </div>
          <div className={styles.statusPanel}>
            <span>Workspace</span>
            <strong>Draft insurance scenario</strong>
            <p>{currentPolicyCount} current policies</p>
            <p>{currentBenefitCount} current benefits</p>
            <p>{recommendationsCount} recommendations</p>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Scenario inputs</p>
              <h2>Configure insurance variables</h2>
            </div>
            <span className={styles.badge}>Editable inputs</span>
          </div>

          <div className={styles.inputTabList} aria-label="Insurance workspace tabs">
            {inputTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={activeTab === tab.id ? styles.inputTabActive : styles.inputTab}
                title={tab.meaning}
                onClick={() => updateWorkspace((draft) => { draft.activeTab = tab.id; })}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {renderPersonTabs()}
          {renderActiveTab()}
        </section>
      </main>
      {renderNeedsRowEditorModal()}
    </div>
  );
}

export default function InsuranceWorkspacePage() {
  return (
    <Suspense fallback={<div className={styles.loadingState}>Loading insurance workspace...</div>}>
      <InsuranceWorkspaceContent />
    </Suspense>
  );
}
