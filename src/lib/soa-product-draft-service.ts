import type { AdviceScopeV1, RiskProfileV1 } from "@/lib/soa-types";
import type {
  IntakeAssessmentV1,
  ProductDraftResponseV1,
  ProductRecommendationDraftV1,
} from "@/lib/soa-output-contracts";

export type SoaProductDraftRequest = {
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

const productDraftJsonSchema = {
  name: "soa_product_drafts",
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
            action: {
              type: "string",
              enum: ["obtain", "retain", "replace", "rollover", "consolidate", "dispose"],
            },
            productType: {
              type: "string",
              enum: ["super", "pension", "investment", "annuity", "insurance", "other"],
            },
            recommendationText: { type: "string" },
            linkedObjectiveTexts: {
              type: "array",
              items: { type: "string" },
            },
            currentProductName: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
            currentProvider: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
            recommendedProductName: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
            recommendedProvider: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
            clientBenefits: {
              type: "array",
              items: { type: "string" },
            },
            consequences: {
              type: "array",
              items: { type: "string" },
            },
            suitabilityRationale: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
            alternativesConsidered: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  productName: {
                    anyOf: [{ type: "string" }, { type: "null" }],
                  },
                  provider: {
                    anyOf: [{ type: "string" }, { type: "null" }],
                  },
                  reasonDiscounted: {
                    anyOf: [{ type: "string" }, { type: "null" }],
                  },
                },
                required: ["productName", "provider", "reasonDiscounted"],
              },
            },
          },
          required: [
            "action",
            "productType",
            "recommendationText",
            "linkedObjectiveTexts",
            "currentProductName",
            "currentProvider",
            "recommendedProductName",
            "recommendedProvider",
            "clientBenefits",
            "consequences",
            "suitabilityRationale",
            "alternativesConsidered",
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

function parseJsonObject(text: string) {
  return JSON.parse(text) as unknown;
}

function summarizeObjectives(objectives: SoaProductDraftRequest["objectives"]) {
  return objectives.map((objective) => ({
    text: objective.text,
    priority: objective.priority ?? "unknown",
  }));
}

function summarizeUploadedFiles(uploadedFiles: SoaProductDraftRequest["uploadedFiles"]) {
  return (uploadedFiles ?? []).map((file) => ({
    name: file.name,
    kind: file.kind ?? "unknown",
    extractedTextExcerpt: file.extractedText?.trim() ? file.extractedText.trim().slice(0, 3000) : null,
  }));
}

function summarizeRecentMessages(recentMessages: SoaProductDraftRequest["recentMessages"]) {
  return (recentMessages ?? [])
    .filter((message): message is { role?: "assistant" | "user"; content?: string } => Boolean(message?.content?.trim()))
    .slice(-6)
    .map((message) => ({
      role: message.role ?? "user",
      content: message.content?.trim() ?? "",
    }));
}

function normalizeProductDrafts(value: unknown): ProductRecommendationDraftV1[] | null {
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
      action: (
        entry.action === "obtain" ||
        entry.action === "retain" ||
        entry.action === "replace" ||
        entry.action === "rollover" ||
        entry.action === "consolidate" ||
        entry.action === "dispose"
          ? entry.action
          : "retain"
      ) as ProductRecommendationDraftV1["action"],
      productType: (
        entry.productType === "super" ||
        entry.productType === "pension" ||
        entry.productType === "investment" ||
        entry.productType === "annuity" ||
        entry.productType === "insurance" ||
        entry.productType === "other"
          ? entry.productType
          : "other"
      ) as ProductRecommendationDraftV1["productType"],
      recommendationText: typeof entry.recommendationText === "string" ? entry.recommendationText.trim() : "",
      linkedObjectiveTexts: normalizeStringArray(entry.linkedObjectiveTexts),
      currentProductName: typeof entry.currentProductName === "string" ? entry.currentProductName.trim() : null,
      currentProvider: typeof entry.currentProvider === "string" ? entry.currentProvider.trim() : null,
      recommendedProductName:
        typeof entry.recommendedProductName === "string" ? entry.recommendedProductName.trim() : null,
      recommendedProvider:
        typeof entry.recommendedProvider === "string" ? entry.recommendedProvider.trim() : null,
      clientBenefits: normalizeStringArray(entry.clientBenefits),
      consequences: normalizeStringArray(entry.consequences),
      suitabilityRationale: typeof entry.suitabilityRationale === "string" ? entry.suitabilityRationale.trim() : null,
      alternativesConsidered: Array.isArray(entry.alternativesConsidered)
        ? entry.alternativesConsidered
            .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
            .map((item) => ({
              productName: typeof item.productName === "string" ? item.productName.trim() : null,
              provider: typeof item.provider === "string" ? item.provider.trim() : null,
              reasonDiscounted: typeof item.reasonDiscounted === "string" ? item.reasonDiscounted.trim() : null,
            }))
        : [],
    }))
    .filter((entry) => entry.recommendationText);

  return normalized.length ? normalized : null;
}

function buildFallbackProductDrafts(request: SoaProductDraftRequest): ProductRecommendationDraftV1[] {
  return (request.intakeAssessment?.candidateProductReviewNotes ?? []).map((note) => ({
    action: "retain",
    productType: "other",
    recommendationText: note,
    linkedObjectiveTexts: request.objectives.map((objective) => objective.text).filter(Boolean),
    currentProductName: null,
    currentProvider: null,
    recommendedProductName: null,
    recommendedProvider: null,
    clientBenefits: [],
    consequences: [],
    suitabilityRationale: null,
    alternativesConsidered: [],
  }));
}

function fallbackProductDrafts(request: SoaProductDraftRequest, warning?: string | null): ProductDraftResponseV1 {
  return {
    recommendations: buildFallbackProductDrafts(request),
    source: "fallback",
    model: null,
    warning: warning ?? "Finley fell back to the local product draft engine.",
  };
}

async function requestOpenAiProductDrafts(
  request: SoaProductDraftRequest,
): Promise<ProductRecommendationDraftV1[] | null> {
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
          content: [
            "You are Finley, an AI assistant helping an Australian financial adviser prepare a Statement of Advice.",
            "Draft product recommendations only and return JSON matching the provided schema.",
            "Write as an adviser-assistant reasoning about this specific client and their likely product needs, not as a generic product marketing template.",
            "Write all recommendationText, clientBenefits, suitabilityRationale, consequences, and alternativesConsidered.reasonDiscounted in second person, addressed directly to the client using 'you' and 'your'.",
            "Do not write about the client in third person using wording such as 'Guy's superannuation', 'their objectives', 'the client will benefit', 'he', 'she', or 'they'.",
            "For joint clients, use 'you' and 'your' as the collective addressee. Use names only where needed to identify account ownership, policy ownership, or which person will take a specific action, then return to second-person wording.",
            "Every recommendation must explain the current position where known, the proposed product direction, and why the recommendation is suitable for this client's goals and circumstances.",
            "For each recommendation:",
            "- state the action clearly (retain, replace, rollover, consolidate, obtain, or dispose)",
            "- use consolidate when multiple existing funds or accounts are being consolidated into one recommended fund or account",
            "- explain how the recommendation supports the client's objectives",
            "- explain why the current position may be less suitable where relevant",
            "- include meaningful benefits specific to this matter",
            "- include realistic consequences, trade-offs, fees, implementation constraints, or risks where relevant",
            "- include practical discounted alternatives and why they were not preferred",
            "If evidence is incomplete, be cautious and say so in the suitability rationale rather than inventing facts.",
            "Avoid generic claims like 'more competitive' or 'better suited' unless tied to the client's actual goals, scope, or circumstances.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Draft structured product recommendations for the current SOA matter.",
            clientName: request.clientName ?? null,
            draftingRequirements: {
              audience: "Australian financial adviser reviewing a Finley draft",
              focus: [
                "client-specific product suitability",
                "current versus proposed reasoning",
                "objective linkage",
                "trade-offs and implementation reality",
                "discounted alternatives",
              ],
            },
            objectives: summarizeObjectives(request.objectives),
            scope: request.scope ?? null,
            riskProfile: request.riskProfile ?? null,
            matterSummary: request.intakeAssessment?.matterSummary ?? null,
            candidateProductReviewNotes: request.intakeAssessment?.candidateProductReviewNotes ?? [],
            missingInformation: request.intakeAssessment?.missingInformation ?? [],
            uploadedFiles: summarizeUploadedFiles(request.uploadedFiles),
            recentMessages: summarizeRecentMessages(request.recentMessages),
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: productDraftJsonSchema,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI product draft request failed with status ${response.status}.`);
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
    throw new Error("OpenAI product draft response did not include message content.");
  }

  return normalizeProductDrafts(parseJsonObject(content));
}

export async function generateSoaProductDrafts(
  request: SoaProductDraftRequest,
): Promise<ProductDraftResponseV1> {
  if (!OPENAI_API_KEY) {
    return fallbackProductDrafts(
      request,
      "Finley product drafting is not configured yet, so the local draft engine is being used.",
    );
  }

  try {
    const recommendations = await requestOpenAiProductDrafts(request);

    if (!recommendations) {
      return fallbackProductDrafts(
        request,
        "Finley could not parse the product draft response, so the local draft engine is being used.",
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
    return fallbackProductDrafts(
      request,
      `Finley could not complete the product draft request (${message}), so the local draft engine is being used.`,
    );
  }
}
