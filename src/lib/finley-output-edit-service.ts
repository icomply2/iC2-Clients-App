import type { RoaDraftValue } from "@/lib/roa-draft-service";

export type FinleyOutputEditKind = "engagement_letter" | "ongoing_agreement" | "annual_agreement" | "record_of_advice";

export type EngagementLetterOutput = {
  reasonsHtml: string;
  servicesHtml: string;
  advicePreparationFee: string;
  implementationFee: string;
};

export type AgreementOutput = {
  services: string[];
  fees: Array<{
    entity: string;
    product: string;
    feeAmount: string;
    frequency: string;
    annualFee: string;
    deductionAccount: string;
  }>;
  consentNotes: string;
};

export type FinleyOutputEditRequest = {
  outputKind: FinleyOutputEditKind;
  activeClientName?: string | null;
  adviserInstruction: string;
  currentOutput: EngagementLetterOutput | AgreementOutput | RoaDraftValue;
  recentMessages?: Array<{
    role?: "assistant" | "user";
    content?: string | null;
  }> | null;
  uploadedFiles?: Array<{
    name?: string | null;
    tags?: string[] | null;
    extractedText?: string | null;
  }> | null;
};

export type FinleyOutputEditResponse = {
  decision: "edit_current_output" | "needs_clarification" | "handoff_to_workflow";
  assistantMessage: string;
  changeSummary: string;
  missingInformation: string[];
  handoffReason: string;
  updatedEngagementLetter: EngagementLetterOutput | null;
  updatedAgreement: AgreementOutput | null;
  updatedRecordOfAdvice: RoaDraftValue | null;
  source: "llm" | "configuration";
  model: string | null;
  warning: string | null;
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim() ?? "";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
const OPENAI_OUTPUT_EDIT_MODEL =
  process.env.OPENAI_OUTPUT_EDIT_MODEL?.trim() || process.env.OPENAI_SOA_INTAKE_MODEL?.trim() || "gpt-5.2";

const roaTextSectionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    body: { type: "string" },
    bullets: { type: "array", items: { type: "string" } },
  },
  required: ["title", "body", "bullets"],
} as const;

const roaRecommendationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    heading: { type: "string" },
    recommendationText: { type: "string" },
    rationale: { type: "string" },
    benefits: { type: "array", items: { type: "string" } },
    consequences: { type: "array", items: { type: "string" } },
    alternativesConsidered: { type: "array", items: { type: "string" } },
    implementationNotes: { type: "string" },
  },
  required: [
    "heading",
    "recommendationText",
    "rationale",
    "benefits",
    "consequences",
    "alternativesConsidered",
    "implementationNotes",
  ],
} as const;

const roaProductRecommendationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    heading: { type: "string" },
    productName: { type: "string" },
    provider: { type: "string" },
    action: { type: "string" },
    recommendationText: { type: "string" },
    rationale: { type: "string" },
    benefits: { type: "array", items: { type: "string" } },
    consequences: { type: "array", items: { type: "string" } },
    costs: { type: "array", items: { type: "string" } },
    alternativesConsidered: { type: "array", items: { type: "string" } },
    implementationNotes: { type: "string" },
  },
  required: [
    "heading",
    "productName",
    "provider",
    "action",
    "recommendationText",
    "rationale",
    "benefits",
    "consequences",
    "costs",
    "alternativesConsidered",
    "implementationNotes",
  ],
} as const;

const roaPortfolioAllocationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    rationale: { type: "string" },
    implementationNotes: { type: "string" },
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          assetClass: { type: "string" },
          current: { type: "string" },
          riskProfile: { type: "string" },
          recommended: { type: "string" },
          variance: { type: "string" },
        },
        required: ["assetClass", "current", "riskProfile", "recommended", "variance"],
      },
    },
  },
  required: ["rationale", "implementationNotes", "rows"],
} as const;

const roaInvestmentPortfolioSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    body: { type: "string" },
    bullets: { type: "array", items: { type: "string" } },
    ownerName: { type: "string" },
    holdings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          rowType: { type: "string", enum: ["platform", "holding", "subtotal"] },
          fund: { type: "string" },
          current: { type: "string" },
          change: { type: "string" },
          proposed: { type: "string" },
        },
        required: ["rowType", "fund", "current", "change", "proposed"],
      },
    },
  },
  required: ["title", "body", "bullets", "ownerName", "holdings"],
} as const;

const roaFeeDisclosureSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    adviceFeeRows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          feeType: { type: "string" },
          amount: { type: "string" },
        },
        required: ["feeType", "amount"],
      },
    },
    productFeeOwnerName: { type: "string" },
    productFeeRows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          rowStatus: { type: "string", enum: ["recommended", "current", "alternative", "unknown"] },
          product: { type: "string" },
          feeType: { type: "string" },
          percentage: { type: "string" },
          amount: { type: "string" },
        },
        required: ["rowStatus", "product", "feeType", "percentage", "amount"],
      },
    },
    commissions: { type: "array", items: { type: "string" } },
    disclosureNotes: { type: "array", items: { type: "string" } },
  },
  required: ["adviceFeeRows", "productFeeOwnerName", "productFeeRows", "commissions", "disclosureNotes"],
} as const;

const roaAuthoritySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    actions: { type: "array", items: { type: "string" } },
    confirmations: { type: "array", items: { type: "string" } },
    outstandingItems: { type: "array", items: { type: "string" } },
  },
  required: ["actions", "confirmations", "outstandingItems"],
} as const;

const outputEditJsonSchema = {
  name: "finley_active_output_edit",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      decision: {
        type: "string",
        enum: ["edit_current_output", "needs_clarification", "handoff_to_workflow"],
      },
      assistantMessage: { type: "string" },
      changeSummary: { type: "string" },
      missingInformation: {
        type: "array",
        items: { type: "string" },
      },
      handoffReason: { type: "string" },
      updatedEngagementLetter: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            properties: {
              reasonsHtml: { type: "string" },
              servicesHtml: { type: "string" },
              advicePreparationFee: { type: "string" },
              implementationFee: { type: "string" },
            },
            required: ["reasonsHtml", "servicesHtml", "advicePreparationFee", "implementationFee"],
          },
          { type: "null" },
        ],
      },
      updatedAgreement: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            properties: {
              services: {
                type: "array",
                items: { type: "string" },
              },
              fees: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    entity: { type: "string" },
                    product: { type: "string" },
                    feeAmount: { type: "string" },
                    frequency: { type: "string" },
                    annualFee: { type: "string" },
                    deductionAccount: { type: "string" },
                  },
                  required: ["entity", "product", "feeAmount", "frequency", "annualFee", "deductionAccount"],
                },
              },
              consentNotes: { type: "string" },
            },
            required: ["services", "fees", "consentNotes"],
          },
          { type: "null" },
        ],
      },
      updatedRecordOfAdvice: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            properties: {
              frontPageLetter: { type: "string" },
              scopeOfAdvice: roaTextSectionSchema,
              strategyRecommendations: { type: "array", items: roaRecommendationSchema },
              productRecommendations: { type: "array", items: roaProductRecommendationSchema },
              investmentPortfolioRecommendations: roaInvestmentPortfolioSchema,
              portfolioAllocation: roaPortfolioAllocationSchema,
              replacementAnalysis: roaTextSectionSchema,
              feesAndDisclosures: roaFeeDisclosureSchema,
              authorityToProceed: roaAuthoritySchema,
            },
            required: [
              "frontPageLetter",
              "scopeOfAdvice",
              "strategyRecommendations",
              "productRecommendations",
              "investmentPortfolioRecommendations",
              "portfolioAllocation",
              "replacementAnalysis",
              "feesAndDisclosures",
              "authorityToProceed",
            ],
          },
          { type: "null" },
        ],
      },
    },
    required: [
      "decision",
      "assistantMessage",
      "changeSummary",
      "missingInformation",
      "handoffReason",
      "updatedEngagementLetter",
      "updatedAgreement",
      "updatedRecordOfAdvice",
    ],
  },
} as const;

function isAzureOpenAiBaseUrl(baseUrl: string) {
  return /(?:\.openai\.azure\.com|\.services\.ai\.azure\.com)/i.test(baseUrl);
}

function normalizeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeStringArrayWithFallback(value: unknown, fallback: string[] = []) {
  const normalized = normalizeStringArray(value);
  return normalized.length ? normalized : fallback;
}

function sanitizeHtml(value: unknown) {
  const html = normalizeString(value);

  if (!html) return "";

  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(\/?)\s*([a-z0-9-]+)\b[^>]*>/gi, (_match, slash: string, tag: string) => {
      const normalizedTag = tag.toLowerCase();
      if (!["p", "ul", "ol", "li", "strong", "b", "em", "br"].includes(normalizedTag)) {
        return "";
      }

      return normalizedTag === "br" ? "<br>" : `<${slash ? "/" : ""}${normalizedTag}>`;
    });
}

function normalizeEngagementLetter(value: unknown): EngagementLetterOutput | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;

  return {
    reasonsHtml: sanitizeHtml(record.reasonsHtml),
    servicesHtml: sanitizeHtml(record.servicesHtml),
    advicePreparationFee: normalizeString(record.advicePreparationFee),
    implementationFee: normalizeString(record.implementationFee),
  };
}

function normalizeAgreement(value: unknown): AgreementOutput | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;

  return {
    services: normalizeStringArray(record.services),
    fees: Array.isArray(record.fees)
      ? record.fees.map((entry) => {
          const fee = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
          return {
            entity: normalizeString(fee.entity, "To be confirmed"),
            product: normalizeString(fee.product, "To be confirmed"),
            feeAmount: normalizeString(fee.feeAmount, "$0.00"),
            frequency: normalizeString(fee.frequency, "Monthly"),
            annualFee: normalizeString(fee.annualFee, "$0.00"),
            deductionAccount: normalizeString(fee.deductionAccount),
          };
        })
      : [],
    consentNotes: normalizeString(record.consentNotes),
  };
}

function defaultRoaTextSection(title: string, body = "To be confirmed."): RoaDraftValue["scopeOfAdvice"] {
  return { title, body, bullets: [] };
}

function defaultRoaRecommendation(heading: string): RoaDraftValue["strategyRecommendations"][number] {
  return {
    heading,
    recommendationText: "To be confirmed.",
    rationale: "To be confirmed.",
    benefits: [],
    consequences: [],
    alternativesConsidered: [],
    implementationNotes: "",
  };
}

function defaultRoaProductRecommendation(): RoaDraftValue["productRecommendations"][number] {
  return {
    ...defaultRoaRecommendation("Product recommendation"),
    productName: "To be confirmed",
    provider: "To be confirmed",
    action: "To be confirmed",
    costs: [],
  };
}

function normalizeRoaTextSection(value: unknown, fallback: RoaDraftValue["scopeOfAdvice"]) {
  if (typeof value === "string") {
    return { ...fallback, body: normalizeString(value, fallback.body) };
  }

  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};

  return {
    title: normalizeString(record.title, fallback.title),
    body: normalizeString(record.body, fallback.body),
    bullets: normalizeStringArrayWithFallback(record.bullets, fallback.bullets),
  };
}

function normalizeRoaInvestmentPortfolio(
  value: unknown,
  fallback: RoaDraftValue["investmentPortfolioRecommendations"],
) {
  if (typeof value === "string") {
    return { ...fallback, body: normalizeString(value, fallback.body) };
  }

  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const holdings = Array.isArray(record.holdings)
    ? record.holdings.map((entry) => {
        const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
        const rowType: RoaDraftValue["investmentPortfolioRecommendations"]["holdings"][number]["rowType"] =
          row.rowType === "platform" || row.rowType === "holding" || row.rowType === "subtotal"
          ? row.rowType
          : "holding";

        return {
          rowType,
          fund: normalizeString(row.fund, "To be confirmed"),
          current: normalizeString(row.current, rowType === "platform" ? "" : "-"),
          change: normalizeString(row.change, rowType === "platform" ? "" : "-"),
          proposed: normalizeString(row.proposed, rowType === "platform" ? "" : "-"),
        };
      })
    : fallback.holdings;

  return {
    title: normalizeString(record.title, fallback.title),
    body: normalizeString(record.body, fallback.body),
    bullets: normalizeStringArrayWithFallback(record.bullets, fallback.bullets),
    ownerName: normalizeString(record.ownerName, fallback.ownerName),
    holdings: holdings.length ? holdings : fallback.holdings,
  };
}

function normalizeRoaRecommendation(value: unknown, fallback: RoaDraftValue["strategyRecommendations"][number]) {
  if (typeof value === "string") {
    return { ...fallback, recommendationText: normalizeString(value, fallback.recommendationText) };
  }

  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};

  return {
    heading: normalizeString(record.heading, fallback.heading),
    recommendationText: normalizeString(record.recommendationText, fallback.recommendationText),
    rationale: normalizeString(record.rationale, fallback.rationale),
    benefits: normalizeStringArrayWithFallback(record.benefits, fallback.benefits),
    consequences: normalizeStringArrayWithFallback(record.consequences, fallback.consequences),
    alternativesConsidered: normalizeStringArrayWithFallback(record.alternativesConsidered, fallback.alternativesConsidered),
    implementationNotes: normalizeString(record.implementationNotes, fallback.implementationNotes),
  };
}

function normalizeRoaProductRecommendation(
  value: unknown,
  fallback: RoaDraftValue["productRecommendations"][number],
) {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const base = normalizeRoaRecommendation(value, fallback);

  return {
    ...base,
    productName: normalizeString(record.productName, fallback.productName),
    provider: normalizeString(record.provider, fallback.provider),
    action: normalizeString(record.action, fallback.action),
    costs: normalizeStringArrayWithFallback(record.costs, fallback.costs),
  };
}

function normalizeRecordOfAdvice(value: unknown): RoaDraftValue | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const strategyFallback = defaultRoaRecommendation("Strategy recommendation");
  const productFallback = defaultRoaProductRecommendation();
  const strategyRecommendations = typeof record.strategyRecommendations === "string"
    ? [normalizeRoaRecommendation(record.strategyRecommendations, strategyFallback)]
    : Array.isArray(record.strategyRecommendations)
      ? record.strategyRecommendations.map((entry, index) =>
          normalizeRoaRecommendation(entry, defaultRoaRecommendation(index === 0 ? "Strategy recommendation" : `Strategy recommendation ${index + 1}`)),
        )
      : [strategyFallback];
  const productRecommendations = typeof record.productRecommendations === "string"
    ? [normalizeRoaProductRecommendation(record.productRecommendations, productFallback)]
    : Array.isArray(record.productRecommendations)
      ? record.productRecommendations.map((entry, index) =>
          normalizeRoaProductRecommendation(entry, {
            ...productFallback,
            heading: index === 0 ? "Product recommendation" : `Product recommendation ${index + 1}`,
          }),
        )
      : [productFallback];
  const portfolioRecord = record.portfolioAllocation && typeof record.portfolioAllocation === "object"
    ? record.portfolioAllocation as Record<string, unknown>
    : {};
  const portfolioRows = Array.isArray(portfolioRecord.rows)
    ? portfolioRecord.rows.map((entry) => {
        const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
        return {
          assetClass: normalizeString(row.assetClass, "To be confirmed"),
          current: normalizeString(row.current, "-"),
          riskProfile: normalizeString(row.riskProfile, "-"),
          recommended: normalizeString(row.recommended, "-"),
          variance: normalizeString(row.variance, "-"),
        };
      })
    : [];
  const feesRecord = record.feesAndDisclosures && typeof record.feesAndDisclosures === "object"
    ? record.feesAndDisclosures as Record<string, unknown>
    : {};
  const authorityRecord = record.authorityToProceed && typeof record.authorityToProceed === "object"
    ? record.authorityToProceed as Record<string, unknown>
    : {};

  return {
    frontPageLetter: normalizeString(record.frontPageLetter, "To be confirmed."),
    scopeOfAdvice: normalizeRoaTextSection(record.scopeOfAdvice, defaultRoaTextSection("Scope of Advice")),
    strategyRecommendations,
    productRecommendations,
    investmentPortfolioRecommendations: normalizeRoaInvestmentPortfolio(
      record.investmentPortfolioRecommendations,
      {
        ...defaultRoaTextSection("Investment Portfolio Recommendations"),
        ownerName: "To be confirmed",
        holdings: [
          { rowType: "platform", fund: "Recommended portfolio", current: "", change: "", proposed: "" },
          { rowType: "holding", fund: "Confirm recommended holdings", current: "-", change: "-", proposed: "-" },
        ],
      },
    ),
    portfolioAllocation: {
      rationale: typeof record.portfolioAllocation === "string"
        ? normalizeString(record.portfolioAllocation)
        : normalizeString(portfolioRecord.rationale, "To be confirmed."),
      implementationNotes: normalizeString(portfolioRecord.implementationNotes),
      rows: portfolioRows.length
        ? portfolioRows
        : [{ assetClass: "To be confirmed", current: "-", riskProfile: "-", recommended: "-", variance: "-" }],
    },
    replacementAnalysis: normalizeRoaTextSection(record.replacementAnalysis, defaultRoaTextSection("Replacement Analysis")),
    feesAndDisclosures: typeof record.feesAndDisclosures === "string"
      ? {
          adviceFeeRows: [],
          productFeeOwnerName: "To be confirmed",
          productFeeRows: [],
          commissions: [],
          disclosureNotes: [normalizeString(record.feesAndDisclosures, "To be confirmed.")],
        }
      : {
          adviceFeeRows: Array.isArray(feesRecord.adviceFeeRows)
            ? feesRecord.adviceFeeRows.map((entry) => {
                const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
                return {
                  feeType: normalizeString(row.feeType, "Advice Fee"),
                  amount: normalizeString(row.amount, "To be confirmed"),
                };
              })
            : normalizeStringArrayWithFallback(feesRecord.adviceFees, ["Confirm advice fees."]).map((fee, index) => ({
                feeType: index === 0 ? "Advice Fee" : `Advice Fee ${index + 1}`,
                amount: fee,
              })),
          productFeeOwnerName: normalizeString(feesRecord.productFeeOwnerName, "To be confirmed"),
          productFeeRows: Array.isArray(feesRecord.productFeeRows)
            ? feesRecord.productFeeRows.map((entry) => {
                const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
                const rowStatus: RoaDraftValue["feesAndDisclosures"]["productFeeRows"][number]["rowStatus"] =
                  row.rowStatus === "recommended" ||
                  row.rowStatus === "current" ||
                  row.rowStatus === "alternative" ||
                  row.rowStatus === "unknown"
                    ? row.rowStatus
                    : "unknown";
                return {
                  rowStatus,
                  product: normalizeString(row.product, "To be confirmed"),
                  feeType: normalizeString(row.feeType, "To be confirmed"),
                  percentage: normalizeString(row.percentage, "-"),
                  amount: normalizeString(row.amount, "To be confirmed"),
                };
              })
            : normalizeStringArrayWithFallback(feesRecord.productFees, ["Confirm product fees."]).map((fee) => ({
                rowStatus: "unknown" as const,
                product: "To be confirmed",
                feeType: fee,
                percentage: "-",
                amount: "To be confirmed",
              })),
          commissions: normalizeStringArrayWithFallback(feesRecord.commissions, ["Confirm commissions."]),
          disclosureNotes: normalizeStringArrayWithFallback(feesRecord.disclosureNotes, ["Confirm material disclosures."]),
        },
    authorityToProceed: typeof record.authorityToProceed === "string"
      ? {
          actions: [normalizeString(record.authorityToProceed, "Confirm actions to proceed.")],
          confirmations: [],
          outstandingItems: [],
        }
      : {
          actions: normalizeStringArrayWithFallback(authorityRecord.actions, ["Confirm actions to proceed."]),
          confirmations: normalizeStringArrayWithFallback(authorityRecord.confirmations, ["Confirm client authority."]),
          outstandingItems: normalizeStringArrayWithFallback(authorityRecord.outstandingItems, []),
        },
  };
}

function normalizeDecision(value: unknown): FinleyOutputEditResponse["decision"] {
  return value === "edit_current_output" || value === "needs_clarification" || value === "handoff_to_workflow"
    ? value
    : "needs_clarification";
}

function normalizeOutputEditResponse(value: unknown): Omit<FinleyOutputEditResponse, "source" | "model" | "warning"> | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;

  return {
    decision: normalizeDecision(record.decision),
    assistantMessage: normalizeString(record.assistantMessage, "I reviewed the active output."),
    changeSummary: normalizeString(record.changeSummary),
    missingInformation: normalizeStringArray(record.missingInformation),
    handoffReason: normalizeString(record.handoffReason),
    updatedEngagementLetter: normalizeEngagementLetter(record.updatedEngagementLetter),
    updatedAgreement: normalizeAgreement(record.updatedAgreement),
    updatedRecordOfAdvice: normalizeRecordOfAdvice(record.updatedRecordOfAdvice),
  };
}

function outputContractFor(kind: FinleyOutputEditKind) {
  if (kind === "engagement_letter") {
    return {
      label: "Engagement Letter",
      editableFields: {
        reasonsHtml: "HTML for why the client is seeking advice and what the engagement is intended to address.",
        servicesHtml: "HTML for the Initial Advice Service / Tasks to be completed by us section.",
        advicePreparationFee: "Advice preparation fee text/value shown in the fee table.",
        implementationFee: "Implementation fee text/value shown in the fee table.",
      },
      outputRules: [
        "Return a complete updatedEngagementLetter object when decision is edit_current_output.",
        "reasonsHtml and servicesHtml are rendered directly as HTML in the workspace.",
        "Use only simple HTML in reasonsHtml and servicesHtml: p, ul, ol, li, strong, b, em, br.",
        "servicesHtml must contain a lead paragraph and a real HTML list, for example: <p>We will...</p><ul><li>First service.</li><li>Second service.</li></ul>.",
        "Do not return plain text for reasonsHtml or servicesHtml.",
        "Preserve the letter terms, signoff, and fields that are not represented in currentOutput.",
        "Keep wording suitable for an Australian financial advice engagement letter.",
        "Do not turn engagement-letter scope into SOA recommendation wording.",
      ],
    };
  }

  if (kind === "record_of_advice") {
    return {
      label: "Record of Advice",
      editableFields: {
        frontPageLetter: "ROA-specific opening letter text. This can differ from the SOA front page.",
        scopeOfAdvice: "Structured text section with title, body, and bullets.",
        strategyRecommendations:
          "Array of SOA-style strategy recommendations. The visible section uses only recommendationText, benefits, consequences, and alternativesConsidered.",
        productRecommendations:
          "Array of SOA-style product recommendations. The visible section uses productName, provider, action, recommendationText, benefits, consequences, costs, and alternativesConsidered.",
        investmentPortfolioRecommendations: "Structured text section with title, body, and bullets.",
        investmentPortfolioRecommendedHoldings:
          "Within investmentPortfolioRecommendations, preserve ownerName and holdings rows. Holdings rows render like SOA Recommended Holdings with rowType platform, holding, or subtotal plus fund, current, change, and proposed.",
        portfolioAllocation:
          "SOA-style allocation section with rationale, implementationNotes, and rows containing assetClass, current, riskProfile, recommended, and variance.",
        replacementAnalysis: "Structured text section with title, body, and bullets for replacement/switching analysis.",
        feesAndDisclosures:
          "SOA-style fee disclosure object with adviceFeeRows, productFeeOwnerName, ProductRex-style productFeeRows, commissions, and disclosureNotes. productFeeRows include rowStatus so current/comparison rows can be excluded from the visible ROA table.",
        authorityToProceed: "Grouped SOA-style authority arrays: actions, confirmations, and outstandingItems.",
      },
      outputRules: [
        "Return a complete updatedRecordOfAdvice object when decision is edit_current_output.",
        "Preserve the SOA-style structure of each ROA section; do not collapse structured recommendation, fee, allocation, or authority fields into plain text.",
        "For strategy recommendation edits, keep the visible content to recommendation, benefits, consequences and trade-offs, and alternatives considered. Do not add separate implementation notes or a separate best-interest rationale block.",
        "For product recommendation edits, keep the visible content to product details, recommendation, benefits, consequences and trade-offs, costs, and alternatives considered. Do not add separate implementation notes or a separate reasons/rationale block.",
        "For ProductRex fee edits, keep the visible product fee table limited to recommended product fees. Mark current/comparison fee rows as current or alternative and recommended product fee rows as recommended.",
        "Preserve unchanged ROA sections exactly unless the adviser asks to change them.",
        "Keep wording suitable for adviser review before client-facing finalisation.",
        "Use uploaded evidence as context, but do not invent product names, fees, dates, or implementation steps.",
        "If requested content is missing from the evidence, state what needs confirmation in the relevant section.",
        "Do not turn the ROA into a full Statement of Advice; keep it concise and focused on changed advice or updates.",
      ],
    };
  }

  return {
    label: kind === "annual_agreement" ? "Annual Advice Agreement" : "Ongoing Service Agreement",
    editableFields: {
      services: "Array of service descriptions shown under the services the client is entitled to receive.",
      fees:
        "Array of fee table rows shown under Fees Payable. Each row has entity, product, feeAmount, frequency, annualFee, and deductionAccount.",
      consentNotes:
        "Optional plain-language note shown under Consent To Deduct Fees From Your Account, used for deduction account details or consent-specific wording.",
    },
    outputRules: [
      "Return a complete updatedAgreement object when decision is edit_current_output.",
      "Keep services as concise client-facing service descriptions.",
      "Put fee amounts, payment frequency, product/account details, and deduction account references in fees and consentNotes, not in services.",
      "When a monthly fee is provided, calculate the annualFee as monthly amount multiplied by 12 unless the adviser gives a different annual amount.",
      "If a deduction account is provided, set deductionAccount and include a concise consentNotes sentence.",
      "Do not add a Fees & Billing service bullet merely because fee information was supplied.",
      "Preserve services the adviser did not ask to change.",
      "Do not invent fees, product details, or consent dates unless the adviser provides them.",
    ],
  };
}

function buildEvidenceContext(files: FinleyOutputEditRequest["uploadedFiles"]) {
  return (files ?? [])
    .filter((file) => file?.extractedText?.trim())
    .slice(0, 3)
    .map((file) => ({
      name: file.name ?? "Uploaded file",
      tags: Array.isArray(file.tags) ? file.tags.filter((tag): tag is string => typeof tag === "string") : [],
      extractedText: file.extractedText?.trim().slice(0, 5000) ?? "",
    }));
}

function validateModelEdit(request: FinleyOutputEditRequest, edit: Omit<FinleyOutputEditResponse, "source" | "model" | "warning">) {
  if (edit.decision !== "edit_current_output") {
    return edit;
  }

  if (request.outputKind === "engagement_letter" && !edit.updatedEngagementLetter) {
    return {
      ...edit,
      decision: "needs_clarification" as const,
      assistantMessage: "I understood this as an engagement letter edit, but I could not produce a valid updated draft. Please try the instruction again with the section you want changed.",
      missingInformation: ["Confirm which engagement letter section should change."],
    };
  }

  if ((request.outputKind === "ongoing_agreement" || request.outputKind === "annual_agreement") && !edit.updatedAgreement) {
    return {
      ...edit,
      decision: "needs_clarification" as const,
      assistantMessage: "I understood this as an agreement edit, but I could not produce a valid updated services list. Please confirm the services wording you want changed.",
      missingInformation: ["Confirm which agreement services should change."],
    };
  }

  if (request.outputKind === "record_of_advice" && !edit.updatedRecordOfAdvice) {
    return {
      ...edit,
      decision: "needs_clarification" as const,
      assistantMessage: "I understood this as a Record of Advice edit, but I could not produce a valid updated draft. Please try the instruction again with the section you want changed.",
      missingInformation: ["Confirm which Record of Advice section should change."],
    };
  }

  return edit;
}

export async function editFinleyActiveOutput(request: FinleyOutputEditRequest): Promise<FinleyOutputEditResponse> {
  if (!OPENAI_API_KEY) {
    return {
      decision: "needs_clarification",
      assistantMessage:
        "Finley needs the document editing model configured before it can safely rewrite the active output.",
      changeSummary: "",
      missingInformation: ["Configure OPENAI_API_KEY and OPENAI_SOA_INTAKE_MODEL for active output editing."],
      handoffReason: "",
      updatedEngagementLetter: null,
      updatedAgreement: null,
      updatedRecordOfAdvice: null,
      source: "configuration",
      model: null,
      warning: "OPENAI_API_KEY is not configured, so Finley did not attempt a local rule-based document edit.",
    };
  }

  const contract = outputContractFor(request.outputKind);
  const isAzure = isAzureOpenAiBaseUrl(OPENAI_BASE_URL);
  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(isAzure ? { "api-key": OPENAI_API_KEY } : { authorization: `Bearer ${OPENAI_API_KEY}` }),
    },
    body: JSON.stringify({
      model: OPENAI_OUTPUT_EDIT_MODEL,
      messages: [
        {
          role: "system",
          content: [
            "You are Finley, an intelligent paraplanner inside an Australian financial advice workspace.",
            "You are output-aware: you can see the active output type, its editable fields, its current content, and the adviser's latest natural-language instruction.",
            "You decide whether the instruction should edit the active output, needs clarification, or should be handed off to the broader workflow router.",
            "Do not rely on keyword matching. Infer the adviser intent from the active output, current draft, recent chat, and uploaded evidence.",
            "If the adviser asks to refine, rewrite, add, remove, shorten, expand, formalise, simplify, or otherwise change the visible draft, choose edit_current_output.",
            "If the adviser asks to create a file note, update fact find/client records, create an invoice, or start another workflow, choose handoff_to_workflow.",
            "If the instruction is genuinely ambiguous for the active output, choose needs_clarification and ask one concise question.",
            "For edits, return the full updated output object for the active output type, preserving unchanged fields.",
            "Respect the active output contract exactly. If a field is HTML, return valid HTML for that field rather than plain text.",
            "Use uploaded evidence as context, but do not claim anything has been saved or approved.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Decide and apply an active workspace output instruction.",
            activeOutputKind: request.outputKind,
            activeOutputContract: contract,
            activeClientName: request.activeClientName ?? null,
            currentOutput: request.currentOutput,
            latestAdviserInstruction: request.adviserInstruction,
            recentMessages: request.recentMessages ?? [],
            uploadedEvidence: buildEvidenceContext(request.uploadedFiles),
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: outputEditJsonSchema,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Active output edit request failed with status ${response.status}.`);
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
    throw new Error("Active output edit response did not include message content.");
  }

  const parsed = normalizeOutputEditResponse(JSON.parse(content));

  if (!parsed) {
    throw new Error("Active output edit response did not match the expected shape.");
  }

  const validated = validateModelEdit(request, parsed);

  return {
    ...validated,
    source: "llm",
    model: OPENAI_OUTPUT_EDIT_MODEL,
    warning: null,
  };
}
