export type RefName = {
  id?: string | null;
  name?: string | null;
};

export type RefNameEmail = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
};

export type AdviceModuleV1 =
  | "strategy-advice"
  | "product-advice"
  | "replacement-advice"
  | "portfolio-advice"
  | "insurance-advice"
  | "projection-analysis";

export type AdviceBlueprintV1 = {
  includedModules: AdviceModuleV1[];
};

export type AdvicePersonV1 = {
  personId: string;
  role: "client" | "partner";
  fullName: string;
  dateOfBirth?: string | null;
  age?: number | null;
  relationshipStatus?: string | null;
  occupation?: string | null;
};

export type HouseholdSummaryV1 = {
  maritalStatus?: string | null;
  dependantSummary?: string | null;
};

export type ObjectiveV1 = {
  objectiveId: string;
  ownerPersonIds: string[];
  text: string;
  priority?: "high" | "medium" | "low" | "unknown" | null;
};

export type ScopeItemV1 = {
  scopeItemId: string;
  topic: string;
  notes?: string | null;
};

export type AdviceScopeV1 = {
  included: ScopeItemV1[];
  excluded: ScopeItemV1[];
  limitations: string[];
};

export type SuperItemV1 = {
  itemId: string;
  ownerPersonIds: string[];
  fundName: string;
  accountType: "accumulation" | "pension" | "smsf" | "other";
  balance?: number | null;
};

export type ExistingInsuranceItemV1 = {
  itemId: string;
  ownerPersonIds: string[];
  policyType: "life" | "tpd" | "trauma" | "income-protection" | "other";
  provider?: string | null;
  sumInsured?: number | null;
  premium?: number | null;
  status: "existing" | "recommended" | "declined";
};

export type FinancialSituationV1 = {
  incomeSummary?: string | null;
  expenseSummary?: string | null;
  assetSummary?: string | null;
  liabilitySummary?: string | null;
  superannuation: SuperItemV1[];
  insurance: ExistingInsuranceItemV1[];
};

export type RiskProfileV1 = {
  profile: "cash" | "defensive" | "moderate" | "balanced" | "growth" | "high-growth" | "unknown";
  timeHorizonYears?: number | null;
  toleranceNotes?: string | null;
};

export type RecommendationBenefitV1 = {
  benefitId: string;
  text: string;
  linkedObjectiveIds?: string[] | null;
};

export type RecommendationConsequenceV1 = {
  consequenceId: string;
  type?: "positive" | "negative" | "trade-off" | "risk" | "other" | null;
  text: string;
};

export type AlternativeConsideredV1 = {
  alternativeId: string;
  optionText: string;
  reasonNotRecommended?: string | null;
};

export type StrategicRecommendationV1 = {
  recommendationId: string;
  type: string;
  recommendationText: string;
  linkedObjectiveIds: string[];
  targetAmount?: number | null;
  monthlyContribution?: number | null;
  annualContribution?: number | null;
  contributionFrequency?:
    | "weekly"
    | "fortnightly"
    | "monthly"
    | "quarterly"
    | "annually"
    | "one-off"
    | "ad-hoc"
    | "unknown"
    | null;
  targetDate?: string | null;
  reviewFrequency?: "monthly" | "quarterly" | "half-yearly" | "annually" | "ad-hoc" | "unknown" | null;
  fundingSource?: string | null;
  priorityRank?: number | null;
  assumptionNote?: string | null;
  amountConfidence?: "exact" | "estimated" | "pending-confirmation" | null;
  clientBenefits: RecommendationBenefitV1[];
  consequences: RecommendationConsequenceV1[];
  alternativesConsidered: AlternativeConsideredV1[];
  implementationNotes?: string | null;
  rationale?: string | null;
};

export type ProductComparisonSideV1 = {
  productName?: string | null;
  provider?: string | null;
  establishmentFee?: number | null;
  adminFee?: number | null;
  investmentFee?: number | null;
  adviceFee?: number | null;
  insuranceFee?: number | null;
  otherFees?: number | null;
  totalAnnualCost?: number | null;
  keyFeatures?: string[] | null;
  limitations?: string[] | null;
};

export type ProductComparisonRowV1 = {
  rowId: string;
  label: string;
  currentValue?: string | null;
  proposedValue?: string | null;
  alternativeValue?: string | null;
};

export type ProductComparisonV1 = {
  comparisonId: string;
  currentProduct?: ProductComparisonSideV1 | null;
  proposedProduct: ProductComparisonSideV1;
  keyDifferences?: string[] | null;
  comparisonRows?: ProductComparisonRowV1[] | null;
  costComparisonNarrative?: string | null;
  replacementJustification?: string | null;
};

export type ProductAlternativeConsideredV1 = {
  alternativeId: string;
  productName?: string | null;
  provider?: string | null;
  reasonDiscounted?: string | null;
};

export type ProductRecommendationV1 = {
  recommendationId: string;
  action: "obtain" | "retain" | "replace" | "rollover" | "dispose";
  productType: "super" | "pension" | "investment" | "annuity" | "insurance" | "other";
  recommendedProductName?: string | null;
  recommendedProvider?: string | null;
  linkedObjectiveIds: string[];
  recommendationText: string;
  targetAmount?: number | null;
  transferAmount?: number | null;
  monthlyFundingAmount?: number | null;
  annualFundingAmount?: number | null;
  implementationDate?: string | null;
  reviewFrequency?: "monthly" | "quarterly" | "half-yearly" | "annually" | "ad-hoc" | "unknown" | null;
  fundingSource?: string | null;
  priorityRank?: number | null;
  assumptionNote?: string | null;
  amountConfidence?: "exact" | "estimated" | "pending-confirmation" | null;
  clientBenefits: RecommendationBenefitV1[];
  consequences: RecommendationConsequenceV1[];  
  suitabilityRationale?: string | null;
  currentProductName?: string | null;
  currentProvider?: string | null;
  comparison?: ProductComparisonV1 | null;
  alternativesConsidered: ProductAlternativeConsideredV1[];
};

export type ReplacementRecommendationV1 = {
  recommendationId: string;
  replacementType?: "switch" | "rollover" | "cancel-and-replace" | "retain-and-adjust" | "other" | null;
  currentProductName?: string | null;
  currentProvider?: string | null;
  recommendedProductName?: string | null;
  recommendedProvider?: string | null;
  replacementReasonText: string;
  linkedObjectiveIds: string[];
  clientBenefits: RecommendationBenefitV1[];
  consequences: RecommendationConsequenceV1[];
  alternativesConsidered: AlternativeConsideredV1[];
  feeComparisonNarrative?: string | null;
  replacementRisks?: string[] | null;
  rationale?: string | null;
};

export type PortfolioRecommendationV1 = {
  recommended: boolean;
  assetClasses: {
    assetClass: string;
    targetPct?: number | null;
  }[];
  holdings?: {
    holdingId: string;
    platformName?: string | null;
    fundName: string;
    code?: string | null;
    amount?: number | null;
    investmentFeePct?: number | null;
    investmentFeeAmount?: number | null;
    transactionAmount?: number | null;
    buySellSpreadPct?: number | null;
    buySellSpreadAmount?: number | null;
    brokerageAmount?: number | null;
  }[] | null;
  allocationComparison?: {
    rowId: string;
    assetClass: string;
    currentPct?: number | null;
    riskProfilePct?: number | null;
    recommendedPct?: number | null;
    variancePct?: number | null;
  }[] | null;
  sourceFileName?: string | null;
  linkedObjectiveIds?: string[] | null;
  clientBenefits?: RecommendationBenefitV1[] | null;
  consequences?: RecommendationConsequenceV1[] | null;
  alternativesConsidered?: AlternativeConsideredV1[] | null;
  variationExplanation?: string | null;
  rationale?: string | null;
};

export type InsuranceNeedsAnalysisV1 = {
  analysisId: string;
  ownerPersonIds: string[];
  policyType: "life" | "tpd" | "trauma" | "income-protection" | "other";
  methodology:
    | "capital-needs"
    | "income-replacement"
    | "debt-plus-education"
    | "expense-based"
    | "existing-cover-gap"
    | "other";
  purpose?: string | null;
  inputs: {
    annualIncome?: number | null;
    annualLivingExpenses?: number | null;
    liabilitiesToRepay?: number | null;
    dependantsCount?: number | null;
    dependantSupportYears?: number | null;
    educationCosts?: number | null;
    existingCoverAmount?: number | null;
    superannuationBalance?: number | null;
    emergencyReserve?: number | null;
    otherAssetsAvailable?: number | null;
    waitingPeriodMonths?: number | null;
    benefitPeriodYears?: number | null;
    notes?: string | null;
  };
  outputs: {
    targetCoverAmount?: number | null;
    coverGapAmount?: number | null;
    suggestedWaitingPeriod?: string | null;
    suggestedBenefitPeriod?: string | null;
    suggestedPolicyOwnership?: "super" | "retail" | "either" | "unknown" | null;
    suggestedStructureNotes?: string | null;
  };
  rationale?: string | null;
};

export type InsuranceRecommendationV1 = {
  recommendationId: string;
  needsAnalysisId?: string | null;
  policyType: "life" | "tpd" | "trauma" | "income-protection" | "other";
  recommendedProductName?: string | null;
  recommendedProvider?: string | null;
  coverAmount?: number | null;
  premium?: number | null;
  waitingPeriod?: string | null;
  benefitPeriod?: string | null;
  ownershipStructure?: "super" | "retail" | "split" | "other" | null;
  linkedObjectiveIds: string[];
  recommendationText: string;
  clientBenefits: RecommendationBenefitV1[];
  consequences: RecommendationConsequenceV1[];
  alternativesConsidered: AlternativeConsideredV1[];
  rationale?: string | null;
};

export type ProjectionMetricV1 = {
  metricId: string;
  name: string;
  currentValue?: number | null;
  recommendedValue?: number | null;
  differenceValue?: number | null;
  unit?: "currency" | "percent" | "years" | "other" | null;
  notes?: string | null;
};

export type ProjectionYearV1 = {
  yearIndex: number;
  age?: number | null;
  calendarYear?: number | null;
  currentValue?: number | null;
  recommendedValue?: number | null;
  differenceValue?: number | null;
};

export type FinancialProjectionV1 = {
  projectionId: string;
  name: string;
  projectionType: "current-position" | "recommended-position" | "comparison";
  purpose?: string | null;
  timeframe: {
    startDate?: string | null;
    projectionYears: number;
    retirementAge?: number | null;
    endAge?: number | null;
  };
  assumptions: {
    inflationPct?: number | null;
    earningsRatePct?: number | null;
    salaryGrowthPct?: number | null;
    contributionGrowthPct?: number | null;
    drawdownRatePct?: number | null;
    taxAssumptions?: string | null;
    legislativeAssumptions?: string | null;
    notes?: string | null;
  };
  inputsSummary?: string | null;
  outputs: {
    currentPositionSummary?: string | null;
    recommendedPositionSummary?: string | null;
    betterPositionSummary?: string | null;
    keyMetrics: ProjectionMetricV1[];
    yearlySeries?: ProjectionYearV1[] | null;
  };
  linkedRecommendationIds: string[];
  rationale?: string | null;
};

export type AdviceRecommendationsV1 = {
  strategic: StrategicRecommendationV1[];
  product: ProductRecommendationV1[];
  replacement: ReplacementRecommendationV1[];
  portfolio?: PortfolioRecommendationV1 | null;
  insuranceNeedsAnalyses?: InsuranceNeedsAnalysisV1[] | null;
  insurance?: InsuranceRecommendationV1[] | null;
};

export type AdviceFeeItemV1 = {
  feeId: string;
  type: "preparation" | "implementation" | "ongoing" | "fixed-term" | "other";
  amount?: number | null;
  percentage?: number | null;
  payer?: string | null;
};

export type ProductFeeItemV1 = {
  feeId: string;
  productName?: string | null;
  amount?: number | null;
  percentage?: number | null;
  feeType: "investment" | "admin" | "platform" | "other";
};

export type CommissionItemV1 = {
  commissionId: string;
  type: "upfront" | "ongoing";
  productType: "insurance" | "other";
  amount?: number | null;
  disclosed?: boolean | null;
};

export type AdviceFeesV1 = {
  adviceFees: AdviceFeeItemV1[];
  productFees: ProductFeeItemV1[];
  commissions: CommissionItemV1[];
};

export type FeeAgreementV1 = {
  present: boolean;
  agreementType: "ongoing" | "fixed-term" | "annual" | "none";
  startDate?: string | null;
  endDate?: string | null;
  referenceDate?: string | null;
  services: string[];
};

export type AdviceAgreementsV1 = {
  feeAgreement?: FeeAgreementV1 | null;
};

export type DisclosureWarningV1 = {
  warningId: string;
  type: "general" | "projection" | "scope" | "tax" | "estate" | "other";
  text: string;
};

export type AdviceDisclosuresV1 = {
  pdsProvided?: boolean | null;
  warnings: DisclosureWarningV1[];
  limitations: string[];
};

export type ProductRexFeeComparisonRowV1 = {
  rowId: string;
  label: string;
  currentValue?: string | null;
  recommendedValue?: string | null;
  alternativeValue?: string | null;
};

export type ProductRexTransactionRowV1 = {
  transactionId: string;
  platformName?: string | null;
  fundName: string;
  transactionAmount?: number | null;
  buySellSpreadPct?: number | null;
  buySellSpreadAmount?: number | null;
  brokerageAmount?: number | null;
};

export type ProductRexHoldingV1 = {
  holdingId: string;
  platformName?: string | null;
  fundName: string;
  code?: string | null;
  amount?: number | null;
  investmentFeePct?: number | null;
  investmentFeeAmount?: number | null;
};

export type ProductRexAllocationRowV1 = {
  rowId: string;
  assetClass: string;
  currentPct?: number | null;
  riskProfilePct?: number | null;
  recommendedPct?: number | null;
  variancePct?: number | null;
};

export type ProductRexReportV1 = {
  reportId: string;
  sourceFileName: string;
  currentPlatform?: string | null;
  recommendedPlatform?: string | null;
  alternativePlatform?: string | null;
  replacementReasons: string[];
  platformComparisonRows: ProductRexFeeComparisonRowV1[];
  recommendedHoldings: ProductRexHoldingV1[];
  transactionRows: ProductRexTransactionRowV1[];
  allocationRows: ProductRexAllocationRowV1[];
  managedAccountFeeNotes: string[];
  sourceExcerpt?: string | null;
  parsedAt: string;
};

export type AdviceCaseV1 = {
  adviceCaseId: string;
  clientProfileId?: string | null;
  documentType: "SOA";
  licensee: RefName;
  practice: RefName;
  templateKey: string;
  blueprint: AdviceBlueprintV1;
  clientGroup: {
    clients: AdvicePersonV1[];
    household?: HouseholdSummaryV1 | null;
  };
  objectives: ObjectiveV1[];
  scope: AdviceScopeV1;
  financialSituation: FinancialSituationV1;
  riskProfile?: RiskProfileV1 | null;
  recommendations: AdviceRecommendationsV1;
  financialProjections?: FinancialProjectionV1[] | null;
  fees: AdviceFeesV1;
  agreements: AdviceAgreementsV1;
  disclosures: AdviceDisclosuresV1;
  productRexReports?: ProductRexReportV1[] | null;
  metadata: {
    status: "draft" | "ready-for-generation" | "generated";
    createdAt: string;
    updatedAt: string;
    createdBy?: RefNameEmail | null;
    updatedBy?: RefNameEmail | null;
  };
};
