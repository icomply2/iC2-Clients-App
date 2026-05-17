import type { AdviceScopeV1, RiskProfileV1 } from "@/lib/soa-types";
import type {
  IntakeAssessmentV1,
  StrategyDraftResponseV1,
  StrategyRecommendationDraftV1,
} from "@/lib/soa-output-contracts";
import { normalizeRecommendationLanguage } from "@/lib/soa-recommendation-language";

export type SoaStrategyDraftRequest = {
  clientName?: string | null;
  clientPeople?: Array<{
    name: string;
    role: "client" | "partner";
  }> | null;
  objectives: Array<{
    text: string;
    priority?: "high" | "medium" | "low" | "unknown" | null;
  }>;
  scope?: AdviceScopeV1 | null;
  riskProfile?: RiskProfileV1 | null;
  intakeAssessment?: IntakeAssessmentV1 | null;
  uploadedFiles?: Array<{
    name: string;
    kind?: string | null;
    extractedText?: string | null;
  }>;
  recentMessages?: Array<{
    role?: "assistant" | "user";
    content?: string;
  }> | null;
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim() ?? "";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
const OPENAI_SOA_INTAKE_MODEL = process.env.OPENAI_SOA_INTAKE_MODEL?.trim() || "gpt-5.2";

const strategyDraftJsonSchema = {
  name: "soa_strategy_drafts",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      recommendations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { type: "string" },
            recommendedFor: {
              type: "array",
              items: { type: "string" },
            },
            recommendationText: { type: "string" },
            linkedObjectiveTexts: {
              type: "array",
              items: { type: "string" },
            },
            clientBenefits: {
              type: "array",
              items: { type: "string" },
            },
            consequences: {
              type: "array",
              items: { type: "string" },
            },
            alternativesConsidered: {
              type: "array",
              items: { type: "string" },
            },
            rationale: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
          },
          required: [
            "type",
            "recommendedFor",
            "recommendationText",
            "linkedObjectiveTexts",
            "clientBenefits",
            "consequences",
            "alternativesConsidered",
            "rationale",
          ],
        },
      },
    },
    required: ["recommendations"],
  },
} as const;

function isAzureOpenAiBaseUrl(baseUrl: string) {
  return /(?:\.openai\.azure\.com|\.services\.ai\.azure\.com)/i.test(baseUrl);
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function looksLikeProductAdvice(text: string) {
  const normalized = text.toLowerCase();
  const productActionPattern =
    /\b(retain|replace|roll(?:\s|-)?over|consolidat(?:e|ion)|establish|commence|switch|dispose|transfer|platform|wrap|managed account|model portfolio|asset allocation|portfolio|investment approach|risk profile implementation|product fee|fee comparison)\b/;
  const productNounPattern =
    /\b(superannuation|super\b|pension|account[-\s]?based pension|investment product|managed fund|investment portfolio|platform|wrap|hub24|north|mynorth|aware|amp|colonial|netwealth|macquarie|australian retirement trust|art\b|insignia|mlc|ioof|bt panorama)\b/;

  return productActionPattern.test(normalized) && productNounPattern.test(normalized);
}

function looksLikeInsuranceAdvice(text: string) {
  return /\b(insurance|life\s*(?:\/|and)?\s*tpd|tpd|trauma|income protection|ip cover|life cover|cover adequacy|cover gap|sum insured|insured|premium|underwriting|waiting period|benefit period|policy|default cover|in-super cover|insurance needs|needs analysis)\b/i.test(
    text,
  );
}

function isAllowedStrategyRecommendation(text: string) {
  return !looksLikeProductAdvice(text) && !looksLikeInsuranceAdvice(text);
}

function normalizeStrategyDrafts(value: unknown, clientName?: string | null): StrategyRecommendationDraftV1[] | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const recommendations = Array.isArray((value as Record<string, unknown>).recommendations)
    ? ((value as Record<string, unknown>).recommendations as unknown[])
    : null;

  if (!recommendations) {
    return null;
  }

  const normalized = recommendations
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({
      type: typeof entry.type === "string" ? entry.type.trim() : "other",
      recommendedFor: normalizeStringArray(entry.recommendedFor),
      recommendationText:
        typeof entry.recommendationText === "string"
          ? normalizeRecommendationLanguage(entry.recommendationText, clientName)
          : "",
      linkedObjectiveTexts: normalizeStringArray(entry.linkedObjectiveTexts),
      clientBenefits: normalizeStringArray(entry.clientBenefits),
      consequences: normalizeStringArray(entry.consequences),
      alternativesConsidered: normalizeStringArray(entry.alternativesConsidered),
      rationale: typeof entry.rationale === "string" ? entry.rationale.trim() : null,
    }))
    .filter((entry) => entry.recommendationText && isAllowedStrategyRecommendation(entry.recommendationText));

  return normalized.length ? normalized : null;
}

function parseJsonObject(text: string) {
  return JSON.parse(text) as unknown;
}

function summarizeObjectives(
  objectives: SoaStrategyDraftRequest["objectives"],
): Array<{ text: string; priority: string }> {
  return objectives.map((objective) => ({
    text: objective.text,
    priority: objective.priority ?? "unknown",
  }));
}

function summarizeUploadedFiles(
  uploadedFiles: SoaStrategyDraftRequest["uploadedFiles"],
) {
  return (uploadedFiles ?? []).map((file) => ({
    name: file.name,
    kind: file.kind ?? "unknown",
    extractedTextExcerpt: file.extractedText?.trim()
      ? file.extractedText.trim().slice(0, 3000)
      : null,
  }));
}

function summarizeRecentMessages(
  recentMessages: SoaStrategyDraftRequest["recentMessages"],
) {
  return (recentMessages ?? [])
    .filter((message): message is { role?: "assistant" | "user"; content?: string } => Boolean(message?.content?.trim()))
    .slice(-6)
    .map((message) => ({
      role: message.role ?? "user",
      content: message.content?.trim() ?? "",
    }));
}

function buildFallbackStrategyDrafts(request: SoaStrategyDraftRequest): StrategyRecommendationDraftV1[] {
  const recommendationTexts =
    request.intakeAssessment?.candidateStrategyRecommendations?.length
      ? request.intakeAssessment.candidateStrategyRecommendations
      : request.intakeAssessment?.candidateStrategies?.map((entry) => entry.text) ?? [];

  return recommendationTexts.map((recommendationText) => ({
    type: "other",
    recommendedFor: (request.clientPeople?.length ? request.clientPeople.map((person) => person.name) : [request.clientName ?? "Client"]).filter(Boolean),
    recommendationText: normalizeRecommendationLanguage(recommendationText, request.clientName),
    linkedObjectiveTexts: request.objectives.map((objective) => objective.text).filter(Boolean),
    clientBenefits: [],
    consequences: [],
    alternativesConsidered: [],
    rationale: null,
  })).filter((recommendation) => isAllowedStrategyRecommendation(recommendation.recommendationText));
}

function fallbackStrategyDrafts(request: SoaStrategyDraftRequest, warning?: string | null): StrategyDraftResponseV1 {
  return {
    recommendations: buildFallbackStrategyDrafts(request),
    source: "fallback",
    model: null,
    warning: warning ?? "Finley fell back to the local strategy draft engine.",
  };
}

async function requestOpenAiStrategyDrafts(
  request: SoaStrategyDraftRequest,
): Promise<StrategyRecommendationDraftV1[] | null> {
  const isAzure = isAzureOpenAiBaseUrl(OPENAI_BASE_URL);
  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(isAzure ? { "api-key": OPENAI_API_KEY } : { authorization: `Bearer ${OPENAI_API_KEY}` }),
    },
    body: JSON.stringify({
      model: OPENAI_SOA_INTAKE_MODEL,
      messages: [
        {
          role: "system",
          content:
            [
              "You are Finley, an AI assistant helping an Australian financial adviser prepare a Statement of Advice.",
              "Draft strategy recommendations only and return JSON matching the provided schema.",
              "Strategy recommendations are non-product strategy advice only.",
              "Do not include advice to retain, replace, rollover, consolidate, establish, commence, switch, dispose of, or alter any superannuation, pension, investment, insurance, platform, wrap, managed account, portfolio, or other financial product.",
              "Do not include insurance needs, cover adequacy, cover reviews, Life/TPD, Trauma, Income Protection, policy ownership, funding, premiums, underwriting, default cover, in-super cover, or insurance review triggers in strategy recommendations. Those belong only in Insurance Needs Analysis, Recommended Insurance Policies, Insurance Replacement, or another insurance-specific section.",
              "Do not include investment portfolio construction, asset allocation, model portfolio, risk profile implementation, platform administration, or product-fee comparison recommendations in strategy recommendations.",
              "If a potential recommendation depends on a specific product, provider, account, platform, portfolio, rollover, retention, establishment, consolidation, or replacement action, exclude it from this response. It belongs in Product Recommendations, Portfolio Allocation, Replacement Analysis, or another product-specific section.",
              "Examples that are NOT strategy recommendations: retain AMP MyNorth Pension, rollover Aware Super, establish an account-based pension, consolidate super accounts, retain a conservative/balanced pension portfolio, change portfolio asset allocation, implement a managed portfolio, compare product/platform fees, review Life/TPD cover, reassess income protection, document default cover review triggers, or retain/cancel/increase insurance.",
              "Examples that CAN be strategy recommendations: salary sacrifice as a contribution strategy, commence retirement income planning at a high level without naming a product, manage cashflow/reserves, Centrelink strategy, contribution timing, tax strategy, debt repayment strategy, estate planning referral, or projection/scenario analysis.",
              "Every strategy recommendation must explicitly identify who the strategy is for. Populate recommendedFor with one or more names from clientPeople.",
              "If the strategy applies only to the primary client, address that person by name in recommendationText, for example '<first name>, we recommend you ...'.",
              "If the strategy applies only to the partner, address that person by name in recommendationText.",
              "If the strategy applies to both members of the household, populate recommendedFor with both names and write the recommendation jointly, for example 'Michael and Kimberly, we recommend you ...' or 'We recommend you jointly ...'.",
              "Do not leave the word 'you' ambiguous where clientPeople contains both a client and partner.",
              "Write as an adviser-assistant reasoning about this specific client, not as a generic planning template.",
              "Write all recommendationText, clientBenefits, rationale, consequences, and alternativesConsidered in second person, addressed directly to the client using 'you' and 'your'.",
              "For recommendationText, use professional adviser recommendation language: write 'we recommend you ...' or, where natural, '<first name>, we recommend you ...'.",
              "Do not use 'you should', 'you need to', or 'you must' in recommendationText because that reads as opinion or instruction rather than advice.",
              "Do not write about the client in third person using wording such as 'Guy's retirement savings', 'their objectives', 'the client will benefit', 'he', 'she', or 'they'.",
              "For joint clients, use 'you' and 'your' as the collective addressee. Use names only where needed to identify who owns an account or who will take a specific action, then return to second-person wording.",
              "Every recommendation must clearly reflect the client's personal circumstances, timing, constraints, and stated objectives where the evidence supports that.",
              "For each recommendation:",
              "- explain the recommended action in concrete terms",
              "- link it to the client's relevant goals",
              "- explain why it is suitable in the client's circumstances",
              "- explain how it advances the client's objectives",
              "- include realistic benefits that are specific to this matter, not generic platitudes",
              "- include meaningful consequences, trade-offs, risks, or implementation constraints relevant to this client",
              "- include reasonable alternatives considered and why they are less suitable or were not preferred",
              "If the evidence is incomplete, be cautious and say so in the rationale rather than inventing facts.",
              "Do not invent product recommendations in this step. Do not transform product recommendations into strategy recommendations by removing the product name if the substance remains product advice.",
              "Avoid generic statements like 'improves long-term wealth' unless tied to the client's actual goals and situation.",
            ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Draft structured strategy recommendations for the current SOA matter.",
            clientName: request.clientName ?? null,
            clientPeople: request.clientPeople ?? [],
            draftingRequirements: {
              audience: "Australian financial adviser reviewing a Finley draft",
              focus: [
                "non-product strategy advice only",
                "explicit client or partner recommendation audience",
                "client-specific suitability",
                "objective linkage",
                "best-interest style reasoning",
                "meaningful trade-offs",
                "practical alternatives",
              ],
              exclusionBoundary:
                "Exclude product retention, rollover, establishment, consolidation, replacement, platform, portfolio construction, investment product advice, insurance needs analysis, insurance cover review, Life/TPD/Trauma/Income Protection, premiums, underwriting, policy ownership, and insurance review triggers from Strategy Recommendations. These belong in Product Recommendations, Insurance Needs Analysis, Recommended Insurance Policies, Insurance Replacement, or related product/insurance-specific sections.",
            },
            objectives: summarizeObjectives(request.objectives),
            scope: request.scope ?? null,
            riskProfile: request.riskProfile ?? null,
            matterSummary: request.intakeAssessment?.matterSummary ?? null,
            candidateStrategies: request.intakeAssessment?.candidateStrategies ?? [],
            candidateStrategyRecommendations: request.intakeAssessment?.candidateStrategyRecommendations ?? [],
            missingInformation: request.intakeAssessment?.missingInformation ?? [],
            uploadedFiles: summarizeUploadedFiles(request.uploadedFiles),
            recentMessages: summarizeRecentMessages(request.recentMessages),
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: strategyDraftJsonSchema,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI strategy draft request failed with status ${response.status}.`);
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
    throw new Error("OpenAI strategy draft response did not include message content.");
  }

  return normalizeStrategyDrafts(parseJsonObject(content), request.clientName);
}

export async function generateSoaStrategyDrafts(
  request: SoaStrategyDraftRequest,
): Promise<StrategyDraftResponseV1> {
  if (!OPENAI_API_KEY) {
    return fallbackStrategyDrafts(
      request,
      "Finley strategy drafting is not configured yet, so the local draft engine is being used.",
    );
  }

  try {
    const recommendations = await requestOpenAiStrategyDrafts(request);

    if (!recommendations) {
      return fallbackStrategyDrafts(
        request,
        "Finley could not parse the strategy draft response, so the local draft engine is being used.",
      );
    }

    return {
      recommendations,
      source: "llm",
      model: OPENAI_SOA_INTAKE_MODEL,
      warning: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return fallbackStrategyDrafts(
      request,
      `Finley could not complete the strategy draft request (${message}), so the local draft engine is being used.`,
    );
  }
}
