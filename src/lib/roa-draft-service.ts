import type { ClientProfile } from "@/lib/api/types";

export type RoaTextSection = {
  title: string;
  body: string;
  bullets: string[];
};

export type RoaRecommendationItem = {
  heading: string;
  recommendationText: string;
  rationale: string;
  benefits: string[];
  consequences: string[];
  alternativesConsidered: string[];
  implementationNotes: string;
};

export type RoaProductRecommendationItem = RoaRecommendationItem & {
  productName: string;
  provider: string;
  action: string;
  costs: string[];
};

export type RoaRecommendedHoldingRow = {
  rowType: "platform" | "holding" | "subtotal";
  fund: string;
  current: string;
  change: string;
  proposed: string;
};

export type RoaInvestmentPortfolioRecommendations = RoaTextSection & {
  ownerName: string;
  holdings: RoaRecommendedHoldingRow[];
};

export type RoaPortfolioAllocationRow = {
  assetClass: string;
  current: string;
  riskProfile: string;
  recommended: string;
  variance: string;
};

export type RoaPortfolioAllocation = {
  rationale: string;
  implementationNotes: string;
  rows: RoaPortfolioAllocationRow[];
};

export type RoaAdviceFeeRow = {
  feeType: string;
  amount: string;
};

export type RoaProductFeeRow = {
  rowStatus: "recommended" | "current" | "alternative" | "unknown";
  product: string;
  feeType: string;
  percentage: string;
  amount: string;
};

export type RoaFeeDisclosure = {
  adviceFeeRows: RoaAdviceFeeRow[];
  productFeeOwnerName: string;
  productFeeRows: RoaProductFeeRow[];
  commissions: string[];
  disclosureNotes: string[];
};

export type RoaAuthorityToProceed = {
  actions: string[];
  confirmations: string[];
  outstandingItems: string[];
};

export type RoaDraftValue = {
  frontPageLetter: string;
  scopeOfAdvice: RoaTextSection;
  strategyRecommendations: RoaRecommendationItem[];
  productRecommendations: RoaProductRecommendationItem[];
  investmentPortfolioRecommendations: RoaInvestmentPortfolioRecommendations;
  portfolioAllocation: RoaPortfolioAllocation;
  replacementAnalysis: RoaTextSection;
  feesAndDisclosures: RoaFeeDisclosure;
  authorityToProceed: RoaAuthorityToProceed;
};

export type RoaDraftUpload = {
  name?: string | null;
  tags?: string[] | null;
  extractedText?: string | null;
};

export type GenerateRoaDraftRequest = {
  clientName?: string | null;
  adviserName?: string | null;
  profile?: ClientProfile | null;
  uploadedFiles?: RoaDraftUpload[] | null;
};

export type GenerateRoaDraftResponse = {
  draft: RoaDraftValue;
  source: "llm" | "fallback";
  model: string | null;
  warning: string | null;
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim() ?? "";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
const OPENAI_ROA_DRAFT_MODEL =
  process.env.OPENAI_ROA_DRAFT_MODEL?.trim() || process.env.OPENAI_SOA_INTAKE_MODEL?.trim() || "gpt-5.2";
const ROA_FRONT_PAGE_LETTER_TEMPLATE = [
  "This Record of Advice (ROA) is a record of my recommendations made to you <:=$client.roa_method_of_delivery:>.",
  "This RoA is to be read in conjunction with your Statement of Advice dated <:=soa_date:>. We understand that your personal circumstances have not materially changed since your previous SoA. If your personal circumstances have changed or any information in this report is incorrect, please advise us before proceeding any further.",
  "This RoA includes important information about how my recommendations can help meet your objectives, financial situation and needs, details of how much it will cost you to act on these recommendations and what I will receive as a result of the advice.",
  "Unless otherwise stated, all amounts relating to fees and charges in this ROA include GST.",
  "Should you have any queries in relation to the above or should you wish to fine-tune any aspect of the recommended strategy, please do not hesitate to contact me.",
].join("\n\n");

const textSectionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    body: { type: "string" },
    bullets: { type: "array", items: { type: "string" } },
  },
  required: ["title", "body", "bullets"],
} as const;

const recommendationSchema = {
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

const productRecommendationSchema = {
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

const portfolioAllocationSchema = {
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

const investmentPortfolioSchema = {
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

const feeDisclosureSchema = {
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

const authorityToProceedSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    actions: { type: "array", items: { type: "string" } },
    confirmations: { type: "array", items: { type: "string" } },
    outstandingItems: { type: "array", items: { type: "string" } },
  },
  required: ["actions", "confirmations", "outstandingItems"],
} as const;

const roaDraftJsonSchema = {
  name: "finley_record_of_advice_draft",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      frontPageLetter: { type: "string" },
      scopeOfAdvice: textSectionSchema,
      strategyRecommendations: { type: "array", items: recommendationSchema },
      productRecommendations: { type: "array", items: productRecommendationSchema },
      investmentPortfolioRecommendations: investmentPortfolioSchema,
      portfolioAllocation: portfolioAllocationSchema,
      replacementAnalysis: textSectionSchema,
      feesAndDisclosures: feeDisclosureSchema,
      authorityToProceed: authorityToProceedSchema,
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
} as const;

function isAzureOpenAiBaseUrl(baseUrl: string) {
  return /(?:\.openai\.azure\.com|\.services\.ai\.azure\.com)/i.test(baseUrl);
}

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeStringArray(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) return fallback;

  const clean = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return clean.length ? clean : fallback;
}

function normalizeTextSection(value: unknown, fallback: RoaTextSection): RoaTextSection {
  if (typeof value === "string") {
    return { ...fallback, body: normalizeText(value, fallback.body) };
  }

  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};

  return {
    title: normalizeText(record.title, fallback.title),
    body: normalizeText(record.body, fallback.body),
    bullets: normalizeStringArray(record.bullets, fallback.bullets),
  };
}

function normalizeInvestmentPortfolio(
  value: unknown,
  fallback: RoaInvestmentPortfolioRecommendations,
): RoaInvestmentPortfolioRecommendations {
  if (typeof value === "string") {
    return { ...fallback, body: normalizeText(value, fallback.body) };
  }

  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rows = Array.isArray(record.holdings)
    ? record.holdings.map((entry) => {
        const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
        const rowType: RoaRecommendedHoldingRow["rowType"] = row.rowType === "platform" || row.rowType === "holding" || row.rowType === "subtotal"
          ? row.rowType
          : "holding";

        return {
          rowType,
          fund: normalizeText(row.fund, "To be confirmed"),
          current: normalizeText(row.current, rowType === "platform" ? "" : "-"),
          change: normalizeText(row.change, rowType === "platform" ? "" : "-"),
          proposed: normalizeText(row.proposed, rowType === "platform" ? "" : "-"),
        };
      })
    : fallback.holdings;

  return {
    title: normalizeText(record.title, fallback.title),
    body: normalizeText(record.body, fallback.body),
    bullets: normalizeStringArray(record.bullets, fallback.bullets),
    ownerName: normalizeText(record.ownerName, fallback.ownerName),
    holdings: rows.length ? rows : fallback.holdings,
  };
}

function normalizeRecommendation(value: unknown, fallback: RoaRecommendationItem): RoaRecommendationItem {
  if (typeof value === "string") {
    return { ...fallback, recommendationText: normalizeText(value, fallback.recommendationText) };
  }

  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};

  return {
    heading: normalizeText(record.heading, fallback.heading),
    recommendationText: normalizeText(record.recommendationText, fallback.recommendationText),
    rationale: normalizeText(record.rationale, fallback.rationale),
    benefits: normalizeStringArray(record.benefits, fallback.benefits),
    consequences: normalizeStringArray(record.consequences, fallback.consequences),
    alternativesConsidered: normalizeStringArray(record.alternativesConsidered, fallback.alternativesConsidered),
    implementationNotes: normalizeText(record.implementationNotes, fallback.implementationNotes),
  };
}

function normalizeProductRecommendation(
  value: unknown,
  fallback: RoaProductRecommendationItem,
): RoaProductRecommendationItem {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const base = normalizeRecommendation(value, fallback);

  return {
    ...base,
    productName: normalizeText(record.productName, fallback.productName),
    provider: normalizeText(record.provider, fallback.provider),
    action: normalizeText(record.action, fallback.action),
    costs: normalizeStringArray(record.costs, fallback.costs),
  };
}

function normalizeRecommendationList(value: unknown, fallback: RoaRecommendationItem[]) {
  if (typeof value === "string") {
    return [normalizeRecommendation(value, fallback[0] ?? defaultStrategyRecommendation())];
  }

  if (!Array.isArray(value)) return fallback;

  const normalized = value.map((entry, index) =>
    normalizeRecommendation(entry, fallback[index] ?? defaultStrategyRecommendation(index + 1)),
  );

  return normalized.length ? normalized : fallback;
}

function normalizeProductRecommendationList(value: unknown, fallback: RoaProductRecommendationItem[]) {
  if (typeof value === "string") {
    return [normalizeProductRecommendation(value, fallback[0] ?? defaultProductRecommendation())];
  }

  if (!Array.isArray(value)) return fallback;

  const normalized = value.map((entry, index) =>
    normalizeProductRecommendation(entry, fallback[index] ?? defaultProductRecommendation(index + 1)),
  );

  return normalized.length ? normalized : fallback;
}

function normalizePortfolioAllocation(value: unknown, fallback: RoaPortfolioAllocation): RoaPortfolioAllocation {
  if (typeof value === "string") {
    return { ...fallback, rationale: normalizeText(value, fallback.rationale) };
  }

  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};

  const rows = Array.isArray(record.rows)
    ? record.rows.map((entry) => {
        const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
        return {
          assetClass: normalizeText(row.assetClass, "To be confirmed"),
          current: normalizeText(row.current, "-"),
          riskProfile: normalizeText(row.riskProfile, "-"),
          recommended: normalizeText(row.recommended, "-"),
          variance: normalizeText(row.variance, "-"),
        };
      })
    : fallback.rows;

  return {
    rationale: normalizeText(record.rationale, fallback.rationale),
    implementationNotes: normalizeText(record.implementationNotes, fallback.implementationNotes),
    rows: rows.length ? rows : fallback.rows,
  };
}

function normalizeFees(value: unknown, fallback: RoaFeeDisclosure): RoaFeeDisclosure {
  if (typeof value === "string") {
    return { ...fallback, disclosureNotes: [normalizeText(value, fallback.disclosureNotes[0] ?? "")].filter(Boolean) };
  }

  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const legacyAdviceFees = normalizeStringArray(record.adviceFees);
  const legacyProductFees = normalizeStringArray(record.productFees);
  const adviceFeeRows = Array.isArray(record.adviceFeeRows)
    ? record.adviceFeeRows.map((entry) => {
        const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
        return {
          feeType: normalizeText(row.feeType, "Advice Fee"),
          amount: normalizeText(row.amount, "To be confirmed"),
        };
      })
    : legacyAdviceFees.map((fee, index) => ({
        feeType: index === 0 ? "Advice Fee" : `Advice Fee ${index + 1}`,
        amount: fee,
      }));
  const productFeeRows = Array.isArray(record.productFeeRows)
    ? record.productFeeRows.map((entry) => {
        const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
        const rowStatus: RoaProductFeeRow["rowStatus"] =
          row.rowStatus === "recommended" ||
          row.rowStatus === "current" ||
          row.rowStatus === "alternative" ||
          row.rowStatus === "unknown"
            ? row.rowStatus
            : "unknown";
        return {
          rowStatus,
          product: normalizeText(row.product, "To be confirmed"),
          feeType: normalizeText(row.feeType, "To be confirmed"),
          percentage: normalizeText(row.percentage, "-"),
          amount: normalizeText(row.amount, "To be confirmed"),
        };
      })
    : legacyProductFees.map((fee) => ({
        rowStatus: "unknown" as const,
        product: "To be confirmed",
        feeType: fee,
        percentage: "-",
        amount: "To be confirmed",
      }));

  return {
    adviceFeeRows: adviceFeeRows.length ? adviceFeeRows : fallback.adviceFeeRows,
    productFeeOwnerName: normalizeText(record.productFeeOwnerName, fallback.productFeeOwnerName),
    productFeeRows: productFeeRows.length ? productFeeRows : fallback.productFeeRows,
    commissions: normalizeStringArray(record.commissions, fallback.commissions),
    disclosureNotes: normalizeStringArray(record.disclosureNotes, fallback.disclosureNotes),
  };
}

function normalizeAuthority(value: unknown, fallback: RoaAuthorityToProceed): RoaAuthorityToProceed {
  if (typeof value === "string") {
    return { ...fallback, actions: [normalizeText(value, fallback.actions[0] ?? "")].filter(Boolean) };
  }

  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};

  return {
    actions: normalizeStringArray(record.actions, fallback.actions),
    confirmations: normalizeStringArray(record.confirmations, fallback.confirmations),
    outstandingItems: normalizeStringArray(record.outstandingItems, fallback.outstandingItems),
  };
}

function formatMoney(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(numeric)) return String(value);
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(numeric);
}

function defaultStrategyRecommendation(index = 1): RoaRecommendationItem {
  return {
    heading: index === 1 ? "Strategy recommendation" : `Strategy recommendation ${index}`,
    recommendationText: "Confirm the recommended strategy change before issuing this ROA.",
    rationale: "The rationale should be reviewed against the client profile and uploaded evidence.",
    benefits: ["To be confirmed."],
    consequences: ["Confirm any risks, limitations, or trade-offs before issuing."],
    alternativesConsidered: ["Retain the existing strategy until further advice is provided."],
    implementationNotes: "Confirm implementation steps and timing.",
  };
}

function defaultProductRecommendation(index = 1): RoaProductRecommendationItem {
  return {
    ...defaultStrategyRecommendation(index),
    heading: index === 1 ? "Product recommendation" : `Product recommendation ${index}`,
    productName: "To be confirmed",
    provider: "To be confirmed",
    action: "To be confirmed",
    recommendationText:
      "Confirm whether this ROA recommends retaining, replacing, rolling over, consolidating, or altering a product.",
    costs: ["Confirm product costs and transaction costs before issuing."],
  };
}

function summarizeProfile(profile?: ClientProfile | null) {
  if (!profile) return null;

  const people = [profile.client?.name, profile.partner?.name].filter(Boolean).join(" & ");
  const assets = (profile.assets ?? [])
    .map((asset) => `${asset.description || asset.assetType || asset.type || "Asset"} ${formatMoney(asset.currentValue) ?? ""}`.trim())
    .slice(0, 8);
  const superannuation = (profile.superannuation ?? [])
    .map((item) => `${item.superFund || item.type || "Superannuation"} ${formatMoney(item.balance) ?? ""}`.trim())
    .slice(0, 6);
  const pensions = (profile.pension ?? [])
    .map((item) => `${item.superFund || item.type || "Retirement income"} ${formatMoney(item.balance ?? item.payment) ?? ""}`.trim())
    .slice(0, 6);
  const insurance = (profile.insurance ?? [])
    .map((item) => {
      const policyTypes = (item.policyDetails ?? [])
        .map((policy) => policy.coverType || policy.insurerName || null)
        .filter(Boolean)
        .join(", ");
      return `${item.coverRequired || policyTypes || "Insurance"} ${item.insurer ? `with ${item.insurer}` : ""}`.trim();
    })
    .slice(0, 6);

  return {
    people,
    client: {
      name: profile.client?.name ?? null,
      dateOfBirth: profile.client?.dob ?? null,
      riskProfile: profile.client?.riskProfileResponse?.resultDisplay ?? null,
      maritalStatus: profile.client?.maritalStatus ?? null,
      residentStatus: profile.client?.residentStatus ?? null,
    },
    partner: profile.partner
      ? {
          name: profile.partner.name ?? null,
          dateOfBirth: profile.partner.dob ?? null,
          riskProfile: profile.partner.riskProfileResponse?.resultDisplay ?? null,
        }
      : null,
    adviser: profile.adviser?.name ?? null,
    practice: profile.practice ?? profile.adviser?.practice?.name ?? null,
    licensee: profile.licensee ?? profile.adviser?.licensee?.name ?? null,
    assets,
    liabilitiesCount: profile.liabilities?.length ?? 0,
    incomeCount: profile.income?.length ?? 0,
    expenseCount: profile.expense?.length ?? 0,
    superannuation,
    pensions,
    insurance,
  };
}

function evidenceContext(uploadedFiles?: RoaDraftUpload[] | null) {
  return (uploadedFiles ?? [])
    .filter((file) => file?.extractedText?.trim())
    .slice(0, 5)
    .map((file) => ({
      name: file.name ?? "Uploaded file",
      tags: Array.isArray(file.tags) ? file.tags.filter((tag): tag is string => typeof tag === "string") : [],
      extractedText: file.extractedText!.trim().slice(0, 7000),
    }));
}

function buildFallbackRoaDraft(request: GenerateRoaDraftRequest): RoaDraftValue {
  const profile = summarizeProfile(request.profile);
  const clientName = request.clientName?.trim() || profile?.people || "the client";
  const evidence = evidenceContext(request.uploadedFiles);
  const evidenceNames = evidence.map((file) => file.name);
  const evidenceSentence = evidenceNames.length
    ? `This draft should be reviewed against the uploaded evidence: ${evidenceNames.join(", ")}.`
    : "No uploaded evidence has been loaded for this ROA yet.";
  const portfolioHoldingRows = profile?.superannuation.length
    ? profile.superannuation.flatMap((item) => [
        {
          rowType: "platform" as const,
          fund: item.replace(/\s+\$[\d,]+$/, "") || "Existing superannuation",
          current: "",
          change: "",
          proposed: "",
        },
        {
          rowType: "holding" as const,
          fund: "Current holdings",
          current: item.match(/\$[\d,]+/)?.[0] ?? "-",
          change: "To be confirmed",
          proposed: "To be confirmed",
        },
        {
          rowType: "subtotal" as const,
          fund: "Subtotal",
          current: item.match(/\$[\d,]+/)?.[0] ?? "-",
          change: "To be confirmed",
          proposed: "To be confirmed",
        },
      ])
    : [
        {
          rowType: "platform" as const,
          fund: "Recommended portfolio",
          current: "",
          change: "",
          proposed: "",
        },
        {
          rowType: "holding" as const,
          fund: "Confirm recommended holdings",
          current: "-",
          change: "-",
          proposed: "-",
        },
      ];

  return {
    frontPageLetter: ROA_FRONT_PAGE_LETTER_TEMPLATE,
    scopeOfAdvice: {
      title: "Scope of Advice",
      body: `Prepare a Record of Advice for ${clientName} based on the current client profile and adviser evidence.`,
      bullets: ["Confirm the advice scope, changed circumstances, objectives, and recommendations before finalising."],
    },
    strategyRecommendations: [
      {
        ...defaultStrategyRecommendation(),
        recommendationText:
          "Confirm the strategy updates being recommended and the changed circumstances that make this ROA appropriate.",
        rationale: evidenceSentence,
      },
    ],
    productRecommendations: [defaultProductRecommendation()],
    investmentPortfolioRecommendations: {
      title: "Investment Portfolio Recommendations",
      body: "Confirm whether any investment portfolio recommendation is required for this ROA.",
      bullets: [
        profile?.client.riskProfile ? `Current risk profile: ${profile.client.riskProfile}.` : null,
        profile?.assets.length ? `Known assets: ${profile.assets.join("; ")}.` : null,
        profile?.superannuation.length ? `Superannuation context: ${profile.superannuation.join("; ")}.` : null,
      ].filter((item): item is string => Boolean(item)),
      ownerName: clientName,
      holdings: portfolioHoldingRows,
    },
    portfolioAllocation: {
      rationale:
        "Confirm the current and proposed asset allocation, including whether any rebalance or investment option change is recommended.",
      implementationNotes: "Confirm implementation timing, investment options, and any adviser/service fees before proceeding.",
      rows: [
        { assetClass: "Defensive", current: "-", riskProfile: "-", recommended: "-", variance: "-" },
        { assetClass: "Growth", current: "-", riskProfile: "-", recommended: "-", variance: "-" },
      ],
    },
    replacementAnalysis: {
      title: "Replacement Analysis",
      body:
        "If this ROA involves replacing or switching a product, document the reasons, costs, benefits lost and benefits gained. If not applicable, mark replacement analysis as not applicable.",
      bullets: [],
    },
    feesAndDisclosures: {
      adviceFeeRows: [
        { feeType: "Plan Preparation Fee", amount: "To be confirmed" },
        { feeType: "Implementation Fee", amount: "To be confirmed" },
      ],
      productFeeOwnerName: clientName,
      productFeeRows: [
        {
          rowStatus: "recommended",
          product: "To be confirmed",
          feeType: "Confirm product, platform, investment, transaction, and buy/sell spread costs.",
          percentage: "-",
          amount: "To be confirmed",
        },
      ],
      commissions: ["Confirm whether any commissions or monetary benefits apply."],
      disclosureNotes: ["Confirm all material disclosures before issuing the ROA."],
    },
    authorityToProceed: {
      actions: ["Confirm the actions the client is being asked to authorise."],
      confirmations: [
        "Client confirms the information relied on in this ROA is accurate and complete.",
        "Client authorises the adviser to implement the recommendations once all outstanding items are resolved.",
      ],
      outstandingItems: ["Confirm any missing product details, fees, dates, signatures, or implementation dependencies."],
    },
  };
}

function normalizeRoaDraft(value: unknown, fallback: RoaDraftValue): RoaDraftValue {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};

  return {
    frontPageLetter: ROA_FRONT_PAGE_LETTER_TEMPLATE,
    scopeOfAdvice: normalizeTextSection(record.scopeOfAdvice, fallback.scopeOfAdvice),
    strategyRecommendations: normalizeRecommendationList(record.strategyRecommendations, fallback.strategyRecommendations),
    productRecommendations: normalizeProductRecommendationList(record.productRecommendations, fallback.productRecommendations),
    investmentPortfolioRecommendations: normalizeInvestmentPortfolio(
      record.investmentPortfolioRecommendations,
      fallback.investmentPortfolioRecommendations,
    ),
    portfolioAllocation: normalizePortfolioAllocation(record.portfolioAllocation, fallback.portfolioAllocation),
    replacementAnalysis: normalizeTextSection(record.replacementAnalysis, fallback.replacementAnalysis),
    feesAndDisclosures: normalizeFees(record.feesAndDisclosures, fallback.feesAndDisclosures),
    authorityToProceed: normalizeAuthority(record.authorityToProceed, fallback.authorityToProceed),
  };
}

export async function generateRoaDraft(request: GenerateRoaDraftRequest): Promise<GenerateRoaDraftResponse> {
  const fallback = buildFallbackRoaDraft(request);

  if (!OPENAI_API_KEY) {
    return {
      draft: fallback,
      source: "fallback",
      model: null,
      warning: "OPENAI_API_KEY is not configured, so Finley prepared a safe local ROA skeleton.",
    };
  }

  try {
    const isAzure = isAzureOpenAiBaseUrl(OPENAI_BASE_URL);
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(isAzure ? { "api-key": OPENAI_API_KEY } : { authorization: `Bearer ${OPENAI_API_KEY}` }),
      },
      body: JSON.stringify({
        model: OPENAI_ROA_DRAFT_MODEL,
        messages: [
          {
            role: "system",
            content: [
              "You are Finley, an intelligent paraplanner inside an Australian financial advice workspace.",
              "Draft a Record of Advice using a concise SOA-style subset. This is adviser review content, not final approved advice.",
              "Use the same section structure an SOA would use for strategy recommendations, product recommendations, portfolio allocation, replacement analysis, fees/disclosures, and authority to proceed.",
              "For investmentPortfolioRecommendations, return an SOA Recommended Holdings table model. Use rowType platform for account/platform headings, holding for each fund row, and subtotal for subtotal rows. Fill current, change, and proposed amounts exactly when evidence supports them, otherwise write To be confirmed.",
              "For feesAndDisclosures, return SOA ProductRex-style fee rows. Use adviceFeeRows for Plan Preparation Fee and Implementation Fee. Use productFeeRows for Product Fees with rowStatus, product, feeType, percentage, and amount exactly as shown in ProductRex evidence.",
              "Only recommended product fees should appear in the ROA Product Fees section. When ProductRex includes current/comparison and recommended products, mark current/comparison rows as current or alternative and recommended product rows as recommended. Prefer returning recommended rows only.",
              "The frontPageLetter can be ROA-specific, but every advice section should be structured for direct rendering as SOA-style tables, recommendation cards, and bullet lists.",
              "Use the exact provided ROA front page letter template for frontPageLetter and preserve merge fields verbatim.",
              "For strategyRecommendations, put client-facing best-interest reasoning inside benefits, consequences, and alternativesConsidered. Do not rely on rationale or implementationNotes for visible strategy content.",
              "For productRecommendations, put client-facing product reasoning inside benefits, consequences, costs, and alternativesConsidered. Do not rely on rationale or implementationNotes for visible product content.",
              "Use uploaded evidence and client profile context only. Do not invent product names, fees, implementation dates, or client facts.",
              "If a section is not applicable or evidence is missing, say what needs confirmation rather than fabricating content.",
              "Return only JSON matching the schema.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              task: "Draft a live Record of Advice workspace card.",
              clientName: request.clientName ?? null,
              adviserName: request.adviserName ?? null,
              profileSummary: summarizeProfile(request.profile),
              uploadedEvidence: evidenceContext(request.uploadedFiles),
              frontPageLetterTemplate: ROA_FRONT_PAGE_LETTER_TEMPLATE,
              sections: Object.keys(fallback),
            }),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: roaDraftJsonSchema,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`ROA draft request failed with status ${response.status}.`);
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
      throw new Error("ROA draft response did not include message content.");
    }

    return {
      draft: normalizeRoaDraft(JSON.parse(content), fallback),
      source: "llm",
      model: OPENAI_ROA_DRAFT_MODEL,
      warning: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run the ROA draft model.";

    return {
      draft: fallback,
      source: "fallback",
      model: null,
      warning: `Finley could not reach the configured ROA draft model (${message}), so it prepared a safe local ROA skeleton.`,
    };
  }
}
