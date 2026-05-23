import type { LegislativeAssumptions, TaxProjectionYear } from "./types";

export function calculateMarginalTax(taxableIncome: number, assumptions: LegislativeAssumptions) {
  const brackets = assumptions.tax.residentIndividualBrackets;

  return brackets.reduce((tax, bracket, index) => {
    const nextBracket = brackets[index + 1];
    const upper = nextBracket?.threshold ?? taxableIncome;
    const taxableAtBracket = Math.max(Math.min(taxableIncome, upper) - bracket.threshold, 0);

    return tax + taxableAtBracket * bracket.rate;
  }, 0);
}

export function calculateMedicareLevy(taxableIncome: number, assumptions: LegislativeAssumptions) {
  const medicare = assumptions.tax;

  if (taxableIncome <= medicare.medicareIndividualThreshold) {
    return 0;
  }

  if (taxableIncome <= medicare.medicareShadeInThreshold) {
    return (taxableIncome - medicare.medicareIndividualThreshold) * medicare.medicareShadeInRate;
  }

  return taxableIncome * medicare.medicareLevyRate;
}

export function calculateLowIncomeTaxOffset(taxableIncome: number, assumptions: LegislativeAssumptions) {
  const lito = assumptions.tax.offsets.lowIncomeTaxOffset;

  if (taxableIncome <= lito.firstThreshold) {
    return lito.maximumOffset;
  }

  if (taxableIncome <= lito.secondThreshold) {
    return Math.max(lito.maximumOffset - (taxableIncome - lito.firstThreshold) * lito.firstTaperRate, 0);
  }

  if (taxableIncome <= lito.upperThreshold) {
    const secondTierMaximum = lito.maximumOffset - (lito.secondThreshold - lito.firstThreshold) * lito.firstTaperRate;
    return Math.max(secondTierMaximum - (taxableIncome - lito.secondThreshold) * lito.secondTaperRate, 0);
  }

  return 0;
}

export function calculateSeniorsAndPensionersTaxOffset(input: {
  taxableIncome: number;
  isEligible: boolean;
  relationshipStatus?: string | null;
  assumptions: LegislativeAssumptions;
}) {
  if (!input.isEligible) {
    return 0;
  }

  const sapto = input.assumptions.tax.offsets.seniorsAndPensionersTaxOffset;
  const rate = input.relationshipStatus === "couple" ? sapto.coupleEach : sapto.single;

  if (input.taxableIncome >= rate.cutOutThreshold) {
    return 0;
  }

  return Math.max(rate.maximumOffset - Math.max(input.taxableIncome - rate.shadeOutThreshold, 0) * sapto.taperRate, 0);
}

export function calculatePersonalTax(input: {
  taxableAgePension: number;
  taxableBankInterest: number;
  taxableOtherIncome: number;
  taxableCapitalGains?: number;
  deductibleInterest?: number;
  taxFreeAccountBasedPension: number;
  seniorsAndPensionersTaxOffsetEligible?: boolean;
  relationshipStatus?: string | null;
  assumptions: LegislativeAssumptions;
}): TaxProjectionYear {
  const taxableCapitalGains = input.taxableCapitalGains ?? 0;
  const deductibleInterest = input.deductibleInterest ?? 0;
  const taxableIncome = Math.max(
    input.taxableAgePension + input.taxableBankInterest + input.taxableOtherIncome + taxableCapitalGains - deductibleInterest,
    0,
  );
  const grossTax = calculateMarginalTax(taxableIncome, input.assumptions);
  const medicareLevy = calculateMedicareLevy(taxableIncome, input.assumptions);
  const lowIncomeTaxOffset = calculateLowIncomeTaxOffset(taxableIncome, input.assumptions);
  const seniorsAndPensionersTaxOffset = calculateSeniorsAndPensionersTaxOffset({
    taxableIncome,
    isEligible: input.seniorsAndPensionersTaxOffsetEligible ?? false,
    relationshipStatus: input.relationshipStatus,
    assumptions: input.assumptions,
  });
  const taxOffsets = lowIncomeTaxOffset + seniorsAndPensionersTaxOffset;
  const taxPayable = Math.max(0, grossTax + medicareLevy - taxOffsets);

  return {
    taxableAgePension: input.taxableAgePension,
    taxableBankInterest: input.taxableBankInterest,
    taxableOtherIncome: input.taxableOtherIncome,
    taxableCapitalGains,
    deductibleInterest,
    taxFreeAccountBasedPension: input.taxFreeAccountBasedPension,
    taxableIncome,
    grossTax,
    medicareLevy,
    lowIncomeTaxOffset,
    seniorsAndPensionersTaxOffset,
    taxOffsets,
    taxPayable,
  };
}
