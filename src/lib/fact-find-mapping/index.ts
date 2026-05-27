import JSZip from "jszip";
import {
  createEmptyFactFindImportCandidate,
  type FactFindImportCandidate,
} from "@/lib/fact-find-import";
import type { IntakeDocumentInsightV1 } from "@/lib/soa-output-contracts";
import {
  projectionExpenseCategories,
  projectionIncomeCategories,
  type ProjectionScenario,
} from "@/lib/projections/types";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim() ?? "";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
const OPENAI_MODEL = process.env.OPENAI_SOA_INTAKE_MODEL?.trim() || "gpt-5.2";
const CURRENT_YEAR = 2026;
const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };
const emptyObjectSchema = {
  type: "object",
  additionalProperties: false,
  properties: {},
  required: [],
};

function isAzureOpenAiBaseUrl(baseUrl: string) {
  return /(?:\.openai\.azure\.com|\.services\.ai\.azure\.com)/i.test(baseUrl);
}

const ownerRecordSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    ownerName: nullableString,
    description: nullableString,
    type: nullableString,
    amount: nullableString,
    frequency: nullableString,
    provider: nullableString,
    accountNumber: nullableString,
    notes: nullableString,
  },
  required: ["ownerName", "description", "type", "amount", "frequency", "provider", "accountNumber", "notes"],
};

const factFindImportCandidateSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    sourceFileName: { type: "string" },
    summary: { type: "string" },
    people: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          target: { type: "string", enum: ["client", "partner"] },
          name: nullableString,
          email: nullableString,
          preferredPhone: nullableString,
          dateOfBirth: nullableString,
          gender: nullableString,
          maritalStatus: nullableString,
          residentStatus: nullableString,
          street: nullableString,
          suburb: nullableString,
          state: nullableString,
          postCode: nullableString,
          healthStatus: nullableString,
          healthInsurance: nullableString,
          riskProfile: nullableString,
          employmentStatus: nullableString,
          jobTitle: nullableString,
          employer: nullableString,
          salary: nullableString,
          salaryFrequency: nullableString,
        },
        required: [
          "target",
          "name",
          "email",
          "preferredPhone",
          "dateOfBirth",
          "gender",
          "maritalStatus",
          "residentStatus",
          "street",
          "suburb",
          "state",
          "postCode",
          "healthStatus",
          "healthInsurance",
          "riskProfile",
          "employmentStatus",
          "jobTitle",
          "employer",
          "salary",
          "salaryFrequency",
        ],
      },
    },
    dependants: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          ownerName: nullableString,
          name: nullableString,
          birthday: nullableString,
          type: nullableString,
        },
        required: ["ownerName", "name", "birthday", "type"],
      },
    },
    entities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          ownerName: nullableString,
          name: nullableString,
          type: nullableString,
        },
        required: ["ownerName", "name", "type"],
      },
    },
    income: { type: "array", items: ownerRecordSchema },
    expenses: { type: "array", items: ownerRecordSchema },
    assets: { type: "array", items: ownerRecordSchema },
    liabilities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          ownerName: nullableString,
          description: nullableString,
          type: nullableString,
          amount: nullableString,
          frequency: nullableString,
          provider: nullableString,
          accountNumber: nullableString,
          notes: nullableString,
          bankName: nullableString,
          outstandingBalance: nullableString,
          interestRate: nullableString,
          repaymentAmount: nullableString,
          repaymentFrequency: nullableString,
        },
        required: [
          "ownerName",
          "description",
          "type",
          "amount",
          "frequency",
          "provider",
          "accountNumber",
          "notes",
          "bankName",
          "outstandingBalance",
          "interestRate",
          "repaymentAmount",
          "repaymentFrequency",
        ],
      },
    },
    superannuation: { type: "array", items: ownerRecordSchema },
    pensions: { type: "array", items: ownerRecordSchema },
    insurance: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          ownerName: nullableString,
          description: nullableString,
          type: nullableString,
          amount: nullableString,
          frequency: nullableString,
          provider: nullableString,
          accountNumber: nullableString,
          notes: nullableString,
          insurer: nullableString,
          coverRequired: nullableString,
          sumInsured: nullableString,
          premiumAmount: nullableString,
          premiumFrequency: nullableString,
          status: nullableString,
        },
        required: [
          "ownerName",
          "description",
          "type",
          "amount",
          "frequency",
          "provider",
          "accountNumber",
          "notes",
          "insurer",
          "coverRequired",
          "sumInsured",
          "premiumAmount",
          "premiumFrequency",
          "status",
        ],
      },
    },
    confirmationsRequired: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: [
    "sourceFileName",
    "summary",
    "people",
    "dependants",
    "entities",
    "income",
    "expenses",
    "assets",
    "liabilities",
    "superannuation",
    "pensions",
    "insurance",
    "confirmationsRequired",
    "warnings",
  ],
};

const projectionScenarioSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    scenarioId: { type: "string" },
    scenarioName: { type: "string" },
    startYear: { type: "number" },
    startMonth: { type: "number" },
    primaryPersonId: { type: "string" },
    projectionEnd: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string", enum: ["life-expectancy"] },
        personId: { type: "string" },
      },
      required: ["type", "personId"],
    },
    people: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          personId: { type: "string" },
          name: { type: "string" },
          role: { type: "string", enum: ["client", "partner"] },
          gender: { type: "string", enum: ["female", "male", "unknown"] },
          dateOfBirth: nullableString,
          startAge: { type: "number" },
          relationshipStatus: nullableString,
          isHomeowner: { type: "boolean" },
        },
        required: ["personId", "name", "role", "gender", "dateOfBirth", "startAge", "relationshipStatus", "isHomeowner"],
      },
    },
    dependants: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          dependantId: { type: "string" },
          ownerPersonId: { type: "string" },
          name: { type: "string" },
          relationship: nullableString,
          dateOfBirth: nullableString,
        },
        required: ["dependantId", "ownerPersonId", "name", "relationship", "dateOfBirth"],
      },
    },
    assets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          assetId: { type: "string" },
          ownerPersonId: { type: "string" },
          type: {
            type: "string",
            enum: [
              "primary-residence",
              "cash",
              "bank-account",
              "offset-account",
              "term-deposit",
              "investment",
              "investment-property",
              "australian-shares",
              "international-shares",
              "managed-fund",
              "etf",
              "funeral-bond",
              "home-contents",
              "motor-vehicle",
              "personal-asset",
              "business",
              "other",
            ],
          },
          name: { type: "string" },
          openingValue: { type: "number" },
          annualIncome: { type: "number" },
          growthRateKey: { type: "string", enum: ["cpi", "cash", "none", "Defensive", "Moderate", "Balanced", "Growth", "High Growth"] },
          centrelink: { type: "string", enum: ["exempt", "financial-asset", "assessable"] },
          reserveTarget: { anyOf: [{ type: "number" }, { type: "null" }] },
          costBase: { anyOf: [{ type: "number" }, { type: "null" }] },
          acquisitionDate: nullableString,
          cgtTreatment: { type: "string", enum: ["taxable", "main-residence-exempt", "personal-use-exempt", "not-applicable"] },
        },
        required: [
          "assetId",
          "ownerPersonId",
          "type",
          "name",
          "openingValue",
          "annualIncome",
          "growthRateKey",
          "centrelink",
          "reserveTarget",
          "costBase",
          "acquisitionDate",
          "cgtTreatment",
        ],
      },
    },
    liabilities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          liabilityId: { type: "string" },
          ownerPersonId: { type: "string" },
          type: { type: "string", enum: ["credit-card", "mortgage", "personal-loan", "other"] },
          name: { type: "string" },
          openingBalance: { type: "number" },
          annualInterestRate: { type: "number" },
          annualRepayment: { type: "number" },
          repaymentTiming: { type: "string", enum: ["start-of-year", "end-of-year"] },
          repaymentType: { type: "string", enum: ["principal-and-interest", "interest-only"] },
          interestDeductible: { type: "boolean" },
        },
        required: [
          "liabilityId",
          "ownerPersonId",
          "type",
          "name",
          "openingBalance",
          "annualInterestRate",
          "annualRepayment",
          "repaymentTiming",
          "repaymentType",
          "interestDeductible",
        ],
      },
    },
    retirementAccounts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          accountId: { type: "string" },
          ownerPersonId: { type: "string" },
          accountType: { type: "string", enum: ["account-based-pension", "super-accumulation"] },
          provider: { type: "string" },
          productName: { type: "string" },
          openingBalance: { type: "number" },
          annualFeeRate: { type: "number" },
          annualInsurancePremium: { type: "number" },
          annualContribution: { type: "number" },
          annualContributionType: { type: "string", enum: ["concessional", "non-concessional"] },
          rolloverToPensionDate: nullableString,
          rolloverPensionName: nullableString,
          rolloverAnnualDrawdown: { type: "number" },
          rolloverDrawdownIndexedToCpi: { type: "boolean" },
          investmentProfileKey: { type: "string" },
          annualDrawdown: { type: "number" },
          drawdownIndexedToCpi: { type: "boolean" },
          taxableToClient: { type: "boolean" },
          centrelink: { type: "string", enum: ["financial-asset", "exempt", "unknown"] },
        },
        required: [
          "accountId",
          "ownerPersonId",
          "accountType",
          "provider",
          "productName",
          "openingBalance",
          "annualFeeRate",
          "annualInsurancePremium",
          "annualContribution",
          "annualContributionType",
          "rolloverToPensionDate",
          "rolloverPensionName",
          "rolloverAnnualDrawdown",
          "rolloverDrawdownIndexedToCpi",
          "investmentProfileKey",
          "annualDrawdown",
          "drawdownIndexedToCpi",
          "taxableToClient",
          "centrelink",
        ],
      },
    },
    assetSaleEvents: { type: "array", items: emptyObjectSchema },
    assetPurchaseEvents: { type: "array", items: emptyObjectSchema },
    liabilityDrawdownEvents: { type: "array", items: emptyObjectSchema },
    liabilityPaymentEvents: { type: "array", items: emptyObjectSchema },
    superContributionStrategies: { type: "array", items: emptyObjectSchema },
    superRolloverEvents: { type: "array", items: emptyObjectSchema },
    pensionWithdrawalEvents: { type: "array", items: emptyObjectSchema },
    cashflowItems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          itemId: { type: "string" },
          ownerPersonId: { type: "string" },
          category: { type: "string", enum: [...projectionIncomeCategories, ...projectionExpenseCategories] },
          label: { type: "string" },
          annualAmount: { type: "number" },
          startDate: nullableString,
          endDate: nullableString,
          indexedToCpi: { type: "boolean" },
          taxable: { type: "boolean" },
        },
        required: [
          "itemId",
          "ownerPersonId",
          "category",
          "label",
          "annualAmount",
          "startDate",
          "endDate",
          "indexedToCpi",
          "taxable",
        ],
      },
    },
  },
  required: [
    "scenarioId",
    "scenarioName",
    "startYear",
    "startMonth",
    "primaryPersonId",
    "projectionEnd",
    "people",
    "dependants",
    "assets",
    "liabilities",
    "assetSaleEvents",
    "assetPurchaseEvents",
    "liabilityDrawdownEvents",
    "liabilityPaymentEvents",
    "retirementAccounts",
    "superContributionStrategies",
    "superRolloverEvents",
    "pensionWithdrawalEvents",
    "cashflowItems",
  ],
};

const sharedFactFindMappingSchema = {
  name: "shared_fact_find_evidence_mapping",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      candidate: factFindImportCandidateSchema,
      scenario: projectionScenarioSchema,
      mappingNotes: { type: "array", items: { type: "string" } },
      confirmationsRequired: { type: "array", items: { type: "string" } },
      warnings: { type: "array", items: { type: "string" } },
    },
    required: ["candidate", "scenario", "mappingNotes", "confirmationsRequired", "warnings"],
  },
};

export type SharedFactFindMappingResult = {
  candidate: FactFindImportCandidate;
  scenario: ProjectionScenario;
  documentInsight: IntakeDocumentInsightV1;
  evidenceBackedConfirmations: string[];
  mappingNotes: string[];
  confirmationsRequired: string[];
  warnings: string[];
  source: "llm" | "fallback";
  model: string | null;
  extractedTextLength: number;
  warning?: string;
};

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeRecordArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object") : [];
}

function numericAmount(value: string | undefined | null) {
  if (!value) return null;
  const amount = Number(value.replace(/[$, ]/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function calculateAgeFromDob(dob: string | null) {
  if (!dob) return 67;
  const parts = dob.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  const date = parts
    ? new Date(Number(parts[3].length === 2 ? `20${parts[3]}` : parts[3]), Number(parts[2]) - 1, Number(parts[1]))
    : new Date(dob);
  if (Number.isNaN(date.getTime())) return 67;
  const projectionStart = new Date(CURRENT_YEAR, 6, 1);
  let age = projectionStart.getFullYear() - date.getFullYear();
  const birthdayThisYear = new Date(projectionStart.getFullYear(), date.getMonth(), date.getDate());
  if (birthdayThisYear > projectionStart) {
    age -= 1;
  }
  return Math.max(18, age);
}

function normalizeRate(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > 1 ? value / 100 : value;
}

function normalizeInvestmentProfile(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("high")) return "High Growth";
  if (normalized.includes("balanced") && normalized.includes("growth")) return "Growth";
  if (normalized.includes("growth")) return "Growth";
  if (normalized.includes("balanced")) return "Balanced";
  if (normalized.includes("moderate")) return "Moderate";
  if (normalized.includes("defensive") || normalized.includes("conservative")) return "Defensive";
  return "Balanced";
}

function normalizeRepayment(liability: ProjectionScenario["liabilities"][number]) {
  if (liability.type === "credit-card" && liability.annualInterestRate === 0 && liability.annualRepayment === 0) {
    return liability.openingBalance;
  }

  if (liability.type !== "mortgage" || liability.annualRepayment <= 0 || liability.annualInterestRate <= 0) {
    return liability.annualRepayment;
  }

  const normalizedRate = normalizeRate(liability.annualInterestRate);
  const estimatedInterestOnly = liability.openingBalance * normalizedRate;
  return liability.annualRepayment < estimatedInterestOnly && liability.annualRepayment * 12 > estimatedInterestOnly
    ? liability.annualRepayment * 12
    : liability.annualRepayment;
}

function normalizeOwnerPersonId(ownerPersonId: string, people: ProjectionScenario["people"], primaryPersonId: string) {
  if (/^joint$/i.test(ownerPersonId)) {
    return "joint";
  }

  return people.some((person) => person.personId === ownerPersonId) ? ownerPersonId : primaryPersonId;
}

function defaultCgtTreatment(type: ProjectionScenario["assets"][number]["type"]): NonNullable<ProjectionScenario["assets"][number]["cgtTreatment"]> {
  if (type === "primary-residence") return "main-residence-exempt";
  if (["cash", "bank-account", "offset-account", "term-deposit"].includes(type)) return "not-applicable";
  if (type === "home-contents" || type === "motor-vehicle" || type === "personal-asset") return "personal-use-exempt";
  return "taxable";
}

function normalizeCgtTreatment(
  value: unknown,
  type: ProjectionScenario["assets"][number]["type"],
): NonNullable<ProjectionScenario["assets"][number]["cgtTreatment"]> {
  return value === "taxable" ||
    value === "main-residence-exempt" ||
    value === "personal-use-exempt" ||
    value === "not-applicable"
    ? value
    : defaultCgtTreatment(type);
}

export async function extractFactFindText(file: File) {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".docx")) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const documentXml = await zip.file("word/document.xml")?.async("string");
    if (!documentXml) return "";

    return documentXml
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  if (lowerName.endsWith(".txt") || lowerName.endsWith(".csv")) {
    return file.text();
  }

  throw new Error("This prototype can map DOCX, TXT, and CSV fact finds. PDF mapping needs a PDF text extraction step.");
}

export function normalizeFactFindCandidate(value: unknown, sourceFileName: string): FactFindImportCandidate {
  if (!value || typeof value !== "object") {
    return createEmptyFactFindImportCandidate(sourceFileName);
  }

  const record = value as Record<string, unknown>;
  const normalizeOwnerRecord = (entry: Record<string, unknown>) => ({
    ownerName: normalizeString(entry.ownerName),
    description: normalizeString(entry.description),
    type: normalizeString(entry.type),
    amount: normalizeString(entry.amount),
    frequency: normalizeString(entry.frequency),
    provider: normalizeString(entry.provider),
    accountNumber: normalizeString(entry.accountNumber),
    notes: normalizeString(entry.notes),
  });

  return {
    sourceFileName,
    summary: normalizeString(record.summary) ?? "Finley extracted fact find records for adviser review.",
    people: normalizeRecordArray(record.people).map((entry) => {
      const person = entry as Record<string, unknown>;
      return {
        target: person.target === "partner" ? "partner" : "client",
        name: normalizeString(person.name),
        email: normalizeString(person.email),
        preferredPhone: normalizeString(person.preferredPhone),
        dateOfBirth: normalizeString(person.dateOfBirth),
        gender: normalizeString(person.gender),
        maritalStatus: normalizeString(person.maritalStatus),
        residentStatus: normalizeString(person.residentStatus),
        street: normalizeString(person.street),
        suburb: normalizeString(person.suburb),
        state: normalizeString(person.state),
        postCode: normalizeString(person.postCode),
        healthStatus: normalizeString(person.healthStatus),
        healthInsurance: normalizeString(person.healthInsurance),
        riskProfile: normalizeString(person.riskProfile),
        employmentStatus: normalizeString(person.employmentStatus),
        jobTitle: normalizeString(person.jobTitle),
        employer: normalizeString(person.employer),
        salary: normalizeString(person.salary),
        salaryFrequency: normalizeString(person.salaryFrequency),
      };
    }),
    dependants: normalizeRecordArray(record.dependants).map((entry) => {
      const dependant = entry as Record<string, unknown>;
      return {
        ownerName: normalizeString(dependant.ownerName),
        name: normalizeString(dependant.name),
        birthday: normalizeString(dependant.birthday),
        type: normalizeString(dependant.type),
      };
    }),
    entities: normalizeRecordArray(record.entities).map((entry) => {
      const entity = entry as Record<string, unknown>;
      return {
        ownerName: normalizeString(entity.ownerName),
        name: normalizeString(entity.name),
        type: normalizeString(entity.type),
      };
    }),
    income: normalizeRecordArray(record.income).map((entry) => normalizeOwnerRecord(entry as Record<string, unknown>)),
    expenses: normalizeRecordArray(record.expenses).map((entry) => normalizeOwnerRecord(entry as Record<string, unknown>)),
    assets: normalizeRecordArray(record.assets).map((entry) => normalizeOwnerRecord(entry as Record<string, unknown>)),
    liabilities: normalizeRecordArray(record.liabilities).map((entry) => {
      const liability = entry as Record<string, unknown>;
      return {
        ...normalizeOwnerRecord(liability),
        bankName: normalizeString(liability.bankName),
        outstandingBalance: normalizeString(liability.outstandingBalance),
        interestRate: normalizeString(liability.interestRate),
        repaymentAmount: normalizeString(liability.repaymentAmount),
        repaymentFrequency: normalizeString(liability.repaymentFrequency),
      };
    }),
    superannuation: normalizeRecordArray(record.superannuation).map((entry) => normalizeOwnerRecord(entry as Record<string, unknown>)),
    pensions: normalizeRecordArray(record.pensions).map((entry) => normalizeOwnerRecord(entry as Record<string, unknown>)),
    insurance: normalizeRecordArray(record.insurance).map((entry) => {
      const insurance = entry as Record<string, unknown>;
      return {
        ...normalizeOwnerRecord(insurance),
        insurer: normalizeString(insurance.insurer),
        coverRequired: normalizeString(insurance.coverRequired),
        sumInsured: normalizeString(insurance.sumInsured),
        premiumAmount: normalizeString(insurance.premiumAmount),
        premiumFrequency: normalizeString(insurance.premiumFrequency),
        status: normalizeString(insurance.status),
      };
    }),
    confirmationsRequired: Array.isArray(record.confirmationsRequired)
      ? record.confirmationsRequired.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      : [],
    warnings: Array.isArray(record.warnings)
      ? record.warnings.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      : [],
  };
}

export function normalizeProjectionScenario(record: ProjectionScenario, fileName: string): ProjectionScenario {
  const people = record.people?.length
    ? record.people.map((person, index) => ({
        ...person,
        personId: slug(person.personId || person.name || `person-${index + 1}`) || `person-${index + 1}`,
        name: person.name || `Person ${index + 1}`,
        role: index === 0 ? "client" as const : person.role,
        gender: person.gender ?? "unknown",
        startAge: person.dateOfBirth ? calculateAgeFromDob(person.dateOfBirth) : Number.isFinite(person.startAge) ? person.startAge : 67,
        relationshipStatus: person.relationshipStatus ?? (record.people.length > 1 ? "couple" : "single"),
        isHomeowner: Boolean(person.isHomeowner),
      }))
    : [];
  const primaryPerson = people.find((person) => person.role === "client") ?? people[0];
  const primaryPersonId = primaryPerson?.personId ?? "client";
  const dependants = (record.dependants ?? []).map((dependant, index) => ({
    ...dependant,
    dependantId: slug(dependant.dependantId || dependant.name || `dependant-${index + 1}`) || `dependant-${index + 1}`,
    ownerPersonId: normalizeOwnerPersonId(dependant.ownerPersonId, people, primaryPersonId),
    name: dependant.name || `Dependant ${index + 1}`,
    relationship: dependant.relationship ?? null,
    dateOfBirth: dependant.dateOfBirth ?? null,
  }));
  const normalizedLiabilities = (record.liabilities ?? []).map((liability, index) => {
    const normalizedLiability = {
      ...liability,
      annualInterestRate: normalizeRate(liability.annualInterestRate),
    };

    return {
      ...normalizedLiability,
      liabilityId: slug(liability.liabilityId || liability.name || `liability-${index + 1}`) || `liability-${index + 1}`,
      ownerPersonId: normalizeOwnerPersonId(liability.ownerPersonId, people, primaryPersonId),
      annualRepayment: normalizeRepayment(normalizedLiability),
      repaymentType: liability.repaymentType ?? "principal-and-interest",
      interestDeductible: liability.interestDeductible ?? /investment|rental|business/i.test(`${liability.type} ${liability.name}`),
    };
  });
  const normalizedCashflowItems = (record.cashflowItems ?? [])
    .filter((item) => !/illustrative|quote|planned|recommended|education savings/i.test(item.label))
    .map((item, index) => ({
      ...item,
      itemId: slug(item.itemId || item.label || `cashflow-${index + 1}`) || `cashflow-${index + 1}`,
      ownerPersonId: normalizeOwnerPersonId(item.ownerPersonId, people, primaryPersonId),
      startDate: item.startDate ?? null,
      endDate: item.endDate ?? null,
    }));
  const hasLoanRepaymentCashflow = normalizedCashflowItems.some((item) => /loan|mortgage|repayment/i.test(item.label));
  const liabilityRepaymentCashflows = normalizedLiabilities
    .filter((liability) => liability.annualRepayment > 0 && (liability.type !== "mortgage" || !hasLoanRepaymentCashflow))
    .map((liability) => ({
      itemId: `${liability.liabilityId}-repayment`,
      ownerPersonId: liability.ownerPersonId,
      category: "other-expense" as const,
      label: `${liability.name} repayment`,
      annualAmount: liability.annualRepayment,
      startDate: null,
      endDate: null,
      indexedToCpi: false,
      taxable: false,
    }));

  return {
    ...record,
    scenarioId: slug(record.scenarioId || fileName) || "uploaded-scenario",
    scenarioName: record.scenarioName || fileName.replace(/\.[^.]+$/, ""),
    startYear: Number.isFinite(record.startYear) ? record.startYear : CURRENT_YEAR,
    startMonth: Number.isFinite(record.startMonth) ? record.startMonth : 7,
    people,
    dependants,
    primaryPersonId,
    projectionEnd: { type: "life-expectancy", personId: primaryPersonId },
    assets: (record.assets ?? []).map((asset, index) => {
      const assetType =
        asset.type === "personal-asset" && /etf|portfolio|shares|managed fund|investment/i.test(asset.name)
          ? "investment"
          : asset.type;
      const isCashLikeAsset = ["cash", "bank-account", "offset-account", "term-deposit"].includes(assetType);
      const isInvestmentLikeAsset = [
        "investment",
        "investment-property",
        "australian-shares",
        "international-shares",
        "managed-fund",
        "etf",
      ].includes(assetType);

      return {
        ...asset,
        assetId: slug(asset.assetId || asset.name || `asset-${index + 1}`) || `asset-${index + 1}`,
        ownerPersonId: normalizeOwnerPersonId(asset.ownerPersonId, people, primaryPersonId),
        type: assetType,
        annualIncome: Number.isFinite(asset.annualIncome) ? asset.annualIncome : 0,
        costBase: Number.isFinite(asset.costBase) ? asset.costBase : asset.openingValue,
        acquisitionDate: asset.acquisitionDate ?? null,
        cgtTreatment: normalizeCgtTreatment(asset.cgtTreatment, assetType),
        growthRateKey:
          assetType === "offset-account" || (assetType === "cash" && /offset/i.test(asset.name))
            ? "none"
            : isInvestmentLikeAsset
              ? normalizeInvestmentProfile(asset.growthRateKey)
              : asset.growthRateKey,
        reserveTarget: isCashLikeAsset ? (asset.reserveTarget ?? 60000) : null,
      };
    }),
    liabilities: normalizedLiabilities,
    assetPurchaseEvents: record.assetPurchaseEvents ?? [],
    liabilityDrawdownEvents: record.liabilityDrawdownEvents ?? [],
    retirementAccounts: (record.retirementAccounts ?? []).map((account, index) => ({
      ...account,
      accountId: slug(account.accountId || account.productName || `retirement-${index + 1}`) || `retirement-${index + 1}`,
      ownerPersonId: people.some((person) => person.personId === account.ownerPersonId) ? account.ownerPersonId : primaryPersonId,
      annualFeeRate: Number.isFinite(account.annualFeeRate) ? account.annualFeeRate : 0.015,
      annualInsurancePremium:
        account.accountType === "super-accumulation" && Number.isFinite(account.annualInsurancePremium)
          ? account.annualInsurancePremium
          : 0,
      annualContribution:
        account.accountType === "super-accumulation" && Number.isFinite(account.annualContribution)
          ? account.annualContribution
          : 0,
      annualContributionType:
        account.accountType === "super-accumulation" && account.annualContributionType === "non-concessional"
          ? "non-concessional"
          : "concessional",
      rolloverToPensionDate: account.accountType === "super-accumulation" ? account.rolloverToPensionDate ?? null : null,
      rolloverPensionName: account.accountType === "super-accumulation" ? account.rolloverPensionName ?? null : null,
      rolloverAnnualDrawdown:
        account.accountType === "super-accumulation" && Number.isFinite(account.rolloverAnnualDrawdown)
          ? account.rolloverAnnualDrawdown
          : 0,
      rolloverDrawdownIndexedToCpi:
        account.accountType === "super-accumulation" ? Boolean(account.rolloverDrawdownIndexedToCpi) : false,
      investmentProfileKey: normalizeInvestmentProfile(account.investmentProfileKey || "Balanced"),
    })),
    cashflowItems: [...normalizedCashflowItems, ...liabilityRepaymentCashflows],
  };
}

function fallbackCandidate(sourceFileName: string, extractedText: string): FactFindImportCandidate {
  const candidate = createEmptyFactFindImportCandidate(sourceFileName);
  const lines = extractedText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const joined = lines.join("\n");
  const factFindText = textBetween(joined, "1. Fact Find", "2. Engagement Letter") ?? joined;
  const personalBlock = textBetween(factFindText, "Personal details", "Objectives and priorities") ?? factFindText;
  const personalLines = personalBlock.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const healthHeaderIndex = personalLines.findIndex((line) => line === "Health");
  const personalRowStart = healthHeaderIndex >= 0 ? healthHeaderIndex + 1 : -1;
  const personalValue = (offset: number) => (personalRowStart >= 0 ? personalLines.at(personalRowStart + offset) ?? null : null);
  const clientName =
    personalValue(0) ??
    joined.match(/(?:client|name)\s*[:-]\s*([A-Z][^\n]+)/i)?.[1]?.trim() ??
    null;
  const partnerName = joined.match(/(?:partner|spouse)\s*[:-]\s*([A-Z][^\n]+)/i)?.[1]?.trim() ?? null;
  const email = joined.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
  const phone = joined.match(/(?:\+?61|0)\s*\d(?:[\s-]?\d){7,9}/)?.[0] ?? null;
  const dob =
    personalValue(1)?.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{4})/)?.[1] ??
    personalBlock.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{4})\s*\/\s*\d+/)?.[1] ??
    null;
  const occupation = personalValue(2);
  const salary = personalValue(3) ?? personalBlock.match(/\$[\d,]+(?:\.\d{2})?\s*p\.?a\.?/i)?.[0] ?? null;
  const residency = personalValue(4) ?? personalBlock.match(/Australian resident/i)?.[0] ?? null;
  const health = personalValue(5) ?? personalBlock.match(/Good health[^\n]*/i)?.[0] ?? null;
  const riskProfile =
    (textBetween(factFindText, "Risk profile and preferences", "Estate planning") ?? "").match(/\n(?:[A-Z][^\n]+)\n(Growth|Balanced|High Growth|Moderate|Defensive|Conservative)/i)?.[1] ??
    null;

  candidate.summary = "Finley detected fact find evidence and extracted the obvious identity details it could read locally. Use the live LLM extractor for richer financial mapping.";
  if (clientName || email || phone) {
    candidate.people.push({
      target: "client",
      name: clientName,
      email,
      preferredPhone: phone,
      dateOfBirth: dob,
      residentStatus: residency,
      healthStatus: health,
      riskProfile,
      employmentStatus: occupation ? "Employed" : null,
      jobTitle: occupation,
      employer: null,
      salary,
      salaryFrequency: salary ? "annually" : null,
    });
  }
  if (partnerName) {
    candidate.people.push({ target: "partner", name: partnerName });
  }
  candidate.assets = parseFactFindRows(factFindText, "Assets", "Liabilities", 4).map((row) => ({
    description: row[0] ?? null,
    ownerName: expandOwnerName(row[1], clientName),
    amount: row[2] ?? null,
    type: inferAssetType(row[0] ?? ""),
    frequency: null,
    provider: null,
    accountNumber: null,
    notes: row[3] ?? null,
  }));
  candidate.liabilities = parseFactFindRows(factFindText, "Liabilities", "Superannuation / pensions", 5).map((row) => ({
    description: row[0] ?? null,
    ownerName: expandOwnerName(row[1], clientName),
    type: inferLiabilityType(row[0] ?? ""),
    amount: row[2] ?? null,
    outstandingBalance: row[2] ?? null,
    repaymentAmount: row[3]?.match(/\$[\d,]+(?:\.\d{2})?/)?.[0] ?? null,
    repaymentFrequency: row[3]?.match(/monthly|fortnightly|weekly|annually|p\.?a\.?/i)?.[0] ?? null,
    interestRate: row[3]?.match(/\d+(?:\.\d+)?%/)?.[0] ?? null,
    bankName: null,
    frequency: null,
    provider: null,
    accountNumber: null,
    notes: [row[3], row[4]].filter(Boolean).join("; ") || null,
  }));
  candidate.superannuation = parseFactFindRows(factFindText, "Superannuation / pensions", "Cash flow", 5).map((row) => ({
    description: row[0] ?? null,
    ownerName: expandOwnerName(row[1], clientName),
    amount: row[2] ?? null,
    type: "Accumulation",
    frequency: null,
    provider: row[0] ?? null,
    accountNumber: null,
    notes: [row[3], row[4]].filter(Boolean).join("; ") || null,
  }));
  const cashflowRows = parseFactFindRows(factFindText, "Cash flow", "Existing insurance", 3);
  candidate.income = cashflowRows
    .filter((row) => /income/i.test(row[0] ?? ""))
    .map((row) => ({
      description: row[0] ?? null,
      ownerName: clientName,
      amount: row[1] ?? null,
      frequency: "annually",
      type: "Employment income",
      provider: null,
      accountNumber: null,
      notes: row[2] ?? null,
    }));
  candidate.expenses = cashflowRows
    .filter((row) => /rent|living|expense/i.test(row[0] ?? ""))
    .map((row) => ({
      description: row[0] ?? null,
      ownerName: clientName,
      amount: row[1] ?? null,
      frequency: "annually",
      type: "Living expenses",
      provider: null,
      accountNumber: null,
      notes: row[2] ?? null,
    }));
  const existingInsurance = parseFactFindRows(factFindText, "Existing insurance", "Risk profile and preferences", 5).map((row) => ({
    ownerName: expandOwnerName(row[0], clientName),
    description: row[1] ?? null,
    type: row[1] ?? null,
    amount: row[2] ?? null,
    frequency: null,
    provider: row[3] ?? null,
    accountNumber: null,
    notes: row[4] ?? null,
    insurer: row[3] ?? null,
    coverRequired: row[1] ?? null,
    sumInsured: row[2] ?? null,
    premiumAmount: null,
    premiumFrequency: null,
    status: /nil|n\/a/i.test(`${row[2]} ${row[3]}`) ? "None" : "Active",
  }));
  const quoteText = textBetween(joined, "6. Insurance Quote Illustration", "Premium projections") ?? "";
  const quoteMonthlyBenefit = quoteText.match(/\$[\d,]+(?:\.\d{2})?\s*per month/i)?.[0] ?? null;
  const quotePremium = quoteMonthlyBenefit
    ? quoteText.slice(quoteText.indexOf(quoteMonthlyBenefit) + quoteMonthlyBenefit.length).match(/\$[\d,]+(?:\.\d{2})?/)?.[0] ?? null
    : null;
  const quoteInsurer = quoteText.match(/Insurer\n([^\n]+)/i)?.[1] ?? null;
  candidate.insurance = [
    ...existingInsurance,
    ...(quoteText && quoteMonthlyBenefit
      ? [
          {
            ownerName: clientName,
            description: "Income Protection",
            type: "Income Protection",
            amount: quoteMonthlyBenefit,
            frequency: null,
            provider: quoteInsurer,
            accountNumber: null,
            notes: "Mapped from insurance quote illustration.",
            insurer: quoteInsurer,
            coverRequired: "Income Protection",
            sumInsured: quoteMonthlyBenefit,
            premiumAmount: quotePremium,
            premiumFrequency: "annually",
            status: "Quoted",
          },
        ]
      : []),
  ];
  if (candidate.assets.length || candidate.liabilities.length || candidate.superannuation.length || candidate.insurance.length) {
    candidate.summary = "Finley extracted structured fact find records from the uploaded client pack for adviser review.";
  }
  candidate.confirmationsRequired = [
    "Review the extracted fact find data before applying it to the client profile.",
    ...(OPENAI_API_KEY ? [] : ["The local fallback mapped table evidence because OPENAI_API_KEY is not configured. Confirm values before applying."]),
  ];
  return candidate;
}

function textBetween(text: string, start: string, end: string) {
  const startIndex = text.indexOf(start);
  if (startIndex < 0) return null;
  const endIndex = text.indexOf(end, startIndex + start.length);
  return text.slice(startIndex + start.length, endIndex >= 0 ? endIndex : undefined).trim();
}

function parseFactFindRows(text: string, start: string, end: string, columns: number) {
  const block = textBetween(text, start, end);
  if (!block) return [] as string[][];
  const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const dataStart = Math.min(columns, lines.length);
  const rows: string[][] = [];
  for (let index = dataStart; index + columns - 1 < lines.length; index += columns) {
    rows.push(lines.slice(index, index + columns));
  }
  return rows.filter((row) => row.some(Boolean));
}

function expandOwnerName(value: string | null | undefined, clientName: string | null) {
  if (!value) return clientName;
  if (clientName && value.trim().length < clientName.length && clientName.toLowerCase().startsWith(value.trim().toLowerCase())) {
    return clientName;
  }
  return value;
}

function inferAssetType(value: string) {
  const lower = value.toLowerCase();
  if (/cash|savings|bank|inheritance/.test(lower)) return "Cash";
  if (/car|vehicle/.test(lower)) return "Motor vehicle";
  if (/crypto/.test(lower)) return "Crypto";
  if (/share|etf|managed|investment|portfolio/.test(lower)) return "Investment";
  return value || null;
}

function inferLiabilityType(value: string) {
  const lower = value.toLowerCase();
  if (/credit card/.test(lower)) return "Credit card";
  if (/hecs|help/.test(lower)) return "HECS-HELP";
  if (/mortgage|home loan/.test(lower)) return "Mortgage";
  return value || null;
}

function fallbackScenario(fileName: string, extractedText: string): ProjectionScenario {
  const name =
    extractedText.match(/(?:client|name)\s*[:-]\s*([A-Z][A-Za-z' -]+(?:\s+[A-Z][A-Za-z' -]+)?)/)?.[1]?.trim() ??
    fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
  const personId = slug(name) || "client";
  const dob = extractedText.match(/(?:date of birth|dob)\s*[:-]\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i)?.[1] ?? null;
  const cash = numericAmount(extractedText.match(/(?:cash|bank|savings)[^\n$]{0,40}\$?\s*([\d,]+(?:\.\d{2})?)/i)?.[1]) ?? 0;
  const home = numericAmount(extractedText.match(/(?:home|residence|property)[^\n$]{0,50}\$?\s*([\d,]+(?:\.\d{2})?)/i)?.[1]) ?? 0;
  const superBalance = numericAmount(extractedText.match(/(?:super|pension)[^\n$]{0,50}\$?\s*([\d,]+(?:\.\d{2})?)/i)?.[1]) ?? 0;
  const expenses = numericAmount(extractedText.match(/(?:living expenses|expenses)[^\n$]{0,50}\$?\s*([\d,]+(?:\.\d{2})?)/i)?.[1]) ?? 60000;

  return {
    scenarioId: slug(fileName) || "uploaded-scenario",
    scenarioName: `${name} uploaded fact find`,
    startYear: CURRENT_YEAR,
    startMonth: 7,
    primaryPersonId: personId,
    projectionEnd: { type: "life-expectancy", personId },
    people: [
      {
        personId,
        name,
        role: "client",
        gender: "unknown",
        dateOfBirth: dob,
        startAge: calculateAgeFromDob(dob),
        relationshipStatus: "single",
        isHomeowner: home > 0,
      },
    ],
    dependants: [],
    assets: [
      {
        assetId: "cash-reserve",
        ownerPersonId: personId,
        type: "cash",
        name: "Cash reserve",
        openingValue: cash,
        annualIncome: 0,
        growthRateKey: "cash",
        centrelink: "financial-asset",
        reserveTarget: 60000,
      },
      ...(home
        ? [
            {
              assetId: "primary-residence",
              ownerPersonId: personId,
              type: "primary-residence" as const,
              name: "Primary residence",
              openingValue: home,
              annualIncome: 0,
              growthRateKey: "cpi" as const,
              centrelink: "exempt" as const,
              reserveTarget: null,
            },
          ]
        : []),
    ],
    liabilities: [],
    assetSaleEvents: [],
    liabilityPaymentEvents: [],
    retirementAccounts: superBalance
      ? [
          {
            accountId: "retirement-account",
            ownerPersonId: personId,
            accountType: "super-accumulation",
            provider: "To be confirmed",
            productName: "Superannuation / pension account",
            openingBalance: superBalance,
            annualFeeRate: 0.015,
            annualInsurancePremium: 0,
            annualContribution: 0,
            annualContributionType: "concessional",
            rolloverToPensionDate: null,
            rolloverPensionName: null,
            rolloverAnnualDrawdown: 0,
            rolloverDrawdownIndexedToCpi: false,
            investmentProfileKey: "Balanced",
            annualDrawdown: 0,
            drawdownIndexedToCpi: false,
            taxableToClient: false,
            centrelink: "financial-asset",
          },
        ]
      : [],
    superContributionStrategies: [],
    superRolloverEvents: [],
    pensionWithdrawalEvents: [],
    cashflowItems: [
      {
        itemId: "living-expenses",
        ownerPersonId: personId,
        category: "living-expense",
        label: "Living expenses",
        annualAmount: expenses,
        startDate: null,
        endDate: null,
        indexedToCpi: true,
        taxable: false,
      },
    ],
  };
}

function evidenceFacts(candidate: FactFindImportCandidate, scenario: ProjectionScenario) {
  return [
    ...candidate.people.map((person) =>
      [person.target === "partner" ? "Partner" : "Client", person.name, person.dateOfBirth, person.email, person.riskProfile]
        .filter(Boolean)
        .join(": "),
    ),
    ...candidate.assets.slice(0, 6).map((asset) => ["Asset", asset.ownerName, asset.description ?? asset.type, asset.amount].filter(Boolean).join(": ")),
    ...candidate.liabilities.slice(0, 6).map((liability) =>
      ["Liability", liability.ownerName, liability.description ?? liability.type, liability.outstandingBalance ?? liability.amount].filter(Boolean).join(": "),
    ),
    ...candidate.superannuation.slice(0, 4).map((account) => ["Super", account.ownerName, account.provider ?? account.description, account.amount].filter(Boolean).join(": ")),
    ...candidate.insurance.slice(0, 4).map((policy) =>
      ["Insurance", policy.ownerName, policy.insurer ?? policy.provider, policy.coverRequired ?? policy.type, policy.sumInsured ?? policy.amount].filter(Boolean).join(": "),
    ),
    scenario.cashflowItems.length ? `Projection cashflow inputs mapped: ${scenario.cashflowItems.length}` : null,
  ].filter((fact): fact is string => Boolean(fact));
}

export function createFactFindDocumentInsight(result: Pick<SharedFactFindMappingResult, "candidate" | "scenario">): IntakeDocumentInsightV1 {
  return {
    fileName: result.candidate.sourceFileName,
    documentType: "fact_find",
    summary: result.candidate.summary,
    adviserInstructions: [],
    clientStatements: [],
    extractedFacts: evidenceFacts(result.candidate, result.scenario),
    evidenceReferences: result.candidate.confirmationsRequired,
  };
}

function createResult(
  sourceFileName: string,
  extractedText: string,
  value: {
    candidate: unknown;
    scenario: ProjectionScenario;
    mappingNotes?: string[];
    confirmationsRequired?: string[];
    warnings?: string[];
  },
  source: "llm" | "fallback",
  model: string | null,
  warning?: string,
): SharedFactFindMappingResult {
  const candidate = normalizeFactFindCandidate(value.candidate, sourceFileName);
  const scenario = normalizeProjectionScenario(value.scenario, sourceFileName);
  const confirmationsRequired = [
    ...(value.confirmationsRequired ?? []),
    ...candidate.confirmationsRequired,
  ].filter((item, index, items) => item && items.indexOf(item) === index);
  const warnings = [...(value.warnings ?? []), ...candidate.warnings].filter((item, index, items) => item && items.indexOf(item) === index);
  const result: SharedFactFindMappingResult = {
    candidate,
    scenario,
    documentInsight: {
      fileName: sourceFileName,
      documentType: "fact_find",
      summary: candidate.summary,
      adviserInstructions: [],
      clientStatements: [],
      extractedFacts: [] as string[],
      evidenceReferences: confirmationsRequired,
    },
    evidenceBackedConfirmations: confirmationsRequired,
    mappingNotes: value.mappingNotes ?? [],
    confirmationsRequired,
    warnings,
    source,
    model,
    extractedTextLength: extractedText.length,
    warning,
  };

  result.documentInsight = createFactFindDocumentInsight(result);
  return result;
}

function fallbackResult(sourceFileName: string, extractedText: string, warning?: string) {
  return createResult(
    sourceFileName,
    extractedText,
    {
      candidate: fallbackCandidate(sourceFileName, extractedText),
      scenario: fallbackScenario(sourceFileName, extractedText),
      mappingNotes: ["Used the local fact-find mapper because the shared LLM mapper was unavailable or returned an invalid result."],
      confirmationsRequired: ["Review all mapped values before relying on the outputs."],
      warnings: warning ? [warning] : [],
    },
    "fallback",
    null,
  );
}

async function mapWithOpenAi(sourceFileName: string, extractedText: string, clientName?: string | null) {
  const isAzure = isAzureOpenAiBaseUrl(OPENAI_BASE_URL);
  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(isAzure ? { "api-key": OPENAI_API_KEY } : { authorization: `Bearer ${OPENAI_API_KEY}` }),
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are Finley, mapping an Australian financial advice fact find into shared evidence for a client profile, an SOA intake, and a deterministic projection engine. Extract only facts supported by the document. Do not invent balances, dates, owners, drawdowns, expenses, homeownership, relationship status, product details, policy status, or contact details. Separate client and partner data. Preserve ownership, product names, providers, account numbers, dates, frequencies, dollar amounts, interest rates, repayment amounts, premiums, cover amounts, risk profiles, employment details, dependants, entities, estate-planning notes, and uncertainties. For projection scenario data: employment income must be taxable employment-income cashflow items; asset income such as rent or distributions belongs on the asset annualIncome; Age Pension must not be mapped as income unless the document says the client receives it; mortgage repayments must be annual amounts; interest rates must be decimal annual rates; offset accounts are cash assets with growthRateKey none; non-super ETF/share portfolios are investment assets with a mapped investment profile. Do not include proposed/recommended future insurance premiums, education savings, or implementation actions as current cashflow unless they already exist. Use conservative defaults only where the schema requires a value, and explain uncertainty in confirmationsRequired or warnings.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Extract one shared fact-find evidence mapping for profile update review, SOA intake evidence, and projection modelling.",
            currentYear: CURRENT_YEAR,
            defaultStartMonth: 7,
            clientName: clientName ?? null,
            sourceFileName,
            extractedText: extractedText.slice(0, 55000),
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: sharedFactFindMappingSchema,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.warn("Shared fact-find mapping request failed", {
      status: response.status,
      body: errorText.slice(0, 1200),
    });
    throw new Error(`Shared fact-find mapping failed with status ${response.status}.`);
  }

  const body = (await response.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string | null } | null }> } | null;
  const content = body?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Shared fact-find mapping returned no content.");
  }

  const parsed = JSON.parse(content) as {
    candidate: unknown;
    scenario: ProjectionScenario;
    mappingNotes?: string[];
    confirmationsRequired?: string[];
    warnings?: string[];
  };

  return createResult(sourceFileName, extractedText, parsed, "llm", OPENAI_MODEL);
}

export async function mapFactFindEvidenceFromText(input: {
  sourceFileName: string;
  extractedText: string;
  clientName?: string | null;
}) {
  const sourceFileName = input.sourceFileName.trim();
  const extractedText = input.extractedText.trim();

  if (!sourceFileName || !extractedText) {
    throw new Error("A fact find file name and extracted text are required.");
  }

  if (!OPENAI_API_KEY) {
    return fallbackResult(sourceFileName, extractedText);
  }

  try {
    return await mapWithOpenAi(sourceFileName, extractedText, input.clientName ?? null);
  } catch (error) {
    return fallbackResult(
      sourceFileName,
      extractedText,
      error instanceof Error ? error.message : "Unable to run the shared fact-find mapper.",
    );
  }
}

export async function mapFactFindEvidenceFromFile(file: File, clientName?: string | null) {
  const extractedText = await extractFactFindText(file);
  if (!extractedText.trim()) {
    throw new Error("Finley could not read text from this file.");
  }

  return mapFactFindEvidenceFromText({
    sourceFileName: file.name,
    extractedText,
    clientName,
  });
}
