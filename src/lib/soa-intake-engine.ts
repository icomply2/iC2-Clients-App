import type { AdviceModuleV1 } from "@/lib/soa-types";
import type { IntakeAssessmentV1 } from "@/lib/soa-output-contracts";

export type IntakeEngineInput = {
  clientName?: string | null;
  uploadedFileNames: string[];
  adviserMessage: string;
};

function hasAny(text: string, patterns: string[]) {
  return patterns.some((pattern) => text.includes(pattern));
}

function formatReasonList(reasons: string[]) {
  if (reasons.length <= 1) return reasons[0] ?? "";
  if (reasons.length === 2) return `${reasons[0]} and ${reasons[1]}`;
  return `${reasons.slice(0, -1).join(", ")}, and ${reasons[reasons.length - 1]}`;
}

function isTopicExcluded(text: string, topicPatterns: string[]) {
  return (
    hasAny(text, topicPatterns) &&
    hasAny(text, [
      "out of scope",
      "outside scope",
      "not in scope",
      "excluded",
      "exclude",
      "not relevant",
      "not requested",
      "not mentioned",
      "no evidence",
      "cost prohibitive",
      "too expensive",
    ])
  );
}

function buildInsuranceScopeExclusion(text: string) {
  const reasons = [
    hasAny(text, ["age", "older", "retired", "retirement"]) ? "the client's age and stage of life" : null,
    hasAny(text, ["asset level", "level of assets", "assets"]) ? "their level of assets" : null,
    hasAny(text, ["cost prohibitive", "too expensive", "expensive", "affordability"]) ? "the expected cost of cover" : null,
    hasAny(text, ["not relevant", "irrelevant", "not needed", "no need"]) ? "insurance does not appear relevant to the advice requested" : null,
  ].filter(Boolean) as string[];
  const reasonText = reasons.length
    ? ` because of ${formatReasonList(reasons)}`
    : " because it has not been requested or evidenced as part of this advice";

  return `Personal insurance advice is outside the scope of this advice${reasonText}. We have not assessed whether existing or new life, TPD, trauma or income protection cover is appropriate, so the client accepts the risk that any personal insurance needs may remain unaddressed.`;
}

function uniqueModules(modules: AdviceModuleV1[]) {
  return [...new Set(modules)];
}

function inferDocumentType(fileName: string): IntakeAssessmentV1["documentInsights"][number]["documentType"] {
  const normalized = fileName.toLowerCase();

  if (hasAny(normalized, ["fact find", "fact-find", "factfind", "client data form", "financial profile"])) {
    return "fact_find";
  }
  if (hasAny(normalized, ["transcript", "meeting", "file note", "client meeting"])) return "client_meeting_transcript";
  if (hasAny(normalized, ["paraplanning", "request", "soa request", "advice request"])) return "paraplanning_request";
  if (hasAny(normalized, ["productrex", "product", "platform", "fee comparison"])) return "product_report";
  if (hasAny(normalized, ["fee", "fees", "cost"])) return "fee_schedule";
  if (hasAny(normalized, ["agreement", "ongoing", "fixed term", "service"])) return "service_agreement";
  if (hasAny(normalized, ["insurance", "commission", "policy"])) return "insurance_document";

  return "unknown";
}

function buildFallbackDocumentInsights(input: IntakeEngineInput): IntakeAssessmentV1["documentInsights"] {
  return input.uploadedFileNames.map((fileName) => {
    const documentType = inferDocumentType(fileName);
    return {
      fileName,
      documentType,
      summary: `Finley detected this as ${documentType.replace(/_/g, " ")} based on the file name. The local fallback cannot read detailed document content.`,
      adviserInstructions: [],
      clientStatements: [],
      extractedFacts: [],
      evidenceReferences: [`File name: ${fileName}`],
    };
  });
}

function buildFallbackReadiness(input: {
  modules: AdviceModuleV1[];
  objectiveCount: number;
  scopeCount: number;
  missingInformation: string[];
  missingFeeInformation: string[];
}): IntakeAssessmentV1["readinessBySection"] {
  const hasMissingInformation = input.missingInformation.length > 0;
  const hasMissingFees = input.missingFeeInformation.length > 0;

  return [
    {
      sectionId: "soa-introduction",
      label: "SOA Introduction",
      status: "needs-confirmation",
      summary: "Initial SOA purpose has been inferred from the adviser message and uploaded files.",
      missingInformation: [],
      confirmationsRequired: ["Confirm the overall SOA purpose before starting the workflow."],
    },
    {
      sectionId: "scope-of-advice",
      label: "Scope of Advice",
      status: input.scopeCount ? "needs-confirmation" : "missing-information",
      summary: input.scopeCount ? "Likely scope areas have been identified." : "Scope still needs to be confirmed.",
      missingInformation: input.scopeCount ? [] : ["Confirm the advice areas that are in and out of scope."],
      confirmationsRequired: input.scopeCount ? ["Confirm the inferred scope and exclusions."] : [],
    },
    {
      sectionId: "objectives",
      label: "Objectives",
      status: input.objectiveCount ? "needs-confirmation" : "missing-information",
      summary: input.objectiveCount ? "Candidate client objectives have been identified." : "Client objectives still need to be captured.",
      missingInformation: input.objectiveCount ? [] : ["Confirm the client's key objectives for this SOA."],
      confirmationsRequired: input.objectiveCount ? ["Confirm the candidate objectives reflect the client discussion."] : [],
    },
    {
      sectionId: "strategy-recommendations",
      label: "Strategy Recommendations",
      status: input.modules.includes("strategy-advice") ? (hasMissingInformation ? "needs-confirmation" : "ready-to-draft") : "out-of-scope",
      summary: input.modules.includes("strategy-advice")
        ? "Strategy advice appears to be part of the SOA."
        : "Strategy recommendations are not clearly in scope.",
      missingInformation: hasMissingInformation ? input.missingInformation : [],
      confirmationsRequired: input.modules.includes("strategy-advice") ? ["Confirm the strategy themes before workflow creation."] : [],
    },
    {
      sectionId: "product-recommendations",
      label: "Product Recommendations",
      status: input.modules.includes("product-advice") ? "needs-confirmation" : "out-of-scope",
      summary: input.modules.includes("product-advice")
        ? "Product advice may be required and should be confirmed."
        : "Product recommendations are not clearly in scope.",
      missingInformation: input.modules.includes("product-advice") ? [] : [],
      confirmationsRequired: input.modules.includes("product-advice") ? ["Confirm whether product advice is required."] : [],
    },
    {
      sectionId: "insurance-analysis",
      label: "Insurance Needs Analysis",
      status: input.modules.includes("insurance-advice") ? "needs-confirmation" : "out-of-scope",
      summary: input.modules.includes("insurance-advice")
        ? "Insurance needs analysis appears to be part of the SOA."
        : "Insurance advice is not clearly in scope.",
      missingInformation: input.modules.includes("insurance-advice") ? ["Confirm insurance needs, existing cover, target cover, ownership, and rationale."] : [],
      confirmationsRequired: input.modules.includes("insurance-advice") ? ["Confirm the insurance needs analysis assumptions and outcomes."] : [],
    },
    {
      sectionId: "insurance-policies",
      label: "Recommended Insurance Policies",
      status: input.modules.includes("insurance-advice") ? "needs-confirmation" : "out-of-scope",
      summary: input.modules.includes("insurance-advice")
        ? "Insurance quote and policy recommendations should be confirmed."
        : "Insurance policy recommendations are not clearly in scope.",
      missingInformation: input.modules.includes("insurance-advice") ? ["Confirm insurer, product, cover levels, premiums, ownership, optional benefits, and underwriting notes."] : [],
      confirmationsRequired: input.modules.includes("insurance-advice") ? ["Confirm the recommended policy structure before generating the SOA."] : [],
    },
    {
      sectionId: "insurance-replacement",
      label: "Insurance Replacement",
      status: input.modules.includes("insurance-advice") ? "needs-confirmation" : "out-of-scope",
      summary: input.modules.includes("insurance-advice")
        ? "Confirm whether any existing insurance policies are being replaced."
        : "Insurance replacement is not clearly in scope.",
      missingInformation: input.modules.includes("insurance-advice") ? ["Confirm current versus recommended cover, premiums, replacement costs, and benefits gained or lost."] : [],
      confirmationsRequired: input.modules.includes("insurance-advice") ? ["Confirm whether insurance replacement disclosure is required."] : [],
    },
    {
      sectionId: "disclosure",
      label: "Disclosure",
      status: hasMissingFees ? "missing-information" : "needs-confirmation",
      summary: hasMissingFees ? "Fee disclosure details still need confirmation." : "Fee disclosure details are ready for adviser review.",
      missingInformation: hasMissingFees ? input.missingFeeInformation : [],
      confirmationsRequired: ["Confirm upfront fees, product fees, and commission disclosures."],
    },
    {
      sectionId: "service-agreement",
      label: "Service Agreement",
      status: hasMissingFees ? "missing-information" : "needs-confirmation",
      summary: "Service agreement requirement needs adviser confirmation.",
      missingInformation: hasMissingFees ? input.missingFeeInformation.filter((item) => item.toLowerCase().includes("service agreement")) : [],
      confirmationsRequired: ["Confirm whether a service agreement is required and whether it is ongoing or fixed term."],
    },
  ];
}

export function generateIntakeAssessment(input: IntakeEngineInput): IntakeAssessmentV1 {
  const text = input.adviserMessage.toLowerCase();
  const candidateModules: AdviceModuleV1[] = [];
  const insuranceMentioned = hasAny(text, ["insurance", "life cover", "tpd", "trauma", "income protection"]);
  const insuranceExcluded = isTopicExcluded(text, ["insurance", "life cover", "tpd", "trauma", "income protection"]);

  if (
    hasAny(text, [
      "salary sacrifice",
      "concessional",
      "retire",
      "retirement",
      "downsize",
      "downsizing",
      "strategy",
      "super",
    ])
  ) {
    candidateModules.push("strategy-advice");
  }

  if (hasAny(text, ["projection", "compare current", "better position", "retire", "retirement", "downsize", "sell his house", "sell her house", "sell home", "sale proceeds"])) {
    candidateModules.push("projection-analysis");
  }

  if (hasAny(text, ["product", "fund", "platform", "provider", "account based pension", "super fund"])) {
    candidateModules.push("product-advice");
  }

  if (hasAny(text, ["replace", "replacement", "switch", "rollover"])) {
    candidateModules.push("replacement-advice", "product-advice");
  }

  if (hasAny(text, ["allocation", "portfolio", "growth", "defensive", "rebalance"])) {
    candidateModules.push("portfolio-advice");
  }

  if (insuranceMentioned && !insuranceExcluded) {
    candidateModules.push("insurance-advice");
  }

  const normalizedModules = uniqueModules(candidateModules.length ? candidateModules : ["strategy-advice"]);

  const candidateObjectives = [
    hasAny(text, ["salary sacrifice", "concessional", "super"])
      ? {
          text: "Increase super contributions in a tax-effective way.",
          priority: "high" as const,
          sourceNote: "Derived from adviser intake message.",
        }
      : null,
    hasAny(text, ["retire", "retirement"])
      ? {
          text: "Prepare for retirement and improve long-term retirement funding.",
          priority: "high" as const,
          sourceNote: "Derived from adviser intake message.",
        }
      : null,
    hasAny(text, ["downsize", "sell home", "sell his house", "sell her house", "apartment"])
      ? {
          text: "Plan for the future home sale and downsizing strategy.",
          priority: "medium" as const,
          sourceNote: "Derived from adviser intake message.",
        }
      : null,
  ].filter(Boolean) as IntakeAssessmentV1["candidateObjectives"];

  const candidateStrategies = [
    hasAny(text, ["salary sacrifice", "concessional"])
      ? {
          text: "Salary sacrifice to super up to an appropriate concessional contribution target.",
          linkedThemes: ["super contributions", "retirement funding"],
          sourceNote: "Derived from adviser intake message.",
        }
      : null,
    hasAny(text, ["downsize", "sell home", "sale proceeds"])
      ? {
          text: "Use future home sale and downsizing proceeds as part of the retirement strategy.",
          linkedThemes: ["downsizing", "retirement strategy"],
          sourceNote: "Derived from adviser intake message.",
        }
      : null,
  ].filter(Boolean) as IntakeAssessmentV1["candidateStrategies"];

  const missingInformation = [
    hasAny(text, ["retire", "retirement"]) && !hasAny(text, ["3 years", "two years", "5 years", "age "])
      ? "Retirement timing is not yet clear enough."
      : null,
    hasAny(text, ["sell home", "sell his house", "sell her house", "sale proceeds", "downsize"]) && !hasAny(text, ["proceeds", "$", "funds"])
      ? "Expected sale proceeds and intended use of those proceeds are not yet clear."
      : null,
    normalizedModules.includes("product-advice") && !hasAny(text, ["recommend", "provider", "fund", "platform"])
      ? "Product recommendation intent may need clarification."
      : null,
    normalizedModules.includes("projection-analysis")
      ? "Projection assumptions will need confirmation before workflow review."
      : null,
  ].filter(Boolean) as string[];

  const followUpQuestions = [
    hasAny(text, ["retire", "retirement"])
      ? "What retirement timing should I assume for this SOA?"
      : "What is the main timing objective we should anchor the advice to?",
    hasAny(text, ["sell home", "sell his house", "sell her house", "downsize"])
      ? "How do you expect the home sale and downsizing proceeds to be used?"
      : "Are there any major assets or future transactions that are central to the advice?",
    normalizedModules.includes("product-advice")
      ? "Is this matter strategy-only, or do you expect a product recommendation as well?"
      : "Can you confirm whether this SOA is strategy-only or whether product advice is also in scope?",
  ].filter(Boolean) as string[];

  const matterSummary = `I understand this matter as advice for ${input.clientName ?? "the selected client"} focused on ${candidateStrategies.length ? candidateStrategies.map((item) => item.text.toLowerCase()).join(" and ") : "a strategy-led SOA"}, based on ${input.uploadedFileNames.length} uploaded supporting file${input.uploadedFileNames.length === 1 ? "" : "s"} and your intake instructions.`;
  const missingFeeInformation = [
    "Advice preparation fee needs confirmation.",
    "Implementation fee needs confirmation.",
    "Service agreement requirement needs confirmation.",
  ];
  const candidateScopeInclusions = [
    normalizedModules.includes("strategy-advice") ? "Strategic advice" : null,
    normalizedModules.includes("product-advice") ? "Product review and recommendation" : null,
    normalizedModules.includes("replacement-advice") ? "Replacement analysis" : null,
    normalizedModules.includes("insurance-advice") ? "Insurance needs analysis and cover review" : null,
    normalizedModules.includes("projection-analysis") ? "Projection analysis and future position comparison" : null,
  ].filter(Boolean) as string[];
  const candidateScopeExclusions = [
    !normalizedModules.includes("insurance-advice") ? buildInsuranceScopeExclusion(text) : null,
    !normalizedModules.includes("product-advice")
      ? "Product replacement advice is outside the current scope unless the adviser confirms that a product recommendation is required. We have not assessed replacement benefits, costs or disadvantages, so the client should not treat this SOA as a product replacement recommendation."
      : null,
    isTopicExcluded(text, ["estate", "estate planning", "will", "wills"])
      ? "Estate planning is outside the scope of this advice because it has not been requested or evidenced as part of this SOA. We have not reviewed wills, powers of attorney, estate distribution, tax consequences on death or estate planning structures, so those risks remain unaddressed."
      : null,
    isTopicExcluded(text, ["aged care", "aged-care"])
      ? "Aged care advice is outside the scope of this advice because it has not been requested or evidenced as part of this SOA. We have not assessed future aged care needs, costs or funding strategies, so those matters remain unaddressed."
      : null,
  ].filter(Boolean) as string[];

  return {
    matterSummary,
    documentInsights: buildFallbackDocumentInsights(input),
    evidenceBackedConfirmations: [],
    readinessBySection: buildFallbackReadiness({
      modules: normalizedModules,
      objectiveCount: candidateObjectives.length,
      scopeCount: candidateScopeInclusions.length + candidateScopeExclusions.length,
      missingInformation,
      missingFeeInformation,
    }),
    candidateModules: normalizedModules,
    candidateObjectives,
    candidateStrategies,
    candidateScopeInclusions,
    candidateScopeExclusions,
    candidateStrategyRecommendations: candidateStrategies.map((item) => item.text),
    candidateProductReviewNotes: normalizedModules.includes("product-advice")
      ? ["Review the suitability of current products and identify whether replacement or retention is appropriate."]
      : [],
    candidateInsuranceReviewNotes: normalizedModules.includes("insurance-advice")
      ? ["Review existing cover and determine whether current levels and structure remain suitable."]
      : [],
    candidateInsuranceNeedsAnalyses: [],
    candidateInsurancePolicyRecommendations: [],
    candidateInsurancePolicyReplacements: [],
    candidateProjectionNotes: normalizedModules.includes("projection-analysis")
      ? ["Model current versus recommended future position using the key retirement and asset assumptions."]
      : [],
    missingInformation,
    followUpQuestions,
    commercialsAndAgreements: {
      advicePreparationFee: null,
      implementationFee: null,
      productFeesKnown: null,
      insuranceCommissionsIncluded: null,
      insuranceCommissionDetails: [],
      serviceAgreementIncluded: null,
      serviceAgreementType: "unknown",
      serviceAgreementItems: [],
      missingFeeInformation,
    },
    confidence: input.uploadedFileNames.length >= 2 ? "medium" : "low",
  };
}

export function refineIntakeAssessment(
  current: IntakeAssessmentV1,
  input: IntakeEngineInput,
): IntakeAssessmentV1 {
  const next = generateIntakeAssessment(input);
  const nextExclusionText = next.candidateScopeExclusions.join(" ").toLowerCase();
  const mergedModules = [...new Set([...current.candidateModules, ...next.candidateModules])].filter((module) => {
    if (
      module === "insurance-advice" &&
      nextExclusionText.includes("insurance") &&
      (nextExclusionText.includes("outside the scope") || nextExclusionText.includes("out of scope"))
    ) {
      return false;
    }

    return true;
  });
  const currentDocumentInsights = current.documentInsights ?? [];
  const currentEvidenceBackedConfirmations = current.evidenceBackedConfirmations ?? [];
  const currentReadinessBySection = current.readinessBySection ?? [];
  const currentCommercials = current.commercialsAndAgreements ?? {
    advicePreparationFee: null,
    implementationFee: null,
    productFeesKnown: null,
    insuranceCommissionsIncluded: null,
    insuranceCommissionDetails: [],
    serviceAgreementIncluded: null,
    serviceAgreementType: "unknown" as const,
    serviceAgreementItems: [],
    missingFeeInformation: [],
  };

  return {
    matterSummary: next.matterSummary,
    documentInsights: [...currentDocumentInsights, ...next.documentInsights].filter(
      (insight, index, array) => array.findIndex((entry) => entry.fileName === insight.fileName) === index,
    ),
    evidenceBackedConfirmations: [...new Set([...currentEvidenceBackedConfirmations, ...next.evidenceBackedConfirmations])],
    readinessBySection: [...next.readinessBySection, ...currentReadinessBySection].filter(
      (readiness, index, array) => array.findIndex((entry) => entry.sectionId === readiness.sectionId) === index,
    ),
    candidateModules: mergedModules,
    candidateObjectives: [...current.candidateObjectives, ...next.candidateObjectives].filter(
      (objective, index, array) =>
        array.findIndex((entry) => entry.text.trim().toLowerCase() === objective.text.trim().toLowerCase()) === index,
    ),
    candidateStrategies: [...current.candidateStrategies, ...next.candidateStrategies].filter(
      (strategy, index, array) =>
        array.findIndex((entry) => entry.text.trim().toLowerCase() === strategy.text.trim().toLowerCase()) === index,
    ),
    candidateScopeInclusions: [...new Set([...current.candidateScopeInclusions, ...next.candidateScopeInclusions])],
    candidateScopeExclusions: [...new Set([...current.candidateScopeExclusions, ...next.candidateScopeExclusions])],
    candidateStrategyRecommendations: [
      ...new Set([...current.candidateStrategyRecommendations, ...next.candidateStrategyRecommendations]),
    ],
    candidateProductReviewNotes: [
      ...new Set([...current.candidateProductReviewNotes, ...next.candidateProductReviewNotes]),
    ],
    candidateInsuranceReviewNotes: [
      ...new Set([...current.candidateInsuranceReviewNotes, ...next.candidateInsuranceReviewNotes]),
    ],
    candidateInsuranceNeedsAnalyses: [
      ...(current.candidateInsuranceNeedsAnalyses ?? []),
      ...(next.candidateInsuranceNeedsAnalyses ?? []),
    ],
    candidateInsurancePolicyRecommendations: [
      ...(current.candidateInsurancePolicyRecommendations ?? []),
      ...(next.candidateInsurancePolicyRecommendations ?? []),
    ],
    candidateInsurancePolicyReplacements: [
      ...(current.candidateInsurancePolicyReplacements ?? []),
      ...(next.candidateInsurancePolicyReplacements ?? []),
    ],
    candidateProjectionNotes: [
      ...new Set([...current.candidateProjectionNotes, ...next.candidateProjectionNotes]),
    ],
    missingInformation: [...new Set([...current.missingInformation, ...next.missingInformation])],
    followUpQuestions: [...new Set([...current.followUpQuestions, ...next.followUpQuestions])],
    commercialsAndAgreements: {
      ...currentCommercials,
      advicePreparationFee: currentCommercials.advicePreparationFee ?? next.commercialsAndAgreements.advicePreparationFee ?? null,
      implementationFee: currentCommercials.implementationFee ?? next.commercialsAndAgreements.implementationFee ?? null,
      productFeesKnown: currentCommercials.productFeesKnown ?? next.commercialsAndAgreements.productFeesKnown ?? null,
      insuranceCommissionsIncluded:
        currentCommercials.insuranceCommissionsIncluded ?? next.commercialsAndAgreements.insuranceCommissionsIncluded ?? null,
      insuranceCommissionDetails: [
        ...currentCommercials.insuranceCommissionDetails,
        ...next.commercialsAndAgreements.insuranceCommissionDetails,
      ],
      serviceAgreementIncluded:
        currentCommercials.serviceAgreementIncluded ?? next.commercialsAndAgreements.serviceAgreementIncluded ?? null,
      serviceAgreementType:
        currentCommercials.serviceAgreementType && currentCommercials.serviceAgreementType !== "unknown"
          ? currentCommercials.serviceAgreementType
          : next.commercialsAndAgreements.serviceAgreementType,
      serviceAgreementItems: [
        ...currentCommercials.serviceAgreementItems,
        ...next.commercialsAndAgreements.serviceAgreementItems,
      ],
      missingFeeInformation: [
        ...new Set([
          ...currentCommercials.missingFeeInformation,
          ...next.commercialsAndAgreements.missingFeeInformation,
        ]),
      ],
    },
    confidence: current.confidence === "high" || next.confidence === "high" ? "high" : "medium",
  };
}
