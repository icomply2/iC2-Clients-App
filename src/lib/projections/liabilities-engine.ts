import type { ProjectionLiability } from "./types";

export function calculateLiabilityRepayment(liability: ProjectionLiability, previousBalance: number) {
  if (previousBalance <= 0 || liability.annualRepayment <= 0) {
    return 0;
  }

  if (liability.repaymentTiming === "start-of-year") {
    return Math.min(previousBalance, liability.annualRepayment);
  }

  return Math.min(previousBalance * (1 + liability.annualInterestRate), liability.annualRepayment);
}

export function projectLiabilityBalance(liability: ProjectionLiability, previousBalance: number) {
  if (previousBalance <= 0) {
    return 0;
  }

  const balanceAfterStartRepayment =
    liability.repaymentTiming === "start-of-year"
      ? Math.max(previousBalance - liability.annualRepayment, 0)
      : previousBalance;
  const balanceAfterInterest = balanceAfterStartRepayment * (1 + liability.annualInterestRate);
  const balanceAfterEndRepayment =
    liability.repaymentTiming === "end-of-year"
      ? Math.max(balanceAfterInterest - liability.annualRepayment, 0)
      : balanceAfterInterest;

  return Math.max(balanceAfterEndRepayment, 0);
}
