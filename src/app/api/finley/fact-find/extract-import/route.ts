import { NextRequest, NextResponse } from "next/server";
import {
  createEmptyFactFindImportCandidate,
  type FactFindImportCandidate,
} from "@/lib/fact-find-import";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim() ?? "";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
const OPENAI_MODEL = process.env.OPENAI_SOA_INTAKE_MODEL?.trim() || "gpt-5.2";

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };

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

const factFindImportSchema = {
  name: "fact_find_import_candidate",
  strict: true,
  schema: {
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
  },
};

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeRecordArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object") : [];
}

function normalizeCandidate(value: unknown, sourceFileName: string): FactFindImportCandidate {
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

function fallbackExtract(sourceFileName: string, extractedText: string): FactFindImportCandidate {
  const candidate = createEmptyFactFindImportCandidate(sourceFileName);
  const lines = extractedText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const joined = lines.join("\n");

  const clientName = joined.match(/(?:client|name)\s*[:-]\s*([A-Z][^\n]+)/i)?.[1]?.trim() ?? null;
  const partnerName = joined.match(/(?:partner|spouse)\s*[:-]\s*([A-Z][^\n]+)/i)?.[1]?.trim() ?? null;
  const email = joined.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
  const phone = joined.match(/(?:\+?61|0)\s*\d(?:[\s-]?\d){7,9}/)?.[0] ?? null;

  candidate.summary = "Finley detected a fact find and extracted the obvious identity details it could read locally. Use the live LLM extractor for richer financial mapping.";
  if (clientName || email || phone) {
    candidate.people.push({
      target: "client",
      name: clientName,
      email,
      preferredPhone: phone,
    });
  }
  if (partnerName) {
    candidate.people.push({ target: "partner", name: partnerName });
  }
  candidate.confirmationsRequired = [
    "Review the extracted fact find data before applying it to the client profile.",
    "Only obvious identity details were extracted by the local fallback. Financial records may require the LLM extractor.",
  ];
  return candidate;
}

async function extractWithOpenAi(sourceFileName: string, extractedText: string, clientName?: string | null) {
  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "You are Finley, extracting a fact find into structured client profile records for an Australian financial advice app. Return only JSON that matches the schema. Separate client and partner data. Preserve ownership, product names, providers, account numbers, dates, frequencies, and dollar amounts. Do not invent missing details. Put uncertainties in confirmationsRequired or warnings.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Extract this fact find into a reviewable import candidate.",
            clientName: clientName ?? null,
            sourceFileName,
            extractedText,
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: factFindImportSchema,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Fact find extraction failed with status ${response.status}.`);
  }

  const body = (await response.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string | null } | null }> } | null;
  const content = body?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Fact find extraction returned no content.");
  }

  return normalizeCandidate(JSON.parse(content), sourceFileName);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | {
        fileName?: string | null;
        extractedText?: string | null;
        clientName?: string | null;
      }
    | null;

  const fileName = body?.fileName?.trim();
  const extractedText = body?.extractedText?.trim();

  if (!fileName || !extractedText) {
    return NextResponse.json({ error: "A fact find file name and extracted text are required." }, { status: 400 });
  }

  try {
    const candidate = OPENAI_API_KEY
      ? await extractWithOpenAi(fileName, extractedText, body?.clientName ?? null)
      : fallbackExtract(fileName, extractedText);

    return NextResponse.json({
      candidate,
      source: OPENAI_API_KEY ? "llm" : "fallback",
      model: OPENAI_API_KEY ? OPENAI_MODEL : null,
    });
  } catch (error) {
    return NextResponse.json({
      candidate: fallbackExtract(fileName, extractedText),
      source: "fallback",
      model: null,
      warning: error instanceof Error ? error.message : "Unable to run the LLM fact find extractor.",
    });
  }
}
