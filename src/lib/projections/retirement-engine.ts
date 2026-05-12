import type { ProjectionAssumptions, RetirementAccount } from "./types";

const DEFAULT_ANNUAL_ACCOUNT_FEE_RATE = 0.015;

export function getInvestmentReturn(account: RetirementAccount, assumptions: ProjectionAssumptions) {
  return assumptions.investmentProfiles.profiles[account.investmentProfileKey]?.totalReturn ?? 0;
}

export function getMinimumAccountBasedPensionDrawdown(input: {
  age: number;
  balance: number;
  assumptions: ProjectionAssumptions;
}) {
  const factor =
    input.assumptions.legislative.accountBasedPension.minimumDrawdownByAge.find(
      (entry) => input.age >= entry.minAge && input.age <= entry.maxAge,
    )?.minimumFactor ?? 0;

  return input.balance * factor;
}

export function projectRetirementAccount(input: {
  account: RetirementAccount;
  previousBalance: number;
  grossEmployerContribution: number;
  additionalContribution: number;
  additionalContributionTax: number;
  contributionTax: number;
  netEmployerContribution: number;
  age: number;
  yearIndex: number;
  assumptions: ProjectionAssumptions;
}) {
  const investmentProfile = input.assumptions.investmentProfiles.profiles[input.account.investmentProfileKey];
  const incomeRate = investmentProfile?.incomeRate ?? 0;
  const growthRate = investmentProfile?.growthRate ?? getInvestmentReturn(input.account, input.assumptions);
  const drawdown =
    input.account.accountType === "account-based-pension"
      ? input.account.annualDrawdown * (input.account.drawdownIndexedToCpi ? (1 + input.assumptions.economic.cpiRate) ** input.yearIndex : 1)
      : 0;
  const minimumDrawdown =
    input.account.accountType === "account-based-pension"
      ? getMinimumAccountBasedPensionDrawdown({
          age: input.age,
          balance: input.previousBalance,
          assumptions: input.assumptions,
        })
      : 0;
  const netAdditionalContribution = Math.max(input.additionalContribution - input.additionalContributionTax, 0);
  const balanceBeforeDrawdown = input.previousBalance + input.netEmployerContribution + netAdditionalContribution;
  const appliedDrawdown = Math.min(Math.max(drawdown, minimumDrawdown), balanceBeforeDrawdown);
  const balanceBeforeInvestment = Math.max(balanceBeforeDrawdown - appliedDrawdown, 0);
  const investmentIncome = balanceBeforeInvestment * incomeRate;
  const investmentGrowth = balanceBeforeInvestment * growthRate;
  const investmentTax =
    input.account.accountType === "super-accumulation"
      ? investmentIncome * input.assumptions.legislative.superannuation.investmentEarningsTaxRate
      : 0;
  const balanceBeforeFees = Math.max(balanceBeforeInvestment + investmentIncome + investmentGrowth - investmentTax, 0);
  const fees = balanceBeforeFees * (input.account.annualFeeRate ?? DEFAULT_ANNUAL_ACCOUNT_FEE_RATE);
  const closingBalance = Math.max(balanceBeforeFees - fees, 0);

  return {
    openingBalance: input.previousBalance,
    grossEmployerContribution: input.grossEmployerContribution,
    additionalContribution: input.additionalContribution,
    contributionTax: input.contributionTax,
    netEmployerContribution: input.netEmployerContribution + netAdditionalContribution,
    drawdown: appliedDrawdown,
    minimumDrawdown,
    investmentIncome,
    investmentGrowth,
    investmentTax,
    fees,
    taxPayable: input.contributionTax + investmentTax,
    closingBalance,
  };
}
