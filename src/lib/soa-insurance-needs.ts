import type {
  InsuranceCoverAmountSetV1,
  InsuranceNeedsAnalysisLineItemCategoryV1,
  InsuranceNeedsAnalysisLineItemKeyV1,
  InsuranceNeedsAnalysisLineItemV1,
  InsuranceNeedsAnalysisV1,
} from "@/lib/soa-types";

export const INSURANCE_NEEDS_REQUIREMENT_ITEMS = [
  { key: "debt-repayment", title: "Debt repayment" },
  { key: "income-replacement", title: "Income replacement" },
  { key: "education-costs", title: "Education costs" },
  { key: "funeral-final-expenses", title: "Funeral/final expenses" },
  { key: "emergency-reserve", title: "Emergency reserve" },
] as const satisfies ReadonlyArray<{ key: InsuranceNeedsAnalysisLineItemKeyV1; title: string }>;

export const INSURANCE_NEEDS_PROVISION_ITEMS = [
  { key: "existing-cover", title: "Existing cover" },
  { key: "superannuation-balance", title: "Superannuation balance" },
  { key: "available-assets", title: "Available assets" },
] as const satisfies ReadonlyArray<{ key: InsuranceNeedsAnalysisLineItemKeyV1; title: string }>;

export const INSURANCE_NEEDS_STANDARD_ITEMS = [
  ...INSURANCE_NEEDS_REQUIREMENT_ITEMS.map((item) => ({ ...item, category: "requirement" as const })),
  ...INSURANCE_NEEDS_PROVISION_ITEMS.map((item) => ({ ...item, category: "provision" as const })),
] as const;

export type InsuranceNeedsCoverColumnKey = keyof InsuranceCoverAmountSetV1;

export type InsuranceNeedsTotals = Record<InsuranceNeedsCoverColumnKey, number>;

export type NormalizedInsuranceNeedsLineItems = {
  requirements: InsuranceNeedsAnalysisLineItemV1[];
  provisions: InsuranceNeedsAnalysisLineItemV1[];
  requiredTotals: InsuranceNeedsTotals;
  provisionTotals: InsuranceNeedsTotals;
  coverGapTotals: InsuranceNeedsTotals;
};

const COVER_KEYS: InsuranceNeedsCoverColumnKey[] = ["life", "tpd", "trauma", "incomeProtection"];

function makeLineItemId(analysisId: string, key: InsuranceNeedsAnalysisLineItemKeyV1) {
  return `${analysisId}-${key}`;
}

function emptyTotals(): InsuranceNeedsTotals {
  return {
    life: 0,
    tpd: 0,
    trauma: 0,
    incomeProtection: 0,
  };
}

function normalizeAmount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeLineItem(
  analysisId: string,
  lineItem: InsuranceNeedsAnalysisLineItemV1 | null | undefined,
  standard: {
    key: InsuranceNeedsAnalysisLineItemKeyV1;
    title: string;
    category: InsuranceNeedsAnalysisLineItemCategoryV1;
  },
): InsuranceNeedsAnalysisLineItemV1 {
  return {
    itemId: lineItem?.itemId || makeLineItemId(analysisId, standard.key),
    key: standard.key,
    category: standard.category,
    title: lineItem?.title?.trim() || standard.title,
    life: normalizeAmount(lineItem?.life),
    tpd: normalizeAmount(lineItem?.tpd),
    trauma: normalizeAmount(lineItem?.trauma),
    incomeProtection: normalizeAmount(lineItem?.incomeProtection),
  };
}

function getLineItemAmountForPolicyType(analysis: InsuranceNeedsAnalysisV1, amount?: number | null) {
  const value = normalizeAmount(amount);

  return {
    life: analysis.policyType === "life" ? value : null,
    tpd: analysis.policyType === "tpd" ? value : null,
    trauma: analysis.policyType === "trauma" ? value : null,
    incomeProtection: analysis.policyType === "income-protection" ? value : null,
  };
}

function findLineItem(
  lineItems: InsuranceNeedsAnalysisLineItemV1[] | null | undefined,
  key: InsuranceNeedsAnalysisLineItemKeyV1,
  title: string,
) {
  const normalizedTitle = title.trim().toLowerCase();
  return (lineItems ?? []).find((item) => item.key === key || item.title.trim().toLowerCase() === normalizedTitle);
}

function buildFallbackLineItem(
  analysis: InsuranceNeedsAnalysisV1,
  standard: {
    key: InsuranceNeedsAnalysisLineItemKeyV1;
    title: string;
    category: InsuranceNeedsAnalysisLineItemCategoryV1;
  },
): InsuranceNeedsAnalysisLineItemV1 | null {
  const base = {
    itemId: makeLineItemId(analysis.analysisId, standard.key),
    key: standard.key,
    category: standard.category,
    title: standard.title,
  };

  const hasRequirementInputs =
    analysis.inputs.liabilitiesToRepay != null ||
    analysis.inputs.annualIncome != null ||
    analysis.inputs.annualLivingExpenses != null ||
    analysis.inputs.educationCosts != null ||
    analysis.inputs.emergencyReserve != null;

  switch (standard.key) {
    case "debt-repayment":
      return { ...base, ...getLineItemAmountForPolicyType(analysis, analysis.inputs.liabilitiesToRepay) };
    case "income-replacement":
      return {
        ...base,
        ...getLineItemAmountForPolicyType(
          analysis,
          analysis.policyType === "income-protection"
            ? analysis.outputs.targetCoverAmount ?? analysis.inputs.annualIncome ?? analysis.inputs.annualLivingExpenses
            : analysis.inputs.annualIncome ?? (!hasRequirementInputs ? analysis.outputs.targetCoverAmount : null),
        ),
      };
    case "education-costs":
      return { ...base, ...getLineItemAmountForPolicyType(analysis, analysis.inputs.educationCosts) };
    case "emergency-reserve":
      return { ...base, ...getLineItemAmountForPolicyType(analysis, analysis.inputs.emergencyReserve) };
    case "existing-cover":
      return { ...base, ...getLineItemAmountForPolicyType(analysis, analysis.inputs.existingCoverAmount) };
    case "superannuation-balance":
      return { ...base, ...getLineItemAmountForPolicyType(analysis, analysis.inputs.superannuationBalance) };
    case "available-assets":
      return { ...base, ...getLineItemAmountForPolicyType(analysis, analysis.inputs.otherAssetsAvailable) };
    case "funeral-final-expenses":
    default:
      return null;
  }
}

function normalizeGroupLineItems(
  analysis: InsuranceNeedsAnalysisV1,
  category: InsuranceNeedsAnalysisLineItemCategoryV1,
): InsuranceNeedsAnalysisLineItemV1[] {
  const source = category === "requirement" ? analysis.requirements : analysis.provisions;
  const standards = INSURANCE_NEEDS_STANDARD_ITEMS.filter((item) => item.category === category);

  return standards.map((standard) => {
    const explicit = findLineItem(source, standard.key, standard.title);
    const fallback = buildFallbackLineItem(analysis, standard);
    return normalizeLineItem(analysis.analysisId, explicit ?? fallback, standard);
  });
}

function sumLineItems(items: InsuranceNeedsAnalysisLineItemV1[]): InsuranceNeedsTotals {
  return items.reduce((totals, item) => {
    for (const key of COVER_KEYS) {
      totals[key] += normalizeAmount(item[key]) ?? 0;
    }

    return totals;
  }, emptyTotals());
}

export function normalizeInsuranceNeedsLineItems(
  analysis: InsuranceNeedsAnalysisV1,
): NormalizedInsuranceNeedsLineItems {
  const requirements = normalizeGroupLineItems(analysis, "requirement");
  const provisions = normalizeGroupLineItems(analysis, "provision");
  const requiredTotals = sumLineItems(requirements);
  const provisionTotals = sumLineItems(provisions);
  const coverGapTotals = COVER_KEYS.reduce((totals, key) => {
    totals[key] = Math.max(requiredTotals[key] - provisionTotals[key], 0);
    return totals;
  }, emptyTotals());

  return {
    requirements,
    provisions,
    requiredTotals,
    provisionTotals,
    coverGapTotals,
  };
}

export function getInsuranceNeedsTotalsForPolicyType(
  analysis: InsuranceNeedsAnalysisV1,
): {
  targetCoverAmount: number | null;
  existingCoverAmount: number | null;
  coverGapAmount: number | null;
} {
  const key =
    analysis.policyType === "income-protection"
      ? "incomeProtection"
      : analysis.policyType === "life" || analysis.policyType === "tpd" || analysis.policyType === "trauma"
        ? analysis.policyType
        : null;

  if (!key) {
    return {
      targetCoverAmount: analysis.outputs.targetCoverAmount ?? null,
      existingCoverAmount: analysis.inputs.existingCoverAmount ?? null,
      coverGapAmount: analysis.outputs.coverGapAmount ?? null,
    };
  }

  const totals = normalizeInsuranceNeedsLineItems(analysis);

  return {
    targetCoverAmount: totals.requiredTotals[key],
    existingCoverAmount: totals.provisionTotals[key],
    coverGapAmount: totals.coverGapTotals[key],
  };
}
