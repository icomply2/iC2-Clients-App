"use client";

import JSZip from "jszip";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ClientSummary } from "@/lib/api/types";
import { mockClientSummaries } from "@/lib/client-mocks";
import type {
  AdviceCaseV1,
  AdviceModuleV1,
  ProductRexReportV1,
  RiskProfileV1,
} from "@/lib/soa-types";
import { parseProductRexReport } from "@/lib/productrex-report-parser";
import type { IntakeAssessmentV1, ProductDraftResponseV1, StrategyDraftResponseV1 } from "@/lib/soa-output-contracts";
import type { SoaIntakeResponse } from "@/lib/soa-intake-service";
import { generateIntakeAssessment, refineIntakeAssessment } from "@/lib/soa-intake-engine";
import {
  canTransitionSoaWorkflow,
  deriveSoaWorkflowState,
  isMeaningfulAdviserMessage,
} from "@/lib/soa-state-machine";
import { getSoaScenario, upsertSoaScenario, type SoaScenario, type SoaScenarioDraftValue } from "@/lib/soa-scenarios";
import finleyAvatar from "../finley-avatar.png";
import finleyStyles from "../page.module.css";
import styles from "./soa.module.css";

type FinleySoaConsoleProps = {
  initialClientId?: string;
  initialSoaId?: string;
};

type FinleyClientSummary = ClientSummary;

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
  | "basic-details"
  | "risk-profile"
  | "scope-of-advice"
  | "objectives"
  | "strategy-recommendations"
  | "product-recommendations"
  | "replacement-analysis"
  | "insurance-analysis"
  | "portfolio-allocation"
  | "projections"
  | "disclosure"
  | "appendix"
  | "paraplanning-notes";

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

type SectionConfirmationMap = Partial<Record<SectionId, boolean>>;
type StrategyRecommendationTab = "linked-objectives" | "recommendation" | "reasons" | "consequences" | "alternatives";
type ProductRecommendationTab = "linked-objectives" | "recommendation" | "reasons" | "consequences" | "alternatives";
type ReplacementRecommendationTab = "linked-objectives" | "recommendation" | "reasons" | "consequences" | "alternatives";

const SOA_PRINT_STORAGE_KEY = "finley-soa-print-preview-v1";

type SectionConfig = {
  id: SectionId;
  label: string;
  module?: AdviceModuleV1;
  optional?: boolean;
};

const SECTION_CONFIGS: SectionConfig[] = [
  { id: "soa-introduction", label: "SOA Introduction" },
  { id: "basic-details", label: "Basic Details" },
  { id: "risk-profile", label: "Risk Profile" },
  { id: "scope-of-advice", label: "Scope of Advice" },
  { id: "objectives", label: "Objectives" },
  { id: "strategy-recommendations", label: "Strategy Recommendations", module: "strategy-advice" },
  { id: "product-recommendations", label: "Product Recommendations", module: "product-advice" },
  { id: "replacement-analysis", label: "Replacement Analysis", module: "replacement-advice" },
  { id: "insurance-analysis", label: "Insurance Analysis", module: "insurance-advice" },
  { id: "portfolio-allocation", label: "Portfolio Allocation", module: "portfolio-advice" },
  { id: "projections", label: "Projections", module: "projection-analysis" },
  { id: "disclosure", label: "Disclosure" },
  { id: "appendix", label: "Appendix", optional: true },
  { id: "paraplanning-notes", label: "Paraplanning Notes", optional: true },
];

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

const REPLACEMENT_RECOMMENDATION_TABS: Array<{ value: ReplacementRecommendationTab; label: string }> = [
  { value: "linked-objectives", label: "Linked Objectives" },
  { value: "recommendation", label: "Replacement" },
  { value: "reasons", label: "Reasons" },
  { value: "consequences", label: "Consequences" },
  { value: "alternatives", label: "Alternatives" },
];

function getModuleLabel(module: AdviceModuleV1) {
  return MODULE_OPTIONS.find((option) => option.value === module)?.label ?? module;
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

  const nextProductRecommendation =
    current.recommendations.product[0] ??
    {
      recommendationId: makeId("product"),
      action: "replace" as const,
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
      priorityRank: 1,
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

  const nextReplacementRecommendation =
    current.recommendations.replacement[0] ??
    {
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

  const nextPortfolioRecommendation = {
    recommended: true,
    assetClasses: report.allocationRows.map((row) => ({
      assetClass: row.assetClass,
      targetPct: row.recommendedPct ?? null,
    })),
    holdings: report.recommendedHoldings.map((holding) => ({
      holdingId: holding.holdingId,
      platformName: holding.platformName ?? null,
      fundName: holding.fundName,
      code: holding.code ?? null,
      amount: holding.amount ?? null,
      investmentFeePct: holding.investmentFeePct ?? null,
      investmentFeeAmount: holding.investmentFeeAmount ?? null,
      transactionAmount:
        report.transactionRows.find((row) => row.fundName === holding.fundName)?.transactionAmount ?? null,
      buySellSpreadPct:
        report.transactionRows.find((row) => row.fundName === holding.fundName)?.buySellSpreadPct ?? null,
      buySellSpreadAmount:
        report.transactionRows.find((row) => row.fundName === holding.fundName)?.buySellSpreadAmount ?? null,
      brokerageAmount:
        report.transactionRows.find((row) => row.fundName === holding.fundName)?.brokerageAmount ?? null,
    })),
    allocationComparison: report.allocationRows.map((row) => ({
      rowId: row.rowId,
      assetClass: row.assetClass,
      currentPct: row.currentPct ?? null,
      riskProfilePct: row.riskProfilePct ?? null,
      recommendedPct: row.recommendedPct ?? null,
      variancePct: row.variancePct ?? null,
    })),
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

  return {
    ...current,
    blueprint: {
      includedModules: nextModules,
    },
    recommendations: {
      ...current.recommendations,
      product: current.recommendations.product.length ? current.recommendations.product : [nextProductRecommendation],
      replacement: current.recommendations.replacement.length
        ? current.recommendations.replacement
        : [nextReplacementRecommendation],
      portfolio: nextPortfolioRecommendation,
    },
    fees: {
      ...current.fees,
      productFees: productFees.length ? productFees : current.fees.productFees,
    },
    productRexReports: [report],
    metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
  };
}

function filterClientSummariesByPractice(clients: FinleyClientSummary[], practiceName?: string | null) {
  const practice = practiceName?.trim().toLowerCase();
  if (!practice) return clients;
  return clients.filter((client) => client.clientAdviserPracticeName?.trim().toLowerCase() === practice);
}

function hasContent(value?: string | null) {
  return Boolean(value?.trim());
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
    case "basic-details":
      return hasContent(adviceCase.clientGroup.clients[0]?.fullName)
        ? workflowStarted
          ? "needs-confirmation"
          : "confirmed"
        : "not-started";
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
      return adviceCase.recommendations.insuranceNeedsAnalyses?.length || adviceCase.recommendations.insurance?.length
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
        adviceCase.disclosures.limitations.length ||
        adviceCase.fees.productFees.length
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

function formatPercent(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return `${value.toFixed(2)}%`;
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
  const [replacementRecommendationTabs, setReplacementRecommendationTabs] = useState<Record<string, ReplacementRecommendationTab>>({});
  const [collapsedStrategyRecommendations, setCollapsedStrategyRecommendations] = useState<Record<string, boolean>>({});
  const [collapsedProductRecommendations, setCollapsedProductRecommendations] = useState<Record<string, boolean>>({});
  const [activeInsurancePersonId, setActiveInsurancePersonId] = useState<string | null>(null);
  const [activeRiskPersonId, setActiveRiskPersonId] = useState<string | null>(null);
  const [riskProfilesByPerson, setRiskProfilesByPerson] = useState<RiskProfilesByPerson>({});
  const [scenarioReady, setScenarioReady] = useState(false);
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
    setReplacementRecommendationTabs({});
    setCollapsedStrategyRecommendations({});
    setCollapsedProductRecommendations({});
    setActiveInsurancePersonId(null);
    setActiveRiskPersonId(null);
    setRiskProfilesByPerson({});
    setActiveSectionId("soa-introduction");
  }

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
    setReplacementRecommendationTabs({});
    setCollapsedStrategyRecommendations({});
    setCollapsedProductRecommendations({});
    setActiveInsurancePersonId(draft.activeInsurancePersonId);
    setActiveRiskPersonId(draft.activeRiskPersonId);
    setRiskProfilesByPerson(draft.riskProfilesByPerson);
    setActiveSectionId((draft.activeSectionId as SectionId) ?? "soa-introduction");
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
      status: "Draft",
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
      if (totalProductRexCount === 1 && nextProductRexUploads[0]?.productRexReport) {
        setSelectedProductRexUploadId(nextProductRexUploads[0].id);
        setAdviceCase((current) => mergeProductRexIntoCase(current, nextProductRexUploads[0].productRexReport as ProductRexReportV1));
        setImpactNotice(
          `Detected a ProductRex report in ${nextProductRexUploads[0].name} and populated the product, replacement, portfolio, and fee sections with draft data.`,
        );
      } else {
        setImpactNotice(
          `Detected ${totalProductRexCount} ProductRex reports. Open Uploaded Files and choose which report Finley should use for workflow population.`,
        );
      }
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

  async function requestIntakeAssessment(message: string) {
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

  async function sendMessage() {
    if (!composerValue.trim()) return;
    const text = composerValue.trim();
    const nextMessages: Message[] = [{ id: makeId("user"), role: "user", content: text }];
    const nextAnsweredQuestions = activeFollowUpQuestion
      ? answeredFollowUpQuestions.includes(activeFollowUpQuestion)
        ? answeredFollowUpQuestions
        : [...answeredFollowUpQuestions, activeFollowUpQuestion]
      : answeredFollowUpQuestions;

    if (activeFollowUpQuestion) {
      setAnsweredFollowUpQuestions((current) =>
        current.includes(activeFollowUpQuestion) ? current : [...current, activeFollowUpQuestion],
      );
      setAnsweredFollowUpResponses((current) => ({
        ...current,
        [activeFollowUpQuestion]: text,
      }));
      setActiveFollowUpQuestion(null);
    }

    setIsSendingMessage(true);

    try {
      if (!workflowStarted && uploads.length > 0 && isMeaningfulAdviserMessage(text)) {
        const outstandingCurrentQuestions = intakeAssessment
          ? getOutstandingFollowUpQuestions(intakeAssessment, nextAnsweredQuestions)
          : [];

        if (intakeAssessment && outstandingCurrentQuestions.length > 0) {
          const remainingQuestionLabel =
            outstandingCurrentQuestions.length === 1 ? "1 follow-up question" : `${outstandingCurrentQuestions.length} follow-up questions`;
          nextMessages.push({
            id: makeId("assistant"),
            role: "assistant",
            content: `Thanks, I’ve captured that. Let’s finish the remaining ${remainingQuestionLabel} on this intake card first, then I’ll prepare the next round of clarification or confirm we’re ready to start the SOA workflow.`,
          });
        } else {
          let nextAssessment: IntakeAssessmentV1;
          let intakeWarning: string | null;
          let strategyDraftResult: StrategyDraftResponseV1 | null = null;
          let productDraftResult: ProductDraftResponseV1 | null = null;

          try {
            const intakeResult = await requestIntakeAssessment(text);
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
                    nextAssessment.candidateInsuranceReviewNotes.length > 0
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
                metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
              };
            })(),
          }));

          nextMessages.push({
            id: makeId("assistant"),
            role: "assistant",
            content: `Here’s my understanding so far for ${activeClient?.name ?? "this client"}.`,
            intakeAssessment: nextAssessment,
          });
        }
      } else {
        nextMessages.push({
          id: makeId("assistant"),
          role: "assistant",
          content: `Working in ${SECTION_CONFIGS.find((section) => section.id === activeSectionId)?.label}. I’ve captured this as draft guidance only until you confirm the structured section data.`,
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

  return (
    <main className={finleyStyles.workspace}>
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
                      {item.problems.map((problem) => (
                        <li key={problem}>{problem}</li>
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
              {activeSectionId === "basic-details" ? (
                <>
                  <div className={styles.workflowDraftCard}>
                    <div className={styles.workflowDraftLabel}>Client name</div>
                    <input
                      className={finleyStyles.clientSearch}
                      value={adviceCase.clientGroup.clients[0]?.fullName ?? ""}
                      onChange={(event) => {
                        setAdviceCase((current) => ({
                          ...current,
                          clientGroup: {
                            ...current.clientGroup,
                            clients: current.clientGroup.clients.map((client, index) =>
                              index === 0 ? { ...client, fullName: event.target.value } : client,
                            ),
                          },
                          metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                        }));
                        setConfirmedSections((current) => ({ ...current, "basic-details": false }));
                      }}
                    />
                  </div>
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
                        <option key={option} value={option}>{option}</option>
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
                                  className={`${finleyStyles.composerInput} ${styles.mediumTextarea}`.trim()}
                                  placeholder="One benefit per line"
                                  value={recommendation.clientBenefits.map((benefit) => benefit.text).join("\n")}
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
                                            ? { ...entry, clientBenefits: nextBenefits }
                                            : entry,
                                        ),
                                      },
                                      metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                    }));
                                    setConfirmedSections((current) => ({ ...current, "strategy-recommendations": false }));
                                  }}
                                />
                                <div className={styles.workflowDraftLabel}>Rationale</div>
                                <textarea
                                  className={`${finleyStyles.composerInput} ${styles.mediumTextarea}`.trim()}
                                  placeholder="Why is this recommendation suitable?"
                                  value={recommendation.rationale ?? ""}
                                  onChange={(event) => {
                                    setAdviceCase((current) => ({
                                      ...current,
                                      recommendations: {
                                        ...current.recommendations,
                                        strategic: current.recommendations.strategic.map((entry) =>
                                          entry.recommendationId === recommendation.recommendationId
                                            ? { ...entry, rationale: event.target.value }
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
                  {latestProductRexReport ? (
                    <div className={styles.workflowDraftSubcard}>
                      <div className={styles.workflowDraftHeader}>
                        <div className={styles.workflowDraftLabel}>ProductRex comparison</div>
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
                              <option value="dispose">Dispose</option>
                            </select>
                          </div>
                          <div className={styles.workflowDraftSubcard}>
                            <div className={styles.workflowDraftLabel}>Product type</div>
                            <select
                              className={finleyStyles.clientSearch}
                              value={recommendation.productType}
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
                              <option value="insurance">Insurance</option>
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
                            <div className={styles.workflowDraftLabel}>Current provider</div>
                            <input
                              className={finleyStyles.clientSearch}
                              placeholder="Current provider"
                              value={recommendation.currentProvider ?? ""}
                              onChange={(event) => {
                                setAdviceCase((current) => ({
                                  ...current,
                                  recommendations: {
                                    ...current.recommendations,
                                    product: current.recommendations.product.map((entry) =>
                                      entry.recommendationId === recommendation.recommendationId
                                        ? { ...entry, currentProvider: event.target.value }
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
                          <div className={styles.workflowDraftSubcard}>
                            <div className={styles.workflowDraftLabel}>Recommended provider</div>
                            <input
                              className={finleyStyles.clientSearch}
                              placeholder="Recommended provider"
                              value={recommendation.recommendedProvider ?? ""}
                              onChange={(event) => {
                                setAdviceCase((current) => ({
                                  ...current,
                                  recommendations: {
                                    ...current.recommendations,
                                    product: current.recommendations.product.map((entry) =>
                                      entry.recommendationId === recommendation.recommendationId
                                        ? { ...entry, recommendedProvider: event.target.value }
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
                                  className={`${finleyStyles.composerInput} ${styles.mediumTextarea}`.trim()}
                                  placeholder="One benefit per line"
                                  value={recommendation.clientBenefits.map((benefit) => benefit.text).join("\n")}
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
                                            ? { ...entry, clientBenefits: nextBenefits }
                                            : entry,
                                        ),
                                      },
                                      metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                    }));
                                    setConfirmedSections((current) => ({ ...current, "product-recommendations": false }));
                                  }}
                                />
                                <div className={styles.workflowDraftLabel}>Suitability rationale</div>
                                <textarea
                                  className={`${finleyStyles.composerInput} ${styles.mediumTextarea}`.trim()}
                                  placeholder="Why is this product suitable?"
                                  value={recommendation.suitabilityRationale ?? ""}
                                  onChange={(event) => {
                                    setAdviceCase((current) => ({
                                      ...current,
                                      recommendations: {
                                        ...current.recommendations,
                                        product: current.recommendations.product.map((entry) =>
                                          entry.recommendationId === recommendation.recommendationId
                                            ? { ...entry, suitabilityRationale: event.target.value }
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
                  {latestProductRexReport?.replacementReasons.length ? (
                    <div className={styles.workflowDraftSubcard}>
                      <div className={styles.workflowDraftLabel}>ProductRex replacement reasons</div>
                      <ul className={styles.simpleBulletList}>
                        {latestProductRexReport.replacementReasons.map((reason, index) => (
                          <li key={`${latestProductRexReport.reportId}-reason-${index}`}>{reason}</li>
                        ))}
                      </ul>
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
                        <div className={styles.sectionGridCompact}>
                          <div className={styles.workflowDraftSubcard}>
                            <div className={styles.workflowDraftLabel}>Replacement type</div>
                            <select
                              className={finleyStyles.clientSearch}
                              value={recommendation.replacementType ?? "other"}
                              onChange={(event) => {
                                setAdviceCase((current) => ({
                                  ...current,
                                  recommendations: {
                                    ...current.recommendations,
                                    replacement: current.recommendations.replacement.map((entry) =>
                                      entry.recommendationId === recommendation.recommendationId
                                        ? { ...entry, replacementType: event.target.value as NonNullable<typeof recommendation.replacementType> }
                                        : entry,
                                    ),
                                  },
                                  metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                }));
                                setConfirmedSections((current) => ({ ...current, "replacement-analysis": false }));
                              }}
                            >
                              <option value="switch">Switch</option>
                              <option value="rollover">Rollover</option>
                              <option value="cancel-and-replace">Cancel and replace</option>
                              <option value="retain-and-adjust">Retain and adjust</option>
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
                                    replacement: current.recommendations.replacement.map((entry) =>
                                      entry.recommendationId === recommendation.recommendationId
                                        ? { ...entry, currentProductName: event.target.value }
                                        : entry,
                                    ),
                                  },
                                  metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                }));
                                setConfirmedSections((current) => ({ ...current, "replacement-analysis": false }));
                              }}
                            />
                          </div>
                          <div className={styles.workflowDraftSubcard}>
                            <div className={styles.workflowDraftLabel}>Current provider</div>
                            <input
                              className={finleyStyles.clientSearch}
                              placeholder="Current provider"
                              value={recommendation.currentProvider ?? ""}
                              onChange={(event) => {
                                setAdviceCase((current) => ({
                                  ...current,
                                  recommendations: {
                                    ...current.recommendations,
                                    replacement: current.recommendations.replacement.map((entry) =>
                                      entry.recommendationId === recommendation.recommendationId
                                        ? { ...entry, currentProvider: event.target.value }
                                        : entry,
                                    ),
                                  },
                                  metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                }));
                                setConfirmedSections((current) => ({ ...current, "replacement-analysis": false }));
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
                                    replacement: current.recommendations.replacement.map((entry) =>
                                      entry.recommendationId === recommendation.recommendationId
                                        ? { ...entry, recommendedProductName: event.target.value }
                                        : entry,
                                    ),
                                  },
                                  metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                }));
                                setConfirmedSections((current) => ({ ...current, "replacement-analysis": false }));
                              }}
                            />
                          </div>
                          <div className={styles.workflowDraftSubcard}>
                            <div className={styles.workflowDraftLabel}>Recommended provider</div>
                            <input
                              className={finleyStyles.clientSearch}
                              placeholder="Recommended provider"
                              value={recommendation.recommendedProvider ?? ""}
                              onChange={(event) => {
                                setAdviceCase((current) => ({
                                  ...current,
                                  recommendations: {
                                    ...current.recommendations,
                                    replacement: current.recommendations.replacement.map((entry) =>
                                      entry.recommendationId === recommendation.recommendationId
                                        ? { ...entry, recommendedProvider: event.target.value }
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
                        <div className={styles.strategyTabRow}>
                          {REPLACEMENT_RECOMMENDATION_TABS.map((tab) => {
                            const activeTab = replacementRecommendationTabs[recommendation.recommendationId] ?? "recommendation";
                            return (
                              <button
                                key={tab.value}
                                type="button"
                                className={`${styles.strategyTabButton} ${
                                  activeTab === tab.value ? styles.strategyTabButtonActive : ""
                                }`.trim()}
                                onClick={() =>
                                  setReplacementRecommendationTabs((current) => ({
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
                          const activeTab = replacementRecommendationTabs[recommendation.recommendationId] ?? "recommendation";

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
                                                replacement: current.recommendations.replacement.map((entry) =>
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
                                            setConfirmedSections((current) => ({ ...current, "replacement-analysis": false }));
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
                                <div className={styles.workflowDraftLabel}>Replacement case</div>
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
                            );
                          }

                          if (activeTab === "reasons") {
                            return (
                              <div className={styles.workflowDraftSubcard}>
                                <div className={styles.workflowDraftLabel}>Client benefits</div>
                                <textarea
                                  className={`${finleyStyles.composerInput} ${styles.mediumTextarea}`.trim()}
                                  placeholder="One benefit per line"
                                  value={recommendation.clientBenefits.map((benefit) => benefit.text).join("\n")}
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
                                        replacement: current.recommendations.replacement.map((entry) =>
                                          entry.recommendationId === recommendation.recommendationId
                                            ? { ...entry, clientBenefits: nextBenefits }
                                            : entry,
                                        ),
                                      },
                                      metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                    }));
                                    setConfirmedSections((current) => ({ ...current, "replacement-analysis": false }));
                                  }}
                                />
                                <div className={styles.workflowDraftLabel}>Fee comparison / rationale</div>
                                <textarea
                                  className={`${finleyStyles.composerInput} ${styles.mediumTextarea}`.trim()}
                                  placeholder="Summarise the fee comparison or core rationale"
                                  value={[recommendation.feeComparisonNarrative ?? "", recommendation.rationale ?? ""]
                                    .filter(Boolean)
                                    .join("\n\n")}
                                  onChange={(event) => {
                                    const [feeComparisonNarrative, ...rest] = event.target.value.split(/\n\s*\n/);
                                    setAdviceCase((current) => ({
                                      ...current,
                                      recommendations: {
                                        ...current.recommendations,
                                        replacement: current.recommendations.replacement.map((entry) =>
                                          entry.recommendationId === recommendation.recommendationId
                                            ? {
                                                ...entry,
                                                feeComparisonNarrative: feeComparisonNarrative?.trim() || null,
                                                rationale: rest.join("\n\n").trim() || null,
                                              }
                                            : entry,
                                        ),
                                      },
                                      metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                    }));
                                    setConfirmedSections((current) => ({ ...current, "replacement-analysis": false }));
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
                                  className={`${finleyStyles.composerInput} ${styles.mediumTextarea}`.trim()}
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
                                        replacement: current.recommendations.replacement.map((entry) =>
                                          entry.recommendationId === recommendation.recommendationId
                                            ? { ...entry, consequences: nextConsequences }
                                            : entry,
                                        ),
                                      },
                                      metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                    }));
                                    setConfirmedSections((current) => ({ ...current, "replacement-analysis": false }));
                                  }}
                                />
                                <div className={styles.workflowDraftLabel}>Replacement risks</div>
                                <textarea
                                  className={`${finleyStyles.composerInput} ${styles.mediumTextarea}`.trim()}
                                  placeholder="One risk per line"
                                  value={(recommendation.replacementRisks ?? []).join("\n")}
                                  onChange={(event) => {
                                    const nextRisks = splitNonEmptyLines(event.target.value);
                                    setAdviceCase((current) => ({
                                      ...current,
                                      recommendations: {
                                        ...current.recommendations,
                                        replacement: current.recommendations.replacement.map((entry) =>
                                          entry.recommendationId === recommendation.recommendationId
                                            ? { ...entry, replacementRisks: nextRisks }
                                            : entry,
                                        ),
                                      },
                                      metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                    }));
                                    setConfirmedSections((current) => ({ ...current, "replacement-analysis": false }));
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
                                      replacement: current.recommendations.replacement.map((entry) =>
                                        entry.recommendationId === recommendation.recommendationId
                                          ? { ...entry, alternativesConsidered: nextAlternatives }
                                          : entry,
                                      ),
                                    },
                                    metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                  }));
                                  setConfirmedSections((current) => ({ ...current, "replacement-analysis": false }));
                                }}
                              />
                            </div>
                          );
                        })()}
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
                  <div className={styles.workflowDraftStack}>
                    {(adviceCase.recommendations.insuranceNeedsAnalyses ?? [])
                      .filter((analysis) => !activeInsurancePersonId || analysis.ownerPersonIds.includes(activeInsurancePersonId))
                      .map((analysis, index) => (
                        <div key={analysis.analysisId} className={styles.workflowDraftCard}>
                          <div className={styles.workflowDraftHeader}>
                            <div className={styles.workflowDraftLabel}>Insurance needs analysis {index + 1}</div>
                            <button
                              type="button"
                              className={styles.objectiveDeleteButton}
                              onClick={() => {
                                if (!window.confirm(`Delete Insurance Analysis ${index + 1}?`)) {
                                  return;
                                }
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
                              <div className={styles.workflowDraftLabel}>Policy type</div>
                              <select
                                className={finleyStyles.clientSearch}
                                value={analysis.policyType}
                                onChange={(event) => {
                                  setAdviceCase((current) => ({
                                    ...current,
                                    recommendations: {
                                      ...current.recommendations,
                                      insuranceNeedsAnalyses: (current.recommendations.insuranceNeedsAnalyses ?? []).map((entry) =>
                                        entry.analysisId === analysis.analysisId
                                          ? { ...entry, policyType: event.target.value as typeof analysis.policyType }
                                          : entry,
                                      ),
                                    },
                                    metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                  }));
                                  setConfirmedSections((current) => ({ ...current, "insurance-analysis": false }));
                                }}
                              >
                                <option value="life">Life</option>
                                <option value="tpd">TPD</option>
                                <option value="trauma">Trauma</option>
                                <option value="income-protection">Income protection</option>
                                <option value="other">Other</option>
                              </select>
                            </div>
                            <div className={styles.workflowDraftSubcard}>
                              <div className={styles.workflowDraftLabel}>Methodology</div>
                              <select
                                className={finleyStyles.clientSearch}
                                value={analysis.methodology}
                                onChange={(event) => {
                                  setAdviceCase((current) => ({
                                    ...current,
                                    recommendations: {
                                      ...current.recommendations,
                                      insuranceNeedsAnalyses: (current.recommendations.insuranceNeedsAnalyses ?? []).map((entry) =>
                                        entry.analysisId === analysis.analysisId
                                          ? { ...entry, methodology: event.target.value as typeof analysis.methodology }
                                          : entry,
                                      ),
                                    },
                                    metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                  }));
                                  setConfirmedSections((current) => ({ ...current, "insurance-analysis": false }));
                                }}
                              >
                                <option value="capital-needs">Capital needs</option>
                                <option value="income-replacement">Income replacement</option>
                                <option value="debt-plus-education">Debt plus education</option>
                                <option value="expense-based">Expense based</option>
                                <option value="existing-cover-gap">Existing cover gap</option>
                                <option value="other">Other</option>
                              </select>
                            </div>
                          </div>
                          <div className={styles.workflowDraftSubcard}>
                            <div className={styles.workflowDraftLabel}>Purpose</div>
                            <textarea
                              className={`${finleyStyles.composerInput} ${styles.mediumTextarea}`.trim()}
                              placeholder="Why is this insurance analysis being completed?"
                              value={analysis.purpose ?? ""}
                              onChange={(event) => {
                                setAdviceCase((current) => ({
                                  ...current,
                                  recommendations: {
                                    ...current.recommendations,
                                    insuranceNeedsAnalyses: (current.recommendations.insuranceNeedsAnalyses ?? []).map((entry) =>
                                      entry.analysisId === analysis.analysisId
                                        ? { ...entry, purpose: event.target.value }
                                        : entry,
                                    ),
                                  },
                                  metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                }));
                                setConfirmedSections((current) => ({ ...current, "insurance-analysis": false }));
                              }}
                            />
                          </div>
                          <div className={styles.sectionGridCompact}>
                            <div className={styles.workflowDraftSubcard}>
                              <div className={styles.workflowDraftLabel}>Existing cover amount</div>
                              <input
                                className={finleyStyles.clientSearch}
                                placeholder="$0"
                                value={analysis.inputs.existingCoverAmount ?? ""}
                                onChange={(event) => {
                                  const nextValue = event.target.value === "" ? null : Number(event.target.value);
                                  setAdviceCase((current) => ({
                                    ...current,
                                    recommendations: {
                                      ...current.recommendations,
                                      insuranceNeedsAnalyses: (current.recommendations.insuranceNeedsAnalyses ?? []).map((entry) =>
                                        entry.analysisId === analysis.analysisId
                                          ? {
                                              ...entry,
                                              inputs: { ...entry.inputs, existingCoverAmount: Number.isNaN(nextValue) ? null : nextValue },
                                            }
                                          : entry,
                                      ),
                                    },
                                    metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                  }));
                                  setConfirmedSections((current) => ({ ...current, "insurance-analysis": false }));
                                }}
                              />
                            </div>
                            <div className={styles.workflowDraftSubcard}>
                              <div className={styles.workflowDraftLabel}>Target cover amount</div>
                              <input
                                className={finleyStyles.clientSearch}
                                placeholder="$0"
                                value={analysis.outputs.targetCoverAmount ?? ""}
                                onChange={(event) => {
                                  const nextValue = event.target.value === "" ? null : Number(event.target.value);
                                  setAdviceCase((current) => ({
                                    ...current,
                                    recommendations: {
                                      ...current.recommendations,
                                      insuranceNeedsAnalyses: (current.recommendations.insuranceNeedsAnalyses ?? []).map((entry) =>
                                        entry.analysisId === analysis.analysisId
                                          ? {
                                              ...entry,
                                              outputs: { ...entry.outputs, targetCoverAmount: Number.isNaN(nextValue) ? null : nextValue },
                                            }
                                          : entry,
                                      ),
                                    },
                                    metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                  }));
                                  setConfirmedSections((current) => ({ ...current, "insurance-analysis": false }));
                                }}
                              />
                            </div>
                            <div className={styles.workflowDraftSubcard}>
                              <div className={styles.workflowDraftLabel}>Cover gap amount</div>
                              <input
                                className={finleyStyles.clientSearch}
                                placeholder="$0"
                                value={analysis.outputs.coverGapAmount ?? ""}
                                onChange={(event) => {
                                  const nextValue = event.target.value === "" ? null : Number(event.target.value);
                                  setAdviceCase((current) => ({
                                    ...current,
                                    recommendations: {
                                      ...current.recommendations,
                                      insuranceNeedsAnalyses: (current.recommendations.insuranceNeedsAnalyses ?? []).map((entry) =>
                                        entry.analysisId === analysis.analysisId
                                          ? {
                                              ...entry,
                                              outputs: { ...entry.outputs, coverGapAmount: Number.isNaN(nextValue) ? null : nextValue },
                                            }
                                          : entry,
                                      ),
                                    },
                                    metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                  }));
                                  setConfirmedSections((current) => ({ ...current, "insurance-analysis": false }));
                                }}
                              />
                            </div>
                            <div className={styles.workflowDraftSubcard}>
                              <div className={styles.workflowDraftLabel}>Ownership</div>
                              <select
                                className={finleyStyles.clientSearch}
                                value={analysis.outputs.suggestedPolicyOwnership ?? "unknown"}
                                onChange={(event) => {
                                  setAdviceCase((current) => ({
                                    ...current,
                                    recommendations: {
                                      ...current.recommendations,
                                      insuranceNeedsAnalyses: (current.recommendations.insuranceNeedsAnalyses ?? []).map((entry) =>
                                        entry.analysisId === analysis.analysisId
                                          ? {
                                              ...entry,
                                              outputs: {
                                                ...entry.outputs,
                                                suggestedPolicyOwnership: event.target.value as NonNullable<typeof entry.outputs.suggestedPolicyOwnership>,
                                              },
                                            }
                                          : entry,
                                      ),
                                    },
                                    metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                  }));
                                  setConfirmedSections((current) => ({ ...current, "insurance-analysis": false }));
                                }}
                              >
                                <option value="super">Super</option>
                                <option value="retail">Retail</option>
                                <option value="either">Either</option>
                                <option value="unknown">Unknown</option>
                              </select>
                            </div>
                          </div>
                          <div className={styles.workflowDraftSubcard}>
                            <div className={styles.workflowDraftLabel}>Rationale</div>
                            <textarea
                              className={`${finleyStyles.composerInput} ${styles.mediumTextarea}`.trim()}
                              placeholder="Summarise the insurance needs analysis rationale"
                              value={analysis.rationale ?? ""}
                              onChange={(event) => {
                                setAdviceCase((current) => ({
                                  ...current,
                                  recommendations: {
                                    ...current.recommendations,
                                    insuranceNeedsAnalyses: (current.recommendations.insuranceNeedsAnalyses ?? []).map((entry) =>
                                      entry.analysisId === analysis.analysisId
                                        ? { ...entry, rationale: event.target.value }
                                        : entry,
                                    ),
                                  },
                                  metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                }));
                                setConfirmedSections((current) => ({ ...current, "insurance-analysis": false }));
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
                        const ownerPersonId = activeInsurancePersonId ?? adviceCase.clientGroup.clients[0]?.personId;
                        if (!ownerPersonId) {
                          return;
                        }
                        setAdviceCase((current) => ({
                          ...current,
                          recommendations: {
                            ...current.recommendations,
                            insuranceNeedsAnalyses: [
                              ...(current.recommendations.insuranceNeedsAnalyses ?? []),
                              {
                                analysisId: makeId("insurance-analysis"),
                                ownerPersonIds: [ownerPersonId],
                                policyType: "other",
                                methodology: "other",
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
                              },
                            ],
                          },
                          metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                        }));
                        setConfirmedSections((current) => ({ ...current, "insurance-analysis": false }));
                      }}
                    >
                      Add insurance analysis
                    </button>
                  </div>
                </>
              ) : null}
              {activeSectionId === "portfolio-allocation" ? (
                <>
                  {adviceCase.recommendations.portfolio?.holdings?.length ? (
                    <div className={styles.workflowDraftStack}>
                      <div className={styles.workflowDraftSubcard}>
                        <div className={styles.workflowDraftHeader}>
                          <div className={styles.workflowDraftLabel}>Recommended portfolio holdings</div>
                          <div className={styles.workflowDraftPreview}>
                            {adviceCase.recommendations.portfolio.sourceFileName ?? latestProductRexReport?.sourceFileName ?? "Imported data"}
                          </div>
                        </div>
                        <div className={styles.dataTableWrap}>
                          <table className={styles.dataTable}>
                            <thead>
                              <tr>
                                <th>Fund</th>
                                <th>Code</th>
                                <th>Amount</th>
                                <th>Fee %</th>
                                <th>Fee $</th>
                              </tr>
                            </thead>
                            <tbody>
                              {adviceCase.recommendations.portfolio.holdings.map((holding) => (
                                <tr key={holding.holdingId}>
                                  <td>{holding.fundName}</td>
                                  <td>{holding.code ?? "—"}</td>
                                  <td>{formatCurrency(holding.amount)}</td>
                                  <td>{formatPercent(holding.investmentFeePct)}</td>
                                  <td>{formatCurrency(holding.investmentFeeAmount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
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
                              {(adviceCase.recommendations.portfolio.allocationComparison ?? []).map((row) => (
                                <tr key={row.rowId}>
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
              {activeSectionId === "disclosure" ? (
                <>
                  {adviceCase.fees.productFees.length ? (
                    <div className={styles.workflowDraftSubcard}>
                      <div className={styles.workflowDraftLabel}>Product fee summary</div>
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
                            {adviceCase.fees.productFees.map((fee) => (
                              <tr key={fee.feeId}>
                                <td>{fee.productName ?? "—"}</td>
                                <td>{fee.feeType}</td>
                                <td>{formatPercent(fee.percentage)}</td>
                                <td>{formatCurrency(fee.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                  {latestProductRexReport?.transactionRows.length ? (
                    <div className={styles.workflowDraftSubcard}>
                      <div className={styles.workflowDraftLabel}>Transaction fee summary</div>
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
                            {latestProductRexReport.transactionRows.map((row) => (
                              <tr key={row.transactionId}>
                                <td>{row.fundName}</td>
                                <td>{formatCurrency(row.transactionAmount)}</td>
                                <td>{formatPercent(row.buySellSpreadPct)}</td>
                                <td>{formatCurrency(row.buySellSpreadAmount)}</td>
                                <td>{formatCurrency(row.brokerageAmount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
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
                            placeholder="$0.00"
                            value={adviceCase.fees.adviceFees.find((fee) => fee.type === "preparation")?.amount ?? ""}
                            onChange={(event) => {
                              const nextValue = event.target.value === "" ? null : Number(event.target.value);
                              setAdviceCase((current) => {
                                const existingFees = current.fees.adviceFees.filter((fee) => fee.type !== "preparation");
                                return {
                                  ...current,
                                  fees: {
                                    ...current.fees,
                                    adviceFees: [
                                      ...existingFees,
                                      {
                                        feeId: makeId("advice-fee"),
                                        type: "preparation",
                                        amount: Number.isNaN(nextValue) ? null : nextValue,
                                      },
                                    ],
                                  },
                                  metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                };
                              });
                              setConfirmedSections((current) => ({ ...current, disclosure: false }));
                            }}
                          />
                        </div>
                        <div className={styles.workflowDraftSubcard}>
                          <div className={styles.workflowDraftLabel}>Implementation fee</div>
                          <input
                            className={finleyStyles.clientSearch}
                            placeholder="$0.00"
                            value={adviceCase.fees.adviceFees.find((fee) => fee.type === "implementation")?.amount ?? ""}
                            onChange={(event) => {
                              const nextValue = event.target.value === "" ? null : Number(event.target.value);
                              setAdviceCase((current) => {
                                const existingFees = current.fees.adviceFees.filter((fee) => fee.type !== "implementation");
                                return {
                                  ...current,
                                  fees: {
                                    ...current.fees,
                                    adviceFees: [
                                      ...existingFees,
                                      {
                                        feeId: makeId("advice-fee"),
                                        type: "implementation",
                                        amount: Number.isNaN(nextValue) ? null : nextValue,
                                      },
                                    ],
                                  },
                                  metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                };
                              });
                              setConfirmedSections((current) => ({ ...current, disclosure: false }));
                            }}
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
                                            amount: null,
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
                                  <div className={styles.workflowDraftLabel}>Type</div>
                                  <select
                                    className={finleyStyles.clientSearch}
                                    value={commission.type}
                                    onChange={(event) => {
                                      setAdviceCase((current) => ({
                                        ...current,
                                        fees: {
                                          ...current.fees,
                                          commissions: current.fees.commissions.map((entry) =>
                                            entry.commissionId === commission.commissionId
                                              ? { ...entry, type: event.target.value as typeof commission.type }
                                              : entry,
                                          ),
                                        },
                                        metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                      }));
                                      setConfirmedSections((current) => ({ ...current, disclosure: false }));
                                    }}
                                  >
                                    <option value="upfront">Upfront</option>
                                    <option value="ongoing">Ongoing</option>
                                  </select>
                                </div>
                                <div className={styles.workflowDraftSubcard}>
                                  <div className={styles.workflowDraftLabel}>Amount</div>
                                  <input
                                    className={finleyStyles.clientSearch}
                                    placeholder="$0.00"
                                    value={commission.amount ?? ""}
                                    onChange={(event) => {
                                      const nextValue = event.target.value === "" ? null : Number(event.target.value);
                                      setAdviceCase((current) => ({
                                        ...current,
                                        fees: {
                                          ...current.fees,
                                          commissions: current.fees.commissions.map((entry) =>
                                            entry.commissionId === commission.commissionId
                                              ? { ...entry, amount: Number.isNaN(nextValue) ? null : nextValue }
                                              : entry,
                                          ),
                                        },
                                        metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                      }));
                                      setConfirmedSections((current) => ({ ...current, disclosure: false }));
                                    }}
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
                                        amount: null,
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
                                        services: [],
                                      }
                                    : { present: false, agreementType: "none", services: [] },
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
                        <div className={styles.workflowDraftSubcard}>
                          <div className={styles.workflowDraftLabel}>Agreement type</div>
                          <select
                            className={finleyStyles.clientSearch}
                            value={adviceCase.agreements.feeAgreement?.agreementType ?? "none"}
                            onChange={(event) => {
                              setAdviceCase((current) => ({
                                ...current,
                                agreements: {
                                  feeAgreement: {
                                    present: event.target.value !== "none",
                                    agreementType: event.target.value as "ongoing" | "fixed-term" | "annual" | "none",
                                    services: current.agreements.feeAgreement?.services ?? [],
                                  },
                                },
                                metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                              }));
                              setConfirmedSections((current) => ({ ...current, disclosure: false }));
                            }}
                          >
                            <option value="ongoing">Ongoing agreement</option>
                            <option value="fixed-term">Fixed-term agreement</option>
                            <option value="annual">Annual agreement</option>
                            <option value="none">None</option>
                          </select>
                        </div>
                      </div>
                      <div className={styles.workflowDraftSubcard}>
                        <div className={styles.workflowDraftLabel}>Services / limitations</div>
                        <textarea
                          className={`${finleyStyles.composerInput} ${styles.mediumTextarea}`.trim()}
                          placeholder="One service or limitation per line"
                          value={[
                            ...(adviceCase.agreements.feeAgreement?.services ?? []),
                            ...adviceCase.disclosures.limitations,
                          ].join("\n")}
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
                                    },
                              },
                              disclosures: {
                                ...current.disclosures,
                                limitations: entries,
                              },
                              metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                            }));
                            setConfirmedSections((current) => ({ ...current, disclosure: false }));
                          }}
                        />
                      </div>
                    </div>

                    <div className={styles.workflowDraftSubcard}>
                      <div className={styles.workflowDraftLabel}>Disclosure warnings</div>
                      <div className={styles.workflowDraftStack}>
                        {adviceCase.disclosures.warnings.map((warning, index) => (
                          <div key={warning.warningId} className={styles.workflowDraftSubcard}>
                            <div className={styles.workflowDraftHeader}>
                              <div className={styles.workflowDraftLabel}>Warning {index + 1}</div>
                              <button
                                type="button"
                                className={styles.objectiveDeleteButton}
                                onClick={() => {
                                  if (!window.confirm(`Delete Warning ${index + 1}?`)) {
                                    return;
                                  }
                                  setAdviceCase((current) => ({
                                    ...current,
                                    disclosures: {
                                      ...current.disclosures,
                                      warnings: current.disclosures.warnings.filter(
                                        (entry) => entry.warningId !== warning.warningId,
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
                                <div className={styles.workflowDraftLabel}>Type</div>
                                <select
                                  className={finleyStyles.clientSearch}
                                  value={warning.type}
                                  onChange={(event) => {
                                    setAdviceCase((current) => ({
                                      ...current,
                                      disclosures: {
                                        ...current.disclosures,
                                        warnings: current.disclosures.warnings.map((entry) =>
                                          entry.warningId === warning.warningId
                                            ? { ...entry, type: event.target.value as typeof warning.type }
                                            : entry,
                                        ),
                                      },
                                      metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                    }));
                                    setConfirmedSections((current) => ({ ...current, disclosure: false }));
                                  }}
                                >
                                  <option value="general">General</option>
                                  <option value="projection">Projection</option>
                                  <option value="scope">Scope</option>
                                  <option value="tax">Tax</option>
                                  <option value="estate">Estate</option>
                                  <option value="other">Other</option>
                                </select>
                              </div>
                            </div>
                            <textarea
                              className={`${finleyStyles.composerInput} ${styles.mediumTextarea}`.trim()}
                              placeholder="Enter the warning text"
                              value={warning.text}
                              onChange={(event) => {
                                setAdviceCase((current) => ({
                                  ...current,
                                  disclosures: {
                                    ...current.disclosures,
                                    warnings: current.disclosures.warnings.map((entry) =>
                                      entry.warningId === warning.warningId ? { ...entry, text: event.target.value } : entry,
                                    ),
                                  },
                                  metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                                }));
                                setConfirmedSections((current) => ({ ...current, disclosure: false }));
                              }}
                            />
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
                              disclosures: {
                                ...current.disclosures,
                                warnings: [
                                  ...current.disclosures.warnings,
                                  {
                                    warningId: makeId("warning"),
                                    type: "general",
                                    text: "",
                                  },
                                ],
                              },
                              metadata: { ...current.metadata, updatedAt: new Date().toISOString() },
                            }));
                            setConfirmedSections((current) => ({ ...current, disclosure: false }));
                          }}
                        >
                          Add warning
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
              {![
                "soa-introduction",
                "basic-details",
                "risk-profile",
                "scope-of-advice",
                "objectives",
                "strategy-recommendations",
                "product-recommendations",
                "replacement-analysis",
                "insurance-analysis",
                "disclosure",
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
                    Confirm section
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
                                {message.intakeAssessment.candidateObjectives.map((objective) => (
                                  <li key={objective.text}>{objective.text}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {outstandingMissingInformation.length ? (
                            <div className={styles.intakeSummaryBlock}>
                              <div className={styles.intakeSummaryLabel}>What still needs clarification</div>
                              <ul className={styles.intakeList}>
                                {outstandingMissingInformation.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {outstandingQuestions.length ? (
                            <div className={styles.intakeSummaryBlock}>
                              <div className={styles.intakeSummaryLabel}>Follow-up questions</div>
                              <ul className={styles.intakeList}>
                                {outstandingQuestions.map((question) => (
                                  <li key={question}>
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
                                {resolvedQuestions.map((question) => (
                                  <li key={question}>
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
                      persistSoaPrintPreview({
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
                      });
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
