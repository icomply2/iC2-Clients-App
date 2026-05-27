import type {
  ClientAssetRecord,
  ClientDependantRecord,
  ClientEmploymentRecord,
  ClientExpenseRecord,
  ClientIncomeRecord,
  ClientInsuranceRecord,
  ClientLiabilityRecord,
  ClientPensionRecord,
  ClientProfile,
  ClientSuperannuationRecord,
  PersonRecord,
} from "@/lib/api/types";
import type { FinleyDisplayCard } from "@/lib/finley-shared";

type ProfileLookupScope = "client" | "partner" | "adviser" | "collection" | "profile";
type PersonTarget = "client" | "partner";
type EmploymentSourceRecord = NonNullable<PersonRecord["employment"]>[number] | ClientEmploymentRecord;

export type ProfileLookupResult =
  | {
      matched: true;
      assistantMessage: string;
      displayCard?: FinleyDisplayCard | null;
      warnings?: string[];
    }
  | { matched: false };

export type ProfileLookupField = {
  key: string;
  label: string;
  aliases: string[];
  scope: ProfileLookupScope;
  read: (profile: ClientProfile, target?: string) => unknown;
  format: (value: unknown) => string | null;
};

type CollectionLookup = {
  key: string;
  label: string;
  aliases: string[];
  answer: (profile: ClientProfile, resolvedClientName: string) => ProfileLookupResult;
};

export function answerClientProfileLookup({
  message,
  profile,
  resolvedClientName,
}: {
  message: string;
  profile: ClientProfile | null;
  resolvedClientName?: string | null;
}): ProfileLookupResult {
  const lower = normalize(message);
  const clientName = resolvedClientName?.trim() || "the selected client";

  if (!profile) {
    return {
      matched: true,
      assistantMessage: `I could not load the current profile for ${clientName} yet.`,
      warnings: ["Live client profile was not available for this read-only lookup."],
      displayCard: null,
    };
  }

  if (requestsHiddenField(lower)) {
    return {
      matched: true,
      assistantMessage: "I do not expose backend IDs, sync metadata, or internal audit fields in Finley profile answers.",
      warnings: [],
      displayCard: null,
    };
  }

  const collection = collectionLookups.find((entry) => matchesAnyAlias(lower, entry.aliases));
  if (collection) {
    return collection.answer(profile, clientName);
  }

  const personTarget = resolvePersonTarget(lower, profile);
  const personField = personFields.find((field) => matchesAnyAlias(lower, field.aliases));
  if (personField) {
    return answerPersonField(profile, clientName, personTarget, personField);
  }

  const adviserField = adviserFields.find((field) => matchesAnyAlias(lower, field.aliases));
  if (adviserField) {
    return answerAdviserField(profile, adviserField);
  }

  const profileField = profileFields.find((field) => matchesAnyAlias(lower, field.aliases));
  if (profileField) {
    return answerProfileField(profile, clientName, profileField);
  }

  if (isSummaryRequest(lower)) {
    return buildProfileSummary(profile, clientName);
  }

  const suggestion = closestKnownField(lower);
  return {
    matched: true,
    assistantMessage: suggestion
      ? `I could not find that profile field. I can answer nearby profile fields like ${suggestion}.`
      : "I can read client profile details such as date of birth, email, phone, address, adviser, assets, liabilities, income, expenses, superannuation, pension, insurance, entities, and dependants.",
    warnings: [],
    displayCard: null,
  };
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[']/g, "'").replace(/[^a-z0-9@$./%\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function phraseToPattern(alias: string) {
  const escaped = alias.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|\\b)${escaped}(?:\\b|$)`, "i");
}

function matchesAnyAlias(lowerMessage: string, aliases: string[]) {
  return aliases.some((alias) => phraseToPattern(alias).test(lowerMessage));
}

function valueText(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return null;
}

function firstTextValue(...values: unknown[]) {
  for (const value of values) {
    const text = valueText(value);
    if (text) return text;
  }
  return "";
}

function formatPlain(value: unknown) {
  return valueText(value);
}

function formatYesNoValue(value: unknown) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && value.trim()) {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return "Yes";
    if (normalized === "false") return "No";
    return value.trim();
  }
  return null;
}

function normalizeDateToIso(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return trimmed;

  const slashMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, "0");
    const month = slashMatch[2].padStart(2, "0");
    return `${slashMatch[3]}-${month}-${day}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function formatDateForDisplay(value: unknown) {
  const text = valueText(value);
  if (!text) return null;

  const normalized = normalizeDateToIso(text);
  if (!normalized) return text;

  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year}`;
}

function formatCurrencyDisplay(value: string | number | null | undefined) {
  if (value == null) return "";

  const stringValue = String(value).trim();
  if (!stringValue) return "";

  const numeric = Number(stringValue.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(numeric)) return stringValue;

  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

function toNumericValue(value?: string | number | null) {
  if (value == null) return 0;
  const numeric = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function annualiseAmount(amount: number, frequency?: string | null) {
  switch ((frequency ?? "").toLowerCase()) {
    case "weekly":
      return amount * 52;
    case "fortnightly":
      return amount * 26;
    case "monthly":
      return amount * 12;
    case "quarterly":
      return amount * 4;
    case "annually":
    case "annual":
      return amount;
    default:
      return amount;
  }
}

function readPersonAddress(person: PersonRecord | null | undefined) {
  return {
    street: firstTextValue(person?.address?.street, person?.address?.line1, person?.street, person?.addressStreet),
    suburb: firstTextValue(person?.address?.suburb, person?.address?.city, person?.suburb, person?.addressSuburb),
    state: firstTextValue(person?.address?.state, person?.address?.region, person?.state, person?.addressState),
    postCode: firstTextValue(
      person?.address?.postCode,
      person?.address?.postcode,
      person?.address?.zipCode,
      person?.postCode,
      person?.postcode,
      person?.addressPostCode,
    ),
  };
}

function formatAddress(person: PersonRecord | null | undefined) {
  const address = readPersonAddress(person);
  const display = [
    address.street,
    address.suburb,
    [address.state, address.postCode].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");

  return display || null;
}

function readPersonPhone(person: PersonRecord | null | undefined) {
  return firstTextValue(
    person?.preferredPhone,
    person?.contact?.preferredPhone,
    person?.mobile,
    person?.mobilePhone,
    person?.phone,
    person?.contact?.phone,
  ) || null;
}

function resolvePerson(profile: ClientProfile, target: PersonTarget) {
  return target === "partner" ? profile.partner ?? null : profile.client ?? null;
}

function hasPartner(profile: ClientProfile) {
  const partner = profile.partner;
  return Boolean(
    partner?.id?.trim() ||
      partner?.name?.trim() ||
      partner?.email?.trim() ||
      partner?.dob?.trim() ||
      readPersonPhone(partner),
  );
}

function personDisplayName(profile: ClientProfile, target: PersonTarget, fallbackName: string) {
  return resolvePerson(profile, target)?.name?.trim() || (target === "partner" ? "the partner" : fallbackName);
}

function resolvePersonTarget(lowerMessage: string, profile: ClientProfile): PersonTarget {
  if (/\b(partner|spouse|husband|wife)\b/.test(lowerMessage)) return "partner";

  const partnerName = profile.partner?.name?.trim().toLowerCase();
  if (partnerName && lowerMessage.includes(partnerName)) return "partner";

  return "client";
}

function isSummaryRequest(lowerMessage: string) {
  return (
    lowerMessage.includes("summary") ||
    lowerMessage.includes("summarise") ||
    lowerMessage.includes("summarize") ||
    lowerMessage.includes("overview") ||
    lowerMessage.includes("key details") ||
    lowerMessage.includes("profile") ||
    lowerMessage.startsWith("who is")
  );
}

function requestsHiddenField(lowerMessage: string) {
  return /\b(id|ic2 app id|ic2appid|entity id|sync|metadata|audit|created date|modified date)\b/.test(lowerMessage);
}

function answerPersonField(
  profile: ClientProfile,
  resolvedClientName: string,
  target: PersonTarget,
  field: ProfileLookupField,
): ProfileLookupResult {
  if (target === "partner" && !hasPartner(profile)) {
    return {
      matched: true,
      assistantMessage: `I could not find partner details on the current profile for ${resolvedClientName}.`,
      warnings: [],
      displayCard: null,
    };
  }

  const person = resolvePerson(profile, target);
  if (!person) {
    return {
      matched: true,
      assistantMessage: `I could not load the ${target} profile details for ${resolvedClientName} yet.`,
      warnings: ["Live client profile was not available for this read-only lookup."],
      displayCard: null,
    };
  }

  const value = field.format(field.read(profile, target));
  const name = personDisplayName(profile, target, resolvedClientName);

  return {
    matched: true,
    assistantMessage: value
      ? `${name}'s ${field.label.toLowerCase()} is ${value}.`
      : `I couldn't find ${name}'s ${field.label.toLowerCase()} on the current profile.`,
    warnings: [],
    displayCard: null,
  };
}

function answerAdviserField(profile: ClientProfile, field: ProfileLookupField): ProfileLookupResult {
  const value = field.format(field.read(profile));
  return {
    matched: true,
    assistantMessage: value
      ? `The adviser's ${field.label.toLowerCase()} is ${value}.`
      : `I couldn't find the adviser's ${field.label.toLowerCase()} on the current profile.`,
    warnings: [],
    displayCard: null,
  };
}

function answerProfileField(profile: ClientProfile, resolvedClientName: string, field: ProfileLookupField): ProfileLookupResult {
  const value = field.format(field.read(profile));
  return {
    matched: true,
    assistantMessage: value
      ? `${resolvedClientName}'s ${field.label.toLowerCase()} is ${value}.`
      : `I couldn't find ${resolvedClientName}'s ${field.label.toLowerCase()} on the current profile.`,
    warnings: [],
    displayCard: null,
  };
}

const personFields: ProfileLookupField[] = [
  {
    key: "name",
    label: "Name",
    aliases: ["name", "full name", "client name", "partner name"],
    scope: "client",
    read: (profile, target) => resolvePerson(profile, target as PersonTarget)?.name,
    format: formatPlain,
  },
  {
    key: "title",
    label: "Title",
    aliases: ["title", "salutation"],
    scope: "client",
    read: (profile, target) => resolvePerson(profile, target as PersonTarget)?.title,
    format: formatPlain,
  },
  {
    key: "dateOfBirth",
    label: "Date of birth",
    aliases: ["date of birth", "dob", "birthday", "birth date"],
    scope: "client",
    read: (profile, target) => resolvePerson(profile, target as PersonTarget)?.dob,
    format: formatDateForDisplay,
  },
  {
    key: "email",
    label: "Email",
    aliases: ["email", "email address"],
    scope: "client",
    read: (profile, target) => resolvePerson(profile, target as PersonTarget)?.email,
    format: formatPlain,
  },
  {
    key: "phone",
    label: "Preferred phone",
    aliases: ["phone", "phone number", "mobile", "mobile number", "preferred phone", "contact number"],
    scope: "client",
    read: (profile, target) => readPersonPhone(resolvePerson(profile, target as PersonTarget)),
    format: formatPlain,
  },
  {
    key: "address",
    label: "Address",
    aliases: ["address", "home address", "postal address", "street", "suburb", "postcode", "post code"],
    scope: "client",
    read: (profile, target) => formatAddress(resolvePerson(profile, target as PersonTarget)),
    format: formatPlain,
  },
  {
    key: "gender",
    label: "Gender",
    aliases: ["gender"],
    scope: "client",
    read: (profile, target) => resolvePerson(profile, target as PersonTarget)?.gender,
    format: formatPlain,
  },
  {
    key: "maritalStatus",
    label: "Marital status",
    aliases: ["marital status", "relationship status"],
    scope: "client",
    read: (profile, target) => resolvePerson(profile, target as PersonTarget)?.maritalStatus,
    format: formatPlain,
  },
  {
    key: "residentStatus",
    label: "Residency status",
    aliases: ["resident status", "residency", "residency status", "tax residency"],
    scope: "client",
    read: (profile, target) => resolvePerson(profile, target as PersonTarget)?.residentStatus,
    format: formatPlain,
  },
  {
    key: "status",
    label: "Status",
    aliases: ["status", "client status", "account status"],
    scope: "client",
    read: (profile, target) => {
      const person = resolvePerson(profile, target as PersonTarget);
      return firstTextValue(person?.status, person?.clientStatus, person?.accountStatus);
    },
    format: formatPlain,
  },
  {
    key: "clientCategory",
    label: "Category",
    aliases: ["category", "client category"],
    scope: "client",
    read: (profile, target) => {
      const person = resolvePerson(profile, target as PersonTarget);
      return firstTextValue(person?.clientCategory, person?.category);
    },
    format: formatPlain,
  },
  {
    key: "riskProfile",
    label: "Risk profile",
    aliases: ["risk profile", "risk profile result", "risk tolerance", "risk result"],
    scope: "client",
    read: (profile, target) => resolvePerson(profile, target as PersonTarget)?.riskProfileResponse?.resultDisplay,
    format: formatPlain,
  },
  {
    key: "healthStatus",
    label: "Health status",
    aliases: ["health", "health status"],
    scope: "client",
    read: (profile, target) => {
      const person = resolvePerson(profile, target as PersonTarget);
      return firstTextValue(person?.healthStatus, person?.health_status);
    },
    format: formatPlain,
  },
  {
    key: "healthHistory",
    label: "Health history",
    aliases: ["health history", "medical history"],
    scope: "client",
    read: (profile, target) => {
      const person = resolvePerson(profile, target as PersonTarget);
      return firstTextValue(person?.healthHistory, person?.health_history);
    },
    format: formatPlain,
  },
  {
    key: "smoker",
    label: "Smoker status",
    aliases: ["smoker", "smoking status"],
    scope: "client",
    read: (profile, target) => resolvePerson(profile, target as PersonTarget)?.smoker,
    format: formatPlain,
  },
  {
    key: "healthInsurance",
    label: "Health insurance",
    aliases: ["health insurance", "private health"],
    scope: "client",
    read: (profile, target) => {
      const person = resolvePerson(profile, target as PersonTarget);
      return firstTextValue(person?.healthInsurance, person?.health_insurance);
    },
    format: formatPlain,
  },
  {
    key: "agreementRequired",
    label: "Annual agreement required",
    aliases: ["agreement required", "annual agreement required", "fds required", "advice agreement required"],
    scope: "client",
    read: (profile, target) => {
      const person = resolvePerson(profile, target as PersonTarget);
      return person?.fdsAnnualAgreementRequired ?? person?.annualAgreementRequired ?? person?.fdsRequired;
    },
    format: formatYesNoValue,
  },
  {
    key: "agreementType",
    label: "Agreement type",
    aliases: ["agreement type", "annual agreement type", "service agreement type"],
    scope: "client",
    read: (profile, target) => {
      const person = resolvePerson(profile, target as PersonTarget);
      return firstTextValue(person?.agreementType, person?.annualAgreementStatus, person?.annualAgreement?.agreementType, person?.annualAgreement?.type);
    },
    format: formatPlain,
  },
  {
    key: "nextAnniversaryDate",
    label: "Next anniversary date",
    aliases: ["next anniversary date", "anniversary date", "next review date", "agreement date"],
    scope: "client",
    read: (profile, target) => {
      const person = resolvePerson(profile, target as PersonTarget);
      return firstTextValue(person?.nextAnniversaryDate, person?.annualAgreement?.nextAnniversaryDate, person?.annualAgreement?.nextDueDate);
    },
    format: formatDateForDisplay,
  },
];

const adviserFields: ProfileLookupField[] = [
  {
    key: "adviserName",
    label: "Name",
    aliases: ["adviser", "advisor", "adviser name", "advisor name"],
    scope: "adviser",
    read: (profile) => profile.adviser?.name,
    format: formatPlain,
  },
  {
    key: "adviserEmail",
    label: "Email",
    aliases: ["adviser email", "advisor email"],
    scope: "adviser",
    read: (profile) => profile.adviser?.email,
    format: formatPlain,
  },
  {
    key: "adviserPhone",
    label: "Phone",
    aliases: ["adviser phone", "advisor phone", "adviser office number", "advisor office number"],
    scope: "adviser",
    read: (profile) => firstTextValue(profile.adviser?.phoneNumber, profile.adviser?.officeNumber),
    format: formatPlain,
  },
  {
    key: "adviserPractice",
    label: "Practice",
    aliases: ["adviser practice", "advisor practice", "practice name"],
    scope: "adviser",
    read: (profile) => firstTextValue(profile.adviser?.practice?.name, profile.adviser?.businessName),
    format: formatPlain,
  },
  {
    key: "adviserLicensee",
    label: "Licensee",
    aliases: ["adviser licensee", "advisor licensee", "licensee name"],
    scope: "adviser",
    read: (profile) => profile.adviser?.licensee?.name,
    format: formatPlain,
  },
];

const profileFields: ProfileLookupField[] = [
  {
    key: "profileLicensee",
    label: "Licensee",
    aliases: ["licensee"],
    scope: "profile",
    read: (profile) => profile.licensee,
    format: formatPlain,
  },
  {
    key: "profilePractice",
    label: "Practice",
    aliases: ["practice"],
    scope: "profile",
    read: (profile) => profile.practice,
    format: formatPlain,
  },
];

function buildProfileSummary(profile: ClientProfile, resolvedClientName: string): ProfileLookupResult {
  const client = profile.client ?? null;
  const partner = hasPartner(profile) ? profile.partner ?? null : null;
  const clientAddress = formatAddress(client);
  const clientParts = [
    client?.name?.trim() ? `Name: ${client.name.trim()}` : null,
    formatDateForDisplay(client?.dob) ? `DOB: ${formatDateForDisplay(client?.dob)}` : "DOB missing",
    client?.email?.trim() ? `Email: ${client.email.trim()}` : "Email missing",
    readPersonPhone(client) ? `Phone: ${readPersonPhone(client)}` : "Phone missing",
    clientAddress ? `Address: ${clientAddress}` : "Address missing",
    client?.riskProfileResponse?.resultDisplay?.trim() ? `Risk profile: ${client.riskProfileResponse.resultDisplay.trim()}` : null,
  ].filter(Boolean);
  const collectionCounts = [
    ["assets", profile.assets?.length ?? 0],
    ["liabilities", profile.liabilities?.length ?? 0],
    ["income", profile.income?.length ?? 0],
    ["expenses", profile.expense?.length ?? 0],
    ["super", profile.superannuation?.length ?? 0],
    ["pension", profile.pension?.length ?? 0],
    ["insurance", profile.insurance?.length ?? 0],
    ["dependants", profile.dependants?.length ?? 0],
    ["entities", profile.entities?.length ?? 0],
  ].map(([label, count]) => `${count} ${label}`).join(", ");
  const partnerText = partner?.name?.trim() ? ` Partner: ${partner.name.trim()}.` : "";

  return {
    matched: true,
    assistantMessage: `${resolvedClientName} profile summary: ${clientParts.join(". ")}.${partnerText} Records: ${collectionCounts}.`,
    warnings: [],
    displayCard: null,
  };
}

function emptyCollectionResult(label: string, resolvedClientName: string): ProfileLookupResult {
  return {
    matched: true,
    assistantMessage: `I couldn't find any ${label.toLowerCase()} records for ${resolvedClientName}.`,
    warnings: [],
    displayCard: null,
  };
}

function collectionResult(label: string, resolvedClientName: string, count: number, displayCard: FinleyDisplayCard): ProfileLookupResult {
  return {
    matched: true,
    assistantMessage: `${resolvedClientName} has ${count} ${label.toLowerCase()} record${count === 1 ? "" : "s"}.`,
    warnings: [],
    displayCard,
  };
}

function getEmploymentFrequency(item: EmploymentSourceRecord) {
  return typeof item.frequency === "string" ? item.frequency : item.frequency?.value ?? item.frequency?.type ?? "";
}

function getAllEmploymentRecords(profile: ClientProfile | null) {
  if (!profile) return [];

  const profileEmployment = profile.employment ?? [];
  const nestedEmployment: EmploymentSourceRecord[] = [
    ...(profile.client?.employment ?? []),
    ...(profile.partner?.employment ?? []),
  ];

  return profileEmployment.length > 0 ? profileEmployment : nestedEmployment;
}

function getEmploymentOwnerName(item: EmploymentSourceRecord, profile: ClientProfile | null) {
  if (item.owner?.name?.trim()) return item.owner.name.trim();
  if (profile?.client?.employment?.some((entry) => entry === item)) return profile.client.name?.trim() ?? "";
  if (profile?.partner?.employment?.some((entry) => entry === item)) return profile.partner.name?.trim() ?? "";
  return "";
}

const collectionLookups: CollectionLookup[] = [
  {
    key: "assets",
    label: "Assets",
    aliases: ["asset", "assets", "property", "cash savings", "investment assets"],
    answer: (profile, clientName) => {
      const records = profile.assets ?? [];
      if (!records.length) return emptyCollectionResult("Asset", clientName);
      return collectionResult("Asset", clientName, records.length, {
        kind: "collection_summary",
        title: `${clientName} Assets`,
        columns: ["Category", "Type", "Description", "Current Value"],
        rows: records.map((asset: ClientAssetRecord, index) => ({
          id: asset.id ?? `asset-${index}`,
          cells: [asset.type ?? "", asset.assetType ?? "", asset.description ?? "", formatCurrencyDisplay(asset.currentValue)],
          editAction: asset.id ? { kind: "assets", recordId: asset.id, label: "Edit" } : null,
        })),
        footer: null,
      });
    },
  },
  {
    key: "dependants",
    label: "Dependants",
    aliases: ["dependant", "dependants", "dependent", "dependents", "children", "child"],
    answer: (profile, clientName) => {
      const records = profile.dependants ?? [];
      if (!records.length) return emptyCollectionResult("Dependant", clientName);
      return collectionResult("Dependant", clientName, records.length, {
        kind: "collection_summary",
        title: `${clientName} Dependants`,
        columns: ["Name", "Type", "Birthday"],
        rows: records.map((item: ClientDependantRecord, index) => ({
          id: item.id ?? `dependant-${index}`,
          cells: [item.name ?? "", item.type ?? "Child", formatDateForDisplay(item.birthday) ?? ""],
          editAction: item.id ? { kind: "dependants", recordId: item.id, label: "Edit" } : null,
        })),
        footer: null,
      });
    },
  },
  {
    key: "entities",
    label: "Entities",
    aliases: ["entity", "entities", "trust", "company"],
    answer: (profile, clientName) => {
      const records = profile.entities ?? [];
      if (!records.length) return emptyCollectionResult("Entity", clientName);
      return collectionResult("Entity", clientName, records.length, {
        kind: "collection_summary",
        title: `${clientName} Entities`,
        columns: ["Name", "Owner", "Type"],
        rows: records.map((item, index) => ({
          id: item.id ?? `entity-${index}`,
          cells: [item.name ?? "", item.owner?.name ?? "", item.type ?? ""],
          editAction: item.id ? { kind: "entities", recordId: item.id, label: "Edit" } : null,
        })),
        footer: null,
      });
    },
  },
  {
    key: "liabilities",
    label: "Liabilities",
    aliases: ["liability", "liabilities", "debt", "debts", "loan", "loans", "mortgage"],
    answer: (profile, clientName) => {
      const records = profile.liabilities ?? [];
      if (!records.length) return emptyCollectionResult("Liability", clientName);
      return collectionResult("Liability", clientName, records.length, {
        kind: "collection_summary",
        title: `${clientName} Liabilities`,
        columns: ["Type", "Bank", "Balance", "Repayment"],
        rows: records.map((item: ClientLiabilityRecord, index) => ({
          id: item.id ?? `liability-${index}`,
          cells: [item.loanType ?? "", item.bankName ?? "", formatCurrencyDisplay(item.outstandingBalance), formatCurrencyDisplay(item.repaymentAmount)],
          editAction: item.id ? { kind: "liabilities", recordId: item.id, label: "Edit" } : null,
        })),
        footer: null,
      });
    },
  },
  {
    key: "employment",
    label: "Employment",
    aliases: ["employment", "job", "jobs", "occupation", "employer", "salary"],
    answer: (profile, clientName) => {
      const records = getAllEmploymentRecords(profile);
      if (!records.length) return emptyCollectionResult("Employment", clientName);
      return collectionResult("Employment", clientName, records.length, {
        kind: "collection_summary",
        title: `${clientName} Employment`,
        columns: ["Owner", "Job Title", "Status", "Employer", "Salary", "Frequency"],
        rows: records.map((item, index) => ({
          id: item.id ?? `employment-${index}`,
          cells: [
            getEmploymentOwnerName(item, profile),
            item.jobTitle ?? item.job_title ?? "",
            item.status ?? "",
            item.employer ?? "",
            formatCurrencyDisplay(item.salary),
            getEmploymentFrequency(item),
          ],
          editAction: null,
        })),
        footer: null,
      });
    },
  },
  {
    key: "income",
    label: "Income",
    aliases: ["income", "earnings", "salary income", "cashflow income"],
    answer: (profile, clientName) => {
      const income = profile.income ?? [];
      const derivedAssetIncome = (profile.assets ?? []).filter((asset) => asset.id && asset.incomeAmount);
      const derivedPensionIncome = (profile.pension ?? []).filter((pension) => pension.id && pension.payment);
      const total = income.length + derivedAssetIncome.length + derivedPensionIncome.length;
      if (!total) return emptyCollectionResult("Income", clientName);
      return collectionResult("Income", clientName, total, {
        kind: "collection_summary",
        title: `${clientName} Income`,
        columns: ["Owner", "Description", "Amount", "Frequency", "Annualised"],
        rows: [
          ...income.map((item: ClientIncomeRecord, index) => ({
            id: item.id ?? `income-${index}`,
            cells: [
              item.owner?.name ?? "",
              item.description ?? "",
              formatCurrencyDisplay(item.amount),
              item.frequency?.value ?? item.frequency?.type ?? "",
              formatCurrencyDisplay(annualiseAmount(toNumericValue(item.amount), item.frequency?.value ?? item.frequency?.type)),
            ],
            editAction: item.id ? { kind: "income" as const, recordId: item.id, label: "Edit" } : null,
          })),
          ...derivedAssetIncome.map((asset, index) => ({
            id: `derived-asset-income-${asset.id ?? index}`,
            cells: [
              asset.owner?.name ?? "",
              asset.description ?? asset.assetType ?? "",
              formatCurrencyDisplay(asset.incomeAmount),
              asset.incomeFrequency?.value ?? asset.incomeFrequency?.type ?? "",
              formatCurrencyDisplay(annualiseAmount(toNumericValue(asset.incomeAmount), asset.incomeFrequency?.value ?? asset.incomeFrequency?.type)),
            ],
          })),
          ...derivedPensionIncome.map((pension, index) => ({
            id: `derived-pension-income-${pension.id ?? index}`,
            cells: [
              pension.owner?.name ?? "",
              pension.superFund ?? pension.type ?? "",
              formatCurrencyDisplay(pension.payment),
              pension.frequency?.value ?? pension.frequency?.type ?? "",
              formatCurrencyDisplay(annualiseAmount(toNumericValue(pension.payment), pension.frequency?.value ?? pension.frequency?.type)),
            ],
          })),
        ],
        footer: null,
      });
    },
  },
  {
    key: "expenses",
    label: "Expenses",
    aliases: ["expense", "expenses", "spending", "living expenses", "cashflow expenses"],
    answer: (profile, clientName) => {
      const expenses = profile.expense ?? [];
      const derivedLiabilityExpenses = (profile.liabilities ?? []).filter((liability) => liability.id && liability.repaymentAmount);
      const total = expenses.length + derivedLiabilityExpenses.length;
      if (!total) return emptyCollectionResult("Expense", clientName);
      return collectionResult("Expense", clientName, total, {
        kind: "collection_summary",
        title: `${clientName} Expenses`,
        columns: ["Owner", "Type", "Description", "Amount", "Frequency", "Annualised"],
        rows: [
          ...expenses.map((item: ClientExpenseRecord, index) => ({
            id: item.id ?? `expense-${index}`,
            cells: [
              item.owner?.name ?? "",
              item.type ?? "",
              item.description ?? "",
              formatCurrencyDisplay(item.amount),
              item.frequency?.value ?? item.frequency?.type ?? "",
              formatCurrencyDisplay(annualiseAmount(toNumericValue(item.amount), item.frequency?.value ?? item.frequency?.type)),
            ],
            editAction: item.id ? { kind: "expenses" as const, recordId: item.id, label: "Edit" } : null,
          })),
          ...derivedLiabilityExpenses.map((liability, index) => ({
            id: `derived-liability-expense-${liability.id ?? index}`,
            cells: [
              liability.owner?.name ?? "",
              liability.loanType ?? "Liability Repayment",
              liability.bankName ?? "",
              formatCurrencyDisplay(liability.repaymentAmount),
              liability.repaymentFrequency?.value ?? liability.repaymentFrequency?.type ?? "",
              formatCurrencyDisplay(annualiseAmount(toNumericValue(liability.repaymentAmount), liability.repaymentFrequency?.value ?? liability.repaymentFrequency?.type)),
            ],
          })),
        ],
        footer: null,
      });
    },
  },
  {
    key: "insurance",
    label: "Insurance",
    aliases: ["insurance", "cover", "policy", "policies"],
    answer: (profile, clientName) => {
      const records = profile.insurance ?? [];
      if (!records.length) return emptyCollectionResult("Insurance", clientName);
      return collectionResult("Insurance", clientName, records.length, {
        kind: "collection_summary",
        title: `${clientName} Insurance`,
        columns: ["Cover", "Insurer", "Sum Insured", "Premium"],
        rows: records.map((item: ClientInsuranceRecord, index) => ({
          id: item.id ?? `insurance-${index}`,
          cells: [item.coverRequired ?? "", item.insurer ?? "", formatCurrencyDisplay(item.sumInsured), formatCurrencyDisplay(item.premiumAmount)],
          editAction: item.id ? { kind: "insurance", recordId: item.id, label: "Edit" } : null,
        })),
        footer: null,
      });
    },
  },
  {
    key: "superannuation",
    label: "Superannuation",
    aliases: ["super", "superannuation", "super fund", "super balance"],
    answer: (profile, clientName) => {
      const records = profile.superannuation ?? [];
      if (!records.length) return emptyCollectionResult("Superannuation", clientName);
      return collectionResult("Superannuation", clientName, records.length, {
        kind: "collection_summary",
        title: `${clientName} Superannuation`,
        columns: ["Type", "Fund", "Balance", "Contribution"],
        rows: records.map((item: ClientSuperannuationRecord, index) => ({
          id: item.id ?? `super-${index}`,
          cells: [item.type ?? "", item.superFund ?? "", formatCurrencyDisplay(item.balance), formatCurrencyDisplay(item.contributionAmount)],
          editAction: item.id ? { kind: "superannuation", recordId: item.id, label: "Edit" } : null,
        })),
        footer: null,
      });
    },
  },
  {
    key: "pension",
    label: "Retirement income",
    aliases: ["retirement income", "pension", "pensions", "account based pension"],
    answer: (profile, clientName) => {
      const records = profile.pension ?? [];
      if (!records.length) return emptyCollectionResult("Retirement income", clientName);
      return collectionResult("Retirement income", clientName, records.length, {
        kind: "collection_summary",
        title: `${clientName} Retirement Income`,
        columns: ["Type", "Fund", "Balance", "Payment"],
        rows: records.map((item: ClientPensionRecord, index) => ({
          id: item.id ?? `pension-${index}`,
          cells: [item.type ?? "", item.superFund ?? "", formatCurrencyDisplay(item.balance), formatCurrencyDisplay(item.payment)],
          editAction: item.id ? { kind: "retirement-income", recordId: item.id, label: "Edit" } : null,
        })),
        footer: null,
      });
    },
  },
];

function closestKnownField(lowerMessage: string) {
  const known = [
    ...personFields.map((field) => field.label.toLowerCase()),
    ...adviserFields.map((field) => `adviser ${field.label.toLowerCase()}`),
    ...profileFields.map((field) => field.label.toLowerCase()),
    ...collectionLookups.map((entry) => entry.label.toLowerCase()),
  ];
  const words = lowerMessage.split(" ").filter((word) => word.length > 3);
  return known.find((label) => words.some((word) => label.includes(word) || word.includes(label.split(" ")[0]))) ?? null;
}
