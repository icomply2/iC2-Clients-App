export type FinleyOutputEditKind = "engagement_letter" | "ongoing_agreement" | "annual_agreement";

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
  currentOutput: EngagementLetterOutput | AgreementOutput;
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
  source: "llm" | "configuration";
  model: string | null;
  warning: string | null;
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim() ?? "";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
const OPENAI_OUTPUT_EDIT_MODEL =
  process.env.OPENAI_OUTPUT_EDIT_MODEL?.trim() || process.env.OPENAI_SOA_INTAKE_MODEL?.trim() || "gpt-5.2";

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
    },
    required: [
      "decision",
      "assistantMessage",
      "changeSummary",
      "missingInformation",
      "handoffReason",
      "updatedEngagementLetter",
      "updatedAgreement",
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
