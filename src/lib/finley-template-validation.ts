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
  kind: "text" | "html" | "block" | "image";
};

export const ENGAGEMENT_LETTER_TEMPLATE_FIELDS: FinleyTemplateFieldDefinition[] = [
  { field: "document.date", label: "Document date", required: true, kind: "text" },
  { field: "client.addressee", label: "Client addressee", required: true, kind: "text" },
  { field: "client.addressBlock", label: "Client address block", required: true, kind: "html" },
  { field: "client.salutation", label: "Client salutation", required: true, kind: "text" },
  { field: "adviser.name", label: "Adviser name", required: true, kind: "text" },
  { field: "adviser.signatureBlock", label: "Adviser signature block", required: true, kind: "block" },
  { field: "adviser.signatureImage", label: "Adviser signature image", kind: "image" },
  { field: "practice.name", label: "Practice name", required: true, kind: "text" },
  { field: "practice.licenseeName", label: "Licensee name", kind: "text" },
  { field: "practice.logo", label: "Practice logo", kind: "image" },
  { field: "practice.letterhead", label: "Practice letterhead", kind: "image" },
  { field: "practice.footer", label: "Practice footer", kind: "image" },
  { field: "engagement.reasonsForSeekingAdvice", label: "Reasons for seeking advice", required: true, kind: "html" },
  { field: "engagement.tasksToBeCompleted", label: "Tasks to be completed", required: true, kind: "html" },
  { field: "engagement.feeEstimateTable", label: "Fee estimate table", required: true, kind: "block" },
  { field: "engagement.clientAcknowledgementSignatures", label: "Client acknowledgement signatures", required: true, kind: "block" },
];

const DOCUMENT_FIELDS: Record<FinleyTemplateDocumentType, FinleyTemplateFieldDefinition[]> = {
  "engagement-letter": ENGAGEMENT_LETTER_TEMPLATE_FIELDS,
  "ongoing-agreement": [],
  "annual-agreement": [],
  "record-of-advice": [],
};

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function stripHtmlPrefix(value: string) {
  return value.startsWith("html:") ? value.slice("html:".length) : value;
}

export function getFinleyTemplateFields(documentType: FinleyTemplateDocumentType) {
  return DOCUMENT_FIELDS[documentType] ?? [];
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
  const imageFields = Array.from(xml.matchAll(/\bimg(?:fit|stretch)?_([a-zA-Z][a-zA-Z0-9_.-]*)/g))
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));

  return unique([...plainTextFields, ...imageFields]);
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

  if (documentType !== "engagement-letter") {
    warnings.push("Only Engagement Letter templates are merge-enabled in V1. Other document types remain on the coded fallback path.");
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
