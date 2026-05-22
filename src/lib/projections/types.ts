export type ProjectionPerson = {
  personId: string;
  name: string;
  role: "client" | "partner";
  gender: "female" | "male" | "unknown";
  dateOfBirth?: string | null;
  startAge: number;
  retirementAge?: number | null;
  relationshipStatus?: string | null;
  isHomeowner: boolean;
};

export type ProjectionDependant = {
  dependantId: string;
  ownerPersonId: string;
  name: string;
  relationship?: string | null;
  dateOfBirth?: string | null;
};

export type ProjectionAsset = {
  assetId: string;
  ownerPersonId: string;
  type:
    | "primary-residence"
    | "cash"
    | "bank-account"
    | "offset-account"
    | "term-deposit"
    | "investment"
    | "investment-property"
    | "australian-shares"
    | "international-shares"
    | "managed-fund"
    | "etf"
    | "funeral-bond"
    | "home-contents"
    | "motor-vehicle"
    | "personal-asset"
    | "business"
    | "other";
  name: string;
  openingValue: number;
  annualIncome?: number;
  growthRateKey: "none" | "cpi" | "cash" | "Defensive" | "Moderate" | "Balanced" | "Growth" | "High Growth";
  centrelink: "assessable" | "exempt" | "financial-asset";
  reserveTarget?: number | null;
};

export type ProjectionLiability = {
  liabilityId: string;
  ownerPersonId: string;
  type: "credit-card" | "mortgage" | "personal-loan" | "other";
  name: string;
  openingBalance: number;
  annualInterestRate: number;
  annualRepayment: number;
  repaymentTiming: "start-of-year" | "end-of-year";
};

export type AssetSaleEvent = {
  eventId: string;
  label: string;
  assetId: string;
  saleDate: string | null;
  amountMode: "full-value" | "fixed-amount";
  fixedAmount?: number;
  targetAssetId?: string | null;
  enabled: boolean;
};

export type LiabilityPaymentEvent = {
  eventId: string;
  label: string;
  liabilityId: string;
  paymentDate: string | null;
  amountMode: "full-balance" | "fixed-amount";
  fixedAmount?: number;
  sourceAssetId?: string | null;
  enabled: boolean;
};

export type RetirementAccount = {
  accountId: string;
  ownerPersonId: string;
  accountType: "account-based-pension" | "super-accumulation";
  provider: string;
  productName: string;
  openingBalance: number;
  annualFeeRate?: number;
  annualInsurancePremium?: number;
  annualContribution?: number;
  annualContributionType?: "concessional" | "non-concessional";
  rolloverToPensionDate?: string | null;
  rolloverPensionName?: string | null;
  rolloverAnnualDrawdown?: number;
  rolloverDrawdownIndexedToCpi?: boolean;
  investmentProfileKey: string;
  annualDrawdown: number;
  drawdownIndexedToCpi: boolean;
  taxableToClient: boolean;
  centrelink: "financial-asset" | "exempt" | "unknown";
};

export type SuperContributionStrategy = {
  strategyId: string;
  ownerPersonId: string;
  targetAccountId: string;
  label: string;
  annualAmount: number;
  contributionType: "concessional" | "non-concessional";
  startDate?: string | null;
  endDate?: string | null;
  indexedToCpi: boolean;
  enabled: boolean;
};

export type SuperRolloverEvent = {
  eventId: string;
  label: string;
  sourceAccountId: string;
  destinationAccountId?: string | null;
  destinationPensionName?: string | null;
  rolloverDate: string | null;
  amountMode: "full-balance" | "fixed-amount";
  fixedAmount?: number;
  annualDrawdown?: number;
  drawdownIndexedToCpi?: boolean;
  enabled: boolean;
};

export type PensionWithdrawalEvent = {
  eventId: string;
  label: string;
  accountId: string;
  withdrawalDate: string | null;
  amountMode: "fixed-amount" | "full-balance";
  fixedAmount?: number;
  targetAssetId?: string | null;
  enabled: boolean;
};

export type CashflowItem = {
  itemId: string;
  ownerPersonId: string;
  category: "living-expense" | "other-income" | "other-expense";
  label: string;
  annualAmount: number;
  startDate?: string | null;
  endDate?: string | null;
  indexedToCpi: boolean;
  taxable: boolean;
};

export type ProjectionScenario = {
  scenarioId: string;
  scenarioName: string;
  startYear: number;
  startMonth: number;
  people: ProjectionPerson[];
  dependants?: ProjectionDependant[];
  primaryPersonId: string;
  projectionEnd: {
    type: "life-expectancy";
    personId: string;
  };
  assets: ProjectionAsset[];
  liabilities: ProjectionLiability[];
  assetSaleEvents: AssetSaleEvent[];
  liabilityPaymentEvents: LiabilityPaymentEvent[];
  retirementAccounts: RetirementAccount[];
  superContributionStrategies: SuperContributionStrategy[];
  superRolloverEvents: SuperRolloverEvent[];
  pensionWithdrawalEvents: PensionWithdrawalEvent[];
  cashflowItems: CashflowItem[];
  cashflowAllocation?: {
    surplusTarget?: {
      targetType: "cash-asset" | "liability";
      targetId: string;
    } | null;
  } | null;
};

export type TaxBracket = {
  threshold: number;
  rate: number;
};

export type LegislativeAssumptions = {
  effectiveDate: string;
  tax: {
    residentIndividualBrackets: TaxBracket[];
    medicareLevyRate: number;
    medicareIndividualThreshold: number;
    medicareShadeInRate: number;
    medicareShadeInThreshold: number;
    offsets: {
      lowIncomeTaxOffset: {
        maximumOffset: number;
        firstThreshold: number;
        secondThreshold: number;
        upperThreshold: number;
        firstTaperRate: number;
        secondTaperRate: number;
      };
      seniorsAndPensionersTaxOffset: {
        single: {
          maximumOffset: number;
          shadeOutThreshold: number;
          cutOutThreshold: number;
        };
        coupleEach: {
          maximumOffset: number;
          shadeOutThreshold: number;
          cutOutThreshold: number;
        };
        taperRate: number;
      };
    };
  };
  agePension: {
    maxAnnualRateSingle: number;
    maxAnnualRateCoupleEach: number;
    qualifyingAge: number;
    assetsTest: {
      singleHomeownerThreshold: number;
      singleNonHomeownerThreshold: number;
      coupleHomeownerThreshold: number;
      coupleNonHomeownerThreshold: number;
      taperPerThousandPerFortnight: number;
    };
    incomeTest: {
      singleAnnualThreshold: number;
      coupleCombinedAnnualThreshold: number;
      taperRate: number;
    };
    deeming: {
      singleThreshold: number;
      coupleThreshold: number;
      rateBelowThreshold: number;
      rateAboveThreshold: number;
    };
  };
  accountBasedPension: {
    minimumDrawdownByAge: Array<{
      minAge: number;
      maxAge: number;
      minimumFactor: number;
      maximumTtrFactor: number;
    }>;
  };
  superannuation: {
    superGuaranteeRate: number;
    maximumContributionBaseQuarterly: number;
    concessionalContributionsCap: number;
    contributionsTaxRate: number;
    investmentEarningsTaxRate: number;
  };
};

export type EconomicAssumptions = {
  cpiRate: number;
  awoteRate: number;
  lifeExpectancy: Array<{
    age: number;
    maleExpectedAge: number;
    femaleExpectedAge: number;
  }>;
};

export type InvestmentProfileAssumptions = {
  profiles: Record<
    string,
    {
      growthRate: number;
      incomeRate: number;
      totalReturn: number;
      standardDeviation?: number | null;
      defensivePct?: number | null;
      growthPct?: number | null;
    }
  >;
};

export type ProjectionAssumptions = {
  legislative: LegislativeAssumptions;
  economic: EconomicAssumptions;
  investmentProfiles: InvestmentProfileAssumptions;
};

export type TaxProjectionYear = {
  taxableAgePension: number;
  taxableBankInterest: number;
  taxableOtherIncome: number;
  taxFreeAccountBasedPension: number;
  taxableIncome: number;
  grossTax: number;
  medicareLevy: number;
  lowIncomeTaxOffset: number;
  seniorsAndPensionersTaxOffset: number;
  taxOffsets: number;
  taxPayable: number;
};

export type AgePensionProjectionYear = {
  ageEligible: boolean;
  assessableAssets: number;
  deemedIncome: number;
  maximumAnnualRate: number;
  assetsTestAnnualRate: number;
  incomeTestAnnualRate: number;
  annualPayment: number;
  bindingTest: "assets" | "income" | "maximum" | "not-eligible";
};

export type RetirementAccountProjectionDetail = {
  accountId: string;
  openingBalance: number;
  rolloverIn: number;
  rolloverOut: number;
  grossEmployerContribution: number;
  additionalContribution: number;
  contributionStrategyDetails: Array<{
    strategyId: string;
    label: string;
    grossContribution: number;
    contributionTax: number;
    netContribution: number;
  }>;
  rolloverEventDetails: Array<{
    eventId: string;
    label: string;
    rolloverIn: number;
    rolloverOut: number;
  }>;
  lumpSumWithdrawal: number;
  pensionWithdrawalDetails: Array<{
    eventId: string;
    label: string;
    amount: number;
    targetAssetId: string | null;
  }>;
  contributionTax: number;
  netEmployerContribution: number;
  drawdown: number;
  investmentIncome: number;
  investmentGrowth: number;
  investmentTax: number;
  fees: number;
  insurancePremium: number;
  taxPayable: number;
  closingBalance: number;
};

export type CashflowFallbackAllocation = {
  surplusToCash: number;
  surplusToLiability: number;
  shortfallFromCash: number;
  extraAccountBasedPensionDrawdown: number;
  nonSuperInvestmentSale: number;
  debtDrawdown: number;
  unresolvedShortfall: number;
  cashAssetId: string | null;
  surplusTargetAssetId: string | null;
  surplusTargetLiabilityId: string | null;
  accountBasedPensionAccountIds: string[];
  soldAssetIds: string[];
  debtLiabilityId: string | null;
};

export type ProjectionYearResult = {
  year: number;
  ageByPersonId: Record<string, number>;
  cashflowItemValues: Record<string, number>;
  assetSaleEventValues: Record<string, number>;
  assetIncomeValues: Record<string, number>;
  liabilityPaymentEventValues: Record<string, number>;
  liabilityRepaymentValues: Record<string, number>;
  accountBasedPension: number;
  employerSuperContributions: number;
  concessionalContributionsTax: number;
  netEmployerSuperContributions: number;
  employerSuperContributionsByPersonId: Record<string, number>;
  concessionalContributionsTaxByPersonId: Record<string, number>;
  agePension: AgePensionProjectionYear;
  agePensionByPersonId: Record<string, AgePensionProjectionYear>;
  bankInterest: number;
  totalIncome: number;
  expenses: number;
  tax: TaxProjectionYear;
  taxByPersonId: Record<string, TaxProjectionYear>;
  netCashflowBeforeTax: number;
  netCashflowAfterTax: number;
  cashflowFallbackAllocation: CashflowFallbackAllocation;
  cashReserve: number;
  retirementAccountBalances: Record<string, number>;
  retirementAccountDetails: Record<string, RetirementAccountProjectionDetail>;
  assetValues: Record<string, number>;
  liabilityBalances: Record<string, number>;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
};

export type ProjectionResult = {
  scenario: ProjectionScenario;
  assumptions: ProjectionAssumptions;
  years: ProjectionYearResult[];
  audit: Array<{
    code: string;
    message: string;
    severity: "info" | "warning";
  }>;
};
