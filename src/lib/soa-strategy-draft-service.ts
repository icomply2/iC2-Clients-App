import type { AdviceScopeV1, RiskProfileV1 } from "@/lib/soa-types";
import type {
  IntakeAssessmentV1,
  StrategyDraftResponseV1,
  StrategyRecommendationDraftV1,
} from "@/lib/soa-output-contracts";

export type SoaStrategyDraftRequest = {
  clientName?: string | null;
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

function normalizeStrategyDrafts(value: unknown): StrategyRecommendationDraftV1[] | null {
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
      recommendationText: typeof entry.recommendationText === "string" ? entry.recommendationText.trim() : "",
      linkedObjectiveTexts: normalizeStringArray(entry.linkedObjectiveTexts),
      clientBenefits: normalizeStringArray(entry.clientBenefits),
      consequences: normalizeStringArray(entry.consequences),
      alternativesConsidered: normalizeStringArray(entry.alternativesConsidered),
      rationale: typeof entry.rationale === "string" ? entry.rationale.trim() : null,
    }))
    .filter((entry) => entry.recommendationText);

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
    recommendationText,
    linkedObjectiveTexts: request.objectives.map((objective) => objective.text).filter(Boolean),
    clientBenefits: [],
    consequences: [],
    alternativesConsidered: [],
    rationale: null,
  }));
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
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            [
              "You are Finley, an AI assistant helping an Australian financial adviser prepare a Statement of Advice.",
              "Draft strategy recommendations only and return JSON matching the provided schema.",
              "Write as an adviser-assistant reasoning about this specific client, not as a generic planning template.",
              "Write all recommendationText, clientBenefits, rationale, consequences, and alternativesConsidered in second person, addressed directly to the client using 'you' and 'your'.",
              "Do not write about the client in third person using wording such as 'Guy's retirement savings', 'their objectives', 'the client will benefit', 'he', 'she', or 'they'.",
              "For joint clients, use 'you' and 'your' as the collective addressee. Use names only where needed to identify who owns an account or who will take a specific action, then return to second-person wording.",
              "Every recommendation must clearly reflect the client's personal circumstances, timing, constraints, and stated objectives where the evidence supports that.",
              "For each recommendation:",
              "- explain what should be done in concrete terms",
              "- link it to the client's relevant goals",
              "- explain why it is suitable in the client's circumstances",
              "- explain how it advances the client's objectives",
              "- include realistic benefits that are specific to this matter, not generic platitudes",
              "- include meaningful consequences, trade-offs, risks, or implementation constraints relevant to this client",
              "- include reasonable alternatives considered and why they are less suitable or were not preferred",
              "If the evidence is incomplete, be cautious and say so in the rationale rather than inventing facts.",
              "Do not invent product recommendations in this step.",
              "Avoid generic statements like 'improves long-term wealth' unless tied to the client's actual goals and situation.",
            ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Draft structured strategy recommendations for the current SOA matter.",
            clientName: request.clientName ?? null,
            draftingRequirements: {
              audience: "Australian financial adviser reviewing a Finley draft",
              focus: [
                "client-specific suitability",
                "objective linkage",
                "best-interest style reasoning",
                "meaningful trade-offs",
                "practical alternatives",
              ],
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

  return normalizeStrategyDrafts(parseJsonObject(content));
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
