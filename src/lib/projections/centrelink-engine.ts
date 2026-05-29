import type { AgePensionProjectionYear, LegislativeAssumptions, ProjectionPerson } from "./types";

function isCouplePerson(person: ProjectionPerson) {
  return person.relationshipStatus === "couple";
}

function calculateDeemedIncome(financialAssets: number, isCouple: boolean, assumptions: LegislativeAssumptions) {
  const deeming = assumptions.agePension.deeming;
  const threshold = isCouple ? deeming.coupleThreshold : deeming.singleThreshold;
  const belowThreshold = Math.min(financialAssets, threshold);
  const aboveThreshold = Math.max(financialAssets - threshold, 0);

  return belowThreshold * deeming.rateBelowThreshold + aboveThreshold * deeming.rateAboveThreshold;
}

function getAgePensionMaximumRate(isCouple: boolean, assumptions: LegislativeAssumptions) {
  return isCouple ? assumptions.agePension.maxAnnualRateCoupleEach : assumptions.agePension.maxAnnualRateSingle;
}

function getAssetsTestThreshold(isCouple: boolean, isHomeowner: boolean, assumptions: LegislativeAssumptions) {
  const assetTest = assumptions.agePension.assetsTest;

  if (isCouple) {
    return isHomeowner ? assetTest.coupleHomeownerThreshold : assetTest.coupleNonHomeownerThreshold;
  }

  return isHomeowner ? assetTest.singleHomeownerThreshold : assetTest.singleNonHomeownerThreshold;
}

function getIncomeTestThreshold(isCouple: boolean, assumptions: LegislativeAssumptions) {
  return isCouple ? assumptions.agePension.incomeTest.coupleCombinedAnnualThreshold : assumptions.agePension.incomeTest.singleAnnualThreshold;
}

function emptyAgePension(input: {
  ageEligible: boolean;
  assessableAssets: number;
  deemedIncome: number;
}): AgePensionProjectionYear {
  return {
    ageEligible: input.ageEligible,
    assessableAssets: input.assessableAssets,
    deemedIncome: input.deemedIncome,
    maximumAnnualRate: 0,
    assetsTestAnnualRate: 0,
    incomeTestAnnualRate: 0,
    annualPayment: 0,
    bindingTest: "not-eligible",
  };
}

function calculateAgePensionForPerson(input: {
  person: ProjectionPerson;
  age: number;
  isCouple: boolean;
  isHomeowner: boolean;
  assessableAssets: number;
  financialAssets: number;
  otherAssessableIncome: number;
  assumptions: LegislativeAssumptions;
}): AgePensionProjectionYear {
  const ageEligible = input.age >= input.assumptions.agePension.qualifyingAge;
  const deemedIncome = calculateDeemedIncome(input.financialAssets, input.isCouple, input.assumptions);

  if (!ageEligible) {
    return emptyAgePension({
      ageEligible,
      assessableAssets: input.assessableAssets,
      deemedIncome,
    });
  }

  const maximumAnnualRate = getAgePensionMaximumRate(input.isCouple, input.assumptions);
  const assetsThreshold = getAssetsTestThreshold(input.isCouple, input.isHomeowner, input.assumptions);
  const assetsTaperShare = input.isCouple ? 0.5 : 1;
  const assetsReduction =
    (Math.max(input.assessableAssets - assetsThreshold, 0) / 1000) *
    input.assumptions.agePension.assetsTest.taperPerThousandPerFortnight *
    26 *
    assetsTaperShare;
  const assetsTestAnnualRate = Math.max(maximumAnnualRate - assetsReduction, 0);
  const incomeThreshold = getIncomeTestThreshold(input.isCouple, input.assumptions);
  const assessableIncome = deemedIncome + input.otherAssessableIncome;
  const incomeTaperShare = input.isCouple ? 0.5 : 1;
  const incomeReduction =
    Math.max(assessableIncome - incomeThreshold, 0) *
    input.assumptions.agePension.incomeTest.taperRate *
    incomeTaperShare;
  const incomeTestAnnualRate = Math.max(maximumAnnualRate - incomeReduction, 0);
  const annualPayment = Math.min(maximumAnnualRate, assetsTestAnnualRate, incomeTestAnnualRate);
  const bindingTest =
    annualPayment === assetsTestAnnualRate && annualPayment < incomeTestAnnualRate
      ? "assets"
      : annualPayment === incomeTestAnnualRate && annualPayment < assetsTestAnnualRate
        ? "income"
        : "maximum";

  return {
    ageEligible,
    assessableAssets: input.assessableAssets,
    deemedIncome,
    maximumAnnualRate,
    assetsTestAnnualRate,
    incomeTestAnnualRate,
    annualPayment,
    bindingTest,
  };
}

function sumAgePensionYears(agePensionByPersonId: Record<string, AgePensionProjectionYear>): AgePensionProjectionYear {
  const personResults = Object.values(agePensionByPersonId);

  return personResults.reduce<AgePensionProjectionYear>(
    (total, result) => ({
      ageEligible: total.ageEligible || result.ageEligible,
      assessableAssets: Math.max(total.assessableAssets, result.assessableAssets),
      deemedIncome: Math.max(total.deemedIncome, result.deemedIncome),
      maximumAnnualRate: total.maximumAnnualRate + result.maximumAnnualRate,
      assetsTestAnnualRate: total.assetsTestAnnualRate + result.assetsTestAnnualRate,
      incomeTestAnnualRate: total.incomeTestAnnualRate + result.incomeTestAnnualRate,
      annualPayment: total.annualPayment + result.annualPayment,
      bindingTest:
        total.bindingTest === "not-eligible"
          ? result.bindingTest
          : result.annualPayment > 0 && result.bindingTest !== total.bindingTest
            ? "maximum"
            : total.bindingTest,
    }),
    {
      ageEligible: false,
      assessableAssets: 0,
      deemedIncome: 0,
      maximumAnnualRate: 0,
      assetsTestAnnualRate: 0,
      incomeTestAnnualRate: 0,
      annualPayment: 0,
      bindingTest: "not-eligible",
    },
  );
}

export function calculateAgePension(input: {
  person: ProjectionPerson;
  age: number;
  assessableAssets: number;
  financialAssets: number;
  otherAssessableIncome: number;
  assumptions: LegislativeAssumptions;
}): AgePensionProjectionYear {
  return calculateAgePensionForPerson({
    ...input,
    isCouple: isCouplePerson(input.person),
    isHomeowner: input.person.isHomeowner,
  });
}

export function calculateHouseholdAgePension(input: {
  people: ProjectionPerson[];
  ageByPersonId: Record<string, number>;
  assessableAssets: number;
  financialAssets: number;
  otherAssessableIncomeByPersonId: Record<string, number>;
  assumptions: LegislativeAssumptions;
}) {
  const isCouple = input.people.some(isCouplePerson) && input.people.length > 1;
  const isHomeowner = isCouple ? input.people.some((person) => person.isHomeowner) : input.people[0]?.isHomeowner ?? false;
  const householdOtherAssessableIncome = Object.values(input.otherAssessableIncomeByPersonId).reduce(
    (total, value) => total + value,
    0,
  );
  const agePensionByPersonId = Object.fromEntries(
    input.people.map((person) => [
      person.personId,
      calculateAgePensionForPerson({
        person,
        age: input.ageByPersonId[person.personId] ?? person.startAge,
        isCouple,
        isHomeowner,
        assessableAssets: input.assessableAssets,
        financialAssets: input.financialAssets,
        otherAssessableIncome: isCouple
          ? householdOtherAssessableIncome
          : input.otherAssessableIncomeByPersonId[person.personId] ?? 0,
        assumptions: input.assumptions,
      }),
    ]),
  );

  return {
    agePension: sumAgePensionYears(agePensionByPersonId),
    agePensionByPersonId,
  };
}
