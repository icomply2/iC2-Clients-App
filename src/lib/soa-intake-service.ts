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
  activeFollowUpQuestion?: string | null;
  answeredFollowUpResponses?: Record<string, string> | null;
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
      documentInsights: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            fileName: { type: "string" },
            documentType: {
              type: "string",
              enum: [
                "client_meeting_transcript",
                "fact_find",
                "paraplanning_request",
                "product_report",
                "fee_schedule",
                "service_agreement",
                "insurance_document",
                "unknown",
              ],
            },
            summary: { type: "string" },
            adviserInstructions: { type: "array", items: { type: "string" } },
            clientStatements: { type: "array", items: { type: "string" } },
            extractedFacts: { type: "array", items: { type: "string" } },
            evidenceReferences: { type: "array", items: { type: "string" } },
          },
          required: [
            "fileName",
            "documentType",
            "summary",
            "adviserInstructions",
            "clientStatements",
            "extractedFacts",
            "evidenceReferences",
          ],
        },
      },
      evidenceBackedConfirmations: {
        type: "array",
        items: { type: "string" },
      },
      readinessBySection: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            sectionId: {
              type: "string",
              enum: [
                "soa-introduction",
                "risk-profile",
                "scope-of-advice",
                "objectives",
                "strategy-recommendations",
                "product-recommendations",
                "replacement-analysis",
                "insurance-analysis",
                "insurance-policies",
                "insurance-replacement",
                "portfolio-allocation",
                "projections",
                "disclosure",
                "service-agreement",
                "appendix",
              ],
            },
            label: { type: "string" },
            status: {
              type: "string",
              enum: ["ready-to-draft", "needs-confirmation", "missing-information", "out-of-scope"],
            },
            summary: { type: "string" },
            missingInformation: {
              type: "array",
              items: { type: "string" },
            },
            confirmationsRequired: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["sectionId", "label", "status", "summary", "missingInformation", "confirmationsRequired"],
        },
      },
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
      candidateInsuranceNeedsAnalyses: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            ownerName: { anyOf: [{ type: "string" }, { type: "null" }] },
            policyType: {
              anyOf: [
                { type: "string", enum: ["life", "tpd", "trauma", "income-protection", "other"] },
                { type: "null" },
              ],
            },
            methodology: {
              anyOf: [
                { type: "string", enum: ["needs-analysis", "multiple-of-income", "expense-replacement", "debt-clearance", "other"] },
                { type: "null" },
              ],
            },
            purpose: { anyOf: [{ type: "string" }, { type: "null" }] },
            annualIncome: { anyOf: [{ type: "number" }, { type: "null" }] },
            annualLivingExpenses: { anyOf: [{ type: "number" }, { type: "null" }] },
            liabilitiesToRepay: { anyOf: [{ type: "number" }, { type: "null" }] },
            dependantsCount: { anyOf: [{ type: "number" }, { type: "null" }] },
            dependantSupportYears: { anyOf: [{ type: "number" }, { type: "null" }] },
            educationCosts: { anyOf: [{ type: "number" }, { type: "null" }] },
            existingCoverAmount: { anyOf: [{ type: "number" }, { type: "null" }] },
            superannuationBalance: { anyOf: [{ type: "number" }, { type: "null" }] },
            otherAssetsAvailable: { anyOf: [{ type: "number" }, { type: "null" }] },
            targetCoverAmount: { anyOf: [{ type: "number" }, { type: "null" }] },
            coverGapAmount: { anyOf: [{ type: "number" }, { type: "null" }] },
            suggestedWaitingPeriod: { anyOf: [{ type: "string" }, { type: "null" }] },
            suggestedBenefitPeriod: { anyOf: [{ type: "string" }, { type: "null" }] },
            suggestedPolicyOwnership: {
              anyOf: [{ type: "string", enum: ["super", "retail", "either", "unknown"] }, { type: "null" }],
            },
            rationale: { anyOf: [{ type: "string" }, { type: "null" }] },
            sourceNote: { anyOf: [{ type: "string" }, { type: "null" }] },
          },
          required: [
            "ownerName",
            "policyType",
            "methodology",
            "purpose",
            "annualIncome",
            "annualLivingExpenses",
            "liabilitiesToRepay",
            "dependantsCount",
            "dependantSupportYears",
            "educationCosts",
            "existingCoverAmount",
            "superannuationBalance",
            "otherAssetsAvailable",
            "targetCoverAmount",
            "coverGapAmount",
            "suggestedWaitingPeriod",
            "suggestedBenefitPeriod",
            "suggestedPolicyOwnership",
            "rationale",
            "sourceNote",
          ],
        },
      },
      candidateInsurancePolicyRecommendations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            insuredName: { anyOf: [{ type: "string" }, { type: "null" }] },
            action: {
              anyOf: [
                {
                  type: "string",
                  enum: ["apply-new", "retain-existing", "replace-existing", "vary-existing", "cancel", "not-recommended"],
                },
                { type: "null" },
              ],
            },
            insurerName: { anyOf: [{ type: "string" }, { type: "null" }] },
            productName: { anyOf: [{ type: "string" }, { type: "null" }] },
            policyName: { anyOf: [{ type: "string" }, { type: "null" }] },
            recommendationText: { anyOf: [{ type: "string" }, { type: "null" }] },
            ownershipGroups: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  ownership: {
                    anyOf: [
                      {
                        type: "string",
                        enum: ["inside-super", "outside-super", "flexi-linked", "smsf", "employer", "other", "unknown"],
                      },
                      { type: "null" },
                    ],
                  },
                  fundingSource: { anyOf: [{ type: "string" }, { type: "null" }] },
                  premiumFrequency: {
                    anyOf: [
                      {
                        type: "string",
                        enum: ["weekly", "fortnightly", "monthly", "quarterly", "half-yearly", "annually", "unknown"],
                      },
                      { type: "null" },
                    ],
                  },
                  premiumAmount: { anyOf: [{ type: "number" }, { type: "null" }] },
                  annualisedPremium: { anyOf: [{ type: "number" }, { type: "null" }] },
                  covers: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        coverType: {
                          anyOf: [
                            { type: "string", enum: ["life", "tpd", "trauma", "income-protection", "other"] },
                            { type: "null" },
                          ],
                        },
                        details: { anyOf: [{ type: "string" }, { type: "null" }] },
                        premiumType: {
                          anyOf: [
                            { type: "string", enum: ["variable-age-stepped", "stepped", "level", "hybrid", "unknown"] },
                            { type: "null" },
                          ],
                        },
                        sumInsured: { anyOf: [{ type: "number" }, { type: "null" }] },
                        monthlyBenefit: { anyOf: [{ type: "number" }, { type: "null" }] },
                        waitingPeriod: { anyOf: [{ type: "string" }, { type: "null" }] },
                        benefitPeriod: { anyOf: [{ type: "string" }, { type: "null" }] },
                      },
                      required: ["coverType", "details", "premiumType", "sumInsured", "monthlyBenefit", "waitingPeriod", "benefitPeriod"],
                    },
                  },
                },
                required: ["ownership", "fundingSource", "premiumFrequency", "premiumAmount", "annualisedPremium", "covers"],
              },
            },
            optionalBenefits: { type: "array", items: { type: "string" } },
            premiumBreakdown: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  ownership: {
                    anyOf: [
                      {
                        type: "string",
                        enum: ["inside-super", "outside-super", "flexi-linked", "smsf", "employer", "other", "unknown"],
                      },
                      { type: "null" },
                    ],
                  },
                  label: { type: "string" },
                  amount: { anyOf: [{ type: "number" }, { type: "null" }] },
                },
                required: ["ownership", "label", "amount"],
              },
            },
            underwritingNotes: { anyOf: [{ type: "string" }, { type: "null" }] },
            replacementNotes: { anyOf: [{ type: "string" }, { type: "null" }] },
            sourceNote: { anyOf: [{ type: "string" }, { type: "null" }] },
          },
          required: [
            "insuredName",
            "action",
            "insurerName",
            "productName",
            "policyName",
            "recommendationText",
            "ownershipGroups",
            "optionalBenefits",
            "premiumBreakdown",
            "underwritingNotes",
            "replacementNotes",
            "sourceNote",
          ],
        },
      },
      candidateInsurancePolicyReplacements: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            ownerName: { anyOf: [{ type: "string" }, { type: "null" }] },
            currentInsurer: { anyOf: [{ type: "string" }, { type: "null" }] },
            recommendedInsurer: { anyOf: [{ type: "string" }, { type: "null" }] },
            currentLifeCover: { anyOf: [{ type: "number" }, { type: "null" }] },
            recommendedLifeCover: { anyOf: [{ type: "number" }, { type: "null" }] },
            currentTpdCover: { anyOf: [{ type: "number" }, { type: "null" }] },
            recommendedTpdCover: { anyOf: [{ type: "number" }, { type: "null" }] },
            currentIncomeProtectionCover: { anyOf: [{ type: "number" }, { type: "null" }] },
            recommendedIncomeProtectionCover: { anyOf: [{ type: "number" }, { type: "null" }] },
            currentTraumaCover: { anyOf: [{ type: "number" }, { type: "null" }] },
            recommendedTraumaCover: { anyOf: [{ type: "number" }, { type: "null" }] },
            currentAnnualPremium: { anyOf: [{ type: "number" }, { type: "null" }] },
            recommendedAnnualPremium: { anyOf: [{ type: "number" }, { type: "null" }] },
            premiumDifference: { anyOf: [{ type: "number" }, { type: "null" }] },
            reasons: { type: "array", items: { type: "string" } },
            costs: { type: "array", items: { type: "string" } },
            benefitsGained: { type: "array", items: { type: "string" } },
            benefitsLost: { type: "array", items: { type: "string" } },
            notes: { anyOf: [{ type: "string" }, { type: "null" }] },
            sourceNote: { anyOf: [{ type: "string" }, { type: "null" }] },
          },
          required: [
            "ownerName",
            "currentInsurer",
            "recommendedInsurer",
            "currentLifeCover",
            "recommendedLifeCover",
            "currentTpdCover",
            "recommendedTpdCover",
            "currentIncomeProtectionCover",
            "recommendedIncomeProtectionCover",
            "currentTraumaCover",
            "recommendedTraumaCover",
            "currentAnnualPremium",
            "recommendedAnnualPremium",
            "premiumDifference",
            "reasons",
            "costs",
            "benefitsGained",
            "benefitsLost",
            "notes",
            "sourceNote",
          ],
        },
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
      commercialsAndAgreements: {
        type: "object",
        additionalProperties: false,
        properties: {
          advicePreparationFee: {
            anyOf: [{ type: "number" }, { type: "null" }],
          },
          implementationFee: {
            anyOf: [{ type: "number" }, { type: "null" }],
          },
          productFeesKnown: {
            anyOf: [{ type: "boolean" }, { type: "null" }],
          },
          insuranceCommissionsIncluded: {
            anyOf: [{ type: "boolean" }, { type: "null" }],
          },
          insuranceCommissionDetails: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                ownerName: { anyOf: [{ type: "string" }, { type: "null" }] },
                productName: { anyOf: [{ type: "string" }, { type: "null" }] },
                upfrontPercentage: { anyOf: [{ type: "number" }, { type: "null" }] },
                upfrontAmount: { anyOf: [{ type: "number" }, { type: "null" }] },
                ongoingPercentage: { anyOf: [{ type: "number" }, { type: "null" }] },
                ongoingAmount: { anyOf: [{ type: "number" }, { type: "null" }] },
                sourceNote: { anyOf: [{ type: "string" }, { type: "null" }] },
              },
              required: [
                "ownerName",
                "productName",
                "upfrontPercentage",
                "upfrontAmount",
                "ongoingPercentage",
                "ongoingAmount",
                "sourceNote",
              ],
            },
          },
          serviceAgreementIncluded: {
            anyOf: [{ type: "boolean" }, { type: "null" }],
          },
          serviceAgreementType: {
            anyOf: [{ type: "string", enum: ["ongoing", "fixed-term", "none", "unknown"] }, { type: "null" }],
          },
          serviceAgreementItems: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                ownerName: { anyOf: [{ type: "string" }, { type: "null" }] },
                productName: { anyOf: [{ type: "string" }, { type: "null" }] },
                accountNumber: { anyOf: [{ type: "string" }, { type: "null" }] },
                feeAmount: { anyOf: [{ type: "number" }, { type: "null" }] },
                frequency: {
                  anyOf: [
                    {
                      type: "string",
                      enum: ["weekly", "fortnightly", "monthly", "quarterly", "half-yearly", "annually", "unknown"],
                    },
                    { type: "null" },
                  ],
                },
                sourceNote: { anyOf: [{ type: "string" }, { type: "null" }] },
              },
              required: ["ownerName", "productName", "accountNumber", "feeAmount", "frequency", "sourceNote"],
            },
          },
          missingFeeInformation: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: [
          "advicePreparationFee",
          "implementationFee",
          "productFeesKnown",
          "insuranceCommissionsIncluded",
          "insuranceCommissionDetails",
          "serviceAgreementIncluded",
          "serviceAgreementType",
          "serviceAgreementItems",
          "missingFeeInformation",
        ],
      },
      confidence: {
        type: "string",
        enum: ["low", "medium", "high"],
      },
    },
    required: [
      "matterSummary",
      "documentInsights",
      "evidenceBackedConfirmations",
      "readinessBySection",
      "candidateModules",
      "candidateObjectives",
      "candidateStrategies",
      "candidateScopeInclusions",
      "candidateScopeExclusions",
      "candidateStrategyRecommendations",
      "candidateProductReviewNotes",
      "candidateInsuranceReviewNotes",
      "candidateInsuranceNeedsAnalyses",
      "candidateInsurancePolicyRecommendations",
      "candidateInsurancePolicyReplacements",
      "candidateProjectionNotes",
      "missingInformation",
      "followUpQuestions",
      "commercialsAndAgreements",
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
    detectedDocumentTypeHint: inferDocumentTypeFromName(file.name),
    extractedTextExcerpt: summarizeExtractedText(file.extractedText),
  }));
}

function inferDocumentTypeFromName(fileName: string) {
  const normalized = fileName.toLowerCase();
  if (/(fact find|fact-find|factfind|client data form|financial profile)/i.test(normalized)) return "likely fact find";
  if (/(transcript|meeting|file note|client meeting)/i.test(normalized)) return "likely client meeting transcript";
  if (/(paraplanning|soa request|advice request|request)/i.test(normalized)) return "likely paraplanning request";
  if (/(productrex|product|platform|fee comparison)/i.test(normalized)) return "likely product report";
  if (/(fee|fees|cost)/i.test(normalized)) return "likely fee schedule";
  if (/(agreement|ongoing|fixed term|service)/i.test(normalized)) return "likely service agreement";
  if (/(insurance|commission|policy)/i.test(normalized)) return "likely insurance document";
  return "unknown";
}

function summarizeExtractedText(value?: string | null) {
  const text = value?.trim();
  if (!text) return null;
  if (text.length <= 12000) return text;
  return `${text.slice(0, 8000)}\n\n[...middle of document omitted...]\n\n${text.slice(-4000)}`;
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

function normalizeNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeNullableBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function normalizeNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeDocumentType(value: unknown): IntakeAssessmentV1["documentInsights"][number]["documentType"] {
  return value === "client_meeting_transcript" ||
    value === "fact_find" ||
    value === "paraplanning_request" ||
    value === "product_report" ||
    value === "fee_schedule" ||
    value === "service_agreement" ||
    value === "insurance_document" ||
    value === "unknown"
    ? value
    : "unknown";
}

function normalizeReadinessSectionId(value: unknown): IntakeAssessmentV1["readinessBySection"][number]["sectionId"] | null {
  return value === "soa-introduction" ||
    value === "risk-profile" ||
    value === "scope-of-advice" ||
    value === "objectives" ||
    value === "strategy-recommendations" ||
    value === "product-recommendations" ||
    value === "replacement-analysis" ||
    value === "insurance-analysis" ||
    value === "insurance-policies" ||
    value === "insurance-replacement" ||
    value === "portfolio-allocation" ||
    value === "projections" ||
    value === "disclosure" ||
    value === "service-agreement" ||
    value === "appendix"
    ? value
    : null;
}

function normalizeReadinessStatus(value: unknown): IntakeAssessmentV1["readinessBySection"][number]["status"] {
  return value === "ready-to-draft" ||
    value === "needs-confirmation" ||
    value === "missing-information" ||
    value === "out-of-scope"
    ? value
    : "needs-confirmation";
}

function normalizeServiceAgreementType(
  value: unknown,
): IntakeAssessmentV1["commercialsAndAgreements"]["serviceAgreementType"] {
  return value === "ongoing" || value === "fixed-term" || value === "none" || value === "unknown" ? value : "unknown";
}

function normalizeServiceAgreementFrequency(
  value: unknown,
): IntakeAssessmentV1["commercialsAndAgreements"]["serviceAgreementItems"][number]["frequency"] {
  return value === "weekly" ||
    value === "fortnightly" ||
    value === "monthly" ||
    value === "quarterly" ||
    value === "half-yearly" ||
    value === "annually" ||
    value === "unknown"
    ? value
    : "unknown";
}

function normalizeInsurancePolicyAction(
  value: unknown,
): IntakeAssessmentV1["candidateInsurancePolicyRecommendations"][number]["action"] {
  return value === "apply-new" ||
    value === "retain-existing" ||
    value === "replace-existing" ||
    value === "vary-existing" ||
    value === "cancel" ||
    value === "not-recommended"
    ? value
    : null;
}

function normalizeInsuranceOwnership(
  value: unknown,
): NonNullable<
  IntakeAssessmentV1["candidateInsurancePolicyRecommendations"][number]["ownershipGroups"][number]["ownership"]
> {
  return value === "inside-super" ||
    value === "outside-super" ||
    value === "flexi-linked" ||
    value === "smsf" ||
    value === "employer" ||
    value === "other" ||
    value === "unknown"
    ? value
    : "unknown";
}

function normalizeInsurancePremiumFrequency(
  value: unknown,
): NonNullable<
  IntakeAssessmentV1["candidateInsurancePolicyRecommendations"][number]["ownershipGroups"][number]["premiumFrequency"]
> {
  return value === "weekly" ||
    value === "fortnightly" ||
    value === "monthly" ||
    value === "quarterly" ||
    value === "half-yearly" ||
    value === "annually" ||
    value === "unknown"
    ? value
    : "unknown";
}

function normalizeInsuranceCoverType(
  value: unknown,
): IntakeAssessmentV1["candidateInsurancePolicyRecommendations"][number]["ownershipGroups"][number]["covers"][number]["coverType"] {
  return value === "life" || value === "tpd" || value === "trauma" || value === "income-protection" || value === "other"
    ? value
    : "other";
}

function normalizeInsuranceNeedsMethodology(
  value: unknown,
): IntakeAssessmentV1["candidateInsuranceNeedsAnalyses"][number]["methodology"] {
  return value === "needs-analysis" ||
    value === "multiple-of-income" ||
    value === "expense-replacement" ||
    value === "debt-clearance" ||
    value === "other"
    ? value
    : "needs-analysis";
}

function normalizeInsuranceSuggestedOwnership(
  value: unknown,
): IntakeAssessmentV1["candidateInsuranceNeedsAnalyses"][number]["suggestedPolicyOwnership"] {
  return value === "super" || value === "retail" || value === "either" || value === "unknown" ? value : "unknown";
}

function normalizeInsurancePremiumType(
  value: unknown,
): NonNullable<
  IntakeAssessmentV1["candidateInsurancePolicyRecommendations"][number]["ownershipGroups"][number]["covers"][number]["premiumType"]
> {
  return value === "variable-age-stepped" ||
    value === "stepped" ||
    value === "level" ||
    value === "hybrid" ||
    value === "unknown"
    ? value
    : "unknown";
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
  const documentInsights = Array.isArray(record.documentInsights)
    ? record.documentInsights
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
        .map((entry) => ({
          fileName: typeof entry.fileName === "string" ? entry.fileName.trim() : "",
          documentType: normalizeDocumentType(entry.documentType),
          summary: typeof entry.summary === "string" ? entry.summary.trim() : "",
          adviserInstructions: normalizeStringArray(entry.adviserInstructions),
          clientStatements: normalizeStringArray(entry.clientStatements),
          extractedFacts: normalizeStringArray(entry.extractedFacts),
          evidenceReferences: normalizeStringArray(entry.evidenceReferences),
        }))
        .filter((entry) => entry.fileName && entry.summary)
    : [];
  const readinessBySection = Array.isArray(record.readinessBySection)
    ? record.readinessBySection
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
        .map((entry) => {
          const sectionId = normalizeReadinessSectionId(entry.sectionId);

          if (!sectionId) {
            return null;
          }

          return {
            sectionId,
            label: typeof entry.label === "string" && entry.label.trim() ? entry.label.trim() : sectionId.replace(/-/g, " "),
            status: normalizeReadinessStatus(entry.status),
            summary: typeof entry.summary === "string" && entry.summary.trim() ? entry.summary.trim() : "Needs adviser review.",
            missingInformation: normalizeStringArray(entry.missingInformation),
            confirmationsRequired: normalizeStringArray(entry.confirmationsRequired),
          };
        })
        .filter((entry): entry is IntakeAssessmentV1["readinessBySection"][number] => Boolean(entry))
    : [];
  const commercialsRecord =
    record.commercialsAndAgreements && typeof record.commercialsAndAgreements === "object"
      ? (record.commercialsAndAgreements as Record<string, unknown>)
      : {};
  const insuranceCommissionDetails = Array.isArray(commercialsRecord.insuranceCommissionDetails)
    ? commercialsRecord.insuranceCommissionDetails
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
        .map((entry) => ({
          ownerName: normalizeNullableString(entry.ownerName),
          productName: normalizeNullableString(entry.productName),
          upfrontPercentage: normalizeNullableNumber(entry.upfrontPercentage),
          upfrontAmount: normalizeNullableNumber(entry.upfrontAmount),
          ongoingPercentage: normalizeNullableNumber(entry.ongoingPercentage),
          ongoingAmount: normalizeNullableNumber(entry.ongoingAmount),
          sourceNote: normalizeNullableString(entry.sourceNote),
        }))
    : [];
  const serviceAgreementItems = Array.isArray(commercialsRecord.serviceAgreementItems)
    ? commercialsRecord.serviceAgreementItems
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
        .map((entry) => ({
          ownerName: normalizeNullableString(entry.ownerName),
          productName: normalizeNullableString(entry.productName),
          accountNumber: normalizeNullableString(entry.accountNumber),
          feeAmount: normalizeNullableNumber(entry.feeAmount),
          frequency: normalizeServiceAgreementFrequency(entry.frequency),
          sourceNote: normalizeNullableString(entry.sourceNote),
        }))
    : [];
  const candidateInsuranceNeedsAnalyses = Array.isArray(record.candidateInsuranceNeedsAnalyses)
    ? record.candidateInsuranceNeedsAnalyses
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
        .map((entry) => ({
          ownerName: normalizeNullableString(entry.ownerName),
          policyType: normalizeInsuranceCoverType(entry.policyType),
          methodology: normalizeInsuranceNeedsMethodology(entry.methodology),
          purpose: normalizeNullableString(entry.purpose),
          annualIncome: normalizeNullableNumber(entry.annualIncome),
          annualLivingExpenses: normalizeNullableNumber(entry.annualLivingExpenses),
          liabilitiesToRepay: normalizeNullableNumber(entry.liabilitiesToRepay),
          dependantsCount: normalizeNullableNumber(entry.dependantsCount),
          dependantSupportYears: normalizeNullableNumber(entry.dependantSupportYears),
          educationCosts: normalizeNullableNumber(entry.educationCosts),
          existingCoverAmount: normalizeNullableNumber(entry.existingCoverAmount),
          superannuationBalance: normalizeNullableNumber(entry.superannuationBalance),
          otherAssetsAvailable: normalizeNullableNumber(entry.otherAssetsAvailable),
          targetCoverAmount: normalizeNullableNumber(entry.targetCoverAmount),
          coverGapAmount: normalizeNullableNumber(entry.coverGapAmount),
          suggestedWaitingPeriod: normalizeNullableString(entry.suggestedWaitingPeriod),
          suggestedBenefitPeriod: normalizeNullableString(entry.suggestedBenefitPeriod),
          suggestedPolicyOwnership: normalizeInsuranceSuggestedOwnership(entry.suggestedPolicyOwnership),
          rationale: normalizeNullableString(entry.rationale),
          sourceNote: normalizeNullableString(entry.sourceNote),
        }))
        .filter((entry) => entry.ownerName || entry.purpose || entry.targetCoverAmount !== null || entry.coverGapAmount !== null)
    : [];
  const candidateInsurancePolicyRecommendations = Array.isArray(record.candidateInsurancePolicyRecommendations)
    ? record.candidateInsurancePolicyRecommendations
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
        .map((entry) => ({
          insuredName: normalizeNullableString(entry.insuredName),
          action: normalizeInsurancePolicyAction(entry.action),
          insurerName: normalizeNullableString(entry.insurerName),
          productName: normalizeNullableString(entry.productName),
          policyName: normalizeNullableString(entry.policyName),
          recommendationText: normalizeNullableString(entry.recommendationText),
          ownershipGroups: Array.isArray(entry.ownershipGroups)
            ? entry.ownershipGroups
                .filter((group): group is Record<string, unknown> => Boolean(group) && typeof group === "object")
                .map((group) => ({
                  ownership: normalizeInsuranceOwnership(group.ownership),
                  fundingSource: normalizeNullableString(group.fundingSource),
                  premiumFrequency: normalizeInsurancePremiumFrequency(group.premiumFrequency),
                  premiumAmount: normalizeNullableNumber(group.premiumAmount),
                  annualisedPremium: normalizeNullableNumber(group.annualisedPremium),
                  covers: Array.isArray(group.covers)
                    ? group.covers
                        .filter((cover): cover is Record<string, unknown> => Boolean(cover) && typeof cover === "object")
                        .map((cover) => ({
                          coverType: normalizeInsuranceCoverType(cover.coverType),
                          details: normalizeNullableString(cover.details),
                          premiumType: normalizeInsurancePremiumType(cover.premiumType),
                          sumInsured: normalizeNullableNumber(cover.sumInsured),
                          monthlyBenefit: normalizeNullableNumber(cover.monthlyBenefit),
                          waitingPeriod: normalizeNullableString(cover.waitingPeriod),
                          benefitPeriod: normalizeNullableString(cover.benefitPeriod),
                        }))
                    : [],
                }))
            : [],
          optionalBenefits: normalizeStringArray(entry.optionalBenefits),
          premiumBreakdown: Array.isArray(entry.premiumBreakdown)
            ? entry.premiumBreakdown
                .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
                .map((item) => ({
                  ownership: normalizeInsuranceOwnership(item.ownership),
                  label: normalizeNullableString(item.label) ?? "",
                  amount: normalizeNullableNumber(item.amount),
                }))
                .filter((item) => item.label)
            : [],
          underwritingNotes: normalizeNullableString(entry.underwritingNotes),
          replacementNotes: normalizeNullableString(entry.replacementNotes),
          sourceNote: normalizeNullableString(entry.sourceNote),
        }))
        .filter((entry) => entry.insurerName || entry.productName || entry.policyName || entry.ownershipGroups.length)
    : [];
  const candidateInsurancePolicyReplacements = Array.isArray(record.candidateInsurancePolicyReplacements)
    ? record.candidateInsurancePolicyReplacements
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
        .map((entry) => ({
          ownerName: normalizeNullableString(entry.ownerName),
          currentInsurer: normalizeNullableString(entry.currentInsurer),
          recommendedInsurer: normalizeNullableString(entry.recommendedInsurer),
          currentLifeCover: normalizeNullableNumber(entry.currentLifeCover),
          recommendedLifeCover: normalizeNullableNumber(entry.recommendedLifeCover),
          currentTpdCover: normalizeNullableNumber(entry.currentTpdCover),
          recommendedTpdCover: normalizeNullableNumber(entry.recommendedTpdCover),
          currentIncomeProtectionCover: normalizeNullableNumber(entry.currentIncomeProtectionCover),
          recommendedIncomeProtectionCover: normalizeNullableNumber(entry.recommendedIncomeProtectionCover),
          currentTraumaCover: normalizeNullableNumber(entry.currentTraumaCover),
          recommendedTraumaCover: normalizeNullableNumber(entry.recommendedTraumaCover),
          currentAnnualPremium: normalizeNullableNumber(entry.currentAnnualPremium),
          recommendedAnnualPremium: normalizeNullableNumber(entry.recommendedAnnualPremium),
          premiumDifference: normalizeNullableNumber(entry.premiumDifference),
          reasons: normalizeStringArray(entry.reasons),
          costs: normalizeStringArray(entry.costs),
          benefitsGained: normalizeStringArray(entry.benefitsGained),
          benefitsLost: normalizeStringArray(entry.benefitsLost),
          notes: normalizeNullableString(entry.notes),
          sourceNote: normalizeNullableString(entry.sourceNote),
        }))
        .filter((entry) => entry.currentInsurer || entry.recommendedInsurer || entry.reasons.length || entry.benefitsGained.length)
    : [];

  if (!matterSummary) {
    return null;
  }

  return {
    matterSummary,
    documentInsights,
    evidenceBackedConfirmations: normalizeStringArray(record.evidenceBackedConfirmations),
    readinessBySection,
    candidateModules,
    candidateObjectives,
    candidateStrategies,
    candidateScopeInclusions: normalizeStringArray(record.candidateScopeInclusions),
    candidateScopeExclusions: normalizeStringArray(record.candidateScopeExclusions),
    candidateStrategyRecommendations: normalizeStringArray(record.candidateStrategyRecommendations),
    candidateProductReviewNotes: normalizeStringArray(record.candidateProductReviewNotes),
    candidateInsuranceReviewNotes: normalizeStringArray(record.candidateInsuranceReviewNotes),
    candidateInsuranceNeedsAnalyses,
    candidateInsurancePolicyRecommendations,
    candidateInsurancePolicyReplacements,
    candidateProjectionNotes: normalizeStringArray(record.candidateProjectionNotes),
    missingInformation: normalizeStringArray(record.missingInformation),
    followUpQuestions: normalizeStringArray(record.followUpQuestions),
    commercialsAndAgreements: {
      advicePreparationFee: normalizeNullableNumber(commercialsRecord.advicePreparationFee),
      implementationFee: normalizeNullableNumber(commercialsRecord.implementationFee),
      productFeesKnown: normalizeNullableBoolean(commercialsRecord.productFeesKnown),
      insuranceCommissionsIncluded: normalizeNullableBoolean(commercialsRecord.insuranceCommissionsIncluded),
      insuranceCommissionDetails,
      serviceAgreementIncluded: normalizeNullableBoolean(commercialsRecord.serviceAgreementIncluded),
      serviceAgreementType: normalizeServiceAgreementType(commercialsRecord.serviceAgreementType),
      serviceAgreementItems,
      missingFeeInformation: normalizeStringArray(commercialsRecord.missingFeeInformation),
    },
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
              "Treat uploaded files as evidence. Classify each file, extract key facts, adviser instructions, client statements, fee details, service agreement details, insurance commission details, and evidence-backed confirmations.",
              "Meeting transcripts often contain client goals, concerns, exclusions, affordability constraints, product preferences, and adviser explanations. Paraplanning requests often contain explicit instructions about scope, advice strategy, fees, and missing information.",
              "Fact find documents often contain the client and partner's personal details, contact details, employment, dependants, income, expenses, assets, liabilities, superannuation, pensions, insurance, entities, risk profile, estate planning, and adviser/practice context. Treat these as structured evidence for the Personal and Financial Position section and avoid asking the adviser to repeat information already found in the fact find.",
              "When reviewing a fact find, separate client facts from partner facts wherever the document identifies ownership or personal attribution. Extract amounts, owners, product/provider names, account or policy details, and dates into documentInsights.extractedFacts and evidenceBackedConfirmations so the adviser can confirm the data before it is mapped to the client profile.",
              "Do not ask blank discovery questions when the answer appears in the documents. Instead, create evidenceBackedConfirmations that cite what you found and ask the adviser to confirm or correct it.",
              "When an activeFollowUpQuestion and latestAdviserMessage are provided, treat the latest message as the answer to that question unless it clearly says otherwise. Use the answer to update the assessment, remove resolved missing information, and replace resolved follow-up questions with the next most useful questions.",
              "When answeredFollowUpResponses are provided, preserve those answers in the assessment and do not keep asking the same question unless the answer is unclear or contradictory.",
              "Distinguish explicit facts from inference, suggest only likely advice modules, keep follow-up questions concise, and do not overstate confidence.",
              "Populate readinessBySection for the SOA brief. Mark sections ready-to-draft only where the evidence and adviser instructions are enough to create a useful first draft. Mark needs-confirmation when Finley found likely information but the adviser should verify it. Mark missing-information where a section cannot be drafted responsibly yet. Mark out-of-scope when the evidence indicates the section should not be included.",
              "Readiness should cover scope, objectives, likely advice recommendation areas, fees/disclosure, service agreement, and any modules that are clearly out of scope.",
              "When drafting candidate objectives, write them in a client-specific way that reflects this client's goals, priorities, timing, and personal circumstances where the evidence supports that.",
              "Do not produce generic objective wording that could apply to any client.",
              "When drafting candidateStrategyRecommendations, candidateProductReviewNotes, candidateInsuranceReviewNotes, or candidateProjectionNotes, use second-person client-facing wording with 'you' and 'your' wherever the text may flow into the SOA workflow.",
              "Avoid third-person phrasing such as 'the client', 'Guy's', 'their objectives', 'he', 'she', or 'they' in candidate recommendation wording unless a name is strictly needed to identify account ownership or who takes a specific action.",
              "For insurance needs analysis documents, populate candidateInsuranceNeedsAnalyses with one entry per insured person and cover type. Extract calculated and agreed sums insured, existing cover, cover gaps, policy ownership, waiting and benefit periods, annual income, liabilities, super balances, education or dependant support costs, living expenses, and the rationale for the recommended cover level. Preserve adviser overrides where the agreed cover differs from the calculated amount.",
              "For insurance quote documents, populate candidateInsurancePolicyRecommendations with one recommendation per insured person and insurer/product package where the evidence supports it. Extract insurer name, product or policy name, ownership/funding structure, cover types, sum insured or monthly benefit, premium type, waiting period, benefit period, premium amount and frequency, annualised premiums, optional benefits, premium breakdown, underwriting notes, and replacement or retention notes.",
              "For insurance replacement or comparison evidence, populate candidateInsurancePolicyReplacements with current versus recommended insurer, cover levels, annual premiums, premium difference, replacement reasons, costs/trade-offs, benefits gained, and benefits lost. If an existing insurer quote is provided as an alternative/current comparison, use it as the current policy evidence unless the adviser clearly says otherwise.",
              "For insurance commission disclosure, extract both upfront and ongoing commission amounts and percentages from quote documents into commercialsAndAgreements.insuranceCommissionDetails. Set insuranceCommissionsIncluded to true whenever commission disclosure figures are present or commission consent wording is required.",
              "Do not invent insurance policy terms. If quote evidence is incomplete, leave unknown fields null or unknown and add the uncertainty to missingInformation or confirmationsRequired.",
              "Keep insurance needs analysis conceptually separate from recommended insurance policies: needs analysis is why and how much cover may be needed; policy recommendations are the actual insurer/product/cover/premium structure being recommended, retained, replaced, varied, cancelled, or not recommended.",
              "When drafting scope inclusions and exclusions, identify what appears to be in scope for this matter and what is not yet clearly in scope.",
              "Each candidateScopeExclusions item must be a complete client-facing limitation statement, not a bare label. Include the excluded advice area, the reason it is out of scope based on the adviser instruction or evidence, and the risk or consequence of not addressing that area.",
              "Preserve adviser rationale in substance. For example, if the adviser says personal insurance is out of scope because of client age, asset level, relevance, or cost, the exclusion must explain that context and note that personal insurance needs and adequacy of cover have not been reviewed.",
              "Do not reduce contextual exclusions to wording such as 'Insurance advice (explicitly excluded)' or 'Estate planning (not mentioned in evidence)' when the evidence provides a reason or residual risk.",
              "Scope items should reflect the actual advice matter suggested by the evidence, not broad template labels unless the evidence is thin.",
              "Capture fees and service agreement details in commercialsAndAgreements where the documents support them. If fee or agreement details are ambiguous, put the specific uncertainty in missingFeeInformation.",
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
                "evidence-aware document review",
                "client-specific objectives",
                "matter-specific scope",
                "clear linkage between client goals and likely advice areas",
                "commercials and service agreement confirmation",
                "section readiness before workflow creation",
                "cautious handling of incomplete evidence",
              ],
            },
            uploadedFiles: summarizeUploadedFiles(request.uploadedFiles),
            recentMessages: summarizeRecentMessages(request.recentMessages),
            currentAssessment: request.currentAssessment ?? null,
            activeFollowUpQuestion: request.activeFollowUpQuestion ?? null,
            answeredFollowUpResponses: request.answeredFollowUpResponses ?? {},
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
