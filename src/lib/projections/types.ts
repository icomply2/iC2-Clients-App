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

export type ProjectionAsset = {
  assetId: string;
  ownerPersonId: string;
  type: "primary-residence" | "cash" | "funeral-bond" | "personal-asset" | "investment";
  name: string;
  openingValue: number;
  annualIncome?: number;
  growthRateKey: "none" | "cpi" | "cash" | "Defensive" | "Moderate" | "Balanced" | "Growth" | "High Growth";
  centrelink: "assessable" | "exempt" | "financial-asset" | "unknown";
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

export type RetirementAccount = {
  accountId: string;
  ownerPersonId: string;
  accountType: "account-based-pension" | "super-accumulation";
  provider: string;
  productName: string;
  openingBalance: number;
  annualFeeRate?: number;
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
  primaryPersonId: string;
  projectionEnd: {
    type: "life-expectancy";
    personId: string;
  };
  assets: ProjectionAsset[];
  liabilities: ProjectionLiability[];
  retirementAccounts: RetirementAccount[];
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
      seniorsAndPensionersTaxOffset: number;
      lowIncomeTaxOffset: number;
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
  taxOffsets: number;
  taxPayable: number;
};

export type AgePensionProjectionYear = {
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
  contributionTax: number;
  netEmployerContribution: number;
  drawdown: number;
  investmentIncome: number;
  investmentGrowth: number;
  investmentTax: number;
  fees: number;
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
  assetIncomeValues: Record<string, number>;
  liabilityRepaymentValues: Record<string, number>;
  accountBasedPension: number;
  employerSuperContributions: number;
  concessionalContributionsTax: number;
  netEmployerSuperContributions: number;
  employerSuperContributionsByPersonId: Record<string, number>;
  concessionalContributionsTaxByPersonId: Record<string, number>;
  agePension: AgePensionProjectionYear;
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
