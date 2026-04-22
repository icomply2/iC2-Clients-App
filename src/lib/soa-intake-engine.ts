import type { AdviceModuleV1 } from "@/lib/soa-types";
import type { IntakeAssessmentV1 } from "@/lib/soa-output-contracts";

export type IntakeEngineInput = {
  clientName?: string | null;
  uploadedFileNames: string[];
  adviserMessage: string;
};

function hasAny(text: string, patterns: string[]) {
  return patterns.some((pattern) => text.includes(pattern));
}

function uniqueModules(modules: AdviceModuleV1[]) {
  return [...new Set(modules)];
}

export function generateIntakeAssessment(input: IntakeEngineInput): IntakeAssessmentV1 {
  const text = input.adviserMessage.toLowerCase();
  const candidateModules: AdviceModuleV1[] = [];

  if (
    hasAny(text, [
      "salary sacrifice",
      "concessional",
      "retire",
      "retirement",
      "downsize",
      "downsizing",
      "strategy",
      "super",
    ])
  ) {
    candidateModules.push("strategy-advice");
  }

  if (hasAny(text, ["projection", "compare current", "better position", "retire", "retirement", "downsize", "sell his house", "sell her house", "sell home", "sale proceeds"])) {
    candidateModules.push("projection-analysis");
  }

  if (hasAny(text, ["product", "fund", "platform", "provider", "account based pension", "super fund"])) {
    candidateModules.push("product-advice");
  }

  if (hasAny(text, ["replace", "replacement", "switch", "rollover"])) {
    candidateModules.push("replacement-advice", "product-advice");
  }

  if (hasAny(text, ["allocation", "portfolio", "growth", "defensive", "rebalance"])) {
    candidateModules.push("portfolio-advice");
  }

  if (hasAny(text, ["insurance", "life cover", "tpd", "trauma", "income protection"])) {
    candidateModules.push("insurance-advice");
  }

  const normalizedModules = uniqueModules(candidateModules.length ? candidateModules : ["strategy-advice"]);

  const candidateObjectives = [
    hasAny(text, ["salary sacrifice", "concessional", "super"])
      ? {
          text: "Increase super contributions in a tax-effective way.",
          priority: "high" as const,
          sourceNote: "Derived from adviser intake message.",
        }
      : null,
    hasAny(text, ["retire", "retirement"])
      ? {
          text: "Prepare for retirement and improve long-term retirement funding.",
          priority: "high" as const,
          sourceNote: "Derived from adviser intake message.",
        }
      : null,
    hasAny(text, ["downsize", "sell home", "sell his house", "sell her house", "apartment"])
      ? {
          text: "Plan for the future home sale and downsizing strategy.",
          priority: "medium" as const,
          sourceNote: "Derived from adviser intake message.",
        }
      : null,
  ].filter(Boolean) as IntakeAssessmentV1["candidateObjectives"];

  const candidateStrategies = [
    hasAny(text, ["salary sacrifice", "concessional"])
      ? {
          text: "Salary sacrifice to super up to an appropriate concessional contribution target.",
          linkedThemes: ["super contributions", "retirement funding"],
          sourceNote: "Derived from adviser intake message.",
        }
      : null,
    hasAny(text, ["downsize", "sell home", "sale proceeds"])
      ? {
          text: "Use future home sale and downsizing proceeds as part of the retirement strategy.",
          linkedThemes: ["downsizing", "retirement strategy"],
          sourceNote: "Derived from adviser intake message.",
        }
      : null,
  ].filter(Boolean) as IntakeAssessmentV1["candidateStrategies"];

  const missingInformation = [
    hasAny(text, ["retire", "retirement"]) && !hasAny(text, ["3 years", "two years", "5 years", "age "])
      ? "Retirement timing is not yet clear enough."
      : null,
    hasAny(text, ["sell home", "sell his house", "sell her house", "sale proceeds", "downsize"]) && !hasAny(text, ["proceeds", "$", "funds"])
      ? "Expected sale proceeds and intended use of those proceeds are not yet clear."
      : null,
    normalizedModules.includes("product-advice") && !hasAny(text, ["recommend", "provider", "fund", "platform"])
      ? "Product recommendation intent may need clarification."
      : null,
    normalizedModules.includes("projection-analysis")
      ? "Projection assumptions will need confirmation before workflow review."
      : null,
  ].filter(Boolean) as string[];

  const followUpQuestions = [
    hasAny(text, ["retire", "retirement"])
      ? "What retirement timing should I assume for this SOA?"
      : "What is the main timing objective we should anchor the advice to?",
    hasAny(text, ["sell home", "sell his house", "sell her house", "downsize"])
      ? "How do you expect the home sale and downsizing proceeds to be used?"
      : "Are there any major assets or future transactions that are central to the advice?",
    normalizedModules.includes("product-advice")
      ? "Is this matter strategy-only, or do you expect a product recommendation as well?"
      : "Can you confirm whether this SOA is strategy-only or whether product advice is also in scope?",
  ].filter(Boolean) as string[];

  const matterSummary = `I understand this matter as advice for ${input.clientName ?? "the selected client"} focused on ${candidateStrategies.length ? candidateStrategies.map((item) => item.text.toLowerCase()).join(" and ") : "a strategy-led SOA"}, based on ${input.uploadedFileNames.length} uploaded supporting file${input.uploadedFileNames.length === 1 ? "" : "s"} and your intake instructions.`;

  return {
    matterSummary,
    candidateModules: normalizedModules,
    candidateObjectives,
    candidateStrategies,
    candidateScopeInclusions: [
      normalizedModules.includes("strategy-advice") ? "Strategic advice" : null,
      normalizedModules.includes("product-advice") ? "Product review and recommendation" : null,
      normalizedModules.includes("replacement-advice") ? "Replacement analysis" : null,
      normalizedModules.includes("insurance-advice") ? "Insurance needs analysis and cover review" : null,
      normalizedModules.includes("projection-analysis") ? "Projection analysis and future position comparison" : null,
    ].filter(Boolean) as string[],
    candidateScopeExclusions: [
      !normalizedModules.includes("insurance-advice") ? "Insurance advice not currently assumed to be in scope." : null,
      !normalizedModules.includes("product-advice") ? "Product replacement is not currently assumed unless confirmed." : null,
    ].filter(Boolean) as string[],
    candidateStrategyRecommendations: candidateStrategies.map((item) => item.text),
    candidateProductReviewNotes: normalizedModules.includes("product-advice")
      ? ["Review the suitability of current products and identify whether replacement or retention is appropriate."]
      : [],
    candidateInsuranceReviewNotes: normalizedModules.includes("insurance-advice")
      ? ["Review existing cover and determine whether current levels and structure remain suitable."]
      : [],
    candidateProjectionNotes: normalizedModules.includes("projection-analysis")
      ? ["Model current versus recommended future position using the key retirement and asset assumptions."]
      : [],
    missingInformation,
    followUpQuestions,
    confidence: input.uploadedFileNames.length >= 2 ? "medium" : "low",
  };
}

export function refineIntakeAssessment(
  current: IntakeAssessmentV1,
  input: IntakeEngineInput,
): IntakeAssessmentV1 {
  const next = generateIntakeAssessment(input);

  return {
    matterSummary: next.matterSummary,
    candidateModules: [...new Set([...current.candidateModules, ...next.candidateModules])],
    candidateObjectives: [...current.candidateObjectives, ...next.candidateObjectives].filter(
      (objective, index, array) =>
        array.findIndex((entry) => entry.text.trim().toLowerCase() === objective.text.trim().toLowerCase()) === index,
    ),
    candidateStrategies: [...current.candidateStrategies, ...next.candidateStrategies].filter(
      (strategy, index, array) =>
        array.findIndex((entry) => entry.text.trim().toLowerCase() === strategy.text.trim().toLowerCase()) === index,
    ),
    candidateScopeInclusions: [...new Set([...current.candidateScopeInclusions, ...next.candidateScopeInclusions])],
    candidateScopeExclusions: [...new Set([...current.candidateScopeExclusions, ...next.candidateScopeExclusions])],
    candidateStrategyRecommendations: [
      ...new Set([...current.candidateStrategyRecommendations, ...next.candidateStrategyRecommendations]),
    ],
    candidateProductReviewNotes: [
      ...new Set([...current.candidateProductReviewNotes, ...next.candidateProductReviewNotes]),
    ],
    candidateInsuranceReviewNotes: [
      ...new Set([...current.candidateInsuranceReviewNotes, ...next.candidateInsuranceReviewNotes]),
    ],
    candidateProjectionNotes: [
      ...new Set([...current.candidateProjectionNotes, ...next.candidateProjectionNotes]),
    ],
    missingInformation: [...new Set([...current.missingInformation, ...next.missingInformation])],
    followUpQuestions: [...new Set([...current.followUpQuestions, ...next.followUpQuestions])],
    confidence: current.confidence === "high" || next.confidence === "high" ? "high" : "medium",
  };
}
