import type { AdviceModuleV1 } from "@/lib/soa-types";
import type { IntakeAssessmentV1 } from "@/lib/soa-output-contracts";
import {
  generateIntakeAssessment,
  refineIntakeAssessment,
  type IntakeEngineInput,
} from "@/lib/soa-intake-engine";

export type SoaIntakeRequest = {
  clientName?: string | null;
  uploadedFiles: Array<{
    name: string;
    kind?: string | null;
    extractedText?: string | null;
  }>;
  adviserMessage: string;
  currentAssessment?: IntakeAssessmentV1 | null;
  recentMessages?: Array<{
    role?: "assistant" | "user";
    content?: string;
  }> | null;
};

export type SoaIntakeResponse = {
  assessment: IntakeAssessmentV1;
  source: "llm" | "fallback";
  model: string | null;
  warning?: string | null;
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim() ?? "";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
const OPENAI_SOA_INTAKE_MODEL = process.env.OPENAI_SOA_INTAKE_MODEL?.trim() || "gpt-5.2";

const MODULE_ENUM: AdviceModuleV1[] = [
  "strategy-advice",
  "product-advice",
  "replacement-advice",
  "portfolio-advice",
  "insurance-advice",
  "projection-analysis",
];

type ObjectivePriority = "high" | "medium" | "low" | "unknown" | null;

const intakeAssessmentJsonSchema = {
  name: "soa_intake_assessment",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      matterSummary: { type: "string" },
      candidateModules: {
        type: "array",
        items: { type: "string", enum: MODULE_ENUM },
      },
      candidateObjectives: {
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
            sourceNote: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
          },
          required: ["text", "priority", "sourceNote"],
        },
      },
      candidateStrategies: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            text: { type: "string" },
            linkedThemes: {
              anyOf: [
                { type: "array", items: { type: "string" } },
                { type: "null" },
              ],
            },
            sourceNote: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
          },
          required: ["text", "linkedThemes", "sourceNote"],
        },
      },
      candidateScopeInclusions: {
        type: "array",
        items: { type: "string" },
      },
      candidateScopeExclusions: {
        type: "array",
        items: { type: "string" },
      },
      candidateStrategyRecommendations: {
        type: "array",
        items: { type: "string" },
      },
      candidateProductReviewNotes: {
        type: "array",
        items: { type: "string" },
      },
      candidateInsuranceReviewNotes: {
        type: "array",
        items: { type: "string" },
      },
      candidateProjectionNotes: {
        type: "array",
        items: { type: "string" },
      },
      missingInformation: {
        type: "array",
        items: { type: "string" },
      },
      followUpQuestions: {
        type: "array",
        items: { type: "string" },
      },
      confidence: {
        type: "string",
        enum: ["low", "medium", "high"],
      },
    },
    required: [
      "matterSummary",
      "candidateModules",
      "candidateObjectives",
      "candidateStrategies",
      "candidateScopeInclusions",
      "candidateScopeExclusions",
      "candidateStrategyRecommendations",
      "candidateProductReviewNotes",
      "candidateInsuranceReviewNotes",
      "candidateProjectionNotes",
      "missingInformation",
      "followUpQuestions",
      "confidence",
    ],
  },
} as const;

function toEngineInput(request: SoaIntakeRequest): IntakeEngineInput {
  return {
    clientName: request.clientName ?? null,
    uploadedFileNames: request.uploadedFiles.map((file) => file.name),
    adviserMessage: request.adviserMessage,
  };
}

function fallbackAssessment(request: SoaIntakeRequest, warning?: string | null): SoaIntakeResponse {
  const engineInput = toEngineInput(request);
  const assessment = request.currentAssessment
    ? refineIntakeAssessment(request.currentAssessment, engineInput)
    : generateIntakeAssessment(engineInput);

  return {
    assessment,
    source: "fallback",
    model: null,
    warning: warning ?? "LLM intake is not configured or unavailable, so Finley is using the local intake engine.",
  };
}

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

  if (!OPENAI_SOA_INTAKE_MODEL) {
    missingKeys.push("OPENAI_SOA_INTAKE_MODEL");
  }

  if (!missingKeys.length) {
    return null;
  }

  return `Finley LLM intake is not configured yet. Add ${missingKeys.join(", ")} to your local server environment to enable the real intake model.`;
}

function parseJsonObject(text: string) {
  return JSON.parse(text) as unknown;
}

function summarizeUploadedFiles(uploadedFiles: SoaIntakeRequest["uploadedFiles"]) {
  return uploadedFiles.map((file) => ({
    name: file.name,
    kind: file.kind ?? "unknown",
    extractedTextExcerpt: file.extractedText?.trim() ? file.extractedText.trim().slice(0, 3000) : null,
  }));
}

function summarizeRecentMessages(recentMessages: SoaIntakeRequest["recentMessages"]) {
  return (recentMessages ?? [])
    .filter((message): message is { role?: "assistant" | "user"; content?: string } => Boolean(message?.content?.trim()))
    .slice(-6)
    .map((message) => ({
      role: message.role ?? "user",
      content: message.content?.trim() ?? "",
    }));
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeAssessment(value: unknown): IntakeAssessmentV1 | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const matterSummary = typeof record.matterSummary === "string" ? record.matterSummary.trim() : "";
  const candidateModules = normalizeStringArray(record.candidateModules).filter((module): module is AdviceModuleV1 =>
    MODULE_ENUM.includes(module as AdviceModuleV1),
  );
  const candidateObjectives = Array.isArray(record.candidateObjectives)
    ? record.candidateObjectives
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
        .map((entry) => ({
          text: typeof entry.text === "string" ? entry.text.trim() : "",
          priority: (
            entry.priority === "high" ||
            entry.priority === "medium" ||
            entry.priority === "low" ||
            entry.priority === "unknown"
              ? entry.priority
              : null
          ) as ObjectivePriority,
          sourceNote: typeof entry.sourceNote === "string" ? entry.sourceNote.trim() : null,
        }))
        .filter((entry) => entry.text)
    : [];
  const candidateStrategies = Array.isArray(record.candidateStrategies)
    ? record.candidateStrategies
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
        .map((entry) => ({
          text: typeof entry.text === "string" ? entry.text.trim() : "",
          linkedThemes: normalizeStringArray(entry.linkedThemes),
          sourceNote: typeof entry.sourceNote === "string" ? entry.sourceNote.trim() : null,
        }))
        .filter((entry) => entry.text)
    : [];
  const confidence =
    record.confidence === "high" || record.confidence === "medium" || record.confidence === "low"
      ? record.confidence
      : "medium";

  if (!matterSummary) {
    return null;
  }

  return {
    matterSummary,
    candidateModules,
    candidateObjectives,
    candidateStrategies,
    candidateScopeInclusions: normalizeStringArray(record.candidateScopeInclusions),
    candidateScopeExclusions: normalizeStringArray(record.candidateScopeExclusions),
    candidateStrategyRecommendations: normalizeStringArray(record.candidateStrategyRecommendations),
    candidateProductReviewNotes: normalizeStringArray(record.candidateProductReviewNotes),
    candidateInsuranceReviewNotes: normalizeStringArray(record.candidateInsuranceReviewNotes),
    candidateProjectionNotes: normalizeStringArray(record.candidateProjectionNotes),
    missingInformation: normalizeStringArray(record.missingInformation),
    followUpQuestions: normalizeStringArray(record.followUpQuestions),
    confidence,
  };
}

async function requestOpenAiAssessment(request: SoaIntakeRequest): Promise<IntakeAssessmentV1 | null> {
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
              "Review the intake context and return only JSON that matches the provided schema.",
              "Distinguish explicit facts from inference, suggest only likely advice modules, keep follow-up questions concise, and do not overstate confidence.",
              "When drafting candidate objectives, write them in a client-specific way that reflects this client's goals, priorities, timing, and personal circumstances where the evidence supports that.",
              "Do not produce generic objective wording that could apply to any client.",
              "When drafting scope inclusions and exclusions, identify what appears to be in scope for this matter and what is not yet clearly in scope.",
              "Scope items should reflect the actual advice matter suggested by the evidence, not broad template labels unless the evidence is thin.",
              "Explain the likely advice shape by connecting the client's goals to the likely advice modules and scope areas.",
              "If the evidence is incomplete, keep the wording cautious and identify the uncertainty in missingInformation rather than inventing facts.",
            ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Generate or refine an SOA intake assessment.",
            clientName: request.clientName ?? null,
            draftingRequirements: {
              focus: [
                "client-specific objectives",
                "matter-specific scope",
                "clear linkage between client goals and likely advice areas",
                "cautious handling of incomplete evidence",
              ],
            },
            uploadedFiles: summarizeUploadedFiles(request.uploadedFiles),
            recentMessages: summarizeRecentMessages(request.recentMessages),
            currentAssessment: request.currentAssessment ?? null,
            latestAdviserMessage: request.adviserMessage,
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: intakeAssessmentJsonSchema,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI intake request failed with status ${response.status}.`);
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
    throw new Error("OpenAI intake response did not include message content.");
  }

  return normalizeAssessment(parseJsonObject(content));
}

export async function generateSoaIntakeAssessment(request: SoaIntakeRequest): Promise<SoaIntakeResponse> {
  const missingConfigurationWarning = getMissingConfigurationWarning();

  if (missingConfigurationWarning) {
    return fallbackAssessment(request, missingConfigurationWarning);
  }

  try {
    const assessment = await requestOpenAiAssessment(request);

    if (!assessment) {
      return fallbackAssessment(
        request,
        "Finley could not parse the model response, so it has fallen back to the local intake engine.",
      );
    }

    return {
      assessment,
      source: "llm",
      model: OPENAI_SOA_INTAKE_MODEL,
      warning: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const isAzure = isAzureOpenAiBaseUrl(OPENAI_BASE_URL);
    return fallbackAssessment(
      request,
      isAzure
        ? `Finley could not reach the configured Azure OpenAI intake endpoint (${message}). Check that OPENAI_BASE_URL points to your Azure /openai/v1 endpoint, OPENAI_API_KEY is the Azure resource key, and OPENAI_SOA_INTAKE_MODEL matches your Azure deployment name.`
        : `Finley could not reach the configured LLM intake endpoint (${message}), so it has fallen back to the local intake engine.`,
    );
  }
}
