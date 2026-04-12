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

export type IntakeAssessmentV1 = {
  matterSummary: string;
  candidateModules: AdviceModuleV1[];
  candidateObjectives: CandidateObjectiveV1[];
  candidateStrategies: CandidateStrategyV1[];
  candidateScopeInclusions: string[];
  candidateScopeExclusions: string[];
  candidateStrategyRecommendations: string[];
  candidateProductReviewNotes: string[];
  candidateInsuranceReviewNotes: string[];
  candidateProjectionNotes: string[];
  missingInformation: string[];
  followUpQuestions: string[];
  confidence: "low" | "medium" | "high";
};

export type StrategyRecommendationDraftV1 = {
  type: string;
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
  action: "obtain" | "retain" | "replace" | "rollover" | "dispose";
  productType: "super" | "pension" | "investment" | "annuity" | "insurance" | "other";
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
