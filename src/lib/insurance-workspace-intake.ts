import type { ClientProfile } from "@/lib/api/types";
import type {
  AdvicePersonV1,
  InsuranceAdvicePersonV1,
  InsuranceCurrentCoverBenefitV1,
  InsuranceCurrentPolicyReviewV1,
  InsuranceInsurabilityAssessmentV1,
  InsuranceNeedsAnalysisV1,
  InsurancePolicyCoverComponentV1,
  InsurancePolicyCoverTypeV1,
  InsurancePolicyOwnershipGroupV1,
  InsurancePolicyRecommendationV1,
  InsurancePolicyReplacementV1,
  InsuranceProductResearchOptionV1,
} from "@/lib/soa-types";
import type {
  IntakeAssessmentV1,
  IntakeInsuranceAdvicePersonV1,
  IntakeInsuranceNeedsAnalysisLineItemV1,
  IntakeInsuranceNeedsAnalysisV1,
} from "@/lib/soa-output-contracts";
import {
  createEmptyInsuranceCurrentCoverReview,
  createEmptyInsuranceInsurabilityAssessment,
} from "@/lib/soa-insurance-advice";

type IntakeCurrentCoverReview = NonNullable<IntakeInsuranceAdvicePersonV1["currentCoverReview"]>;
type IntakeCurrentPolicy = NonNullable<IntakeCurrentCoverReview["policies"]>[number];
type IntakeCurrentBenefit = NonNullable<IntakeCurrentPolicy["benefits"]>[number];
type IntakePolicyRecommendation = NonNullable<IntakeInsuranceAdvicePersonV1["recommendations"]>[number];
type IntakeOwnershipGroup = IntakePolicyRecommendation["ownershipGroups"][number];
type IntakeCoverComponent = IntakeOwnershipGroup["covers"][number];
type IntakeResearchOption = NonNullable<IntakeInsuranceAdvicePersonV1["productResearchOptions"]>[number];
type IntakeReplacement = NonNullable<IntakeInsuranceAdvicePersonV1["replacementAnalyses"]>[number];

function makeStableId(prefix: string, seed: string | number | null | undefined) {
  const normalized = String(seed || prefix)
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${prefix}-${normalized || "item"}`;
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordValue(record: unknown, key: string) {
  if (!record || typeof record !== "object") return null;
  return (record as Record<string, unknown>)[key];
}

function profilePersonName(profile: ClientProfile, key: "client" | "partner") {
  const person = key === "client" ? profile.client : profile.partner;
  return textValue(person?.name) || (key === "client" ? "Client" : "Partner");
}

export function peopleFromClientProfile(profile: ClientProfile): AdvicePersonV1[] {
  const people: AdvicePersonV1[] = [
    {
      personId: "client",
      role: "client",
      fullName: profilePersonName(profile, "client"),
    },
  ];

  if (textValue(profile.partner?.name)) {
    people.push({
      personId: "partner",
      role: "partner",
      fullName: profilePersonName(profile, "partner"),
    });
  }

  return people;
}

function resolvePersonId(name: string | null | undefined, people: AdvicePersonV1[]) {
  const normalized = textValue(name).toLowerCase();
  if (!normalized) return people[0]?.personId ?? "client";

  return (
    people.find((person) => {
      const personName = person.fullName.toLowerCase();
      return personName === normalized || personName.includes(normalized) || normalized.includes(personName);
    })?.personId ??
    people[0]?.personId ??
    "client"
  );
}

function baseAdvicePerson(person: AdvicePersonV1): InsuranceAdvicePersonV1 {
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

function intakeCoverType(value: string | null | undefined): InsurancePolicyCoverTypeV1 {
  return value === "life" || value === "tpd" || value === "trauma" || value === "income-protection" || value === "other"
    ? value
    : "life";
}

function intakeMethodology(value: IntakeInsuranceNeedsAnalysisV1["methodology"]): InsuranceNeedsAnalysisV1["methodology"] {
  switch (value) {
    case "expense-replacement":
      return "expense-based";
    case "debt-clearance":
      return "debt-plus-education";
    case "multiple-of-income":
      return "income-replacement";
    case "needs-analysis":
      return "capital-needs";
    case "other":
    default:
      return "other";
  }
}

function mapLineItems(items: IntakeInsuranceNeedsAnalysisLineItemV1[] | null | undefined, analysisId: string) {
  return (items ?? []).map((item, index) => ({
    itemId: makeStableId("needs-line", `${analysisId}-${item.key ?? item.title}-${index}`),
    key: item.key ?? null,
    category: item.category ?? null,
    title: item.title,
    life: numberValue(item.life),
    tpd: numberValue(item.tpd),
    trauma: numberValue(item.trauma),
    incomeProtection: numberValue(item.incomeProtection),
  }));
}

function mapNeedsAnalysis(item: IntakeInsuranceNeedsAnalysisV1, ownerPersonId: string, index: number): InsuranceNeedsAnalysisV1 {
  const analysisId = makeStableId("needs", `${ownerPersonId}-${item.policyType ?? "cover"}-${index}`);
  return {
    analysisId,
    ownerPersonIds: [ownerPersonId],
    policyType: intakeCoverType(item.policyType),
    methodology: intakeMethodology(item.methodology),
    purpose: item.purpose ?? null,
    inputs: {
      annualIncome: numberValue(item.annualIncome),
      annualLivingExpenses: numberValue(item.annualLivingExpenses),
      liabilitiesToRepay: numberValue(item.liabilitiesToRepay),
      dependantsCount: numberValue(item.dependantsCount),
      dependantSupportYears: numberValue(item.dependantSupportYears),
      educationCosts: numberValue(item.educationCosts),
      existingCoverAmount: numberValue(item.existingCoverAmount),
      superannuationBalance: numberValue(item.superannuationBalance),
      otherAssetsAvailable: numberValue(item.otherAssetsAvailable),
      notes: item.sourceNote ?? null,
    },
    outputs: {
      targetCoverAmount: numberValue(item.targetCoverAmount),
      coverGapAmount: numberValue(item.coverGapAmount),
      suggestedWaitingPeriod: item.suggestedWaitingPeriod ?? null,
      suggestedBenefitPeriod: item.suggestedBenefitPeriod ?? null,
      suggestedPolicyOwnership: item.suggestedPolicyOwnership ?? "unknown",
      suggestedStructureNotes: item.rationale ?? null,
    },
    requirements: mapLineItems(item.requirements, analysisId),
    provisions: mapLineItems(item.provisions, analysisId),
    rationale: item.rationale ?? null,
  };
}

function mapCurrentBenefit(benefit: IntakeCurrentBenefit, seed: string): InsuranceCurrentCoverBenefitV1 {
  const coverType = intakeCoverType(benefit.coverType);
  return {
    benefitId: makeStableId("benefit", seed),
    coverType,
    details: benefit.details ?? null,
    sumInsured: coverType === "income-protection" ? null : numberValue(benefit.sumInsured),
    monthlyBenefit: coverType === "income-protection" ? numberValue(benefit.monthlyBenefit ?? benefit.sumInsured) : null,
    premiumAmount: numberValue(benefit.premiumAmount),
    premiumFrequency: benefit.premiumFrequency ?? "unknown",
    waitingPeriod: benefit.waitingPeriod ?? null,
    benefitPeriod: benefit.benefitPeriod ?? null,
    status: benefit.status ?? null,
    exclusionsOrLoadings: benefit.exclusionsOrLoadings ?? null,
    notes: benefit.notes ?? null,
  };
}

function mapCurrentPolicy(
  policy: IntakeCurrentPolicy,
  ownerPersonId: string,
  index: number,
): InsuranceCurrentPolicyReviewV1 {
  const policyId = makeStableId("current-policy", `${ownerPersonId}-${policy.insurerName ?? policy.policyName ?? index}`);
  return {
    policyId,
    ownerPersonIds: [ownerPersonId],
    insuredPersonId: ownerPersonId,
    insurerName: policy.insurerName ?? null,
    productName: policy.productName ?? null,
    policyName: policy.policyName ?? policy.productName ?? policy.insurerName ?? "Current policy",
    policyNumber: policy.policyNumber ?? null,
    ownership: policy.ownership ?? "unknown",
    fundingSource: policy.fundingSource ?? null,
    linkedSuperFund: policy.linkedSuperFund ?? null,
    status: policy.status ?? null,
    premiumAmount: numberValue(policy.premiumAmount),
    premiumFrequency: policy.premiumFrequency ?? "unknown",
    annualisedPremium: numberValue(policy.annualisedPremium),
    benefits: (policy.benefits ?? []).map((benefit, benefitIndex) =>
      mapCurrentBenefit(benefit, `${policyId}-${benefit.coverType ?? "cover"}-${benefitIndex}`),
    ),
    exclusionsOrLoadings: policy.exclusionsOrLoadings ?? null,
    retainabilityNotes: policy.retainabilityNotes ?? null,
    variationOptions: policy.variationOptions ?? null,
    replacementRiskNotes: policy.replacementRiskNotes ?? null,
    sourceEvidence: policy.sourceNote ?? null,
  };
}

function mapInsurability(
  item: IntakeInsuranceAdvicePersonV1["insurabilityAssessment"] | null | undefined,
): InsuranceInsurabilityAssessmentV1 {
  return {
    ...createEmptyInsuranceInsurabilityAssessment(),
    healthDisclosureStatus: item?.healthDisclosureStatus ?? "unknown",
    abilityToObtainCover: item?.abilityToObtainCover ?? "unknown",
    healthNotes: item?.healthNotes ?? null,
    occupationNotes: item?.occupationNotes ?? null,
    hazardousPursuitsNotes: item?.hazardousPursuitsNotes ?? null,
    claimsHistoryNotes: item?.claimsHistoryNotes ?? null,
    underwritingConcerns: item?.underwritingConcerns ?? null,
    replacementRiskNotes: item?.replacementRiskNotes ?? null,
    adviserAssessment: item?.adviserAssessment ?? null,
  };
}

function mapCoverComponent(cover: IntakeCoverComponent, seed: string): InsurancePolicyCoverComponentV1 {
  const coverType = intakeCoverType(cover.coverType);
  return {
    coverId: makeStableId("cover", seed),
    coverType,
    details: cover.details ?? null,
    premiumType: cover.premiumType ?? "unknown",
    sumInsured: coverType === "income-protection" ? null : numberValue(cover.sumInsured),
    monthlyBenefit: coverType === "income-protection" ? numberValue(cover.monthlyBenefit ?? cover.sumInsured) : null,
    premiumAmount: numberValue(cover.premiumAmount),
    waitingPeriod: cover.waitingPeriod ?? null,
    benefitPeriod: cover.benefitPeriod ?? null,
  };
}

function mapOwnershipGroup(group: IntakeOwnershipGroup, seed: string): InsurancePolicyOwnershipGroupV1 {
  return {
    groupId: makeStableId("ownership", seed),
    ownership: group.ownership ?? "unknown",
    fundingSource: group.fundingSource ?? null,
    premiumFrequency: group.premiumFrequency ?? "unknown",
    premiumAmount: numberValue(group.premiumAmount),
    annualisedPremium: numberValue(group.annualisedPremium),
    covers: group.covers.map((cover, index) => mapCoverComponent(cover, `${seed}-${cover.coverType ?? "cover"}-${index}`)),
  };
}

function mapRecommendation(
  item: IntakePolicyRecommendation,
  ownerPersonId: string,
  index: number,
): InsurancePolicyRecommendationV1 {
  const policyRecommendationId = makeStableId("recommended-policy", `${ownerPersonId}-${item.insurerName ?? item.productName ?? index}`);
  return {
    policyRecommendationId,
    insuredPersonId: ownerPersonId,
    action: item.action ?? "not-recommended",
    insurerName: item.insurerName ?? null,
    productName: item.productName ?? null,
    policyName: item.policyName ?? item.productName ?? null,
    recommendationText: item.recommendationText ?? null,
    ownershipGroups: item.ownershipGroups.map((group, groupIndex) =>
      mapOwnershipGroup(group, `${policyRecommendationId}-${group.ownership ?? "ownership"}-${groupIndex}`),
    ),
    optionalBenefits: item.optionalBenefits ?? [],
    premiumBreakdown: item.premiumBreakdown.map((premium, premiumIndex) => ({
      itemId: makeStableId("premium", `${policyRecommendationId}-${premium.label}-${premiumIndex}`),
      ownership: premium.ownership ?? "unknown",
      label: premium.label,
      amount: numberValue(premium.amount),
    })),
    underwritingNotes: item.underwritingNotes ?? null,
    replacementNotes: item.replacementNotes ?? null,
    sourceEvidence: item.sourceNote ?? null,
  };
}

function mapResearchOption(
  option: IntakeResearchOption,
  ownerPersonId: string,
  index: number,
): InsuranceProductResearchOptionV1 {
  return {
    optionId: makeStableId("option", `${ownerPersonId}-${option.insurerName ?? option.productName ?? index}`),
    insurerName: option.insurerName ?? null,
    productName: option.productName ?? null,
    ownership: option.ownership ?? "unknown",
    actionConsidered: option.actionConsidered ?? "not-recommended",
    coverSummary: option.coverSummary ?? null,
    premiumAmount: numberValue(option.premiumAmount),
    premiumFrequency: option.premiumFrequency ?? "unknown",
    annualisedPremium: numberValue(option.annualisedPremium),
    keyFeatures: option.keyFeatures ?? [],
    limitations: option.limitations ?? [],
    underwritingAssumptions: option.underwritingAssumptions ?? null,
    status: option.status ?? "unknown",
    rationale: option.rationale ?? null,
    sourceEvidence: option.sourceNote ?? null,
  };
}

function mapReplacement(
  replacement: IntakeReplacement,
  ownerPersonId: string,
  index: number,
): InsurancePolicyReplacementV1 {
  return {
    replacementId: makeStableId("replacement", `${ownerPersonId}-${replacement.currentInsurer ?? replacement.recommendedInsurer ?? index}`),
    ownerPersonId,
    currentPolicy: {
      insurer: replacement.currentInsurer ?? null,
      totalLifeCover: numberValue(replacement.currentLifeCover),
      totalTpdCover: numberValue(replacement.currentTpdCover),
      totalIncomeProtectionCover: numberValue(replacement.currentIncomeProtectionCover),
      totalTraumaCover: numberValue(replacement.currentTraumaCover),
      totalAnnualPremium: numberValue(replacement.currentAnnualPremium),
    },
    recommendedPolicy: {
      insurer: replacement.recommendedInsurer ?? null,
      totalLifeCover: numberValue(replacement.recommendedLifeCover),
      totalTpdCover: numberValue(replacement.recommendedTpdCover),
      totalIncomeProtectionCover: numberValue(replacement.recommendedIncomeProtectionCover),
      totalTraumaCover: numberValue(replacement.recommendedTraumaCover),
      totalAnnualPremium: numberValue(replacement.recommendedAnnualPremium),
    },
    premiumDifference: numberValue(replacement.premiumDifference),
    reasons: replacement.reasons ?? [],
    costs: replacement.costs ?? [],
    benefitsGained: replacement.benefitsGained ?? [],
    benefitsLost: replacement.benefitsLost ?? [],
    notes: replacement.notes ?? replacement.sourceNote ?? null,
    linkedPolicyRecommendationIds: [],
  };
}

export function mapIntakeInsuranceAdviceToCanonical(
  assessment: IntakeAssessmentV1,
  people: AdvicePersonV1[],
): InsuranceAdvicePersonV1[] {
  const byPerson = new Map(people.map((person) => [person.personId, baseAdvicePerson(person)]));
  const ensurePersonAdvice = (personId: string) => {
    const existing = byPerson.get(personId);
    if (existing) return existing;
    const created = baseAdvicePerson({ personId, role: "client", fullName: "Client" });
    byPerson.set(personId, created);
    return created;
  };

  for (const item of assessment.candidateInsuranceAdvice ?? []) {
    const personId = resolvePersonId(item.insuredName, people);
    const advice = ensurePersonAdvice(personId);
    advice.currentCoverReview = {
      summary: item.currentCoverReview?.summary ?? advice.currentCoverReview.summary ?? null,
      reviewNotes: item.currentCoverReview?.reviewNotes ?? advice.currentCoverReview.reviewNotes ?? null,
      policies: (item.currentCoverReview?.policies ?? []).map((policy, index) => mapCurrentPolicy(policy, personId, index)),
    };
    advice.insurabilityAssessment = mapInsurability(item.insurabilityAssessment);
    advice.needsAnalyses = (item.needsAnalyses ?? []).map((analysis, index) => mapNeedsAnalysis(analysis, personId, index));
    advice.productResearchOptions = (item.productResearchOptions ?? []).map((option, index) => mapResearchOption(option, personId, index));
    advice.recommendations = (item.recommendations ?? []).map((recommendation, index) => mapRecommendation(recommendation, personId, index));
    advice.replacementAnalyses = (item.replacementAnalyses ?? []).map((replacement, index) => mapReplacement(replacement, personId, index));
  }

  for (const analysis of assessment.candidateInsuranceNeedsAnalyses ?? []) {
    const personId = resolvePersonId(analysis.ownerName, people);
    ensurePersonAdvice(personId).needsAnalyses.push(mapNeedsAnalysis(analysis, personId, 1000 + ensurePersonAdvice(personId).needsAnalyses.length));
  }

  for (const recommendation of assessment.candidateInsurancePolicyRecommendations ?? []) {
    const personId = resolvePersonId(recommendation.insuredName, people);
    ensurePersonAdvice(personId).recommendations.push(
      mapRecommendation(recommendation, personId, 1000 + ensurePersonAdvice(personId).recommendations.length),
    );
  }

  for (const replacement of assessment.candidateInsurancePolicyReplacements ?? []) {
    const personId = resolvePersonId(replacement.ownerName, people);
    ensurePersonAdvice(personId).replacementAnalyses.push(
      mapReplacement(replacement, personId, 1000 + ensurePersonAdvice(personId).replacementAnalyses.length),
    );
  }

  return Array.from(byPerson.values());
}

export function buildInsuranceIntakeProfileContext(profile: ClientProfile) {
  const client = profile.client;
  const partner = profile.partner;
  const parts = {
    client: {
      name: client?.name ?? null,
      dateOfBirth: recordValue(client, "dateOfBirth") ?? recordValue(client, "dob") ?? null,
      riskProfile: recordValue(client, "riskProfile") ?? recordValue(client, "risk_profile") ?? null,
      healthStatus: recordValue(client, "healthStatus") ?? recordValue(client, "health_status") ?? null,
      healthHistory: recordValue(client, "healthHistory") ?? recordValue(client, "health_history") ?? null,
      smoker: recordValue(client, "smoker") ?? null,
      employmentStatus: recordValue(client, "employmentStatus") ?? recordValue(client, "employment_status") ?? null,
      occupation: recordValue(client, "occupation") ?? null,
    },
    partner: partner?.name
      ? {
          name: partner.name,
          dateOfBirth: recordValue(partner, "dateOfBirth") ?? recordValue(partner, "dob") ?? null,
          riskProfile: recordValue(partner, "riskProfile") ?? recordValue(partner, "risk_profile") ?? null,
          healthStatus: recordValue(partner, "healthStatus") ?? recordValue(partner, "health_status") ?? null,
          healthHistory: recordValue(partner, "healthHistory") ?? recordValue(partner, "health_history") ?? null,
          smoker: recordValue(partner, "smoker") ?? null,
          employmentStatus: recordValue(partner, "employmentStatus") ?? recordValue(partner, "employment_status") ?? null,
          occupation: recordValue(partner, "occupation") ?? null,
        }
      : null,
    dependants: profile.dependants ?? [],
    assets: profile.assets ?? [],
    liabilities: profile.liabilities ?? [],
    income: profile.income ?? [],
    expenses: recordValue(profile, "expenses") ?? recordValue(profile, "expense") ?? [],
    superannuation: profile.superannuation ?? [],
    insurance: profile.insurance ?? [],
  };

  return JSON.stringify(parts, null, 2).slice(0, 60000);
}
