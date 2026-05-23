import { currentProjectionAssumptions } from "../src/lib/projections/assumptions";
import { runProjection } from "../src/lib/projections/engine";
import { margaretCurrentScenario } from "../src/lib/projections/fixtures/margaret-current";
import type { ProjectionScenario } from "../src/lib/projections/types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const result = runProjection(margaretCurrentScenario, currentProjectionAssumptions);
const firstYear = result.years[0];
const finalYear = result.years[result.years.length - 1];
const coupleBothEligibleScenario: ProjectionScenario = {
  ...margaretCurrentScenario,
  scenarioId: "couple-both-eligible",
  scenarioName: "Couple both eligible",
  people: [
    {
      ...margaretCurrentScenario.people[0],
      relationshipStatus: "couple",
    },
    {
      personId: "partner",
      name: "Partner Evans",
      role: "partner",
      gender: "male",
      dateOfBirth: "1952-04-12",
      startAge: 74,
      relationshipStatus: "couple",
      isHomeowner: true,
    },
  ],
  assets: margaretCurrentScenario.assets.map((asset) => ({ ...asset, ownerPersonId: "joint" })),
  retirementAccounts: margaretCurrentScenario.retirementAccounts.map((account) => ({ ...account })),
  cashflowItems: margaretCurrentScenario.cashflowItems.map((item) => ({ ...item, ownerPersonId: "joint" })),
};
const coupleOneEligibleScenario: ProjectionScenario = {
  ...coupleBothEligibleScenario,
  scenarioId: "couple-one-eligible",
  scenarioName: "Couple one eligible",
  people: [
    coupleBothEligibleScenario.people[0],
    {
      ...coupleBothEligibleScenario.people[1],
      startAge: 60,
    },
  ],
};
const coupleBothEligibleResult = runProjection(coupleBothEligibleScenario, currentProjectionAssumptions);
const coupleBothEligibleFirstYear = coupleBothEligibleResult.years[0];
const coupleOneEligibleResult = runProjection(coupleOneEligibleScenario, currentProjectionAssumptions);
const coupleOneEligibleFirstYear = coupleOneEligibleResult.years[0];
const superStrategyScenario: ProjectionScenario = {
  ...margaretCurrentScenario,
  scenarioId: "super-strategies",
  scenarioName: "Super strategies",
  people: [
    {
      ...margaretCurrentScenario.people[0],
      personId: "client",
      name: "Client Evans",
      startAge: 60,
      relationshipStatus: "couple",
    },
    {
      personId: "partner",
      name: "Partner Evans",
      role: "partner",
      gender: "male",
      dateOfBirth: "1967-04-12",
      startAge: 59,
      relationshipStatus: "couple",
      isHomeowner: true,
    },
  ],
  primaryPersonId: "client",
  projectionEnd: {
    type: "life-expectancy",
    personId: "client",
  },
  assets: margaretCurrentScenario.assets.map((asset) => ({ ...asset, ownerPersonId: "joint", openingValue: 10000 })),
  liabilities: [],
  retirementAccounts: [
    {
      accountId: "client-super",
      ownerPersonId: "client",
      accountType: "super-accumulation",
      provider: "Client Super",
      productName: "Client Super",
      openingBalance: 100000,
      annualFeeRate: 0,
      annualInsurancePremium: 1200,
      annualContribution: 0,
      annualContributionType: "concessional",
      investmentProfileKey: "Cash",
      annualDrawdown: 0,
      drawdownIndexedToCpi: false,
      taxableToClient: false,
      centrelink: "financial-asset",
    },
    {
      accountId: "client-pension",
      ownerPersonId: "client",
      accountType: "account-based-pension",
      provider: "Client Super",
      productName: "Client Pension",
      openingBalance: 0,
      annualFeeRate: 0,
      annualContribution: 0,
      annualContributionType: "concessional",
      investmentProfileKey: "Cash",
      annualDrawdown: 0,
      drawdownIndexedToCpi: false,
      taxableToClient: false,
      centrelink: "financial-asset",
    },
    {
      accountId: "partner-super",
      ownerPersonId: "partner",
      accountType: "super-accumulation",
      provider: "Partner Super",
      productName: "Partner Super",
      openingBalance: 80000,
      annualFeeRate: 0,
      annualContribution: 0,
      annualContributionType: "concessional",
      investmentProfileKey: "Cash",
      annualDrawdown: 0,
      drawdownIndexedToCpi: false,
      taxableToClient: false,
      centrelink: "financial-asset",
    },
  ],
  superContributionStrategies: [
    {
      strategyId: "client-concessional",
      ownerPersonId: "client",
      targetAccountId: "client-super",
      label: "Client concessional",
      annualAmount: 10000,
      contributionType: "concessional",
      startDate: null,
      endDate: null,
      indexedToCpi: false,
      enabled: true,
    },
    {
      strategyId: "client-non-concessional",
      ownerPersonId: "client",
      targetAccountId: "client-super",
      label: "Client non-concessional",
      annualAmount: 5000,
      contributionType: "non-concessional",
      startDate: null,
      endDate: null,
      indexedToCpi: false,
      enabled: true,
    },
    {
      strategyId: "partner-non-concessional",
      ownerPersonId: "partner",
      targetAccountId: "partner-super",
      label: "Partner non-concessional",
      annualAmount: 7000,
      contributionType: "non-concessional",
      startDate: null,
      endDate: null,
      indexedToCpi: false,
      enabled: true,
    },
  ],
  superRolloverEvents: [
    {
      eventId: "client-partial-rollover",
      label: "Client partial rollover",
      sourceAccountId: "client-super",
      destinationAccountId: "client-pension",
      destinationPensionName: "Client Pension",
      rolloverDate: "2026-07-01",
      amountMode: "fixed-amount",
      fixedAmount: 40000,
      annualDrawdown: 0,
      drawdownIndexedToCpi: false,
      enabled: true,
    },
    {
      eventId: "partner-full-rollover",
      label: "Partner full rollover",
      sourceAccountId: "partner-super",
      destinationAccountId: null,
      destinationPensionName: "Partner Pension",
      rolloverDate: "2026-07-01",
      amountMode: "full-balance",
      fixedAmount: 0,
      annualDrawdown: 0,
      drawdownIndexedToCpi: false,
      enabled: true,
    },
  ],
  cashflowItems: [
    {
      itemId: "client-employment",
      ownerPersonId: "client",
      category: "other-income",
      label: "Client employment income",
      annualAmount: 100000,
      indexedToCpi: false,
      taxable: true,
    },
    {
      itemId: "partner-employment",
      ownerPersonId: "partner",
      category: "other-income",
      label: "Partner employment income",
      annualAmount: 80000,
      indexedToCpi: false,
      taxable: true,
    },
  ],
};
const legacySuperScenario: ProjectionScenario = {
  ...superStrategyScenario,
  scenarioId: "legacy-super",
  scenarioName: "Legacy super",
  retirementAccounts: superStrategyScenario.retirementAccounts.map((account) =>
    account.accountId === "client-super"
      ? {
          ...account,
          annualContribution: 12000,
          annualContributionType: "concessional",
          rolloverToPensionDate: "2026-07-01",
          rolloverPensionName: "Legacy pension",
          rolloverAnnualDrawdown: 0,
          rolloverDrawdownIndexedToCpi: false,
        }
      : account,
  ),
  superContributionStrategies: [],
  superRolloverEvents: [],
};
const superStrategyResult = runProjection(superStrategyScenario, currentProjectionAssumptions);
const superStrategyFirstYear = superStrategyResult.years[0];
const legacySuperResult = runProjection(legacySuperScenario, currentProjectionAssumptions);
const legacySuperFirstYear = legacySuperResult.years[0];
const crossOwnerRolloverScenario: ProjectionScenario = {
  ...superStrategyScenario,
  scenarioId: "cross-owner-rollover",
  scenarioName: "Cross owner rollover",
  superContributionStrategies: [],
  superRolloverEvents: [
    {
      eventId: "cross-owner-rollover-event",
      label: "Invalid cross-owner rollover",
      sourceAccountId: "client-super",
      destinationAccountId: "partner-super-rollover-pension",
      destinationPensionName: "Partner Pension",
      rolloverDate: "2026-07-01",
      amountMode: "full-balance",
      fixedAmount: 0,
      annualDrawdown: 0,
      drawdownIndexedToCpi: false,
      enabled: true,
    },
  ],
};
const crossOwnerRolloverResult = runProjection(crossOwnerRolloverScenario, currentProjectionAssumptions);
const crossOwnerRolloverFirstYear = crossOwnerRolloverResult.years[0];
const assetMovementScenario: ProjectionScenario = {
  ...margaretCurrentScenario,
  scenarioId: "asset-liability-movement",
  scenarioName: "Asset and liability movements",
  people: [
    {
      ...margaretCurrentScenario.people[0],
      startAge: 60,
    },
  ],
  assets: [
    {
      assetId: "home",
      ownerPersonId: "margaret",
      type: "primary-residence",
      name: "Home",
      openingValue: 1000000,
      annualIncome: 0,
      growthRateKey: "none",
      centrelink: "exempt",
      reserveTarget: null,
    },
    {
      assetId: "cash",
      ownerPersonId: "margaret",
      type: "cash",
      name: "Cash",
      openingValue: 10000,
      annualIncome: 0,
      growthRateKey: "none",
      centrelink: "financial-asset",
      reserveTarget: 0,
    },
  ],
  liabilities: [
    {
      liabilityId: "home-loan",
      ownerPersonId: "margaret",
      type: "mortgage",
      name: "Home loan",
      openingBalance: 300000,
      annualInterestRate: 0,
      annualRepayment: 0,
      repaymentTiming: "end-of-year",
    },
  ],
  assetSaleEvents: [
    {
      eventId: "downsize-home",
      label: "Downsize home",
      assetId: "home",
      saleDate: "2026-07-01",
      amountMode: "fixed-amount",
      fixedAmount: 600000,
      targetAssetId: "cash",
      enabled: true,
    },
  ],
  liabilityPaymentEvents: [
    {
      eventId: "pay-home-loan",
      label: "Pay out home loan",
      liabilityId: "home-loan",
      paymentDate: "2026-07-01",
      amountMode: "full-balance",
      fixedAmount: 0,
      sourceAssetId: "cash",
      enabled: true,
    },
  ],
  retirementAccounts: [],
  superContributionStrategies: [],
  superRolloverEvents: [],
  cashflowItems: [],
};
const assetMovementResult = runProjection(assetMovementScenario, currentProjectionAssumptions);
const assetMovementFirstYear = assetMovementResult.years[0];
const pensionWithdrawalScenario: ProjectionScenario = {
  ...margaretCurrentScenario,
  scenarioId: "pension-lump-sum-withdrawal",
  scenarioName: "Pension lump sum withdrawal",
  people: [
    {
      ...margaretCurrentScenario.people[0],
      startAge: 60,
    },
  ],
  assets: [
    {
      assetId: "cash",
      ownerPersonId: "margaret",
      type: "cash",
      name: "Cash",
      openingValue: 10000,
      annualIncome: 0,
      growthRateKey: "none",
      centrelink: "financial-asset",
      reserveTarget: 0,
    },
  ],
  liabilities: [
    {
      liabilityId: "personal-loan",
      ownerPersonId: "margaret",
      type: "personal-loan",
      name: "Personal loan",
      openingBalance: 30000,
      annualInterestRate: 0,
      annualRepayment: 0,
      repaymentTiming: "end-of-year",
    },
  ],
  assetSaleEvents: [],
  liabilityPaymentEvents: [
    {
      eventId: "pay-personal-loan",
      label: "Pay personal loan",
      liabilityId: "personal-loan",
      paymentDate: "2026-07-01",
      amountMode: "full-balance",
      fixedAmount: 0,
      sourceAssetId: "cash",
      enabled: true,
    },
  ],
  retirementAccounts: [
    {
      accountId: "pension",
      ownerPersonId: "margaret",
      accountType: "account-based-pension",
      provider: "Pension Provider",
      productName: "Pension",
      openingBalance: 200000,
      annualFeeRate: 0,
      annualInsurancePremium: 0,
      annualContribution: 0,
      annualContributionType: "concessional",
      investmentProfileKey: "Cash",
      annualDrawdown: 0,
      drawdownIndexedToCpi: false,
      taxableToClient: false,
      centrelink: "financial-asset",
    },
  ],
  superContributionStrategies: [],
  superRolloverEvents: [],
  pensionWithdrawalEvents: [
    {
      eventId: "pension-lump-sum",
      label: "Pension lump sum",
      accountId: "pension",
      withdrawalDate: "2026-07-01",
      amountMode: "fixed-amount",
      fixedAmount: 50000,
      targetAssetId: "cash",
      enabled: true,
    },
  ],
  cashflowItems: [],
};
const pensionWithdrawalResult = runProjection(pensionWithdrawalScenario, currentProjectionAssumptions);
const pensionWithdrawalFirstYear = pensionWithdrawalResult.years[0];
const cgtScenario: ProjectionScenario = {
  ...margaretCurrentScenario,
  scenarioId: "cgt-taxable-sale",
  scenarioName: "CGT taxable sale",
  people: [
    {
      ...margaretCurrentScenario.people[0],
      startAge: 60,
    },
  ],
  assets: [
    {
      assetId: "cash",
      ownerPersonId: "margaret",
      type: "cash",
      name: "Cash",
      openingValue: 0,
      annualIncome: 0,
      growthRateKey: "none",
      centrelink: "financial-asset",
      reserveTarget: 0,
      costBase: 0,
      acquisitionDate: null,
      cgtTreatment: "not-applicable",
    },
    {
      assetId: "portfolio",
      ownerPersonId: "margaret",
      type: "investment",
      name: "Investment portfolio",
      openingValue: 200000,
      annualIncome: 0,
      growthRateKey: "none",
      centrelink: "financial-asset",
      reserveTarget: null,
      costBase: 100000,
      acquisitionDate: "2020-07-01",
      cgtTreatment: "taxable",
    },
  ],
  liabilities: [],
  assetSaleEvents: [
    {
      eventId: "sell-portfolio",
      label: "Sell portfolio",
      assetId: "portfolio",
      saleDate: "2026-07-01",
      amountMode: "full-value",
      fixedAmount: 0,
      targetAssetId: "cash",
      enabled: true,
    },
  ],
  liabilityPaymentEvents: [],
  retirementAccounts: [],
  superContributionStrategies: [],
  superRolloverEvents: [],
  pensionWithdrawalEvents: [],
  cashflowItems: [],
};
const partialCgtScenario: ProjectionScenario = {
  ...cgtScenario,
  scenarioId: "partial-cgt-sale",
  scenarioName: "Partial CGT sale",
  assetSaleEvents: [
    {
      ...cgtScenario.assetSaleEvents[0],
      amountMode: "fixed-amount",
      fixedAmount: 100000,
    },
  ],
};
const lossCarryForwardScenario: ProjectionScenario = {
  ...cgtScenario,
  scenarioId: "loss-carry-forward",
  scenarioName: "Loss carry forward",
  assets: [
    cgtScenario.assets[0],
    {
      ...cgtScenario.assets[1],
      assetId: "loss-asset",
      name: "Loss asset",
      openingValue: 100000,
      costBase: 150000,
      acquisitionDate: null,
    },
    {
      ...cgtScenario.assets[1],
      assetId: "gain-asset",
      name: "Gain asset",
      openingValue: 200000,
      costBase: 100000,
      acquisitionDate: null,
    },
  ],
  assetSaleEvents: [
    {
      eventId: "sell-loss-asset",
      label: "Sell loss asset",
      assetId: "loss-asset",
      saleDate: "2026-07-01",
      amountMode: "full-value",
      fixedAmount: 0,
      targetAssetId: "cash",
      enabled: true,
    },
    {
      eventId: "sell-gain-asset",
      label: "Sell gain asset",
      assetId: "gain-asset",
      saleDate: "2027-07-01",
      amountMode: "full-value",
      fixedAmount: 0,
      targetAssetId: "cash",
      enabled: true,
    },
  ],
};
const mainResidenceCgtScenario: ProjectionScenario = {
  ...cgtScenario,
  scenarioId: "main-residence-exempt",
  scenarioName: "Main residence exempt",
  assets: [
    cgtScenario.assets[0],
    {
      ...cgtScenario.assets[1],
      assetId: "home",
      type: "primary-residence",
      name: "Home",
      openingValue: 1000000,
      costBase: 400000,
      cgtTreatment: "main-residence-exempt",
      centrelink: "exempt",
    },
  ],
  assetSaleEvents: [
    {
      ...cgtScenario.assetSaleEvents[0],
      eventId: "sell-home",
      assetId: "home",
    },
  ],
};
const loanTaxScenario: ProjectionScenario = {
  ...cgtScenario,
  scenarioId: "loan-tax",
  scenarioName: "Loan tax",
  assets: [cgtScenario.assets[0]],
  assetSaleEvents: [],
  liabilities: [
    {
      liabilityId: "investment-loan",
      ownerPersonId: "margaret",
      type: "mortgage",
      name: "Investment loan",
      openingBalance: 100000,
      annualInterestRate: 0.1,
      annualRepayment: 20000,
      repaymentTiming: "end-of-year",
      repaymentType: "principal-and-interest",
      interestDeductible: true,
    },
    {
      liabilityId: "interest-only-loan",
      ownerPersonId: "margaret",
      type: "mortgage",
      name: "Interest only loan",
      openingBalance: 100000,
      annualInterestRate: 0.1,
      annualRepayment: 0,
      repaymentTiming: "end-of-year",
      repaymentType: "interest-only",
      interestDeductible: false,
    },
  ],
  cashflowItems: [
    {
      itemId: "salary",
      ownerPersonId: "margaret",
      category: "other-income",
      label: "Salary",
      annualAmount: 100000,
      indexedToCpi: false,
      taxable: true,
    },
  ],
};
const downsizeScenario: ProjectionScenario = {
  ...cgtScenario,
  scenarioId: "future-downsize",
  scenarioName: "Future downsize",
  assets: [
    {
      ...cgtScenario.assets[0],
      openingValue: 0,
    },
    {
      ...mainResidenceCgtScenario.assets[1],
      assetId: "old-home",
      name: "Old home",
      openingValue: 1000000,
      costBase: 400000,
    },
    {
      ...mainResidenceCgtScenario.assets[1],
      assetId: "new-home",
      name: "New home",
      openingValue: 0,
      costBase: 0,
    },
  ],
  assetSaleEvents: [
    {
      eventId: "sell-old-home",
      label: "Sell old home",
      assetId: "old-home",
      saleDate: "2031-07-01",
      amountMode: "full-value",
      fixedAmount: 0,
      targetAssetId: "cash",
      enabled: true,
    },
  ],
  assetPurchaseEvents: [
    {
      eventId: "buy-new-home",
      label: "Buy new home",
      assetId: "new-home",
      purchaseDate: "2031-07-01",
      amount: 700000,
      sourceAssetId: "cash",
      enabled: true,
    },
  ],
};
const newBuyerScenario: ProjectionScenario = {
  ...downsizeScenario,
  scenarioId: "future-new-buyer",
  scenarioName: "Future new buyer",
  assets: [
    cgtScenario.assets[0],
    {
      ...mainResidenceCgtScenario.assets[1],
      assetId: "first-home",
      name: "First home",
      openingValue: 0,
      costBase: 0,
    },
  ],
  liabilities: [
    {
      liabilityId: "new-home-loan",
      ownerPersonId: "margaret",
      type: "mortgage",
      name: "New home loan",
      openingBalance: 0,
      annualInterestRate: 0.06,
      annualRepayment: 0,
      repaymentTiming: "end-of-year",
      repaymentType: "interest-only",
      interestDeductible: false,
    },
  ],
  assetSaleEvents: [],
  liabilityDrawdownEvents: [
    {
      eventId: "draw-new-loan",
      label: "Draw new loan",
      liabilityId: "new-home-loan",
      drawdownDate: "2031-07-01",
      amount: 800000,
      targetAssetId: "cash",
      enabled: true,
    },
  ],
  assetPurchaseEvents: [
    {
      eventId: "buy-first-home",
      label: "Buy first home",
      assetId: "first-home",
      purchaseDate: "2031-07-01",
      amount: 800000,
      sourceAssetId: "cash",
      enabled: true,
    },
  ],
};
const cgtResult = runProjection(cgtScenario, currentProjectionAssumptions);
const partialCgtResult = runProjection(partialCgtScenario, currentProjectionAssumptions);
const lossCarryForwardResult = runProjection(lossCarryForwardScenario, currentProjectionAssumptions);
const mainResidenceCgtResult = runProjection(mainResidenceCgtScenario, currentProjectionAssumptions);
const loanTaxResult = runProjection(loanTaxScenario, currentProjectionAssumptions);
const downsizeResult = runProjection(downsizeScenario, currentProjectionAssumptions);
const newBuyerResult = runProjection(newBuyerScenario, currentProjectionAssumptions);

assert(result.years.length > 10, "Projection should run through life expectancy.");
assert(Boolean(finalYear), "Projection should have a final year.");
assert(firstYear.agePension.annualPayment >= 0, "Age Pension must not be negative.");
assert(firstYear.agePension.assessableAssets > 0, "Age Pension should calculate assessable assets.");
assert(firstYear.agePensionByPersonId.margaret.annualPayment === firstYear.agePension.annualPayment, "Single household pension should match the person result.");
assert(firstYear.tax.taxableAgePension === firstYear.agePension.annualPayment, "Age Pension should flow into taxable income.");
assert(firstYear.tax.taxableIncome >= firstYear.tax.taxableBankInterest, "Taxable income should include taxable bank interest.");
assert(firstYear.tax.taxableIncome >= firstYear.tax.taxableAgePension, "Taxable income should include taxable Age Pension.");
assert(firstYear.tax.lowIncomeTaxOffset > 0, "LITO should be calculated for low income pension scenarios.");
assert(firstYear.tax.seniorsAndPensionersTaxOffset > 0, "SAPTO should be calculated for eligible pension scenarios.");
assert(firstYear.tax.taxPayable >= 0, "Tax payable must not be negative.");
assert(firstYear.cashReserve >= 0, "Cash reserve must not be negative.");
assert(firstYear.totalAssets >= firstYear.cashReserve, "Total assets should include cash reserve.");
assert(finalYear?.netWorth !== undefined && finalYear.netWorth > 0, "Final net worth should remain calculable.");
assert(
  Math.round(coupleBothEligibleFirstYear.agePension.annualPayment) ===
    Math.round(
      coupleBothEligibleFirstYear.agePensionByPersonId.margaret.annualPayment +
        coupleBothEligibleFirstYear.agePensionByPersonId.partner.annualPayment,
    ),
  "Couple household pension should equal the sum of person-level payments.",
);
assert(coupleBothEligibleFirstYear.agePensionByPersonId.margaret.annualPayment > 0, "Eligible client should receive Age Pension.");
assert(coupleBothEligibleFirstYear.agePensionByPersonId.partner.annualPayment > 0, "Eligible partner should receive Age Pension.");
assert(coupleOneEligibleFirstYear.agePensionByPersonId.margaret.annualPayment > 0, "One eligible couple should pay the eligible client.");
assert(coupleOneEligibleFirstYear.agePensionByPersonId.partner.annualPayment === 0, "Under-age partner should not receive Age Pension.");
assert(
  coupleOneEligibleFirstYear.agePension.annualPayment === coupleOneEligibleFirstYear.agePensionByPersonId.margaret.annualPayment,
  "One eligible couple household pension should equal the eligible person's payment.",
);
assert(
  superStrategyFirstYear.retirementAccountDetails["client-super"].contributionStrategyDetails.length === 2,
  "Multiple contribution strategies should be tracked against one account.",
);
assert(
  superStrategyFirstYear.retirementAccountDetails["client-super"].additionalContribution === 15000,
  "Multiple contribution strategies should sum into additional contributions.",
);
assert(
  superStrategyFirstYear.retirementAccountDetails["client-super"].contributionTax === 3300,
  "Concessional SG and concessional strategy amounts should incur contributions tax.",
);
assert(
  superStrategyFirstYear.retirementAccountDetails["client-super"].insurancePremium === 1200,
  "Super insurance premiums should be deducted from the account projection.",
);
assert(
  superStrategyFirstYear.retirementAccountDetails["partner-super"].additionalContribution === 7000,
  "Contribution strategies should target separate partner accounts.",
);
assert(superStrategyFirstYear.expenses >= 22000, "Personal super contribution strategies should flow through cashflow expenses.");
assert(
  superStrategyFirstYear.retirementAccountDetails["partner-super"].contributionStrategyDetails[0]?.contributionTax === 0,
  "Non-concessional strategy contributions should not incur contributions tax.",
);
assert(
  superStrategyFirstYear.retirementAccountDetails["client-super"].rolloverOut === 40000 &&
    superStrategyFirstYear.retirementAccountDetails["client-pension"].rolloverIn === 40000,
  "Partial rollover should move a fixed amount from super to pension.",
);
assert(
  superStrategyFirstYear.retirementAccountDetails["partner-super"].rolloverOut === 80000 &&
    superStrategyFirstYear.retirementAccountDetails["partner-super-rollover-pension"].rolloverIn === 80000,
  "Full rollover should create and fund the destination pension account.",
);
assert(
  legacySuperFirstYear.retirementAccountDetails["client-super"].additionalContribution === 12000,
  "Legacy account-level contributions should migrate into contribution strategy behaviour.",
);
assert(
  legacySuperFirstYear.retirementAccountDetails["client-super"].rolloverOut === 100000,
  "Legacy account-level rollover settings should migrate into rollover event behaviour.",
);
assert(
  crossOwnerRolloverFirstYear.retirementAccountDetails["client-super"].rolloverOut === 0,
  "Cross-owner super-to-pension rollovers should not be applied.",
);
assert(assetMovementFirstYear.assetSaleEventValues["downsize-home"] === 600000, "Asset sale events should record sale proceeds.");
assert(
  assetMovementFirstYear.liabilityPaymentEventValues["pay-home-loan"] === 300000,
  "Liability payment events should record loan payouts.",
);
assert(assetMovementFirstYear.assetValues.home === 400000, "Asset sale should reduce the source asset value.");
assert(assetMovementFirstYear.assetValues.cash === 310000, "Asset sale proceeds less liability payment should remain in cash.");
assert(assetMovementFirstYear.liabilityBalances["home-loan"] === 0, "Liability payment should reduce the liability balance.");
assert(
  pensionWithdrawalFirstYear.retirementAccountDetails.pension.lumpSumWithdrawal === 50000,
  "Pension lump sum withdrawals should be tracked against the pension account.",
);
assert(
  pensionWithdrawalFirstYear.retirementAccountDetails.pension.pensionWithdrawalDetails[0]?.amount === 50000,
  "Pension lump sum withdrawal details should retain the event amount.",
);
assert(
  pensionWithdrawalFirstYear.liabilityPaymentEventValues["pay-personal-loan"] === 30000,
  "Pension lump sum withdrawals should be available for same-year liability payments.",
);
assert(
  pensionWithdrawalFirstYear.cashReserve >= 30000,
  "Pension lump sum withdrawals should leave remaining funds in cash reserves.",
);
assert(
  pensionWithdrawalFirstYear.retirementAccountBalances.pension < 150000,
  "Pension lump sum withdrawals should reduce the pension account before annual projection.",
);
assert(
  Math.round(cgtResult.years[0].assetSaleEventCgtDetails["sell-portfolio"].costBaseUsed) === 100000,
  "CGT should use the asset cost base on a full sale.",
);
assert(
  Math.round(cgtResult.years[0].taxableCapitalGainsByPersonId.margaret) === 50000,
  "CGT should apply the 50% discount where the asset was held for at least 12 months.",
);
assert(
  Math.round(partialCgtResult.years[0].assetSaleEventCgtDetails["sell-portfolio"].costBaseUsed) === 50000,
  "Partial asset sales should allocate cost base proportionally.",
);
assert(
  Math.round(partialCgtResult.years[0].assetCostBases.portfolio) === 50000,
  "Partial asset sales should reduce the remaining cost base.",
);
assert(
  Math.round(partialCgtResult.years[0].taxableCapitalGainsByPersonId.margaret) === 25000,
  "Partial asset sales should calculate discounted taxable capital gains on the sold parcel.",
);
assert(
  Math.round(lossCarryForwardResult.years[0].carriedForwardCapitalLossesByPersonId.margaret) === 50000,
  "Capital losses should carry forward when there are no same-year gains.",
);
assert(
  Math.round(lossCarryForwardResult.years[1].taxableCapitalGainsByPersonId.margaret) === 50000,
  "Carried-forward capital losses should reduce a later capital gain.",
);
assert(
  mainResidenceCgtResult.years[0].taxableCapitalGainsByPersonId.margaret === 0,
  "Main residence exempt sales should not create taxable capital gains.",
);
assert(
  Math.round(loanTaxResult.years[0].liabilityInterestValues["investment-loan"]) === 10000,
  "Loan interest should be calculated separately from principal repayments.",
);
assert(
  Math.round(loanTaxResult.years[0].deductibleInterestByPersonId.margaret) === 10000,
  "Deductible loan interest should be allocated to the liability owner.",
);
assert(
  Math.round(loanTaxResult.years[0].taxByPersonId.margaret.taxableIncome) === 90000,
  "Deductible loan interest should reduce taxable income for the year.",
);
assert(
  Math.round(loanTaxResult.years[1].liabilityBalances["investment-loan"]) === 90000,
  "Principal-and-interest repayments should reduce the projected loan balance.",
);
assert(
  Math.round(loanTaxResult.years[1].liabilityBalances["interest-only-loan"]) === 100000,
  "Interest-only loans should keep principal unchanged unless a payment event occurs.",
);
assert(
  Math.round(downsizeResult.years[5].assetSaleEventValues["sell-old-home"]) === 1000000 &&
    Math.round(downsizeResult.years[5].assetPurchaseEventValues["buy-new-home"]) === 700000,
  "Future downsizing should sell the old home and purchase the replacement home in the selected year.",
);
assert(
  Math.round(downsizeResult.years[5].assetValues.cash) === 300000 &&
    Math.round(downsizeResult.years[5].assetValues["new-home"]) === 700000,
  "Future downsizing should leave sale proceeds after the replacement purchase in cash.",
);
assert(
  Math.round(newBuyerResult.years[5].liabilityDrawdownEventValues["draw-new-loan"]) === 800000 &&
    Math.round(newBuyerResult.years[5].assetPurchaseEventValues["buy-first-home"]) === 800000,
  "Future new-buyer scenarios should support loan drawdowns funding a home purchase.",
);
assert(
  Math.round(newBuyerResult.years[5].liabilityBalances["new-home-loan"]) === 800000 &&
    Math.round(newBuyerResult.years[5].assetValues["first-home"]) === 800000,
  "Future loan drawdown and purchase events should update projected liabilities and assets.",
);

console.log(
  JSON.stringify(
    {
      years: result.years.length,
      firstYearAgePension: Math.round(firstYear.agePension.annualPayment),
      firstYearTaxableAgePension: Math.round(firstYear.tax.taxableAgePension),
      coupleBothEligibleAgePension: Math.round(coupleBothEligibleFirstYear.agePension.annualPayment),
      coupleOneEligibleAgePension: Math.round(coupleOneEligibleFirstYear.agePension.annualPayment),
      clientSuperStrategyContribution: Math.round(superStrategyFirstYear.retirementAccountDetails["client-super"].additionalContribution),
      clientSuperPartialRollover: Math.round(superStrategyFirstYear.retirementAccountDetails["client-super"].rolloverOut),
      assetSaleProceeds: Math.round(assetMovementFirstYear.assetSaleEventValues["downsize-home"]),
      liabilityPayment: Math.round(assetMovementFirstYear.liabilityPaymentEventValues["pay-home-loan"]),
      pensionLumpSumWithdrawal: Math.round(pensionWithdrawalFirstYear.retirementAccountDetails.pension.lumpSumWithdrawal),
      taxableCapitalGain: Math.round(cgtResult.years[0].taxableCapitalGainsByPersonId.margaret),
      deductibleInterest: Math.round(loanTaxResult.years[0].deductibleInterestByPersonId.margaret),
      downsizeCash: Math.round(downsizeResult.years[5].assetValues.cash),
      firstYearTaxPayable: Math.round(firstYear.tax.taxPayable),
      finalYear: finalYear?.year,
      finalCashReserve: Math.round(finalYear?.cashReserve ?? 0),
    },
    null,
    2,
  ),
);
