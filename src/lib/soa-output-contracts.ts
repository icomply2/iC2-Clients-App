import type { AdviceModuleV1 } from "@/lib/soa-types";

export type CandidateObjectiveV1 = {
  text: string;
  priority?: "high" | "medium" | "low" | "unknown" | null;
  sourceNote?: string | null;
};

export type CandidateStrategyV1 = {
  text: string;
  linkedThemes?: string[] | null;
  sourceNote?: string | null;
};

export type IntakeDocumentInsightV1 = {
  fileName: string;
  documentType:
    | "client_meeting_transcript"
    | "fact_find"
    | "paraplanning_request"
    | "product_report"
    | "fee_schedule"
    | "service_agreement"
    | "insurance_document"
    | "unknown";
  summary: string;
  adviserInstructions: string[];
  clientStatements: string[];
  extractedFacts: string[];
  evidenceReferences: string[];
};

export type IntakeCommercialsAndAgreementsV1 = {
  advicePreparationFee?: number | null;
  implementationFee?: number | null;
  productFeesKnown?: boolean | null;
  insuranceCommissionsIncluded?: boolean | null;
  insuranceCommissionDetails: Array<{
    ownerName?: string | null;
    productName?: string | null;
    upfrontPercentage?: number | null;
    upfrontAmount?: number | null;
    ongoingPercentage?: number | null;
    ongoingAmount?: number | null;
    sourceNote?: string | null;
  }>;
  serviceAgreementIncluded?: boolean | null;
  serviceAgreementType?: "ongoing" | "fixed-term" | "none" | "unknown" | null;
  serviceAgreementItems: Array<{
    ownerName?: string | null;
    productName?: string | null;
    accountNumber?: string | null;
    feeAmount?: number | null;
    frequency?: "weekly" | "fortnightly" | "monthly" | "quarterly" | "half-yearly" | "annually" | "unknown" | null;
    sourceNote?: string | null;
  }>;
  missingFeeInformation: string[];
};

export type IntakeInsurancePolicyRecommendationV1 = {
  insuredName?: string | null;
  action?: "apply-new" | "retain-existing" | "replace-existing" | "vary-existing" | "cancel" | "not-recommended" | null;
  insurerName?: string | null;
  productName?: string | null;
  policyName?: string | null;
  recommendationText?: string | null;
  ownershipGroups: Array<{
    ownership?: "inside-super" | "outside-super" | "flexi-linked" | "smsf" | "employer" | "other" | "unknown" | null;
    fundingSource?: string | null;
    premiumFrequency?: "weekly" | "fortnightly" | "monthly" | "quarterly" | "half-yearly" | "annually" | "unknown" | null;
    premiumAmount?: number | null;
    annualisedPremium?: number | null;
    covers: Array<{
      coverType?: "life" | "tpd" | "trauma" | "income-protection" | "other" | null;
      details?: string | null;
      premiumType?: "variable-age-stepped" | "stepped" | "level" | "hybrid" | "unknown" | null;
      sumInsured?: number | null;
      monthlyBenefit?: number | null;
      premiumAmount?: number | null;
      waitingPeriod?: string | null;
      benefitPeriod?: string | null;
    }>;
  }>;
  optionalBenefits: string[];
  premiumBreakdown: Array<{
    ownership?: "inside-super" | "outside-super" | "flexi-linked" | "smsf" | "employer" | "other" | "unknown" | null;
    label: string;
    amount?: number | null;
  }>;
  underwritingNotes?: string | null;
  replacementNotes?: string | null;
  sourceNote?: string | null;
};

export type IntakeInsuranceNeedsAnalysisV1 = {
  ownerName?: string | null;
  policyType?: "life" | "tpd" | "trauma" | "income-protection" | "other" | null;
  methodology?: "needs-analysis" | "multiple-of-income" | "expense-replacement" | "debt-clearance" | "other" | null;
  purpose?: string | null;
  annualIncome?: number | null;
  annualLivingExpenses?: number | null;
  liabilitiesToRepay?: number | null;
  dependantsCount?: number | null;
  dependantSupportYears?: number | null;
  educationCosts?: number | null;
  existingCoverAmount?: number | null;
  superannuationBalance?: number | null;
  otherAssetsAvailable?: number | null;
  targetCoverAmount?: number | null;
  coverGapAmount?: number | null;
  suggestedWaitingPeriod?: string | null;
  suggestedBenefitPeriod?: string | null;
  suggestedPolicyOwnership?: "super" | "retail" | "either" | "unknown" | null;
  requirements?: IntakeInsuranceNeedsAnalysisLineItemV1[] | null;
  provisions?: IntakeInsuranceNeedsAnalysisLineItemV1[] | null;
  rationale?: string | null;
  sourceNote?: string | null;
};

export type IntakeInsuranceNeedsAnalysisLineItemV1 = {
  key?:
    | "debt-repayment"
    | "income-replacement"
    | "education-costs"
    | "funeral-final-expenses"
    | "emergency-reserve"
    | "existing-cover"
    | "superannuation-balance"
    | "available-assets"
    | null;
  title: string;
  category?: "requirement" | "provision" | null;
  life?: number | null;
  tpd?: number | null;
  trauma?: number | null;
  incomeProtection?: number | null;
};

export type IntakeInsurancePolicyReplacementV1 = {
  ownerName?: string | null;
  currentInsurer?: string | null;
  recommendedInsurer?: string | null;
  currentLifeCover?: number | null;
  recommendedLifeCover?: number | null;
  currentTpdCover?: number | null;
  recommendedTpdCover?: number | null;
  currentIncomeProtectionCover?: number | null;
  recommendedIncomeProtectionCover?: number | null;
  currentTraumaCover?: number | null;
  recommendedTraumaCover?: number | null;
  currentAnnualPremium?: number | null;
  recommendedAnnualPremium?: number | null;
  premiumDifference?: number | null;
  reasons: string[];
  costs: string[];
  benefitsGained: string[];
  benefitsLost: string[];
  notes?: string | null;
  sourceNote?: string | null;
};

export type IntakeInsuranceAdvicePersonV1 = {
  insuredName?: string | null;
  currentCoverReview?: {
    summary?: string | null;
    reviewNotes?: string | null;
    policies?: Array<{
      ownerName?: string | null;
      insuredName?: string | null;
      insurerName?: string | null;
      productName?: string | null;
      policyName?: string | null;
      policyNumber?: string | null;
      ownership?: "inside-super" | "outside-super" | "flexi-linked" | "smsf" | "employer" | "other" | "unknown" | null;
      fundingSource?: string | null;
      linkedSuperFund?: string | null;
      status?: string | null;
      premiumAmount?: number | null;
      premiumFrequency?: "weekly" | "fortnightly" | "monthly" | "quarterly" | "half-yearly" | "annually" | "unknown" | null;
      annualisedPremium?: number | null;
      benefits?: Array<{
        coverType?: "life" | "tpd" | "trauma" | "income-protection" | "other" | null;
        details?: string | null;
        sumInsured?: number | null;
        monthlyBenefit?: number | null;
        premiumAmount?: number | null;
        premiumFrequency?: "weekly" | "fortnightly" | "monthly" | "quarterly" | "half-yearly" | "annually" | "unknown" | null;
        waitingPeriod?: string | null;
        benefitPeriod?: string | null;
        status?: string | null;
        exclusionsOrLoadings?: string | null;
        notes?: string | null;
      }>;
      exclusionsOrLoadings?: string | null;
      retainabilityNotes?: string | null;
      variationOptions?: string | null;
      replacementRiskNotes?: string | null;
      sourceNote?: string | null;
    }>;
  } | null;
  insurabilityAssessment?: {
    healthDisclosureStatus?:
      | "not-discussed"
      | "no-concerns-disclosed"
      | "concerns-disclosed"
      | "requires-underwriting"
      | "unknown"
      | null;
    abilityToObtainCover?: "likely" | "needs-underwriting" | "restricted" | "unlikely" | "unknown" | null;
    healthNotes?: string | null;
    occupationNotes?: string | null;
    hazardousPursuitsNotes?: string | null;
    claimsHistoryNotes?: string | null;
    underwritingConcerns?: string | null;
    replacementRiskNotes?: string | null;
    adviserAssessment?: string | null;
  } | null;
  needsAnalyses?: IntakeInsuranceNeedsAnalysisV1[] | null;
  productResearchOptions?: Array<{
    insurerName?: string | null;
    productName?: string | null;
    ownership?: "inside-super" | "outside-super" | "flexi-linked" | "smsf" | "employer" | "other" | "unknown" | null;
    actionConsidered?: "apply-new" | "retain-existing" | "replace-existing" | "vary-existing" | "cancel" | "not-recommended" | null;
    coverSummary?: string | null;
    premiumAmount?: number | null;
    premiumFrequency?: "weekly" | "fortnightly" | "monthly" | "quarterly" | "half-yearly" | "annually" | "unknown" | null;
    annualisedPremium?: number | null;
    keyFeatures?: string[] | null;
    limitations?: string[] | null;
    underwritingAssumptions?: string | null;
    status?: "recommended" | "alternative" | "rejected" | "current" | "unknown" | null;
    rationale?: string | null;
    sourceNote?: string | null;
  }> | null;
  recommendations?: IntakeInsurancePolicyRecommendationV1[] | null;
  replacementAnalyses?: IntakeInsurancePolicyReplacementV1[] | null;
};

export type IntakeSectionReadinessV1 = {
  sectionId:
    | "soa-introduction"
    | "risk-profile"
    | "scope-of-advice"
    | "objectives"
    | "strategy-recommendations"
    | "product-recommendations"
    | "replacement-analysis"
    | "insurance-current-cover"
    | "insurance-analysis"
    | "insurance-policies"
    | "insurance-replacement"
    | "insurance-recommendations"
    | "portfolio-allocation"
    | "projections"
    | "disclosure"
    | "service-agreement"
    | "appendix";
  label: string;
  status: "ready-to-draft" | "needs-confirmation" | "missing-information" | "out-of-scope";
  summary: string;
  missingInformation: string[];
  confirmationsRequired: string[];
};

export type IntakeAssessmentV1 = {
  matterSummary: string;
  documentInsights: IntakeDocumentInsightV1[];
  evidenceBackedConfirmations: string[];
  readinessBySection: IntakeSectionReadinessV1[];
  candidateModules: AdviceModuleV1[];
  candidateObjectives: CandidateObjectiveV1[];
  candidateStrategies: CandidateStrategyV1[];
  candidateScopeInclusions: string[];
  candidateScopeExclusions: string[];
  candidateStrategyRecommendations: string[];
  candidateProductReviewNotes: string[];
  candidateInsuranceReviewNotes: string[];
  candidateInsuranceAdvice: IntakeInsuranceAdvicePersonV1[];
  candidateInsuranceNeedsAnalyses: IntakeInsuranceNeedsAnalysisV1[];
  candidateInsurancePolicyRecommendations: IntakeInsurancePolicyRecommendationV1[];
  candidateInsurancePolicyReplacements: IntakeInsurancePolicyReplacementV1[];
  candidateProjectionNotes: string[];
  missingInformation: string[];
  followUpQuestions: string[];
  commercialsAndAgreements: IntakeCommercialsAndAgreementsV1;
  confidence: "low" | "medium" | "high";
};

export type StrategyRecommendationDraftV1 = {
  type: string;
  recommendedFor: string[];
  recommendationText: string;
  linkedObjectiveTexts: string[];
  clientBenefits: string[];
  consequences: string[];
  alternativesConsidered: string[];
  rationale?: string | null;
};

export type StrategyDraftResponseV1 = {
  recommendations: StrategyRecommendationDraftV1[];
  source: "llm" | "fallback";
  model: string | null;
  warning?: string | null;
};

export type ProductRecommendationDraftV1 = {
  action: "obtain" | "retain" | "replace" | "rollover" | "consolidate" | "dispose";
  productType: "super" | "pension" | "investment" | "annuity" | "insurance" | "other";
  recommendedFor: string[];
  recommendationText: string;
  linkedObjectiveTexts: string[];
  currentProductName?: string | null;
  currentProvider?: string | null;
  recommendedProductName?: string | null;
  recommendedProvider?: string | null;
  clientBenefits: string[];
  consequences: string[];
  suitabilityRationale?: string | null;
  alternativesConsidered: Array<{
    productName?: string | null;
    provider?: string | null;
    reasonDiscounted?: string | null;
  }>;
};

export type ProductDraftResponseV1 = {
  recommendations: ProductRecommendationDraftV1[];
  source: "llm" | "fallback";
  model: string | null;
  warning?: string | null;
};
