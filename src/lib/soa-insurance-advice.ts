import type {
  AdviceCaseV1,
  AdvicePersonV1,
  AdviceRecommendationsV1,
  ExistingInsuranceItemV1,
  InsuranceAdvicePersonV1,
  InsuranceCurrentCoverBenefitV1,
  InsuranceCurrentCoverReviewV1,
  InsuranceCurrentPolicyReviewV1,
  InsuranceInsurabilityAssessmentV1,
  InsuranceNeedsAnalysisV1,
  InsurancePolicyRecommendationV1,
  InsurancePolicyReplacementV1,
  InsuranceProductResearchOptionV1,
} from "@/lib/soa-types";

function makeStableId(prefix: string, seed: string | number) {
  return `${prefix}-${String(seed).replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "item"}`;
}

export function createEmptyInsuranceCurrentCoverReview(): InsuranceCurrentCoverReviewV1 {
  return {
    summary: null,
    policies: [],
    reviewNotes: null,
  };
}

export function createEmptyInsuranceInsurabilityAssessment(): InsuranceInsurabilityAssessmentV1 {
  return {
    healthDisclosureStatus: "unknown",
    abilityToObtainCover: "unknown",
    healthNotes: null,
    occupationNotes: null,
    hazardousPursuitsNotes: null,
    claimsHistoryNotes: null,
    underwritingConcerns: null,
    replacementRiskNotes: null,
    adviserAssessment: null,
  };
}

function getPeople(adviceCase: Pick<AdviceCaseV1, "clientGroup">): AdvicePersonV1[] {
  return adviceCase.clientGroup.clients;
}

function getFallbackPersonId(adviceCase: Pick<AdviceCaseV1, "clientGroup">) {
  return getPeople(adviceCase)[0]?.personId ?? "client";
}

function personIdsForNeedsAnalysis(
  analysis: InsuranceNeedsAnalysisV1,
  adviceCase: Pick<AdviceCaseV1, "clientGroup">,
) {
  return analysis.ownerPersonIds.length ? analysis.ownerPersonIds : [getFallbackPersonId(adviceCase)];
}

function personIdForPolicy(
  policy: InsurancePolicyRecommendationV1,
  adviceCase: Pick<AdviceCaseV1, "clientGroup">,
) {
  return policy.insuredPersonId || getFallbackPersonId(adviceCase);
}

function personIdForReplacement(
  replacement: InsurancePolicyReplacementV1,
  adviceCase: Pick<AdviceCaseV1, "clientGroup">,
) {
  return replacement.ownerPersonId || getFallbackPersonId(adviceCase);
}

function currentCoverBenefitFromExisting(item: ExistingInsuranceItemV1): InsuranceCurrentCoverBenefitV1 {
  return {
    benefitId: makeStableId("current-benefit", item.itemId),
    coverType: item.policyType,
    details: item.provider ?? null,
    sumInsured: item.policyType === "income-protection" ? null : item.sumInsured ?? null,
    monthlyBenefit: item.policyType === "income-protection" ? item.sumInsured ?? null : null,
    premiumAmount: item.premium ?? null,
    premiumFrequency: null,
    waitingPeriod: null,
    benefitPeriod: null,
    status: item.status,
    exclusionsOrLoadings: null,
    notes: null,
  };
}

function currentPolicyFromExisting(item: ExistingInsuranceItemV1): InsuranceCurrentPolicyReviewV1 {
  return {
    policyId: makeStableId("current-policy", item.itemId),
    ownerPersonIds: item.ownerPersonIds,
    insuredPersonId: item.ownerPersonIds[0] ?? null,
    insurerName: item.provider ?? null,
    productName: null,
    policyName: item.provider ?? null,
    policyNumber: null,
    ownership: "unknown",
    fundingSource: null,
    linkedSuperFund: null,
    status: item.status,
    premiumAmount: item.premium ?? null,
    premiumFrequency: null,
    annualisedPremium: null,
    benefits: [currentCoverBenefitFromExisting(item)],
    exclusionsOrLoadings: null,
    retainabilityNotes: null,
    variationOptions: null,
    replacementRiskNotes: null,
    sourceEvidence: null,
  };
}

function buildBaseAdvicePerson(person: AdvicePersonV1): InsuranceAdvicePersonV1 {
  return {
    adviceId: makeStableId("insurance-advice", person.personId),
    personId: person.personId,
    currentCoverReview: createEmptyInsuranceCurrentCoverReview(),
    insurabilityAssessment: createEmptyInsuranceInsurabilityAssessment(),
    needsAnalyses: [],
    productResearchOptions: [],
    recommendations: [],
    replacementAnalyses: [],
  };
}

function preserveExistingCanonicalFields(
  target: InsuranceAdvicePersonV1,
  existing: InsuranceAdvicePersonV1 | null | undefined,
) {
  if (!existing) return target;

  return {
    ...target,
    adviceId: existing.adviceId || target.adviceId,
    currentCoverReview: existing.currentCoverReview ?? target.currentCoverReview,
    insurabilityAssessment: existing.insurabilityAssessment ?? target.insurabilityAssessment,
    productResearchOptions: existing.productResearchOptions ?? target.productResearchOptions,
  };
}

export function buildInsuranceAdviceFromLegacy(adviceCase: Pick<AdviceCaseV1, "clientGroup" | "financialSituation" | "recommendations">) {
  const byPerson = new Map(getPeople(adviceCase).map((person) => [person.personId, buildBaseAdvicePerson(person)]));
  const fallbackPersonId = getFallbackPersonId(adviceCase);
  const ensurePersonAdvice = (personId: string) => {
    const existing = byPerson.get(personId);
    if (existing) return existing;

    const created = buildBaseAdvicePerson({
      personId,
      role: "client",
      fullName: "Client",
    });
    byPerson.set(personId, created);
    return created;
  };

  for (const item of adviceCase.financialSituation.insurance ?? []) {
    const ownerIds = item.ownerPersonIds.length ? item.ownerPersonIds : [fallbackPersonId];
    for (const personId of ownerIds) {
      const advice = ensurePersonAdvice(personId);
      advice.currentCoverReview.policies.push(currentPolicyFromExisting({ ...item, ownerPersonIds: ownerIds }));
    }
  }

  for (const analysis of adviceCase.recommendations.insuranceNeedsAnalyses ?? []) {
    for (const personId of personIdsForNeedsAnalysis(analysis, adviceCase)) {
      ensurePersonAdvice(personId).needsAnalyses.push(analysis);
    }
  }

  for (const policy of adviceCase.recommendations.insurancePolicies ?? []) {
    ensurePersonAdvice(personIdForPolicy(policy, adviceCase)).recommendations.push(policy);
  }

  for (const replacement of adviceCase.recommendations.insuranceReplacements ?? []) {
    ensurePersonAdvice(personIdForReplacement(replacement, adviceCase)).replacementAnalyses.push(replacement);
  }

  return Array.from(byPerson.values());
}

export function getInsuranceAdvicePeople(adviceCase: Pick<AdviceCaseV1, "clientGroup" | "financialSituation" | "recommendations">) {
  const canonical = adviceCase.recommendations.insuranceAdvice;

  if (canonical?.length) {
    const byPerson = new Map(canonical.map((entry) => [entry.personId, entry]));
    return getPeople(adviceCase).map((person) => byPerson.get(person.personId) ?? buildBaseAdvicePerson(person));
  }

  return buildInsuranceAdviceFromLegacy(adviceCase);
}

export function flattenInsuranceNeedsAnalysesFromAdvice(insuranceAdvice: InsuranceAdvicePersonV1[]) {
  return insuranceAdvice.flatMap((entry) => entry.needsAnalyses);
}

export function flattenInsuranceRecommendationsFromAdvice(insuranceAdvice: InsuranceAdvicePersonV1[]) {
  return insuranceAdvice.flatMap((entry) => entry.recommendations);
}

export function flattenInsuranceReplacementsFromAdvice(insuranceAdvice: InsuranceAdvicePersonV1[]) {
  return insuranceAdvice.flatMap((entry) => entry.replacementAnalyses);
}

export function flattenInsuranceProductResearchFromAdvice(insuranceAdvice: InsuranceAdvicePersonV1[]) {
  return insuranceAdvice.flatMap((entry) => entry.productResearchOptions);
}

export function syncLegacyInsuranceFieldsFromAdvice(recommendations: AdviceRecommendationsV1): AdviceRecommendationsV1 {
  const insuranceAdvice = recommendations.insuranceAdvice;

  if (!insuranceAdvice?.length) return recommendations;

  return {
    ...recommendations,
    insuranceNeedsAnalyses: flattenInsuranceNeedsAnalysesFromAdvice(insuranceAdvice),
    insurancePolicies: flattenInsuranceRecommendationsFromAdvice(insuranceAdvice),
    insuranceReplacements: flattenInsuranceReplacementsFromAdvice(insuranceAdvice),
  };
}

export function mergeLegacyInsuranceIntoAdvice(adviceCase: AdviceCaseV1): AdviceCaseV1 {
  const derived = buildInsuranceAdviceFromLegacy(adviceCase);
  const existingByPerson = new Map((adviceCase.recommendations.insuranceAdvice ?? []).map((entry) => [entry.personId, entry]));
  const insuranceAdvice = derived.map((entry) => preserveExistingCanonicalFields(entry, existingByPerson.get(entry.personId)));

  return {
    ...adviceCase,
    recommendations: syncLegacyInsuranceFieldsFromAdvice({
      ...adviceCase.recommendations,
      insuranceAdvice,
    }),
  };
}

export function hasCurrentCoverReviewContent(insuranceAdvice: InsuranceAdvicePersonV1[]) {
  return insuranceAdvice.some(
    (entry) =>
      entry.currentCoverReview.policies.length > 0 ||
      Boolean(entry.currentCoverReview.summary?.trim()) ||
      Boolean(entry.currentCoverReview.reviewNotes?.trim()) ||
      Boolean(entry.insurabilityAssessment.healthNotes?.trim()) ||
      Boolean(entry.insurabilityAssessment.occupationNotes?.trim()) ||
      Boolean(entry.insurabilityAssessment.underwritingConcerns?.trim()) ||
      Boolean(entry.insurabilityAssessment.replacementRiskNotes?.trim()) ||
      Boolean(entry.insurabilityAssessment.adviserAssessment?.trim()),
  );
}

export function hasInsuranceRecommendationsContent(insuranceAdvice: InsuranceAdvicePersonV1[]) {
  return insuranceAdvice.some(
    (entry) =>
      entry.productResearchOptions.length > 0 ||
      entry.recommendations.length > 0 ||
      entry.replacementAnalyses.length > 0,
  );
}

export type { InsuranceProductResearchOptionV1 };
