import JSZip from "jszip";

export type FinleyTemplateDocumentType =
  | "engagement-letter"
  | "ongoing-agreement"
  | "annual-agreement"
  | "record-of-advice";

export type FinleyTemplateValidationResult = {
  documentType: FinleyTemplateDocumentType;
  valid: boolean;
  supportedFields: string[];
  unknownFields: string[];
  missingRequiredFields: string[];
  imagePlaceholders: string[];
  unsupportedConstructs: string[];
  warnings: string[];
};

export type FinleyTemplateFieldDefinition = {
  field: string;
  label: string;
  required?: boolean;
  hidden?: boolean;
  kind: "text" | "html" | "block" | "image";
};

export const FINLEY_GLOBAL_TEMPLATE_FIELDS: FinleyTemplateFieldDefinition[] = [
  { field: "document.date", label: "Document date", kind: "text" },
  { field: "client.addressee", label: "Client addressee", kind: "text" },
  { field: "client.addressBlock", label: "Client address block", kind: "html" },
  { field: "client.salutation", label: "Client salutation", kind: "text" },
  { field: "client.signatureBlock", label: "Client and partner signature block", kind: "block" },
  { field: "client.title", label: "Client title", kind: "text" },
  { field: "client.name", label: "Client name", kind: "text" },
  { field: "client.fullName", label: "Client full name", kind: "text" },
  { field: "client.firstName", label: "Client first name", kind: "text" },
  { field: "client.dateOfBirth", label: "Client date of birth", kind: "text" },
  { field: "client.email", label: "Client email", kind: "text" },
  { field: "client.phone", label: "Client phone", kind: "text" },
  { field: "client.mobile", label: "Client mobile", kind: "text" },
  { field: "client.gender", label: "Client gender", kind: "text" },
  { field: "client.status", label: "Client status", kind: "text" },
  { field: "client.category", label: "Client category", kind: "text" },
  { field: "client.maritalStatus", label: "Client marital status", kind: "text" },
  { field: "client.residencyStatus", label: "Client residency status", kind: "text" },
  { field: "client.nationality", label: "Client nationality", kind: "text" },
  { field: "client.riskProfile", label: "Client risk profile", kind: "text" },
  { field: "client.healthStatus", label: "Client health status", kind: "text" },
  { field: "client.healthHistory", label: "Client health history", kind: "text" },
  { field: "client.smoker", label: "Client smoker status", kind: "text" },
  { field: "client.healthInsurance", label: "Client health insurance", kind: "text" },
  { field: "client.street", label: "Client street address", kind: "text" },
  { field: "client.suburb", label: "Client suburb", kind: "text" },
  { field: "client.state", label: "Client state", kind: "text" },
  { field: "client.postcode", label: "Client postcode", kind: "text" },
  { field: "client.addressLine1", label: "Client address line 1", kind: "text" },
  { field: "client.addressLocality", label: "Client suburb/state/postcode", kind: "text" },
  { field: "client.agreementRequired", label: "Client agreement required", kind: "text" },
  { field: "client.agreementType", label: "Client agreement type", kind: "text" },
  { field: "client.nextAnniversaryDate", label: "Client next anniversary date", kind: "text" },
  { field: "partner.title", label: "Partner title", kind: "text" },
  { field: "partner.name", label: "Partner name", kind: "text" },
  { field: "partner.fullName", label: "Partner full name", kind: "text" },
  { field: "partner.firstName", label: "Partner first name", kind: "text" },
  { field: "partner.dateOfBirth", label: "Partner date of birth", kind: "text" },
  { field: "partner.email", label: "Partner email", kind: "text" },
  { field: "partner.phone", label: "Partner phone", kind: "text" },
  { field: "partner.mobile", label: "Partner mobile", kind: "text" },
  { field: "partner.gender", label: "Partner gender", kind: "text" },
  { field: "partner.status", label: "Partner status", kind: "text" },
  { field: "partner.category", label: "Partner category", kind: "text" },
  { field: "partner.maritalStatus", label: "Partner marital status", kind: "text" },
  { field: "partner.residencyStatus", label: "Partner residency status", kind: "text" },
  { field: "partner.nationality", label: "Partner nationality", kind: "text" },
  { field: "partner.riskProfile", label: "Partner risk profile", kind: "text" },
  { field: "partner.healthStatus", label: "Partner health status", kind: "text" },
  { field: "partner.healthHistory", label: "Partner health history", kind: "text" },
  { field: "partner.smoker", label: "Partner smoker status", kind: "text" },
  { field: "partner.healthInsurance", label: "Partner health insurance", kind: "text" },
  { field: "partner.street", label: "Partner street address", kind: "text" },
  { field: "partner.suburb", label: "Partner suburb", kind: "text" },
  { field: "partner.state", label: "Partner state", kind: "text" },
  { field: "partner.postcode", label: "Partner postcode", kind: "text" },
  { field: "partner.addressLine1", label: "Partner address line 1", kind: "text" },
  { field: "partner.addressLocality", label: "Partner suburb/state/postcode", kind: "text" },
  { field: "partner.agreementRequired", label: "Partner agreement required", kind: "text" },
  { field: "partner.agreementType", label: "Partner agreement type", kind: "text" },
  { field: "partner.nextAnniversaryDate", label: "Partner next anniversary date", kind: "text" },
  { field: "adviser.name", label: "Adviser name", kind: "text" },
  { field: "adviser.email", label: "Adviser email", kind: "text" },
  { field: "adviser.phone", label: "Adviser phone", kind: "text" },
  { field: "adviser.officeNumber", label: "Adviser office number", kind: "text" },
  { field: "adviser.abn", label: "Adviser ABN", kind: "text" },
  { field: "adviser.acn", label: "Adviser ACN", kind: "text" },
  { field: "adviser.asicNumber", label: "Adviser ASIC number", kind: "text" },
  { field: "adviser.businessName", label: "Adviser business name", kind: "text" },
  { field: "adviser.signatureImage", label: "Adviser signature image", kind: "image" },
  { field: "practice.name", label: "Practice name", kind: "text" },
  { field: "practice.licenseeName", label: "Licensee name", kind: "text" },
  { field: "practice.logo", label: "Practice logo", kind: "image" },
  { field: "practice.letterhead", label: "Practice letterhead", kind: "image" },
  { field: "practice.footer", label: "Practice footer", kind: "image" },
  { field: "licensee.name", label: "Licensee name", kind: "text" },
];

export const ENGAGEMENT_LETTER_TEMPLATE_FIELDS: FinleyTemplateFieldDefinition[] = [
  ...FINLEY_GLOBAL_TEMPLATE_FIELDS,
  { field: "adviser.signatureBlock", label: "Adviser signature block", kind: "block" },
  { field: "engagement.reasonsForSeekingAdvice", label: "Reasons for seeking advice", kind: "html" },
  { field: "engagement.tasksToBeCompleted", label: "Tasks to be completed", kind: "html" },
  { field: "engagement.feeEstimateTable", label: "Fee estimate table", kind: "block" },
  { field: "engagement.clientAcknowledgementSignatures", label: "Legacy client acknowledgement signatures", hidden: true, kind: "block" },
];

export const AGREEMENT_TEMPLATE_FIELDS: FinleyTemplateFieldDefinition[] = [
  ...FINLEY_GLOBAL_TEMPLATE_FIELDS,
  { field: "agreement.title", label: "Agreement title", kind: "text" },
  { field: "agreement.openingParagraphs", label: "Agreement opening paragraphs", kind: "html" },
  { field: "agreement.detailSections", label: "Agreement detail sections", kind: "block" },
  { field: "agreement.services", label: "Services list", kind: "block" },
  { field: "agreement.feesTable", label: "Fees table", kind: "block" },
  { field: "agreement.acknowledgement", label: "Acknowledgement wording", kind: "block" },
  { field: "agreement.clientSignatures", label: "Legacy agreement signature block", hidden: true, kind: "block" },
  { field: "consent.title", label: "Fee consent title", kind: "text" },
  { field: "consent.openingParagraphs", label: "Fee consent opening paragraphs", kind: "html" },
  { field: "consent.notes", label: "Fee consent notes", kind: "html" },
  { field: "consent.feesTable", label: "Fee consent fees table", kind: "block" },
  { field: "consent.clientSignatures", label: "Legacy fee consent signature block", hidden: true, kind: "block" },
];

const DOCUMENT_FIELDS: Record<FinleyTemplateDocumentType, FinleyTemplateFieldDefinition[]> = {
  "engagement-letter": ENGAGEMENT_LETTER_TEMPLATE_FIELDS,
  "ongoing-agreement": AGREEMENT_TEMPLATE_FIELDS,
  "annual-agreement": AGREEMENT_TEMPLATE_FIELDS,
  "record-of-advice": [],
};

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function stripHtmlPrefix(value: string) {
  return value.startsWith("html:") ? value.slice("html:".length) : value;
}

function decodeXmlText(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function getFinleyTemplateFields(documentType: FinleyTemplateDocumentType) {
  return DOCUMENT_FIELDS[documentType] ?? [];
}

export function getFinleyGlobalTemplateFields() {
  return FINLEY_GLOBAL_TEMPLATE_FIELDS.filter((field) => !field.hidden);
}

export function getFinleyDocumentSpecificTemplateFields(documentType: FinleyTemplateDocumentType) {
  const globalFieldNames = new Set(FINLEY_GLOBAL_TEMPLATE_FIELDS.map((field) => field.field));
  return getFinleyTemplateFields(documentType).filter((field) => !globalFieldNames.has(field.field) && !field.hidden);
}

export function getFinleyTemplateSupportedFieldNames(documentType: FinleyTemplateDocumentType) {
  const fields = getFinleyTemplateFields(documentType).map((field) => field.field);
  const htmlFields = getFinleyTemplateFields(documentType)
    .filter((field) => field.kind === "html")
    .map((field) => `html:${field.field}`);

  return new Set([...fields, ...htmlFields]);
}

export function extractFinleyTemplateFieldsFromXml(xml: string) {
  const plainTextFields = Array.from(xml.matchAll(/(?:&lt;&lt;|<<)\s*([^<>]+?)\s*(?:&gt;&gt;|>>)/g))
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));
  const visibleText = Array.from(xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g))
    .map((match) => decodeXmlText(match[1] ?? ""))
    .join("");
  const splitRunFields = Array.from(visibleText.matchAll(/<<\s*([^<>]+?)\s*>>/g))
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));
  const imageFields = Array.from(xml.matchAll(/\bimg(?:fit|stretch)?_([a-zA-Z][a-zA-Z0-9_.-]*)/g))
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));

  return unique([...plainTextFields, ...splitRunFields, ...imageFields]);
}

export async function extractFinleyTemplateXmlParts(buffer: Buffer | Uint8Array | ArrayBuffer) {
  const zip = await JSZip.loadAsync(buffer);
  const files = Object.values(zip.files).filter((file) =>
    /^word\/(?:document|header\d+|footer\d+)\.xml$/i.test(file.name),
  );
  const parts = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      xml: await file.async("string"),
    })),
  );

  return parts;
}

export function validateFinleyTemplateXml(
  documentType: FinleyTemplateDocumentType,
  xmlParts: Array<{ name: string; xml: string }>,
): FinleyTemplateValidationResult {
  const supportedNames = getFinleyTemplateSupportedFieldNames(documentType);
  const definitions = getFinleyTemplateFields(documentType);
  const fields = unique(xmlParts.flatMap((part) => extractFinleyTemplateFieldsFromXml(part.xml)));
  const normalizedFields = fields.map(stripHtmlPrefix);
  const unknownFields = fields.filter((field) => !supportedNames.has(field));
  const supportedFields = fields.filter((field) => supportedNames.has(field));
  const missingRequiredFields = definitions
    .filter((definition) => definition.required && !normalizedFields.includes(definition.field))
    .map((definition) => definition.field);
  const imagePlaceholders = fields
    .map(stripHtmlPrefix)
    .filter((field) => definitions.some((definition) => definition.kind === "image" && definition.field === field));
  const unsupportedConstructs = fields.filter((field) =>
    /^(cs_|es_|else|rs_|rr_|cr_|er_|ref:|refLookup:|barcode:|qrcode:|\$|\{)/.test(field),
  );
  const warnings: string[] = [];

  if (documentType === "record-of-advice") {
    warnings.push("Record of Advice templates remain on the coded fallback path in V1.");
  }

  if (imagePlaceholders.length) {
    warnings.push("Image placeholders are detected and validated, but image insertion will omit missing practice/adviser images.");
  }

  return {
    documentType,
    valid: unknownFields.length === 0 && missingRequiredFields.length === 0 && unsupportedConstructs.length === 0,
    supportedFields,
    unknownFields,
    missingRequiredFields,
    imagePlaceholders: unique(imagePlaceholders),
    unsupportedConstructs: unique(unsupportedConstructs),
    warnings,
  };
}

export async function validateFinleyTemplateDocx(
  documentType: FinleyTemplateDocumentType,
  buffer: Buffer | Uint8Array | ArrayBuffer,
) {
  const parts = await extractFinleyTemplateXmlParts(buffer);
  return validateFinleyTemplateXml(documentType, parts);
}
