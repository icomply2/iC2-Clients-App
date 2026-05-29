import type { ProductRecommendationV1, StrategicRecommendationV1 } from "@/lib/soa-types";
import { sanitizeClientFacingResearchLanguage } from "@/lib/soa-recommendation-language";

export type SoaSectionEditRequest = {
  sectionId: string;
  clientName?: string | null;
  adviserInstruction: string;
  sectionState: unknown;
  recentMessages?: Array<{
    role?: "assistant" | "user";
    content?: string;
  }> | null;
};

export type SoaSectionEditResponse = {
  sectionId: string;
  summary: string;
  source: "llm" | "fallback";
  model: string | null;
  warning?: string | null;
  scope?: {
    included: string[];
    exclusions: string[];
  } | null;
  objectives?: Array<{
    text: string;
    priority: "high" | "medium" | "low" | "unknown" | null;
  }> | null;
  strategyRecommendations?: {
    mode: "replace-all";
    recommendations: StrategicRecommendationV1[];
  } | null;
  productRecommendations?: {
    mode: "replace-all";
    recommendations: ProductRecommendationV1[];
  } | null;
  proposalSummary?: string[];
  requiresClarification?: boolean;
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim() ?? "";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
const OPENAI_SECTION_EDIT_MODEL = process.env.OPENAI_SECTION_EDIT_MODEL?.trim() || process.env.OPENAI_SOA_INTAKE_MODEL?.trim() || "gpt-5.2";

const sectionEditJsonSchema = {
  name: "soa_section_edit",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      sectionId: { type: "string" },
      summary: { type: "string" },
      scope: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            properties: {
              included: { type: "array", items: { type: "string" } },
              exclusions: { type: "array", items: { type: "string" } },
            },
            required: ["included", "exclusions"],
          },
          { type: "null" },
        ],
      },
      objectives: {
        anyOf: [
          {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                text: { type: "string" },
                priority: {
                  anyOf: [
                    { type: "string", enum: ["high", "medium", "low", "unknown"] },
                    { type: "null" },
                  ],
                },
              },
              required: ["text", "priority"],
            },
          },
          { type: "null" },
        ],
      },
      strategyRecommendations: { type: "null" },
      productRecommendations: { type: "null" },
      proposalSummary: { type: "array", items: { type: "string" } },
      requiresClarification: { type: "boolean" },
    },
    required: [
      "sectionId",
      "summary",
      "scope",
      "objectives",
      "strategyRecommendations",
      "productRecommendations",
      "proposalSummary",
      "requiresClarification",
    ],
  },
} as const;

const recommendationEditPlanJsonSchema = {
  name: "soa_recommendation_edit_plan",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      proposalSummary: { type: "array", items: { type: "string" } },
      requiresClarification: { type: "boolean" },
      mode: { type: "string", enum: ["add", "edit", "clarify"] },
      targetIndex: { anyOf: [{ type: "integer" }, { type: "null" }] },
      ownerPersonIds: { anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }] },
      recommendationText: { anyOf: [{ type: "string" }, { type: "null" }] },
      clientBenefits: { anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }] },
      consequences: { anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }] },
      alternatives: { anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }] },
      productAction: { anyOf: [{ type: "string" }, { type: "null" }] },
      productType: { anyOf: [{ type: "string" }, { type: "null" }] },
      currentProductName: { anyOf: [{ type: "string" }, { type: "null" }] },
      currentProvider: { anyOf: [{ type: "string" }, { type: "null" }] },
      recommendedProductName: { anyOf: [{ type: "string" }, { type: "null" }] },
      recommendedProvider: { anyOf: [{ type: "string" }, { type: "null" }] },
    },
    required: [
      "summary",
      "proposalSummary",
      "requiresClarification",
      "mode",
      "targetIndex",
      "ownerPersonIds",
      "recommendationText",
      "clientBenefits",
      "consequences",
      "alternatives",
      "productAction",
      "productType",
      "currentProductName",
      "currentProvider",
      "recommendedProductName",
      "recommendedProvider",
    ],
  },
} as const;

type RecommendationEditPlan = {
  summary: string;
  proposalSummary: string[];
  requiresClarification: boolean;
  mode: "add" | "edit" | "clarify";
  targetIndex: number | null;
  ownerPersonIds: string[] | null;
  recommendationText: string | null;
  clientBenefits: string[] | null;
  consequences: string[] | null;
  alternatives: string[] | null;
  productAction: string | null;
  productType: string | null;
  currentProductName: string | null;
  currentProvider: string | null;
  recommendedProductName: string | null;
  recommendedProvider: string | null;
};

function isAzureOpenAiBaseUrl(baseUrl: string) {
  return /(?:\.openai\.azure\.com|\.services\.ai\.azure\.com)/i.test(baseUrl);
}

function getMissingConfigurationWarning() {
  const missingKeys: string[] = [];

  if (!OPENAI_API_KEY) {
    missingKeys.push("OPENAI_API_KEY");
  }

  if (!OPENAI_BASE_URL) {
    missingKeys.push("OPENAI_BASE_URL");
  }

  if (!OPENAI_SECTION_EDIT_MODEL) {
    missingKeys.push("OPENAI_SECTION_EDIT_MODEL");
  }

  return missingKeys.length
    ? `Finley section editing is not configured yet. Add ${missingKeys.join(", ")} to your local server environment to enable schema-aware card edits.`
    : null;
}

function parseJsonObject(text: string) {
  return JSON.parse(text) as unknown;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizePriority(value: unknown): "high" | "medium" | "low" | "unknown" | null {
  return value === "high" || value === "medium" || value === "low" || value === "unknown" ? value : null;
}

function normalizeObjectives(value: unknown) {
  if (!Array.isArray(value)) return null;

  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return {
          text: entry.trim(),
          priority: "unknown" as const,
        };
      }

      if (!entry || typeof entry !== "object") {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const text = typeof record.text === "string" ? record.text.trim() : "";

      if (!text) {
        return null;
      }

      return {
        text,
        priority: normalizePriority(record.priority) ?? "unknown",
      };
    })
    .filter((entry): entry is { text: string; priority: "high" | "medium" | "low" | "unknown" } => Boolean(entry));
}

function normalizeSectionEdit(
  value: unknown,
  sectionId: string,
): Pick<SoaSectionEditResponse, "sectionId" | "summary" | "scope" | "objectives"> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const responseSectionId = typeof record.sectionId === "string" && record.sectionId.trim() ? record.sectionId.trim() : sectionId;
  const summary = typeof record.summary === "string" && record.summary.trim() ? record.summary.trim() : "Updated section.";
  const scope =
    record.scope && typeof record.scope === "object"
      ? {
          included: normalizeStringArray((record.scope as Record<string, unknown>).included),
          exclusions: normalizeStringArray((record.scope as Record<string, unknown>).exclusions),
        }
      : null;
  const objectives = normalizeObjectives(record.objectives);

  return {
    sectionId: responseSectionId,
    summary,
    scope,
    objectives,
  };
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function appendUniqueValues(current: string[], next: string[]) {
  const seen = new Set(current.map(normalizeText));
  const merged = [...current];

  next.forEach((item) => {
    const normalized = normalizeText(item);
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    merged.push(item);
  });

  return merged;
}

function hasRemovalIntent(text: string) {
  return /\b(remove|delete|drop|omit|take out)\b/i.test(text);
}

function hasReplacementIntent(text: string) {
  return /\b(replace|rewrite|change|update|edit|amend)\b/i.test(text);
}

function extractFallbackLines(instruction: string) {
  return instruction
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean);
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getSectionRecord(request: SoaSectionEditRequest) {
  return request.sectionState && typeof request.sectionState === "object" ? (request.sectionState as Record<string, unknown>) : {};
}

function getNestedRecord(value: unknown, key: string) {
  if (!value || typeof value !== "object") return {};
  const nested = (value as Record<string, unknown>)[key];
  return nested && typeof nested === "object" ? (nested as Record<string, unknown>) : {};
}

function getCurrentStrategyRecommendations(request: SoaSectionEditRequest) {
  const record = getSectionRecord(request);
  const direct = record.strategyRecommendations;
  if (Array.isArray(direct)) return direct as StrategicRecommendationV1[];

  const recommendations = getNestedRecord(record.adviceCase, "recommendations");
  return Array.isArray(recommendations.strategic) ? (recommendations.strategic as StrategicRecommendationV1[]) : [];
}

function getCurrentProductRecommendations(request: SoaSectionEditRequest) {
  const record = getSectionRecord(request);
  const direct = record.productRecommendations;
  if (Array.isArray(direct)) return direct as ProductRecommendationV1[];

  const recommendations = getNestedRecord(record.adviceCase, "recommendations");
  return Array.isArray(recommendations.product) ? (recommendations.product as ProductRecommendationV1[]) : [];
}

function getClients(request: SoaSectionEditRequest) {
  const record = getSectionRecord(request);
  const directClients = record.clients;
  if (Array.isArray(directClients)) {
    return directClients
      .map((client) => {
        if (!client || typeof client !== "object") return null;
        const clientRecord = client as Record<string, unknown>;
        const personId = typeof clientRecord.personId === "string" ? clientRecord.personId : "";
        const fullName = typeof clientRecord.fullName === "string" ? clientRecord.fullName : "";
        const role = typeof clientRecord.role === "string" ? clientRecord.role : "";
        return personId ? { personId, fullName, role } : null;
      })
      .filter((client): client is { personId: string; fullName: string; role: string } => Boolean(client));
  }

  const adviceCase = getNestedRecord(record, "adviceCase");
  const clientGroup = getNestedRecord(adviceCase, "clientGroup");
  const clients = clientGroup.clients;
  return Array.isArray(clients)
    ? clients
        .map((client) => {
          if (!client || typeof client !== "object") return null;
          const clientRecord = client as Record<string, unknown>;
          const personId = typeof clientRecord.personId === "string" ? clientRecord.personId : "";
          const fullName = typeof clientRecord.fullName === "string" ? clientRecord.fullName : "";
          const role = typeof clientRecord.role === "string" ? clientRecord.role : "";
          return personId ? { personId, fullName, role } : null;
        })
        .filter((client): client is { personId: string; fullName: string; role: string } => Boolean(client))
    : [];
}

function getObjectiveIds(request: SoaSectionEditRequest) {
  const record = getSectionRecord(request);
  const objectives = Array.isArray(record.objectives)
    ? record.objectives
    : Array.isArray(getNestedRecord(record.adviceCase, "objectives").items)
      ? getNestedRecord(record.adviceCase, "objectives").items
      : getNestedRecord(record, "adviceCase").objectives;

  if (!Array.isArray(objectives)) return [];
  return objectives
    .map((objective) =>
      objective && typeof objective === "object" && typeof (objective as Record<string, unknown>).objectiveId === "string"
        ? ((objective as Record<string, unknown>).objectiveId as string)
        : null,
    )
    .filter((objectiveId): objectiveId is string => Boolean(objectiveId));
}

function inferOwnerPersonIds(request: SoaSectionEditRequest, fallbackOwnerPersonIds?: string[]) {
  const instruction = normalizeText(request.adviserInstruction);
  const clients = getClients(request);
  const allClientIds = clients.map((client) => client.personId);

  if (/\b(joint|both|couple|clients|client and partner|partner and client)\b/i.test(request.adviserInstruction)) {
    return allClientIds.length ? allClientIds : fallbackOwnerPersonIds ?? [];
  }

  const matchedClients = clients.filter((client) => {
    const fullName = normalizeText(client.fullName);
    const firstName = normalizeText(client.fullName.split(/\s+/)[0] ?? "");
    return Boolean(fullName && instruction.includes(fullName)) || Boolean(firstName && instruction.includes(firstName));
  });

  if (matchedClients.length) {
    return matchedClients.map((client) => client.personId);
  }

  return fallbackOwnerPersonIds?.length ? fallbackOwnerPersonIds : allClientIds;
}

function hasAddIntent(text: string) {
  return /\b(add|create|new|include|insert|draft)\b/i.test(text) && !hasReplacementIntent(text);
}

function hasProductActionBoundary(text: string) {
  return (
    /\b(product|platform|provider|account|pension|super|fund|wrap|rollover|consolidat|replace|switch|retain|dispose|my ?north|hostplus|australian ?super|hub24|netwealth|bt panorama)\b/i.test(
      text,
    ) && /\b(product|platform|provider|account|rollover|consolidat|replace|switch|retain|dispose)\b/i.test(text)
  );
}

function hasInsuranceBoundary(text: string) {
  return /\b(insurance|life cover|life insurance|tpd|trauma|income protection|premium|insured|policy)\b/i.test(text);
}

function extractCardNumber(text: string) {
  const match = text.match(/\b(?:recommendation|card|strategy|product)\s*(?:number|no\.?|#)?\s*(\d+)\b/i);
  if (!match?.[1]) return null;
  const index = Number.parseInt(match[1], 10) - 1;
  return Number.isFinite(index) && index >= 0 ? index : null;
}

function extractRequestedWording(instruction: string) {
  const trimmed = instruction.trim();
  const quoted = trimmed.match(/["“]([\s\S]+?)["”]/)?.[1]?.trim();
  if (quoted) return quoted;

  const explicit = trimmed.match(/\b(?:to say|to read|with wording|wording is|as follows|to be)\s*:?\s*([\s\S]+)$/i)?.[1]?.trim();
  if (explicit) return explicit;

  return trimmed;
}

function appendOrReplaceTextList(current: string[], instruction: string) {
  const lines = extractFallbackLines(extractRequestedWording(instruction));
  const nextLines = lines.length ? lines : [extractRequestedWording(instruction)].filter(Boolean);
  return hasReplacementIntent(instruction) ? nextLines : appendUniqueValues(current, nextLines);
}

function findStrategyTargetIndex(request: SoaSectionEditRequest, recommendations: StrategicRecommendationV1[]) {
  const cardIndex = extractCardNumber(request.adviserInstruction);
  if (cardIndex !== null && recommendations[cardIndex]) {
    return { index: cardIndex, confidence: "high" as const };
  }

  const instruction = normalizeText(request.adviserInstruction);
  const clients = getClients(request);
  const matchedClientIds = clients
    .filter((client) => {
      const fullName = normalizeText(client.fullName);
      const firstName = normalizeText(client.fullName.split(/\s+/)[0] ?? "");
      return Boolean(fullName && instruction.includes(fullName)) || Boolean(firstName && instruction.includes(firstName));
    })
    .map((client) => client.personId);

  if (matchedClientIds.length) {
    const ownerMatches = recommendations
      .map((recommendation, index) => ({ recommendation, index }))
      .filter(({ recommendation }) => matchedClientIds.some((personId) => recommendation.ownerPersonIds.includes(personId)));
    if (ownerMatches.length === 1) {
      return { index: ownerMatches[0].index, confidence: "medium" as const };
    }
  }

  const contentMatches = recommendations
    .map((recommendation, index) => ({ recommendation, index }))
    .filter(({ recommendation }) => {
      const haystack = normalizeText(
        [
          recommendation.recommendationText,
          recommendation.type,
          recommendation.fundingSource,
          ...recommendation.clientBenefits.map((benefit) => benefit.text),
          ...recommendation.consequences.map((consequence) => consequence.text),
          ...recommendation.alternativesConsidered.map((alternative) => alternative.optionText),
        ]
          .filter(Boolean)
          .join(" "),
      );
      return instruction
        .split(" ")
        .filter((word) => word.length > 4)
        .some((word) => haystack.includes(word));
    });

  if (contentMatches.length === 1) {
    return { index: contentMatches[0].index, confidence: "medium" as const };
  }

  return recommendations.length === 1 ? { index: 0, confidence: "low" as const } : { index: null, confidence: "low" as const };
}

function findProductTargetIndex(request: SoaSectionEditRequest, recommendations: ProductRecommendationV1[]) {
  const cardIndex = extractCardNumber(request.adviserInstruction);
  if (cardIndex !== null && recommendations[cardIndex]) {
    return { index: cardIndex, confidence: "high" as const };
  }

  const instruction = normalizeText(request.adviserInstruction);
  const matches = recommendations
    .map((recommendation, index) => ({ recommendation, index }))
    .filter(({ recommendation }) => {
      const names = [
        recommendation.recommendedProductName,
        recommendation.recommendedProvider,
        recommendation.currentProductName,
        recommendation.currentProvider,
        recommendation.recommendationText,
      ]
        .filter(Boolean)
        .map((value) => normalizeText(String(value)));
      return names.some((name) => name && (instruction.includes(name) || name.split(" ").some((part) => part.length > 4 && instruction.includes(part))));
    });

  if (matches.length === 1) {
    return { index: matches[0].index, confidence: "high" as const };
  }

  const clients = getClients(request);
  const matchedClientIds = clients
    .filter((client) => {
      const fullName = normalizeText(client.fullName);
      const firstName = normalizeText(client.fullName.split(/\s+/)[0] ?? "");
      return Boolean(fullName && instruction.includes(fullName)) || Boolean(firstName && instruction.includes(firstName));
    })
    .map((client) => client.personId);
  const ownerMatches = matchedClientIds.length
    ? recommendations
        .map((recommendation, index) => ({ recommendation, index }))
        .filter(({ recommendation }) => matchedClientIds.some((personId) => recommendation.ownerPersonIds.includes(personId)))
    : [];

  if (ownerMatches.length === 1) {
    return { index: ownerMatches[0].index, confidence: "medium" as const };
  }

  return recommendations.length === 1 ? { index: 0, confidence: "low" as const } : { index: null, confidence: "low" as const };
}

function createStrategyRecommendation(request: SoaSectionEditRequest): StrategicRecommendationV1 {
  const ownerPersonIds = inferOwnerPersonIds(request);
  const draft = createGenericRecommendationDraft(request, ownerPersonIds);

  return {
    recommendationId: makeId("strategy"),
    type: inferStrategyType(request.adviserInstruction),
    ownerPersonIds,
    recommendationText: draft.recommendationText,
    linkedObjectiveIds: getObjectiveIds(request),
    targetAmount: null,
    monthlyContribution: draft.monthlyContribution,
    annualContribution: draft.annualContribution,
    contributionFrequency: draft.contributionFrequency,
    targetDate: null,
    reviewFrequency: "unknown",
    fundingSource: null,
    priorityRank: null,
    assumptionNote: null,
    amountConfidence: draft.amountConfidence,
    clientBenefits: [],
    consequences: [],
    alternativesConsidered: [],
    implementationNotes: null,
    rationale: null,
  };
}

function inferStrategyType(instruction: string) {
  const normalized = normalizeText(instruction);
  if (normalized.includes("super") || normalized.includes("contribution") || normalized.includes("salary sacrifice")) return "contribution-strategy";
  if (normalized.includes("tax")) return "tax-strategy";
  if (normalized.includes("cashflow") || normalized.includes("cash flow")) return "cashflow-strategy";
  if (normalized.includes("debt") || normalized.includes("loan")) return "debt-strategy";
  if (normalized.includes("centrelink") || normalized.includes("age pension")) return "centrelink-strategy";
  return "other";
}

function updateStrategyRecommendation(request: SoaSectionEditRequest, recommendation: StrategicRecommendationV1): StrategicRecommendationV1 {
  const instruction = request.adviserInstruction;
  const wording = extractRequestedWording(instruction);
  const ownerPersonIds = inferOwnerPersonIds(request, recommendation.ownerPersonIds);

  if (/\b(reasons?|benefits?|rationale|why|advantages?)\b/i.test(instruction)) {
    return {
      ...recommendation,
      ownerPersonIds,
      clientBenefits: appendOrReplaceTextList(
        recommendation.clientBenefits.map((benefit) => benefit.text),
        instruction,
      ).map((text, index) => ({
        benefitId: recommendation.clientBenefits[index]?.benefitId ?? makeId("benefit"),
        text,
        linkedObjectiveIds: recommendation.clientBenefits[index]?.linkedObjectiveIds ?? null,
      })),
      rationale: null,
    };
  }

  if (/\b(consequences?|trade-?offs?|risks?|downsides?|limitations?)\b/i.test(instruction)) {
    return {
      ...recommendation,
      ownerPersonIds,
      consequences: appendOrReplaceTextList(
        recommendation.consequences.map((consequence) => consequence.text),
        instruction,
      ).map((text, index) => ({
        consequenceId: recommendation.consequences[index]?.consequenceId ?? makeId("consequence"),
        type: recommendation.consequences[index]?.type ?? "trade-off",
        text,
      })),
    };
  }

  if (/\b(alternatives?|options?|instead|not recommended)\b/i.test(instruction)) {
    return {
      ...recommendation,
      ownerPersonIds,
      alternativesConsidered: appendOrReplaceTextList(
        recommendation.alternativesConsidered.map((alternative) => alternative.optionText),
        instruction,
      ).map((optionText, index) => ({
        alternativeId: recommendation.alternativesConsidered[index]?.alternativeId ?? makeId("alternative"),
        optionText,
        reasonNotRecommended: recommendation.alternativesConsidered[index]?.reasonNotRecommended ?? null,
      })),
    };
  }

  const draft = createGenericRecommendationDraft(request, ownerPersonIds, recommendation.recommendationText);

  return {
    ...recommendation,
    type: inferStrategyType(instruction) || recommendation.type,
    ownerPersonIds,
    recommendationText: hasReplacementIntent(instruction)
      ? draft.recommendationText || wording
      : [recommendation.recommendationText, draft.recommendationText || wording].filter(Boolean).join("\n\n"),
    monthlyContribution: draft.monthlyContribution ?? recommendation.monthlyContribution,
    annualContribution: draft.annualContribution ?? recommendation.annualContribution,
    contributionFrequency: draft.contributionFrequency === "unknown" ? recommendation.contributionFrequency : draft.contributionFrequency,
    amountConfidence: draft.amountConfidence === "pending-confirmation" ? recommendation.amountConfidence : draft.amountConfidence,
  };
}

function createProductRecommendation(request: SoaSectionEditRequest): ProductRecommendationV1 {
  const instruction = request.adviserInstruction;
  const lower = normalizeText(instruction);
  const action = inferProductAction(lower) ?? "retain";
  const productType = inferProductType(lower) ?? "other";
  const ownerPersonIds = inferOwnerPersonIds(request);
  const draft = createGenericRecommendationDraft(request, ownerPersonIds);

  return {
    recommendationId: makeId("product"),
    action,
    productType,
    recommendedProductName: null,
    recommendedProvider: null,
    ownerPersonIds,
    linkedObjectiveIds: getObjectiveIds(request),
    recommendationText: draft.recommendationText || extractRequestedWording(instruction),
    targetAmount: null,
    transferAmount: null,
    monthlyFundingAmount: null,
    annualFundingAmount: null,
    implementationDate: null,
    reviewFrequency: "unknown",
    fundingSource: null,
    priorityRank: null,
    assumptionNote: null,
    amountConfidence: "pending-confirmation",
    clientBenefits: [],
    consequences: [],
    suitabilityRationale: null,
    currentProductName: null,
    currentProvider: null,
    comparison: null,
    alternativesConsidered: [],
  };
}

function inferProductAction(normalizedInstruction: string): ProductRecommendationV1["action"] | null {
  if (normalizedInstruction.includes("replace") || normalizedInstruction.includes("switch")) return "replace";
  if (normalizedInstruction.includes("rollover")) return "rollover";
  if (normalizedInstruction.includes("consolidat")) return "consolidate";
  if (normalizedInstruction.includes("dispose") || normalizedInstruction.includes("sell")) return "dispose";
  if (normalizedInstruction.includes("obtain") || normalizedInstruction.includes("commence") || normalizedInstruction.includes("start")) return "obtain";
  if (normalizedInstruction.includes("retain") || normalizedInstruction.includes("keep")) return "retain";
  return null;
}

function inferProductType(normalizedInstruction: string): ProductRecommendationV1["productType"] | null {
  if (normalizedInstruction.includes("pension")) return "pension";
  if (normalizedInstruction.includes("super")) return "super";
  if (normalizedInstruction.includes("investment") || normalizedInstruction.includes("portfolio")) return "investment";
  if (normalizedInstruction.includes("annuity")) return "annuity";
  return null;
}

function extractNamedField(instruction: string, labels: string[]) {
  const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")).join("|");
  const match = instruction.match(new RegExp(`\\b(?:${labelPattern})\\s*(?:is|to|to be|as|=|:)\\s*([^.;\\n]+)`, "i"));
  return match?.[1]?.trim() || null;
}

type ParsedCurrencyAmount = {
  amount: number;
  frequency: StrategicRecommendationV1["contributionFrequency"];
  annualAmount: number | null;
};

function parseCurrencyAmount(value: string): ParsedCurrencyAmount | null {
  const explicitCurrencyMatch = value.match(/\$\s*([\d,]+(?:\.\d+)?)(?:\s*(?:per|\/)\s*(week|weekly|fortnight|fortnightly|month|monthly|quarter|quarterly|year|annual|annually|annum))?/i);
  const periodicMatch =
    explicitCurrencyMatch ??
    value.match(/\b([\d,]+(?:\.\d+)?)\s*(?:per|\/)\s*(week|weekly|fortnight|fortnightly|month|monthly|quarter|quarterly|year|annual|annually|annum)\b/i);
  const match = explicitCurrencyMatch ?? periodicMatch;
  if (!match?.[1]) return null;

  const amount = Number.parseFloat(match[1].replace(/,/g, ""));
  if (!Number.isFinite(amount)) return null;

  const frequencyText = normalizeText(match[2] ?? "");
  const frequency: StrategicRecommendationV1["contributionFrequency"] =
    frequencyText === "week" || frequencyText === "weekly"
      ? "weekly"
      : frequencyText === "fortnight" || frequencyText === "fortnightly"
        ? "fortnightly"
        : frequencyText === "month" || frequencyText === "monthly"
          ? "monthly"
          : frequencyText === "quarter" || frequencyText === "quarterly"
            ? "quarterly"
          : frequencyText === "year" || frequencyText === "annual" || frequencyText === "annually" || frequencyText === "annum"
            ? "annually"
            : null;

  const annualAmount =
    frequency === "weekly"
      ? amount * 52
      : frequency === "fortnightly"
        ? amount * 26
        : frequency === "monthly"
          ? amount * 12
          : frequency === "quarterly"
            ? amount * 4
          : frequency === "annually"
            ? amount
            : null;

  return { amount, frequency, annualAmount };
}

function formatCurrencyAmount(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

function formatPercentAmount(value: number) {
  return `${(value * 100).toLocaleString("en-AU", { maximumFractionDigits: 2 })}%`;
}

function getFrequencyLabel(frequency: StrategicRecommendationV1["contributionFrequency"]) {
  if (frequency === "weekly") return "per week";
  if (frequency === "fortnightly") return "per fortnight";
  if (frequency === "monthly") return "per month";
  if (frequency === "quarterly") return "per quarter";
  if (frequency === "annually") return "per year";
  return "";
}

function parsePercentRate(value: string) {
  const matches = [...value.matchAll(/(\d+(?:\.\d+)?)\s*%/g)]
    .map((match) => Number.parseFloat(match[1] ?? ""))
    .filter((amount) => Number.isFinite(amount));
  if (!matches.length) return null;
  return matches[0] / 100;
}

function findNumericKeyDeep(value: unknown, keys: string[], depth = 0): number | null {
  if (!value || typeof value !== "object" || depth > 6) return null;
  const record = value as Record<string, unknown>;

  for (const key of keys) {
    const direct = record[key];
    if (typeof direct === "number" && Number.isFinite(direct)) {
      return direct > 1 ? direct / 100 : direct;
    }
  }

  for (const nested of Object.values(record)) {
    const result = findNumericKeyDeep(nested, keys, depth + 1);
    if (result != null) return result;
  }

  return null;
}

function getAudienceLabel(request: SoaSectionEditRequest, ownerPersonIds: string[]) {
  const clients = getClients(request);
  const matchedClients = clients.filter((client) => ownerPersonIds.includes(client.personId));

  if (matchedClients.length === 1) {
    return matchedClients[0].fullName || (matchedClients[0].role === "partner" ? "the partner" : "the client");
  }

  if (matchedClients.length > 1) {
    return matchedClients.map((client) => client.fullName || client.role).filter(Boolean).join(" and ");
  }

  return request.clientName ?? "the client";
}

type GenericRecommendationDraft = {
  recommendationText: string;
  monthlyContribution: number | null;
  annualContribution: number | null;
  contributionFrequency: StrategicRecommendationV1["contributionFrequency"];
  amountConfidence: NonNullable<StrategicRecommendationV1["amountConfidence"]>;
  requiresClarification: boolean;
  clarificationLines: string[];
};

function stripRecommendationCommand(instruction: string) {
  return instruction
    .replace(/\b(?:edit|update|amend|change|rewrite)\s+(?:strategy\s+|product\s+)?recommendation(?:\s+(?:number|no\.?|#))?\s*\d+\s*(?:to|so that|with|include|including)?\s*/i, "")
    .replace(/\b(?:create|add|draft|prepare)\s+(?:a\s+)?(?:new\s+)?(?:strategy\s+|product\s+)?recommendation(?:\s+card)?\s*(?:for\s+[^,.;]+?)?\s*(?:to|that|which)?\s*/i, "")
    .replace(/\b(?:in|on)\s+the\s+recommendations?\s+tab\b/gi, "")
    .trim();
}

function splitCalculationInstruction(instruction: string) {
  const calculationMatch = instruction.match(
    /\b(?:also\s+)?(?:calculate|show\s+(?:a\s+)?table|show\s+(?:your\s+)?workings?|include\s+(?:a\s+)?workings?|tax[-\s]?savings?\s+(?:assessment|calculation|working|workings)|estimated\s+(?:tax\s+)?savings?)\b/i,
  );
  if (calculationMatch?.index == null) {
    return {
      wordingInstruction: instruction.trim(),
      calculationInstruction: "",
    };
  }

  return {
    wordingInstruction: instruction.slice(0, calculationMatch.index).trim(),
    calculationInstruction: instruction.slice(calculationMatch.index).trim(),
  };
}

function toSentence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function buildRecommendationSentence(request: SoaSectionEditRequest, ownerPersonIds: string[], instruction: string) {
  const clean = stripRecommendationCommand(instruction).replace(/^to\s+/i, "").trim();
  const audienceLabel = getAudienceLabel(request, ownerPersonIds);
  if (!clean) return "";
  if (/\bwe recommend\b/i.test(clean)) return toSentence(clean);
  return `${audienceLabel}, we recommend you ${toSentence(clean).replace(/^you\s+/i, "")}`;
}

function getAudienceFirstName(request: SoaSectionEditRequest, ownerPersonIds: string[]) {
  const label = getAudienceLabel(request, ownerPersonIds);
  return label.split(/\s+/)[0] || label;
}

function splitSentences(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function normalizeClientFacingRecommendation(text: string, request: SoaSectionEditRequest, ownerPersonIds: string[]) {
  const firstName = getAudienceFirstName(request, ownerPersonIds);
  const audienceLabel = getAudienceLabel(request, ownerPersonIds);
  const ownerNames = getClients(request)
    .filter((client) => ownerPersonIds.includes(client.personId))
    .flatMap((client) => [client.fullName, client.fullName.split(/\s+/)[0] ?? ""])
    .filter(Boolean);
  const ownerPattern = ownerNames.length
    ? ownerNames.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")
    : firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cleaned = splitSentences(
    text
      .replace(/\b(?:Recommendation|Rationale|Tax-?savings? assessment|Implementation considerations?|Next steps(?: for the adviser)?)\s*:\s*/gi, "")
      .replace(/\b(?:in|on)\s+the\s+recommendations?\s+tab\b/gi, "")
      .replace(/\b(?:calculations?|workings?)\s+table\s+(?:included|referenced|appended)[^.!?]*[.!?]?/gi, "")
      .replace(/\b(?:assumptions? and workings? are provided in that table)[^.!?]*[.!?]?/gi, ""),
  ).filter(
    (sentence) =>
      !/\b(recommendations?\s+tab|card|preview|next steps for the adviser|calculations?\s+table\s+(?:included|referenced|appended))\b/i.test(
        sentence,
      ),
  );
  const directText = cleaned.slice(0, 2).join(" ").trim();
  if (!directText) return "";

  const shouldPattern = new RegExp(`^(?:${ownerPattern})\\s+should\\s+`, "i");
  const recommendOwnerPattern = new RegExp(`^we\\s+recommend\\s+(?:that\\s+)?(?:${ownerPattern})\\s+`, "i");
  const recommendYouPattern = /^we\s+recommend\s+(?:that\s+)?you\s+/i;

  if (shouldPattern.test(directText)) {
    return toSentence(directText.replace(shouldPattern, `${firstName}, we recommend you `));
  }

  if (recommendOwnerPattern.test(directText)) {
    return toSentence(directText.replace(recommendOwnerPattern, `${firstName}, we recommend you `));
  }

  if (recommendYouPattern.test(directText)) {
    return toSentence(directText.replace(recommendYouPattern, `${firstName}, we recommend you `));
  }

  if (directText.startsWith(`${firstName},`)) {
    return toSentence(directText);
  }

  if (/\bwe recommend\b/i.test(directText)) {
    return toSentence(directText);
  }

  return `${audienceLabel}, we recommend you ${toSentence(directText).replace(/^you\s+/i, "")}`;
}

function buildWorkingsMarkdown(request: SoaSectionEditRequest, calculationInstruction: string, wordingInstruction: string) {
  const wantsCalculation = /\b(calculate|workings?|table|saving|savings|impact|effect)\b/i.test(calculationInstruction);
  if (!wantsCalculation) {
    return { markdown: "", clarificationLines: [] };
  }

  const combinedInstruction = `${wordingInstruction} ${calculationInstruction}`.trim();
  const amount = parseCurrencyAmount(combinedInstruction);
  const marginalRate = parsePercentRate(combinedInstruction);
  const clarificationLines: string[] = [];

  if (!amount) {
    clarificationLines.push("Please provide the dollar amount to use in the workings.");
  }

  if (amount && !amount.frequency && !amount.annualAmount) {
    clarificationLines.push("Please confirm the frequency for the dollar amount, such as per month or per year.");
  }

  if (!marginalRate) {
    clarificationLines.push("Please provide the tax rate or percentage to use in the calculation.");
  }

  if (clarificationLines.length || !amount || !marginalRate || amount.annualAmount == null) {
    return { markdown: "", clarificationLines };
  }

  const rows = [
    ["Annual amount", `${formatCurrencyAmount(amount.amount)} ${getFrequencyLabel(amount.frequency)} x ${amount.frequency === "weekly" ? "52" : amount.frequency === "fortnightly" ? "26" : amount.frequency === "monthly" ? "12" : amount.frequency === "quarterly" ? "4" : "1"}`, formatCurrencyAmount(amount.annualAmount)],
    ["Tax effect", `${formatCurrencyAmount(amount.annualAmount)} x ${formatPercentAmount(marginalRate)}`, formatCurrencyAmount(amount.annualAmount * marginalRate)],
  ];
  const contributionTaxRate = findNumericKeyDeep(request.sectionState, ["contributionsTaxRate", "contributionTaxRate"]);

  if (contributionTaxRate != null && /\b(super|superannuation|contribution|concessional)\b/i.test(combinedInstruction)) {
    const contributionTax = amount.annualAmount * contributionTaxRate;
    rows.push(
      ["Contribution tax assumption", `${formatCurrencyAmount(amount.annualAmount)} x ${formatPercentAmount(contributionTaxRate)}`, formatCurrencyAmount(contributionTax)],
      ["Estimated net tax benefit", `${formatCurrencyAmount(amount.annualAmount * marginalRate)} - ${formatCurrencyAmount(contributionTax)}`, formatCurrencyAmount(amount.annualAmount * marginalRate - contributionTax)],
    );
  }

  const tableRows = rows.map((row) => `| ${row[0]} | ${row[1]} | ${row[2]} |`).join("\n");

  return {
    markdown: ["Workings", "", "| Item | Calculation | Amount |", "| --- | --- | --- |", tableRows].join("\n"),
    clarificationLines: [],
  };
}

function createGenericRecommendationDraft(
  request: SoaSectionEditRequest,
  ownerPersonIds: string[],
  existingText?: string | null,
): GenericRecommendationDraft {
  const instruction = request.adviserInstruction;
  const { wordingInstruction, calculationInstruction } = splitCalculationInstruction(instruction);
  const recommendationSentence = buildRecommendationSentence(request, ownerPersonIds, wordingInstruction);
  const workings = buildWorkingsMarkdown(request, calculationInstruction, wordingInstruction);
  const amount = parseCurrencyAmount(`${wordingInstruction} ${calculationInstruction}`);
  const recommendationText = [recommendationSentence || (hasReplacementIntent(instruction) ? "" : existingText ?? ""), workings.markdown]
    .filter(Boolean)
    .join("\n\n");

  return {
    recommendationText: recommendationText || stripRecommendationCommand(instruction) || extractRequestedWording(instruction),
    monthlyContribution: amount?.frequency === "monthly" ? amount.amount : null,
    annualContribution: amount?.annualAmount ?? null,
    contributionFrequency: amount?.frequency ?? "unknown",
    amountConfidence: amount ? "exact" : "pending-confirmation",
    requiresClarification: workings.clarificationLines.length > 0,
    clarificationLines: workings.clarificationLines,
  };
}

function updateProductRecommendation(request: SoaSectionEditRequest, recommendation: ProductRecommendationV1): ProductRecommendationV1 {
  const instruction = request.adviserInstruction;
  const normalizedInstruction = normalizeText(instruction);
  const wording = extractRequestedWording(instruction);
  const ownerPersonIds = inferOwnerPersonIds(request, recommendation.ownerPersonIds);
  const draft = createGenericRecommendationDraft(request, ownerPersonIds, recommendation.recommendationText);
  const baseRecommendation: ProductRecommendationV1 = {
    ...recommendation,
    ownerPersonIds,
    action: inferProductAction(normalizedInstruction) ?? recommendation.action,
    productType: inferProductType(normalizedInstruction) ?? recommendation.productType,
    currentProductName:
      extractNamedField(instruction, ["current product", "current account", "current platform", "existing product", "existing account"]) ??
      recommendation.currentProductName,
    currentProvider: extractNamedField(instruction, ["current provider", "existing provider"]) ?? recommendation.currentProvider,
    recommendedProductName:
      extractNamedField(instruction, ["recommended product", "new product", "proposed product", "recommended account", "new account"]) ??
      recommendation.recommendedProductName,
    recommendedProvider:
      extractNamedField(instruction, ["recommended provider", "new provider", "proposed provider"]) ?? recommendation.recommendedProvider,
  };

  if (/\b(reasons?|benefits?|rationale|why|advantages?|suitability)\b/i.test(instruction)) {
    return {
      ...baseRecommendation,
      clientBenefits: appendOrReplaceTextList(
        baseRecommendation.clientBenefits.map((benefit) => benefit.text),
        instruction,
      ).map((text, index) => ({
        benefitId: baseRecommendation.clientBenefits[index]?.benefitId ?? makeId("benefit"),
        text,
        linkedObjectiveIds: baseRecommendation.clientBenefits[index]?.linkedObjectiveIds ?? null,
      })),
      suitabilityRationale: null,
    };
  }

  if (/\b(consequences?|trade-?offs?|risks?|downsides?|limitations?)\b/i.test(instruction)) {
    return {
      ...baseRecommendation,
      consequences: appendOrReplaceTextList(
        baseRecommendation.consequences.map((consequence) => consequence.text),
        instruction,
      ).map((text, index) => ({
        consequenceId: baseRecommendation.consequences[index]?.consequenceId ?? makeId("consequence"),
        type: baseRecommendation.consequences[index]?.type ?? "trade-off",
        text,
      })),
    };
  }

  if (/\b(alternatives?|options?|instead|not recommended|discounted)\b/i.test(instruction)) {
    return {
      ...baseRecommendation,
      alternativesConsidered: appendOrReplaceTextList(
        baseRecommendation.alternativesConsidered.map((alternative) => alternative.productName ?? alternative.reasonDiscounted ?? ""),
        instruction,
      ).map((productName, index) => ({
        alternativeId: baseRecommendation.alternativesConsidered[index]?.alternativeId ?? makeId("product-alternative"),
        productName,
        provider: baseRecommendation.alternativesConsidered[index]?.provider ?? null,
        reasonDiscounted: baseRecommendation.alternativesConsidered[index]?.reasonDiscounted ?? null,
      })),
    };
  }

  return {
    ...baseRecommendation,
    recommendationText: hasReplacementIntent(instruction)
      ? draft.recommendationText || wording
      : [baseRecommendation.recommendationText, draft.recommendationText || wording].filter(Boolean).join("\n\n"),
  };
}

function fallbackStrategyRecommendationEdit(request: SoaSectionEditRequest, warning?: string | null): SoaSectionEditResponse {
  const currentRecommendations = getCurrentStrategyRecommendations(request);

  if (hasProductActionBoundary(request.adviserInstruction)) {
    return {
      sectionId: request.sectionId,
      summary: "This sounds like a product or platform instruction, so I have not changed the Strategy Recommendations.",
      source: "fallback",
      model: null,
      warning,
      scope: null,
      objectives: null,
      strategyRecommendations: null,
      productRecommendations: null,
      proposalSummary: [
        "This appears to belong in Product Recommendations rather than Strategy Recommendations.",
        "No strategy card will be changed unless you confirm the strategy wording you want.",
      ],
      requiresClarification: true,
    };
  }

  if (hasAddIntent(request.adviserInstruction) || !currentRecommendations.length) {
    const draft = createGenericRecommendationDraft(request, inferOwnerPersonIds(request));
    if (draft.requiresClarification) {
      return {
        sectionId: request.sectionId,
        summary: "I need a little more detail before preparing this strategy recommendation.",
        source: "fallback",
        model: null,
        warning,
        scope: null,
        objectives: null,
        strategyRecommendations: null,
        productRecommendations: null,
        proposalSummary: draft.clarificationLines,
        requiresClarification: true,
      };
    }

    const nextRecommendations = [...currentRecommendations, createStrategyRecommendation(request)];
    return {
      sectionId: request.sectionId,
      summary: "Prepared a new strategy recommendation for review.",
      source: "fallback",
      model: null,
      warning,
      scope: null,
      objectives: null,
      strategyRecommendations: { mode: "replace-all", recommendations: nextRecommendations },
      productRecommendations: null,
      proposalSummary: ["Add a new Strategy Recommendation card.", "Review the full card before applying it."],
      requiresClarification: false,
    };
  }

  const target = findStrategyTargetIndex(request, currentRecommendations);
  if (target.index === null || target.confidence === "low") {
    return {
      sectionId: request.sectionId,
      summary: "I need a little more detail before editing a strategy recommendation.",
      source: "fallback",
      model: null,
      warning,
      scope: null,
      objectives: null,
      strategyRecommendations: null,
      productRecommendations: null,
      proposalSummary: [
        "I could not confidently identify which Strategy Recommendation card to update.",
        "Please mention the recommendation number, client name, or existing recommendation wording.",
      ],
      requiresClarification: true,
    };
  }

  const targetRecommendation = currentRecommendations[target.index]!;
  const draft = createGenericRecommendationDraft(request, inferOwnerPersonIds(request, targetRecommendation.ownerPersonIds), targetRecommendation.recommendationText);
  if (draft.requiresClarification) {
    return {
      sectionId: request.sectionId,
      summary: "I need a little more detail before editing this strategy recommendation.",
      source: "fallback",
      model: null,
      warning,
      scope: null,
      objectives: null,
      strategyRecommendations: null,
      productRecommendations: null,
      proposalSummary: draft.clarificationLines,
      requiresClarification: true,
    };
  }

  const nextRecommendations = currentRecommendations.map((recommendation, index) =>
    index === target.index ? updateStrategyRecommendation(request, recommendation) : recommendation,
  );

  return {
    sectionId: request.sectionId,
    summary: `Prepared edits to Strategy Recommendation ${target.index + 1}.`,
    source: "fallback",
    model: null,
    warning,
    scope: null,
    objectives: null,
    strategyRecommendations: { mode: "replace-all", recommendations: nextRecommendations },
    productRecommendations: null,
    proposalSummary: [
      `Update Strategy Recommendation ${target.index + 1}.`,
      "Preserve unchanged card fields and objective links.",
      "Review the proposed full-card update before applying it.",
    ],
    requiresClarification: false,
  };
}

function fallbackProductRecommendationEdit(request: SoaSectionEditRequest, warning?: string | null): SoaSectionEditResponse {
  const currentRecommendations = getCurrentProductRecommendations(request);

  if (hasInsuranceBoundary(request.adviserInstruction)) {
    return {
      sectionId: request.sectionId,
      summary: "This sounds like insurance advice, so I have not changed the Product Recommendations.",
      source: "fallback",
      model: null,
      warning,
      scope: null,
      objectives: null,
      strategyRecommendations: null,
      productRecommendations: null,
      proposalSummary: [
        "Insurance advice is not handled by Product Recommendations.",
        "No product card will be changed unless you confirm a non-insurance product recommendation.",
      ],
      requiresClarification: true,
    };
  }

  if (hasAddIntent(request.adviserInstruction) || !currentRecommendations.length) {
    const draft = createGenericRecommendationDraft(request, inferOwnerPersonIds(request));
    if (draft.requiresClarification) {
      return {
        sectionId: request.sectionId,
        summary: "I need a little more detail before preparing this product recommendation.",
        source: "fallback",
        model: null,
        warning,
        scope: null,
        objectives: null,
        strategyRecommendations: null,
        productRecommendations: null,
        proposalSummary: draft.clarificationLines,
        requiresClarification: true,
      };
    }

    const nextRecommendations = [...currentRecommendations, createProductRecommendation(request)];
    return {
      sectionId: request.sectionId,
      summary: "Prepared a new product recommendation for review.",
      source: "fallback",
      model: null,
      warning,
      scope: null,
      objectives: null,
      strategyRecommendations: null,
      productRecommendations: { mode: "replace-all", recommendations: nextRecommendations },
      proposalSummary: ["Add a new Product Recommendation card.", "Review the full card before applying it."],
      requiresClarification: false,
    };
  }

  const target = findProductTargetIndex(request, currentRecommendations);
  if (target.index === null || target.confidence === "low") {
    return {
      sectionId: request.sectionId,
      summary: "I need a little more detail before editing a product recommendation.",
      source: "fallback",
      model: null,
      warning,
      scope: null,
      objectives: null,
      strategyRecommendations: null,
      productRecommendations: null,
      proposalSummary: [
        "I could not confidently identify which Product Recommendation card to update.",
        "Please mention the recommendation number, product name, provider, or client name.",
      ],
      requiresClarification: true,
    };
  }

  const targetRecommendation = currentRecommendations[target.index]!;
  const draft = createGenericRecommendationDraft(request, inferOwnerPersonIds(request, targetRecommendation.ownerPersonIds), targetRecommendation.recommendationText);
  if (draft.requiresClarification) {
    return {
      sectionId: request.sectionId,
      summary: "I need a little more detail before editing this product recommendation.",
      source: "fallback",
      model: null,
      warning,
      scope: null,
      objectives: null,
      strategyRecommendations: null,
      productRecommendations: null,
      proposalSummary: draft.clarificationLines,
      requiresClarification: true,
    };
  }

  const nextRecommendations = currentRecommendations.map((recommendation, index) =>
    index === target.index ? updateProductRecommendation(request, recommendation) : recommendation,
  );

  return {
    sectionId: request.sectionId,
    summary: `Prepared edits to Product Recommendation ${target.index + 1}.`,
    source: "fallback",
    model: null,
    warning,
    scope: null,
    objectives: null,
    strategyRecommendations: null,
    productRecommendations: { mode: "replace-all", recommendations: nextRecommendations },
    proposalSummary: [
      `Update Product Recommendation ${target.index + 1}.`,
      "Preserve unchanged card fields and objective links.",
      "Review the proposed full-card update before applying it.",
    ],
    requiresClarification: false,
  };
}

function fallbackScopeEdit(request: SoaSectionEditRequest, warning?: string | null): SoaSectionEditResponse {
  const record = request.sectionState && typeof request.sectionState === "object" ? (request.sectionState as Record<string, unknown>) : {};
  const included = normalizeStringArray(record.included);
  const exclusions = normalizeStringArray(record.exclusions);
  const instruction = request.adviserInstruction.trim();
  const isExclusionInstruction = /\b(limitations?|exclusions?|exclude|excluded|outside scope|out of scope|not in scope|not requested)\b/i.test(instruction);
  const normalizedInstruction = normalizeText(instruction);
  const cleanedIncluded = included.filter((item) => !normalizedInstruction.includes(normalizeText(item)) && !normalizeText(item).includes("edit the limitation"));

  if (!isExclusionInstruction) {
    return {
      sectionId: request.sectionId,
      summary: "Updated agreed scope.",
      source: "fallback",
      model: null,
      warning,
      scope: {
        included: appendUniqueValues(cleanedIncluded, [instruction]),
        exclusions,
      },
      objectives: null,
    };
  }

  const subjectMatch =
    instruction.match(/\b(?:limitations?|exclusions?)\s+(?:for|around|regarding|on)\s+(.+?)\s+(?:as|because|since|due to)\b/i) ??
    instruction.match(/\b(?:edit|update|change|replace)\s+(.+?)\s+(?:as|because|since|due to)\b/i);
  const subject = subjectMatch?.[1]?.replace(/\b(?:limitations?|exclusions?)\b/gi, "").replace(/\b(?:for|around|regarding|on)\b/gi, "").trim();
  const reasonMatch = instruction.match(/\b(as|because|since|due to)\s+(.+)$/i);
  const reason = reasonMatch?.[2]?.trim();
  const replacement = subject && reason ? `${subject.charAt(0).toUpperCase()}${subject.slice(1)} ${reason}` : instruction;
  const normalizedSubject = subject ? normalizeText(subject) : "";
  let replaced = false;
  const nextExclusions = exclusions.map((item) => {
    if (!normalizedSubject || !normalizeText(item).includes(normalizedSubject)) {
      return item;
    }

    replaced = true;
    return replacement;
  });

  return {
    sectionId: request.sectionId,
    summary: "Updated limitations and exclusions.",
    source: "fallback",
    model: null,
    warning,
    scope: {
      included: cleanedIncluded,
      exclusions: replaced ? nextExclusions : appendUniqueValues(nextExclusions, [replacement]),
    },
    objectives: null,
  };
}

function fallbackObjectivesEdit(request: SoaSectionEditRequest, warning?: string | null): SoaSectionEditResponse {
  const record = request.sectionState && typeof request.sectionState === "object" ? (request.sectionState as Record<string, unknown>) : {};
  const currentObjectives = normalizeObjectives(record.objectives) ?? [];
  const instruction = request.adviserInstruction.trim();
  const lines = extractFallbackLines(instruction);
  const instructionLines = lines.length ? lines : [instruction].filter(Boolean);

  if (hasRemovalIntent(instruction)) {
    const nextObjectives = currentObjectives.filter(
      (objective) =>
        !instructionLines.some((line) => normalizeText(objective.text).includes(normalizeText(line)) || normalizeText(line).includes(normalizeText(objective.text))),
    );

    return {
      sectionId: request.sectionId,
      summary: "Removed matching objectives.",
      source: "fallback",
      model: null,
      warning,
      scope: null,
      objectives: nextObjectives,
    };
  }

  if (hasReplacementIntent(instruction) && currentObjectives.length) {
    const [firstLine, ...remainingLines] = instructionLines;
    const nextObjectives = [
      {
        text: firstLine,
        priority: currentObjectives[0]?.priority ?? "unknown",
      },
      ...currentObjectives.slice(1),
      ...remainingLines.map((line) => ({
        text: line,
        priority: "unknown" as const,
      })),
    ];

    return {
      sectionId: request.sectionId,
      summary: "Updated objectives.",
      source: "fallback",
      model: null,
      warning,
      scope: null,
      objectives: nextObjectives,
    };
  }

  const currentObjectiveText = currentObjectives.map((objective) => objective.text);
  const nextObjectiveText = appendUniqueValues(currentObjectiveText, instructionLines);

  return {
    sectionId: request.sectionId,
    summary: "Updated objectives.",
    source: "fallback",
    model: null,
    warning,
    scope: null,
    objectives: nextObjectiveText.map((text) => ({
      text,
      priority: currentObjectives.find((objective) => normalizeText(objective.text) === normalizeText(text))?.priority ?? "unknown",
    })),
  };
}

async function requestOpenAiSectionEdit(request: SoaSectionEditRequest) {
  const isAzure = isAzureOpenAiBaseUrl(OPENAI_BASE_URL);
  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(isAzure ? { "api-key": OPENAI_API_KEY } : { authorization: `Bearer ${OPENAI_API_KEY}` }),
    },
    body: JSON.stringify({
      model: OPENAI_SECTION_EDIT_MODEL,
      messages: [
        {
          role: "system",
          content: [
            "You are Finley, a schema-aware SOA drafting assistant for Australian financial advisers.",
            "You receive the current card schema and an adviser instruction.",
            "Return only JSON that matches the schema.",
            "Reason over the current field values and the instruction before editing.",
            "Do not copy meta-instructions like 'edit', 'update', or 'change' into document wording.",
            "Preserve field values that the adviser did not ask to change.",
            "If the adviser asks to update, edit, change, or replace wording, find the most semantically relevant existing item and rewrite it instead of appending a duplicate.",
            "If text has previously been accidentally added to the wrong field, move or remove it when the latest instruction makes the intended field clear.",
            "For scope-of-advice: included is Agreed Scope, exclusions is Limitations / Exclusions.",
            "For scope-of-advice, use concise professional wording suitable for an SOA workflow card.",
            "For objectives: return the complete updated objectives array. Preserve unchanged objectives and priorities.",
            "For objectives, rewrite the semantically matching objective when the adviser asks to edit, update, change, or refine it.",
            "For objectives, add a new objective only when the adviser asks to add or include one, and remove objectives only when asked to remove, delete, or omit them.",
            "For objectives, use client-focused financial planning wording and never copy the adviser's instruction text into the objective unless it is itself suitable objective wording.",
            "For sections that are not being edited, return null for their schema fields.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Edit an SOA workflow card.",
            sectionId: request.sectionId,
            clientName: request.clientName ?? null,
            currentSectionState: request.sectionState,
            latestAdviserInstruction: request.adviserInstruction,
            recentMessages: request.recentMessages ?? [],
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: sectionEditJsonSchema,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI section edit request failed with status ${response.status}.`);
  }

  const body = (await response.json().catch(() => null)) as
    | {
        choices?: Array<{
          message?: {
            content?: string | null;
          } | null;
        }>;
      }
    | null;
  const content = body?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("OpenAI section edit response did not include message content.");
  }

  return normalizeSectionEdit(parseJsonObject(content), request.sectionId);
}

function normalizeRecommendationPlan(value: unknown): RecommendationEditPlan | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const mode = record.mode === "add" || record.mode === "edit" || record.mode === "clarify" ? record.mode : "clarify";
  const targetIndex = typeof record.targetIndex === "number" && Number.isInteger(record.targetIndex) ? record.targetIndex : null;

  return {
    summary: typeof record.summary === "string" && record.summary.trim() ? record.summary.trim() : "Prepared recommendation edits for review.",
    proposalSummary: normalizeStringArray(record.proposalSummary),
    requiresClarification: Boolean(record.requiresClarification) || mode === "clarify",
    mode,
    targetIndex,
    ownerPersonIds: Array.isArray(record.ownerPersonIds) ? normalizeStringArray(record.ownerPersonIds) : null,
    recommendationText:
      typeof record.recommendationText === "string" && record.recommendationText.trim()
        ? sanitizeClientFacingResearchLanguage(record.recommendationText)
        : null,
    clientBenefits: Array.isArray(record.clientBenefits)
      ? normalizeStringArray(record.clientBenefits).map(sanitizeClientFacingResearchLanguage)
      : null,
    consequences: Array.isArray(record.consequences)
      ? normalizeStringArray(record.consequences).map(sanitizeClientFacingResearchLanguage)
      : null,
    alternatives: Array.isArray(record.alternatives)
      ? normalizeStringArray(record.alternatives).map(sanitizeClientFacingResearchLanguage)
      : null,
    productAction: typeof record.productAction === "string" && record.productAction.trim() ? record.productAction.trim() : null,
    productType: typeof record.productType === "string" && record.productType.trim() ? record.productType.trim() : null,
    currentProductName: typeof record.currentProductName === "string" && record.currentProductName.trim() ? record.currentProductName.trim() : null,
    currentProvider: typeof record.currentProvider === "string" && record.currentProvider.trim() ? record.currentProvider.trim() : null,
    recommendedProductName: typeof record.recommendedProductName === "string" && record.recommendedProductName.trim() ? record.recommendedProductName.trim() : null,
    recommendedProvider: typeof record.recommendedProvider === "string" && record.recommendedProvider.trim() ? record.recommendedProvider.trim() : null,
  };
}

async function requestOpenAiRecommendationEditPlan(request: SoaSectionEditRequest) {
  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      ...(isAzureOpenAiBaseUrl(OPENAI_BASE_URL) ? { "api-key": OPENAI_API_KEY } : {}),
    },
    body: JSON.stringify({
      model: OPENAI_SECTION_EDIT_MODEL,
      messages: [
        {
          role: "system",
          content: [
            "You edit financial advice recommendation cards for an SOA workflow.",
            "Return a concise structured edit plan only. Do not delete cards.",
            "Infer the target card from card number, client name, provider/product/account names, active section, active tab, and current card text.",
            "If the target is ambiguous, set mode to clarify and requiresClarification to true.",
            "Draft adviser-ready SOA wording in natural client-facing language.",
            "The recommendationText field must be only one or two short direct-address recommendation sentences, for example 'Kay, we recommend you ...'.",
            "Do not put rationale, benefits, risks, consequences, implementation notes, alternatives, next steps, or calculations into recommendationText.",
            "Put rationale and expected benefits in clientBenefits. Put risks, limitations, trade-offs, implementation checks, and monitoring items in consequences. Put alternatives only in alternatives.",
            "Never mention workflow UI such as tabs, cards, previews, recommendation tabs, or adviser next steps in SOA text.",
            "Never mention ProductRex, ProductRex report, uploaded report names, or internal research tooling in SOA text. Say 'our product research', 'our research', or 'the product comparison' instead.",
            "Never state that a calculations/workings table is included unless the actual markdown table is returned by the deterministic helper.",
            "Do not copy the adviser instruction verbatim.",
            "Keep Strategy Recommendations at strategy level and do not draft product/platform/account actions there.",
            "Keep Product Recommendations product-focused and reject insurance-style instructions by asking for clarification.",
            "If the adviser asks for calculations or workings, draft the client-facing recommendation only; do not reference calculations in recommendationText and do not perform arithmetic.",
            "Preserve unchanged fields by returning null arrays/fields unless the instruction clearly updates them.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Prepare a recommendation card edit plan.",
            sectionId: request.sectionId,
            clientName: request.clientName ?? null,
            currentSectionState: request.sectionState,
            latestAdviserInstruction: request.adviserInstruction,
            recentMessages: request.recentMessages ?? [],
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: recommendationEditPlanJsonSchema,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI recommendation edit request failed with status ${response.status}.`);
  }

  const body = (await response.json().catch(() => null)) as
    | {
        choices?: Array<{
          message?: {
            content?: string | null;
          } | null;
        }>;
      }
    | null;
  const content = body?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI recommendation edit response did not include message content.");
  }

  return normalizeRecommendationPlan(parseJsonObject(content));
}

function getRecommendationWorkings(request: SoaSectionEditRequest) {
  const { wordingInstruction, calculationInstruction } = splitCalculationInstruction(request.adviserInstruction);
  return buildWorkingsMarkdown(request, calculationInstruction, wordingInstruction);
}

function combineRecommendationText(planText: string | null, draftText: string, workingsMarkdown: string) {
  const base = planText?.trim() || draftText.trim();
  if (!workingsMarkdown) return base;
  const withoutDuplicateWorkings = base.replace(/\n*Workings\s*\n+\|[\s\S]*$/i, "").trim();
  return [withoutDuplicateWorkings, workingsMarkdown].filter(Boolean).join("\n\n");
}

function splitLabeledRecommendationText(text?: string | null) {
  const value = text?.trim() ?? "";
  if (!value) {
    return { recommendationText: "", benefits: [] as string[], consequences: [] as string[], alternatives: [] as string[] };
  }

  const labelRegex =
    /\b(Recommendation|Rationale|Reasons?|Benefits?|Client benefits|Consequences?|Trade-?offs?|Risks?|Alternatives?(?: considered)?|Implementation considerations?|Next steps(?: for the adviser)?)\s*:/gi;
  const matches = [...value.matchAll(labelRegex)];

  if (!matches.length) {
    return { recommendationText: value, benefits: [] as string[], consequences: [] as string[], alternatives: [] as string[] };
  }

  const content = {
    recommendationText: value.slice(0, matches[0].index ?? 0).trim(),
    benefits: [] as string[],
    consequences: [] as string[],
    alternatives: [] as string[],
  };

  matches.forEach((match, index) => {
    const label = normalizeText(match[1] ?? "");
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index ?? value.length : value.length;
    const segment = value.slice(start, end).trim();
    const items = segment
      .split(/\r?\n|;|(?<=[.!?])\s+(?=[A-Z])/)
      .map((item) => item.replace(/^[-*•\d.)\s]+/, "").trim())
      .filter(Boolean)
      .filter((item) => !/\b(recommendations?\s+tab|card|preview|next steps for the adviser)\b/i.test(item));

    if (label === "recommendation") {
      content.recommendationText = [content.recommendationText, segment].filter(Boolean).join(" ");
    } else if (/\b(rationale|reason|benefit)\b/.test(label)) {
      content.benefits.push(...items);
    } else if (/\b(consequence|trade|risk|implementation)\b/.test(label)) {
      content.consequences.push(...items);
    } else if (/\balternative\b/.test(label)) {
      content.alternatives.push(...items);
    }
  });

  return content;
}

function buildStructuredRecommendationContent(
  request: SoaSectionEditRequest,
  ownerPersonIds: string[],
  plan: RecommendationEditPlan,
  draftText: string,
  workingsMarkdown: string,
) {
  const split = splitLabeledRecommendationText(plan.recommendationText);
  const rawRecommendationText = combineRecommendationText(split.recommendationText || plan.recommendationText, draftText, workingsMarkdown);
  const textParts = rawRecommendationText.split(/\n\nWorkings\b/i);
  const recommendationOnly = normalizeClientFacingRecommendation(
    sanitizeClientFacingResearchLanguage(textParts[0] ?? ""),
    request,
    ownerPersonIds,
  );
  const workingsOnly = rawRecommendationText.includes("\n\nWorkings") ? `Workings${textParts.slice(1).join("\n\nWorkings")}` : "";

  return {
    recommendationText: [recommendationOnly, workingsOnly].filter(Boolean).join("\n\n"),
    clientBenefits: (plan.clientBenefits ?? split.benefits).map(sanitizeClientFacingResearchLanguage),
    consequences: (plan.consequences ?? split.consequences).map(sanitizeClientFacingResearchLanguage),
    alternatives: (plan.alternatives ?? split.alternatives).map(sanitizeClientFacingResearchLanguage),
  };
}

function applyStrategyRecommendationPlan(
  request: SoaSectionEditRequest,
  plan: RecommendationEditPlan,
  warning?: string | null,
): SoaSectionEditResponse {
  const currentRecommendations = getCurrentStrategyRecommendations(request);
  const workings = getRecommendationWorkings(request);

  if (plan.requiresClarification || plan.mode === "clarify" || workings.clarificationLines.length) {
    return {
      sectionId: request.sectionId,
      summary: plan.summary || "I need a little more detail before editing this strategy recommendation.",
      source: "llm",
      model: OPENAI_SECTION_EDIT_MODEL,
      warning,
      scope: null,
      objectives: null,
      strategyRecommendations: null,
      productRecommendations: null,
      proposalSummary: [...(plan.proposalSummary.length ? plan.proposalSummary : []), ...workings.clarificationLines],
      requiresClarification: true,
    };
  }

  const target =
    plan.mode === "edit" && plan.targetIndex != null && currentRecommendations[plan.targetIndex]
      ? { index: plan.targetIndex }
      : findStrategyTargetIndex(request, currentRecommendations);

  const isAdd = plan.mode === "add" || !currentRecommendations.length || target.index == null;
  const existing = !isAdd && target.index != null ? currentRecommendations[target.index] : null;
  const ownerPersonIds = plan.ownerPersonIds?.length
    ? plan.ownerPersonIds
    : inferOwnerPersonIds(request, existing?.ownerPersonIds ?? undefined);
  const draft = createGenericRecommendationDraft(request, ownerPersonIds, existing?.recommendationText ?? null);
  const content = buildStructuredRecommendationContent(request, ownerPersonIds, plan, draft.recommendationText, workings.markdown);

  const nextRecommendation: StrategicRecommendationV1 = existing
    ? {
        ...existing,
        type: inferStrategyType(request.adviserInstruction) || existing.type,
        ownerPersonIds,
        recommendationText: content.recommendationText,
        monthlyContribution: draft.monthlyContribution ?? existing.monthlyContribution,
        annualContribution: draft.annualContribution ?? existing.annualContribution,
        contributionFrequency: draft.contributionFrequency === "unknown" ? existing.contributionFrequency : draft.contributionFrequency,
        amountConfidence: draft.amountConfidence === "pending-confirmation" ? existing.amountConfidence : draft.amountConfidence,
        clientBenefits:
          content.clientBenefits.length
            ? content.clientBenefits.map((text, index) => ({
            benefitId: existing.clientBenefits[index]?.benefitId ?? makeId("benefit"),
            text,
            linkedObjectiveIds: existing.clientBenefits[index]?.linkedObjectiveIds ?? null,
              }))
            : existing.clientBenefits,
        consequences:
          content.consequences.length
            ? content.consequences.map((text, index) => ({
            consequenceId: existing.consequences[index]?.consequenceId ?? makeId("consequence"),
            type: existing.consequences[index]?.type ?? "trade-off",
            text,
              }))
            : existing.consequences,
        alternativesConsidered:
          content.alternatives.length
            ? content.alternatives.map((optionText, index) => ({
            alternativeId: existing.alternativesConsidered[index]?.alternativeId ?? makeId("alternative"),
            optionText,
            reasonNotRecommended: existing.alternativesConsidered[index]?.reasonNotRecommended ?? null,
              }))
            : existing.alternativesConsidered,
      }
    : {
        ...createStrategyRecommendation(request),
        ownerPersonIds,
        recommendationText: content.recommendationText,
        clientBenefits:
          content.clientBenefits.map((text) => ({
            benefitId: makeId("benefit"),
            text,
            linkedObjectiveIds: null,
          })),
        consequences:
          content.consequences.map((text) => ({
            consequenceId: makeId("consequence"),
            type: "trade-off" as const,
            text,
          })),
        alternativesConsidered:
          content.alternatives.map((optionText) => ({
            alternativeId: makeId("alternative"),
            optionText,
            reasonNotRecommended: null,
          })),
      };

  const nextRecommendations = isAdd
    ? [...currentRecommendations, nextRecommendation]
    : currentRecommendations.map((recommendation, index) => (index === target.index ? nextRecommendation : recommendation));

  return {
    sectionId: request.sectionId,
    summary: plan.summary,
    source: "llm",
    model: OPENAI_SECTION_EDIT_MODEL,
    warning,
    scope: null,
    objectives: null,
    strategyRecommendations: { mode: "replace-all", recommendations: nextRecommendations },
    productRecommendations: null,
    proposalSummary: plan.proposalSummary.length
      ? plan.proposalSummary
      : [isAdd ? "Add a new Strategy Recommendation card." : `Update Strategy Recommendation ${(target.index ?? 0) + 1}.`],
    requiresClarification: false,
  };
}

function normalizeProductAction(value: string | null, fallback: ProductRecommendationV1["action"]) {
  const normalized = normalizeText(value ?? "");
  return (inferProductAction(normalized) ?? fallback) as ProductRecommendationV1["action"];
}

function normalizeProductType(value: string | null, fallback: ProductRecommendationV1["productType"]) {
  const normalized = normalizeText(value ?? "");
  return (inferProductType(normalized) ?? fallback) as ProductRecommendationV1["productType"];
}

function applyProductRecommendationPlan(
  request: SoaSectionEditRequest,
  plan: RecommendationEditPlan,
  warning?: string | null,
): SoaSectionEditResponse {
  const currentRecommendations = getCurrentProductRecommendations(request);
  const workings = getRecommendationWorkings(request);

  if (plan.requiresClarification || plan.mode === "clarify" || workings.clarificationLines.length) {
    return {
      sectionId: request.sectionId,
      summary: plan.summary || "I need a little more detail before editing this product recommendation.",
      source: "llm",
      model: OPENAI_SECTION_EDIT_MODEL,
      warning,
      scope: null,
      objectives: null,
      strategyRecommendations: null,
      productRecommendations: null,
      proposalSummary: [...(plan.proposalSummary.length ? plan.proposalSummary : []), ...workings.clarificationLines],
      requiresClarification: true,
    };
  }

  const target =
    plan.mode === "edit" && plan.targetIndex != null && currentRecommendations[plan.targetIndex]
      ? { index: plan.targetIndex }
      : findProductTargetIndex(request, currentRecommendations);
  const isAdd = plan.mode === "add" || !currentRecommendations.length || target.index == null;
  const existing = !isAdd && target.index != null ? currentRecommendations[target.index] : null;
  const ownerPersonIds = plan.ownerPersonIds?.length
    ? plan.ownerPersonIds
    : inferOwnerPersonIds(request, existing?.ownerPersonIds ?? undefined);
  const draft = createGenericRecommendationDraft(request, ownerPersonIds, existing?.recommendationText ?? null);
  const base = existing ?? createProductRecommendation(request);
  const content = buildStructuredRecommendationContent(request, ownerPersonIds, plan, draft.recommendationText, workings.markdown);
  const nextRecommendation: ProductRecommendationV1 = {
    ...base,
    ownerPersonIds,
    action: normalizeProductAction(plan.productAction, base.action),
    productType: normalizeProductType(plan.productType, base.productType),
    recommendationText: content.recommendationText,
    currentProductName: plan.currentProductName ?? base.currentProductName,
    currentProvider: plan.currentProvider ?? base.currentProvider,
    recommendedProductName: plan.recommendedProductName ?? base.recommendedProductName,
    recommendedProvider: plan.recommendedProvider ?? base.recommendedProvider,
    clientBenefits:
      content.clientBenefits.length
        ? content.clientBenefits.map((text, index) => ({
            benefitId: base.clientBenefits[index]?.benefitId ?? makeId("benefit"),
            text,
            linkedObjectiveIds: base.clientBenefits[index]?.linkedObjectiveIds ?? null,
          }))
        : base.clientBenefits,
    consequences:
      content.consequences.length
        ? content.consequences.map((text, index) => ({
            consequenceId: base.consequences[index]?.consequenceId ?? makeId("consequence"),
            type: base.consequences[index]?.type ?? "trade-off",
            text,
          }))
        : base.consequences,
    alternativesConsidered:
      content.alternatives.length
        ? content.alternatives.map((productName, index) => ({
            alternativeId: base.alternativesConsidered[index]?.alternativeId ?? makeId("product-alternative"),
            productName,
            provider: base.alternativesConsidered[index]?.provider ?? null,
            reasonDiscounted: base.alternativesConsidered[index]?.reasonDiscounted ?? null,
          }))
        : base.alternativesConsidered,
  };
  const nextRecommendations = isAdd
    ? [...currentRecommendations, nextRecommendation]
    : currentRecommendations.map((recommendation, index) => (index === target.index ? nextRecommendation : recommendation));

  return {
    sectionId: request.sectionId,
    summary: plan.summary,
    source: "llm",
    model: OPENAI_SECTION_EDIT_MODEL,
    warning,
    scope: null,
    objectives: null,
    strategyRecommendations: null,
    productRecommendations: { mode: "replace-all", recommendations: nextRecommendations },
    proposalSummary: plan.proposalSummary.length
      ? plan.proposalSummary
      : [isAdd ? "Add a new Product Recommendation card." : `Update Product Recommendation ${(target.index ?? 0) + 1}.`],
    requiresClarification: false,
  };
}

export async function editSoaSection(request: SoaSectionEditRequest): Promise<SoaSectionEditResponse> {
  if (request.sectionId === "strategy-recommendations") {
    const missingConfigurationWarning = getMissingConfigurationWarning();
    if (missingConfigurationWarning) {
      return fallbackStrategyRecommendationEdit(request, missingConfigurationWarning);
    }

    try {
      const plan = await requestOpenAiRecommendationEditPlan(request);
      return plan
        ? applyStrategyRecommendationPlan(request, plan)
        : fallbackStrategyRecommendationEdit(request, "Finley could not parse the recommendation edit response, so it used the local generic editor.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return fallbackStrategyRecommendationEdit(request, `Finley could not reach the recommendation editor (${message}), so it used the local generic editor.`);
    }
  }

  if (request.sectionId === "product-recommendations") {
    const missingConfigurationWarning = getMissingConfigurationWarning();
    if (missingConfigurationWarning) {
      return fallbackProductRecommendationEdit(request, missingConfigurationWarning);
    }

    try {
      const plan = await requestOpenAiRecommendationEditPlan(request);
      return plan
        ? applyProductRecommendationPlan(request, plan)
        : fallbackProductRecommendationEdit(request, "Finley could not parse the recommendation edit response, so it used the local generic editor.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return fallbackProductRecommendationEdit(request, `Finley could not reach the recommendation editor (${message}), so it used the local generic editor.`);
    }
  }

  if (request.sectionId !== "scope-of-advice" && request.sectionId !== "objectives") {
    return {
      sectionId: request.sectionId,
      summary: "Finley can edit Scope of Advice and Objectives with the schema-aware editor. This section is not wired into the schema editor yet.",
      source: "fallback",
      model: null,
      warning: null,
      scope: null,
      objectives: null,
      strategyRecommendations: null,
      productRecommendations: null,
      proposalSummary: [],
      requiresClarification: false,
    };
  }

  const fallbackEdit = request.sectionId === "objectives" ? fallbackObjectivesEdit : fallbackScopeEdit;
  const missingConfigurationWarning = getMissingConfigurationWarning();
  if (missingConfigurationWarning) {
    return fallbackEdit(request, missingConfigurationWarning);
  }

  try {
    const edit = await requestOpenAiSectionEdit(request);
    if (!edit) {
      return fallbackEdit(request, "Finley could not parse the section edit response, so it used the local fallback editor.");
    }

    if (request.sectionId === "scope-of-advice" && !edit?.scope) {
      return fallbackScopeEdit(request, "Finley could not parse the section edit response, so it used the local fallback editor.");
    }

    if (request.sectionId === "objectives" && !edit?.objectives) {
      return fallbackObjectivesEdit(request, "Finley could not parse the section edit response, so it used the local fallback editor.");
    }

    return {
      sectionId: edit.sectionId,
      summary: edit.summary,
      scope: edit.scope,
      objectives: edit.objectives,
      strategyRecommendations: null,
      productRecommendations: null,
      proposalSummary: [],
      requiresClarification: false,
      source: "llm",
      model: OPENAI_SECTION_EDIT_MODEL,
      warning: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return fallbackEdit(request, `Finley could not reach the schema-aware section editor (${message}), so it used the local fallback editor.`);
  }
}
