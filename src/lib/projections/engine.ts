import { getAssetGrowthRate, isCashAssetType, isInvestmentAssetType, projectAssetValue, sumAssessableAssets, sumFinancialAssets } from "./assets-engine";
import { calculateHouseholdAgePension } from "./centrelink-engine";
import {
  calculateLiabilityInterest,
  calculateLiabilityPrincipalRepayment,
  calculateLiabilityRepayment,
  projectLiabilityBalance,
} from "./liabilities-engine";
import { projectRetirementAccount } from "./retirement-engine";
import { calculatePersonalTax } from "./tax-engine";
import type { ProjectionAssumptions, ProjectionResult, ProjectionScenario, ProjectionYearResult } from "./types";

const JOINT_OWNER_ID = "joint";

function getProjectionEndAge(scenario: ProjectionScenario, assumptions: ProjectionAssumptions) {
  const person = scenario.people.find((entry) => entry.personId === scenario.projectionEnd.personId);

  if (!person) {
    throw new Error("Projection end person was not found in the scenario.");
  }

  const ageEntry = assumptions.economic.lifeExpectancy.find((entry) => entry.age === Math.floor(person.startAge));
  const expectedAge =
    person.gender === "female"
      ? ageEntry?.femaleExpectedAge
      : person.gender === "male"
        ? ageEntry?.maleExpectedAge
        : undefined;

  return Math.floor(expectedAge ?? (person.gender === "male" ? 85 : person.gender === "female" ? 88 : 86));
}

function inflate(value: number, rate: number, yearIndex: number) {
  return value * (1 + rate) ** yearIndex;
}

function dateToMonthIndex(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!match) return null;

  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

function getProjectionPeriodMonthRange(scenario: ProjectionScenario, yearIndex: number) {
  const periodStart = (scenario.startYear + yearIndex) * 12 + scenario.startMonth - 1;
  return {
    periodStart,
    periodEnd: periodStart + 11,
  };
}

function getCashflowActiveFraction(
  item: ProjectionScenario["cashflowItems"][number],
  scenario: ProjectionScenario,
  yearIndex: number,
) {
  const { periodStart, periodEnd } = getProjectionPeriodMonthRange(scenario, yearIndex);
  const itemStart = dateToMonthIndex(item.startDate) ?? periodStart;
  const itemEnd = dateToMonthIndex(item.endDate) ?? periodEnd;
  const activeStart = Math.max(periodStart, itemStart);
  const activeEnd = Math.min(periodEnd, itemEnd);

  if (activeEnd < activeStart) {
    return 0;
  }

  return (activeEnd - activeStart + 1) / 12;
}

function getCashflowItemValue(
  item: ProjectionScenario["cashflowItems"][number],
  scenario: ProjectionScenario,
  yearIndex: number,
  assumptions: ProjectionAssumptions,
) {
  const activeFraction = getCashflowActiveFraction(item, scenario, yearIndex);
  if (activeFraction <= 0) {
    return 0;
  }

  return inflate(item.annualAmount, assumptions.economic.cpiRate, item.indexedToCpi ? yearIndex : 0) * activeFraction;
}

function sumValues(values: Record<string, number>) {
  return Object.values(values).reduce((total, value) => total + value, 0);
}

function sumTaxProjectionYears(taxYears: ProjectionYearResult["taxByPersonId"]): ProjectionYearResult["tax"] {
  return Object.values(taxYears).reduce(
    (total, taxYear) => ({
      taxableAgePension: total.taxableAgePension + taxYear.taxableAgePension,
      taxableBankInterest: total.taxableBankInterest + taxYear.taxableBankInterest,
      taxableOtherIncome: total.taxableOtherIncome + taxYear.taxableOtherIncome,
      taxableCapitalGains: total.taxableCapitalGains + taxYear.taxableCapitalGains,
      deductibleInterest: total.deductibleInterest + taxYear.deductibleInterest,
      taxFreeAccountBasedPension: total.taxFreeAccountBasedPension + taxYear.taxFreeAccountBasedPension,
      taxableIncome: total.taxableIncome + taxYear.taxableIncome,
      grossTax: total.grossTax + taxYear.grossTax,
      medicareLevy: total.medicareLevy + taxYear.medicareLevy,
      lowIncomeTaxOffset: total.lowIncomeTaxOffset + taxYear.lowIncomeTaxOffset,
      seniorsAndPensionersTaxOffset: total.seniorsAndPensionersTaxOffset + taxYear.seniorsAndPensionersTaxOffset,
      taxOffsets: total.taxOffsets + taxYear.taxOffsets,
      taxPayable: total.taxPayable + taxYear.taxPayable,
    }),
    {
      taxableAgePension: 0,
      taxableBankInterest: 0,
      taxableOtherIncome: 0,
      taxableCapitalGains: 0,
      deductibleInterest: 0,
      taxFreeAccountBasedPension: 0,
      taxableIncome: 0,
      grossTax: 0,
      medicareLevy: 0,
      lowIncomeTaxOffset: 0,
      seniorsAndPensionersTaxOffset: 0,
      taxOffsets: 0,
      taxPayable: 0,
    },
  );
}

function getCashAssetId(scenario: ProjectionScenario) {
  return scenario.assets.find((asset) => isCashAssetType(asset.type))?.assetId ?? null;
}

function getCashAssetIdForOwner(scenario: ProjectionScenario, ownerPersonId: string, preferredAssetId?: string | null) {
  const preferredAsset = scenario.assets.find((asset) => asset.assetId === preferredAssetId && isCashAssetType(asset.type));
  if (preferredAsset) {
    return preferredAsset.assetId;
  }

  return (
    scenario.assets.find((asset) => isCashAssetType(asset.type) && asset.ownerPersonId === ownerPersonId)?.assetId ??
    scenario.assets.find((asset) => isCashAssetType(asset.type) && asset.ownerPersonId === JOINT_OWNER_ID)?.assetId ??
    getCashAssetId(scenario)
  );
}

function getDebtFallbackLiabilityId(scenario: ProjectionScenario) {
  return (
    scenario.liabilities.find((liability) => liability.type === "credit-card" || liability.type === "personal-loan")?.liabilityId ??
    scenario.liabilities.find((liability) => liability.type === "other")?.liabilityId ??
    null
  );
}

function getOwnerPersonIds(scenario: ProjectionScenario, ownerPersonId: string) {
  if (ownerPersonId !== JOINT_OWNER_ID) {
    return [ownerPersonId];
  }

  const householdPeople = scenario.people.filter((person) => person.role === "client" || person.role === "partner");
  return householdPeople.length ? householdPeople.map((person) => person.personId) : [scenario.primaryPersonId];
}

function allocateAmountByOwner(
  scenario: ProjectionScenario,
  values: Record<string, number>,
  ownerPersonId: string,
  amount: number,
) {
  const ownerPersonIds = getOwnerPersonIds(scenario, ownerPersonId);
  const splitAmount = amount / ownerPersonIds.length;

  ownerPersonIds.forEach((personId) => {
    values[personId] = (values[personId] ?? 0) + splitAmount;
  });
}

function getEmploymentIncomeByPersonId(scenario: ProjectionScenario, yearIndex: number, assumptions: ProjectionAssumptions) {
  return scenario.cashflowItems
    .filter((item) => item.category === "other-income" && item.taxable && /employment|salary|wage/i.test(item.label))
    .reduce<Record<string, number>>((incomeByPersonId, item) => {
      const annualAmount = getCashflowItemValue(item, scenario, yearIndex, assumptions);

      allocateAmountByOwner(scenario, incomeByPersonId, item.ownerPersonId, annualAmount);
      return incomeByPersonId;
    }, {});
}

function calculateEmployerSuperByPersonId(
  taxableIncomeByPersonId: Record<string, number>,
  assumptions: ProjectionAssumptions,
) {
  const superAssumptions = assumptions.legislative.superannuation;
  const annualMaximumContributionBase = superAssumptions.maximumContributionBaseQuarterly * 4;

  return Object.fromEntries(
    Object.entries(taxableIncomeByPersonId).map(([personId, income]) => {
      const uncappedContribution = Math.min(income, annualMaximumContributionBase) * superAssumptions.superGuaranteeRate;
      const contribution = Math.min(uncappedContribution, superAssumptions.concessionalContributionsCap);
      const contributionTax = contribution * superAssumptions.contributionsTaxRate;

      return [
        personId,
        {
          grossContribution: contribution,
          contributionTax,
          netContribution: contribution - contributionTax,
        },
      ];
    }),
  );
}

function getSurplusAllocationTarget(scenario: ProjectionScenario, cashAssetId: string | null) {
  const configuredTarget = scenario.cashflowAllocation?.surplusTarget ?? null;

  if (
    configuredTarget?.targetType === "cash-asset" &&
    scenario.assets.some((asset) => asset.assetId === configuredTarget.targetId)
  ) {
    return configuredTarget;
  }

  if (
    configuredTarget?.targetType === "liability" &&
    scenario.liabilities.some((liability) => liability.liabilityId === configuredTarget.targetId)
  ) {
    return configuredTarget;
  }

  return cashAssetId ? { targetType: "cash-asset" as const, targetId: cashAssetId } : null;
}

function getContributionTargetAccountId(scenario: ProjectionScenario, personId: string) {
  return scenario.retirementAccounts.find(
    (account) => account.ownerPersonId === personId && account.accountType === "super-accumulation",
  )?.accountId ?? null;
}

function getRolloverPensionAccountId(accountId: string) {
  return `${accountId}-rollover-pension`;
}

function getDatedActiveFraction(input: {
  startDate?: string | null;
  endDate?: string | null;
  scenario: ProjectionScenario;
  yearIndex: number;
}) {
  const { periodStart, periodEnd } = getProjectionPeriodMonthRange(input.scenario, input.yearIndex);
  const itemStart = dateToMonthIndex(input.startDate) ?? periodStart;
  const itemEnd = dateToMonthIndex(input.endDate) ?? periodEnd;
  const activeStart = Math.max(periodStart, itemStart);
  const activeEnd = Math.min(periodEnd, itemEnd);

  if (activeEnd < activeStart) {
    return 0;
  }

  return (activeEnd - activeStart + 1) / 12;
}

function getSuperContributionStrategies(scenario: ProjectionScenario) {
  const configuredStrategies = scenario.superContributionStrategies ?? [];

  if (configuredStrategies.length) {
    return configuredStrategies;
  }

  return scenario.retirementAccounts
    .filter((account) => account.accountType === "super-accumulation" && (account.annualContribution ?? 0) > 0)
    .map((account) => ({
      strategyId: `${account.accountId}-legacy-additional-contribution`,
      ownerPersonId: account.ownerPersonId,
      targetAccountId: account.accountId,
      label: "Additional contributions",
      annualAmount: account.annualContribution ?? 0,
      contributionType: account.annualContributionType ?? "concessional",
      startDate: null,
      endDate: null,
      indexedToCpi: false,
      enabled: true,
    }));
}

function getSuperRolloverEvents(scenario: ProjectionScenario) {
  const configuredEvents = scenario.superRolloverEvents ?? [];

  if (configuredEvents.length) {
    return configuredEvents;
  }

  return scenario.retirementAccounts
    .filter((account) => account.accountType === "super-accumulation" && account.rolloverToPensionDate)
    .map((account) => ({
      eventId: `${account.accountId}-legacy-rollover`,
      label: "Rollover to pension",
      sourceAccountId: account.accountId,
      destinationAccountId: null,
      destinationPensionName: account.rolloverPensionName?.trim() || `${account.productName} pension`,
      rolloverDate: account.rolloverToPensionDate ?? null,
      amountMode: "full-balance" as const,
      fixedAmount: 0,
      annualDrawdown: account.rolloverAnnualDrawdown ?? 0,
      drawdownIndexedToCpi: account.rolloverDrawdownIndexedToCpi ?? false,
      enabled: true,
    }));
}

function getRolloverDestinationAccountId(event: ReturnType<typeof getSuperRolloverEvents>[number]) {
  return event.destinationAccountId?.trim() || getRolloverPensionAccountId(event.sourceAccountId);
}

function createRolloverPensionAccount(
  event: ReturnType<typeof getSuperRolloverEvents>[number],
  sourceAccount: ProjectionScenario["retirementAccounts"][number],
) {
  return {
    ...sourceAccount,
    accountId: getRolloverDestinationAccountId(event),
    accountType: "account-based-pension" as const,
    productName: event.destinationPensionName?.trim() || `${sourceAccount.productName} pension`,
    openingBalance: 0,
    annualInsurancePremium: 0,
    annualContribution: 0,
    annualContributionType: "concessional" as const,
    rolloverToPensionDate: null,
    rolloverPensionName: null,
    rolloverAnnualDrawdown: 0,
    rolloverDrawdownIndexedToCpi: false,
    annualDrawdown: event.annualDrawdown ?? 0,
    drawdownIndexedToCpi: event.drawdownIndexedToCpi ?? false,
    taxableToClient: false,
  };
}

function getAssetCgtTreatment(asset: ProjectionScenario["assets"][number]): NonNullable<ProjectionScenario["assets"][number]["cgtTreatment"]> {
  if (asset.cgtTreatment) {
    return asset.cgtTreatment;
  }

  if (asset.type === "primary-residence") {
    return "main-residence-exempt";
  }

  if (isCashAssetType(asset.type)) {
    return "not-applicable";
  }

  if (asset.type === "home-contents" || asset.type === "motor-vehicle" || asset.type === "personal-asset") {
    return "personal-use-exempt";
  }

  return "taxable";
}

function isCgtDiscountEligible(acquisitionDate: string | null | undefined, saleDate: string | null | undefined) {
  const acquisitionMonthIndex = dateToMonthIndex(acquisitionDate);
  const saleMonthIndex = dateToMonthIndex(saleDate);

  return acquisitionMonthIndex !== null && saleMonthIndex !== null && saleMonthIndex - acquisitionMonthIndex >= 12;
}

function emptyPersonValues(scenario: ProjectionScenario) {
  return Object.fromEntries(scenario.people.map((person) => [person.personId, 0]));
}

function calculateTaxableCapitalGains(input: {
  scenario: ProjectionScenario;
  grossNonDiscountableGainsByPersonId: Record<string, number>;
  grossDiscountableGainsByPersonId: Record<string, number>;
  capitalLossesByPersonId: Record<string, number>;
  carriedForwardCapitalLossesByPersonId: Record<string, number>;
}) {
  const taxableCapitalGainsByPersonId = emptyPersonValues(input.scenario);
  const nextCarriedForwardCapitalLossesByPersonId = emptyPersonValues(input.scenario);
  const carriedForwardLossAppliedByPersonId = emptyPersonValues(input.scenario);
  const discountAppliedByPersonId = emptyPersonValues(input.scenario);

  input.scenario.people.forEach((person) => {
    const personId = person.personId;
    const nonDiscountableGains = input.grossNonDiscountableGainsByPersonId[personId] ?? 0;
    const discountableGains = input.grossDiscountableGainsByPersonId[personId] ?? 0;
    const availableLosses =
      (input.carriedForwardCapitalLossesByPersonId[personId] ?? 0) + (input.capitalLossesByPersonId[personId] ?? 0);
    const lossesAgainstNonDiscountable = Math.min(nonDiscountableGains, availableLosses);
    const lossesAfterNonDiscountable = availableLosses - lossesAgainstNonDiscountable;
    const lossesAgainstDiscountable = Math.min(discountableGains, lossesAfterNonDiscountable);
    const remainingNonDiscountableGains = nonDiscountableGains - lossesAgainstNonDiscountable;
    const remainingDiscountableGains = discountableGains - lossesAgainstDiscountable;
    const discount = remainingDiscountableGains * 0.5;

    taxableCapitalGainsByPersonId[personId] = remainingNonDiscountableGains + remainingDiscountableGains - discount;
    nextCarriedForwardCapitalLossesByPersonId[personId] = Math.max(lossesAfterNonDiscountable - lossesAgainstDiscountable, 0);
    carriedForwardLossAppliedByPersonId[personId] = lossesAgainstNonDiscountable + lossesAgainstDiscountable;
    discountAppliedByPersonId[personId] = discount;
  });

  return {
    taxableCapitalGainsByPersonId,
    nextCarriedForwardCapitalLossesByPersonId,
    carriedForwardLossAppliedByPersonId,
    discountAppliedByPersonId,
  };
}

export function runProjection(scenario: ProjectionScenario, assumptions: ProjectionAssumptions): ProjectionResult {
  const primaryPerson = scenario.people.find((person) => person.personId === scenario.primaryPersonId);

  if (!primaryPerson) {
    throw new Error("Primary person was not found in the scenario.");
  }

  const projectionEndAge = getProjectionEndAge(scenario, assumptions);
  const yearCount = projectionEndAge - Math.floor(primaryPerson.startAge) + 1;
  const cashAssetId = getCashAssetId(scenario);
  const debtFallbackLiabilityId = getDebtFallbackLiabilityId(scenario);
  let previousAssetValues = Object.fromEntries(scenario.assets.map((asset) => [asset.assetId, asset.openingValue]));
  let previousAssetCostBases = Object.fromEntries(
    scenario.assets.map((asset) => [asset.assetId, asset.costBase ?? asset.openingValue]),
  );
  let previousLiabilityBalances = Object.fromEntries(
    scenario.liabilities.map((liability) => [liability.liabilityId, liability.openingBalance]),
  );
  let carriedForwardCapitalLossesByPersonId = emptyPersonValues(scenario);
  const superContributionStrategies = getSuperContributionStrategies(scenario);
  const superRolloverEvents = getSuperRolloverEvents(scenario);
  const assetSaleEvents = scenario.assetSaleEvents ?? [];
  const assetPurchaseEvents = scenario.assetPurchaseEvents ?? [];
  const liabilityDrawdownEvents = scenario.liabilityDrawdownEvents ?? [];
  const liabilityPaymentEvents = scenario.liabilityPaymentEvents ?? [];
  const pensionWithdrawalEvents = scenario.pensionWithdrawalEvents ?? [];
  const rolloverPensionAccounts = superRolloverEvents
    .filter((event) => event.enabled && event.rolloverDate)
    .map((event) => {
      const sourceAccount = scenario.retirementAccounts.find((account) => account.accountId === event.sourceAccountId);
      const destinationAccountId = getRolloverDestinationAccountId(event);
      const existingDestination = scenario.retirementAccounts.find((account) => account.accountId === destinationAccountId);

      if (!sourceAccount || existingDestination || event.destinationAccountId?.trim()) {
        return null;
      }

      return createRolloverPensionAccount(event, sourceAccount);
    })
    .filter((account): account is NonNullable<typeof account> => Boolean(account));
  const retirementProjectionAccounts = [...scenario.retirementAccounts, ...rolloverPensionAccounts];
  let previousRetirementBalances = Object.fromEntries(
    retirementProjectionAccounts.map((account) => [account.accountId, account.openingBalance]),
  );
  const processedRolloverEventIds = new Set<string>();
  const retirementAccountCentrelinkValues = [
    ...retirementProjectionAccounts.map((account) => ({
      accountId: account.accountId,
      centrelink: account.centrelink,
    })),
  ];
  const years: ProjectionYearResult[] = [];
  const processedAssetSaleEventIds = new Set<string>();
  const processedAssetPurchaseEventIds = new Set<string>();
  const processedLiabilityDrawdownEventIds = new Set<string>();
  const processedLiabilityPaymentEventIds = new Set<string>();
  const processedPensionWithdrawalEventIds = new Set<string>();

  for (let yearIndex = 0; yearIndex < yearCount; yearIndex += 1) {
    const year = scenario.startYear + yearIndex;
    const ageByPersonId = Object.fromEntries(
      scenario.people.map((person) => [person.personId, Math.floor(person.startAge) + yearIndex]),
    );
    const assetValues =
      yearIndex === 0
        ? previousAssetValues
        : Object.fromEntries(
            scenario.assets.map((asset) => [
              asset.assetId,
              projectAssetValue(asset, previousAssetValues[asset.assetId] ?? asset.openingValue, assumptions),
            ]),
          );
    const liabilityBalances =
      yearIndex === 0
        ? previousLiabilityBalances
        : Object.fromEntries(
            scenario.liabilities.map((liability) => [
              liability.liabilityId,
              projectLiabilityBalance(liability, previousLiabilityBalances[liability.liabilityId] ?? liability.openingBalance),
            ]),
          );
    const openingAssetValues = { ...previousAssetValues };
    const assetCostBases = { ...previousAssetCostBases };
    const openingLiabilityBalances = { ...previousLiabilityBalances };
    const assetSaleEventValues: Record<string, number> = {};
    const assetPurchaseEventValues: Record<string, number> = {};
    const assetSaleEventCgtDetails: ProjectionYearResult["assetSaleEventCgtDetails"] = {};
    const grossNonDiscountableGainsByPersonId = emptyPersonValues(scenario);
    const grossDiscountableGainsByPersonId = emptyPersonValues(scenario);
    const capitalLossesByPersonId = emptyPersonValues(scenario);
    const liabilityPaymentEventValues: Record<string, number> = {};
    const liabilityDrawdownEventValues: Record<string, number> = {};

    assetSaleEvents
      .filter((event) => event.enabled && event.saleDate && !processedAssetSaleEventIds.has(event.eventId))
      .forEach((event) => {
        const saleMonthIndex = dateToMonthIndex(event.saleDate);
        if (saleMonthIndex === null || saleMonthIndex > getProjectionPeriodMonthRange(scenario, yearIndex).periodEnd) {
          return;
        }

        const sourceAsset = scenario.assets.find((asset) => asset.assetId === event.assetId);
        if (!sourceAsset) {
          return;
        }

        const targetCashAssetId = getCashAssetIdForOwner(scenario, sourceAsset.ownerPersonId, event.targetAssetId);
        if (!targetCashAssetId) {
          return;
        }

        const availableValue = Math.max(assetValues[sourceAsset.assetId] ?? sourceAsset.openingValue, 0);
        const saleAmount =
          event.amountMode === "fixed-amount" ? Math.min(Math.max(event.fixedAmount ?? 0, 0), availableValue) : availableValue;
        const currentCostBase = assetCostBases[sourceAsset.assetId] ?? sourceAsset.costBase ?? sourceAsset.openingValue;
        const costBaseUsed = availableValue > 0 ? Math.min(currentCostBase, currentCostBase * (saleAmount / availableValue)) : 0;
        const cgtTreatment = getAssetCgtTreatment(sourceAsset);
        const grossCapitalGain = saleAmount - costBaseUsed;
        const discountEligible = cgtTreatment === "taxable" && isCgtDiscountEligible(sourceAsset.acquisitionDate, event.saleDate);

        assetValues[sourceAsset.assetId] = Math.max(availableValue - saleAmount, 0);
        assetValues[targetCashAssetId] = (assetValues[targetCashAssetId] ?? 0) + saleAmount;
        assetCostBases[sourceAsset.assetId] = Math.max(currentCostBase - costBaseUsed, 0);
        assetCostBases[targetCashAssetId] = (assetCostBases[targetCashAssetId] ?? 0) + saleAmount;
        openingAssetValues[sourceAsset.assetId] = Math.max((openingAssetValues[sourceAsset.assetId] ?? availableValue) - saleAmount, 0);
        openingAssetValues[targetCashAssetId] = (openingAssetValues[targetCashAssetId] ?? 0) + saleAmount;
        assetSaleEventValues[event.eventId] = saleAmount;
        assetSaleEventCgtDetails[event.eventId] = {
          proceeds: saleAmount,
          costBaseUsed,
          grossCapitalGain,
          taxableCapitalGain: 0,
          discountApplied: 0,
          carriedForwardLossApplied: 0,
          cgtTreatment,
        };
        if (cgtTreatment === "taxable") {
          if (grossCapitalGain >= 0) {
            allocateAmountByOwner(
              scenario,
              discountEligible ? grossDiscountableGainsByPersonId : grossNonDiscountableGainsByPersonId,
              sourceAsset.ownerPersonId,
              grossCapitalGain,
            );
          } else {
            allocateAmountByOwner(scenario, capitalLossesByPersonId, sourceAsset.ownerPersonId, Math.abs(grossCapitalGain));
          }
        }
        processedAssetSaleEventIds.add(event.eventId);
      });

    liabilityDrawdownEvents
      .filter((event) => event.enabled && event.drawdownDate && !processedLiabilityDrawdownEventIds.has(event.eventId))
      .forEach((event) => {
        const drawdownMonthIndex = dateToMonthIndex(event.drawdownDate);
        if (drawdownMonthIndex === null || drawdownMonthIndex > getProjectionPeriodMonthRange(scenario, yearIndex).periodEnd) {
          return;
        }

        const liability = scenario.liabilities.find((entry) => entry.liabilityId === event.liabilityId);
        if (!liability) {
          return;
        }

        const targetCashAssetId = getCashAssetIdForOwner(scenario, liability.ownerPersonId, event.targetAssetId);
        if (!targetCashAssetId) {
          return;
        }

        const drawdownAmount = Math.max(event.amount, 0);
        liabilityBalances[liability.liabilityId] = (liabilityBalances[liability.liabilityId] ?? 0) + drawdownAmount;
        openingLiabilityBalances[liability.liabilityId] = (openingLiabilityBalances[liability.liabilityId] ?? 0) + drawdownAmount;
        assetValues[targetCashAssetId] = (assetValues[targetCashAssetId] ?? 0) + drawdownAmount;
        openingAssetValues[targetCashAssetId] = (openingAssetValues[targetCashAssetId] ?? 0) + drawdownAmount;
        assetCostBases[targetCashAssetId] = (assetCostBases[targetCashAssetId] ?? 0) + drawdownAmount;
        liabilityDrawdownEventValues[event.eventId] = drawdownAmount;
        processedLiabilityDrawdownEventIds.add(event.eventId);
      });

    assetPurchaseEvents
      .filter((event) => event.enabled && event.purchaseDate && !processedAssetPurchaseEventIds.has(event.eventId))
      .forEach((event) => {
        const purchaseMonthIndex = dateToMonthIndex(event.purchaseDate);
        if (purchaseMonthIndex === null || purchaseMonthIndex > getProjectionPeriodMonthRange(scenario, yearIndex).periodEnd) {
          return;
        }

        const targetAsset = scenario.assets.find((asset) => asset.assetId === event.assetId);
        if (!targetAsset) {
          return;
        }

        const sourceCashAssetId = getCashAssetIdForOwner(scenario, targetAsset.ownerPersonId, event.sourceAssetId);
        if (!sourceCashAssetId) {
          return;
        }

        const availableCash = Math.max(assetValues[sourceCashAssetId] ?? 0, 0);
        const purchaseAmount = Math.min(Math.max(event.amount, 0), availableCash);
        assetValues[sourceCashAssetId] = Math.max(availableCash - purchaseAmount, 0);
        assetValues[targetAsset.assetId] = (assetValues[targetAsset.assetId] ?? 0) + purchaseAmount;
        openingAssetValues[sourceCashAssetId] = Math.max((openingAssetValues[sourceCashAssetId] ?? availableCash) - purchaseAmount, 0);
        openingAssetValues[targetAsset.assetId] = (openingAssetValues[targetAsset.assetId] ?? 0) + purchaseAmount;
        assetCostBases[sourceCashAssetId] = Math.max((assetCostBases[sourceCashAssetId] ?? 0) - purchaseAmount, 0);
        assetCostBases[targetAsset.assetId] = (assetCostBases[targetAsset.assetId] ?? 0) + purchaseAmount;
        assetPurchaseEventValues[event.eventId] = purchaseAmount;
        processedAssetPurchaseEventIds.add(event.eventId);
      });

    const taxableIncomeByPersonId = getEmploymentIncomeByPersonId(scenario, yearIndex, assumptions);
    const employerSuperByPersonId = calculateEmployerSuperByPersonId(taxableIncomeByPersonId, assumptions);
    const rolloverInByAccountId: Record<string, number> = {};
    const rolloverOutByAccountId: Record<string, number> = {};
    const rolloverDetailsByAccountId: Record<
      string,
      ProjectionYearResult["retirementAccountDetails"][string]["rolloverEventDetails"]
    > = {};
    const pensionWithdrawalDetailsByAccountId: Record<
      string,
      ProjectionYearResult["retirementAccountDetails"][string]["pensionWithdrawalDetails"]
    > = {};
    const rolloverAdjustedOpeningBalances = { ...previousRetirementBalances };

    superRolloverEvents
      .filter((event) => event.enabled && event.rolloverDate && !processedRolloverEventIds.has(event.eventId))
      .forEach((event) => {
        const rolloverMonthIndex = dateToMonthIndex(event.rolloverDate);
        if (rolloverMonthIndex === null || rolloverMonthIndex > getProjectionPeriodMonthRange(scenario, yearIndex).periodEnd) {
          return;
        }

        const sourceAccount = retirementProjectionAccounts.find((account) => account.accountId === event.sourceAccountId);
        const destinationAccountId = getRolloverDestinationAccountId(event);
        const destinationAccount = retirementProjectionAccounts.find((account) => account.accountId === destinationAccountId);

        if (!sourceAccount || !destinationAccount || sourceAccount.ownerPersonId !== destinationAccount.ownerPersonId) {
          return;
        }

        const sourceOpeningBalance = rolloverAdjustedOpeningBalances[sourceAccount.accountId] ?? sourceAccount.openingBalance;
        const rolloverAmount =
          event.amountMode === "fixed-amount"
            ? Math.min(Math.max(event.fixedAmount ?? 0, 0), sourceOpeningBalance)
            : sourceOpeningBalance;

        if (rolloverAmount <= 0) {
          processedRolloverEventIds.add(event.eventId);
          return;
        }

        rolloverAdjustedOpeningBalances[sourceAccount.accountId] = Math.max(sourceOpeningBalance - rolloverAmount, 0);
        rolloverAdjustedOpeningBalances[destinationAccountId] =
          (rolloverAdjustedOpeningBalances[destinationAccountId] ?? destinationAccount.openingBalance) + rolloverAmount;
        rolloverOutByAccountId[sourceAccount.accountId] =
          (rolloverOutByAccountId[sourceAccount.accountId] ?? 0) + rolloverAmount;
        rolloverInByAccountId[destinationAccountId] = (rolloverInByAccountId[destinationAccountId] ?? 0) + rolloverAmount;

        const sourceLabel = `Rollover to ${destinationAccount.productName}`;
        const destinationLabel = `Rollover from ${sourceAccount.productName}`;
        rolloverDetailsByAccountId[sourceAccount.accountId] = [
          ...(rolloverDetailsByAccountId[sourceAccount.accountId] ?? []),
          {
            eventId: event.eventId,
            label: sourceLabel,
            rolloverIn: 0,
            rolloverOut: rolloverAmount,
          },
        ];
        rolloverDetailsByAccountId[destinationAccountId] = [
          ...(rolloverDetailsByAccountId[destinationAccountId] ?? []),
          {
            eventId: event.eventId,
            label: destinationLabel,
            rolloverIn: rolloverAmount,
            rolloverOut: 0,
          },
        ];
        processedRolloverEventIds.add(event.eventId);
      });

    pensionWithdrawalEvents
      .filter((event) => event.enabled && event.withdrawalDate && !processedPensionWithdrawalEventIds.has(event.eventId))
      .forEach((event) => {
        const withdrawalMonthIndex = dateToMonthIndex(event.withdrawalDate);
        if (withdrawalMonthIndex === null || withdrawalMonthIndex > getProjectionPeriodMonthRange(scenario, yearIndex).periodEnd) {
          return;
        }

        const account = retirementProjectionAccounts.find(
          (entry) => entry.accountId === event.accountId && entry.accountType === "account-based-pension",
        );
        if (!account) {
          return;
        }

        const targetCashAssetId = getCashAssetIdForOwner(scenario, account.ownerPersonId, event.targetAssetId);
        if (!targetCashAssetId) {
          return;
        }

        const openingBalance = Math.max(rolloverAdjustedOpeningBalances[account.accountId] ?? account.openingBalance, 0);
        const withdrawalAmount =
          event.amountMode === "fixed-amount" ? Math.min(Math.max(event.fixedAmount ?? 0, 0), openingBalance) : openingBalance;

        rolloverAdjustedOpeningBalances[account.accountId] = Math.max(openingBalance - withdrawalAmount, 0);
        assetValues[targetCashAssetId] = (assetValues[targetCashAssetId] ?? 0) + withdrawalAmount;
        openingAssetValues[targetCashAssetId] = (openingAssetValues[targetCashAssetId] ?? 0) + withdrawalAmount;
        pensionWithdrawalDetailsByAccountId[account.accountId] = [
          ...(pensionWithdrawalDetailsByAccountId[account.accountId] ?? []),
          {
            eventId: event.eventId,
            label: event.label,
            amount: withdrawalAmount,
            targetAssetId: targetCashAssetId,
          },
        ];
        processedPensionWithdrawalEventIds.add(event.eventId);
      });

    liabilityPaymentEvents
      .filter((event) => event.enabled && event.paymentDate && !processedLiabilityPaymentEventIds.has(event.eventId))
      .forEach((event) => {
        const paymentMonthIndex = dateToMonthIndex(event.paymentDate);
        if (paymentMonthIndex === null || paymentMonthIndex > getProjectionPeriodMonthRange(scenario, yearIndex).periodEnd) {
          return;
        }

        const liability = scenario.liabilities.find((entry) => entry.liabilityId === event.liabilityId);
        if (!liability) {
          return;
        }

        const sourceCashAssetId = getCashAssetIdForOwner(scenario, liability.ownerPersonId, event.sourceAssetId);
        if (!sourceCashAssetId) {
          return;
        }

        const availableCash = Math.max(assetValues[sourceCashAssetId] ?? 0, 0);
        const balance = Math.max(liabilityBalances[liability.liabilityId] ?? liability.openingBalance, 0);
        const requestedPayment =
          event.amountMode === "fixed-amount" ? Math.min(Math.max(event.fixedAmount ?? 0, 0), balance) : balance;
        const paymentAmount = Math.min(requestedPayment, availableCash);

        assetValues[sourceCashAssetId] = Math.max(availableCash - paymentAmount, 0);
        liabilityBalances[liability.liabilityId] = Math.max(balance - paymentAmount, 0);
        openingAssetValues[sourceCashAssetId] = Math.max((openingAssetValues[sourceCashAssetId] ?? availableCash) - paymentAmount, 0);
        openingLiabilityBalances[liability.liabilityId] = Math.max(
          (openingLiabilityBalances[liability.liabilityId] ?? balance) - paymentAmount,
          0,
        );
        liabilityPaymentEventValues[event.eventId] = paymentAmount;
        processedLiabilityPaymentEventIds.add(event.eventId);
      });

    const cgtResult = calculateTaxableCapitalGains({
      scenario,
      grossNonDiscountableGainsByPersonId,
      grossDiscountableGainsByPersonId,
      capitalLossesByPersonId,
      carriedForwardCapitalLossesByPersonId,
    });
    const taxableCapitalGainsByPersonId = cgtResult.taxableCapitalGainsByPersonId;
    const totalPositiveTaxableGrossGains = Object.values(assetSaleEventCgtDetails).reduce(
      (total, detail) => total + (detail.cgtTreatment === "taxable" && detail.grossCapitalGain > 0 ? detail.grossCapitalGain : 0),
      0,
    );
    const totalTaxableCapitalGains = sumValues(taxableCapitalGainsByPersonId);
    const totalDiscountApplied = sumValues(cgtResult.discountAppliedByPersonId);
    const totalLossesApplied = sumValues(cgtResult.carriedForwardLossAppliedByPersonId);

    Object.entries(assetSaleEventCgtDetails).forEach(([eventId, detail]) => {
      if (detail.cgtTreatment !== "taxable" || detail.grossCapitalGain <= 0 || totalPositiveTaxableGrossGains <= 0) {
        return;
      }

      const eventShare = detail.grossCapitalGain / totalPositiveTaxableGrossGains;
      assetSaleEventCgtDetails[eventId] = {
        ...detail,
        taxableCapitalGain: totalTaxableCapitalGains * eventShare,
        discountApplied: totalDiscountApplied * eventShare,
        carriedForwardLossApplied: totalLossesApplied * eventShare,
      };
    });

    const cashAsset = scenario.assets.find((asset) => asset.assetId === cashAssetId);
    const cashOpening = openingAssetValues[cashAssetId ?? ""] ?? 0;
    const bankInterest = cashAsset ? cashOpening * getAssetGrowthRate(cashAsset, assumptions) : 0;
    const assessableAssets = sumAssessableAssets({
      assets: scenario.assets,
      assetValues: openingAssetValues,
      retirementAccountBalances: rolloverAdjustedOpeningBalances,
      retirementAccountCentrelinkValues,
    });
    const financialAssets = sumFinancialAssets({
      assets: scenario.assets,
      assetValues: openingAssetValues,
      retirementAccountBalances: rolloverAdjustedOpeningBalances,
      retirementAccountCentrelinkValues,
    });

    const retirementAccountProjections = retirementProjectionAccounts.map((account) => {
      const ownerAge = ageByPersonId[account.ownerPersonId] ?? primaryPerson.startAge + yearIndex;
      const targetAccountId = getContributionTargetAccountId(scenario, account.ownerPersonId);
      const receivesEmployerContribution = account.accountType === "super-accumulation" && account.accountId === targetAccountId;
      const grossEmployerContribution = receivesEmployerContribution
        ? employerSuperByPersonId[account.ownerPersonId]?.grossContribution ?? 0
        : 0;
      const employerContributionTax = receivesEmployerContribution
        ? employerSuperByPersonId[account.ownerPersonId]?.contributionTax ?? 0
        : 0;
      const strategyDetails =
        account.accountType === "super-accumulation"
          ? superContributionStrategies
              .filter((strategy) => strategy.enabled && strategy.targetAccountId === account.accountId)
              .map((strategy) => {
                const activeFraction = getDatedActiveFraction({
                  startDate: strategy.startDate,
                  endDate: strategy.endDate,
                  scenario,
                  yearIndex,
                });
                const grossContribution =
                  activeFraction > 0
                    ? inflate(strategy.annualAmount, assumptions.economic.cpiRate, strategy.indexedToCpi ? yearIndex : 0) * activeFraction
                    : 0;
                const contributionTax =
                  strategy.contributionType === "concessional"
                    ? grossContribution * assumptions.legislative.superannuation.contributionsTaxRate
                    : 0;

                return {
                  strategyId: strategy.strategyId,
                  label: strategy.label,
                  grossContribution,
                  contributionTax,
                  netContribution: Math.max(grossContribution - contributionTax, 0),
                };
              })
              .filter((strategy) => strategy.grossContribution > 0)
          : [];
      const additionalContribution = strategyDetails.reduce((total, strategy) => total + strategy.grossContribution, 0);
      const additionalContributionTax = strategyDetails.reduce((total, strategy) => total + strategy.contributionTax, 0);
      const netEmployerContribution =
        receivesEmployerContribution
          ? employerSuperByPersonId[account.ownerPersonId]?.netContribution ?? 0
          : 0;

      return {
        account,
        projection: {
          ...projectRetirementAccount({
            account,
            previousBalance: rolloverAdjustedOpeningBalances[account.accountId] ?? account.openingBalance,
            grossEmployerContribution,
            additionalContribution,
            additionalContributionTax,
            contributionTax: employerContributionTax + additionalContributionTax,
            netEmployerContribution,
            age: ownerAge,
            yearIndex,
            assumptions,
          }),
          openingBalance: previousRetirementBalances[account.accountId] ?? account.openingBalance,
          rolloverIn: rolloverInByAccountId[account.accountId] ?? 0,
          rolloverOut: rolloverOutByAccountId[account.accountId] ?? 0,
          contributionStrategyDetails: strategyDetails,
          rolloverEventDetails: rolloverDetailsByAccountId[account.accountId] ?? [],
          lumpSumWithdrawal: (pensionWithdrawalDetailsByAccountId[account.accountId] ?? []).reduce(
            (total, detail) => total + detail.amount,
            0,
          ),
          pensionWithdrawalDetails: pensionWithdrawalDetailsByAccountId[account.accountId] ?? [],
        },
      };
    });
    const retirementAccountBalances = Object.fromEntries(
      retirementAccountProjections.map(({ account, projection }) => [account.accountId, projection.closingBalance]),
    );
    const retirementAccountDetails = Object.fromEntries(
      retirementAccountProjections.map(({ account, projection }) => [
        account.accountId,
        {
          accountId: account.accountId,
          openingBalance: projection.openingBalance,
          rolloverIn: projection.rolloverIn,
          rolloverOut: projection.rolloverOut,
          grossEmployerContribution: projection.grossEmployerContribution,
          additionalContribution: projection.additionalContribution,
          contributionStrategyDetails: projection.contributionStrategyDetails,
          rolloverEventDetails: projection.rolloverEventDetails,
          lumpSumWithdrawal: projection.lumpSumWithdrawal,
          pensionWithdrawalDetails: projection.pensionWithdrawalDetails,
          contributionTax: projection.contributionTax,
          netEmployerContribution: projection.netEmployerContribution,
          drawdown: projection.drawdown,
          investmentIncome: projection.investmentIncome,
          investmentGrowth: projection.investmentGrowth,
          investmentTax: projection.investmentTax,
          fees: projection.fees,
          insurancePremium: projection.insurancePremium,
          taxPayable: projection.taxPayable,
          closingBalance: projection.closingBalance,
        },
      ]),
    );
    const accountBasedPension = retirementAccountProjections.reduce(
      (total, { account, projection }) =>
        account.accountType === "account-based-pension" ? total + projection.drawdown : total,
      0,
    );
    const accountBasedPensionByPersonId = scenario.people.reduce<Record<string, number>>((values, person) => {
      values[person.personId] = retirementAccountProjections.reduce(
        (total, { account, projection }) =>
          account.accountType === "account-based-pension" && account.ownerPersonId === person.personId
            ? total + projection.drawdown
            : total,
        0,
      );

      return values;
    }, {});
    const personalSuperContributions = retirementAccountProjections.reduce(
      (total, { account, projection }) =>
        account.accountType === "super-accumulation" ? total + projection.additionalContribution : total,
      0,
    );
    const cashflowItemValues = Object.fromEntries(
      scenario.cashflowItems.map((item) => [
        item.itemId,
        getCashflowItemValue(item, scenario, yearIndex, assumptions),
      ]),
    );
    const assetIncomeValues = Object.fromEntries(
      scenario.assets.map((asset) => [
        asset.assetId,
        inflate(asset.annualIncome ?? 0, assumptions.economic.cpiRate, yearIndex),
      ]),
    );
    const assetIncomeByPersonId = scenario.assets.reduce<Record<string, number>>((values, asset) => {
      allocateAmountByOwner(scenario, values, asset.ownerPersonId, assetIncomeValues[asset.assetId] ?? 0);
      return values;
    }, {});
    const liabilityRepaymentValues = Object.fromEntries(
      scenario.liabilities.map((liability) => [
        liability.liabilityId,
        calculateLiabilityRepayment(
          liability,
          openingLiabilityBalances[liability.liabilityId] ?? liability.openingBalance,
        ),
      ]),
    );
    const liabilityInterestValues = Object.fromEntries(
      scenario.liabilities.map((liability) => [
        liability.liabilityId,
        calculateLiabilityInterest(liability, openingLiabilityBalances[liability.liabilityId] ?? liability.openingBalance),
      ]),
    );
    const liabilityPrincipalRepaymentValues = Object.fromEntries(
      scenario.liabilities.map((liability) => [
        liability.liabilityId,
        calculateLiabilityPrincipalRepayment(
          liability,
          openingLiabilityBalances[liability.liabilityId] ?? liability.openingBalance,
        ),
      ]),
    );
    const deductibleInterestByPersonId = scenario.liabilities
      .filter((liability) => liability.interestDeductible)
      .reduce<Record<string, number>>((values, liability) => {
        allocateAmountByOwner(scenario, values, liability.ownerPersonId, liabilityInterestValues[liability.liabilityId] ?? 0);
        return values;
      }, emptyPersonValues(scenario));
    const liabilityRepaymentItemIds = new Set(scenario.liabilities.map((liability) => `${liability.liabilityId}-repayment`));
    const otherIncome = scenario.cashflowItems
      .filter((item) => item.category === "other-income")
      .reduce((total, item) => total + (cashflowItemValues[item.itemId] ?? 0), 0);
    const taxableOtherIncomeByPersonId = scenario.cashflowItems
      .filter((item) => item.category === "other-income" && item.taxable)
      .reduce<Record<string, number>>((values, item) => {
        allocateAmountByOwner(scenario, values, item.ownerPersonId, cashflowItemValues[item.itemId] ?? 0);
        return values;
      }, {});
    const assetIncome = sumValues(assetIncomeValues);
    const expenses = scenario.cashflowItems
      .filter(
        (item) =>
          (item.category === "living-expense" || item.category === "other-expense") &&
          !liabilityRepaymentItemIds.has(item.itemId),
      )
      .reduce((total, item) => total + (cashflowItemValues[item.itemId] ?? 0), 0) +
      sumValues(liabilityRepaymentValues) +
      personalSuperContributions;
    const otherAssessableIncomeByPersonId = scenario.people.reduce<Record<string, number>>((values, person) => {
      values[person.personId] =
        (taxableOtherIncomeByPersonId[person.personId] ?? 0) + (assetIncomeByPersonId[person.personId] ?? 0);
      return values;
    }, {});
    const { agePension, agePensionByPersonId } = calculateHouseholdAgePension({
      people: scenario.people,
      ageByPersonId,
      assessableAssets,
      financialAssets,
      otherAssessableIncomeByPersonId,
      assumptions: assumptions.legislative,
    });
    const employerSuperContributions = Object.values(employerSuperByPersonId).reduce(
      (total, contribution) => total + contribution.grossContribution,
      0,
    );
    const concessionalContributionsTax = Object.values(employerSuperByPersonId).reduce(
      (total, contribution) => total + contribution.contributionTax,
      0,
    );
    const netEmployerSuperContributions = employerSuperContributions - concessionalContributionsTax;
    const totalIncome = accountBasedPension + agePension.annualPayment + bankInterest + otherIncome + assetIncome;
    const bankInterestByPersonId: Record<string, number> = {};
    if (cashAsset?.ownerPersonId) {
      allocateAmountByOwner(scenario, bankInterestByPersonId, cashAsset.ownerPersonId, bankInterest);
    }
    const taxByPersonId = Object.fromEntries(
      scenario.people.map((person) => [
        person.personId,
        calculatePersonalTax({
          taxableAgePension: agePensionByPersonId[person.personId]?.annualPayment ?? 0,
          taxableBankInterest: bankInterestByPersonId[person.personId] ?? 0,
          taxableOtherIncome: (taxableOtherIncomeByPersonId[person.personId] ?? 0) + (assetIncomeByPersonId[person.personId] ?? 0),
          taxableCapitalGains: taxableCapitalGainsByPersonId[person.personId] ?? 0,
          deductibleInterest: deductibleInterestByPersonId[person.personId] ?? 0,
          taxFreeAccountBasedPension: accountBasedPensionByPersonId[person.personId] ?? 0,
          seniorsAndPensionersTaxOffsetEligible: agePensionByPersonId[person.personId]?.ageEligible ?? false,
          relationshipStatus: person.relationshipStatus,
          assumptions: assumptions.legislative,
        }),
      ]),
    );
    const tax = sumTaxProjectionYears(taxByPersonId);
    const netCashflowBeforeTax = totalIncome - expenses;
    const netCashflowAfterTax = netCashflowBeforeTax - tax.taxPayable;
    const adjustedAssetValues = { ...assetValues };
    const adjustedLiabilityBalances = { ...liabilityBalances };
    const adjustedRetirementAccountBalances = { ...retirementAccountBalances };
    const adjustedRetirementAccountDetails = Object.fromEntries(
      Object.entries(retirementAccountDetails).map(([accountId, detail]) => [accountId, { ...detail }]),
    );
    const cashflowFallbackAllocation = {
      surplusToCash: 0,
      surplusToLiability: 0,
      shortfallFromCash: 0,
      extraAccountBasedPensionDrawdown: 0,
      nonSuperInvestmentSale: 0,
      debtDrawdown: 0,
      unresolvedShortfall: 0,
      cashAssetId,
      surplusTargetAssetId: null as string | null,
      surplusTargetLiabilityId: null as string | null,
      accountBasedPensionAccountIds: [] as string[],
      soldAssetIds: [] as string[],
      debtLiabilityId: null as string | null,
    };
    let cashReserve: number;

    if (netCashflowAfterTax >= 0) {
      const surplusTarget = getSurplusAllocationTarget(scenario, cashAssetId);
      let remainingSurplus = netCashflowAfterTax;

      if (surplusTarget?.targetType === "liability") {
        const targetBalance = adjustedLiabilityBalances[surplusTarget.targetId] ?? 0;
        const extraRepayment = Math.min(targetBalance, remainingSurplus);
        adjustedLiabilityBalances[surplusTarget.targetId] = Math.max(targetBalance - extraRepayment, 0);
        cashflowFallbackAllocation.surplusToLiability = extraRepayment;
        cashflowFallbackAllocation.surplusTargetLiabilityId = surplusTarget.targetId;
        remainingSurplus -= extraRepayment;
      }

      cashReserve = cashOpening;

      if (remainingSurplus > 0) {
        const targetAssetId = surplusTarget?.targetType === "cash-asset" ? surplusTarget.targetId : cashAssetId;

        if (targetAssetId) {
          adjustedAssetValues[targetAssetId] = (adjustedAssetValues[targetAssetId] ?? 0) + remainingSurplus;
          cashflowFallbackAllocation.surplusToCash = remainingSurplus;
          cashflowFallbackAllocation.surplusTargetAssetId = targetAssetId;
          if (targetAssetId === cashAssetId) {
            cashReserve = cashOpening + remainingSurplus;
          }
        }
      }
    } else {
      let remainingShortfall = Math.abs(netCashflowAfterTax);
      const shortfallFromCash = Math.min(cashOpening, remainingShortfall);
      cashflowFallbackAllocation.shortfallFromCash = shortfallFromCash;
      remainingShortfall -= shortfallFromCash;
      cashReserve = cashOpening - shortfallFromCash;

      for (const account of retirementProjectionAccounts.filter((entry) => entry.accountType === "account-based-pension")) {
        if (remainingShortfall <= 0) {
          break;
        }

        const availableBalance = adjustedRetirementAccountBalances[account.accountId] ?? 0;
        const extraDrawdown = Math.min(availableBalance, remainingShortfall);

        if (extraDrawdown <= 0) {
          continue;
        }

        adjustedRetirementAccountBalances[account.accountId] = availableBalance - extraDrawdown;
        adjustedRetirementAccountDetails[account.accountId] = {
          ...adjustedRetirementAccountDetails[account.accountId],
          drawdown: (adjustedRetirementAccountDetails[account.accountId]?.drawdown ?? 0) + extraDrawdown,
          closingBalance: Math.max((adjustedRetirementAccountDetails[account.accountId]?.closingBalance ?? 0) - extraDrawdown, 0),
        };
        cashflowFallbackAllocation.extraAccountBasedPensionDrawdown += extraDrawdown;
        cashflowFallbackAllocation.accountBasedPensionAccountIds.push(account.accountId);
        remainingShortfall -= extraDrawdown;
      }

      for (const asset of scenario.assets.filter((entry) => isInvestmentAssetType(entry.type))) {
        if (remainingShortfall <= 0) {
          break;
        }

        const availableValue = adjustedAssetValues[asset.assetId] ?? 0;
        const saleAmount = Math.min(availableValue, remainingShortfall);

        if (saleAmount <= 0) {
          continue;
        }

        adjustedAssetValues[asset.assetId] = availableValue - saleAmount;
        cashflowFallbackAllocation.nonSuperInvestmentSale += saleAmount;
        cashflowFallbackAllocation.soldAssetIds.push(asset.assetId);
        remainingShortfall -= saleAmount;
      }

      if (remainingShortfall > 0 && debtFallbackLiabilityId) {
        adjustedLiabilityBalances[debtFallbackLiabilityId] =
          (adjustedLiabilityBalances[debtFallbackLiabilityId] ?? 0) + remainingShortfall;
        cashflowFallbackAllocation.debtDrawdown = remainingShortfall;
        cashflowFallbackAllocation.debtLiabilityId = debtFallbackLiabilityId;
        remainingShortfall = 0;
      }

      cashflowFallbackAllocation.unresolvedShortfall = remainingShortfall;
    }

    if (cashAssetId) {
      adjustedAssetValues[cashAssetId] = cashReserve;
    }

    const nextAssetValues = adjustedAssetValues;
    const totalAssets = sumValues(nextAssetValues) + sumValues(adjustedRetirementAccountBalances);
    const totalLiabilities = sumValues(adjustedLiabilityBalances);

    years.push({
      year,
      ageByPersonId,
      cashflowItemValues,
      assetSaleEventValues,
      assetPurchaseEventValues,
      assetIncomeValues,
      assetCostBases,
      assetSaleEventCgtDetails,
      liabilityPaymentEventValues,
      liabilityDrawdownEventValues,
      liabilityRepaymentValues,
      liabilityInterestValues,
      liabilityPrincipalRepaymentValues,
      deductibleInterestByPersonId,
      taxableCapitalGainsByPersonId,
      carriedForwardCapitalLossesByPersonId: cgtResult.nextCarriedForwardCapitalLossesByPersonId,
      accountBasedPension,
      employerSuperContributions,
      concessionalContributionsTax,
      netEmployerSuperContributions,
      employerSuperContributionsByPersonId: Object.fromEntries(
        Object.entries(employerSuperByPersonId).map(([personId, contribution]) => [personId, contribution.grossContribution]),
      ),
      concessionalContributionsTaxByPersonId: Object.fromEntries(
        Object.entries(employerSuperByPersonId).map(([personId, contribution]) => [personId, contribution.contributionTax]),
      ),
      agePension,
      agePensionByPersonId,
      bankInterest,
      totalIncome,
      expenses,
      tax,
      taxByPersonId,
      netCashflowBeforeTax,
      netCashflowAfterTax,
      cashflowFallbackAllocation,
      cashReserve,
      retirementAccountBalances: adjustedRetirementAccountBalances,
      retirementAccountDetails: adjustedRetirementAccountDetails,
      assetValues: nextAssetValues,
      liabilityBalances: adjustedLiabilityBalances,
      totalAssets,
      totalLiabilities,
      netWorth: totalAssets - totalLiabilities,
    });

    previousAssetValues = nextAssetValues;
    previousAssetCostBases = assetCostBases;
    previousLiabilityBalances = adjustedLiabilityBalances;
    previousRetirementBalances = adjustedRetirementAccountBalances;
    carriedForwardCapitalLossesByPersonId = cgtResult.nextCarriedForwardCapitalLossesByPersonId;
  }

  return {
    scenario,
    assumptions,
    years,
    audit: [
      {
        code: "OFFSETS_NOT_SUPPLIED",
        severity: "warning",
        message:
          "SAPTO and LITO are set to zero because the supplied legislative assumption file did not include offset thresholds or formulas.",
      },
      {
        code: "FUNERAL_BOND_TREATMENT",
        severity: "warning",
        message:
          "Funeral bond Centrelink treatment is scenario-configured and should be confirmed against current rules and product details.",
      },
      {
        code: "CASHFLOW_FALLBACK_ORDER",
        severity: "info",
        message:
          "Annual surplus or shortfall is allocated in order: bank savings/cash reserve, extra account-based pension drawdown, non-super investment sales, then debt drawdown or unresolved shortfall.",
      },
      {
        code: "PRACTICAL_CGT_MODEL",
        severity: "warning",
        message:
          "CGT uses cost base, acquisition date, configured exemption treatment, capital losses, and the 50% discount only; confirm detailed CGT concessions and special cases separately.",
      },
    ],
  };
}
