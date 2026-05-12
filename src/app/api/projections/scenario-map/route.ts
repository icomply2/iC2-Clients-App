import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import type { ProjectionScenario } from "@/lib/projections/types";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim() ?? "";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
const OPENAI_MODEL = process.env.OPENAI_SOA_INTAKE_MODEL?.trim() || "gpt-5.2";
const CURRENT_YEAR = 2026;

const projectionScenarioSchema = {
  name: "projection_scenario_mapping",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      scenario: {
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
                dateOfBirth: { anyOf: [{ type: "string" }, { type: "null" }] },
                startAge: { type: "number" },
                relationshipStatus: { anyOf: [{ type: "string" }, { type: "null" }] },
                isHomeowner: { type: "boolean" },
              },
              required: ["personId", "name", "role", "gender", "dateOfBirth", "startAge", "relationshipStatus", "isHomeowner"],
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
                type: { type: "string", enum: ["primary-residence", "cash", "funeral-bond", "personal-asset", "investment"] },
                name: { type: "string" },
                openingValue: { type: "number" },
                annualIncome: { type: "number" },
                growthRateKey: { type: "string", enum: ["cpi", "cash", "none", "Defensive", "Moderate", "Balanced", "Growth", "High Growth"] },
                centrelink: { type: "string", enum: ["exempt", "financial-asset", "assessable", "unknown"] },
                reserveTarget: { anyOf: [{ type: "number" }, { type: "null" }] },
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
                annualContribution: { type: "number" },
                annualContributionType: { type: "string", enum: ["concessional", "non-concessional"] },
                rolloverToPensionDate: { anyOf: [{ type: "string" }, { type: "null" }] },
                rolloverPensionName: { anyOf: [{ type: "string" }, { type: "null" }] },
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
          cashflowItems: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                itemId: { type: "string" },
                ownerPersonId: { type: "string" },
                category: { type: "string", enum: ["living-expense", "other-income", "other-expense"] },
                label: { type: "string" },
                annualAmount: { type: "number" },
                startDate: { anyOf: [{ type: "string" }, { type: "null" }] },
                endDate: { anyOf: [{ type: "string" }, { type: "null" }] },
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
          "assets",
          "liabilities",
          "retirementAccounts",
          "cashflowItems",
        ],
      },
      mappingNotes: { type: "array", items: { type: "string" } },
      confirmationsRequired: { type: "array", items: { type: "string" } },
    },
    required: ["scenario", "mappingNotes", "confirmationsRequired"],
  },
};

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function numericAmount(value: string | undefined) {
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

  if (liability.annualRepayment < estimatedInterestOnly && liability.annualRepayment * 12 > estimatedInterestOnly) {
    return liability.annualRepayment * 12;
  }

  return liability.annualRepayment;
}

function normalizeOwnerPersonId(ownerPersonId: string, people: ProjectionScenario["people"], primaryPersonId: string) {
  if (/^joint$/i.test(ownerPersonId)) {
    return "joint";
  }

  return people.some((person) => person.personId === ownerPersonId) ? ownerPersonId : primaryPersonId;
}

async function extractTextFromDocx(file: File) {
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

async function extractText(file: File) {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".docx")) {
    return extractTextFromDocx(file);
  }

  if (lowerName.endsWith(".txt") || lowerName.endsWith(".csv")) {
    return file.text();
  }

  throw new Error("This prototype can map DOCX, TXT, and CSV fact finds. PDF mapping needs a PDF text extraction step.");
}

function normalizeScenario(record: ProjectionScenario, fileName: string): ProjectionScenario {
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
  const normalizedLiabilities = (record.liabilities ?? []).map((liability, index) => {
    const normalizedRate = normalizeRate(liability.annualInterestRate);
    const normalizedLiability = {
      ...liability,
      annualInterestRate: normalizedRate,
    };

    return {
      ...normalizedLiability,
      liabilityId: slug(liability.liabilityId || liability.name || `liability-${index + 1}`) || `liability-${index + 1}`,
      ownerPersonId: normalizeOwnerPersonId(liability.ownerPersonId, people, primaryPersonId),
      annualRepayment: normalizeRepayment(normalizedLiability),
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
    primaryPersonId,
    projectionEnd: { type: "life-expectancy", personId: primaryPersonId },
    assets: (record.assets ?? []).map((asset, index) => {
      const assetType =
        asset.type === "personal-asset" && /etf|portfolio|shares|managed fund|investment/i.test(asset.name)
          ? "investment"
          : asset.type;

      return {
        ...asset,
        assetId: slug(asset.assetId || asset.name || `asset-${index + 1}`) || `asset-${index + 1}`,
        ownerPersonId: normalizeOwnerPersonId(asset.ownerPersonId, people, primaryPersonId),
        type: assetType,
        annualIncome: Number.isFinite(asset.annualIncome) ? asset.annualIncome : 0,
        growthRateKey:
          assetType === "cash" && /offset/i.test(asset.name)
            ? "none"
            : assetType === "investment"
              ? normalizeInvestmentProfile(asset.growthRateKey)
              : asset.growthRateKey,
        reserveTarget: assetType === "cash" ? (asset.reserveTarget ?? 60000) : null,
      };
    }),
    liabilities: normalizedLiabilities,
    retirementAccounts: (record.retirementAccounts ?? []).map((account, index) => ({
      ...account,
      accountId: slug(account.accountId || account.productName || `retirement-${index + 1}`) || `retirement-${index + 1}`,
      ownerPersonId: people.some((person) => person.personId === account.ownerPersonId) ? account.ownerPersonId : primaryPersonId,
      annualFeeRate: Number.isFinite(account.annualFeeRate) ? account.annualFeeRate : 0.015,
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

function fallbackScenario(fileName: string, extractedText: string) {
  const name =
    extractedText.match(/(?:client|name)\s*[:-]\s*([A-Z][A-Za-z' -]+(?:\s+[A-Z][A-Za-z' -]+)?)/)?.[1]?.trim() ??
    fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
  const personId = slug(name) || "client";
  const dob = extractedText.match(/(?:date of birth|dob)\s*[:-]\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i)?.[1] ?? null;
  const cash = numericAmount(extractedText.match(/(?:cash|bank|savings)[^\n$]{0,40}\$?\s*([\d,]+(?:\.\d{2})?)/i)?.[1]) ?? 0;
  const home = numericAmount(extractedText.match(/(?:home|residence|property)[^\n$]{0,50}\$?\s*([\d,]+(?:\.\d{2})?)/i)?.[1]) ?? 0;
  const superBalance = numericAmount(extractedText.match(/(?:super|pension)[^\n$]{0,50}\$?\s*([\d,]+(?:\.\d{2})?)/i)?.[1]) ?? 0;
  const expenses = numericAmount(extractedText.match(/(?:living expenses|expenses)[^\n$]{0,50}\$?\s*([\d,]+(?:\.\d{2})?)/i)?.[1]) ?? 60000;

  const scenario: ProjectionScenario = {
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
    assets: [
      {
        assetId: "cash-reserve",
        ownerPersonId: personId,
        type: "cash",
        name: "Cash reserve",
        openingValue: cash,
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
              growthRateKey: "cpi" as const,
              centrelink: "exempt" as const,
            },
          ]
        : []),
    ],
    liabilities: [],
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

  return {
    scenario,
    mappingNotes: ["Used the local projection mapper because the LLM mapper was unavailable or returned an invalid result."],
    confirmationsRequired: ["Review all mapped values before relying on the projection outputs."],
  };
}

async function mapWithOpenAi(fileName: string, extractedText: string) {
  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are Finley, mapping an Australian financial advice fact find into a current-position projection engine scenario. Extract only facts supported by the document. Do not invent balances, dates, owners, drawdowns, expenses, homeownership, relationship status, or product details. Employment income must be mapped as taxable other-income cashflow items owned by the relevant person. Cashflow items must include startDate and endDate as ISO YYYY-MM-DD strings where the document provides a known commencement or cessation date; otherwise use null. Use endDate for salary, school fees, temporary loan repayments, rent, or other income/expenses that are known to stop so they do not project to life expectancy. For jointly owned assets, liabilities, or household investment income, set ownerPersonId to joint so the projection engine can split taxable income across client and partner. Income that belongs to an asset, such as rent from an investment property or distributions from a non-super investment portfolio, must be mapped to that asset's annualIncome field rather than duplicated as a generic cashflow item. Superannuation and pension annualFeeRate must be a decimal rate; use 0.015 unless the document provides a specific fee rate. Super accumulation annualContribution represents additional regular annual contributions to that account; use 0 unless the document states an existing contribution arrangement. Set annualContributionType to concessional for salary sacrifice, employer-like, deductible, or concessional contributions; set it to non-concessional for after-tax/non-concessional contributions. If the document states an existing or intended rollover from super to account-based pension, map rolloverToPensionDate, rolloverPensionName, rolloverAnnualDrawdown, and rolloverDrawdownIndexedToCpi on the source super account; otherwise set rollover fields to null/0/false. Do not include proposed/recommended future insurance premiums, education savings, or implementation actions as current cashflow unless the document states they already exist. Age Pension must not be mapped as an income item unless the document states the client receives it; the engine will separately calculate eligibility from legislative assumptions. Mortgage repayments must be annual amounts, so $5,460 per month is 65520. Interest rates must be decimal annual rates, so 6.18% is 0.0618. Offset accounts are cash assets with growthRateKey none because they reduce loan interest rather than earn bank interest. Non-super ETF/share portfolios are investment assets and should use a mapped investment profile such as Balanced or Growth. Use conservative defaults only where the schema needs a value, then explain the uncertainty in confirmationsRequired. Output a valid projection scenario for deterministic modelling.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Map this uploaded fact find into the projections engine scenario schema.",
            currentYear: CURRENT_YEAR,
            defaultStartMonth: 7,
            sourceFileName: fileName,
            extractedText: extractedText.slice(0, 55000),
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: projectionScenarioSchema,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Projection scenario mapping failed with status ${response.status}.`);
  }

  const body = (await response.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string | null } | null }> } | null;
  const content = body?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Projection scenario mapping returned no content.");
  }

  const parsed = JSON.parse(content) as {
    scenario: ProjectionScenario;
    mappingNotes: string[];
    confirmationsRequired: string[];
  };

  return {
    ...parsed,
    scenario: normalizeScenario(parsed.scenario, fileName),
  };
}

export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Upload a fact find file before running the projection model." }, { status: 400 });
  }

  try {
    const extractedText = await extractText(file);
    if (!extractedText.trim()) {
      return NextResponse.json({ error: "Finley could not read text from this file." }, { status: 400 });
    }

    const mapped = OPENAI_API_KEY
      ? await mapWithOpenAi(file.name, extractedText)
      : fallbackScenario(file.name, extractedText);

    return NextResponse.json({
      ...mapped,
      source: OPENAI_API_KEY ? "llm" : "fallback",
      model: OPENAI_API_KEY ? OPENAI_MODEL : null,
      extractedTextLength: extractedText.length,
    });
  } catch (error) {
    try {
      const extractedText = await extractText(file);

      return NextResponse.json({
        ...fallbackScenario(file.name, extractedText),
        source: "fallback",
        model: null,
        warning: error instanceof Error ? error.message : "Unable to map this fact find into a projection scenario.",
        extractedTextLength: extractedText.length,
      });
    } catch {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Unable to map this fact find into a projection scenario." },
        { status: 400 },
      );
    }
  }
}
