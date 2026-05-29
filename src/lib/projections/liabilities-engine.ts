import type { ProjectionLiability } from "./types";

export function calculateLiabilityInterest(liability: ProjectionLiability, previousBalance: number) {
  if (previousBalance <= 0 || liability.annualInterestRate <= 0) {
    return 0;
  }

  const balanceBeforeInterest =
    liability.repaymentTiming === "start-of-year" && liability.repaymentType !== "interest-only"
      ? Math.max(previousBalance - liability.annualRepayment, 0)
      : previousBalance;

  return balanceBeforeInterest * liability.annualInterestRate;
}

export function calculateLiabilityRepayment(liability: ProjectionLiability, previousBalance: number) {
  if (previousBalance <= 0) {
    return 0;
  }

  if (liability.repaymentType === "interest-only") {
    return calculateLiabilityInterest(liability, previousBalance);
  }

  if (liability.annualRepayment <= 0) {
    return 0;
  }

  if (liability.repaymentTiming === "start-of-year") {
    return Math.min(previousBalance, liability.annualRepayment);
  }

  return Math.min(previousBalance * (1 + liability.annualInterestRate), liability.annualRepayment);
}

export function calculateLiabilityPrincipalRepayment(liability: ProjectionLiability, previousBalance: number) {
  const repayment = calculateLiabilityRepayment(liability, previousBalance);
  const interest = calculateLiabilityInterest(liability, previousBalance);

  if (liability.repaymentType === "interest-only") {
    return 0;
  }

  return Math.max(repayment - interest, 0);
}

export function projectLiabilityBalance(liability: ProjectionLiability, previousBalance: number) {
  if (previousBalance <= 0) {
    return 0;
  }

  if (liability.repaymentType === "interest-only") {
    return previousBalance;
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
