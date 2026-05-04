"use client";

import JSZip from "jszip";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ClientProfile, ClientSummary } from "@/lib/api/types";
import { mockClientSummaries } from "@/lib/client-mocks";
import type { FactFindImportCandidate } from "@/lib/fact-find-import";
import { getFactFindImportCounts } from "@/lib/fact-find-import";
import {
  DEFAULT_SERVICE_AGREEMENT_SERVICES,
  SERVICE_FEE_FREQUENCY_OPTIONS,
  getServiceFeeAnnualAmount,
} from "@/lib/documents/document-sections";
import {
  DEFAULT_DOCUMENT_STYLE_PROFILE,
  DOCUMENT_FONT_OPTIONS,
  DOCUMENT_STYLE_PROFILE_STORAGE_KEY,
  normalizeDocumentStyleProfile,
  type DocumentStyleProfile,
} from "@/lib/documents/document-style-profile";
import type {
  AdviceCaseV1,
  AdviceModuleV1,
  InsurancePolicyCoverComponentV1,
  InsurancePolicyOwnershipGroupV1,
  InsurancePolicyRecommendationV1,
  InsurancePolicyReplacementV1,
  PortfolioHoldingV1,
  ProductRexReportV1,
  RiskProfileV1,
  ServiceAgreementFeeItemV1,
} from "@/lib/soa-types";
import { parseProductRexReport } from "@/lib/productrex-report-parser";
import { getPortfolioAccountViews } from "@/lib/soa-portfolio-accounts";
import type { IntakeAssessmentV1, ProductDraftResponseV1, StrategyDraftResponseV1 } from "@/lib/soa-output-contracts";
import type { SoaIntakeResponse } from "@/lib/soa-intake-service";
import { generateIntakeAssessment, refineIntakeAssessment } from "@/lib/soa-intake-engine";
import {
  canTransitionSoaWorkflow,
  deriveSoaWorkflowState,
  isMeaningfulAdviserMessage,
} from "@/lib/soa-state-machine";
import { getSoaScenario, upsertSoaScenario, type SoaScenario, type SoaScenarioDraftValue } from "@/lib/soa-scenarios";
import { buildSoaDocx } from "@/lib/soa-docx-export";
import finleyAvatar from "../finley-avatar.png";
import finleyStyles from "../page.module.css";
import styles from "./soa.module.css";

type FinleySoaConsoleProps = {
  initialClientId?: string;
  initialSoaId?: string;
};

type FinleyClientSummary = ClientSummary;

type ClientProfileResponse = {
  profile?: ClientProfile | null;
  source?: "live" | "mock";
  error?: string;
};

type FactFindImportResponse = {
  candidate?: FactFindImportCandidate | null;
  source?: "llm" | "fallback";
  model?: string | null;
  warning?: string | null;
  error?: string | null;
};

type CurrentUserScope = {
  practice?: {
    name?: string | null;
  } | null;
};

type UploadedInputKind = "supporting-file";

type UploadedInput = {
  id: string;
  kind: UploadedInputKind;
  name: string;
  mimeType?: string | null;
  extractedText?: string | null;
  productRexReport?: ProductRexReportV1 | null;
};

type RiskProfilesByPerson = Record<string, RiskProfileV1>;

type SectionId =
  | "soa-introduction"
  | "risk-profile"
  | "scope-of-advice"
  | "objectives"
  | "strategy-recommendations"
  | "product-recommendations"
  | "replacement-analysis"
  | "insurance-analysis"
  | "insurance-policies"
  | "insurance-replacement"
  | "portfolio-allocation"
  | "projections"
  | "disclosure"
  | "service-agreement"
  | "appendix";

type SectionStatus =
  | "not-started"
  | "in-progress"
  | "suggested"
  | "needs-confirmation"
  | "confirmed"
  | "blocked";

type Message = {
  id: string;
  role: "assistant" | "user";
  content: string;
  intakeAssessment?: IntakeAssessmentV1 | null;
};

type SoaSectionEditClientResponse = {
  sectionId: string;
  summary: string;
  source: "llm" | "fallback";
  model: string | null;
  warning?: string | null;
  scope?: {
    included: string[];
    exclusions: string[];
  } | null;
  objectives?: Array<{
    text: string;
    priority: "high" | "medium" | "low" | "unknown" | null;
  }> | null;
};

type SectionConfirmationMap = Partial<Record<SectionId, boolean>>;
type StrategyRecommendationTab = "linked-objectives" | "recommendation" | "reasons" | "consequences" | "alternatives";
type ProductRecommendationTab = "linked-objectives" | "recommendation" | "reasons" | "consequences" | "alternatives";
type UpfrontFeeType = "preparation" | "implementation";
type CommissionDraftField = "upfrontPercentage" | "upfrontAmount" | "ongoingPercentage" | "ongoingAmount";

const SOA_PRINT_STORAGE_KEY = "finley-soa-print-preview-v1";
const SOA_RENDER_STYLE_STORAGE_KEY = DOCUMENT_STYLE_PROFILE_STORAGE_KEY;
const LEGACY_SOA_RENDER_STYLE_STORAGE_KEY = "finley-soa-render-style-v1";
const DEFAULT_UPFRONT_COMMISSION_PERCENTAGE = 22;
const DEFAULT_ONGOING_COMMISSION_PERCENTAGE = 11;

type SoaRenderStyle = DocumentStyleProfile;

const DEFAULT_SOA_RENDER_STYLE: SoaRenderStyle = DEFAULT_DOCUMENT_STYLE_PROFILE;
const SOA_RENDER_FONT_OPTIONS = DOCUMENT_FONT_OPTIONS;

type LegacySoaRenderStyle = Partial<SoaRenderStyle> & {
  fontColor?: string | null;
  tableAccentColor?: string | null;
};

function normalizeSoaRenderStyle(value?: LegacySoaRenderStyle | null): SoaRenderStyle {
  return normalizeDocumentStyleProfile({
    fontFamily: value?.fontFamily,
    bodyTextColor:
      value?.bodyTextColor && !["#111827", "#000000"].includes(value.bodyTextColor.toLowerCase())
        ? value.bodyTextColor
        : value?.fontColor && !["#111827", "#000000"].includes(value.fontColor.toLowerCase())
          ? value.fontColor
          : undefined,
    headingColor:
      value?.headingColor && value.headingColor.toLowerCase() !== "#113864"
        ? value.headingColor
        : value?.tableAccentColor && value.tableAccentColor.toLowerCase() !== "#113864"
          ? value.tableAccentColor
          : undefined,
    tableHeaderColor: value?.tableHeaderColor,
  });
}

type SectionConfig = {
  id: SectionId;
  label: string;
  module?: AdviceModuleV1;
  optional?: boolean;
};

const SECTION_CONFIGS: SectionConfig[] = [
  { id: "soa-introduction", label: "SOA Introduction" },
  { id: "risk-profile", label: "Risk Profile" },
  { id: "scope-of-advice", label: "Scope of Advice" },
  { id: "objectives", label: "Objectives" },
  { id: "strategy-recommendations", label: "Strategy Recommendations", module: "strategy-advice" },
  { id: "product-recommendations", label: "Product Recommendations", module: "product-advice" },
  { id: "portfolio-allocation", label: "Portfolio Allocation", module: "portfolio-advice" },
  { id: "replacement-analysis", label: "Replacement Analysis", module: "replacement-advice" },
  { id: "insurance-analysis", label: "Insurance Needs Analysis", module: "insurance-advice" },
  { id: "insurance-policies", label: "Recommended Insurance Policies", module: "insurance-advice" },
  { id: "insurance-replacement", label: "Insurance Replacement", module: "insurance-advice" },
  { id: "projections", label: "Projections", module: "projection-analysis" },
  { id: "disclosure", label: "Disclosure" },
  { id: "service-agreement", label: "Service Agreement" },
  { id: "appendix", label: "Appendix", optional: true },
];

function normalizeSectionId(sectionId?: string | null): SectionId {
  if (sectionId === "basic-details") {
    return "risk-profile";
  }

  if (sectionId === "paraplanning-notes") {
    return "appendix";
  }

  return SECTION_CONFIGS.some((section) => section.id === sectionId) ? (sectionId as SectionId) : "soa-introduction";
}

const MODULE_OPTIONS: Array<{ value: AdviceModuleV1; label: string }> = [
  { value: "strategy-advice", label: "Strategy advice" },
  { value: "product-advice", label: "Product advice" },
  { value: "replacement-advice", label: "Replacement advice" },
  { value: "portfolio-advice", label: "Portfolio advice" },
  { value: "insurance-advice", label: "Insurance advice" },
  { value: "projection-analysis", label: "Projection analysis" },
];

const STRATEGY_RECOMMENDATION_TABS: Array<{ value: StrategyRecommendationTab; label: string }> = [
  { value: "linked-objectives", label: "Linked Objectives" },
  { value: "recommendation", label: "Recommendation" },
  { value: "reasons", label: "Reasons" },
  { value: "consequences", label: "Consequences" },
  { value: "alternatives", label: "Alternatives" },
];

const PRODUCT_RECOMMENDATION_TABS: Array<{ value: ProductRecommendationTab; label: string }> = [
  { value: "linked-objectives", label: "Linked Objectives" },
  { value: "recommendation", label: "Recommendation" },
  { value: "reasons", label: "Reasons" },
  { value: "consequences", label: "Consequences" },
  { value: "alternatives", label: "Alternatives" },
];

function getModuleLabel(module: AdviceModuleV1) {
  return MODULE_OPTIONS.find((option) => option.value === module)?.label ?? module;
}

function getIntakeReadinessLabel(status: IntakeAssessmentV1["readinessBySection"][number]["status"]) {
  switch (status) {
    case "ready-to-draft":
      return "Ready";
    case "missing-information":
      return "Missing info";
    case "out-of-scope":
      return "Out of scope";
    case "needs-confirmation":
    default:
      return "Confirm";
  }
}

function getIntakeReadinessClassName(status: IntakeAssessmentV1["readinessBySection"][number]["status"]) {
  switch (status) {
    case "ready-to-draft":
      return styles.intakeReadinessReady;
    case "missing-information":
      return styles.intakeReadinessMissing;
    case "out-of-scope":
      return styles.intakeReadinessOut;
    case "needs-confirmation":
    default:
      return styles.intakeReadinessConfirm;
  }
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function getOutstandingFollowUpQuestions(
  assessment: IntakeAssessmentV1,
  answeredQuestions: string[],
) {
  const answered = new Set(answeredQuestions.map(normalizeText));
  return assessment.followUpQuestions.filter((question) => !answered.has(normalizeText(question)));
}

function getResolvedFollowUpQuestions(
  assessment: IntakeAssessmentV1,
  answeredQuestions: string[],
) {
  const answered = new Set(answeredQuestions.map(normalizeText));
  return assessment.followUpQuestions.filter((question) => answered.has(normalizeText(question)));
}

function getOutstandingMissingInformation(
  assessment: IntakeAssessmentV1,
  answeredQuestions: string[],
) {
  const answered = answeredQuestions.map(normalizeText);

  return assessment.missingInformation.filter((item) => {
    const normalizedItem = normalizeText(item);

    if (answered.some((question) => question.includes("timing objective") || question.includes("retirement timing"))) {
      if (normalizedItem.includes("timing")) {
        return false;
      }
    }

    if (
      answered.some(
        (question) =>
          question.includes("home sale") ||
          question.includes("downsizing proceeds") ||
          question.includes("major assets") ||
          question.includes("future transactions"),
      )
    ) {
      if (
        normalizedItem.includes("sale proceeds") ||
        normalizedItem.includes("major assets") ||
        normalizedItem.includes("future transactions")
      ) {
        return false;
      }
    }

    if (answered.some((question) => question.includes("product recommendation") || question.includes("strategy-only"))) {
      if (normalizedItem.includes("product")) {
        return false;
      }
    }

    return true;
  });
}

const RISK_PROFILE_OPTIONS: RiskProfileV1["profile"][] = [
  "unknown",
  "cash",
  "defensive",
  "moderate",
  "balanced",
  "growth",
  "high-growth",
];

const INSURANCE_POLICY_ACTION_OPTIONS: Array<{ value: InsurancePolicyRecommendationV1["action"]; label: string }> = [
  { value: "apply-new", label: "Apply for new cover" },
  { value: "retain-existing", label: "Retain existing cover" },
  { value: "replace-existing", label: "Replace existing cover" },
  { value: "vary-existing", label: "Vary existing cover" },
  { value: "cancel", label: "Cancel cover" },
  { value: "not-recommended", label: "Not recommended" },
];

const INSURANCE_OWNERSHIP_OPTIONS: Array<{ value: InsurancePolicyOwnershipGroupV1["ownership"]; label: string }> = [
  { value: "inside-super", label: "Inside super" },
  { value: "outside-super", label: "Outside super" },
  { value: "flexi-linked", label: "Flexi-linked" },
  { value: "smsf", label: "SMSF" },
  { value: "employer", label: "Employer" },
  { value: "other", label: "Other" },
  { value: "unknown", label: "Unknown" },
];

const INSURANCE_COVER_TYPE_OPTIONS: Array<{ value: InsurancePolicyCoverComponentV1["coverType"]; label: string }> = [
  { value: "life", label: "Life" },
  { value: "tpd", label: "TPD" },
  { value: "trauma", label: "Trauma" },
  { value: "income-protection", label: "Income protection" },
  { value: "other", label: "Other" },
];

const INSURANCE_NEEDS_COVER_COLUMNS: Array<{ value: "life" | "tpd" | "trauma" | "income-protection"; label: string }> = [
  { value: "life", label: "Life" },
  { value: "tpd", label: "TPD" },
  { value: "trauma", label: "Trauma" },
  { value: "income-protection", label: "IP (p.a.)" },
];

const INSURANCE_PREMIUM_TYPE_OPTIONS: Array<{ value: NonNullable<InsurancePolicyCoverComponentV1["premiumType"]>; label: string }> = [
  { value: "variable-age-stepped", label: "Variable age-stepped" },
  { value: "stepped", label: "Stepped" },
  { value: "level", label: "Level" },
  { value: "hybrid", label: "Hybrid" },
  { value: "unknown", label: "Unknown" },
];

const INSURANCE_PREMIUM_FREQUENCY_OPTIONS: Array<{ value: NonNullable<InsurancePolicyOwnershipGroupV1["premiumFrequency"]>; label: string; annualMultiplier: number }> = [
  { value: "weekly", label: "Weekly", annualMultiplier: 52 },
  { value: "fortnightly", label: "Fortnightly", annualMultiplier: 26 },
  { value: "monthly", label: "Monthly", annualMultiplier: 12 },
  { value: "quarterly", label: "Quarterly", annualMultiplier: 4 },
  { value: "half-yearly", label: "Half yearly", annualMultiplier: 2 },
  { value: "annually", label: "Annually", annualMultiplier: 1 },
  { value: "unknown", label: "Unknown", annualMultiplier: 0 },
];

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptyRiskProfile(): RiskProfileV1 {
  return {
    profile: "unknown",
    timeHorizonYears: null,
    toleranceNotes: null,
  };
}

function normalizeRiskProfileValue(value?: string | null): RiskProfileV1["profile"] | null {
  const normalized = value?.trim().toLowerCase().replace(/[_\s]+/g, "-");

  if (!normalized) {
    return null;
  }

  if (RISK_PROFILE_OPTIONS.includes(normalized as RiskProfileV1["profile"])) {
    return normalized as RiskProfileV1["profile"];
  }

  if (normalized.includes("high") && normalized.includes("growth")) return "high-growth";
  if (normalized.includes("growth")) return "growth";
  if (normalized.includes("balanced")) return "balanced";
  if (normalized.includes("moderate")) return "moderate";
  if (normalized.includes("defensive")) return "defensive";
  if (normalized.includes("cash")) return "cash";

  return null;
}

function readProfileRiskProfile(person?: ClientProfile["client"] | null): RiskProfileV1["profile"] | null {
  return normalizeRiskProfileValue(
    person?.riskProfileResponse?.resultDisplay ?? person?.riskProfileResponse?.score ?? null,
  );
}

function normalizeInsuranceNeedsMethodology(
  value?: string | null,
): NonNullable<AdviceCaseV1["recommendations"]["insuranceNeedsAnalyses"]>[number]["methodology"] {
  switch (value) {
    case "multiple-of-income":
    case "income-replacement":
      return "income-replacement";
    case "expense-replacement":
      return "expense-based";
    case "debt-clearance":
      return "debt-plus-education";
    case "needs-analysis":
      return "capital-needs";
    default:
      return "other";
  }
}

function isInsuranceQuoteUpload(upload: Pick<UploadedInput, "name" | "extractedText">) {
  const name = normalizeText(upload.name);
  const text = normalizeText(upload.extractedText ?? "");

  if (name.includes("insurance needs analysis") || name.includes("strategy paper")) {
    return false;
  }

  return (
    ((name.includes("insurance quote") || name.includes("quote")) &&
      (name.includes("insurance") || name.includes("metlife") || name.includes("hostplus"))) ||
    (text.includes("quote illustration") && text.includes("policy summary") && text.includes("cover details")) ||
    (text.includes("quotation summary") && text.includes("cover summary") && text.includes("yearly cost"))
  );
}

function isFactFindUpload(upload: Pick<UploadedInput, "name" | "extractedText">) {
  const name = normalizeText(upload.name);
  const text = normalizeText(upload.extractedText ?? "");

  return (
    name.includes("fact find") ||
    name.includes("fact-find") ||
    name.includes("factfind") ||
    name.includes("client data form") ||
    name.includes("financial profile") ||
    (text.includes("fact find") &&
      (text.includes("personal details") ||
        text.includes("income and expenses") ||
        text.includes("assets and liabilities") ||
        text.includes("superannuation")))
  );
}

function persistSoaPrintPreview(payload: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  const serialized = JSON.stringify(payload);
  window.localStorage.setItem(SOA_PRINT_STORAGE_KEY, serialized);
  window.sessionStorage.setItem(SOA_PRINT_STORAGE_KEY, serialized);
}

function parseFeeCell(value?: string | null) {
  if (!value) {
    return { percentage: null as number | null, amount: null as number | null };
  }

  const percentageMatch = value.match(/-?\d+(?:\.\d+)?(?=%)/);
  const amountMatch = value.match(/\$-?\d[\d,]*(?:\.\d+)?/g);

  return {
    percentage: percentageMatch ? Number(percentageMatch[0]) : null,
    amount: amountMatch?.length ? Number(amountMatch.at(-1)?.replace(/[$,]/g, "")) : null,
  };
}

function ensureModules(currentModules: AdviceModuleV1[], nextModules: AdviceModuleV1[]) {
  return [...new Set([...currentModules, ...nextModules])];
}

function buildProductRexPortfolioHoldings(report: ProductRexReportV1) {
  const hasMovementAmounts = report.recommendedHoldings.some(
    (holding) =>
      holding.currentAmount != null ||
      holding.changeAmount != null ||
      holding.proposedAmount != null,
  );

  if (hasMovementAmounts) {
    const transactionsByKey = new Map(
      report.transactionRows.map((row) => [`${row.platformName ?? "platform"}::${row.fundName}`, row]),
    );

    return report.recommendedHoldings.map((holding) => {
      const transaction = transactionsByKey.get(`${holding.platformName ?? "platform"}::${holding.fundName}`);
      const changeAmount = holding.changeAmount ?? transaction?.transactionAmount ?? null;
      const proposedAmount = holding.proposedAmount ?? holding.amount ?? null;

      return {
        holdingId: holding.holdingId,
        platformName: holding.platformName ?? null,
        fundName: holding.fundName,
        code: holding.code ?? null,
        currentAmount: holding.currentAmount ?? null,
        changeAmount,
        proposedAmount,
        amount: proposedAmount,
        investmentFeePct: holding.investmentFeePct ?? null,
        investmentFeeAmount: holding.investmentFeeAmount ?? null,
        transactionAmount: changeAmount,
        buySellSpreadPct: transaction?.buySellSpreadPct ?? null,
        buySellSpreadAmount: transaction?.buySellSpreadAmount ?? null,
        brokerageAmount: transaction?.brokerageAmount ?? null,
      };
    });
  }

  const holdingsByKey = new Map<string, PortfolioHoldingV1>();

  report.transactionRows.forEach((row) => {
    const key = `${row.platformName ?? "platform"}::${row.fundName}`;
    holdingsByKey.set(key, {
      holdingId: row.transactionId,
      platformName: row.platformName ?? null,
      fundName: row.fundName,
      code: null,
      currentAmount: row.transactionAmount && row.transactionAmount < 0 ? Math.abs(row.transactionAmount) : 0,
      changeAmount: row.transactionAmount ?? null,
      proposedAmount: row.transactionAmount && row.transactionAmount > 0 ? row.transactionAmount : 0,
      amount: row.transactionAmount && row.transactionAmount > 0 ? row.transactionAmount : 0,
      investmentFeePct: null,
      investmentFeeAmount: null,
      transactionAmount: row.transactionAmount ?? null,
      buySellSpreadPct: row.buySellSpreadPct ?? null,
      buySellSpreadAmount: row.buySellSpreadAmount ?? null,
      brokerageAmount: row.brokerageAmount ?? null,
    });
  });

  report.recommendedHoldings.forEach((holding) => {
    const key = `${holding.platformName ?? "platform"}::${holding.fundName}`;
    const existing = holdingsByKey.get(key);
    holdingsByKey.set(key, {
      ...(existing ?? {
        holdingId: holding.holdingId,
        transactionAmount: null,
        buySellSpreadPct: null,
        buySellSpreadAmount: null,
        brokerageAmount: null,
      }),
      platformName: holding.platformName ?? report.recommendedPlatform ?? null,
      fundName: holding.fundName,
      code: holding.code ?? null,
      currentAmount: holding.currentAmount ?? existing?.currentAmount ?? null,
      changeAmount: holding.changeAmount ?? existing?.changeAmount ?? existing?.transactionAmount ?? null,
      proposedAmount: holding.proposedAmount ?? holding.amount ?? existing?.proposedAmount ?? existing?.amount ?? null,
      amount: holding.amount ?? existing?.amount ?? null,
      investmentFeePct: holding.investmentFeePct ?? null,
      investmentFeeAmount: holding.investmentFeeAmount ?? null,
    });
  });

  return [...holdingsByKey.values()];
}

function matchOwnerPeople(report: ProductRexReportV1, clients: AdviceCaseV1["clientGroup"]["clients"]) {
  const ownerName = report.ownerName?.trim().toLowerCase();

  if (!ownerName) {
    return clients;
  }

  const matched = clients.filter((person) => {
    const fullName = person.fullName.trim().toLowerCase();
    return fullName === ownerName || fullName.includes(ownerName) || ownerName.includes(fullName);
  });

  return matched.length ? matched : clients;
}

function isProductRexConsolidation(report: ProductRexReportV1) {
  const currentColumns =
    report.comparisonColumns?.filter((column) => column.status === "current" && column.productName?.trim()).length ?? 0;
  const sellDownFunds = new Set(
    report.transactionRows
      .filter((row) => (row.transactionAmount ?? 0) < 0)
      .map((row) => row.fundName.trim().toLowerCase())
      .filter(Boolean),
  );

  return currentColumns > 1 || sellDownFunds.size > 1;
}

function mergeProductRexIntoCase(current: AdviceCaseV1, report: NonNullable<AdviceCaseV1["productRexReports"]>[number]) {
  const nextModules = ensureModules(current.blueprint.includedModules, [
    "product-advice",
    "replacement-advice",
    "portfolio-advice",
  ]);

  const comparison = {
    comparisonId: makeId("comparison"),
    currentProduct: {
      productName: report.currentPlatform ?? null,
      provider: report.currentPlatform ?? null,
    },
    proposedProduct: {
      productName: report.recommendedPlatform ?? null,
      provider: report.recommendedPlatform ?? null,
    },
    comparisonRows: report.platformComparisonRows.map((row) => ({
      rowId: row.rowId,
      label: row.label,
      currentValue: row.currentValue ?? null,
      proposedValue: row.recommendedValue ?? null,
      alternativeValue: row.alternativeValue ?? null,
    })),
    keyDifferences: report.platformComparisonRows
      .filter((row) => row.label !== "Product" && row.label !== "Account Balance")
      .map((row) => `${row.label}: ${row.currentValue ?? "n/a"} -> ${row.recommendedValue ?? "n/a"}`),
    costComparisonNarrative: report.platformComparisonRows
      .filter((row) => row.label === "Net Ongoing Costs")
      .map((row) => `Current ${row.currentValue ?? "n/a"}, recommended ${row.recommendedValue ?? "n/a"}.`)
      .join(" "),
    replacementJustification: report.replacementReasons.join(" "),
  };

  const nextProductRecommendation = {
    recommendationId: makeId("product"),
    action: isProductRexConsolidation(report) ? ("consolidate" as const) : ("replace" as const),
    productType: "investment" as const,
    recommendedProductName: report.recommendedPlatform ?? null,
    recommendedProvider: report.recommendedPlatform ?? null,
    linkedObjectiveIds: current.objectives.map((objective) => objective.objectiveId),
    recommendationText: report.replacementReasons[0] ?? `Replace ${report.currentPlatform ?? "the current platform"} with ${report.recommendedPlatform ?? "the recommended platform"}.`,
    targetAmount: null,
    transferAmount: null,
    monthlyFundingAmount: null,
    annualFundingAmount: null,
    implementationDate: null,
    reviewFrequency: "annually" as const,
    fundingSource: null,
    priorityRank: current.recommendations.product.length + 1,
    assumptionNote: null,
    amountConfidence: "estimated" as const,
    clientBenefits: report.replacementReasons.map((reason) => ({
      benefitId: makeId("benefit"),
      text: reason,
      linkedObjectiveIds: null,
    })),
    consequences: [],
    suitabilityRationale: report.replacementReasons.join(" "),
    currentProductName: report.currentPlatform ?? null,
    currentProvider: report.currentPlatform ?? null,
    comparison,
    alternativesConsidered: report.alternativePlatform
      ? [
          {
            alternativeId: makeId("product-alternative"),
            productName: report.alternativePlatform,
            provider: report.alternativePlatform,
            reasonDiscounted: "Alternative ProductRex platform option.",
          },
        ]
      : [],
  };

  const nextReplacementRecommendation = {
    recommendationId: makeId("replacement"),
    replacementType: "switch" as const,
    currentProductName: report.currentPlatform ?? null,
    currentProvider: report.currentPlatform ?? null,
    recommendedProductName: report.recommendedPlatform ?? null,
    recommendedProvider: report.recommendedPlatform ?? null,
    replacementReasonText: report.replacementReasons.join("\n"),
    linkedObjectiveIds: current.objectives.map((objective) => objective.objectiveId),
    clientBenefits: report.replacementReasons.map((reason) => ({
      benefitId: makeId("benefit"),
      text: reason,
      linkedObjectiveIds: null,
    })),
    consequences: [],
    alternativesConsidered: report.alternativePlatform
      ? [
          {
            alternativeId: makeId("alternative"),
            optionText: report.alternativePlatform,
            reasonNotRecommended: "Alternative ProductRex platform option.",
          },
        ]
      : [],
    feeComparisonNarrative: comparison.costComparisonNarrative ?? null,
    replacementRisks: [],
    rationale: report.replacementReasons.join(" "),
  };

  const productAlreadyExists = current.recommendations.product.some(
    (recommendation) =>
      recommendation.currentProductName === nextProductRecommendation.currentProductName &&
      recommendation.recommendedProductName === nextProductRecommendation.recommendedProductName,
  );
  const replacementAlreadyExists = current.recommendations.replacement.some(
    (recommendation) =>
      recommendation.currentProductName === nextReplacementRecommendation.currentProductName &&
      recommendation.recommendedProductName === nextReplacementRecommendation.recommendedProductName &&
      recommendation.replacementReasonText === nextReplacementRecommendation.replacementReasonText,
  );
  const nextProductRecommendations = productAlreadyExists
    ? current.recommendations.product
    : [...current.recommendations.product, nextProductRecommendation];
  const nextReplacementRecommendations = replacementAlreadyExists
    ? current.recommendations.replacement
    : [...current.recommendations.replacement, nextReplacementRecommendation];
  const productRexPortfolioHoldings = buildProductRexPortfolioHoldings(report);
  const ownerPeople = matchOwnerPeople(report, current.clientGroup.clients);
  const ownerName =
    report.ownerName?.trim() ||
    ownerPeople.map((person) => person.fullName).filter(Boolean).join(" & ") ||
    current.clientGroup.clients.map((person) => person.fullName).filter(Boolean).join(" & ") ||
    null;
  const existingPortfolioAccounts = (current.recommendations.portfolio?.accounts ?? []).filter(
    (account) => account.sourceFileName !== report.sourceFileName && account.productRexReportId !== report.reportId,
  );
  const nextPortfolioAccounts = [
    ...existingPortfolioAccounts,
    {
      accountId: makeId("portfolio-account"),
      ownerPersonIds: ownerPeople.map((person) => person.personId),
      entityName: ownerName,
      accountName: report.recommendedPlatform ?? report.currentPlatform ?? "Recommended Portfolio",
      accountType: "super" as const,
      accountNumber: null,
      currentProductName: report.currentPlatform ?? null,
      currentProvider: report.currentPlatform ?? null,
      recommendedProductName: report.recommendedPlatform ?? null,
      recommendedProvider: report.recommendedPlatform ?? null,
      sourceFileName: report.sourceFileName,
      productRexReportId: report.reportId,
      linkedReplacementRecommendationIds: [nextReplacementRecommendation.recommendationId],
      holdings: productRexPortfolioHoldings,
      allocationComparison: report.allocationRows.map((row) => ({
        rowId: row.rowId,
        assetClass: row.assetClass,
        currentPct: row.currentPct ?? null,
        riskProfilePct: row.riskProfilePct ?? null,
        recommendedPct: row.recommendedPct ?? null,
        variancePct: row.variancePct ?? null,
      })),
    },
  ];

  const nextPortfolioRecommendation = {
    recommended: true,
    assetClasses: nextPortfolioAccounts.flatMap((account) => account.allocationComparison ?? []).map((row) => ({
      assetClass: row.assetClass,
      targetPct: row.recommendedPct ?? null,
    })),
    accounts: nextPortfolioAccounts,
    holdings: nextPortfolioAccounts.flatMap((account) => account.holdings ?? []),
    allocationComparison: nextPortfolioAccounts[0]?.allocationComparison?.map((row) => ({
      rowId: row.rowId,
      assetClass: row.assetClass,
      currentPct: row.currentPct ?? null,
      riskProfilePct: row.riskProfilePct ?? null,
      recommendedPct: row.recommendedPct ?? null,
      variancePct: row.variancePct ?? null,
    })) ?? [],
    sourceFileName: report.sourceFileName,
    linkedObjectiveIds: current.objectives.map((objective) => objective.objectiveId),
    clientBenefits: null,
    consequences: null,
    alternativesConsidered: null,
    variationExplanation: report.managedAccountFeeNotes.join(" "),
    rationale: report.replacementReasons.join(" "),
  };

  const productFees = report.platformComparisonRows
    .filter((row) =>
      ["Investment Fee", "Sliding Admin Fee", "Admin Fee (Flat)", "Expense Recovery Fee (Flat)", "Expense Recovery Fee (Floating)"].includes(row.label),
    )
    .map((row) => {
      const parsed = parseFeeCell(row.recommendedValue);
      return {
        feeId: makeId("product-fee"),
        productName: report.recommendedPlatform ?? null,
        ownerName,
        sourceFileName: report.sourceFileName,
        productRexReportId: report.reportId,
        amount: parsed.amount,
        percentage: parsed.percentage,
        feeType:
          row.label === "Investment Fee"
            ? ("investment" as const)
            : row.label.toLowerCase().includes("admin")
              ? ("admin" as const)
              : ("platform" as const),
      };
    });

  const nextProductRexReports = [
    ...(current.productRexReports ?? []).filter((existingReport) => existingReport.sourceFileName !== report.sourceFileName),
    report,
  ];
  const nextProductFees = productFees.length
    ? [
        ...current.fees.productFees.filter(
          (existingFee) =>
            !productFees.some(
              (nextFee) =>
                nextFee.productName === existingFee.productName &&
                nextFee.feeType === existingFee.feeType &&
                nextFee.amount === existingFee.amount &&
                nextFee.percentage === existingFee.percentage,
            ),
        ),
        ...productFees,
      ]
    : current.fees.productFees;

  return {
    ...current,
    blueprint: {
      includedModules: nextModules,
    },
    recommendations: {
      ...current.recommendations,
      product: nextProductRecommendations,
      replacement: nextReplacementRecommendations,
      portfolio: nextPortfolioRecommendation,
    },
    fees: {
      ...current.fees,
      productFees: nextProductFees,
    },
    productRexReports: nextProductRexReports,
    metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
  };
}

function filterClientSummariesByPractice(clients: FinleyClientSummary[], practiceName?: string | null) {
  const practice = practiceName?.trim().toLowerCase();
  if (!practice) return clients;
  return clients.filter((client) => client.clientAdviserPracticeName?.trim().toLowerCase() === practice);
}

function buildInitialClients(client: FinleyClientSummary | null) {
  const combinedName = client?.name?.trim();
  const nameParts = combinedName?.split(/\s*&\s*/).filter(Boolean) ?? [];

  if (nameParts.length >= 2) {
    return nameParts.slice(0, 2).map((fullName, index) => ({
      personId: makeId(index === 0 ? "client" : "partner"),
      role: index === 0 ? ("client" as const) : ("partner" as const),
      fullName,
    }));
  }

  return [
    {
      personId: makeId("client"),
      role: "client" as const,
      fullName: combinedName ?? "Selected client",
    },
  ];
}

function buildInitialCase(client: FinleyClientSummary | null): AdviceCaseV1 {
  const now = new Date().toISOString();
  return {
    adviceCaseId: makeId("soa"),
    clientProfileId: client?.id ?? null,
    documentType: "SOA",
    licensee: { name: client?.clientAdviserLicenseeName ?? "Insight Investment Partners" },
    practice: { name: client?.clientAdviserPracticeName ?? null },
    templateKey: "finley-soa-v1",
    blueprint: { includedModules: ["strategy-advice"] },
    clientGroup: {
      clients: buildInitialClients(client),
      household: {
        maritalStatus: null,
        dependantSummary: null,
      },
    },
    objectives: [],
    scope: { included: [], excluded: [], limitations: [] },
    financialSituation: {
      incomeSummary: null,
      expenseSummary: null,
      assetSummary: null,
      liabilitySummary: null,
      superannuation: [],
      insurance: [],
    },
    riskProfile: { profile: "unknown", timeHorizonYears: null, toleranceNotes: null },
    recommendations: { strategic: [], product: [], replacement: [] },
    financialProjections: [],
    fees: { adviceFees: [], productFees: [], commissions: [] },
    agreements: { feeAgreement: null },
    disclosures: { pdsProvided: null, warnings: [], limitations: [] },
    productRexReports: [],
    metadata: { status: "draft", createdAt: now, updatedAt: now },
  };
}

function visibleSections(caseState: AdviceCaseV1) {
  return SECTION_CONFIGS.filter((section) => !section.module || caseState.blueprint.includedModules.includes(section.module));
}

function getSectionStatus(
  sectionId: SectionId,
  adviceCase: AdviceCaseV1,
  workflowStarted: boolean,
  confirmedSections: SectionConfirmationMap,
): SectionStatus {
  if (confirmedSections[sectionId]) {
    return "confirmed";
  }

  switch (sectionId) {
    case "soa-introduction":
      return workflowStarted && adviceCase.blueprint.includedModules.length ? "needs-confirmation" : "in-progress";
    case "risk-profile":
      return adviceCase.riskProfile?.profile && adviceCase.riskProfile.profile !== "unknown"
        ? workflowStarted
          ? "needs-confirmation"
          : "confirmed"
        : "needs-confirmation";
    case "scope-of-advice":
      return adviceCase.scope.included.length ? (workflowStarted ? "needs-confirmation" : "confirmed") : "in-progress";
    case "objectives":
      return adviceCase.objectives.length ? (workflowStarted ? "needs-confirmation" : "confirmed") : "in-progress";
    case "strategy-recommendations":
      return adviceCase.recommendations.strategic.length ? (workflowStarted ? "needs-confirmation" : "in-progress") : "in-progress";
    case "product-recommendations":
      return adviceCase.recommendations.product.length ? (workflowStarted ? "needs-confirmation" : "in-progress") : "in-progress";
    case "replacement-analysis":
      return adviceCase.recommendations.replacement.length ? (workflowStarted ? "needs-confirmation" : "in-progress") : "in-progress";
    case "insurance-analysis":
      return adviceCase.recommendations.insuranceNeedsAnalyses?.length ||
        adviceCase.recommendations.insurance?.length
        ? workflowStarted
          ? "needs-confirmation"
          : "in-progress"
        : "in-progress";
    case "insurance-policies":
      return adviceCase.recommendations.insurancePolicies?.length
        ? workflowStarted
          ? "needs-confirmation"
          : "in-progress"
        : "in-progress";
    case "insurance-replacement":
      return adviceCase.recommendations.insuranceReplacements?.length ||
        adviceCase.recommendations.insurancePolicies?.some((policy) => policy.action === "replace-existing")
        ? workflowStarted
          ? "needs-confirmation"
          : "in-progress"
        : "in-progress";
    case "portfolio-allocation":
      return adviceCase.recommendations.portfolio?.recommended ? (workflowStarted ? "needs-confirmation" : "in-progress") : "in-progress";
    case "projections":
      return adviceCase.financialProjections?.length ? (workflowStarted ? "needs-confirmation" : "in-progress") : "in-progress";
    case "disclosure":
      return adviceCase.disclosures.warnings.length ||
        adviceCase.fees.productFees.length
        ? workflowStarted
          ? "needs-confirmation"
          : "in-progress"
        : "in-progress";
    case "service-agreement":
      return adviceCase.agreements.feeAgreement?.present || adviceCase.agreements.feeAgreement?.services.length
        ? workflowStarted
          ? "needs-confirmation"
          : "in-progress"
        : "in-progress";
    default:
      return "not-started";
  }
}

function getSectionStatusLabel(status: SectionStatus) {
  switch (status) {
    case "not-started":
      return "Not started";
    case "in-progress":
      return "In progress";
    case "suggested":
      return "Suggested";
    case "needs-confirmation":
      return "Needs confirmation";
    case "confirmed":
      return "Confirmed";
    case "blocked":
      return "Blocked";
    default:
      return status;
  }
}

function splitNonEmptyLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

type SectionChatEditMode = "append" | "replace" | "remove";

function getSectionChatEditMode(value: string): SectionChatEditMode {
  const normalized = value.toLowerCase();

  if (/\b(remove|delete|drop)\b/.test(normalized)) {
    return "remove";
  }

  if (/\b(edit|update|replace|rewrite|set|change)\b/.test(normalized)) {
    return "replace";
  }

  return "append";
}

function cleanChatInstructionLine(value: string) {
  return value
    .replace(/^[-*•\d.)\s]+/, "")
    .replace(
      /^(please\s+)?(add|include|exclude|remove|delete|drop|replace|rewrite|set|change|update|make|note|say|use)\s+(the\s+)?(duplicate\s+)?/i,
      "",
    )
    .replace(/^(agreed scope|included scope|scope|limitations?|exclusions?|client benefits?|recommendation|reason|reasons):\s*/i, "")
    .trim();
}

function extractChatInstructionLines(value: string) {
  const rawLines = splitNonEmptyLines(value).flatMap((line) => line.split(/\s*;\s*/));
  const quotedValues = Array.from(value.matchAll(/["“](.+?)["”]/g)).map((match) => match[1]?.trim()).filter(Boolean) as string[];
  const lines = rawLines
    .map(cleanChatInstructionLine)
    .filter((line) => line.length > 0 && !/^(thanks|thank you)$/i.test(line));

  return quotedValues.length ? quotedValues : lines;
}

function appendUniqueValues(current: string[], next: string[]) {
  const seen = new Set(current.map(normalizeText));
  const merged = [...current];

  next.forEach((item) => {
    const normalized = normalizeText(item);
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    merged.push(item);
  });

  return merged;
}

function findRiskProfileInText(value: string) {
  const normalized = normalizeText(value).replace(/\s+/g, "-");
  return [...RISK_PROFILE_OPTIONS]
    .sort((a, b) => b.length - a.length)
    .find((option) => option !== "unknown" && normalized.includes(option));
}

function formatCurrency(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }).format(value);
}

function parseCurrencyInput(value: string) {
  const normalizedValue = value.replace(/[$,\s]/g, "");
  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function parseCurrencyAmountFromText(value: string) {
  const match = value.match(/\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/);
  return match?.[1] ? parseCurrencyInput(match[1]) : null;
}

function formatPercent(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return `${value.toFixed(2)}%`;
}

function getPortfolioHoldingAmounts(holding: PortfolioHoldingV1) {
  const currentAmount =
    holding.currentAmount ??
    (holding.transactionAmount && holding.transactionAmount < 0 ? Math.abs(holding.transactionAmount) : 0);
  const proposedAmount = holding.proposedAmount ?? holding.amount ?? 0;
  const changeAmount = holding.changeAmount ?? holding.transactionAmount ?? proposedAmount - currentAmount;

  return { currentAmount, changeAmount, proposedAmount };
}

function groupHoldingsByPlatform(rows: PortfolioHoldingV1[]) {
  const groups = new Map<string, PortfolioHoldingV1[]>();

  rows.forEach((row) => {
    const key = row.platformName?.trim() || "Unspecified platform";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });

  return [...groups.entries()].map(([platformName, items]) => ({ platformName, items }));
}

function groupRowsByPlatform<T extends { platformName?: string | null }>(rows: T[]) {
  const groups = new Map<string, T[]>();

  rows.forEach((row) => {
    const key = row.platformName?.trim() || "Unspecified platform";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });

  return [...groups.entries()].map(([platformName, items]) => ({ platformName, items }));
}

function parsePercentInput(value: string) {
  const normalizedValue = value.replace(/[%\s]/g, "");
  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function getInsuranceAnnualisedPremium(group: InsurancePolicyOwnershipGroupV1) {
  if (group.annualisedPremium !== null && group.annualisedPremium !== undefined) {
    return group.annualisedPremium;
  }

  const multiplier = INSURANCE_PREMIUM_FREQUENCY_OPTIONS.find((option) => option.value === group.premiumFrequency)?.annualMultiplier ?? 0;
  return multiplier && group.premiumAmount != null ? group.premiumAmount * multiplier : null;
}

function createInsuranceCover(): InsurancePolicyCoverComponentV1 {
  return {
    coverId: makeId("insurance-cover"),
    coverType: "life",
    details: "",
    premiumType: "variable-age-stepped",
    sumInsured: null,
    monthlyBenefit: null,
    waitingPeriod: null,
    benefitPeriod: null,
  };
}

function createInsuranceOwnershipGroup(): InsurancePolicyOwnershipGroupV1 {
  return {
    groupId: makeId("insurance-group"),
    ownership: "inside-super",
    fundingSource: "",
    premiumFrequency: "monthly",
    premiumAmount: null,
    annualisedPremium: null,
    covers: [createInsuranceCover()],
  };
}

function createInsurancePolicyRecommendation(ownerPersonId?: string | null): InsurancePolicyRecommendationV1 {
  return {
    policyRecommendationId: makeId("insurance-policy"),
    insuredPersonId: ownerPersonId ?? null,
    action: "apply-new",
    insurerName: "",
    productName: "",
    policyName: "",
    recommendationText: "",
    ownershipGroups: [createInsuranceOwnershipGroup()],
    optionalBenefits: [],
    premiumBreakdown: [],
    underwritingNotes: "",
    replacementNotes: "",
    sourceFileName: null,
    sourceEvidence: null,
  };
}

function createInsurancePolicyReplacement(ownerPersonId?: string | null): InsurancePolicyReplacementV1 {
  return {
    replacementId: makeId("insurance-replacement"),
    ownerPersonId: ownerPersonId ?? null,
    currentPolicy: {},
    recommendedPolicy: {},
    premiumDifference: null,
    reasons: [],
    costs: [],
    benefitsGained: [],
    benefitsLost: [],
    notes: null,
    linkedPolicyRecommendationIds: [],
  };
}

function toTitleCase(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isTextExtractableFile(file: File) {
  const lowerName = file.name.toLowerCase();
  return (
    file.type.startsWith("text/") ||
    [
      ".txt",
      ".md",
      ".markdown",
      ".csv",
      ".json",
      ".xml",
      ".html",
      ".htm",
      ".rtf",
      ".log",
    ].some((extension) => lowerName.endsWith(extension))
  );
}

async function extractUploadText(file: File) {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".docx")) {
    try {
      const buffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(buffer);
      const documentXml = await zip.file("word/document.xml")?.async("string");

      if (!documentXml) {
        return null;
      }

      const parser = new DOMParser();
      const xml = parser.parseFromString(documentXml, "application/xml");
      const paragraphNodes = Array.from(xml.getElementsByTagName("w:p"));
      const text = paragraphNodes
        .map((paragraph) =>
          Array.from(paragraph.getElementsByTagName("w:t"))
            .map((node) => node.textContent ?? "")
            .join(""),
        )
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n");

      return text ? text.slice(0, 12000) : null;
    } catch {
      return null;
    }
  }

  if (!isTextExtractableFile(file)) {
    return null;
  }

  try {
    const text = await file.text();
    const trimmed = text.trim();
    return trimmed ? trimmed.slice(0, 12000) : null;
  } catch {
    return null;
  }
}

export function FinleySoaConsole({ initialClientId, initialSoaId }: FinleySoaConsoleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [currentUserScope, setCurrentUserScope] = useState<CurrentUserScope | null>(null);
  const [serverClients, setServerClients] = useState<FinleyClientSummary[]>(mockClientSummaries);
  const [activeClientProfile, setActiveClientProfile] = useState<ClientProfile | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState<SectionId>("soa-introduction");
  const [composerValue, setComposerValue] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [uploads, setUploads] = useState<UploadedInput[]>([]);
  const [uploadKind] = useState<UploadedInputKind>("supporting-file");
  const [impactNotice, setImpactNotice] = useState<string | null>(null);
  const [showReadiness, setShowReadiness] = useState(false);
  const [workflowStarted, setWorkflowStarted] = useState(false);
  const [workflowChatStartIndex, setWorkflowChatStartIndex] = useState<number | null>(null);
  const [isUploadsModalOpen, setIsUploadsModalOpen] = useState(false);
  const [factFindImportCandidate, setFactFindImportCandidate] = useState<FactFindImportCandidate | null>(null);
  const [isFactFindImportModalOpen, setIsFactFindImportModalOpen] = useState(false);
  const [factFindImportSourceFile, setFactFindImportSourceFile] = useState<string | null>(null);
  const [isExtractingFactFindImport, setIsExtractingFactFindImport] = useState(false);
  const [isApplyingFactFindImport, setIsApplyingFactFindImport] = useState(false);
  const [factFindImportError, setFactFindImportError] = useState<string | null>(null);
  const [selectedProductRexUploadId, setSelectedProductRexUploadId] = useState<string | null>(null);
  const [intakeAssessment, setIntakeAssessment] = useState<IntakeAssessmentV1 | null>(null);
  const [confirmedSections, setConfirmedSections] = useState<SectionConfirmationMap>({});
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [activeFollowUpQuestion, setActiveFollowUpQuestion] = useState<string | null>(null);
  const [answeredFollowUpQuestions, setAnsweredFollowUpQuestions] = useState<string[]>([]);
  const [answeredFollowUpResponses, setAnsweredFollowUpResponses] = useState<Record<string, string>>({});
  const [openAnsweredQuestion, setOpenAnsweredQuestion] = useState<string | null>(null);
  const [answeredQuestionDraft, setAnsweredQuestionDraft] = useState("");
  const [strategyRecommendationTabs, setStrategyRecommendationTabs] = useState<Record<string, StrategyRecommendationTab>>({});
  const [productRecommendationTabs, setProductRecommendationTabs] = useState<Record<string, ProductRecommendationTab>>({});
  const [collapsedStrategyRecommendations, setCollapsedStrategyRecommendations] = useState<Record<string, boolean>>({});
  const [collapsedProductRecommendations, setCollapsedProductRecommendations] = useState<Record<string, boolean>>({});
  const [activeInsurancePersonId, setActiveInsurancePersonId] = useState<string | null>(null);
  const [activeRiskPersonId, setActiveRiskPersonId] = useState<string | null>(null);
  const [riskProfilesByPerson, setRiskProfilesByPerson] = useState<RiskProfilesByPerson>({});
  const [activeUpfrontFeeInput, setActiveUpfrontFeeInput] = useState<UpfrontFeeType | null>(null);
  const [upfrontFeeDrafts, setUpfrontFeeDrafts] = useState<Record<UpfrontFeeType, string>>({
    preparation: "",
    implementation: "",
  });
  const [activeCommissionInput, setActiveCommissionInput] = useState<{ commissionId: string; field: CommissionDraftField } | null>(null);
  const [commissionDrafts, setCommissionDrafts] = useState<Record<string, string>>({});
  const [scenarioReady, setScenarioReady] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [soaRenderStyle, setSoaRenderStyle] = useState<SoaRenderStyle>(DEFAULT_SOA_RENDER_STYLE);
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeClientId = searchParams.get("clientId") ?? initialClientId ?? "";
  const activeSoaId = searchParams.get("soaId") ?? initialSoaId ?? "";
  const activeClient = useMemo(() => serverClients.find((client) => client.id === activeClientId) ?? null, [activeClientId, serverClients]);
  const [adviceCase, setAdviceCase] = useState<AdviceCaseV1>(() => buildInitialCase(activeClient));

  function resetConsoleState(nextAdviceCase: AdviceCaseV1) {
    setAdviceCase(nextAdviceCase);
    setMessages([]);
    setUploads([]);
    setShowReadiness(false);
    setImpactNotice(null);
    setWorkflowStarted(false);
    setWorkflowChatStartIndex(null);
    setIsUploadsModalOpen(false);
    setFactFindImportCandidate(null);
    setIsFactFindImportModalOpen(false);
    setFactFindImportSourceFile(null);
    setFactFindImportError(null);
    setSelectedProductRexUploadId(null);
    setIntakeAssessment(null);
    setConfirmedSections({});
    setActiveFollowUpQuestion(null);
    setAnsweredFollowUpQuestions([]);
    setAnsweredFollowUpResponses({});
    setOpenAnsweredQuestion(null);
    setAnsweredQuestionDraft("");
    setStrategyRecommendationTabs({});
    setProductRecommendationTabs({});
    setCollapsedStrategyRecommendations({});
    setCollapsedProductRecommendations({});
    setActiveInsurancePersonId(null);
    setActiveRiskPersonId(null);
    setRiskProfilesByPerson({});
    setActiveUpfrontFeeInput(null);
    setUpfrontFeeDrafts({ preparation: "", implementation: "" });
    setActiveCommissionInput(null);
    setCommissionDrafts({});
    setActiveSectionId("soa-introduction");
  }

  useEffect(() => {
    let cancelled = false;

    async function loadActiveClientProfile() {
      if (!activeClientId) {
        setActiveClientProfile(null);
        return;
      }

      try {
        const response = await fetch(`/api/finley/soa/client-profile?clientId=${encodeURIComponent(activeClientId)}`, {
          cache: "no-store",
        });
        const body = (await response.json().catch(() => null)) as ClientProfileResponse | null;

        if (!cancelled) {
          setActiveClientProfile(response.ok ? (body?.profile ?? null) : null);
        }
      } catch {
        if (!cancelled) {
          setActiveClientProfile(null);
        }
      }
    }

    void loadActiveClientProfile();

    return () => {
      cancelled = true;
    };
  }, [activeClientId]);

  function hydrateScenarioDraft(draft: SoaScenarioDraftValue) {
    setAdviceCase(draft.adviceCase);
    setMessages(draft.messages as Message[]);
    setUploads(draft.uploads as UploadedInput[]);
    setShowReadiness(false);
    setImpactNotice(null);
    setWorkflowStarted(draft.workflowStarted);
    setWorkflowChatStartIndex(draft.workflowChatStartIndex);
    setIsUploadsModalOpen(false);
    setSelectedProductRexUploadId(draft.selectedProductRexUploadId);
    setIntakeAssessment(draft.intakeAssessment);
    setConfirmedSections(draft.confirmedSections as SectionConfirmationMap);
    setActiveFollowUpQuestion(null);
    setAnsweredFollowUpQuestions(draft.answeredFollowUpQuestions);
    setAnsweredFollowUpResponses(draft.answeredFollowUpResponses);
    setOpenAnsweredQuestion(null);
    setAnsweredQuestionDraft("");
    setStrategyRecommendationTabs({});
    setProductRecommendationTabs({});
    setCollapsedStrategyRecommendations({});
    setCollapsedProductRecommendations({});
    setActiveInsurancePersonId(draft.activeInsurancePersonId);
    setActiveRiskPersonId(draft.activeRiskPersonId);
    setRiskProfilesByPerson(draft.riskProfilesByPerson);
    setActiveUpfrontFeeInput(null);
    setUpfrontFeeDrafts({ preparation: "", implementation: "" });
    setActiveCommissionInput(null);
    setCommissionDrafts({});
    setActiveSectionId(normalizeSectionId(draft.activeSectionId));
  }

  useEffect(() => {
    let cancelled = false;
    async function loadUser() {
      try {
        const response = await fetch("/api/users/me", { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as { data?: CurrentUserScope | null } | null;
        if (!cancelled && response.ok && body?.data) {
          setCurrentUserScope(body.data);
        }
      } catch {
        // keep fallback state
      }
    }
    void loadUser();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const raw =
      window.localStorage.getItem(SOA_RENDER_STYLE_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_SOA_RENDER_STYLE_STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as LegacySoaRenderStyle;
      setSoaRenderStyle(normalizeSoaRenderStyle(parsed));
    } catch {
      window.localStorage.removeItem(SOA_RENDER_STYLE_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_SOA_RENDER_STYLE_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(SOA_RENDER_STYLE_STORAGE_KEY, JSON.stringify(soaRenderStyle));
  }, [soaRenderStyle]);

  useEffect(() => {
    setServerClients(filterClientSummariesByPractice(mockClientSummaries, currentUserScope?.practice?.name));
  }, [currentUserScope?.practice?.name]);

  useEffect(() => {
    let cancelled = false;

    async function loadClients() {
      setIsLoadingClients(true);

      try {
        const query = new URLSearchParams();
        if (clientSearch.trim()) {
          query.set("search", clientSearch.trim());
        }
        query.set("pageSize", "25");

        const response = await fetch(`/api/clients?${query.toString()}`, {
          method: "GET",
          cache: "no-store",
        });

        const body = (await response.json().catch(() => null)) as
          | {
              data?: {
                items?: Array<{
                  id?: string | null;
                  client?: { name?: string | null } | null;
                  partner?: { name?: string | null } | null;
                  adviser?: { name?: string | null } | null;
                  practice?: string | null;
                  licensee?: string | null;
                }>;
              };
            }
          | null;

        if (!response.ok) {
          throw new Error("Unable to load clients.");
        }

        const nextClients =
          body?.data?.items?.map((item) => ({
            id: item.id,
            name: [item.client?.name, item.partner?.name].filter(Boolean).join(" & "),
            clientAdviserName: item.adviser?.name,
            clientAdviserPracticeName: item.practice,
            clientAdviserLicenseeName: item.licensee,
          })) ?? [];

        if (!cancelled) {
          setServerClients(
            nextClients.length
              ? filterClientSummariesByPractice(nextClients, currentUserScope?.practice?.name)
              : filterClientSummariesByPractice(mockClientSummaries, currentUserScope?.practice?.name),
          );
        }
      } catch {
        if (!cancelled) {
          setServerClients(filterClientSummariesByPractice(mockClientSummaries, currentUserScope?.practice?.name));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingClients(false);
        }
      }
    }

    void loadClients();

    return () => {
      cancelled = true;
    };
  }, [clientSearch, currentUserScope?.practice?.name]);

  useEffect(() => {
    if (!activeClientId) {
      resetConsoleState(buildInitialCase(activeClient));
      setScenarioReady(true);
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    if (!activeClient) {
      return;
    }

    if (!activeSoaId) {
      resetConsoleState(buildInitialCase(activeClient));
      setScenarioReady(true);
      return;
    }

    const scenario = getSoaScenario(activeClientId, activeSoaId);
    if (scenario?.draft) {
      hydrateScenarioDraft(scenario.draft);
    } else {
      resetConsoleState(buildInitialCase(activeClient));
    }

    setScenarioReady(true);
  }, [activeClient?.id, activeClientId, activeSoaId]);

  useEffect(() => {
    if (!adviceCase.clientGroup.clients.length) {
      setActiveInsurancePersonId(null);
      return;
    }

    setActiveInsurancePersonId((current) =>
      current && adviceCase.clientGroup.clients.some((person) => person.personId === current)
        ? current
        : adviceCase.clientGroup.clients[0]?.personId ?? null,
    );
  }, [adviceCase.clientGroup.clients]);

  useEffect(() => {
    if (!adviceCase.clientGroup.clients.length) {
      setActiveRiskPersonId(null);
      setRiskProfilesByPerson({});
      return;
    }

    setActiveRiskPersonId((current) =>
      current && adviceCase.clientGroup.clients.some((person) => person.personId === current)
        ? current
        : adviceCase.clientGroup.clients[0]?.personId ?? null,
    );

    setRiskProfilesByPerson((current) => {
      const next: RiskProfilesByPerson = {};
      adviceCase.clientGroup.clients.forEach((person, index) => {
        next[person.personId] =
          current[person.personId] ??
          (index === 0 && adviceCase.riskProfile ? adviceCase.riskProfile : createEmptyRiskProfile());
      });
      return next;
    });
  }, [adviceCase.clientGroup.clients, adviceCase.riskProfile]);

  useEffect(() => {
    if (!activeClientProfile || !adviceCase.clientGroup.clients.length) {
      return;
    }

    const riskProfilesFromProfile = new Map<string, RiskProfileV1["profile"]>();
    const profilePeople = [activeClientProfile.client, activeClientProfile.partner];

    adviceCase.clientGroup.clients.forEach((person, index) => {
      const profilePerson = profilePeople[index] ?? null;
      const profileValue = readProfileRiskProfile(profilePerson);
      if (profileValue) {
        riskProfilesFromProfile.set(person.personId, profileValue);
      }
    });

    if (!riskProfilesFromProfile.size) {
      return;
    }

    setRiskProfilesByPerson((current) => {
      let changed = false;
      const next = { ...current };

      riskProfilesFromProfile.forEach((profile, personId) => {
        const existing = next[personId];
        if (!existing || existing.profile === "unknown") {
          next[personId] = { ...(existing ?? createEmptyRiskProfile()), profile };
          changed = true;
        }
      });

      return changed ? next : current;
    });

    const primaryPersonId = adviceCase.clientGroup.clients[0]?.personId;
    const primaryRiskProfile = primaryPersonId ? riskProfilesFromProfile.get(primaryPersonId) : null;

    if (primaryRiskProfile && (!adviceCase.riskProfile || adviceCase.riskProfile.profile === "unknown")) {
      setAdviceCase((current) => {
        if (current.riskProfile?.profile && current.riskProfile.profile !== "unknown") {
          return current;
        }

        return {
          ...current,
          riskProfile: {
            ...(current.riskProfile ?? createEmptyRiskProfile()),
            profile: primaryRiskProfile,
          },
          metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
        };
      });
    }
  }, [activeClientProfile, adviceCase.clientGroup.clients, adviceCase.riskProfile]);

  useEffect(() => {
    if (activeClientId && !activeClient) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const payload = {
      savedAt: new Date().toISOString(),
      clientId: activeClientId || null,
      soaId: activeSoaId || null,
      clientName: activeClient?.name ?? null,
      adviserName: activeClient?.clientAdviserName ?? null,
      practiceName: activeClient?.clientAdviserPracticeName ?? adviceCase.practice.name ?? null,
      practiceAbn: null,
      adviceCase,
      intakeAssessment,
      confirmedSections,
    };

    persistSoaPrintPreview(payload);
  }, [activeClient?.name, activeClientId, activeSoaId, adviceCase, intakeAssessment, confirmedSections]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !scenarioReady ||
      !activeClientId ||
      !activeSoaId ||
      !activeClient
    ) {
      return;
    }

    const existingScenario = getSoaScenario(activeClientId, activeSoaId);
    const timestamp = new Date().toISOString();
    const nextScenario: SoaScenario = {
      id: activeSoaId,
      name: existingScenario?.name ?? "SOA Scenario",
      status: existingScenario?.status ?? "Draft",
      createdAt: existingScenario?.createdAt ?? timestamp,
      updatedAt: timestamp,
      draft: {
        activeSectionId,
        adviceCase,
        messages,
        uploads,
        workflowStarted,
        workflowChatStartIndex,
        selectedProductRexUploadId,
        intakeAssessment,
        confirmedSections: confirmedSections as Record<string, boolean>,
        answeredFollowUpQuestions,
        answeredFollowUpResponses,
        activeInsurancePersonId,
        activeRiskPersonId,
        riskProfilesByPerson,
      },
    };

    upsertSoaScenario(activeClientId, nextScenario);
  }, [
    activeClient,
    activeClientId,
    activeSectionId,
    activeInsurancePersonId,
    activeRiskPersonId,
    activeSoaId,
    adviceCase,
    answeredFollowUpQuestions,
    answeredFollowUpResponses,
    confirmedSections,
    intakeAssessment,
    messages,
    riskProfilesByPerson,
    scenarioReady,
    selectedProductRexUploadId,
    uploads,
    workflowChatStartIndex,
    workflowStarted,
  ]);

  const sections = useMemo(() => visibleSections(adviceCase), [adviceCase]);
  useEffect(() => {
    if (!sections.length || sections.some((section) => section.id === activeSectionId)) {
      return;
    }

    setActiveSectionId(sections[0].id);
  }, [activeSectionId, sections]);
  const productRexUploads = useMemo(
    () => uploads.filter((upload) => upload.productRexReport),
    [uploads],
  );
  const selectedProductRexUpload = useMemo(
    () =>
      productRexUploads.find((upload) => upload.id === selectedProductRexUploadId) ??
      (productRexUploads.length === 1 ? productRexUploads[0] : null),
    [productRexUploads, selectedProductRexUploadId],
  );
  const hasMeaningfulUserMessage = useMemo(
    () => messages.some((message) => message.role === "user" && isMeaningfulAdviserMessage(message.content)),
    [messages],
  );
  const hasIntakeAssessment = Boolean(intakeAssessment);
  const workflowState = useMemo(
    () =>
      deriveSoaWorkflowState({
        hasSelectedClient: Boolean(activeClient),
        uploadedFileCount: uploads.length,
        hasMeaningfulAdviserMessage: hasMeaningfulUserMessage,
        hasIntakeAssessment,
        workflowStarted,
        hasActiveSectionReview: workflowStarted && activeSectionId !== "soa-introduction",
        adviceCase,
      }),
    [
      activeClient,
      uploads.length,
      hasMeaningfulUserMessage,
      hasIntakeAssessment,
      workflowStarted,
      activeSectionId,
      adviceCase,
    ],
  );

  const readinessItems = useMemo(
    () =>
      sections
        .filter((section) => !section.optional)
        .map((section) => {
          const status = getSectionStatus(
            section.id,
            adviceCase,
            workflowState === "workflow_started" || workflowState === "section_review",
            confirmedSections,
          );
          return {
            id: section.id,
            label: section.label,
            problems: status === "confirmed" ? [] : [`${section.label} still needs adviser confirmation before generation.`],
          };
        })
        .filter((item) => item.problems.length),
    [adviceCase, sections, workflowState, confirmedSections],
  );
  const visibleMessages = useMemo(
    () => {
      if ((workflowState === "workflow_started" || workflowState === "section_review") && workflowChatStartIndex !== null) {
        return messages.slice(workflowChatStartIndex);
      }

      return messages;
    },
    [messages, workflowState, workflowChatStartIndex],
  );
  const activeSectionIndex = useMemo(
    () => sections.findIndex((section) => section.id === activeSectionId),
    [sections, activeSectionId],
  );
  const activeSectionStatus = useMemo(
    () =>
      getSectionStatus(
        activeSectionId,
        adviceCase,
        workflowState === "workflow_started" || workflowState === "section_review",
        confirmedSections,
      ),
    [activeSectionId, adviceCase, workflowState, confirmedSections],
  );
  const latestProductRexReport = useMemo(
    () => selectedProductRexUpload?.productRexReport ?? (adviceCase.productRexReports?.[0] ?? null),
    [selectedProductRexUpload, adviceCase.productRexReports],
  );
  const portfolioAccountViews = useMemo(() => getPortfolioAccountViews(adviceCase), [adviceCase]);
  const hasProductFeeAmount = adviceCase.fees.productFees.some(
    (fee) => fee.amount !== null && fee.amount !== undefined && !Number.isNaN(fee.amount),
  );
  const totalProductFeeAmount = adviceCase.fees.productFees.reduce((sum, fee) => sum + (fee.amount ?? 0), 0);
  const productFeeGroups = useMemo(() => {
    const groupedFeeIds = new Set<string>();
    const groups = portfolioAccountViews
      .map((account) => {
        const fees = adviceCase.fees.productFees.filter((fee) => {
          const matchesReport =
            Boolean(account.productRexReportId && fee.productRexReportId === account.productRexReportId) ||
            Boolean(account.sourceFileName && fee.sourceFileName === account.sourceFileName);
          const matchesProduct =
            Boolean(account.recommendedProductName && fee.productName === account.recommendedProductName) &&
            Boolean(account.label && fee.ownerName === account.label);
          return matchesReport || matchesProduct;
        });
        fees.forEach((fee) => groupedFeeIds.add(fee.feeId));
        return { key: account.accountId, label: account.label, fees };
      })
      .filter((group) => group.fees.length);
    const ungroupedFees = adviceCase.fees.productFees.filter((fee) => !groupedFeeIds.has(fee.feeId));

    return ungroupedFees.length
      ? [...groups, { key: "other-product-fees", label: groups.length ? "Other product fees" : "Product fees", fees: ungroupedFees }]
      : groups;
  }, [adviceCase.fees.productFees, portfolioAccountViews]);
  const transactionFeeGroups = useMemo(
    () =>
      (adviceCase.productRexReports ?? [])
        .filter((report) => report.transactionRows.length)
        .map((report) => ({
          key: report.reportId,
          label: report.ownerName?.trim() || report.sourceFileName,
          sourceFileName: report.sourceFileName,
          rows: report.transactionRows,
        })),
    [adviceCase.productRexReports],
  );
  const showLiveSoaPreview = Boolean(activeClient && (workflowState === "workflow_started" || workflowState === "section_review"));
  const printPreviewPayload = useMemo(
    () => ({
      savedAt: new Date().toISOString(),
      clientId: activeClientId || null,
      soaId: activeSoaId || null,
      clientName: activeClient?.name ?? null,
      adviserName: activeClient?.clientAdviserName ?? null,
      practiceName: activeClient?.clientAdviserPracticeName ?? adviceCase.practice.name ?? null,
      practiceAbn: null,
      adviceCase,
      intakeAssessment,
      confirmedSections,
    }),
    [activeClient, activeClientId, activeSoaId, adviceCase, intakeAssessment, confirmedSections],
  );
  const printPreviewUrl = useMemo(() => {
    const params = new URLSearchParams();

    if (activeClientId) {
      params.set("clientId", activeClientId);
    }

    if (activeSoaId) {
      params.set("soaId", activeSoaId);
    }

    params.set("embed", "1");
    params.set("live", String(previewVersion));
    params.set("section", activeSectionId);
    params.set("font", soaRenderStyle.fontFamily);
    params.set("fontColor", soaRenderStyle.bodyTextColor);
    params.set("tableHeaderColor", soaRenderStyle.tableHeaderColor);
    params.set("tableAccentColor", soaRenderStyle.headingColor);

    return `/finley/soa/print?${params.toString()}`;
  }, [activeClientId, activeSectionId, activeSoaId, previewVersion, soaRenderStyle]);

  useEffect(() => {
    if (!showLiveSoaPreview) {
      return;
    }

    persistSoaPrintPreview(printPreviewPayload);
    setPreviewVersion((current) => current + 1);
  }, [showLiveSoaPreview, printPreviewPayload]);

  async function loadClientProfileForExport() {
    if (activeClientProfile) {
      return activeClientProfile;
    }

    if (!activeClientId) {
      return null;
    }

    try {
      const response = await fetch(`/api/finley/soa/client-profile?clientId=${encodeURIComponent(activeClientId)}`, {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as ClientProfileResponse | null;

      if (!response.ok) {
        throw new Error(body?.error || "Unable to load the client profile for the Word export.");
      }

      return body?.profile ?? null;
    } catch {
      return null;
    }
  }

  async function exportSoaWordDocument() {
    if (isExportingDocx) {
      return;
    }

    setIsExportingDocx(true);
    setImpactNotice(null);

    try {
      persistSoaPrintPreview(printPreviewPayload);
      const clientProfile = await loadClientProfileForExport();
      const { blob, fileName } = await buildSoaDocx({
        adviceCase,
        clientProfile,
        savedAt: printPreviewPayload.savedAt,
        clientName: activeClient?.name ?? null,
        adviserName: activeClient?.clientAdviserName ?? null,
        practiceName: activeClient?.clientAdviserPracticeName ?? adviceCase.practice.name ?? null,
        practiceAbn: null,
        renderStyle: soaRenderStyle,
      });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to export the SOA Word document.";
      setImpactNotice(message);
    } finally {
      setIsExportingDocx(false);
    }
  }

  function selectClient(clientId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("clientId", clientId);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function clearSelectedClient() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("clientId");
    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
    setClientSearch("");
  }

  function trySelectClientFromSearch(value: string) {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return;
    }

    const matchedClient = serverClients.find(
      (client) => client.name?.trim().toLowerCase() === normalized,
    );

    if (matchedClient?.id) {
      selectClient(matchedClient.id);
    }
  }

  function toggleModule(module: AdviceModuleV1) {
    setAdviceCase((current) => {
      const exists = current.blueprint.includedModules.includes(module);
      const includedModules = exists
        ? current.blueprint.includedModules.filter((entry) => entry !== module)
        : [...current.blueprint.includedModules, module];
      setImpactNotice(
        `${exists ? "Removed" : "Accepted"} ${getModuleLabel(module)}. Workflow visibility and readiness were updated.`,
      );
      return {
        ...current,
        blueprint: { includedModules },
        metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
      };
    });

    if (intakeAssessment) {
      const nextAssessment = {
        ...intakeAssessment,
        candidateModules: intakeAssessment.candidateModules.filter((entry) => entry !== module),
      };
      setIntakeAssessment(nextAssessment);
      setMessages((current) =>
        current.map((message) =>
          message.intakeAssessment
            ? {
                ...message,
                intakeAssessment: {
                  ...message.intakeAssessment,
                  candidateModules: message.intakeAssessment.candidateModules.filter((entry) => entry !== module),
                },
              }
            : message,
        ),
      );
    }
  }

  async function addUpload(files: FileList | null) {
    if (!files?.length) return;

    const nextUploads = await Promise.all(
      Array.from(files).map(async (file) => {
        const extractedText = await extractUploadText(file);
        const productRexReport = parseProductRexReport({
          fileName: file.name,
          extractedText,
        });

        return {
          id: makeId("upload"),
          kind: uploadKind,
          name: file.name,
          mimeType: file.type || null,
          extractedText,
          productRexReport,
        };
      }),
    );
    const nextProductRexUploads = nextUploads.filter((upload) => upload.productRexReport);
    const totalProductRexCount = productRexUploads.length + nextProductRexUploads.length;

    setUploads((current) => [...current, ...nextUploads]);
    if (nextProductRexUploads.length) {
      setSelectedProductRexUploadId(nextProductRexUploads.at(-1)?.id ?? nextProductRexUploads[0]?.id ?? null);
      setAdviceCase((current) =>
        nextProductRexUploads.reduce(
          (nextCase, upload) =>
            upload.productRexReport ? mergeProductRexIntoCase(nextCase, upload.productRexReport as ProductRexReportV1) : nextCase,
          current,
        ),
      );
      setImpactNotice(
        nextProductRexUploads.length === 1
          ? `Detected a ProductRex report in ${nextProductRexUploads[0].name} and populated the product, replacement, portfolio, and fee sections with draft data.`
          : `Detected ${totalProductRexCount} ProductRex reports and populated separate product, replacement, portfolio, and fee drafts for each scenario.`,
      );
    }
    setMessages((current) => [
      ...current,
      {
        id: makeId("assistant"),
        role: "assistant",
        content: `Added ${nextUploads.length} ${uploadKind.replace(/-/g, " ")} file${nextUploads.length > 1 ? "s" : ""} to the Finley context for ${activeClient?.name ?? "this client"}. You can now use the chat box to add extra background before we start drafting sections.`,
      },
    ]);
  }

  async function inspectFactFindUpload(upload: UploadedInput) {
    if (!upload.extractedText) {
      setFactFindImportError("Finley could not read text from this fact find. Try uploading the original DOCX or text-based file rather than a scanned PDF.");
      setFactFindImportCandidate(null);
      setIsFactFindImportModalOpen(true);
      return;
    }

    setIsExtractingFactFindImport(true);
    setFactFindImportError(null);
    setFactFindImportCandidate(null);
    setFactFindImportSourceFile(upload.name);

    try {
      const response = await fetch("/api/finley/fact-find/extract-import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fileName: upload.name,
          extractedText: upload.extractedText,
          clientName: activeClient?.name ?? null,
        }),
      });
      const body = (await response.json().catch(() => null)) as FactFindImportResponse | null;

      if (!response.ok || !body?.candidate) {
        throw new Error(body?.error ?? `Unable to inspect fact find right now (status ${response.status}).`);
      }

      setFactFindImportCandidate(body.candidate);
      setFactFindImportError(body.warning ?? null);
      setIsUploadsModalOpen(false);
      setIsFactFindImportModalOpen(true);
    } catch (error) {
      setFactFindImportError(error instanceof Error ? error.message : "Unable to inspect fact find right now.");
      setIsFactFindImportModalOpen(true);
    } finally {
      setIsExtractingFactFindImport(false);
    }
  }

  async function applyFactFindImport() {
    if (!factFindImportCandidate || !activeClientId) {
      return;
    }

    setIsApplyingFactFindImport(true);
    setFactFindImportError(null);

    try {
      const response = await fetch("/api/finley/fact-find/apply-import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: activeClientId,
          candidate: factFindImportCandidate,
        }),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; applied?: string[]; error?: string } | null;

      if (!response.ok || !body?.ok) {
        throw new Error(body?.error ?? `Unable to apply fact find data right now (status ${response.status}).`);
      }

      setImpactNotice(
        body.applied?.length
          ? `Applied fact find data: ${body.applied.join(", ")}.`
          : "Fact find reviewed, but there were no new profile records to apply.",
      );
      setIsFactFindImportModalOpen(false);
      setFactFindImportCandidate(null);
      setPreviewVersion((current) => current + 1);

      if (activeClientId) {
        const profileResponse = await fetch(`/api/finley/soa/client-profile?clientId=${encodeURIComponent(activeClientId)}`, {
          cache: "no-store",
        });
        const profileBody = (await profileResponse.json().catch(() => null)) as ClientProfileResponse | null;
        setActiveClientProfile(profileResponse.ok ? (profileBody?.profile ?? null) : activeClientProfile);
      }
    } catch (error) {
      setFactFindImportError(error instanceof Error ? error.message : "Unable to apply fact find data right now.");
    } finally {
      setIsApplyingFactFindImport(false);
    }
  }

  function buildFirstPass() {
    const transition = canTransitionSoaWorkflow(workflowState, "workflow_started", {
      hasSelectedClient: Boolean(activeClient),
      uploadedFileCount: uploads.length,
      hasMeaningfulAdviserMessage: hasMeaningfulUserMessage,
      hasIntakeAssessment,
      workflowStarted,
      hasActiveSectionReview: workflowStarted && activeSectionId !== "soa-introduction",
      adviceCase,
    });

    if (!transition.allowed) {
      setImpactNotice(transition.reason ?? "The SOA workflow is not ready to start yet.");
      return;
    }

    setWorkflowChatStartIndex(messages.length + 1);
    setWorkflowStarted(true);
  }

  async function requestIntakeAssessment(
    message: string,
    options?: {
      activeQuestion?: string | null;
      answeredResponses?: Record<string, string>;
    },
  ) {
    const response = await fetch("/api/finley/soa/intake", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        clientName: activeClient?.name ?? null,
        adviserMessage: message,
        uploadedFiles: uploads.map((upload) => ({
          name: upload.name,
          kind: upload.kind,
          extractedText: upload.extractedText ?? null,
        })),
        currentAssessment: intakeAssessment,
        recentMessages: messages.slice(-8).map((entry) => ({
          role: entry.role,
          content: entry.content,
        })),
        activeFollowUpQuestion: options?.activeQuestion ?? null,
        answeredFollowUpResponses: options?.answeredResponses ?? answeredFollowUpResponses,
      }),
    });

    if (!response.ok) {
      throw new Error("SOA intake request failed.");
    }

    return (await response.json()) as SoaIntakeResponse;
  }

  async function requestStrategyDrafts(nextAssessment: IntakeAssessmentV1) {
    const response = await fetch("/api/finley/soa/strategy-draft", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        clientName: activeClient?.name ?? null,
        objectives: nextAssessment.candidateObjectives.map((objective) => ({
          text: objective.text,
          priority: objective.priority ?? null,
        })),
        scope: {
          included: nextAssessment.candidateScopeInclusions.map((topic) => ({ scopeItemId: makeId("scope"), topic })),
          excluded: nextAssessment.candidateScopeExclusions.map((topic) => ({ scopeItemId: makeId("scope"), topic })),
          limitations: [],
        },
        riskProfile: adviceCase.riskProfile ?? null,
        intakeAssessment: nextAssessment,
        uploadedFiles: uploads.map((upload) => ({
          name: upload.name,
          kind: upload.kind,
          extractedText: upload.extractedText ?? null,
        })),
        recentMessages: messages.slice(-8).map((entry) => ({
          role: entry.role,
          content: entry.content,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error("SOA strategy draft request failed.");
    }

    return (await response.json()) as StrategyDraftResponseV1;
  }

  async function requestProductDrafts(nextAssessment: IntakeAssessmentV1) {
    const response = await fetch("/api/finley/soa/product-draft", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        clientName: activeClient?.name ?? null,
        objectives: nextAssessment.candidateObjectives.map((objective) => ({
          text: objective.text,
          priority: objective.priority ?? null,
        })),
        scope: {
          included: nextAssessment.candidateScopeInclusions.map((topic) => ({ scopeItemId: makeId("scope"), topic })),
          excluded: nextAssessment.candidateScopeExclusions.map((topic) => ({ scopeItemId: makeId("scope"), topic })),
          limitations: [],
        },
        riskProfile: adviceCase.riskProfile ?? null,
        intakeAssessment: nextAssessment,
        uploadedFiles: uploads.map((upload) => ({
          name: upload.name,
          kind: upload.kind,
          extractedText: upload.extractedText ?? null,
        })),
        recentMessages: messages.slice(-8).map((entry) => ({
          role: entry.role,
          content: entry.content,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error("SOA product draft request failed.");
    }

    return (await response.json()) as ProductDraftResponseV1;
  }

  function getCurrentSectionState(sectionId: SectionId) {
    if (sectionId === "scope-of-advice") {
      return {
        schema: {
          included: "Agreed Scope field. Items that are included in the advice.",
          exclusions: "Limitations / Exclusions field. Items outside the advice scope or explicitly excluded.",
        },
        included: adviceCase.scope.included.map((item) => item.topic),
        exclusions: [...adviceCase.scope.excluded.map((item) => item.topic), ...adviceCase.scope.limitations],
      };
    }

    if (sectionId === "objectives") {
      return {
        schema: {
          objectives:
            "Client objectives. Each item has text and priority. The text should describe a client goal or desired advice outcome, not the adviser instruction.",
          priority: "One of high, medium, low, or unknown.",
        },
        objectives: adviceCase.objectives.map((objective) => ({
          text: objective.text,
          priority: objective.priority ?? "unknown",
        })),
      };
    }

    return {
      sectionId,
      adviceCase,
    };
  }

  async function requestSectionEdit(instruction: string) {
    const response = await fetch("/api/finley/soa/section-edit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sectionId: activeSectionId,
        clientName: activeClient?.name ?? null,
        adviserInstruction: instruction,
        sectionState: getCurrentSectionState(activeSectionId),
        recentMessages: messages.slice(-8).map((entry) => ({
          role: entry.role,
          content: entry.content,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error("SOA section edit request failed.");
    }

    return (await response.json()) as SoaSectionEditClientResponse;
  }

  async function sendMessage() {
    if (!composerValue.trim()) return;
    const text = composerValue.trim();
    const nextMessages: Message[] = [{ id: makeId("user"), role: "user", content: text }];
    const nextAnsweredQuestions = activeFollowUpQuestion
      ? answeredFollowUpQuestions.includes(activeFollowUpQuestion)
        ? answeredFollowUpQuestions
        : [...answeredFollowUpQuestions, activeFollowUpQuestion]
      : answeredFollowUpQuestions;
    const nextAnsweredResponses = activeFollowUpQuestion
      ? {
          ...answeredFollowUpResponses,
          [activeFollowUpQuestion]: text,
        }
      : answeredFollowUpResponses;

    if (activeFollowUpQuestion) {
      setAnsweredFollowUpQuestions((current) =>
        current.includes(activeFollowUpQuestion) ? current : [...current, activeFollowUpQuestion],
      );
      setAnsweredFollowUpResponses(nextAnsweredResponses);
      setActiveFollowUpQuestion(null);
    }

    setIsSendingMessage(true);

    try {
      if (!workflowStarted && uploads.length > 0 && isMeaningfulAdviserMessage(text)) {
          let nextAssessment: IntakeAssessmentV1;
          let intakeWarning: string | null;
          let strategyDraftResult: StrategyDraftResponseV1 | null = null;
          let productDraftResult: ProductDraftResponseV1 | null = null;

          try {
            const intakeResult = await requestIntakeAssessment(text, {
              activeQuestion: activeFollowUpQuestion,
              answeredResponses: nextAnsweredResponses,
            });
            nextAssessment = intakeResult.assessment;
            intakeWarning = intakeResult.warning ?? null;
          } catch {
            nextAssessment = intakeAssessment
              ? refineIntakeAssessment(intakeAssessment, {
                  clientName: activeClient?.name,
                  uploadedFileNames: uploads.map((upload) => upload.name),
                  adviserMessage: text,
                })
              : generateIntakeAssessment({
                  clientName: activeClient?.name,
                  uploadedFileNames: uploads.map((upload) => upload.name),
                adviserMessage: text,
              });
            intakeWarning = "The SOA intake endpoint was unavailable, so Finley used the local fallback intake engine.";
          }

          if (
            nextAssessment.candidateObjectives.length > 0 &&
            (nextAssessment.candidateModules.includes("strategy-advice") ||
              nextAssessment.candidateStrategyRecommendations.length > 0)
          ) {
            try {
              strategyDraftResult = await requestStrategyDrafts(nextAssessment);
            } catch {
              strategyDraftResult = null;
            }
          }

          if (
            nextAssessment.candidateObjectives.length > 0 &&
            (nextAssessment.candidateModules.includes("product-advice") ||
              nextAssessment.candidateProductReviewNotes.length > 0)
          ) {
            try {
              productDraftResult = await requestProductDrafts(nextAssessment);
            } catch {
              productDraftResult = null;
            }
          }

          setIntakeAssessment(nextAssessment);
          if (intakeWarning || strategyDraftResult?.warning || productDraftResult?.warning) {
            setImpactNotice([intakeWarning, strategyDraftResult?.warning, productDraftResult?.warning].filter(Boolean).join(" "));
          }
          setAdviceCase((current) => ({
            ...(() => {
              const nextObjectives = nextAssessment.candidateObjectives.map((objective) => ({
                objectiveId: makeId("objective"),
                ownerPersonIds: current.clientGroup.clients.map((client) => client.personId),
                text: objective.text,
                priority: objective.priority,
              }));
              const nextObjectiveIds = nextObjectives.map((objective) => objective.objectiveId);
              const objectiveIdByText = new Map(
                nextObjectives.map((objective) => [normalizeText(objective.text), objective.objectiveId]),
              );
              const strategicRecommendations =
                strategyDraftResult?.recommendations.length
                  ? strategyDraftResult.recommendations.map((draft) => {
                      const linkedObjectiveIds = draft.linkedObjectiveTexts
                        .map((objectiveText) => objectiveIdByText.get(normalizeText(objectiveText)) ?? null)
                        .filter((objectiveId): objectiveId is string => Boolean(objectiveId));

                      return {
                      recommendationId: makeId("strategy"),
                      type: draft.type || "other",
                      recommendationText: draft.recommendationText,
                      linkedObjectiveIds: linkedObjectiveIds.length ? linkedObjectiveIds : nextObjectiveIds,
                      targetAmount: null,
                      monthlyContribution: null,
                      annualContribution: null,
                      contributionFrequency: "unknown" as const,
                      targetDate: null,
                      reviewFrequency: "unknown" as const,
                      fundingSource: null,
                      priorityRank: null,
                      assumptionNote: null,
                      amountConfidence: "pending-confirmation" as const,
                      clientBenefits: draft.clientBenefits.map((benefit) => ({
                        benefitId: makeId("benefit"),
                        text: benefit,
                        linkedObjectiveIds: null,
                      })),
                      consequences: draft.consequences.map((consequence) => ({
                        consequenceId: makeId("consequence"),
                        type: "trade-off" as const,
                        text: consequence,
                      })),
                      alternativesConsidered: draft.alternativesConsidered.map((alternative) => ({
                        alternativeId: makeId("alternative"),
                        optionText: alternative,
                        reasonNotRecommended: null,
                      })),
                      rationale: draft.rationale ?? null,
                      };
                    })
                  : nextAssessment.candidateStrategyRecommendations.map((recommendationText) => ({
                      recommendationId: makeId("strategy"),
                      type: "other",
                      recommendationText,
                      linkedObjectiveIds: nextObjectiveIds,
                      targetAmount: null,
                      monthlyContribution: null,
                      annualContribution: null,
                      contributionFrequency: "unknown" as const,
                      targetDate: null,
                      reviewFrequency: "unknown" as const,
                      fundingSource: null,
                      priorityRank: null,
                      assumptionNote: null,
                      amountConfidence: "pending-confirmation" as const,
                      clientBenefits: [],
                      consequences: [],
                      alternativesConsidered: [],
                      rationale: null,
                    }));
              const productRecommendations =
                productDraftResult?.recommendations.length
                  ? productDraftResult.recommendations.map((draft) => {
                      const linkedObjectiveIds = draft.linkedObjectiveTexts
                        .map((objectiveText) => objectiveIdByText.get(normalizeText(objectiveText)) ?? null)
                        .filter((objectiveId): objectiveId is string => Boolean(objectiveId));

                      return {
                        recommendationId: makeId("product"),
                        action: draft.action,
                        productType: draft.productType,
                        recommendedProductName: draft.recommendedProductName ?? null,
                        recommendedProvider: draft.recommendedProvider ?? null,
                        linkedObjectiveIds: linkedObjectiveIds.length ? linkedObjectiveIds : nextObjectiveIds,
                        recommendationText: draft.recommendationText,
                        targetAmount: null,
                        transferAmount: null,
                        monthlyFundingAmount: null,
                        annualFundingAmount: null,
                        implementationDate: null,
                        reviewFrequency: "unknown" as const,
                        fundingSource: null,
                        priorityRank: null,
                        assumptionNote: null,
                        amountConfidence: "pending-confirmation" as const,
                        clientBenefits: draft.clientBenefits.map((benefit) => ({
                          benefitId: makeId("benefit"),
                          text: benefit,
                          linkedObjectiveIds: null,
                        })),
                        consequences: draft.consequences.map((consequence) => ({
                          consequenceId: makeId("consequence"),
                          type: "trade-off" as const,
                          text: consequence,
                        })),
                        suitabilityRationale: draft.suitabilityRationale ?? null,
                        currentProductName: draft.currentProductName ?? null,
                        currentProvider: draft.currentProvider ?? null,
                        comparison: null,
                        alternativesConsidered: draft.alternativesConsidered.map((alternative) => ({
                          alternativeId: makeId("alternative"),
                          productName: alternative.productName ?? null,
                          provider: alternative.provider ?? null,
                          reasonDiscounted: alternative.reasonDiscounted ?? null,
                        })),
                      };
                    })
                  : nextAssessment.candidateProductReviewNotes.length > 0
                    ? nextAssessment.candidateProductReviewNotes.map((note) => ({
                        recommendationId: makeId("product"),
                        action: "retain" as const,
                        productType: "other" as const,
                        recommendedProductName: null,
                        recommendedProvider: null,
                        linkedObjectiveIds: nextObjectiveIds,
                        recommendationText: note,
                        targetAmount: null,
                        transferAmount: null,
                        monthlyFundingAmount: null,
                        annualFundingAmount: null,
                        implementationDate: null,
                        reviewFrequency: "unknown" as const,
                        fundingSource: null,
                        priorityRank: null,
                        assumptionNote: null,
                        amountConfidence: "pending-confirmation" as const,
                        clientBenefits: [],
                        consequences: [],
                        suitabilityRationale: null,
                        currentProductName: null,
                        currentProvider: null,
                        comparison: null,
                        alternativesConsidered: [],
                      }))
                    : current.recommendations.product;
              const ownerPersonIdByName = new Map(
                current.clientGroup.clients.map((client) => [normalizeText(client.fullName), client.personId]),
              );
              const resolvePersonIdByName = (name?: string | null) => {
                const normalizedName = normalizeText(name ?? "");
                if (!normalizedName) return null;

                const exactMatch = ownerPersonIdByName.get(normalizedName);
                if (exactMatch) return exactMatch;

                return (
                  current.clientGroup.clients.find((client) => {
                    const clientName = normalizeText(client.fullName);
                    return clientName.includes(normalizedName) || normalizedName.includes(clientName);
                  })?.personId ?? null
                );
              };
              const commercialDetails = nextAssessment.commercialsAndAgreements;
              const intakeAdviceFees = [
                commercialDetails.advicePreparationFee !== null && commercialDetails.advicePreparationFee !== undefined
                  ? {
                      feeId: makeId("advice-fee"),
                      type: "preparation" as const,
                      amount: commercialDetails.advicePreparationFee,
                    }
                  : null,
                commercialDetails.implementationFee !== null && commercialDetails.implementationFee !== undefined
                  ? {
                      feeId: makeId("advice-fee"),
                      type: "implementation" as const,
                      amount: commercialDetails.implementationFee,
                    }
                  : null,
              ].filter((fee): fee is NonNullable<typeof fee> => Boolean(fee));
              const intakeCommissions = commercialDetails.insuranceCommissionDetails.map((commission) => ({
                commissionId: makeId("commission"),
                type: "upfront" as const,
                productType: "insurance" as const,
                ownerPersonId: resolvePersonIdByName(commission.ownerName),
                productName: commission.productName ?? null,
                percentage: null,
                amount: null,
                upfrontPercentage: commission.upfrontPercentage ?? null,
                upfrontAmount: commission.upfrontAmount ?? null,
                ongoingPercentage: commission.ongoingPercentage ?? null,
                ongoingAmount: commission.ongoingAmount ?? null,
                disclosed: commercialDetails.insuranceCommissionsIncluded ?? null,
              }));
              const serviceAgreementFeeItems = commercialDetails.serviceAgreementItems.map((item) => ({
                feeItemId: makeId("service-fee"),
                ownerPersonId: resolvePersonIdByName(item.ownerName),
                productName: item.productName ?? null,
                accountNumber: item.accountNumber ?? null,
                feeAmount: item.feeAmount ?? null,
                frequency: item.frequency && item.frequency !== "unknown" ? item.frequency : ("monthly" as const),
              }));
              const insurancePolicyRecommendations = (nextAssessment.candidateInsurancePolicyRecommendations ?? []).map((policy) => ({
                policyRecommendationId: makeId("insurance-policy"),
                insuredPersonId: resolvePersonIdByName(policy.insuredName),
                action: policy.action ?? ("apply-new" as const),
                insurerName: policy.insurerName ?? null,
                productName: policy.productName ?? null,
                policyName: policy.policyName ?? null,
                recommendationText: policy.recommendationText ?? null,
                ownershipGroups: policy.ownershipGroups.map((group) => ({
                  groupId: makeId("insurance-group"),
                  ownership: group.ownership ?? "unknown",
                  fundingSource: group.fundingSource ?? null,
                  premiumFrequency: group.premiumFrequency ?? "unknown",
                  premiumAmount: group.premiumAmount ?? null,
                  annualisedPremium: group.annualisedPremium ?? null,
                  covers: group.covers.map((cover) => ({
                    coverId: makeId("insurance-cover"),
                    coverType: cover.coverType ?? "other",
                    details: cover.details ?? null,
                    premiumType: cover.premiumType ?? "unknown",
                    sumInsured: cover.sumInsured ?? null,
                    monthlyBenefit: cover.monthlyBenefit ?? null,
                    waitingPeriod: cover.waitingPeriod ?? null,
                    benefitPeriod: cover.benefitPeriod ?? null,
                  })),
                })),
                optionalBenefits: policy.optionalBenefits,
                premiumBreakdown: policy.premiumBreakdown.map((item) => ({
                  itemId: makeId("premium-breakdown"),
                  ownership: item.ownership ?? "unknown",
                  label: item.label,
                  amount: item.amount ?? null,
                })),
                underwritingNotes: policy.underwritingNotes ?? null,
                replacementNotes: policy.replacementNotes ?? null,
                sourceFileName: policy.sourceNote ?? null,
                sourceEvidence: policy.sourceNote ?? null,
              }));
              const insuranceNeedsAnalyses = (nextAssessment.candidateInsuranceNeedsAnalyses ?? []).map((analysis) => {
                const ownerPersonId = resolvePersonIdByName(analysis.ownerName);
                return {
                  analysisId: makeId("insurance-analysis"),
                  ownerPersonIds: ownerPersonId ? [ownerPersonId] : current.clientGroup.clients.map((client) => client.personId),
                  policyType: analysis.policyType ?? ("other" as const),
                  methodology: normalizeInsuranceNeedsMethodology(analysis.methodology),
                  purpose: analysis.purpose ?? analysis.sourceNote ?? null,
                  inputs: {
                    annualIncome: analysis.annualIncome ?? null,
                    annualLivingExpenses: analysis.annualLivingExpenses ?? null,
                    liabilitiesToRepay: analysis.liabilitiesToRepay ?? null,
                    dependantsCount: analysis.dependantsCount ?? null,
                    dependantSupportYears: analysis.dependantSupportYears ?? null,
                    educationCosts: analysis.educationCosts ?? null,
                    existingCoverAmount: analysis.existingCoverAmount ?? null,
                    superannuationBalance: analysis.superannuationBalance ?? null,
                    emergencyReserve: null,
                    otherAssetsAvailable: analysis.otherAssetsAvailable ?? null,
                    waitingPeriodMonths: null,
                    benefitPeriodYears: null,
                    notes: analysis.sourceNote ?? null,
                  },
                  outputs: {
                    targetCoverAmount: analysis.targetCoverAmount ?? null,
                    coverGapAmount: analysis.coverGapAmount ?? null,
                    suggestedWaitingPeriod: analysis.suggestedWaitingPeriod ?? null,
                    suggestedBenefitPeriod: analysis.suggestedBenefitPeriod ?? null,
                    suggestedPolicyOwnership: analysis.suggestedPolicyOwnership ?? "unknown",
                    suggestedStructureNotes: analysis.sourceNote ?? null,
                  },
                  rationale: analysis.rationale ?? null,
                };
              });
              const insurancePolicyReplacements = (nextAssessment.candidateInsurancePolicyReplacements ?? []).map((replacement) => {
                const ownerPersonId = resolvePersonIdByName(replacement.ownerName);
                return {
                  replacementId: makeId("insurance-replacement"),
                  ownerPersonId,
                  currentPolicy: {
                    insurer: replacement.currentInsurer ?? null,
                    totalLifeCover: replacement.currentLifeCover ?? null,
                    totalTpdCover: replacement.currentTpdCover ?? null,
                    totalIncomeProtectionCover: replacement.currentIncomeProtectionCover ?? null,
                    totalTraumaCover: replacement.currentTraumaCover ?? null,
                    totalAnnualPremium: replacement.currentAnnualPremium ?? null,
                  },
                  recommendedPolicy: {
                    insurer: replacement.recommendedInsurer ?? null,
                    totalLifeCover: replacement.recommendedLifeCover ?? null,
                    totalTpdCover: replacement.recommendedTpdCover ?? null,
                    totalIncomeProtectionCover: replacement.recommendedIncomeProtectionCover ?? null,
                    totalTraumaCover: replacement.recommendedTraumaCover ?? null,
                    totalAnnualPremium: replacement.recommendedAnnualPremium ?? null,
                  },
                  premiumDifference: replacement.premiumDifference ?? null,
                  reasons: replacement.reasons,
                  costs: replacement.costs,
                  benefitsGained: replacement.benefitsGained,
                  benefitsLost: replacement.benefitsLost,
                  notes: replacement.notes ?? replacement.sourceNote ?? null,
                  linkedPolicyRecommendationIds: [],
                };
              });

              return {
                ...current,
                blueprint: { includedModules: nextAssessment.candidateModules },
                objectives: nextObjectives,
                scope: {
                  ...current.scope,
                  included: nextAssessment.candidateScopeInclusions.map((topic) => ({
                    scopeItemId: makeId("scope"),
                    topic,
                  })),
                  excluded: nextAssessment.candidateScopeExclusions.map((topic) => ({
                    scopeItemId: makeId("scope"),
                    topic,
                  })),
                },
                recommendations: {
                  ...current.recommendations,
                  strategic: strategicRecommendations,
                  product: productRecommendations,
                  insuranceNeedsAnalyses:
                    insuranceNeedsAnalyses.length > 0
                      ? insuranceNeedsAnalyses
                      : nextAssessment.candidateInsuranceReviewNotes.length > 0
                      ? nextAssessment.candidateInsuranceReviewNotes.map((note) => ({
                          analysisId: makeId("insurance-analysis"),
                          ownerPersonIds: current.clientGroup.clients.map((client) => client.personId),
                          policyType: "other",
                          methodology: "other",
                          purpose: note,
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
                          rationale: null,
                        }))
                      : current.recommendations.insuranceNeedsAnalyses,
                  insurancePolicies: insurancePolicyRecommendations.length
                    ? insurancePolicyRecommendations
                    : current.recommendations.insurancePolicies,
                  insuranceReplacements: insurancePolicyReplacements.length
                    ? insurancePolicyReplacements
                    : current.recommendations.insuranceReplacements,
                },
                financialProjections:
                  nextAssessment.candidateProjectionNotes.length > 0
                    ? nextAssessment.candidateProjectionNotes.map((note) => ({
                        projectionId: makeId("projection"),
                        name: "Current vs recommended position",
                        projectionType: "comparison",
                        purpose: note,
                        timeframe: {
                          startDate: null,
                          projectionYears: 10,
                          retirementAge: null,
                          endAge: null,
                        },
                        assumptions: {
                          inflationPct: null,
                          earningsRatePct: null,
                          salaryGrowthPct: null,
                          contributionGrowthPct: null,
                          drawdownRatePct: null,
                          taxAssumptions: null,
                          legislativeAssumptions: null,
                          notes: null,
                        },
                        inputsSummary: null,
                        outputs: {
                          currentPositionSummary: null,
                          recommendedPositionSummary: null,
                          betterPositionSummary: null,
                          keyMetrics: [],
                          yearlySeries: [],
                        },
                        linkedRecommendationIds: [],
                        rationale: null,
                      }))
                    : current.financialProjections,
                fees: {
                  ...current.fees,
                  adviceFees: intakeAdviceFees.length ? intakeAdviceFees : current.fees.adviceFees,
                  commissions: intakeCommissions.length ? intakeCommissions : current.fees.commissions,
                },
                agreements: {
                  ...current.agreements,
                  feeAgreement:
                    commercialDetails.serviceAgreementIncluded === true
                      ? {
                          present: true,
                          agreementType:
                            commercialDetails.serviceAgreementType === "fixed-term"
                              ? ("fixed-term" as const)
                              : commercialDetails.serviceAgreementType === "ongoing"
                                ? ("ongoing" as const)
                                : ("ongoing" as const),
                          services: current.agreements.feeAgreement?.services.length
                            ? current.agreements.feeAgreement.services
                            : DEFAULT_SERVICE_AGREEMENT_SERVICES,
                          feeItems: serviceAgreementFeeItems,
                        }
                      : current.agreements.feeAgreement,
                },
                metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
              };
            })(),
          }));

          nextMessages.push({
            id: makeId("assistant"),
            role: "assistant",
            content: (() => {
              const outstandingQuestions = getOutstandingFollowUpQuestions(nextAssessment, nextAnsweredQuestions);
              const confirmationCount = nextAssessment.evidenceBackedConfirmations?.length ?? 0;

              if (outstandingQuestions.length) {
                return `I’ve updated the SOA brief for ${activeClient?.name ?? "this client"} and refined the remaining questions based on your latest answer.`;
              }

              if (confirmationCount > 0) {
                return `I’ve updated the SOA brief for ${activeClient?.name ?? "this client"} and captured the document-backed items for your confirmation.`;
              }

              return `I’ve updated the SOA brief for ${activeClient?.name ?? "this client"}.`;
            })(),
            intakeAssessment: nextAssessment,
          });
      } else {
        const sectionUpdateSummary = workflowStarted ? await applyActiveSectionChatUpdate(text) : null;
        nextMessages.push({
          id: makeId("assistant"),
          role: "assistant",
          content: sectionUpdateSummary
            ? `${sectionUpdateSummary} Review the card and save the section when you’re happy with it.`
            : `Working in ${SECTION_CONFIGS.find((section) => section.id === activeSectionId)?.label}. I captured that note, but I could not safely map it into a structured field yet. Try saying “add…”, “remove…”, or “replace with…” and include the exact wording you want in the card.`,
        });
      }

      setMessages((current) => [...current, ...nextMessages]);
      setComposerValue("");
    } finally {
      setIsSendingMessage(false);
    }
  }

  function updateRiskProfile(personId: string, profile: RiskProfileV1["profile"]) {
    setRiskProfilesByPerson((current) => ({
      ...current,
      [personId]: {
        ...(current[personId] ?? createEmptyRiskProfile()),
        profile,
      },
    }));
    setAdviceCase((current) => ({
      ...current,
      riskProfile: {
        ...((personId === current.clientGroup.clients[0]?.personId ? current.riskProfile : null) ?? createEmptyRiskProfile()),
        profile,
      },
      metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
    }));
    setConfirmedSections((current) => ({ ...current, "risk-profile": false }));
  }

  function confirmSection(sectionId: SectionId) {
    setConfirmedSections((current) => ({ ...current, [sectionId]: true }));
  }

  function goToPreviousSection() {
    if (activeSectionIndex <= 0) return;
    setActiveSectionId(sections[activeSectionIndex - 1]?.id ?? activeSectionId);
  }

  function goToNextSection() {
    if (activeSectionIndex < 0 || activeSectionIndex >= sections.length - 1) return;
    setActiveSectionId(sections[activeSectionIndex + 1]?.id ?? activeSectionId);
  }

  function applySelectedProductRexUpload(uploadId: string) {
    const selectedUpload = uploads.find((upload) => upload.id === uploadId);
    if (!selectedUpload?.productRexReport) {
      return;
    }

    setSelectedProductRexUploadId(uploadId);
    setAdviceCase((current) => mergeProductRexIntoCase(current, selectedUpload.productRexReport as ProductRexReportV1));
    setConfirmedSections((current) => ({
      ...current,
      "product-recommendations": false,
      "replacement-analysis": false,
      "portfolio-allocation": false,
      disclosure: false,
    }));
    setImpactNotice(
      `Using ProductRex data from ${selectedUpload.name} to populate the product, replacement, portfolio, and fee sections.`,
    );
  }

  async function applyActiveSectionChatUpdate(text: string) {
    const mode = getSectionChatEditMode(text);
    const lines = extractChatInstructionLines(text);
    const sectionLabel = SECTION_CONFIGS.find((section) => section.id === activeSectionId)?.label ?? "this section";
    const nextTimestamp = new Date().toISOString();

    if (activeSectionId === "risk-profile") {
      const nextProfile = findRiskProfileInText(text);
      if (!nextProfile || !activeRiskPersonId) {
        return null;
      }

      updateRiskProfile(activeRiskPersonId, nextProfile);
      setConfirmedSections((current) => ({ ...current, "risk-profile": false }));
      return `Set ${sectionLabel} to ${toTitleCase(nextProfile)}.`;
    }

    if (!lines.length) {
      return null;
    }

    let summary: string | null = null;

    const current = adviceCase;
    const nextAdviceCase = (() => {
      if (activeSectionId === "scope-of-advice") {
        return current;
      }

      if (activeSectionId === "objectives") {
        return current;
      }

      if (activeSectionId === "strategy-recommendations") {
        const targetRecommendation = current.recommendations.strategic[0];
        if (!targetRecommendation) {
          summary = "Add a strategy recommendation first, then I can update it from chat.";
          return current;
        }

        const activeTab = strategyRecommendationTabs[targetRecommendation.recommendationId] ?? "recommendation";
        summary = `Updated Strategy Recommendation 1 ${activeTab === "reasons" ? "client benefits" : activeTab}.`;

        return {
          ...current,
          recommendations: {
            ...current.recommendations,
            strategic: current.recommendations.strategic.map((entry) => {
              if (entry.recommendationId !== targetRecommendation.recommendationId) {
                return entry;
              }

              if (activeTab === "reasons") {
                const currentBenefits = entry.clientBenefits.map((benefit) => benefit.text);
                const nextBenefits = mode === "replace" ? lines : appendUniqueValues(currentBenefits, lines);
                return {
                  ...entry,
                  clientBenefits: nextBenefits.map((benefitText) => ({
                    benefitId: makeId("benefit"),
                    text: benefitText,
                    linkedObjectiveIds: null,
                  })),
                  rationale: null,
                };
              }

              if (activeTab === "consequences") {
                const currentConsequences = entry.consequences.map((consequence) => consequence.text);
                const nextConsequences = mode === "replace" ? lines : appendUniqueValues(currentConsequences, lines);
                return {
                  ...entry,
                  consequences: nextConsequences.map((consequenceText) => ({
                    consequenceId: makeId("consequence"),
                    type: "trade-off" as const,
                    text: consequenceText,
                  })),
                };
              }

              if (activeTab === "alternatives") {
                const currentAlternatives = entry.alternativesConsidered.map((alternative) => alternative.optionText);
                const nextAlternatives = mode === "replace" ? lines : appendUniqueValues(currentAlternatives, lines);
                return {
                  ...entry,
                  alternativesConsidered: nextAlternatives.map((alternativeText) => ({
                    alternativeId: makeId("alternative"),
                    optionText: alternativeText,
                    reasonNotRecommended: null,
                  })),
                };
              }

              return {
                ...entry,
                recommendationText: mode === "replace" ? lines.join("\n") : [entry.recommendationText, ...lines].filter(Boolean).join("\n"),
              };
            }),
          },
          metadata: { ...current.metadata, updatedAt: nextTimestamp },
        };
      }

      if (activeSectionId === "product-recommendations") {
        const targetRecommendation = current.recommendations.product[0];
        if (!targetRecommendation) {
          summary = "Add a product recommendation first, then I can update it from chat.";
          return current;
        }

        const activeTab = productRecommendationTabs[targetRecommendation.recommendationId] ?? "recommendation";
        summary = `Updated Product Recommendation 1 ${activeTab === "reasons" ? "client benefits" : activeTab}.`;

        return {
          ...current,
          recommendations: {
            ...current.recommendations,
            product: current.recommendations.product.map((entry) => {
              if (entry.recommendationId !== targetRecommendation.recommendationId) {
                return entry;
              }

              if (activeTab === "reasons") {
                const currentBenefits = entry.clientBenefits.map((benefit) => benefit.text);
                const nextBenefits = mode === "replace" ? lines : appendUniqueValues(currentBenefits, lines);
                return {
                  ...entry,
                  clientBenefits: nextBenefits.map((benefitText) => ({
                    benefitId: makeId("benefit"),
                    text: benefitText,
                    linkedObjectiveIds: null,
                  })),
                  suitabilityRationale: null,
                };
              }

              if (activeTab === "consequences") {
                const currentConsequences = entry.consequences.map((consequence) => consequence.text);
                const nextConsequences = mode === "replace" ? lines : appendUniqueValues(currentConsequences, lines);
                return {
                  ...entry,
                  consequences: nextConsequences.map((consequenceText) => ({
                    consequenceId: makeId("consequence"),
                    type: "trade-off" as const,
                    text: consequenceText,
                  })),
                };
              }

              if (activeTab === "alternatives") {
                const currentAlternatives = entry.alternativesConsidered.map((alternative) => alternative.productName ?? alternative.reasonDiscounted ?? "");
                const nextAlternatives = mode === "replace" ? lines : appendUniqueValues(currentAlternatives, lines);
                return {
                  ...entry,
                  alternativesConsidered: nextAlternatives.map((alternativeText) => ({
                    alternativeId: makeId("product-alternative"),
                    productName: alternativeText,
                    provider: null,
                    reasonDiscounted: null,
                  })),
                };
              }

              return {
                ...entry,
                recommendationText: mode === "replace" ? lines.join("\n") : [entry.recommendationText, ...lines].filter(Boolean).join("\n"),
              };
            }),
          },
          metadata: { ...current.metadata, updatedAt: nextTimestamp },
        };
      }

      if (activeSectionId === "replacement-analysis") {
        const targetRecommendation = current.recommendations.replacement[0];
        if (!targetRecommendation) {
          summary = "Add a replacement analysis first, then I can update it from chat.";
          return current;
        }

        summary = "Updated replacement reasons.";
        return {
          ...current,
          recommendations: {
            ...current.recommendations,
            replacement: current.recommendations.replacement.map((entry) =>
              entry.recommendationId === targetRecommendation.recommendationId
                ? {
                    ...entry,
                    replacementReasonText:
                      mode === "replace" ? lines.join("\n") : [entry.replacementReasonText, ...lines].filter(Boolean).join("\n"),
                  }
                : entry,
            ),
          },
          metadata: { ...current.metadata, updatedAt: nextTimestamp },
        };
      }

      if (activeSectionId === "disclosure") {
        const feeAmount = parseCurrencyAmountFromText(text);
        const isPreparationFee = /\b(preparation|plan)\b/i.test(text);
        const isImplementationFee = /\bimplementation\b/i.test(text);

        if (feeAmount !== null && (isPreparationFee || isImplementationFee)) {
          const feeType: UpfrontFeeType = isPreparationFee ? "preparation" : "implementation";
          const existingFee = current.fees.adviceFees.find((fee) => fee.type === feeType);
          summary = `Updated ${feeType === "preparation" ? "advice preparation" : "implementation"} fee.`;
          return {
            ...current,
            fees: {
              ...current.fees,
              adviceFees: [
                ...current.fees.adviceFees.filter((fee) => fee.type !== feeType),
                {
                  feeId: existingFee?.feeId ?? makeId("advice-fee"),
                  type: feeType,
                  amount: feeAmount,
                },
              ],
            },
            metadata: { ...current.metadata, updatedAt: nextTimestamp },
          };
        }
      }

      summary = null;
      return current;
    })();

    if (nextAdviceCase !== current) {
      setAdviceCase(nextAdviceCase);
    }

    if (summary) {
      setConfirmedSections((current) => ({ ...current, [activeSectionId]: false }));
    }

    if (summary) {
      return summary;
    }

    if (activeSectionId === "scope-of-advice") {
      try {
        const edit = await requestSectionEdit(text);
        if (!edit.scope) {
          if (edit.warning) {
            setImpactNotice(edit.warning);
          }
          return edit.summary || null;
        }

        setAdviceCase((current) => ({
          ...current,
          scope: {
            ...current.scope,
            included: edit.scope?.included.map((topic) => ({ scopeItemId: makeId("scope"), topic })) ?? [],
            excluded: edit.scope?.exclusions.map((topic) => ({ scopeItemId: makeId("scope"), topic })) ?? [],
            limitations: [],
          },
          metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
        }));
        setConfirmedSections((current) => ({ ...current, "scope-of-advice": false }));

        if (edit.warning) {
          setImpactNotice(edit.warning);
        }

        return edit.summary || "Updated Scope of Advice.";
      } catch {
        return "Finley could not reach the schema-aware section editor. No card changes were made.";
      }
    }

    if (activeSectionId === "objectives") {
      try {
        const edit = await requestSectionEdit(text);
        if (!edit.objectives) {
          if (edit.warning) {
            setImpactNotice(edit.warning);
          }
          return edit.summary || null;
        }

        setAdviceCase((current) => {
          const existingObjectiveByText = new Map(current.objectives.map((objective) => [normalizeText(objective.text), objective]));

          return {
            ...current,
            objectives:
              edit.objectives?.map((objective) => {
                const existingObjective = existingObjectiveByText.get(normalizeText(objective.text));

                return {
                  objectiveId: existingObjective?.objectiveId ?? makeId("objective"),
                  ownerPersonIds: existingObjective?.ownerPersonIds ?? current.clientGroup.clients.map((client) => client.personId),
                  text: objective.text,
                  priority: objective.priority ?? existingObjective?.priority ?? "unknown",
                };
              }) ?? [],
            metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
          };
        });
        setConfirmedSections((current) => ({ ...current, objectives: false }));

        if (edit.warning) {
          setImpactNotice(edit.warning);
        }

        return edit.summary || "Updated objectives.";
      } catch {
        return "Finley could not reach the schema-aware section editor. No card changes were made.";
      }
    }

    return null;
  }

  function getUpfrontFeeAmount(feeType: UpfrontFeeType) {
    return adviceCase.fees.adviceFees.find((fee) => fee.type === feeType)?.amount ?? null;
  }

  function getUpfrontFeeInputValue(feeType: UpfrontFeeType) {
    if (activeUpfrontFeeInput === feeType) {
      return upfrontFeeDrafts[feeType];
    }

    const amount = getUpfrontFeeAmount(feeType);
    return amount === null ? "" : formatCurrency(amount);
  }

  function beginUpfrontFeeEdit(feeType: UpfrontFeeType) {
    const amount = getUpfrontFeeAmount(feeType);
    setActiveUpfrontFeeInput(feeType);
    setUpfrontFeeDrafts((current) => ({
      ...current,
      [feeType]: amount === null ? "" : String(amount),
    }));
  }

  function updateUpfrontFee(feeType: UpfrontFeeType, rawValue: string) {
    const nextAmount = parseCurrencyInput(rawValue);
    setUpfrontFeeDrafts((current) => ({ ...current, [feeType]: rawValue }));
    setAdviceCase((current) => {
      const existingFee = current.fees.adviceFees.find((fee) => fee.type === feeType);
      const existingFees = current.fees.adviceFees.filter((fee) => fee.type !== feeType);

      return {
        ...current,
        fees: {
          ...current.fees,
          adviceFees: [
            ...existingFees,
            {
              feeId: existingFee?.feeId ?? makeId("advice-fee"),
              type: feeType,
              amount: nextAmount,
            },
          ],
        },
        metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
      };
    });
    setConfirmedSections((current) => ({ ...current, disclosure: false }));
  }

  function getCommissionDraftKey(commissionId: string, field: CommissionDraftField) {
    return `${commissionId}:${field}`;
  }

  function getCommissionInputValue(commissionId: string, field: CommissionDraftField, value?: number | null) {
    if (activeCommissionInput?.commissionId === commissionId && activeCommissionInput.field === field) {
      return commissionDrafts[getCommissionDraftKey(commissionId, field)] ?? "";
    }

    if (value === null || value === undefined || Number.isNaN(value)) {
      return "";
    }

    return field === "upfrontPercentage" || field === "ongoingPercentage" ? formatPercent(value) : formatCurrency(value);
  }

  function beginCommissionEdit(commissionId: string, field: CommissionDraftField, value?: number | null) {
    setActiveCommissionInput({ commissionId, field });
    setCommissionDrafts((current) => ({
      ...current,
      [getCommissionDraftKey(commissionId, field)]: value === null || value === undefined || Number.isNaN(value) ? "" : String(value),
    }));
  }

  function updateCommissionNumber(commissionId: string, field: CommissionDraftField, rawValue: string) {
    const nextValue =
      field === "upfrontPercentage" || field === "ongoingPercentage"
        ? parsePercentInput(rawValue)
        : parseCurrencyInput(rawValue);
    setCommissionDrafts((current) => ({ ...current, [getCommissionDraftKey(commissionId, field)]: rawValue }));
    setAdviceCase((current) => ({
      ...current,
      fees: {
        ...current.fees,
        commissions: current.fees.commissions.map((entry) =>
          entry.commissionId === commissionId ? { ...entry, [field]: nextValue } : entry,
        ),
      },
      metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
    }));
    setConfirmedSections((current) => ({ ...current, disclosure: false }));
  }

  function getCommissionOwnerPersonId(ownerPersonId?: string | null) {
    return ownerPersonId && adviceCase.clientGroup.clients.some((person) => person.personId === ownerPersonId)
      ? ownerPersonId
      : adviceCase.clientGroup.clients[0]?.personId ?? "";
  }

  function getCommissionOwnerLabel(personId?: string | null) {
    const person = adviceCase.clientGroup.clients.find((entry) => entry.personId === personId);
    return person?.fullName?.trim() || (person?.role === "partner" ? "Partner" : "Client");
  }

  function getCommissionNumberValue(
    commission: AdviceCaseV1["fees"]["commissions"][number],
    field: CommissionDraftField,
  ) {
    switch (field) {
      case "upfrontPercentage":
        return commission.upfrontPercentage ?? (commission.type === "upfront" ? commission.percentage : null) ?? DEFAULT_UPFRONT_COMMISSION_PERCENTAGE;
      case "upfrontAmount":
        return commission.upfrontAmount ?? (commission.type === "upfront" ? commission.amount : null);
      case "ongoingPercentage":
        return commission.ongoingPercentage ?? (commission.type === "ongoing" ? commission.percentage : null) ?? DEFAULT_ONGOING_COMMISSION_PERCENTAGE;
      case "ongoingAmount":
        return commission.ongoingAmount ?? (commission.type === "ongoing" ? commission.amount : null);
      default:
        return null;
    }
  }

  function updateInsurancePolicy(policyId: string, patch: Partial<InsurancePolicyRecommendationV1>) {
    setAdviceCase((current) => ({
      ...current,
      recommendations: {
        ...current.recommendations,
        insurancePolicies: (current.recommendations.insurancePolicies ?? []).map((policy) =>
          policy.policyRecommendationId === policyId ? { ...policy, ...patch } : policy,
        ),
      },
      metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
    }));
    setConfirmedSections((current) => ({ ...current, "insurance-policies": false }));
  }

  function updateInsuranceOwnershipGroup(
    policyId: string,
    groupId: string,
    patch: Partial<InsurancePolicyOwnershipGroupV1>,
  ) {
    setAdviceCase((current) => ({
      ...current,
      recommendations: {
        ...current.recommendations,
        insurancePolicies: (current.recommendations.insurancePolicies ?? []).map((policy) =>
          policy.policyRecommendationId === policyId
            ? {
                ...policy,
                ownershipGroups: policy.ownershipGroups.map((group) =>
                  group.groupId === groupId ? { ...group, ...patch } : group,
                ),
              }
            : policy,
        ),
      },
      metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
    }));
    setConfirmedSections((current) => ({ ...current, "insurance-policies": false }));
  }

  function updateInsuranceCover(
    policyId: string,
    groupId: string,
    coverId: string,
    patch: Partial<InsurancePolicyCoverComponentV1>,
  ) {
    setAdviceCase((current) => ({
      ...current,
      recommendations: {
        ...current.recommendations,
        insurancePolicies: (current.recommendations.insurancePolicies ?? []).map((policy) =>
          policy.policyRecommendationId === policyId
            ? {
                ...policy,
                ownershipGroups: policy.ownershipGroups.map((group) =>
                  group.groupId === groupId
                    ? {
                        ...group,
                        covers: group.covers.map((cover) => (cover.coverId === coverId ? { ...cover, ...patch } : cover)),
                      }
                    : group,
                ),
              }
            : policy,
        ),
      },
      metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
    }));
    setConfirmedSections((current) => ({ ...current, "insurance-policies": false }));
  }

  function updateInsuranceNeedsAnalysis(
    analysisId: string,
    patch: Partial<NonNullable<AdviceCaseV1["recommendations"]["insuranceNeedsAnalyses"]>[number]>,
  ) {
    setAdviceCase((current) => ({
      ...current,
      recommendations: {
        ...current.recommendations,
        insuranceNeedsAnalyses: (current.recommendations.insuranceNeedsAnalyses ?? []).map((entry) =>
          entry.analysisId === analysisId ? { ...entry, ...patch } : entry,
        ),
      },
      metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
    }));
    setConfirmedSections((current) => ({ ...current, "insurance-analysis": false }));
  }

  function updateInsuranceNeedsAnalysisInput(
    analysisId: string,
    patch: Partial<NonNullable<AdviceCaseV1["recommendations"]["insuranceNeedsAnalyses"]>[number]["inputs"]>,
  ) {
    setAdviceCase((current) => ({
      ...current,
      recommendations: {
        ...current.recommendations,
        insuranceNeedsAnalyses: (current.recommendations.insuranceNeedsAnalyses ?? []).map((entry) =>
          entry.analysisId === analysisId ? { ...entry, inputs: { ...entry.inputs, ...patch } } : entry,
        ),
      },
      metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
    }));
    setConfirmedSections((current) => ({ ...current, "insurance-analysis": false }));
  }

  function updateInsuranceNeedsAnalysisOutput(
    analysisId: string,
    patch: Partial<NonNullable<AdviceCaseV1["recommendations"]["insuranceNeedsAnalyses"]>[number]["outputs"]>,
  ) {
    setAdviceCase((current) => ({
      ...current,
      recommendations: {
        ...current.recommendations,
        insuranceNeedsAnalyses: (current.recommendations.insuranceNeedsAnalyses ?? []).map((entry) =>
          entry.analysisId === analysisId ? { ...entry, outputs: { ...entry.outputs, ...patch } } : entry,
        ),
      },
      metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
    }));
    setConfirmedSections((current) => ({ ...current, "insurance-analysis": false }));
  }

  function createInsuranceNeedsAnalysis(
    ownerPersonId: string,
    policyType: NonNullable<AdviceCaseV1["recommendations"]["insuranceNeedsAnalyses"]>[number]["policyType"] = "life",
  ): NonNullable<AdviceCaseV1["recommendations"]["insuranceNeedsAnalyses"]>[number] {
    return {
      analysisId: makeId("insurance-analysis"),
      ownerPersonIds: [ownerPersonId],
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
      rationale: null,
    };
  }

  function updateInsuranceReplacement(replacementId: string, patch: Partial<InsurancePolicyReplacementV1>) {
    setAdviceCase((current) => ({
      ...current,
      recommendations: {
        ...current.recommendations,
        insuranceReplacements: (current.recommendations.insuranceReplacements ?? []).map((replacement) =>
          replacement.replacementId === replacementId ? { ...replacement, ...patch } : replacement,
        ),
      },
      metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
    }));
    setConfirmedSections((current) => ({ ...current, "insurance-replacement": false }));
  }

  function updateInsuranceReplacementPolicy(
    replacementId: string,
    side: "currentPolicy" | "recommendedPolicy",
    patch: Partial<InsurancePolicyReplacementV1["currentPolicy"]>,
  ) {
    setAdviceCase((current) => ({
      ...current,
      recommendations: {
        ...current.recommendations,
        insuranceReplacements: (current.recommendations.insuranceReplacements ?? []).map((replacement) =>
          replacement.replacementId === replacementId
            ? { ...replacement, [side]: { ...replacement[side], ...patch } }
            : replacement,
        ),
      },
      metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
    }));
    setConfirmedSections((current) => ({ ...current, "insurance-replacement": false }));
  }

  function updateServiceAgreementFeeItem(
    feeItemId: string,
    nextValues: Partial<ServiceAgreementFeeItemV1>,
  ) {
    setAdviceCase((current) => ({
      ...current,
      agreements: {
        feeAgreement: {
          ...(current.agreements.feeAgreement ?? {
            present: true,
            agreementType: "ongoing" as const,
            services: [],
          }),
          feeItems: (current.agreements.feeAgreement?.feeItems ?? []).map((item) =>
            item.feeItemId === feeItemId ? { ...item, ...nextValues } : item,
          ),
        },
      },
      metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
    }));
    setConfirmedSections((current) => ({ ...current, "service-agreement": false }));
  }

  const factFindImportCounts = factFindImportCandidate ? getFactFindImportCounts(factFindImportCandidate) : null;
  const factFindImportTotalRecords = factFindImportCounts
    ? Object.values(factFindImportCounts).reduce((total, count) => total + count, 0)
    : 0;
  const factFindImportRecordGroups = factFindImportCandidate
    ? [
        { label: "Income", records: factFindImportCandidate.income },
        { label: "Expenses", records: factFindImportCandidate.expenses },
        { label: "Assets", records: factFindImportCandidate.assets },
        { label: "Liabilities", records: factFindImportCandidate.liabilities },
        { label: "Superannuation", records: factFindImportCandidate.superannuation },
        { label: "Pensions", records: factFindImportCandidate.pensions },
        { label: "Insurance", records: factFindImportCandidate.insurance },
      ]
    : [];

  return (
    <main className={`${finleyStyles.workspace} ${showLiveSoaPreview ? styles.workspaceWithLivePreview : ""}`.trim()}>
      <aside className={`${finleyStyles.sidebar} ${styles.sidebarFill}`.trim()}>
        <section className={finleyStyles.sidebarCard}>
          <div className={finleyStyles.sidebarHeader}>
            <span className={finleyStyles.sidebarLabel}>Client Selection</span>
            {activeClient ? (
              <div className={finleyStyles.activeClientCard}>
                <span className={finleyStyles.activeClientEyebrow}>Active Client</span>
                <span className={finleyStyles.activeClientName}>{activeClient.name}</span>
                <div className={finleyStyles.activeClientMeta}>
                  <span>{activeClient.clientAdviserName ?? "Adviser not set"}</span>
                  <span>{activeClient.clientAdviserPracticeName ?? "Practice not set"}</span>
                </div>
                <button type="button" className={finleyStyles.scopeSecondaryAction} onClick={clearSelectedClient}>
                  Change client
                </button>
              </div>
            ) : null}
          </div>
          {!activeClient ? (
            <>
              <div className={finleyStyles.clientSearchWrap}>
                <input
                  list="finley-soa-client-options"
                  className={finleyStyles.clientSearch}
                  placeholder="Search clients..."
                  value={clientSearch}
                  onChange={(event) => setClientSearch(event.target.value)}
                  onBlur={(event) => trySelectClientFromSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      trySelectClientFromSearch(clientSearch);
                    }
                  }}
                />
                <datalist id="finley-soa-client-options">
                  {serverClients.map((client) => (
                    <option key={client.id} value={client.name ?? ""} />
                  ))}
                </datalist>
              </div>
              {isLoadingClients ? <div className={finleyStyles.listNotice}>Loading clients...</div> : null}
              {!isLoadingClients && clientSearch.trim() && !serverClients.length ? (
                <div className={finleyStyles.listNotice}>No matching clients found.</div>
              ) : null}
            </>
          ) : null}
        </section>

        {workflowState === "workflow_started" || workflowState === "section_review" ? (
          <section className={`${finleyStyles.sidebarCard} ${styles.workflowCardFill}`.trim()}>
            <div className={finleyStyles.sidebarHeader}>
              <span className={finleyStyles.sidebarLabel}>SOA Workflow</span>
            </div>
              <div className={styles.sectionNav}>
                {sections.map((section) => {
                const status = getSectionStatus(
                  section.id,
                  adviceCase,
                  workflowState === "workflow_started" || workflowState === "section_review",
                  confirmedSections,
                );
                return (
                  <button
                    key={section.id}
                    type="button"
                    className={`${styles.sectionNavItem} ${activeSectionId === section.id ? styles.sectionNavItemActive : ""} ${status === "confirmed" ? styles.sectionNavItemConfirmed : ""}`.trim()}
                    onClick={() => setActiveSectionId(section.id)}
                  >
                    <div className={styles.sectionNavRow}>
                      <span className={styles.sectionNavTitle}>{section.label}</span>
                      <span className={`${styles.sectionStatusPill} ${styles[`status${status.replace(/-/g, "")}`]}`.trim()}>
                        {getSectionStatusLabel(status)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}
      </aside>

      <section className={finleyStyles.console}>
        <div className={finleyStyles.chatSurface}>
          {impactNotice ? <div className={styles.impactNotice}>{impactNotice}</div> : null}
          {showReadiness && readinessItems.length ? (
            <div className={styles.sectionCard}>
              <div className={styles.sectionCardTitle}>Readiness panel</div>
              <div className={styles.readinessList}>
                {readinessItems.map((item) => (
                  <div key={item.id} className={styles.readinessItem}>
                    <div className={styles.readinessTitle}>{item.label}</div>
                    <ul className={styles.readinessProblems}>
                      {item.problems.map((problem, problemIndex) => (
                        <li key={`${item.id}-${problemIndex}-${problem}`}>{problem}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {activeClient &&
          uploads.length > 0 &&
          (workflowState === "workflow_started" || workflowState === "section_review") ? (
            <div className={styles.sectionCard}>
              <div className={finleyStyles.workflowHeader}>
                <div className={styles.sectionCardTitle}>
                  {SECTION_CONFIGS.find((section) => section.id === activeSectionId)?.label}
                </div>
                <span className={`${styles.sectionStatusPill} ${styles.sectionStatusBadgeLarge} ${styles[`status${activeSectionStatus.replace(/-/g, "")}`]}`.trim()}>
                  {getSectionStatusLabel(activeSectionStatus)}
                </span>
              </div>
              {activeSectionId === "soa-introduction" ? (
                <>
                  {intakeAssessment ? (
                    <div className={styles.workflowDraftCard}>
                      <div className={styles.workflowDraftLabel}>Finley understanding</div>
                      <div className={styles.sectionCardText}>{intakeAssessment.matterSummary}</div>
                    </div>
                  ) : null}
                  <div className={styles.moduleGrid}>
                    {MODULE_OPTIONS.map((option) => (
                      <label key={option.value} className={styles.moduleOption}>
                        <input
                          type="checkbox"
                          checked={adviceCase.blueprint.includedModules.includes(option.value)}
                          onChange={() => toggleModule(option.value)}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                  {uploads.length ? (
                    <div className={styles.workflowDraftSubcard}>
                      <div className={styles.workflowDraftLabel}>Inputs</div>
                      <div className={styles.uploadChipRow}>
                        {uploads.map((upload) => (
                          <div key={upload.id} className={styles.uploadChip}>
                            <span className={styles.uploadChipName}>{upload.name}</span>
                            {upload.productRexReport ? (
                              <span className={styles.productRexBadge}>ProductRex detected</span>
                            ) : null}
                            {isInsuranceQuoteUpload(upload) ? (
                              <span className={styles.insuranceQuoteBadge}>Insurance quote detected</span>
                            ) : null}
                            {isFactFindUpload(upload) ? (
                              <span className={styles.factFindBadge}>Fact Find detected</span>
                            ) : null}
                            {selectedProductRexUpload?.id === upload.id ? (
                              <span className={styles.productRexActiveBadge}>In use</span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
              {activeSectionId === "risk-profile" ? (
                <>
                  <div className={styles.workflowDraftCard}>
                    {adviceCase.clientGroup.clients.length > 1 ? (
                      <div className={styles.personTabRow}>
                        {adviceCase.clientGroup.clients.map((person) => (
                          <button
                            key={person.personId}
                            type="button"
                            className={`${styles.personTabButton} ${activeRiskPersonId === person.personId ? styles.personTabButtonActive : ""}`.trim()}
                            onClick={() => setActiveRiskPersonId(person.personId)}
                          >
                            {person.role === "partner" ? "Partner" : "Client"}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className={styles.workflowDraftLabel}>
                      {adviceCase.clientGroup.clients.length > 1
                        ? `${adviceCase.clientGroup.clients.find((person) => person.personId === activeRiskPersonId)?.role === "partner" ? "Partner" : "Client"} risk profile draft`
                        : "Risk profile draft"}
                    </div>
                    <select
                      className={finleyStyles.clientSearch}
                      value={(activeRiskPersonId && riskProfilesByPerson[activeRiskPersonId]?.profile) ?? adviceCase.riskProfile?.profile ?? "unknown"}
                      onChange={(event) => {
                        if (!activeRiskPersonId) {
                          return;
                        }

                        updateRiskProfile(activeRiskPersonId, event.target.value as RiskProfileV1["profile"]);
                      }}
                    >
                      {RISK_PROFILE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{toTitleCase(option)}</option>
                      ))}
                    </select>
                  </div>
                </>
              ) : null}
              {activeSectionId === "scope-of-advice" ? (
                <>
                  <div className={styles.workflowDraftStack}>
                    <div className={styles.workflowDraftCard}>
                      <div className={styles.workflowDraftLabel}>Agreed scope</div>
                      <textarea
                        className={`${finleyStyles.composerInput} ${styles.largeTextarea}`.trim()}
                        placeholder="One scope item per line"
                        value={adviceCase.scope.included.map((item) => item.topic).join("\n")}
                        onChange={(event) => {
                          setAdviceCase((current) => ({
                            ...current,
                            scope: {
                              ...current.scope,
                              included: event.target.value
                                .split(/\r?\n/)
                                .map((line) => line.trim())
                                .filter(Boolean)
                                .map((topic) => ({ scopeItemId: makeId("scope"), topic })),
                            },
                            metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                          }));
                          setConfirmedSections((current) => ({ ...current, "scope-of-advice": false }));
                        }}
                      />
                    </div>
                    <div className={styles.workflowDraftCard}>
                      <div className={styles.workflowDraftLabel}>Limitations / exclusions</div>
                      <textarea
                        className={`${finleyStyles.composerInput} ${styles.largeTextarea}`.trim()}
                        placeholder="One limitation or exclusion per line"
                        value={[
                          ...adviceCase.scope.excluded.map((item) => item.topic),
                          ...adviceCase.scope.limitations,
                        ].join("\n")}
                        onChange={(event) => {
                          const entries = event.target.value
                            .split(/\r?\n/)
                            .map((line) => line.trim())
                            .filter(Boolean);
                          setAdviceCase((current) => ({
                            ...current,
                            scope: {
                              ...current.scope,
                              excluded: entries.map((topic) => ({ scopeItemId: makeId("scope"), topic })),
                              limitations: entries,
                            },
                            metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                          }));
                          setConfirmedSections((current) => ({ ...current, "scope-of-advice": false }));
                        }}
                      />
                    </div>
                  </div>
                </>
              ) : null}
              {activeSectionId === "objectives" ? (
                <>
                  <div className={styles.workflowDraftStack}>
                    {adviceCase.objectives.map((objective, index) => (
                      <div key={objective.objectiveId} className={styles.workflowDraftCard}>
                        <div className={styles.workflowDraftHeader}>
                          <div className={styles.workflowDraftLabel}>Objective {index + 1}</div>
                          <button
                            type="button"
                            className={styles.objectiveDeleteButton}
                            onClick={() => {
                              if (!window.confirm(`Delete Objective ${index + 1}?`)) {
                                return;
                              }
                              setAdviceCase((current) => ({
                                ...current,
                                objectives: current.objectives.filter((entry) => entry.objectiveId !== objective.objectiveId),
                                metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                              }));
                              setConfirmedSections((current) => ({ ...current, objectives: false }));
                            }}
                          >
                            Delete
                          </button>
                        </div>
                        <textarea
                          className={`${finleyStyles.composerInput} ${styles.largeTextarea}`.trim()}
                          value={objective.text}
                          onChange={(event) => {
                            setAdviceCase((current) => ({
                              ...current,
                              objectives: current.objectives.map((entry) =>
                                entry.objectiveId === objective.objectiveId ? { ...entry, text: event.target.value } : entry,
                              ),
                              metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                            }));
                            setConfirmedSections((current) => ({ ...current, objectives: false }));
                          }}
                        />
                        <select
                          className={finleyStyles.clientSearch}
                          value={objective.priority ?? "unknown"}
                          onChange={(event) => {
                            setAdviceCase((current) => ({
                              ...current,
                              objectives: current.objectives.map((entry) =>
                                entry.objectiveId === objective.objectiveId
                                  ? {
                                      ...entry,
                                      priority: event.target.value as "high" | "medium" | "low" | "unknown",
                                    }
                                  : entry,
                              ),
                              metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                            }));
                            setConfirmedSections((current) => ({ ...current, objectives: false }));
                          }}
                        >
                          <option value="high">High priority</option>
                          <option value="medium">Medium priority</option>
                          <option value="low">Low priority</option>
                          <option value="unknown">Unknown</option>
                        </select>
                      </div>
                    ))}
                  </div>
                  <div className={styles.sectionActionRow}>
                    <button
                      type="button"
                      className={styles.sectionActionButton}
                      onClick={() => {
                        setAdviceCase((current) => ({
                          ...current,
                          objectives: [
                            ...current.objectives,
                            {
                              objectiveId: makeId("objective"),
                              ownerPersonIds: current.clientGroup.clients.map((client) => client.personId),
                              text: "",
                              priority: "unknown",
                            },
                          ],
                          metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                        }));
                        setConfirmedSections((current) => ({ ...current, objectives: false }));
                      }}
                    >
                      Add objective
                    </button>
                  </div>
                </>
              ) : null}
              {activeSectionId === "strategy-recommendations" ? (
                <>
                  <div className={styles.workflowDraftStack}>
                    {adviceCase.recommendations.strategic.map((recommendation, index) => (
                      <div key={recommendation.recommendationId} className={styles.workflowDraftCard}>
                        <div className={styles.workflowDraftHeader}>
                          <div className={styles.workflowDraftHeaderMain}>
                            <div className={styles.workflowDraftLabel}>Strategy recommendation {index + 1}</div>
                            <button
                              type="button"
                              className={styles.collapseToggleButton}
                              onClick={() =>
                                setCollapsedStrategyRecommendations((current) => ({
                                  ...current,
                                  [recommendation.recommendationId]: !(current[recommendation.recommendationId] ?? false),
                                }))
                              }
                            >
                              {collapsedStrategyRecommendations[recommendation.recommendationId] ? "Expand" : "Collapse"}
                            </button>
                          </div>
                          <button
                            type="button"
                            className={styles.objectiveDeleteButton}
                            onClick={() => {
                              if (!window.confirm(`Delete Strategy Recommendation ${index + 1}?`)) {
                                return;
                              }
                              setAdviceCase((current) => ({
                                ...current,
                                recommendations: {
                                  ...current.recommendations,
                                  strategic: current.recommendations.strategic.filter(
                                    (entry) => entry.recommendationId !== recommendation.recommendationId,
                                  ),
                                },
                                metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                              }));
                              setConfirmedSections((current) => ({ ...current, "strategy-recommendations": false }));
                            }}
                          >
                            Delete
                          </button>
                        </div>
                        {collapsedStrategyRecommendations[recommendation.recommendationId] ? (
                          <div className={styles.workflowDraftPreview}>
                            {recommendation.recommendationText?.trim() || "No recommendation text yet."}
                          </div>
                        ) : (
                          <>
                        <div className={styles.strategyTabRow}>
                          {STRATEGY_RECOMMENDATION_TABS.map((tab) => {
                            const activeTab = strategyRecommendationTabs[recommendation.recommendationId] ?? "recommendation";
                            return (
                              <button
                                key={tab.value}
                                type="button"
                                className={`${styles.strategyTabButton} ${
                                  activeTab === tab.value ? styles.strategyTabButtonActive : ""
                                }`.trim()}
                                onClick={() =>
                                  setStrategyRecommendationTabs((current) => ({
                                    ...current,
                                    [recommendation.recommendationId]: tab.value,
                                  }))
                                }
                              >
                                {tab.label}
                              </button>
                            );
                          })}
                        </div>
                        {(() => {
                          const activeTab = strategyRecommendationTabs[recommendation.recommendationId] ?? "recommendation";

                          if (activeTab === "linked-objectives") {
                            return (
                              <div className={styles.workflowDraftSubcard}>
                                <div className={styles.workflowDraftLabel}>Linked objectives</div>
                                <div className={styles.linkedObjectiveList}>
                                  {adviceCase.objectives.map((objective, objectiveIndex) => {
                                    const isLinked = recommendation.linkedObjectiveIds.includes(objective.objectiveId);
                                    return (
                                      <label key={objective.objectiveId} className={styles.linkedObjectiveOption}>
                                        <input
                                          type="checkbox"
                                          checked={isLinked}
                                          onChange={() => {
                                            setAdviceCase((current) => ({
                                              ...current,
                                              recommendations: {
                                                ...current.recommendations,
                                                strategic: current.recommendations.strategic.map((entry) =>
                                                  entry.recommendationId === recommendation.recommendationId
                                                    ? {
                                                        ...entry,
                                                        linkedObjectiveIds: entry.linkedObjectiveIds.includes(objective.objectiveId)
                                                          ? entry.linkedObjectiveIds.filter((id) => id !== objective.objectiveId)
                                                          : [...entry.linkedObjectiveIds, objective.objectiveId],
                                                      }
                                                    : entry,
                                                ),
                                              },
                                              metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                            }));
                                            setConfirmedSections((current) => ({ ...current, "strategy-recommendations": false }));
                                          }}
                                        />
                                        <span>{objective.text || `Objective ${objectiveIndex + 1}`}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          }

                          if (activeTab === "recommendation") {
                            return (
                              <div className={styles.workflowDraftSubcard}>
                                <div className={styles.workflowDraftLabel}>Recommendation</div>
                                <textarea
                                  className={`${finleyStyles.composerInput} ${styles.largeTextareaTall}`.trim()}
                                  placeholder="What is being recommended?"
                                  value={recommendation.recommendationText}
                                  onChange={(event) => {
                                    setAdviceCase((current) => ({
                                      ...current,
                                      recommendations: {
                                        ...current.recommendations,
                                        strategic: current.recommendations.strategic.map((entry) =>
                                          entry.recommendationId === recommendation.recommendationId
                                            ? { ...entry, recommendationText: event.target.value }
                                            : entry,
                                        ),
                                      },
                                      metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                    }));
                                    setConfirmedSections((current) => ({ ...current, "strategy-recommendations": false }));
                                  }}
                                />
                              </div>
                            );
                          }

                          if (activeTab === "reasons") {
                            return (
                              <div className={styles.workflowDraftSubcard}>
                                <div className={styles.workflowDraftLabel}>Client benefits</div>
                                <textarea
                                  className={`${finleyStyles.composerInput} ${styles.largeTextareaTall}`.trim()}
                                  placeholder="One benefit or rationale point per line"
                                  value={[
                                    ...recommendation.clientBenefits.map((benefit) => benefit.text),
                                    recommendation.rationale ?? "",
                                  ]
                                    .filter(Boolean)
                                    .join("\n")}
                                  onChange={(event) => {
                                    const nextBenefits = splitNonEmptyLines(event.target.value).map((text) => ({
                                      benefitId: makeId("benefit"),
                                      type: "other" as const,
                                      text,
                                    }));
                                    setAdviceCase((current) => ({
                                      ...current,
                                      recommendations: {
                                        ...current.recommendations,
                                        strategic: current.recommendations.strategic.map((entry) =>
                                          entry.recommendationId === recommendation.recommendationId
                                            ? { ...entry, clientBenefits: nextBenefits, rationale: null }
                                            : entry,
                                        ),
                                      },
                                      metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                    }));
                                    setConfirmedSections((current) => ({ ...current, "strategy-recommendations": false }));
                                  }}
                                />
                              </div>
                            );
                          }

                          if (activeTab === "consequences") {
                            return (
                              <div className={styles.workflowDraftSubcard}>
                                <div className={styles.workflowDraftLabel}>Consequences / trade-offs</div>
                                <textarea
                                  className={`${finleyStyles.composerInput} ${styles.largeTextareaTall}`.trim()}
                                  placeholder="One consequence or trade-off per line"
                                  value={recommendation.consequences.map((consequence) => consequence.text).join("\n")}
                                  onChange={(event) => {
                                    const nextConsequences = splitNonEmptyLines(event.target.value).map((text) => ({
                                      consequenceId: makeId("consequence"),
                                      type: "trade-off" as const,
                                      text,
                                    }));
                                    setAdviceCase((current) => ({
                                      ...current,
                                      recommendations: {
                                        ...current.recommendations,
                                        strategic: current.recommendations.strategic.map((entry) =>
                                          entry.recommendationId === recommendation.recommendationId
                                            ? { ...entry, consequences: nextConsequences }
                                            : entry,
                                        ),
                                      },
                                      metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                    }));
                                    setConfirmedSections((current) => ({ ...current, "strategy-recommendations": false }));
                                  }}
                                />
                              </div>
                            );
                          }

                          return (
                            <div className={styles.workflowDraftSubcard}>
                              <div className={styles.workflowDraftLabel}>Alternatives considered</div>
                              <textarea
                                className={`${finleyStyles.composerInput} ${styles.largeTextareaTall}`.trim()}
                                placeholder="One alternative per line"
                                value={recommendation.alternativesConsidered.map((alternative) => alternative.optionText).join("\n")}
                                onChange={(event) => {
                                  const nextAlternatives = splitNonEmptyLines(event.target.value).map((text) => ({
                                    alternativeId: makeId("alternative"),
                                    optionText: text,
                                    reasonNotRecommended: null,
                                  }));
                                  setAdviceCase((current) => ({
                                    ...current,
                                    recommendations: {
                                      ...current.recommendations,
                                      strategic: current.recommendations.strategic.map((entry) =>
                                        entry.recommendationId === recommendation.recommendationId
                                          ? { ...entry, alternativesConsidered: nextAlternatives }
                                          : entry,
                                      ),
                                    },
                                    metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                  }));
                                  setConfirmedSections((current) => ({ ...current, "strategy-recommendations": false }));
                                }}
                              />
                            </div>
                          );
                        })()}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className={styles.sectionActionRow}>
                    <button
                      type="button"
                      className={styles.sectionActionButton}
                      onClick={() => {
                        setAdviceCase((current) => ({
                          ...current,
                          recommendations: {
                            ...current.recommendations,
                            strategic: [
                              ...current.recommendations.strategic,
                              {
                                recommendationId: makeId("strategy"),
                                type: "other",
                                recommendationText: "",
                                linkedObjectiveIds: [],
                                targetAmount: null,
                                monthlyContribution: null,
                                annualContribution: null,
                                contributionFrequency: "unknown",
                                targetDate: null,
                                reviewFrequency: "unknown",
                                fundingSource: null,
                                priorityRank: null,
                                assumptionNote: null,
                                amountConfidence: "pending-confirmation",
                                clientBenefits: [],
                                consequences: [],
                                alternativesConsidered: [],
                                implementationNotes: null,
                                rationale: null,
                              },
                            ],
                          },
                          metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                        }));
                        setConfirmedSections((current) => ({ ...current, "strategy-recommendations": false }));
                      }}
                    >
                      Add recommendation
                    </button>
                  </div>
                </>
              ) : null}
              {activeSectionId === "product-recommendations" ? (
                <>
                  <div className={styles.workflowDraftStack}>
                    {adviceCase.recommendations.product.map((recommendation, index) => (
                      <div key={recommendation.recommendationId} className={styles.workflowDraftCard}>
                        <div className={styles.workflowDraftHeader}>
                          <div className={styles.workflowDraftHeaderMain}>
                            <div className={styles.workflowDraftLabel}>Product recommendation {index + 1}</div>
                            <button
                              type="button"
                              className={styles.collapseToggleButton}
                              onClick={() =>
                                setCollapsedProductRecommendations((current) => ({
                                  ...current,
                                  [recommendation.recommendationId]: !(current[recommendation.recommendationId] ?? false),
                                }))
                              }
                            >
                              {collapsedProductRecommendations[recommendation.recommendationId] ? "Expand" : "Collapse"}
                            </button>
                          </div>
                          <button
                            type="button"
                            className={styles.objectiveDeleteButton}
                            onClick={() => {
                              if (!window.confirm(`Delete Product Recommendation ${index + 1}?`)) {
                                return;
                              }
                              setAdviceCase((current) => ({
                                ...current,
                                recommendations: {
                                  ...current.recommendations,
                                  product: current.recommendations.product.filter(
                                    (entry) => entry.recommendationId !== recommendation.recommendationId,
                                  ),
                                },
                                metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                              }));
                              setConfirmedSections((current) => ({ ...current, "product-recommendations": false }));
                            }}
                          >
                            Delete
                          </button>
                        </div>
                        {collapsedProductRecommendations[recommendation.recommendationId] ? (
                          <div className={styles.workflowDraftPreview}>
                            {recommendation.recommendationText?.trim() ||
                              recommendation.recommendedProductName?.trim() ||
                              "No product recommendation text yet."}
                          </div>
                        ) : (
                          <>
                        <div className={styles.sectionGridCompact}>
                          <div className={styles.workflowDraftSubcard}>
                            <div className={styles.workflowDraftLabel}>Action</div>
                            <select
                              className={finleyStyles.clientSearch}
                              value={recommendation.action}
                              onChange={(event) => {
                                setAdviceCase((current) => ({
                                  ...current,
                                  recommendations: {
                                    ...current.recommendations,
                                    product: current.recommendations.product.map((entry) =>
                                      entry.recommendationId === recommendation.recommendationId
                                        ? { ...entry, action: event.target.value as typeof recommendation.action }
                                        : entry,
                                    ),
                                  },
                                  metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                }));
                                setConfirmedSections((current) => ({ ...current, "product-recommendations": false }));
                              }}
                            >
                              <option value="obtain">Obtain</option>
                              <option value="retain">Retain</option>
                              <option value="replace">Replace</option>
                              <option value="rollover">Rollover</option>
                              <option value="consolidate">Consolidate</option>
                              <option value="dispose">Dispose</option>
                            </select>
                          </div>
                          <div className={styles.workflowDraftSubcard}>
                            <div className={styles.workflowDraftLabel}>Product type</div>
                            <select
                              className={finleyStyles.clientSearch}
                              value={recommendation.productType === "insurance" ? "other" : recommendation.productType}
                              onChange={(event) => {
                                setAdviceCase((current) => ({
                                  ...current,
                                  recommendations: {
                                    ...current.recommendations,
                                    product: current.recommendations.product.map((entry) =>
                                      entry.recommendationId === recommendation.recommendationId
                                        ? { ...entry, productType: event.target.value as typeof recommendation.productType }
                                        : entry,
                                    ),
                                  },
                                  metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                }));
                                setConfirmedSections((current) => ({ ...current, "product-recommendations": false }));
                              }}
                            >
                              <option value="super">Super</option>
                              <option value="pension">Pension</option>
                              <option value="investment">Investment</option>
                              <option value="annuity">Annuity</option>
                              <option value="other">Other</option>
                            </select>
                          </div>
                          <div className={styles.workflowDraftSubcard}>
                            <div className={styles.workflowDraftLabel}>Current product</div>
                            <input
                              className={finleyStyles.clientSearch}
                              placeholder="Current product"
                              value={recommendation.currentProductName ?? ""}
                              onChange={(event) => {
                                setAdviceCase((current) => ({
                                  ...current,
                                  recommendations: {
                                    ...current.recommendations,
                                    product: current.recommendations.product.map((entry) =>
                                      entry.recommendationId === recommendation.recommendationId
                                        ? { ...entry, currentProductName: event.target.value }
                                        : entry,
                                    ),
                                  },
                                  metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                }));
                                setConfirmedSections((current) => ({ ...current, "product-recommendations": false }));
                              }}
                            />
                          </div>
                          <div className={styles.workflowDraftSubcard}>
                            <div className={styles.workflowDraftLabel}>Recommended product</div>
                            <input
                              className={finleyStyles.clientSearch}
                              placeholder="Recommended product"
                              value={recommendation.recommendedProductName ?? ""}
                              onChange={(event) => {
                                setAdviceCase((current) => ({
                                  ...current,
                                  recommendations: {
                                    ...current.recommendations,
                                    product: current.recommendations.product.map((entry) =>
                                      entry.recommendationId === recommendation.recommendationId
                                        ? { ...entry, recommendedProductName: event.target.value }
                                        : entry,
                                    ),
                                  },
                                  metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                }));
                                setConfirmedSections((current) => ({ ...current, "product-recommendations": false }));
                              }}
                            />
                          </div>
                        </div>
                        <div className={styles.strategyTabRow}>
                          {PRODUCT_RECOMMENDATION_TABS.map((tab) => {
                            const activeTab = productRecommendationTabs[recommendation.recommendationId] ?? "recommendation";
                            return (
                              <button
                                key={tab.value}
                                type="button"
                                className={`${styles.strategyTabButton} ${
                                  activeTab === tab.value ? styles.strategyTabButtonActive : ""
                                }`.trim()}
                                onClick={() =>
                                  setProductRecommendationTabs((current) => ({
                                    ...current,
                                    [recommendation.recommendationId]: tab.value,
                                  }))
                                }
                              >
                                {tab.label}
                              </button>
                            );
                          })}
                        </div>
                        {(() => {
                          const activeTab = productRecommendationTabs[recommendation.recommendationId] ?? "recommendation";

                          if (activeTab === "linked-objectives") {
                            return (
                              <div className={styles.workflowDraftSubcard}>
                                <div className={styles.workflowDraftLabel}>Linked objectives</div>
                                <div className={styles.linkedObjectiveList}>
                                  {adviceCase.objectives.map((objective, objectiveIndex) => {
                                    const isLinked = recommendation.linkedObjectiveIds.includes(objective.objectiveId);
                                    return (
                                      <label key={objective.objectiveId} className={styles.linkedObjectiveOption}>
                                        <input
                                          type="checkbox"
                                          checked={isLinked}
                                          onChange={() => {
                                            setAdviceCase((current) => ({
                                              ...current,
                                              recommendations: {
                                                ...current.recommendations,
                                                product: current.recommendations.product.map((entry) =>
                                                  entry.recommendationId === recommendation.recommendationId
                                                    ? {
                                                        ...entry,
                                                        linkedObjectiveIds: entry.linkedObjectiveIds.includes(objective.objectiveId)
                                                          ? entry.linkedObjectiveIds.filter((id) => id !== objective.objectiveId)
                                                          : [...entry.linkedObjectiveIds, objective.objectiveId],
                                                      }
                                                    : entry,
                                                ),
                                              },
                                              metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                            }));
                                            setConfirmedSections((current) => ({ ...current, "product-recommendations": false }));
                                          }}
                                        />
                                        <span>{objective.text || `Objective ${objectiveIndex + 1}`}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          }

                          if (activeTab === "recommendation") {
                            return (
                              <div className={styles.workflowDraftSubcard}>
                                <div className={styles.workflowDraftLabel}>Recommendation</div>
                                <textarea
                                  className={`${finleyStyles.composerInput} ${styles.largeTextareaTall}`.trim()}
                                  placeholder="What product recommendation is being made?"
                                  value={recommendation.recommendationText}
                                  onChange={(event) => {
                                    setAdviceCase((current) => ({
                                      ...current,
                                      recommendations: {
                                        ...current.recommendations,
                                        product: current.recommendations.product.map((entry) =>
                                          entry.recommendationId === recommendation.recommendationId
                                            ? { ...entry, recommendationText: event.target.value }
                                            : entry,
                                        ),
                                      },
                                      metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                    }));
                                    setConfirmedSections((current) => ({ ...current, "product-recommendations": false }));
                                  }}
                                />
                              </div>
                            );
                          }

                          if (activeTab === "reasons") {
                            return (
                              <div className={styles.workflowDraftSubcard}>
                                <div className={styles.workflowDraftLabel}>Client benefits</div>
                                <textarea
                                  className={`${finleyStyles.composerInput} ${styles.largeTextareaTall}`.trim()}
                                  placeholder="One benefit or suitability point per line"
                                  value={[
                                    ...recommendation.clientBenefits.map((benefit) => benefit.text),
                                    recommendation.suitabilityRationale ?? "",
                                  ]
                                    .filter(Boolean)
                                    .join("\n")}
                                  onChange={(event) => {
                                    const nextBenefits = splitNonEmptyLines(event.target.value).map((text) => ({
                                      benefitId: makeId("benefit"),
                                      type: "other" as const,
                                      text,
                                    }));
                                    setAdviceCase((current) => ({
                                      ...current,
                                      recommendations: {
                                        ...current.recommendations,
                                        product: current.recommendations.product.map((entry) =>
                                          entry.recommendationId === recommendation.recommendationId
                                            ? { ...entry, clientBenefits: nextBenefits, suitabilityRationale: null }
                                            : entry,
                                        ),
                                      },
                                      metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                    }));
                                    setConfirmedSections((current) => ({ ...current, "product-recommendations": false }));
                                  }}
                                />
                              </div>
                            );
                          }

                          if (activeTab === "consequences") {
                            return (
                              <div className={styles.workflowDraftSubcard}>
                                <div className={styles.workflowDraftLabel}>Consequences / trade-offs</div>
                                <textarea
                                  className={`${finleyStyles.composerInput} ${styles.largeTextareaTall}`.trim()}
                                  placeholder="One consequence or trade-off per line"
                                  value={recommendation.consequences.map((consequence) => consequence.text).join("\n")}
                                  onChange={(event) => {
                                    const nextConsequences = splitNonEmptyLines(event.target.value).map((text) => ({
                                      consequenceId: makeId("consequence"),
                                      type: "trade-off" as const,
                                      text,
                                    }));
                                    setAdviceCase((current) => ({
                                      ...current,
                                      recommendations: {
                                        ...current.recommendations,
                                        product: current.recommendations.product.map((entry) =>
                                          entry.recommendationId === recommendation.recommendationId
                                            ? { ...entry, consequences: nextConsequences }
                                            : entry,
                                        ),
                                      },
                                      metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                    }));
                                    setConfirmedSections((current) => ({ ...current, "product-recommendations": false }));
                                  }}
                                />
                              </div>
                            );
                          }

                          return (
                            <div className={styles.workflowDraftSubcard}>
                              <div className={styles.workflowDraftLabel}>Alternatives considered</div>
                              <textarea
                                className={`${finleyStyles.composerInput} ${styles.largeTextareaTall}`.trim()}
                                placeholder="One alternative per line"
                                value={recommendation.alternativesConsidered
                                  .map((alternative) => alternative.productName ?? alternative.provider ?? "")
                                  .filter(Boolean)
                                  .join("\n")}
                                onChange={(event) => {
                                  const nextAlternatives = splitNonEmptyLines(event.target.value).map((text) => ({
                                    alternativeId: makeId("product-alternative"),
                                    productName: text,
                                    provider: null,
                                    reasonDiscounted: null,
                                  }));
                                  setAdviceCase((current) => ({
                                    ...current,
                                    recommendations: {
                                      ...current.recommendations,
                                      product: current.recommendations.product.map((entry) =>
                                        entry.recommendationId === recommendation.recommendationId
                                          ? { ...entry, alternativesConsidered: nextAlternatives }
                                          : entry,
                                      ),
                                    },
                                    metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                  }));
                                  setConfirmedSections((current) => ({ ...current, "product-recommendations": false }));
                                }}
                              />
                            </div>
                          );
                        })()}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className={styles.sectionActionRow}>
                    <button
                      type="button"
                      className={styles.sectionActionButton}
                      onClick={() => {
                        setAdviceCase((current) => ({
                          ...current,
                          recommendations: {
                            ...current.recommendations,
                            product: [
                              ...current.recommendations.product,
                              {
                                recommendationId: makeId("product"),
                                action: "retain",
                                productType: "other",
                                recommendedProductName: null,
                                recommendedProvider: null,
                                linkedObjectiveIds: [],
                                recommendationText: "",
                                targetAmount: null,
                                transferAmount: null,
                                monthlyFundingAmount: null,
                                annualFundingAmount: null,
                                implementationDate: null,
                                reviewFrequency: "unknown",
                                fundingSource: null,
                                priorityRank: null,
                                assumptionNote: null,
                                amountConfidence: "pending-confirmation",
                                clientBenefits: [],
                                consequences: [],
                                suitabilityRationale: null,
                                currentProductName: null,
                                currentProvider: null,
                                comparison: null,
                                alternativesConsidered: [],
                              },
                            ],
                          },
                          metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                        }));
                        setConfirmedSections((current) => ({ ...current, "product-recommendations": false }));
                      }}
                    >
                      Add recommendation
                    </button>
                  </div>
                </>
              ) : null}
              {activeSectionId === "replacement-analysis" ? (
                <>
                  {latestProductRexReport ? (
                    <div className={styles.workflowDraftSubcard}>
                      <div className={styles.workflowDraftHeader}>
                        <div className={styles.workflowDraftLabel}>ProductRex fee comparison</div>
                        <div className={styles.workflowDraftPreview}>{latestProductRexReport.sourceFileName}</div>
                      </div>
                      <div className={styles.dataTableWrap}>
                        <table className={styles.dataTable}>
                          <thead>
                            <tr>
                              <th>Item</th>
                              <th>Current</th>
                              <th>Recommended</th>
                              <th>Alternative</th>
                            </tr>
                          </thead>
                          <tbody>
                            {latestProductRexReport.platformComparisonRows.map((row) => (
                              <tr key={row.rowId}>
                                <td>{row.label}</td>
                                <td>{row.currentValue ?? "—"}</td>
                                <td>{row.recommendedValue ?? "—"}</td>
                                <td>{row.alternativeValue ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                  <div className={styles.workflowDraftStack}>
                    {adviceCase.recommendations.replacement.map((recommendation, index) => (
                      <div key={recommendation.recommendationId} className={styles.workflowDraftCard}>
                        <div className={styles.workflowDraftHeader}>
                          <div className={styles.workflowDraftLabel}>Replacement analysis {index + 1}</div>
                          <button
                            type="button"
                            className={styles.objectiveDeleteButton}
                            onClick={() => {
                              if (!window.confirm(`Delete Replacement Analysis ${index + 1}?`)) {
                                return;
                              }
                              setAdviceCase((current) => ({
                                ...current,
                                recommendations: {
                                  ...current.recommendations,
                                  replacement: current.recommendations.replacement.filter(
                                    (entry) => entry.recommendationId !== recommendation.recommendationId,
                                  ),
                                },
                                metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                              }));
                              setConfirmedSections((current) => ({ ...current, "replacement-analysis": false }));
                            }}
                          >
                            Delete
                          </button>
                        </div>
                        <div className={styles.workflowDraftSubcard}>
                          <div className={styles.workflowDraftLabel}>Replacement reasons</div>
                          <textarea
                            className={`${finleyStyles.composerInput} ${styles.largeTextareaTall}`.trim()}
                            placeholder="Why is the replacement being recommended?"
                            value={recommendation.replacementReasonText}
                            onChange={(event) => {
                              setAdviceCase((current) => ({
                                ...current,
                                recommendations: {
                                  ...current.recommendations,
                                  replacement: current.recommendations.replacement.map((entry) =>
                                    entry.recommendationId === recommendation.recommendationId
                                      ? { ...entry, replacementReasonText: event.target.value }
                                      : entry,
                                  ),
                                },
                                metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                              }));
                              setConfirmedSections((current) => ({ ...current, "replacement-analysis": false }));
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className={styles.sectionActionRow}>
                    <button
                      type="button"
                      className={styles.sectionActionButton}
                      onClick={() => {
                        setAdviceCase((current) => ({
                          ...current,
                          recommendations: {
                            ...current.recommendations,
                            replacement: [
                              ...current.recommendations.replacement,
                              {
                                recommendationId: makeId("replacement"),
                                replacementType: "other",
                                currentProductName: null,
                                currentProvider: null,
                                recommendedProductName: null,
                                recommendedProvider: null,
                                replacementReasonText: "",
                                linkedObjectiveIds: [],
                                clientBenefits: [],
                                consequences: [],
                                alternativesConsidered: [],
                                feeComparisonNarrative: null,
                                replacementRisks: [],
                                rationale: null,
                              },
                            ],
                          },
                          metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                        }));
                        setConfirmedSections((current) => ({ ...current, "replacement-analysis": false }));
                      }}
                    >
                      Add replacement analysis
                    </button>
                  </div>
                </>
              ) : null}
              {activeSectionId === "insurance-analysis" ? (
                <>
                  <div className={styles.personTabRow}>
                    {adviceCase.clientGroup.clients.map((person) => (
                      <button
                        key={person.personId}
                        type="button"
                        className={`${styles.personTabButton} ${
                          activeInsurancePersonId === person.personId ? styles.personTabButtonActive : ""
                        }`.trim()}
                        onClick={() => setActiveInsurancePersonId(person.personId)}
                      >
                        {person.role === "partner" ? "Partner" : "Client"}
                      </button>
                    ))}
                  </div>
                  {(() => {
                    const ownerPersonId = activeInsurancePersonId ?? adviceCase.clientGroup.clients[0]?.personId;
                    const activePersonAnalyses = (adviceCase.recommendations.insuranceNeedsAnalyses ?? []).filter(
                      (analysis) => !ownerPersonId || analysis.ownerPersonIds.includes(ownerPersonId),
                    );
                    const analysisByCover = new Map(
                      INSURANCE_NEEDS_COVER_COLUMNS.map((column) => [
                        column.value,
                        activePersonAnalyses.find((analysis) => analysis.policyType === column.value) ?? null,
                      ]),
                    );
                    const addCoverAnalysis = (policyType: (typeof INSURANCE_NEEDS_COVER_COLUMNS)[number]["value"]) => {
                      if (!ownerPersonId) return;
                      setAdviceCase((current) => ({
                        ...current,
                        recommendations: {
                          ...current.recommendations,
                          insuranceNeedsAnalyses: [
                            ...(current.recommendations.insuranceNeedsAnalyses ?? []),
                            createInsuranceNeedsAnalysis(ownerPersonId, policyType),
                          ],
                        },
                        metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                      }));
                      setConfirmedSections((current) => ({ ...current, "insurance-analysis": false }));
                    };

                    return (
                      <div className={styles.workflowDraftStack}>
                        <div className={styles.workflowDraftCard}>
                          <div className={styles.workflowDraftHeader}>
                            <div>
                              <div className={styles.workflowDraftLabel}>Insurance cover required</div>
                              <div className={styles.workflowDraftPreview}>
                                Review the calculated needs, existing provisions and resulting cover gaps for each cover type.
                              </div>
                            </div>
                          </div>
                          <div className={styles.dataTableWrap}>
                            <table className={styles.dataTable}>
                              <thead>
                                <tr>
                                  <th>Item</th>
                                  {INSURANCE_NEEDS_COVER_COLUMNS.map((column) => (
                                    <th key={column.value}>{column.label}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td>Cover required</td>
                                  {INSURANCE_NEEDS_COVER_COLUMNS.map((column) => {
                                    const analysis = analysisByCover.get(column.value);
                                    return (
                                      <td key={`target-${column.value}`}>
                                        {analysis ? (
                                          <input
                                            className={styles.tableInput}
                                            value={analysis.outputs.targetCoverAmount == null ? "" : formatCurrency(analysis.outputs.targetCoverAmount)}
                                            placeholder="$0"
                                            onChange={(event) =>
                                              updateInsuranceNeedsAnalysisOutput(analysis.analysisId, {
                                                targetCoverAmount: parseCurrencyInput(event.target.value),
                                              })
                                            }
                                          />
                                        ) : (
                                          <button type="button" className={styles.inlineAddButton} onClick={() => addCoverAnalysis(column.value)}>
                                            Add
                                          </button>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                                <tr>
                                  <td>Existing cover / provisions</td>
                                  {INSURANCE_NEEDS_COVER_COLUMNS.map((column) => {
                                    const analysis = analysisByCover.get(column.value);
                                    return (
                                      <td key={`existing-${column.value}`}>
                                        {analysis ? (
                                          <input
                                            className={styles.tableInput}
                                            value={analysis.inputs.existingCoverAmount == null ? "" : formatCurrency(analysis.inputs.existingCoverAmount)}
                                            placeholder="$0"
                                            onChange={(event) =>
                                              updateInsuranceNeedsAnalysisInput(analysis.analysisId, {
                                                existingCoverAmount: parseCurrencyInput(event.target.value),
                                              })
                                            }
                                          />
                                        ) : (
                                          "—"
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                                <tr>
                                  <td>Cover gap</td>
                                  {INSURANCE_NEEDS_COVER_COLUMNS.map((column) => {
                                    const analysis = analysisByCover.get(column.value);
                                    return (
                                      <td key={`gap-${column.value}`}>
                                        {analysis ? (
                                          <input
                                            className={styles.tableInput}
                                            value={analysis.outputs.coverGapAmount == null ? "" : formatCurrency(analysis.outputs.coverGapAmount)}
                                            placeholder="$0"
                                            onChange={(event) =>
                                              updateInsuranceNeedsAnalysisOutput(analysis.analysisId, {
                                                coverGapAmount: parseCurrencyInput(event.target.value),
                                              })
                                            }
                                          />
                                        ) : (
                                          "—"
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                                <tr>
                                  <td>Policy ownership</td>
                                  {INSURANCE_NEEDS_COVER_COLUMNS.map((column) => {
                                    const analysis = analysisByCover.get(column.value);
                                    return (
                                      <td key={`ownership-${column.value}`}>
                                        {analysis ? (
                                          <select
                                            className={styles.tableSelect}
                                            value={analysis.outputs.suggestedPolicyOwnership ?? "unknown"}
                                            onChange={(event) =>
                                              updateInsuranceNeedsAnalysisOutput(analysis.analysisId, {
                                                suggestedPolicyOwnership: event.target.value as NonNullable<typeof analysis.outputs.suggestedPolicyOwnership>,
                                              })
                                            }
                                          >
                                            <option value="super">Super</option>
                                            <option value="retail">Retail</option>
                                            <option value="either">Either</option>
                                            <option value="unknown">Unknown</option>
                                          </select>
                                        ) : (
                                          "—"
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {activePersonAnalyses.map((analysis, index) => (
                          <div key={analysis.analysisId} className={styles.workflowDraftCard}>
                            <div className={styles.workflowDraftHeader}>
                              <div className={styles.workflowDraftLabel}>
                                {INSURANCE_COVER_TYPE_OPTIONS.find((option) => option.value === analysis.policyType)?.label ?? "Insurance"} analysis
                              </div>
                              <button
                                type="button"
                                className={styles.objectiveDeleteButton}
                                onClick={() => {
                                  if (!window.confirm(`Delete Insurance Analysis ${index + 1}?`)) return;
                                  setAdviceCase((current) => ({
                                    ...current,
                                    recommendations: {
                                      ...current.recommendations,
                                      insuranceNeedsAnalyses: (current.recommendations.insuranceNeedsAnalyses ?? []).filter(
                                        (entry) => entry.analysisId !== analysis.analysisId,
                                      ),
                                    },
                                    metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                  }));
                                  setConfirmedSections((current) => ({ ...current, "insurance-analysis": false }));
                                }}
                              >
                                Delete
                              </button>
                            </div>
                            <div className={styles.sectionGridCompact}>
                              <div className={styles.workflowDraftSubcard}>
                                <div className={styles.workflowDraftLabel}>Methodology</div>
                                <select
                                  className={finleyStyles.clientSearch}
                                  value={analysis.methodology}
                                  onChange={(event) =>
                                    updateInsuranceNeedsAnalysis(analysis.analysisId, {
                                      methodology: event.target.value as typeof analysis.methodology,
                                    })
                                  }
                                >
                                  <option value="capital-needs">Capital needs</option>
                                  <option value="income-replacement">Income replacement</option>
                                  <option value="debt-plus-education">Debt plus education</option>
                                  <option value="expense-based">Expense based</option>
                                  <option value="existing-cover-gap">Existing cover gap</option>
                                  <option value="other">Other</option>
                                </select>
                              </div>
                              <div className={styles.workflowDraftSubcard}>
                                <div className={styles.workflowDraftLabel}>Waiting / benefit period</div>
                                <div className={styles.splitMiniInputs}>
                                  <input
                                    className={finleyStyles.clientSearch}
                                    placeholder="Waiting period"
                                    value={analysis.outputs.suggestedWaitingPeriod ?? ""}
                                    onChange={(event) =>
                                      updateInsuranceNeedsAnalysisOutput(analysis.analysisId, {
                                        suggestedWaitingPeriod: event.target.value,
                                      })
                                    }
                                  />
                                  <input
                                    className={finleyStyles.clientSearch}
                                    placeholder="Benefit period"
                                    value={analysis.outputs.suggestedBenefitPeriod ?? ""}
                                    onChange={(event) =>
                                      updateInsuranceNeedsAnalysisOutput(analysis.analysisId, {
                                        suggestedBenefitPeriod: event.target.value,
                                      })
                                    }
                                  />
                                </div>
                              </div>
                            </div>
                            <div className={styles.workflowDraftSubcard}>
                              <div className={styles.workflowDraftLabel}>Purpose</div>
                              <textarea
                                className={`${finleyStyles.composerInput} ${styles.mediumTextarea}`.trim()}
                                placeholder="Why is this insurance analysis being completed?"
                                value={analysis.purpose ?? ""}
                                onChange={(event) => updateInsuranceNeedsAnalysis(analysis.analysisId, { purpose: event.target.value })}
                              />
                            </div>
                            <div className={styles.workflowDraftSubcard}>
                              <div className={styles.workflowDraftLabel}>Rationale / basis</div>
                              <textarea
                                className={`${finleyStyles.composerInput} ${styles.largeTextareaTall}`.trim()}
                                placeholder="Summarise the basis for the calculated and agreed cover amount."
                                value={analysis.rationale ?? ""}
                                onChange={(event) => updateInsuranceNeedsAnalysis(analysis.analysisId, { rationale: event.target.value })}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </>
              ) : null}
              {activeSectionId === "insurance-policies" ? (
                <>
                  <div className={styles.personTabRow}>
                    {adviceCase.clientGroup.clients.map((person) => (
                      <button
                        key={person.personId}
                        type="button"
                        className={`${styles.personTabButton} ${
                          activeInsurancePersonId === person.personId ? styles.personTabButtonActive : ""
                        }`.trim()}
                        onClick={() => setActiveInsurancePersonId(person.personId)}
                      >
                        {person.role === "partner" ? "Partner" : "Client"}
                      </button>
                    ))}
                  </div>
                  <div className={styles.workflowDraftStack}>
                    <div className={styles.workflowDraftHeader}>
                      <div>
                        <div className={styles.workflowDraftLabel}>Recommended insurance policies</div>
                        <div className={styles.workflowDraftPreview}>
                          Extract quote details here, or let Finley populate them from insurance quote documents.
                        </div>
                      </div>
                      <button
                        type="button"
                        className={styles.sectionActionButton}
                        onClick={() => {
                          const ownerPersonId = activeInsurancePersonId ?? adviceCase.clientGroup.clients[0]?.personId;
                          setAdviceCase((current) => ({
                            ...current,
                            recommendations: {
                              ...current.recommendations,
                              insurancePolicies: [
                                ...(current.recommendations.insurancePolicies ?? []),
                                createInsurancePolicyRecommendation(ownerPersonId),
                              ],
                            },
                            metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                          }));
                          setConfirmedSections((current) => ({ ...current, "insurance-policies": false }));
                        }}
                      >
                        Add policy
                      </button>
                    </div>
                    {(adviceCase.recommendations.insurancePolicies ?? [])
                      .filter((policy) => !activeInsurancePersonId || policy.insuredPersonId === activeInsurancePersonId || !policy.insuredPersonId)
                      .map((policy, policyIndex) => (
                        <div key={policy.policyRecommendationId} className={styles.workflowDraftCard}>
                          <div className={styles.workflowDraftHeader}>
                            <div className={styles.workflowDraftLabel}>Insurance policy recommendation {policyIndex + 1}</div>
                            <button
                              type="button"
                              className={styles.objectiveDeleteButton}
                              onClick={() => {
                                if (!window.confirm(`Delete Insurance Policy Recommendation ${policyIndex + 1}?`)) {
                                  return;
                                }
                                setAdviceCase((current) => ({
                                  ...current,
                                  recommendations: {
                                    ...current.recommendations,
                                    insurancePolicies: (current.recommendations.insurancePolicies ?? []).filter(
                                      (entry) => entry.policyRecommendationId !== policy.policyRecommendationId,
                                    ),
                                  },
                                  metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                }));
                                setConfirmedSections((current) => ({ ...current, "insurance-policies": false }));
                              }}
                            >
                              Delete
                            </button>
                          </div>
                          <div className={styles.sectionGridCompact}>
                            <div className={styles.workflowDraftSubcard}>
                              <div className={styles.workflowDraftLabel}>Insured person</div>
                              <select
                                className={finleyStyles.clientSearch}
                                value={policy.insuredPersonId ?? ""}
                                onChange={(event) => updateInsurancePolicy(policy.policyRecommendationId, { insuredPersonId: event.target.value || null })}
                              >
                                <option value="">Unspecified</option>
                                {adviceCase.clientGroup.clients.map((person) => (
                                  <option key={person.personId} value={person.personId}>
                                    {person.fullName}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className={styles.workflowDraftSubcard}>
                              <div className={styles.workflowDraftLabel}>Action</div>
                              <select
                                className={finleyStyles.clientSearch}
                                value={policy.action}
                                onChange={(event) => updateInsurancePolicy(policy.policyRecommendationId, { action: event.target.value as InsurancePolicyRecommendationV1["action"] })}
                              >
                                {INSURANCE_POLICY_ACTION_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            </div>
                            <div className={styles.workflowDraftSubcard}>
                              <div className={styles.workflowDraftLabel}>Insurer</div>
                              <input
                                className={finleyStyles.clientSearch}
                                value={policy.insurerName ?? ""}
                                onChange={(event) => updateInsurancePolicy(policy.policyRecommendationId, { insurerName: event.target.value })}
                              />
                            </div>
                            <div className={styles.workflowDraftSubcard}>
                              <div className={styles.workflowDraftLabel}>Product / policy name</div>
                              <input
                                className={finleyStyles.clientSearch}
                                value={policy.productName ?? ""}
                                onChange={(event) => updateInsurancePolicy(policy.policyRecommendationId, { productName: event.target.value })}
                              />
                            </div>
                          </div>
                          <div className={styles.workflowDraftSubcard}>
                            <div className={styles.workflowDraftLabel}>Recommendation wording</div>
                            <textarea
                              className={`${finleyStyles.composerInput} ${styles.mediumTextarea}`.trim()}
                              value={policy.recommendationText ?? ""}
                              onChange={(event) => updateInsurancePolicy(policy.policyRecommendationId, { recommendationText: event.target.value })}
                              placeholder="Explain the recommended cover structure in client-facing wording."
                            />
                          </div>
                          {policy.ownershipGroups.map((group, groupIndex) => (
                            <div key={group.groupId} className={styles.workflowDraftSubcard}>
                              <div className={styles.workflowDraftHeader}>
                                <div className={styles.workflowDraftLabel}>Ownership / funding group {groupIndex + 1}</div>
                                <button
                                  type="button"
                                  className={styles.objectiveDeleteButton}
                                  onClick={() => {
                                    updateInsurancePolicy(policy.policyRecommendationId, {
                                      ownershipGroups: policy.ownershipGroups.filter((entry) => entry.groupId !== group.groupId),
                                    });
                                  }}
                                >
                                  Delete group
                                </button>
                              </div>
                              <div className={styles.sectionGridCompact}>
                                <div className={styles.workflowDraftSubcard}>
                                  <div className={styles.workflowDraftLabel}>Ownership</div>
                                  <select
                                    className={finleyStyles.clientSearch}
                                    value={group.ownership}
                                    onChange={(event) =>
                                      updateInsuranceOwnershipGroup(policy.policyRecommendationId, group.groupId, {
                                        ownership: event.target.value as InsurancePolicyOwnershipGroupV1["ownership"],
                                      })
                                    }
                                  >
                                    {INSURANCE_OWNERSHIP_OPTIONS.map((option) => (
                                      <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className={styles.workflowDraftSubcard}>
                                  <div className={styles.workflowDraftLabel}>Funding source</div>
                                  <input
                                    className={finleyStyles.clientSearch}
                                    value={group.fundingSource ?? ""}
                                    onChange={(event) => updateInsuranceOwnershipGroup(policy.policyRecommendationId, group.groupId, { fundingSource: event.target.value })}
                                  />
                                </div>
                                <div className={styles.workflowDraftSubcard}>
                                  <div className={styles.workflowDraftLabel}>Premium amount</div>
                                  <input
                                    className={finleyStyles.clientSearch}
                                    inputMode="decimal"
                                    placeholder="$0.00"
                                    value={group.premiumAmount ?? ""}
                                    onChange={(event) =>
                                      updateInsuranceOwnershipGroup(policy.policyRecommendationId, group.groupId, {
                                        premiumAmount: parseCurrencyInput(event.target.value),
                                      })
                                    }
                                  />
                                </div>
                                <div className={styles.workflowDraftSubcard}>
                                  <div className={styles.workflowDraftLabel}>Frequency</div>
                                  <select
                                    className={finleyStyles.clientSearch}
                                    value={group.premiumFrequency ?? "unknown"}
                                    onChange={(event) =>
                                      updateInsuranceOwnershipGroup(policy.policyRecommendationId, group.groupId, {
                                        premiumFrequency: event.target.value as NonNullable<InsurancePolicyOwnershipGroupV1["premiumFrequency"]>,
                                        annualisedPremium: null,
                                      })
                                    }
                                  >
                                    {INSURANCE_PREMIUM_FREQUENCY_OPTIONS.map((option) => (
                                      <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              <div className={styles.dataTableWrap}>
                                <table className={styles.dataTable}>
                                  <thead>
                                    <tr>
                                      <th>Cover type</th>
                                      <th>Details</th>
                                      <th>Premium type</th>
                                      <th>Sum insured / benefit</th>
                                      <th>Waiting / benefit</th>
                                      <th />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {group.covers.map((cover) => (
                                      <tr key={cover.coverId}>
                                        <td>
                                          <select
                                            className={finleyStyles.clientSearch}
                                            value={cover.coverType}
                                            onChange={(event) =>
                                              updateInsuranceCover(policy.policyRecommendationId, group.groupId, cover.coverId, {
                                                coverType: event.target.value as InsurancePolicyCoverComponentV1["coverType"],
                                              })
                                            }
                                          >
                                            {INSURANCE_COVER_TYPE_OPTIONS.map((option) => (
                                              <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                          </select>
                                        </td>
                                        <td>
                                          <input
                                            className={finleyStyles.clientSearch}
                                            value={cover.details ?? ""}
                                            onChange={(event) =>
                                              updateInsuranceCover(policy.policyRecommendationId, group.groupId, cover.coverId, { details: event.target.value })
                                            }
                                          />
                                        </td>
                                        <td>
                                          <select
                                            className={finleyStyles.clientSearch}
                                            value={cover.premiumType ?? "unknown"}
                                            onChange={(event) =>
                                              updateInsuranceCover(policy.policyRecommendationId, group.groupId, cover.coverId, {
                                                premiumType: event.target.value as NonNullable<InsurancePolicyCoverComponentV1["premiumType"]>,
                                              })
                                            }
                                          >
                                            {INSURANCE_PREMIUM_TYPE_OPTIONS.map((option) => (
                                              <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                          </select>
                                        </td>
                                        <td>
                                          <input
                                            className={finleyStyles.clientSearch}
                                            inputMode="decimal"
                                            placeholder="$0.00"
                                            value={(cover.coverType === "income-protection" ? cover.monthlyBenefit : cover.sumInsured) ?? ""}
                                            onChange={(event) =>
                                              updateInsuranceCover(policy.policyRecommendationId, group.groupId, cover.coverId, {
                                                [cover.coverType === "income-protection" ? "monthlyBenefit" : "sumInsured"]: parseCurrencyInput(event.target.value),
                                              })
                                            }
                                          />
                                        </td>
                                        <td>
                                          <input
                                            className={finleyStyles.clientSearch}
                                            value={[cover.waitingPeriod, cover.benefitPeriod].filter(Boolean).join(" / ")}
                                            onChange={(event) => {
                                              const [waitingPeriod, benefitPeriod] = event.target.value.split("/").map((part) => part.trim());
                                              updateInsuranceCover(policy.policyRecommendationId, group.groupId, cover.coverId, {
                                                waitingPeriod: waitingPeriod || null,
                                                benefitPeriod: benefitPeriod || null,
                                              });
                                            }}
                                          />
                                        </td>
                                        <td>
                                          <button
                                            type="button"
                                            className={styles.objectiveDeleteButton}
                                            onClick={() =>
                                              updateInsuranceOwnershipGroup(policy.policyRecommendationId, group.groupId, {
                                                covers: group.covers.filter((entry) => entry.coverId !== cover.coverId),
                                              })
                                            }
                                          >
                                            Delete
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              <div className={styles.sectionActionRow}>
                                <button
                                  type="button"
                                  className={styles.sectionActionButton}
                                  onClick={() =>
                                    updateInsuranceOwnershipGroup(policy.policyRecommendationId, group.groupId, {
                                      covers: [...group.covers, createInsuranceCover()],
                                    })
                                  }
                                >
                                  Add cover
                                </button>
                                <span className={styles.workflowDraftPreview}>
                                  Annualised premium: {formatCurrency(getInsuranceAnnualisedPremium(group))}
                                </span>
                              </div>
                            </div>
                          ))}
                          <div className={styles.sectionActionRow}>
                            <button
                              type="button"
                              className={styles.sectionActionButton}
                              onClick={() =>
                                updateInsurancePolicy(policy.policyRecommendationId, {
                                  ownershipGroups: [...policy.ownershipGroups, createInsuranceOwnershipGroup()],
                                })
                              }
                            >
                              Add ownership group
                            </button>
                          </div>
                          <div className={styles.sectionGridCompact}>
                            <div className={styles.workflowDraftSubcard}>
                              <div className={styles.workflowDraftLabel}>Optional benefits</div>
                              <textarea
                                className={`${finleyStyles.composerInput} ${styles.mediumTextarea}`.trim()}
                                value={(policy.optionalBenefits ?? []).join("\n")}
                                onChange={(event) =>
                                  updateInsurancePolicy(policy.policyRecommendationId, { optionalBenefits: splitNonEmptyLines(event.target.value) })
                                }
                                placeholder="One optional benefit per line"
                              />
                            </div>
                            <div className={styles.workflowDraftSubcard}>
                              <div className={styles.workflowDraftLabel}>Underwriting / replacement notes</div>
                              <textarea
                                className={`${finleyStyles.composerInput} ${styles.mediumTextarea}`.trim()}
                                value={[policy.underwritingNotes, policy.replacementNotes].filter(Boolean).join("\n")}
                                onChange={(event) => updateInsurancePolicy(policy.policyRecommendationId, { underwritingNotes: event.target.value })}
                                placeholder="Underwriting warnings, exclusions, loadings, replacement or retention notes"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </>
              ) : null}
              {activeSectionId === "insurance-replacement" ? (
                <>
                  <div className={styles.workflowDraftStack}>
                    <div className={styles.workflowDraftHeader}>
                      <div>
                        <div className={styles.workflowDraftLabel}>Insurance product replacement</div>
                        <div className={styles.workflowDraftPreview}>
                          Compare current cover against the recommended replacement and record the reasons, costs, and benefits gained or lost.
                        </div>
                      </div>
                      <button
                        type="button"
                        className={styles.sectionActionButton}
                        onClick={() => {
                          const ownerPersonId = activeInsurancePersonId ?? adviceCase.clientGroup.clients[0]?.personId;
                          setAdviceCase((current) => ({
                            ...current,
                            recommendations: {
                              ...current.recommendations,
                              insuranceReplacements: [
                                ...(current.recommendations.insuranceReplacements ?? []),
                                createInsurancePolicyReplacement(ownerPersonId),
                              ],
                            },
                            metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                          }));
                          setConfirmedSections((current) => ({ ...current, "insurance-replacement": false }));
                        }}
                      >
                        Add insurance replacement
                      </button>
                    </div>
                    {(adviceCase.recommendations.insuranceReplacements ?? []).map((replacement, index) => (
                      <div key={replacement.replacementId} className={styles.workflowDraftCard}>
                        <div className={styles.workflowDraftHeader}>
                          <div className={styles.workflowDraftLabel}>Insurance replacement {index + 1}</div>
                          <button
                            type="button"
                            className={styles.objectiveDeleteButton}
                            onClick={() => {
                              if (!window.confirm(`Delete Insurance Replacement ${index + 1}?`)) {
                                return;
                              }
                              setAdviceCase((current) => ({
                                ...current,
                                recommendations: {
                                  ...current.recommendations,
                                  insuranceReplacements: (current.recommendations.insuranceReplacements ?? []).filter(
                                    (entry) => entry.replacementId !== replacement.replacementId,
                                  ),
                                },
                                metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                              }));
                              setConfirmedSections((current) => ({ ...current, "insurance-replacement": false }));
                            }}
                          >
                            Delete
                          </button>
                        </div>
                        <div className={styles.workflowDraftSubcard}>
                          <div className={styles.workflowDraftLabel}>Policy owner</div>
                          <select
                            className={finleyStyles.clientSearch}
                            value={replacement.ownerPersonId ?? ""}
                            onChange={(event) => updateInsuranceReplacement(replacement.replacementId, { ownerPersonId: event.target.value || null })}
                          >
                            <option value="">Unspecified</option>
                            {adviceCase.clientGroup.clients.map((person) => (
                              <option key={person.personId} value={person.personId}>
                                {person.fullName}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className={styles.sectionGridCompact}>
                          {(["currentPolicy", "recommendedPolicy"] as const).map((side) => {
                            const snapshot = replacement[side];
                            return (
                              <div key={side} className={styles.workflowDraftSubcard}>
                                <div className={styles.workflowDraftLabel}>
                                  {side === "currentPolicy" ? "Current insurance policy/policies" : "Recommended insurance policy"}
                                </div>
                                <input
                                  className={finleyStyles.clientSearch}
                                  placeholder="Insurer"
                                  value={snapshot.insurer ?? ""}
                                  onChange={(event) => updateInsuranceReplacementPolicy(replacement.replacementId, side, { insurer: event.target.value })}
                                />
                                <input
                                  className={finleyStyles.clientSearch}
                                  inputMode="decimal"
                                  placeholder="Total life cover"
                                  value={snapshot.totalLifeCover ?? ""}
                                  onChange={(event) => updateInsuranceReplacementPolicy(replacement.replacementId, side, { totalLifeCover: parseCurrencyInput(event.target.value) })}
                                />
                                <input
                                  className={finleyStyles.clientSearch}
                                  inputMode="decimal"
                                  placeholder="Total TPD cover"
                                  value={snapshot.totalTpdCover ?? ""}
                                  onChange={(event) => updateInsuranceReplacementPolicy(replacement.replacementId, side, { totalTpdCover: parseCurrencyInput(event.target.value) })}
                                />
                                <input
                                  className={finleyStyles.clientSearch}
                                  inputMode="decimal"
                                  placeholder="Total income protection cover"
                                  value={snapshot.totalIncomeProtectionCover ?? ""}
                                  onChange={(event) => updateInsuranceReplacementPolicy(replacement.replacementId, side, { totalIncomeProtectionCover: parseCurrencyInput(event.target.value) })}
                                />
                                <input
                                  className={finleyStyles.clientSearch}
                                  inputMode="decimal"
                                  placeholder="Total trauma cover"
                                  value={snapshot.totalTraumaCover ?? ""}
                                  onChange={(event) => updateInsuranceReplacementPolicy(replacement.replacementId, side, { totalTraumaCover: parseCurrencyInput(event.target.value) })}
                                />
                                <input
                                  className={finleyStyles.clientSearch}
                                  inputMode="decimal"
                                  placeholder="Total annual premium"
                                  value={snapshot.totalAnnualPremium ?? ""}
                                  onChange={(event) => updateInsuranceReplacementPolicy(replacement.replacementId, side, { totalAnnualPremium: parseCurrencyInput(event.target.value) })}
                                />
                              </div>
                            );
                          })}
                        </div>
                        <div className={styles.sectionGridCompact}>
                          <div className={styles.workflowDraftSubcard}>
                            <div className={styles.workflowDraftLabel}>Reasons for replacement</div>
                            <textarea
                              className={`${finleyStyles.composerInput} ${styles.mediumTextarea}`.trim()}
                              value={replacement.reasons.join("\n")}
                              onChange={(event) => updateInsuranceReplacement(replacement.replacementId, { reasons: splitNonEmptyLines(event.target.value) })}
                              placeholder="One reason per line"
                            />
                          </div>
                          <div className={styles.workflowDraftSubcard}>
                            <div className={styles.workflowDraftLabel}>Costs of replacement</div>
                            <textarea
                              className={`${finleyStyles.composerInput} ${styles.mediumTextarea}`.trim()}
                              value={replacement.costs.join("\n")}
                              onChange={(event) => updateInsuranceReplacement(replacement.replacementId, { costs: splitNonEmptyLines(event.target.value) })}
                              placeholder="One cost or risk per line"
                            />
                          </div>
                          <div className={styles.workflowDraftSubcard}>
                            <div className={styles.workflowDraftLabel}>Policy benefits gained</div>
                            <textarea
                              className={`${finleyStyles.composerInput} ${styles.mediumTextarea}`.trim()}
                              value={replacement.benefitsGained.join("\n")}
                              onChange={(event) => updateInsuranceReplacement(replacement.replacementId, { benefitsGained: splitNonEmptyLines(event.target.value) })}
                              placeholder="One gained benefit per line"
                            />
                          </div>
                          <div className={styles.workflowDraftSubcard}>
                            <div className={styles.workflowDraftLabel}>Policy benefits lost</div>
                            <textarea
                              className={`${finleyStyles.composerInput} ${styles.mediumTextarea}`.trim()}
                              value={replacement.benefitsLost.join("\n")}
                              onChange={(event) => updateInsuranceReplacement(replacement.replacementId, { benefitsLost: splitNonEmptyLines(event.target.value) })}
                              placeholder="One lost benefit per line"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
              {activeSectionId === "portfolio-allocation" ? (
                <>
                  {portfolioAccountViews.some((account) => account.holdings.length || account.allocationComparison.length) ? (
                    <div className={styles.workflowDraftStack}>
                      {portfolioAccountViews.map((account) => (
                        <div key={account.accountId} className={styles.workflowDraftCard}>
                          <div className={styles.workflowDraftHeader}>
                            <div>
                              <div className={styles.workflowDraftLabel}>Portfolio account</div>
                              <div className={styles.workflowDraftPreview}>{account.label}</div>
                            </div>
                            <div className={styles.workflowDraftPreview}>{account.sourceFileName ?? "Imported data"}</div>
                          </div>

                          {account.holdings.length ? (
                            <div className={styles.workflowDraftSubcard}>
                              <div className={styles.workflowDraftLabel}>Recommended portfolio holdings</div>
                              <div className={styles.dataTableWrap}>
                                <table className={styles.dataTable}>
                                  <thead>
                                    <tr>
                                      <th>Fund</th>
                                      <th>Current</th>
                                      <th>Change</th>
                                      <th>Proposed</th>
                                      <th>Fee %</th>
                                      <th>Fee $</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {groupHoldingsByPlatform(account.holdings).flatMap(({ platformName, items }) => {
                                      const subtotalCurrent = items.reduce(
                                        (sum, holding) => sum + getPortfolioHoldingAmounts(holding).currentAmount,
                                        0,
                                      );
                                      const subtotalChange = items.reduce(
                                        (sum, holding) => sum + getPortfolioHoldingAmounts(holding).changeAmount,
                                        0,
                                      );
                                      const subtotalProposed = items.reduce(
                                        (sum, holding) => sum + getPortfolioHoldingAmounts(holding).proposedAmount,
                                        0,
                                      );

                                      return [
                                        <tr key={`${account.accountId}-${platformName}-heading`} className={styles.dataTableGroupRow}>
                                          <td colSpan={6}>{platformName}</td>
                                        </tr>,
                                        ...items.map((holding) => {
                                          const { currentAmount, changeAmount, proposedAmount } = getPortfolioHoldingAmounts(holding);

                                          return (
                                            <tr key={holding.holdingId}>
                                              <td>{holding.fundName}</td>
                                              <td>{formatCurrency(currentAmount)}</td>
                                              <td>{formatCurrency(changeAmount)}</td>
                                              <td>{formatCurrency(proposedAmount)}</td>
                                              <td>{formatPercent(holding.investmentFeePct)}</td>
                                              <td>{formatCurrency(holding.investmentFeeAmount)}</td>
                                            </tr>
                                          );
                                        }),
                                        <tr key={`${account.accountId}-${platformName}-subtotal`} className={styles.dataTableTotalRow}>
                                          <td>Subtotal</td>
                                          <td>{formatCurrency(subtotalCurrent)}</td>
                                          <td>{formatCurrency(subtotalChange)}</td>
                                          <td>{formatCurrency(subtotalProposed)}</td>
                                          <td>—</td>
                                          <td>—</td>
                                        </tr>,
                                      ];
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ) : null}

                          {account.allocationComparison.length ? (
                            <div className={styles.workflowDraftSubcard}>
                              <div className={styles.workflowDraftLabel}>Asset allocation comparison</div>
                              <div className={styles.dataTableWrap}>
                                <table className={styles.dataTable}>
                                  <thead>
                                    <tr>
                                      <th>Asset class</th>
                                      <th>Current</th>
                                      <th>Risk profile</th>
                                      <th>Recommended</th>
                                      <th>Variance</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {account.allocationComparison.map((row) => (
                                      <tr
                                        key={row.rowId}
                                        className={
                                          row.assetClass.toLowerCase().startsWith("total defensive") ||
                                          row.assetClass.toLowerCase().startsWith("total growth")
                                            ? styles.dataTableTotalRow
                                            : undefined
                                        }
                                      >
                                        <td>{row.assetClass}</td>
                                        <td>{formatPercent(row.currentPct)}</td>
                                        <td>{formatPercent(row.riskProfilePct)}</td>
                                        <td>{formatPercent(row.recommendedPct)}</td>
                                        <td>{formatPercent(row.variancePct)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.sectionCard}>
                      <div className={styles.sectionCardText}>
                        Upload a ProductRex report to populate recommended holdings and allocation comparisons.
                      </div>
                    </div>
                  )}
                </>
              ) : null}
              {activeSectionId === "service-agreement" ? (
                <div className={styles.workflowDraftStack}>
                  <div className={styles.workflowDraftSubcard}>
                    <div className={styles.workflowDraftLabel}>Service agreement</div>
                    <div className={styles.sectionGridCompact}>
                      <div className={styles.workflowDraftSubcard}>
                        <div className={styles.workflowDraftLabel}>Include service agreement</div>
                        <select
                          className={finleyStyles.clientSearch}
                          value={adviceCase.agreements.feeAgreement?.present ? "yes" : "no"}
                          onChange={(event) => {
                            const includeAgreement = event.target.value === "yes";
                            setAdviceCase((current) => ({
                              ...current,
                              agreements: {
                                feeAgreement: includeAgreement
                                  ? current.agreements.feeAgreement ?? {
                                      present: true,
                                      agreementType: "ongoing",
                                      services: DEFAULT_SERVICE_AGREEMENT_SERVICES,
                                      feeItems: [],
                                    }
                                  : { present: false, agreementType: "none", services: [], feeItems: [] },
                              },
                              metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                            }));
                            setConfirmedSections((current) => ({ ...current, "service-agreement": false }));
                          }}
                        >
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      </div>
                      <div className={styles.workflowDraftSubcard}>
                        <div className={styles.workflowDraftLabel}>Agreement type</div>
                        <select
                          className={finleyStyles.clientSearch}
                          value={adviceCase.agreements.feeAgreement?.agreementType === "fixed-term" ? "fixed-term" : "ongoing"}
                          onChange={(event) => {
                            setAdviceCase((current) => ({
                              ...current,
                              agreements: {
                                feeAgreement: {
                                  present: true,
                                  agreementType: event.target.value as "ongoing" | "fixed-term",
                                  services: current.agreements.feeAgreement?.services.length
                                    ? current.agreements.feeAgreement.services
                                    : DEFAULT_SERVICE_AGREEMENT_SERVICES,
                                  feeItems: current.agreements.feeAgreement?.feeItems ?? [],
                                },
                              },
                              metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                            }));
                            setConfirmedSections((current) => ({ ...current, "service-agreement": false }));
                          }}
                        >
                          <option value="ongoing">Ongoing agreement</option>
                          <option value="fixed-term">Fixed Term Agreement</option>
                        </select>
                      </div>
                    </div>
                    <div className={styles.workflowDraftSubcard}>
                      <div className={styles.workflowDraftLabel}>Services / limitations</div>
                      <textarea
                        className={`${finleyStyles.composerInput} ${styles.mediumTextarea}`.trim()}
                        placeholder="One service or limitation per line"
                        value={(adviceCase.agreements.feeAgreement?.services.length
                          ? adviceCase.agreements.feeAgreement.services
                          : adviceCase.agreements.feeAgreement?.present
                            ? DEFAULT_SERVICE_AGREEMENT_SERVICES
                            : adviceCase.disclosures.limitations
                        ).join("\n")}
                        onChange={(event) => {
                          const entries = splitNonEmptyLines(event.target.value);
                          setAdviceCase((current) => ({
                            ...current,
                            agreements: {
                              feeAgreement: current.agreements.feeAgreement
                                ? {
                                    ...current.agreements.feeAgreement,
                                    services: entries,
                                  }
                                : {
                                    present: false,
                                    agreementType: "none",
                                    services: entries,
                                    feeItems: [],
                                  },
                            },
                            disclosures: {
                              ...current.disclosures,
                              limitations: entries,
                            },
                            metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                          }));
                          setConfirmedSections((current) => ({ ...current, "service-agreement": false }));
                        }}
                      />
                    </div>
                    <div className={styles.workflowDraftSubcard}>
                      <div className={styles.workflowDraftHeader}>
                        <div className={styles.workflowDraftLabel}>Annual advice fees</div>
                        <button
                          type="button"
                          className={styles.sectionActionButton}
                          onClick={() => {
                            setAdviceCase((current) => ({
                              ...current,
                              agreements: {
                                feeAgreement: {
                                  ...(current.agreements.feeAgreement ?? {
                                    present: true,
                                    agreementType: "ongoing" as const,
                                    services: DEFAULT_SERVICE_AGREEMENT_SERVICES,
                                  }),
                                  feeItems: [
                                    ...(current.agreements.feeAgreement?.feeItems ?? []),
                                    {
                                      feeItemId: makeId("service-fee"),
                                      ownerPersonId: current.clientGroup.clients[0]?.personId ?? null,
                                      productName: "",
                                      accountNumber: "",
                                      feeAmount: null,
                                      frequency: "monthly",
                                    },
                                  ],
                                },
                              },
                              metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                            }));
                            setConfirmedSections((current) => ({ ...current, "service-agreement": false }));
                          }}
                        >
                          Add fee
                        </button>
                      </div>
                      <div className={styles.workflowDraftStack}>
                        {(adviceCase.agreements.feeAgreement?.feeItems ?? []).map((feeItem, index) => (
                          <div key={feeItem.feeItemId} className={styles.workflowDraftSubcard}>
                            <div className={styles.workflowDraftHeader}>
                              <div className={styles.workflowDraftLabel}>Fee {index + 1}</div>
                              <button
                                type="button"
                                className={styles.objectiveDeleteButton}
                                onClick={() => {
                                  if (!window.confirm(`Delete Fee ${index + 1}?`)) {
                                    return;
                                  }
                                  setAdviceCase((current) => ({
                                    ...current,
                                    agreements: {
                                      feeAgreement: current.agreements.feeAgreement
                                        ? {
                                            ...current.agreements.feeAgreement,
                                            feeItems: (current.agreements.feeAgreement.feeItems ?? []).filter(
                                              (entry) => entry.feeItemId !== feeItem.feeItemId,
                                            ),
                                          }
                                        : null,
                                    },
                                    metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                  }));
                                  setConfirmedSections((current) => ({ ...current, "service-agreement": false }));
                                }}
                              >
                                Delete
                              </button>
                            </div>
                            <div className={styles.sectionGridCompact}>
                              <div className={styles.workflowDraftSubcard}>
                                <div className={styles.workflowDraftLabel}>Client / partner</div>
                                <select
                                  className={finleyStyles.clientSearch}
                                  value={feeItem.ownerPersonId ?? adviceCase.clientGroup.clients[0]?.personId ?? ""}
                                  onChange={(event) => updateServiceAgreementFeeItem(feeItem.feeItemId, { ownerPersonId: event.target.value })}
                                >
                                  {adviceCase.clientGroup.clients.map((person) => (
                                    <option key={person.personId} value={person.personId}>
                                      {person.fullName}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className={styles.workflowDraftSubcard}>
                                <div className={styles.workflowDraftLabel}>Product</div>
                                <input
                                  className={finleyStyles.clientSearch}
                                  placeholder="Product"
                                  value={feeItem.productName ?? ""}
                                  onChange={(event) => updateServiceAgreementFeeItem(feeItem.feeItemId, { productName: event.target.value })}
                                />
                              </div>
                              <div className={styles.workflowDraftSubcard}>
                                <div className={styles.workflowDraftLabel}>Account number</div>
                                <input
                                  className={finleyStyles.clientSearch}
                                  placeholder="Account number"
                                  value={feeItem.accountNumber ?? ""}
                                  onChange={(event) => updateServiceAgreementFeeItem(feeItem.feeItemId, { accountNumber: event.target.value })}
                                />
                              </div>
                              <div className={styles.workflowDraftSubcard}>
                                <div className={styles.workflowDraftLabel}>Fee amount</div>
                                <input
                                  className={finleyStyles.clientSearch}
                                  inputMode="decimal"
                                  placeholder="$0.00"
                                  value={feeItem.feeAmount ?? ""}
                                  onChange={(event) =>
                                    updateServiceAgreementFeeItem(feeItem.feeItemId, { feeAmount: parseCurrencyInput(event.target.value) })
                                  }
                                />
                              </div>
                              <div className={styles.workflowDraftSubcard}>
                                <div className={styles.workflowDraftLabel}>Frequency</div>
                                <select
                                  className={finleyStyles.clientSearch}
                                  value={feeItem.frequency}
                                  onChange={(event) =>
                                    updateServiceAgreementFeeItem(feeItem.feeItemId, {
                                      frequency: event.target.value as ServiceAgreementFeeItemV1["frequency"],
                                    })
                                  }
                                >
                                  {SERVICE_FEE_FREQUENCY_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className={styles.workflowDraftSubcard}>
                                <div className={styles.workflowDraftLabel}>Annualised total</div>
                                <input className={finleyStyles.clientSearch} value={formatCurrency(getServiceFeeAnnualAmount(feeItem))} readOnly />
                              </div>
                            </div>
                          </div>
                        ))}
                        {adviceCase.agreements.feeAgreement?.feeItems?.length ? (
                          <div className={styles.dataTableWrap}>
                            <table className={styles.dataTable}>
                              <thead>
                                <tr>
                                  <th>Entity</th>
                                  <th>Product</th>
                                  <th>Account number</th>
                                  <th>Fee amount</th>
                                  <th>Frequency</th>
                                  <th>Total annual fee</th>
                                </tr>
                              </thead>
                              <tbody>
                                {adviceCase.agreements.feeAgreement.feeItems.map((feeItem) => (
                                  <tr key={feeItem.feeItemId}>
                                    <td>{getCommissionOwnerLabel(feeItem.ownerPersonId)}</td>
                                    <td>{feeItem.productName || "—"}</td>
                                    <td>{feeItem.accountNumber || "—"}</td>
                                    <td>{formatCurrency(feeItem.feeAmount)}</td>
                                    <td>{SERVICE_FEE_FREQUENCY_OPTIONS.find((option) => option.value === feeItem.frequency)?.label ?? feeItem.frequency}</td>
                                    <td>{formatCurrency(getServiceFeeAnnualAmount(feeItem))}</td>
                                  </tr>
                                ))}
                                <tr className={styles.dataTableTotalRow}>
                                  <td colSpan={5}>Total Annual Advice Fees</td>
                                  <td>
                                    {formatCurrency(
                                      adviceCase.agreements.feeAgreement.feeItems.reduce(
                                        (sum, feeItem) => sum + getServiceFeeAnnualAmount(feeItem),
                                        0,
                                      ),
                                    )}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
              {activeSectionId === "disclosure" ? (
                <>
                  {productFeeGroups.length ? (
                    <div className={styles.workflowDraftSubcard}>
                      <div className={styles.workflowDraftLabel}>Product fee summary</div>
                      <div className={styles.workflowDraftStack}>
                        {productFeeGroups.map((group) => (
                          <div key={group.key} className={styles.workflowDraftSubcard}>
                            <div className={styles.workflowDraftPreview}>{group.label}</div>
                            <div className={styles.dataTableWrap}>
                              <table className={styles.dataTable}>
                                <thead>
                                  <tr>
                                    <th>Product</th>
                                    <th>Fee type</th>
                                    <th>Fee %</th>
                                    <th>Fee $</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.fees.map((fee) => (
                                    <tr key={fee.feeId}>
                                      <td>{fee.productName ?? "—"}</td>
                                      <td>{fee.feeType}</td>
                                      <td>{formatPercent(fee.percentage)}</td>
                                      <td>{formatCurrency(fee.amount)}</td>
                                    </tr>
                                  ))}
                                  <tr className={styles.dataTableTotalRow}>
                                    <td colSpan={3}>Total</td>
                                    <td>{formatCurrency(group.fees.some((fee) => fee.amount != null) ? group.fees.reduce((sum, fee) => sum + (fee.amount ?? 0), 0) : null)}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                        {productFeeGroups.length > 1 ? (
                          <div className={styles.dataTableWrap}>
                            <table className={styles.dataTable}>
                              <tbody>
                                <tr className={styles.dataTableTotalRow}>
                                  <td>Total product fees</td>
                                  <td>{formatCurrency(hasProductFeeAmount ? totalProductFeeAmount : null)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {transactionFeeGroups.length ? (
                    <div className={styles.workflowDraftSubcard}>
                      <div className={styles.workflowDraftLabel}>Transaction fee summary</div>
                      <div className={styles.workflowDraftStack}>
                        {transactionFeeGroups.map((group) => (
                          <div key={group.key} className={styles.workflowDraftSubcard}>
                            <div className={styles.workflowDraftHeader}>
                              <div className={styles.workflowDraftPreview}>{group.label}</div>
                              <div className={styles.workflowDraftPreview}>{group.sourceFileName}</div>
                            </div>
                            <div className={styles.dataTableWrap}>
                              <table className={styles.dataTable}>
                                <thead>
                                  <tr>
                                    <th>Fund</th>
                                    <th>Transaction</th>
                                    <th>Buy/Sell %</th>
                                    <th>Buy/Sell $</th>
                                    <th>Brokerage</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {groupRowsByPlatform(group.rows).flatMap(({ platformName, items }) => [
                                    <tr key={`${group.key}-${platformName}`} className={styles.dataTableGroupRow}>
                                      <td colSpan={5}>{platformName}</td>
                                    </tr>,
                                    ...items.map((row) => (
                                      <tr key={row.transactionId}>
                                        <td>{row.fundName}</td>
                                        <td>{formatCurrency(row.transactionAmount)}</td>
                                        <td>{formatPercent(row.buySellSpreadPct)}</td>
                                        <td>{formatCurrency(row.buySellSpreadAmount)}</td>
                                        <td>{formatCurrency(row.brokerageAmount)}</td>
                                      </tr>
                                    )),
                                  ])}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className={styles.workflowDraftStack}>
                    <div className={styles.workflowDraftSubcard}>
                      <div className={styles.workflowDraftLabel}>Upfront fees</div>
                      <div className={styles.sectionGridCompact}>
                        <div className={styles.workflowDraftSubcard}>
                          <div className={styles.workflowDraftLabel}>Advice preparation fee</div>
                          <input
                            className={finleyStyles.clientSearch}
                            inputMode="decimal"
                            placeholder="$0.00"
                            value={getUpfrontFeeInputValue("preparation")}
                            onFocus={() => beginUpfrontFeeEdit("preparation")}
                            onBlur={() => setActiveUpfrontFeeInput(null)}
                            onChange={(event) => updateUpfrontFee("preparation", event.target.value)}
                          />
                        </div>
                        <div className={styles.workflowDraftSubcard}>
                          <div className={styles.workflowDraftLabel}>Implementation fee</div>
                          <input
                            className={finleyStyles.clientSearch}
                            inputMode="decimal"
                            placeholder="$0.00"
                            value={getUpfrontFeeInputValue("implementation")}
                            onFocus={() => beginUpfrontFeeEdit("implementation")}
                            onBlur={() => setActiveUpfrontFeeInput(null)}
                            onChange={(event) => updateUpfrontFee("implementation", event.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    <div className={styles.workflowDraftSubcard}>
                      <div className={styles.workflowDraftLabel}>Insurance commission</div>
                      <div className={styles.sectionGridCompact}>
                        <div className={styles.workflowDraftSubcard}>
                          <div className={styles.workflowDraftLabel}>Include insurance commission</div>
                          <select
                            className={finleyStyles.clientSearch}
                            value={adviceCase.fees.commissions.length ? "yes" : "no"}
                            onChange={(event) => {
                              const includeCommissions = event.target.value === "yes";
                              setAdviceCase((current) => ({
                                ...current,
                                fees: {
                                  ...current.fees,
                                  commissions: includeCommissions
                                    ? current.fees.commissions.length
                                      ? current.fees.commissions
                                      : [
                                          {
                                            commissionId: makeId("commission"),
                                            type: "upfront",
                                            productType: "insurance",
                                            ownerPersonId: current.clientGroup.clients[0]?.personId ?? null,
                                            productName: "",
                                            upfrontPercentage: DEFAULT_UPFRONT_COMMISSION_PERCENTAGE,
                                            upfrontAmount: null,
                                            ongoingPercentage: DEFAULT_ONGOING_COMMISSION_PERCENTAGE,
                                            ongoingAmount: null,
                                            disclosed: true,
                                          },
                                        ]
                                    : [],
                                },
                                metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                              }));
                              setConfirmedSections((current) => ({ ...current, disclosure: false }));
                            }}
                          >
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                          </select>
                        </div>
                      </div>
                      {adviceCase.fees.commissions.length ? (
                        <div className={styles.workflowDraftStack}>
                          {adviceCase.fees.commissions.map((commission, index) => (
                            <div key={commission.commissionId} className={styles.workflowDraftSubcard}>
                              <div className={styles.workflowDraftHeader}>
                                <div className={styles.workflowDraftLabel}>Commission {index + 1}</div>
                                <button
                                  type="button"
                                  className={styles.objectiveDeleteButton}
                                  onClick={() => {
                                    if (!window.confirm(`Delete Commission ${index + 1}?`)) {
                                      return;
                                    }
                                    setAdviceCase((current) => ({
                                      ...current,
                                      fees: {
                                        ...current.fees,
                                        commissions: current.fees.commissions.filter(
                                          (entry) => entry.commissionId !== commission.commissionId,
                                        ),
                                      },
                                      metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                    }));
                                    setConfirmedSections((current) => ({ ...current, disclosure: false }));
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                              <div className={styles.sectionGridCompact}>
                                <div className={styles.workflowDraftSubcard}>
                                  <div className={styles.workflowDraftLabel}>Product</div>
                                  <input
                                    className={finleyStyles.clientSearch}
                                    placeholder="Product name"
                                    value={commission.productName ?? ""}
                                    onChange={(event) => {
                                      const nextValue = event.target.value;
                                      setAdviceCase((current) => ({
                                        ...current,
                                        fees: {
                                          ...current.fees,
                                          commissions: current.fees.commissions.map((entry) =>
                                            entry.commissionId === commission.commissionId
                                              ? { ...entry, productName: nextValue }
                                              : entry,
                                          ),
                                        },
                                        metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                      }));
                                      setConfirmedSections((current) => ({ ...current, disclosure: false }));
                                    }}
                                  />
                                </div>
                                <div className={styles.workflowDraftSubcard}>
                                  <div className={styles.workflowDraftLabel}>Policy owner</div>
                                  <select
                                    className={finleyStyles.clientSearch}
                                    value={getCommissionOwnerPersonId(commission.ownerPersonId)}
                                    onChange={(event) => {
                                      setAdviceCase((current) => ({
                                        ...current,
                                        fees: {
                                          ...current.fees,
                                          commissions: current.fees.commissions.map((entry) =>
                                            entry.commissionId === commission.commissionId
                                              ? { ...entry, ownerPersonId: event.target.value }
                                              : entry,
                                          ),
                                        },
                                        metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                      }));
                                      setConfirmedSections((current) => ({ ...current, disclosure: false }));
                                    }}
                                  >
                                    {adviceCase.clientGroup.clients.map((person) => (
                                      <option key={person.personId} value={person.personId}>
                                        {getCommissionOwnerLabel(person.personId)}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className={styles.workflowDraftSubcard}>
                                  <div className={styles.workflowDraftLabel}>Upfront %</div>
                                  <input
                                    className={finleyStyles.clientSearch}
                                    inputMode="decimal"
                                    placeholder="0.00%"
                                    value={getCommissionInputValue(
                                      commission.commissionId,
                                      "upfrontPercentage",
                                      getCommissionNumberValue(commission, "upfrontPercentage"),
                                    )}
                                    onFocus={() =>
                                      beginCommissionEdit(
                                        commission.commissionId,
                                        "upfrontPercentage",
                                        getCommissionNumberValue(commission, "upfrontPercentage"),
                                      )
                                    }
                                    onBlur={() => setActiveCommissionInput(null)}
                                    onChange={(event) =>
                                      updateCommissionNumber(commission.commissionId, "upfrontPercentage", event.target.value)
                                    }
                                  />
                                </div>
                                <div className={styles.workflowDraftSubcard}>
                                  <div className={styles.workflowDraftLabel}>Upfront $</div>
                                  <input
                                    className={finleyStyles.clientSearch}
                                    inputMode="decimal"
                                    placeholder="$0.00"
                                    value={getCommissionInputValue(
                                      commission.commissionId,
                                      "upfrontAmount",
                                      getCommissionNumberValue(commission, "upfrontAmount"),
                                    )}
                                    onFocus={() =>
                                      beginCommissionEdit(
                                        commission.commissionId,
                                        "upfrontAmount",
                                        getCommissionNumberValue(commission, "upfrontAmount"),
                                      )
                                    }
                                    onBlur={() => setActiveCommissionInput(null)}
                                    onChange={(event) => updateCommissionNumber(commission.commissionId, "upfrontAmount", event.target.value)}
                                  />
                                </div>
                                <div className={styles.workflowDraftSubcard}>
                                  <div className={styles.workflowDraftLabel}>Ongoing %</div>
                                  <input
                                    className={finleyStyles.clientSearch}
                                    inputMode="decimal"
                                    placeholder="0.00%"
                                    value={getCommissionInputValue(
                                      commission.commissionId,
                                      "ongoingPercentage",
                                      getCommissionNumberValue(commission, "ongoingPercentage"),
                                    )}
                                    onFocus={() =>
                                      beginCommissionEdit(
                                        commission.commissionId,
                                        "ongoingPercentage",
                                        getCommissionNumberValue(commission, "ongoingPercentage"),
                                      )
                                    }
                                    onBlur={() => setActiveCommissionInput(null)}
                                    onChange={(event) =>
                                      updateCommissionNumber(commission.commissionId, "ongoingPercentage", event.target.value)
                                    }
                                  />
                                </div>
                                <div className={styles.workflowDraftSubcard}>
                                  <div className={styles.workflowDraftLabel}>Ongoing $</div>
                                  <input
                                    className={finleyStyles.clientSearch}
                                    inputMode="decimal"
                                    placeholder="$0.00"
                                    value={getCommissionInputValue(
                                      commission.commissionId,
                                      "ongoingAmount",
                                      getCommissionNumberValue(commission, "ongoingAmount"),
                                    )}
                                    onFocus={() =>
                                      beginCommissionEdit(
                                        commission.commissionId,
                                        "ongoingAmount",
                                        getCommissionNumberValue(commission, "ongoingAmount"),
                                      )
                                    }
                                    onBlur={() => setActiveCommissionInput(null)}
                                    onChange={(event) => updateCommissionNumber(commission.commissionId, "ongoingAmount", event.target.value)}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                          <div className={styles.sectionActionRow}>
                            <button
                              type="button"
                              className={styles.sectionActionButton}
                              onClick={() => {
                                setAdviceCase((current) => ({
                                  ...current,
                                  fees: {
                                    ...current.fees,
                                    commissions: [
                                      ...current.fees.commissions,
                                      {
                                        commissionId: makeId("commission"),
                                        type: "upfront",
                                        productType: "insurance",
                                        ownerPersonId: current.clientGroup.clients[0]?.personId ?? null,
                                        productName: "",
                                        upfrontPercentage: DEFAULT_UPFRONT_COMMISSION_PERCENTAGE,
                                        upfrontAmount: null,
                                        ongoingPercentage: DEFAULT_ONGOING_COMMISSION_PERCENTAGE,
                                        ongoingAmount: null,
                                        disclosed: true,
                                      },
                                    ],
                                  },
                                  metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                }));
                                setConfirmedSections((current) => ({ ...current, disclosure: false }));
                              }}
                            >
                              Add commission
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>

                  </div>
                </>
              ) : null}
              {![
                "soa-introduction",
                "risk-profile",
                "scope-of-advice",
                "objectives",
                "strategy-recommendations",
                "product-recommendations",
                "replacement-analysis",
                "insurance-analysis",
                "insurance-policies",
                "insurance-replacement",
                "disclosure",
                "service-agreement",
              ].includes(activeSectionId) ? (
                <div className={styles.sectionCardText}>
                  This section is wired into the workflow and readiness model. We can now use it for practical validation before we build the richer section editor.
                </div>
              ) : null}
              <div className={styles.sectionNavigationRow}>
                <button
                  type="button"
                  className={styles.sectionActionButton}
                  onClick={goToPreviousSection}
                  disabled={activeSectionIndex <= 0}
                >
                  Back
                </button>
                <div className={styles.sectionNavigationActions}>
                  <button type="button" className={styles.sectionActionButton} onClick={() => confirmSection(activeSectionId)}>
                    Save
                  </button>
                  <button
                    type="button"
                    className={styles.sectionActionButton}
                    onClick={goToNextSection}
                    disabled={activeSectionIndex < 0 || activeSectionIndex >= sections.length - 1}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className={finleyStyles.messageGroup}>
            {!visibleMessages.length && !(workflowState === "workflow_started" || workflowState === "section_review") ? (
              <div className={finleyStyles.emptyState}>
                <div className={finleyStyles.emptyPortraitFrame}>
                  <div className={finleyStyles.emptyPortraitBackdrop} />
                  <Image src={finleyAvatar} alt="Finley avatar" className={finleyStyles.emptyPortraitImage} />
                </div>
                <div className={finleyStyles.emptyStateCopy}>
                  <div className={finleyStyles.emptyStateTitle}>Start a new Finley SOA chat</div>
                  <div className={finleyStyles.emptyStateText}>Select a client, upload your supporting documents and tell me about your SOA.</div>
                </div>
              </div>
            ) : (
              visibleMessages.map((message) => (
                <div key={message.id} className={message.role === "assistant" ? finleyStyles.assistantBubble : finleyStyles.userBubble}>
                  <div>{message.content}</div>
                  {message.role === "assistant" && message.intakeAssessment ? (
                    (() => {
                      const outstandingQuestions = getOutstandingFollowUpQuestions(
                        message.intakeAssessment,
                        answeredFollowUpQuestions,
                      );
                      const resolvedQuestions = getResolvedFollowUpQuestions(
                        message.intakeAssessment,
                        answeredFollowUpQuestions,
                      );
                      const outstandingMissingInformation = getOutstandingMissingInformation(
                        message.intakeAssessment,
                        answeredFollowUpQuestions,
                      );

                      return (
                        <div className={styles.intakeSummaryCard}>
                          <div className={styles.intakeSummaryTitle}>Finley intake summary</div>
                          <div className={styles.intakeSummaryBlock}>
                            <div className={styles.intakeSummaryLabel}>Understanding</div>
                            <div>{message.intakeAssessment.matterSummary}</div>
                          </div>
                          {(message.intakeAssessment.readinessBySection ?? []).length ? (
                            <div className={styles.intakeSummaryBlock}>
                              <div className={styles.intakeSummaryLabel}>SOA brief readiness</div>
                              <div className={styles.intakeReadinessGrid}>
                                {(message.intakeAssessment.readinessBySection ?? []).map((readiness) => (
                                  <div key={readiness.sectionId} className={styles.intakeReadinessItem}>
                                    <div className={styles.intakeReadinessHeader}>
                                      <span>{readiness.label}</span>
                                      <span
                                        className={`${styles.intakeReadinessBadge} ${getIntakeReadinessClassName(readiness.status)}`.trim()}
                                      >
                                        {getIntakeReadinessLabel(readiness.status)}
                                      </span>
                                    </div>
                                    <div>{readiness.summary}</div>
                                    {readiness.confirmationsRequired.length ? (
                                      <ul className={styles.intakeList}>
                                        {readiness.confirmationsRequired.slice(0, 2).map((confirmation, confirmationIndex) => (
                                          <li key={`${readiness.sectionId}-confirmation-${confirmationIndex}`}>{confirmation}</li>
                                        ))}
                                      </ul>
                                    ) : null}
                                    {readiness.missingInformation.length ? (
                                      <ul className={styles.intakeList}>
                                        {readiness.missingInformation.slice(0, 2).map((item, itemIndex) => (
                                          <li key={`${readiness.sectionId}-missing-${itemIndex}`}>{item}</li>
                                        ))}
                                      </ul>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {(message.intakeAssessment.documentInsights ?? []).length ? (
                            <div className={styles.intakeSummaryBlock}>
                              <div className={styles.intakeSummaryLabel}>Document review</div>
                              <div className={styles.intakeInsightGrid}>
                                {(message.intakeAssessment.documentInsights ?? []).map((insight) => (
                                  <div key={`${insight.fileName}-${insight.documentType}`} className={styles.intakeInsightItem}>
                                    <div className={styles.intakeInsightHeader}>
                                      <span>{insight.fileName}</span>
                                      <span>{insight.documentType.replace(/_/g, " ")}</span>
                                    </div>
                                    <div>{insight.summary}</div>
                                    {insight.extractedFacts.length ? (
                                      <ul className={styles.intakeList}>
                                        {insight.extractedFacts.slice(0, 4).map((fact, factIndex) => (
                                          <li key={`${insight.fileName}-fact-${factIndex}`}>{fact}</li>
                                        ))}
                                      </ul>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {(message.intakeAssessment.evidenceBackedConfirmations ?? []).length ? (
                            <div className={styles.intakeSummaryBlock}>
                              <div className={styles.intakeSummaryLabel}>Evidence-backed confirmations</div>
                              <ul className={styles.intakeList}>
                                {(message.intakeAssessment.evidenceBackedConfirmations ?? []).map((confirmation, confirmationIndex) => (
                                  <li key={`${confirmationIndex}-${confirmation}`}>{confirmation}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          <div className={styles.intakeSummaryBlock}>
                            <div className={styles.intakeSummaryLabel}>Likely advice modules</div>
                            <div className={styles.intakeChipRow}>
                              {message.intakeAssessment.candidateModules.map((module) => (
                                <button
                                  key={module}
                                  type="button"
                                  className={`${styles.intakeChip} ${
                                    adviceCase.blueprint.includedModules.includes(module) ? styles.intakeChipActive : ""
                                  }`.trim()}
                                  onClick={() => toggleModule(module)}
                                >
                                  {getModuleLabel(module)}
                                </button>
                              ))}
                            </div>
                            <div className={styles.intakeSummaryHint}>
                              Click a module to include or remove it from the draft SOA workflow.
                            </div>
                          </div>
                          {message.intakeAssessment.candidateObjectives.length ? (
                            <div className={styles.intakeSummaryBlock}>
                              <div className={styles.intakeSummaryLabel}>Candidate objectives</div>
                              <ul className={styles.intakeList}>
                                {message.intakeAssessment.candidateObjectives.map((objective, objectiveIndex) => (
                                  <li key={`${objectiveIndex}-${objective.text}`}>{objective.text}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {message.intakeAssessment.commercialsAndAgreements ? (
                            <div className={styles.intakeSummaryBlock}>
                              <div className={styles.intakeSummaryLabel}>Fees and service agreement</div>
                              <ul className={styles.intakeList}>
                                {message.intakeAssessment.commercialsAndAgreements.advicePreparationFee !== null &&
                                message.intakeAssessment.commercialsAndAgreements.advicePreparationFee !== undefined ? (
                                  <li>Advice preparation fee: {formatCurrency(message.intakeAssessment.commercialsAndAgreements.advicePreparationFee)}</li>
                                ) : null}
                                {message.intakeAssessment.commercialsAndAgreements.implementationFee !== null &&
                                message.intakeAssessment.commercialsAndAgreements.implementationFee !== undefined ? (
                                  <li>Implementation fee: {formatCurrency(message.intakeAssessment.commercialsAndAgreements.implementationFee)}</li>
                                ) : null}
                                {message.intakeAssessment.commercialsAndAgreements.insuranceCommissionsIncluded !== null &&
                                message.intakeAssessment.commercialsAndAgreements.insuranceCommissionsIncluded !== undefined ? (
                                  <li>
                                    Insurance commissions:{" "}
                                    {message.intakeAssessment.commercialsAndAgreements.insuranceCommissionsIncluded ? "included" : "not included"}
                                  </li>
                                ) : null}
                                {message.intakeAssessment.commercialsAndAgreements.serviceAgreementIncluded !== null &&
                                message.intakeAssessment.commercialsAndAgreements.serviceAgreementIncluded !== undefined ? (
                                  <li>
                                    Service agreement:{" "}
                                    {message.intakeAssessment.commercialsAndAgreements.serviceAgreementIncluded
                                      ? message.intakeAssessment.commercialsAndAgreements.serviceAgreementType?.replace(/-/g, " ") || "included"
                                      : "not included"}
                                  </li>
                                ) : null}
                                {message.intakeAssessment.commercialsAndAgreements.missingFeeInformation.map((item, itemIndex) => (
                                  <li key={`${itemIndex}-${item}`}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {outstandingMissingInformation.length ? (
                            <div className={styles.intakeSummaryBlock}>
                              <div className={styles.intakeSummaryLabel}>What still needs clarification</div>
                              <ul className={styles.intakeList}>
                                {outstandingMissingInformation.map((item, itemIndex) => (
                                  <li key={`${itemIndex}-${item}`}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {outstandingQuestions.length ? (
                            <div className={styles.intakeSummaryBlock}>
                              <div className={styles.intakeSummaryLabel}>Follow-up questions</div>
                              <ul className={styles.intakeList}>
                                {outstandingQuestions.map((question, questionIndex) => (
                                  <li key={`${questionIndex}-${question}`}>
                                    <button
                                      type="button"
                                      className={styles.intakeQuestionButton}
                                      onClick={() => {
                                        setComposerValue(question);
                                        setActiveFollowUpQuestion(question);
                                      }}
                                    >
                                      <span>{question}</span>
                                      <span className={styles.intakeQuestionUnanswered}>Unanswered</span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {resolvedQuestions.length ? (
                            <div className={styles.intakeSummaryBlock}>
                              <div className={styles.intakeSummaryLabel}>Answered questions</div>
                              <ul className={styles.intakeList}>
                                {resolvedQuestions.map((question, questionIndex) => (
                                  <li key={`${questionIndex}-${question}`}>
                                    <span className={styles.intakeAnsweredRow}>
                                      <span>{question}</span>
                                      <button
                                        type="button"
                                        className={styles.intakeQuestionAnsweredButton}
                                        onClick={() => {
                                          setOpenAnsweredQuestion(question);
                                          setAnsweredQuestionDraft(answeredFollowUpResponses[question] ?? "");
                                        }}
                                      >
                                        Answered
                                      </button>
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      );
                    })()
                  ) : null}
                </div>
              ))
            )}
          </div>

          {isSendingMessage ? (
            <div className={styles.llmLoaderCard}>
              <span className={styles.llmLoaderDot} aria-hidden="true" />
              <div>
                <div className={styles.llmLoaderTitle}>Finley is reviewing your message</div>
                <div className={styles.llmLoaderText}>Preparing the next response now.</div>
              </div>
            </div>
          ) : null}

          <div className={finleyStyles.composer}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className={finleyStyles.hiddenFileInput}
              onChange={(event) => {
                addUpload(event.target.files);
                event.currentTarget.value = "";
              }}
            />
            <textarea
              className={finleyStyles.composerInput}
              placeholder={activeClient ? `Ask Finley to help with ${SECTION_CONFIGS.find((section) => section.id === activeSectionId)?.label ?? "this section"}...` : "Select a client to start chatting with Finley..."}
              rows={2}
              value={composerValue}
              onChange={(event) => setComposerValue(event.target.value)}
              disabled={!activeClient || isSendingMessage}
            />
            <div className={`${finleyStyles.composerFooter} ${styles.composerFooterRight}`.trim()}>
              <div className={finleyStyles.composerActions}>
                <button
                  type="button"
                  className={finleyStyles.refreshButton}
                  onClick={() => {
                    if (uploads.length) {
                      setIsUploadsModalOpen(true);
                      return;
                    }

                    fileInputRef.current?.click();
                  }}
                  disabled={!activeClient || isSendingMessage}
                >
                  {uploads.length ? `Uploaded Files (${uploads.length})` : "Upload files"}
                </button>
                {activeClient && uploads.length > 0 && workflowState === "workflow_ready" ? (
                  <button type="button" className={finleyStyles.refreshButton} onClick={buildFirstPass} disabled={isSendingMessage}>
                    Start SOA workflow
                  </button>
                ) : null}
                {activeClient && (workflowState === "workflow_started" || workflowState === "section_review") ? (
                  <button
                    type="button"
                    className={finleyStyles.refreshButton}
                    onClick={() => {
                      persistSoaPrintPreview(printPreviewPayload);
                      const printUrl = new URL("/finley/soa/print", window.location.origin);
                      if (activeClientId) {
                        printUrl.searchParams.set("clientId", activeClientId);
                      }
                      if (activeSoaId) {
                        printUrl.searchParams.set("soaId", activeSoaId);
                      }
                      window.open(`${printUrl.pathname}${printUrl.search}`, "_blank", "noopener,noreferrer");
                    }}
                    disabled={isSendingMessage}
                  >
                    Print preview
                  </button>
                ) : null}
                <button type="button" className={finleyStyles.refreshButton} onClick={() => setMessages([])} disabled={!messages.length || isSendingMessage}>Refresh chat</button>
                <button type="button" className={finleyStyles.sendButton} onClick={sendMessage} disabled={!activeClient || isSendingMessage}>
                  {isSendingMessage ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {showLiveSoaPreview ? (
        <aside className={styles.livePreviewPane} aria-label="Live SOA preview">
          <div className={styles.livePreviewHeader}>
            <div>
              <div className={styles.livePreviewEyebrow}>Live SOA Render</div>
              <div className={styles.livePreviewTitle}>Statement of Advice</div>
            </div>
            <div className={styles.livePreviewStyleControls} aria-label="SOA render style controls">
              <label className={styles.livePreviewStyleControl}>
                <span>Font</span>
                <select
                  value={soaRenderStyle.fontFamily}
                  onChange={(event) =>
                    setSoaRenderStyle((current) => ({ ...current, fontFamily: event.target.value }))
                  }
                >
                  {SOA_RENDER_FONT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.livePreviewColorControl}>
                <span>Text</span>
                <input
                  type="color"
                  value={soaRenderStyle.bodyTextColor}
                  onChange={(event) =>
                    setSoaRenderStyle((current) => ({ ...current, bodyTextColor: event.target.value }))
                  }
                />
              </label>
              <label className={styles.livePreviewColorControl}>
                <span>Table</span>
                <input
                  type="color"
                  value={soaRenderStyle.tableHeaderColor}
                  onChange={(event) =>
                    setSoaRenderStyle((current) => ({ ...current, tableHeaderColor: event.target.value }))
                  }
                />
              </label>
              <label className={styles.livePreviewColorControl}>
                <span>Heading</span>
                <input
                  type="color"
                  value={soaRenderStyle.headingColor}
                  onChange={(event) =>
                    setSoaRenderStyle((current) => ({ ...current, headingColor: event.target.value }))
                  }
                />
              </label>
              <button
                type="button"
                className={styles.livePreviewResetButton}
                onClick={() => setSoaRenderStyle(DEFAULT_SOA_RENDER_STYLE)}
                aria-label="Reset SOA render styling"
                title="Reset styling"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M4.5 10.5a7.5 7.5 0 1 1 2.2 5.3" />
                  <path d="M4.5 10.5V5.8" />
                  <path d="M4.5 10.5h4.7" />
                </svg>
              </button>
            </div>
            <button
              type="button"
              className={styles.livePreviewOpenButton}
              onClick={exportSoaWordDocument}
              disabled={isExportingDocx}
            >
              {isExportingDocx ? "Exporting..." : "Export Word"}
            </button>
            <button
              type="button"
              className={styles.livePreviewOpenButton}
              onClick={() => {
                persistSoaPrintPreview(printPreviewPayload);
                const printUrl = new URL("/finley/soa/print", window.location.origin);
                if (activeClientId) {
                  printUrl.searchParams.set("clientId", activeClientId);
                }
                if (activeSoaId) {
                  printUrl.searchParams.set("soaId", activeSoaId);
                }
                printUrl.searchParams.set("section", activeSectionId);
                printUrl.searchParams.set("font", soaRenderStyle.fontFamily);
                printUrl.searchParams.set("fontColor", soaRenderStyle.bodyTextColor);
                printUrl.searchParams.set("tableHeaderColor", soaRenderStyle.tableHeaderColor);
                printUrl.searchParams.set("tableAccentColor", soaRenderStyle.headingColor);
                window.open(`${printUrl.pathname}${printUrl.search}`, "_blank", "noopener,noreferrer");
              }}
            >
              Open print view
            </button>
          </div>
          <iframe
            className={styles.livePreviewFrame}
            src={printPreviewUrl}
            title="Live Statement of Advice preview"
          />
        </aside>
      ) : null}

      {isUploadsModalOpen ? (
        <div className={finleyStyles.modalOverlay} role="presentation" onClick={() => setIsUploadsModalOpen(false)}>
          <div
            className={finleyStyles.modalCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="finley-soa-uploaded-files-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={finleyStyles.modalHeader}>
              <h2 id="finley-soa-uploaded-files-title" className={finleyStyles.modalTitle}>
                Uploaded Files
              </h2>
            </div>

            <div className={finleyStyles.modalBody}>
              <div className={styles.sectionCardText}>
                These are the files currently loaded into Finley for {activeClient?.name ?? "this client"}.
              </div>
              <div className={finleyStyles.attachmentList}>
                {uploads.map((upload) => (
                  <div key={upload.id} className={finleyStyles.attachmentItem}>
                    <div className={styles.uploadListItemMain}>
                      <span className={finleyStyles.attachmentName}>{upload.name}</span>
                      {upload.productRexReport ? (
                        <span className={styles.productRexBadge}>ProductRex detected</span>
                      ) : null}
                      {isInsuranceQuoteUpload(upload) ? (
                        <span className={styles.insuranceQuoteBadge}>Insurance quote detected</span>
                      ) : null}
                      {isFactFindUpload(upload) ? (
                        <span className={styles.factFindBadge}>Fact Find detected</span>
                      ) : null}
                      {selectedProductRexUpload?.id === upload.id ? (
                        <span className={styles.productRexActiveBadge}>In use</span>
                      ) : null}
                    </div>
                    {upload.productRexReport ? (
                      <button
                        type="button"
                        className={styles.sectionActionButton}
                        onClick={() => applySelectedProductRexUpload(upload.id)}
                      >
                        Use for workflow
                      </button>
                    ) : null}
                    {isFactFindUpload(upload) ? (
                      <button
                        type="button"
                        className={styles.sectionActionButton}
                        disabled={isExtractingFactFindImport}
                        onClick={() => inspectFactFindUpload(upload)}
                      >
                        {isExtractingFactFindImport && factFindImportSourceFile === upload.name ? "Inspecting..." : "Map to profile"}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className={finleyStyles.modalActions}>
              <button type="button" className={finleyStyles.planCancelButton} onClick={() => setIsUploadsModalOpen(false)}>
                Close
              </button>
              <button
                type="button"
                className={finleyStyles.planApproveButton}
                onClick={() => {
                  setIsUploadsModalOpen(false);
                  fileInputRef.current?.click();
                }}
              >
                Add more files
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isFactFindImportModalOpen ? (
        <div
          className={finleyStyles.modalOverlay}
          role="presentation"
          onClick={() => {
            if (!isApplyingFactFindImport) {
              setIsFactFindImportModalOpen(false);
            }
          }}
        >
          <div
            className={`${finleyStyles.modalCard} ${styles.factFindImportModal}`.trim()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="finley-soa-fact-find-import-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={finleyStyles.modalHeader}>
              <h2 id="finley-soa-fact-find-import-title" className={finleyStyles.modalTitle}>
                Review Fact Find Mapping
              </h2>
            </div>

            <div className={finleyStyles.modalBody}>
              {factFindImportError ? <div className={finleyStyles.modalError}>{factFindImportError}</div> : null}

              {factFindImportCandidate ? (
                <>
                  <div className={styles.intakeSummaryBlock}>
                    <div className={styles.intakeSummaryLabel}>Source file</div>
                    <div>{factFindImportCandidate.sourceFileName}</div>
                  </div>
                  <div className={styles.intakeSummaryBlock}>
                    <div className={styles.intakeSummaryLabel}>Finley&apos;s read</div>
                    <div>{factFindImportCandidate.summary}</div>
                  </div>

                  <div className={styles.factFindCountGrid}>
                    {factFindImportCounts
                      ? Object.entries(factFindImportCounts).map(([label, count]) => (
                          <div key={label} className={styles.factFindCountCard}>
                            <span>{label.replace(/([A-Z])/g, " $1")}</span>
                            <strong>{count}</strong>
                          </div>
                        ))
                      : null}
                  </div>

                  <div className={styles.workflowDraftStack}>
                    <div className={styles.workflowDraftSubcard}>
                      <div className={styles.workflowDraftLabel}>People</div>
                      {factFindImportCandidate.people.length ? (
                        <ul className={styles.intakeList}>
                          {factFindImportCandidate.people.map((person, index) => (
                            <li key={`${person.target}-${person.name ?? index}`}>
                              <strong>{person.target === "partner" ? "Partner" : "Client"}:</strong>{" "}
                              {[person.name, person.dateOfBirth, person.riskProfile, person.employmentStatus]
                                .filter(Boolean)
                                .join(" | ")}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className={styles.sectionCardText}>No client or partner personal details were extracted.</div>
                      )}
                    </div>

                    {factFindImportRecordGroups.map((group) =>
                      group.records.length ? (
                        <div key={group.label} className={styles.workflowDraftSubcard}>
                          <div className={styles.workflowDraftLabel}>{group.label}</div>
                          <ul className={styles.intakeList}>
                            {group.records.slice(0, 5).map((record, index) => (
                              <li key={`${group.label}-${record.ownerName ?? "owner"}-${record.description ?? record.provider ?? index}`}>
                                {[record.ownerName, record.description ?? record.provider ?? record.type, record.amount ?? record.frequency]
                                  .filter(Boolean)
                                  .join(" | ")}
                              </li>
                            ))}
                          </ul>
                          {group.records.length > 5 ? (
                            <div className={styles.intakeSummaryHint}>Plus {group.records.length - 5} more records.</div>
                          ) : null}
                        </div>
                      ) : null,
                    )}

                    {factFindImportCandidate.dependants.length || factFindImportCandidate.entities.length ? (
                      <div className={styles.workflowDraftSubcard}>
                        <div className={styles.workflowDraftLabel}>Dependants and entities</div>
                        <ul className={styles.intakeList}>
                          {factFindImportCandidate.dependants.map((dependant, index) => (
                            <li key={`dependant-${dependant.name ?? index}`}>
                              Dependant: {[dependant.name, dependant.birthday, dependant.ownerName].filter(Boolean).join(" | ")}
                            </li>
                          ))}
                          {factFindImportCandidate.entities.map((entity, index) => (
                            <li key={`entity-${entity.name ?? index}`}>
                              Entity: {[entity.name, entity.type, entity.ownerName].filter(Boolean).join(" | ")}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {factFindImportCandidate.confirmationsRequired.length ? (
                      <div className={styles.workflowDraftSubcard}>
                        <div className={styles.workflowDraftLabel}>Confirm before applying</div>
                        <ul className={styles.intakeList}>
                          {factFindImportCandidate.confirmationsRequired.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {factFindImportCandidate.warnings.length ? (
                      <div className={styles.workflowDraftSubcard}>
                        <div className={styles.workflowDraftLabel}>Warnings</div>
                        <ul className={styles.intakeList}>
                          {factFindImportCandidate.warnings.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>

                  <div className={styles.impactNotice}>
                    Finley found {factFindImportTotalRecords} profile records. Applying this will update the active client profile and refresh the SOA render.
                  </div>
                </>
              ) : (
                <div className={styles.sectionCardText}>
                  Finley could not prepare a fact find mapping for review yet.
                </div>
              )}
            </div>

            <div className={finleyStyles.modalActions}>
              <button
                type="button"
                className={finleyStyles.planCancelButton}
                disabled={isApplyingFactFindImport}
                onClick={() => setIsFactFindImportModalOpen(false)}
              >
                Close
              </button>
              <button
                type="button"
                className={finleyStyles.planApproveButton}
                disabled={!factFindImportCandidate || isApplyingFactFindImport}
                onClick={applyFactFindImport}
              >
                {isApplyingFactFindImport ? "Applying..." : "Apply to client profile"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {openAnsweredQuestion ? (
        <div className={finleyStyles.modalOverlay} role="presentation" onClick={() => setOpenAnsweredQuestion(null)}>
          <div
            className={finleyStyles.modalCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="finley-soa-answered-question-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={finleyStyles.modalHeader}>
              <h2 id="finley-soa-answered-question-title" className={finleyStyles.modalTitle}>
                Follow-up question
              </h2>
            </div>

            <div className={finleyStyles.modalBody}>
              <div className={styles.intakeSummaryBlock}>
                <div className={styles.intakeSummaryLabel}>Question</div>
                <div>{openAnsweredQuestion}</div>
              </div>
              <label className={finleyStyles.modalField}>
                <span className={finleyStyles.modalLabel}>Your answer</span>
                <textarea
                  className={`${finleyStyles.composerInput} ${styles.largeTextarea}`.trim()}
                  value={answeredQuestionDraft}
                  onChange={(event) => setAnsweredQuestionDraft(event.target.value)}
                />
              </label>
            </div>

            <div className={finleyStyles.modalActions}>
              <button type="button" className={finleyStyles.planCancelButton} onClick={() => setOpenAnsweredQuestion(null)}>
                Close
              </button>
              <button
                type="button"
                className={finleyStyles.refreshButton}
                onClick={() => {
                  setComposerValue(answeredQuestionDraft);
                  setActiveFollowUpQuestion(openAnsweredQuestion);
                  setOpenAnsweredQuestion(null);
                }}
              >
                Load into composer
              </button>
              <button
                type="button"
                className={finleyStyles.planApproveButton}
                onClick={() => {
                  setAnsweredFollowUpResponses((current) => ({
                    ...current,
                    [openAnsweredQuestion]: answeredQuestionDraft,
                  }));
                  setComposerValue(answeredQuestionDraft);
                  setOpenAnsweredQuestion(null);
                }}
              >
                Save answer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
