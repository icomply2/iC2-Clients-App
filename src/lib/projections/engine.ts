import { getAssetGrowthRate, projectAssetValue, sumAssessableAssets, sumFinancialAssets } from "./assets-engine";
import { calculateAgePension } from "./centrelink-engine";
import { calculateLiabilityRepayment, projectLiabilityBalance } from "./liabilities-engine";
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
      taxFreeAccountBasedPension: total.taxFreeAccountBasedPension + taxYear.taxFreeAccountBasedPension,
      taxableIncome: total.taxableIncome + taxYear.taxableIncome,
      grossTax: total.grossTax + taxYear.grossTax,
      medicareLevy: total.medicareLevy + taxYear.medicareLevy,
      taxOffsets: total.taxOffsets + taxYear.taxOffsets,
      taxPayable: total.taxPayable + taxYear.taxPayable,
    }),
    {
      taxableAgePension: 0,
      taxableBankInterest: 0,
      taxableOtherIncome: 0,
      taxFreeAccountBasedPension: 0,
      taxableIncome: 0,
      grossTax: 0,
      medicareLevy: 0,
      taxOffsets: 0,
      taxPayable: 0,
    },
  );
}

function getCashAssetId(scenario: ProjectionScenario) {
  return scenario.assets.find((asset) => asset.type === "cash")?.assetId ?? null;
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

function getRolloverMonthIndex(account: ProjectionScenario["retirementAccounts"][number]) {
  return account.accountType === "super-accumulation" ? dateToMonthIndex(account.rolloverToPensionDate) : null;
}

function isRolloverEffectiveForProjectionYear(
  account: ProjectionScenario["retirementAccounts"][number],
  scenario: ProjectionScenario,
  yearIndex: number,
) {
  const rolloverMonthIndex = getRolloverMonthIndex(account);
  if (rolloverMonthIndex === null) {
    return false;
  }

  return rolloverMonthIndex <= getProjectionPeriodMonthRange(scenario, yearIndex).periodEnd;
}

function createRolloverPensionAccount(account: ProjectionScenario["retirementAccounts"][number]) {
  return {
    ...account,
    accountId: getRolloverPensionAccountId(account.accountId),
    accountType: "account-based-pension" as const,
    productName: account.rolloverPensionName?.trim() || `${account.productName} pension`,
    annualContribution: 0,
    annualContributionType: "concessional" as const,
    annualDrawdown: account.rolloverAnnualDrawdown ?? 0,
    drawdownIndexedToCpi: account.rolloverDrawdownIndexedToCpi ?? false,
    taxableToClient: false,
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
  let previousLiabilityBalances = Object.fromEntries(
    scenario.liabilities.map((liability) => [liability.liabilityId, liability.openingBalance]),
  );
  let previousRetirementBalances = Object.fromEntries(
    scenario.retirementAccounts.map((account) => [account.accountId, account.openingBalance]),
  );
  const rolloverPensionAccounts = scenario.retirementAccounts
    .filter((account) => account.accountType === "super-accumulation" && getRolloverMonthIndex(account) !== null)
    .map(createRolloverPensionAccount);
  const retirementAccountCentrelinkValues = [
    ...scenario.retirementAccounts.map((account) => ({
      accountId: account.accountId,
      centrelink: account.centrelink,
    })),
    ...rolloverPensionAccounts.map((account) => ({
      accountId: account.accountId,
      centrelink: account.centrelink,
    })),
  ];
  const years: ProjectionYearResult[] = [];

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
    const cashAsset = scenario.assets.find((asset) => asset.assetId === cashAssetId);
    const cashOpening = previousAssetValues[cashAssetId ?? ""] ?? 0;
    const bankInterest = cashAsset ? cashOpening * getAssetGrowthRate(cashAsset, assumptions) : 0;
    const assessableAssets = sumAssessableAssets({
      assets: scenario.assets,
      assetValues: previousAssetValues,
      retirementAccountBalances: previousRetirementBalances,
      retirementAccountCentrelinkValues,
    });
    const financialAssets = sumFinancialAssets({
      assets: scenario.assets,
      assetValues: previousAssetValues,
      retirementAccountBalances: previousRetirementBalances,
      retirementAccountCentrelinkValues,
    });
    const taxableIncomeByPersonId = getEmploymentIncomeByPersonId(scenario, yearIndex, assumptions);
    const employerSuperByPersonId = calculateEmployerSuperByPersonId(taxableIncomeByPersonId, assumptions);
    const retirementAccountProjections = scenario.retirementAccounts.flatMap((account) => {
      const ownerAge = ageByPersonId[account.ownerPersonId] ?? primaryPerson.startAge + yearIndex;
      const rolloverEffective = isRolloverEffectiveForProjectionYear(account, scenario, yearIndex);
      const rolloverPensionAccount =
        account.accountType === "super-accumulation" && getRolloverMonthIndex(account) !== null
          ? createRolloverPensionAccount(account)
          : null;

      if (account.accountType === "super-accumulation" && rolloverEffective && rolloverPensionAccount) {
        const superOpeningBalance = previousRetirementBalances[account.accountId] ?? account.openingBalance;
        const pensionOpeningBalance = previousRetirementBalances[rolloverPensionAccount.accountId] ?? 0;
        const pensionProjection = projectRetirementAccount({
          account: rolloverPensionAccount,
          previousBalance: pensionOpeningBalance + superOpeningBalance,
          grossEmployerContribution: 0,
          additionalContribution: 0,
          additionalContributionTax: 0,
          contributionTax: 0,
          netEmployerContribution: 0,
          age: ownerAge,
          yearIndex,
          assumptions,
        });

        return [
          {
            account,
            projection: {
              openingBalance: superOpeningBalance,
              rolloverIn: 0,
              rolloverOut: superOpeningBalance,
              grossEmployerContribution: 0,
              additionalContribution: 0,
              contributionTax: 0,
              netEmployerContribution: 0,
              drawdown: 0,
              minimumDrawdown: 0,
              investmentIncome: 0,
              investmentGrowth: 0,
              investmentTax: 0,
              fees: 0,
              taxPayable: 0,
              closingBalance: 0,
            },
          },
          {
            account: rolloverPensionAccount,
            projection: {
              ...pensionProjection,
              openingBalance: pensionOpeningBalance,
              rolloverIn: superOpeningBalance,
              rolloverOut: 0,
            },
          },
        ];
      }

      const targetAccountId = getContributionTargetAccountId(scenario, account.ownerPersonId);
      const receivesEmployerContribution = account.accountType === "super-accumulation" && account.accountId === targetAccountId;
      const grossEmployerContribution = receivesEmployerContribution
        ? employerSuperByPersonId[account.ownerPersonId]?.grossContribution ?? 0
        : 0;
      const contributionTax = receivesEmployerContribution
        ? employerSuperByPersonId[account.ownerPersonId]?.contributionTax ?? 0
        : 0;
      const additionalContribution = account.accountType === "super-accumulation" ? account.annualContribution ?? 0 : 0;
      const additionalContributionTax =
        account.accountType === "super-accumulation" && account.annualContributionType !== "non-concessional"
          ? additionalContribution * assumptions.legislative.superannuation.contributionsTaxRate
          : 0;
      const netEmployerContribution =
        receivesEmployerContribution
          ? employerSuperByPersonId[account.ownerPersonId]?.netContribution ?? 0
          : 0;

      const accountProjection = {
        account,
        projection: {
          ...projectRetirementAccount({
            account,
            previousBalance: previousRetirementBalances[account.accountId] ?? account.openingBalance,
            grossEmployerContribution,
            additionalContribution,
            additionalContributionTax,
            contributionTax: contributionTax + additionalContributionTax,
            netEmployerContribution,
            age: ownerAge,
            yearIndex,
            assumptions,
          }),
          rolloverIn: 0,
          rolloverOut: 0,
        },
      };

      return rolloverPensionAccount
        ? [
            accountProjection,
            {
              account: rolloverPensionAccount,
              projection: {
                openingBalance: previousRetirementBalances[rolloverPensionAccount.accountId] ?? 0,
                rolloverIn: 0,
                rolloverOut: 0,
                grossEmployerContribution: 0,
                additionalContribution: 0,
                contributionTax: 0,
                netEmployerContribution: 0,
                drawdown: 0,
                minimumDrawdown: 0,
                investmentIncome: 0,
                investmentGrowth: 0,
                investmentTax: 0,
                fees: 0,
                taxPayable: 0,
                closingBalance: previousRetirementBalances[rolloverPensionAccount.accountId] ?? 0,
              },
            },
          ]
        : [accountProjection];
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
          contributionTax: projection.contributionTax,
          netEmployerContribution: projection.netEmployerContribution,
          drawdown: projection.drawdown,
          investmentIncome: projection.investmentIncome,
          investmentGrowth: projection.investmentGrowth,
          investmentTax: projection.investmentTax,
          fees: projection.fees,
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
          previousLiabilityBalances[liability.liabilityId] ?? liability.openingBalance,
        ),
      ]),
    );
    const liabilityRepaymentItemIds = new Set(scenario.liabilities.map((liability) => `${liability.liabilityId}-repayment`));
    const otherIncome = scenario.cashflowItems
      .filter((item) => item.category === "other-income")
      .reduce((total, item) => total + (cashflowItemValues[item.itemId] ?? 0), 0);
    const taxableOtherIncome = scenario.cashflowItems
      .filter((item) => item.category === "other-income" && item.taxable)
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
      .reduce((total, item) => total + (cashflowItemValues[item.itemId] ?? 0), 0) + sumValues(liabilityRepaymentValues);
    const agePension = calculateAgePension({
      person: primaryPerson,
      age: ageByPersonId[primaryPerson.personId] ?? primaryPerson.startAge + yearIndex,
      assessableAssets,
      financialAssets,
      otherAssessableIncome: taxableOtherIncome + assetIncome,
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
          taxableAgePension: 0,
          taxableBankInterest: bankInterestByPersonId[person.personId] ?? 0,
          taxableOtherIncome: (taxableOtherIncomeByPersonId[person.personId] ?? 0) + (assetIncomeByPersonId[person.personId] ?? 0),
          taxFreeAccountBasedPension: accountBasedPensionByPersonId[person.personId] ?? 0,
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

      for (const account of scenario.retirementAccounts.filter((entry) => entry.accountType === "account-based-pension")) {
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

      for (const asset of scenario.assets.filter((entry) => entry.type === "investment")) {
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
      assetIncomeValues,
      liabilityRepaymentValues,
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
    previousLiabilityBalances = adjustedLiabilityBalances;
    previousRetirementBalances = adjustedRetirementAccountBalances;
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
    ],
  };
}
