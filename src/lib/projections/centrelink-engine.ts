import type { AgePensionProjectionYear, LegislativeAssumptions, ProjectionPerson } from "./types";

function calculateDeemedIncome(financialAssets: number, person: ProjectionPerson, assumptions: LegislativeAssumptions) {
  const deeming = assumptions.agePension.deeming;
  const threshold = person.relationshipStatus === "couple" ? deeming.coupleThreshold : deeming.singleThreshold;
  const belowThreshold = Math.min(financialAssets, threshold);
  const aboveThreshold = Math.max(financialAssets - threshold, 0);

  return belowThreshold * deeming.rateBelowThreshold + aboveThreshold * deeming.rateAboveThreshold;
}

function getAgePensionMaximumRate(person: ProjectionPerson, assumptions: LegislativeAssumptions) {
  return person.relationshipStatus === "couple"
    ? assumptions.agePension.maxAnnualRateCoupleEach
    : assumptions.agePension.maxAnnualRateSingle;
}

function getAssetsTestThreshold(person: ProjectionPerson, assumptions: LegislativeAssumptions) {
  const assetTest = assumptions.agePension.assetsTest;

  if (person.relationshipStatus === "couple") {
    return person.isHomeowner ? assetTest.coupleHomeownerThreshold : assetTest.coupleNonHomeownerThreshold;
  }

  return person.isHomeowner ? assetTest.singleHomeownerThreshold : assetTest.singleNonHomeownerThreshold;
}

function getIncomeTestThreshold(person: ProjectionPerson, assumptions: LegislativeAssumptions) {
  return person.relationshipStatus === "couple"
    ? assumptions.agePension.incomeTest.coupleCombinedAnnualThreshold
    : assumptions.agePension.incomeTest.singleAnnualThreshold;
}

export function calculateAgePension(input: {
  person: ProjectionPerson;
  age: number;
  assessableAssets: number;
  financialAssets: number;
  otherAssessableIncome: number;
  assumptions: LegislativeAssumptions;
}): AgePensionProjectionYear {
  if (input.age < input.assumptions.agePension.qualifyingAge) {
    return {
      assessableAssets: input.assessableAssets,
      deemedIncome: 0,
      maximumAnnualRate: 0,
      assetsTestAnnualRate: 0,
      incomeTestAnnualRate: 0,
      annualPayment: 0,
      bindingTest: "not-eligible",
    };
  }

  const maximumAnnualRate = getAgePensionMaximumRate(input.person, input.assumptions);
  const assetsThreshold = getAssetsTestThreshold(input.person, input.assumptions);
  const fortnightlyTaper = input.assumptions.agePension.assetsTest.taperPerThousandPerFortnight;
  const assetsReduction = (Math.max(input.assessableAssets - assetsThreshold, 0) / 1000) * fortnightlyTaper * 26;
  const assetsTestAnnualRate = Math.max(maximumAnnualRate - assetsReduction, 0);
  const deemedIncome = calculateDeemedIncome(input.financialAssets, input.person, input.assumptions);
  const incomeThreshold = getIncomeTestThreshold(input.person, input.assumptions);
  const assessableIncome = deemedIncome + input.otherAssessableIncome;
  const incomeReduction = Math.max(assessableIncome - incomeThreshold, 0) * input.assumptions.agePension.incomeTest.taperRate;
  const incomeTestAnnualRate = Math.max(maximumAnnualRate - incomeReduction, 0);
  const annualPayment = Math.min(maximumAnnualRate, assetsTestAnnualRate, incomeTestAnnualRate);
  const bindingTest =
    annualPayment === assetsTestAnnualRate && annualPayment < incomeTestAnnualRate
      ? "assets"
      : annualPayment === incomeTestAnnualRate && annualPayment < assetsTestAnnualRate
        ? "income"
        : "maximum";

  return {
    assessableAssets: input.assessableAssets,
    deemedIncome,
    maximumAnnualRate,
    assetsTestAnnualRate,
    incomeTestAnnualRate,
    annualPayment,
    bindingTest,
  };
}
