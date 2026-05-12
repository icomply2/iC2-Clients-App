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

export function calculatePersonalTax(input: {
  taxableAgePension: number;
  taxableBankInterest: number;
  taxableOtherIncome: number;
  taxFreeAccountBasedPension: number;
  assumptions: LegislativeAssumptions;
}): TaxProjectionYear {
  const taxableIncome = input.taxableAgePension + input.taxableBankInterest + input.taxableOtherIncome;
  const grossTax = calculateMarginalTax(taxableIncome, input.assumptions);
  const medicareLevy = calculateMedicareLevy(taxableIncome, input.assumptions);
  const taxOffsets =
    input.assumptions.tax.offsets.lowIncomeTaxOffset + input.assumptions.tax.offsets.seniorsAndPensionersTaxOffset;
  const taxPayable = Math.max(0, grossTax + medicareLevy - taxOffsets);

  return {
    taxableAgePension: input.taxableAgePension,
    taxableBankInterest: input.taxableBankInterest,
    taxableOtherIncome: input.taxableOtherIncome,
    taxFreeAccountBasedPension: input.taxFreeAccountBasedPension,
    taxableIncome,
    grossTax,
    medicareLevy,
    taxOffsets,
    taxPayable,
  };
}
