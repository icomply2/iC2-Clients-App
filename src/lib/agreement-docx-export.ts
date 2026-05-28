import JSZip from "jszip";
import type { ClientProfile, PersonRecord } from "@/lib/api/types";
import {
  DEFAULT_DOCUMENT_STYLE_PROFILE,
  getDocumentWordFontFamily,
  getWordHexColor,
  normalizeDocumentStyleProfile,
  type DocumentStyleProfile,
} from "@/lib/documents/document-style-profile";
import {
  ANNUAL_ADVICE_AGREEMENT_ACKNOWLEDGEMENT_ITEMS,
  ANNUAL_ADVICE_AGREEMENT_ACKNOWLEDGEMENT_PARAGRAPHS,
  ANNUAL_ADVICE_AGREEMENT_DETAIL_SECTIONS,
  ANNUAL_ADVICE_AGREEMENT_OPENING_PARAGRAPHS,
  DEFAULT_SERVICE_AGREEMENT_SERVICES,
  ONGOING_SERVICE_AGREEMENT_ACKNOWLEDGEMENT_ITEMS,
  ONGOING_SERVICE_AGREEMENT_ACKNOWLEDGEMENT_PARAGRAPHS,
  ONGOING_SERVICE_AGREEMENT_DETAIL_SECTIONS,
  ONGOING_SERVICE_AGREEMENT_OPENING_PARAGRAPHS,
  groupServiceAgreementServices,
} from "@/lib/documents/document-sections";
import { readAppDefaultFinleyTemplate, readLicenseeFinleyTemplate } from "@/lib/finley-template-store";
import { buildProfileScalarTemplateFields } from "@/lib/finley-template-profile-fields";
import { extractFinleyTemplateFieldsFromXml, type FinleyTemplateDocumentType } from "@/lib/finley-template-validation";

export type StandaloneAgreementType = "ongoing" | "annual";

export type StandaloneAgreementDocxInput = {
  agreementType?: StandaloneAgreementType | null;
  adviserName?: string | null;
  practiceName?: string | null;
  licenseeName?: string | null;
  services?: string[] | null;
  fees?: StandaloneAgreementFeeRow[] | null;
  consentNotes?: string | null;
  documentStyleProfile?: Partial<DocumentStyleProfile> | null;
};

export type StandaloneAgreementFeeRow = {
  entity?: string | null;
  product?: string | null;
  feeAmount?: string | null;
  frequency?: string | null;
  annualFee?: string | null;
  deductionAccount?: string | null;
};

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const BODY_FONT_SIZE = 22;
const TEMPLATE_PLACEHOLDER_WARNING =
  "This template contains unsupported Finley placeholders. Validate the template in Admin > Templates before using it.";
let activeDocumentStyle = DEFAULT_DOCUMENT_STYLE_PROFILE;

function activeBodyColor() {
  return getWordHexColor(activeDocumentStyle.bodyTextColor, DEFAULT_DOCUMENT_STYLE_PROFILE.bodyTextColor);
}

function activeHeadingColor() {
  return getWordHexColor(activeDocumentStyle.headingColor, DEFAULT_DOCUMENT_STYLE_PROFILE.headingColor);
}

function activeTableHeaderFill() {
  return getWordHexColor(activeDocumentStyle.tableHeaderColor, DEFAULT_DOCUMENT_STYLE_PROFILE.tableHeaderColor);
}

function activeFontFamily() {
  return getDocumentWordFontFamily(activeDocumentStyle.fontFamily);
}

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

function stylesXml(style: DocumentStyleProfile) {
  const font = getDocumentWordFontFamily(style.fontFamily);
  const bodyColor = getWordHexColor(style.bodyTextColor, DEFAULT_DOCUMENT_STYLE_PROFILE.bodyTextColor);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="${font}" w:hAnsi="${font}"/>
        <w:sz w:val="${BODY_FONT_SIZE}"/>
        <w:szCs w:val="${BODY_FONT_SIZE}"/>
        <w:color w:val="${bodyColor}"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="0"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
</w:styles>`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function decodeXmlText(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function text(value?: string | null) {
  return value?.trim() ?? "";
}

function sanitizeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim();
}

function personName(profile: ClientProfile) {
  return [profile.client?.name, profile.partner?.name].filter(Boolean).join(" & ") || "Client";
}

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] ?? value;
}

function salutationName(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "Client";
  }

  const linkedNames = trimmed.split(/\s*(?:&|\band\b)\s*/i).map((name) => name.trim()).filter(Boolean);

  if (linkedNames.length > 1) {
    const firstNames = linkedNames.map((name) => firstName(name) || name);
    const uniqueFirstNames = new Set(firstNames.map((name) => name.toLowerCase()));

    return uniqueFirstNames.size === firstNames.length ? firstNames.join(" and ") : linkedNames.join(" and ");
  }

  return firstName(trimmed) || trimmed;
}

function personAddressLines(person?: PersonRecord | null) {
  const street = text(person?.street) || text(person?.addressStreet) || text(person?.address?.street) || text(person?.address?.line1);
  const suburb = text(person?.suburb) || text(person?.addressSuburb) || text(person?.address?.suburb) || text(person?.address?.city);
  const state = text(person?.state) || text(person?.addressState) || text(person?.address?.state) || text(person?.address?.region);
  const postcode =
    text(person?.postCode)
    || text(person?.postcode)
    || text(person?.addressPostCode)
    || text(person?.address?.postCode)
    || text(person?.address?.postcode)
    || text(person?.address?.zipCode);
  const locality = [suburb, state, postcode].filter(Boolean).join(" ");

  return [street, locality].filter(Boolean);
}

function paragraphXml(
  value: string,
  options: {
    bold?: boolean;
    italic?: boolean;
    size?: number;
    color?: string;
    alignment?: "center" | "right";
    spacingAfter?: number;
    bullet?: boolean;
  } = {},
) {
  const color = options.color ?? activeBodyColor();
  const font = activeFontFamily();
  const size = options.size ?? BODY_FONT_SIZE;
  const spacingAfter = options.spacingAfter ?? 0;
  const alignment = options.alignment ? `<w:jc w:val="${options.alignment}"/>` : "";
  const bullet = options.bullet ? '<w:ind w:left="720" w:hanging="360"/>' : "";

  return `<w:p><w:pPr>${alignment}<w:spacing w:after="${spacingAfter}"/>${bullet}</w:pPr><w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:color w:val="${color}"/>${options.bold ? "<w:b/>" : ""}${options.italic ? "<w:i/>" : ""}</w:rPr><w:t xml:space="preserve">${escapeXml(options.bullet ? `• ${value}` : value)}</w:t></w:r></w:p>`;
}

function headingXml(value: string, level: 1 | 2 = 1) {
  return paragraphXml(value, {
    bold: true,
    color: activeHeadingColor(),
    size: level === 1 ? 36 : 28,
    spacingAfter: level === 1 ? 180 : 120,
  });
}

function pageBreakXml() {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
}

function tableCellXml(
  value: string,
  options: { widthPct?: number; bold?: boolean; fill?: string; align?: "center" | "right" } = {},
) {
  const fill = options.fill ? `<w:shd w:fill="${options.fill}"/>` : "";
  const width = options.widthPct ? `<w:tcW w:w="${Math.round(options.widthPct * 50)}" w:type="pct"/>` : "";
  const align = options.align ? `<w:jc w:val="${options.align}"/>` : "";
  const font = activeFontFamily();

  return `<w:tc><w:tcPr>${width}<w:tcBorders><w:top w:val="single" w:sz="4" w:color="D7E1EC"/><w:left w:val="single" w:sz="4" w:color="D7E1EC"/><w:bottom w:val="single" w:sz="4" w:color="D7E1EC"/><w:right w:val="single" w:sz="4" w:color="D7E1EC"/></w:tcBorders>${fill}</w:tcPr><w:p><w:pPr>${align}<w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/><w:sz w:val="${BODY_FONT_SIZE}"/><w:szCs w:val="${BODY_FONT_SIZE}"/><w:color w:val="${activeBodyColor()}"/>${options.bold ? "<w:b/>" : ""}</w:rPr><w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r></w:p></w:tc>`;
}

function tableRowXml(cells: string) {
  return `<w:tr>${cells}</w:tr>`;
}

function servicesXml(services: string[]) {
  const groups = groupServiceAgreementServices(services.length ? services : DEFAULT_SERVICE_AGREEMENT_SERVICES);

  return groups
    .map((group) => [
      group.heading ? paragraphXml(group.heading, { bold: true, spacingAfter: 60 }) : "",
      ...group.items.map((item) => paragraphXml(item, { bullet: true, spacingAfter: 40 })),
    ].join(""))
    .join("");
}

function sectionsXml(sections: Array<{ heading: string; paragraphs: string[] }>) {
  return sections
    .map((section) => [
      headingXml(section.heading, 2),
      ...section.paragraphs.map((paragraph) => paragraphXml(paragraph, { spacingAfter: 160 })),
    ].join(""))
    .join("");
}

function paragraphsXml(paragraphs: string[]) {
  return paragraphs.map((paragraph) => paragraphXml(paragraph, { spacingAfter: 160 })).join("");
}

function bulletListXml(items: string[]) {
  return items.map((item) => paragraphXml(item, { bullet: true, spacingAfter: 40 })).join("");
}

function parseCurrencyAmount(value?: string | null) {
  const numeric = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatCurrencyAmount(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function normalizeFeeRows(fees?: StandaloneAgreementFeeRow[] | null) {
  const rows = (fees ?? []).map((fee) => ({
    entity: text(fee.entity) || "To be confirmed",
    product: text(fee.product) || "To be confirmed",
    feeAmount: text(fee.feeAmount) || "$0.00",
    frequency: text(fee.frequency) || "Monthly",
    annualFee: text(fee.annualFee) || "$0.00",
    deductionAccount: text(fee.deductionAccount),
  }));

  return rows.length
    ? rows
    : [
        {
          entity: "To be confirmed",
          product: "To be confirmed",
          feeAmount: "$0.00",
          frequency: "Monthly",
          annualFee: "$0.00",
          deductionAccount: "",
        },
      ];
}

function feeTableXml(fees?: StandaloneAgreementFeeRow[] | null) {
  const headerFill = activeTableHeaderFill();
  const rows = normalizeFeeRows(fees);
  const totalAnnualFee = rows.reduce((sum, row) => sum + parseCurrencyAmount(row.annualFee), 0);

  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="D7E1EC"/><w:left w:val="single" w:sz="4" w:color="D7E1EC"/><w:bottom w:val="single" w:sz="4" w:color="D7E1EC"/><w:right w:val="single" w:sz="4" w:color="D7E1EC"/><w:insideH w:val="single" w:sz="4" w:color="D7E1EC"/><w:insideV w:val="single" w:sz="4" w:color="D7E1EC"/></w:tblBorders></w:tblPr>
    ${tableRowXml(
      tableCellXml("Entity", { widthPct: 25, bold: true, fill: headerFill })
        + tableCellXml("Product", { widthPct: 25, bold: true, fill: headerFill })
        + tableCellXml("Fee amount", { widthPct: 20, bold: true, fill: headerFill })
        + tableCellXml("Frequency", { widthPct: 15, bold: true, fill: headerFill })
        + tableCellXml("Annual fee", { widthPct: 15, bold: true, fill: headerFill, align: "right" }),
    )}
    ${rows.map((row) =>
      tableRowXml(
        tableCellXml(row.entity, { widthPct: 25 })
          + tableCellXml(row.product, { widthPct: 25 })
          + tableCellXml(row.feeAmount, { widthPct: 20 })
          + tableCellXml(row.frequency, { widthPct: 15 })
          + tableCellXml(row.annualFee, { widthPct: 15, align: "right" }),
      ),
    ).join("")}
    ${tableRowXml(
      tableCellXml("Total annual advice fees", { widthPct: 85, bold: true, fill: headerFill })
        + tableCellXml(formatCurrencyAmount(totalAnnualFee), { widthPct: 15, bold: true, fill: headerFill, align: "right" }),
    )}
  </w:tbl>`;
}

function signatureTableXml(names: string[], adviserName: string) {
  const first = names[0] || "Client";
  const second = names[1] || "";
  const firstCell = [
    paragraphXml("Signed: ______________________________", { spacingAfter: 180 }),
    paragraphXml(first, { bold: true, spacingAfter: 160 }),
    paragraphXml("Date: ______________________________"),
  ].join("");
  const secondCell = second
    ? [
        paragraphXml("Signed: ______________________________", { spacingAfter: 180 }),
        paragraphXml(second, { bold: true, spacingAfter: 160 }),
        paragraphXml("Date: ______________________________"),
      ].join("")
    : "";

  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr>
    ${tableRowXml(
      `<w:tc><w:tcPr><w:tcW w:w="${second ? 2500 : 5000}" w:type="pct"/></w:tcPr>${firstCell}</w:tc>`
        + (second ? `<w:tc><w:tcPr><w:tcW w:w="2500" w:type="pct"/></w:tcPr>${secondCell}</w:tc>` : ""),
    )}
  </w:tbl>${paragraphXml(`Adviser: ${adviserName || "<<adviser.name>>"}`, { spacingAfter: 0 })}`;
}

function placeholderParagraphXml(fieldName: string, options: Parameters<typeof paragraphXml>[1] = {}) {
  return paragraphXml(`<<${fieldName}>>`, options);
}

function templateTokens(fieldName: string) {
  return [`&lt;&lt;${fieldName}&gt;&gt;`, `<<${fieldName}>>`];
}

type XmlTextChar = {
  char: string;
  start: number;
  end: number;
};

type TemplateTokenOccurrence = {
  fieldName: string;
  start: number;
  end: number;
};

function decodeXmlTextWithRanges(value: string, offset: number) {
  const chars: XmlTextChar[] = [];
  let index = 0;

  while (index < value.length) {
    if (value[index] === "&") {
      const entityEnd = value.indexOf(";", index);

      if (entityEnd !== -1) {
        const entity = value.slice(index, entityEnd + 1);
        const decoded = decodeXmlText(entity);

        if (decoded.length === 1) {
          chars.push({ char: decoded, start: offset + index, end: offset + entityEnd + 1 });
          index = entityEnd + 1;
          continue;
        }
      }
    }

    chars.push({ char: value[index] ?? "", start: offset + index, end: offset + index + 1 });
    index += 1;
  }

  return chars;
}

function findTemplateTokenOccurrences(xml: string, fieldName?: string) {
  const chars: XmlTextChar[] = [];
  const textNodePattern = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
  let textNodeMatch: RegExpExecArray | null;

  while ((textNodeMatch = textNodePattern.exec(xml)) !== null) {
    const content = textNodeMatch[1] ?? "";
    const contentOffset = textNodeMatch.index + textNodeMatch[0].indexOf(">") + 1;
    chars.push(...decodeXmlTextWithRanges(content, contentOffset));
  }

  const visibleText = chars.map((item) => item.char).join("");
  const tokenPattern = /<<\s*([^<>]+?)\s*>>/g;
  const occurrences: TemplateTokenOccurrence[] = [];
  let tokenMatch: RegExpExecArray | null;

  while ((tokenMatch = tokenPattern.exec(visibleText)) !== null) {
    const matchedFieldName = tokenMatch[1]?.trim();
    const matchLength = tokenMatch[0].length;
    const firstChar = chars[tokenMatch.index];
    const lastChar = chars[tokenMatch.index + matchLength - 1];

    if (!matchedFieldName || !firstChar || !lastChar || (fieldName && matchedFieldName !== fieldName)) {
      continue;
    }

    occurrences.push({
      fieldName: matchedFieldName,
      start: firstChar.start,
      end: lastChar.end,
    });
  }

  return occurrences;
}

function replaceTemplateTokenText(xml: string, fieldName: string, value: string) {
  return findTemplateTokenOccurrences(xml, fieldName)
    .sort((left, right) => right.start - left.start)
    .reduce(
      (current, occurrence) => `${current.slice(0, occurrence.start)}${escapeXml(value)}${current.slice(occurrence.end)}`,
      xml,
    );
}

function findParagraphStartBefore(xml: string, index: number) {
  const precedingXml = xml.slice(0, index);
  const starts = Array.from(precedingXml.matchAll(/<w:p(?:\s|>)/g));

  return starts.length ? starts[starts.length - 1]?.index ?? -1 : -1;
}

function replaceInlineField(xml: string, fieldName: string, value: string) {
  const rawTokenReplaced = templateTokens(fieldName).reduce(
    (current, token) => current.replaceAll(token, escapeXml(value)),
    xml,
  );

  return replaceTemplateTokenText(rawTokenReplaced, fieldName, value);
}

function replaceParagraphContainingField(xml: string, fieldName: string, valueXml: string) {
  let nextXml = xml;
  const occurrences = findTemplateTokenOccurrences(xml, fieldName).sort((left, right) => right.start - left.start);

  for (const occurrence of occurrences) {
    const paragraphStart = findParagraphStartBefore(nextXml, occurrence.start);
    const paragraphEnd = nextXml.indexOf("</w:p>", occurrence.end);

    if (paragraphStart === -1 || paragraphEnd === -1) {
      nextXml = `${nextXml.slice(0, occurrence.start)}${valueXml}${nextXml.slice(occurrence.end)}`;
      continue;
    }

    const replacementEnd = paragraphEnd + "</w:p>".length;
    nextXml = `${nextXml.slice(0, paragraphStart)}${valueXml}${nextXml.slice(replacementEnd)}`;
  }

  return nextXml;
}

function replaceBlockField(xml: string, fieldName: string, valueXml: string) {
  const rawTokenReplaced = templateTokens(fieldName).reduce((current, token) => {
    let nextXml = current;
    let searchFrom = 0;

    while (searchFrom < nextXml.length) {
      const tokenIndex = nextXml.indexOf(token, searchFrom);

      if (tokenIndex === -1) {
        break;
      }

      const paragraphStart = findParagraphStartBefore(nextXml, tokenIndex);
      const paragraphEnd = nextXml.indexOf("</w:p>", tokenIndex);

      if (paragraphStart === -1 || paragraphEnd === -1) {
        nextXml = `${nextXml.slice(0, tokenIndex)}${valueXml}${nextXml.slice(tokenIndex + token.length)}`;
        searchFrom = tokenIndex + valueXml.length;
        continue;
      }

      const replacementEnd = paragraphEnd + "</w:p>".length;
      nextXml = `${nextXml.slice(0, paragraphStart)}${valueXml}${nextXml.slice(replacementEnd)}`;
      searchFrom = paragraphStart + valueXml.length;
    }

    return nextXml;
  }, xml);

  return replaceParagraphContainingField(rawTokenReplaced, fieldName, valueXml);
}

function resolveLicenseeId(profile: ClientProfile) {
  return text(profile.adviser?.licensee?.id) || text(profile.licensee);
}

function agreementDocumentType(agreementType: StandaloneAgreementType): FinleyTemplateDocumentType {
  return agreementType === "annual" ? "annual-agreement" : "ongoing-agreement";
}

function buildAgreementTemplateModel(profile: ClientProfile, input: StandaloneAgreementDocxInput = {}) {
  const clientName = personName(profile);
  const agreementType = input.agreementType === "annual" ? "annual" : "ongoing";
  const title = agreementType === "annual" ? "Annual Advice Agreement" : "Ongoing Service Agreement";
  const adviserName = text(input.adviserName) || text(profile.adviser?.name) || "<<adviser.name>>";
  const practiceName = text(input.practiceName) || text(profile.practice) || text(profile.adviser?.practice?.name) || "<<practice.name>>";
  const licenseeName = text(input.licenseeName) || text(profile.licensee) || text(profile.adviser?.licensee?.name) || "";
  const signatureNames = [profile.client?.name, profile.partner?.name].filter(Boolean) as string[];
  const opening =
    agreementType === "annual"
      ? ANNUAL_ADVICE_AGREEMENT_OPENING_PARAGRAPHS
      : ONGOING_SERVICE_AGREEMENT_OPENING_PARAGRAPHS;
  const agreementDetailSections =
    agreementType === "annual"
      ? ANNUAL_ADVICE_AGREEMENT_DETAIL_SECTIONS
      : ONGOING_SERVICE_AGREEMENT_DETAIL_SECTIONS;
  const acknowledgementParagraphs =
    agreementType === "annual"
      ? ANNUAL_ADVICE_AGREEMENT_ACKNOWLEDGEMENT_PARAGRAPHS
      : ONGOING_SERVICE_AGREEMENT_ACKNOWLEDGEMENT_PARAGRAPHS;
  const acknowledgementItems =
    agreementType === "annual"
      ? ANNUAL_ADVICE_AGREEMENT_ACKNOWLEDGEMENT_ITEMS
      : ONGOING_SERVICE_AGREEMENT_ACKNOWLEDGEMENT_ITEMS;
  const consentOpeningParagraphs = [
    agreementType === "annual"
      ? "We are required to obtain your written consent to deduct the fees payable for our advice services for the upcoming 12 months. Without your consent, our fixed term service agreement cannot be entered into."
      : "By signing this consent, you authorise the agreed advice fees to be deducted from the nominated account for the services described in this agreement.",
    agreementType === "annual"
      ? "Accordingly, no services or advice will be delivered if you do not return this signed and dated form consenting to payment of our fixed term advice fees."
      : "This consent may be withdrawn by you at any time by notifying us in writing.",
  ];
  const consentNotes = text(input.consentNotes);

  return {
    inline: {
      ...buildProfileScalarTemplateFields(profile),
      "document.date": formatToday(),
      "client.addressee": clientName,
      "client.salutation": salutationName(clientName),
      "agreement.title": title,
      "consent.title": "Consent To Deduct Fees From Your Account",
      "adviser.name": adviserName,
      "practice.name": practiceName,
      "practice.licenseeName": licenseeName,
    },
    blocks: {
      "client.addressBlock": personAddressLines(profile.client).map((line) => paragraphXml(line, { spacingAfter: 0 })).join(""),
      "agreement.openingParagraphs": paragraphsXml(opening),
      "agreement.detailSections": sectionsXml(agreementDetailSections),
      "agreement.services": servicesXml(input.services?.filter(Boolean) ?? DEFAULT_SERVICE_AGREEMENT_SERVICES),
      "agreement.feesTable": feeTableXml(input.fees),
      "agreement.acknowledgement": [
        paragraphsXml(acknowledgementParagraphs),
        bulletListXml(acknowledgementItems),
      ].join(""),
      "client.signatureBlock": signatureTableXml(signatureNames.length ? signatureNames : [clientName], adviserName),
      "agreement.clientSignatures": signatureTableXml(signatureNames.length ? signatureNames : [clientName], adviserName),
      "consent.openingParagraphs": paragraphsXml(consentOpeningParagraphs),
      "consent.notes": consentNotes ? paragraphXml(consentNotes, { spacingAfter: 160 }) : "",
      "consent.feesTable": feeTableXml(input.fees),
      "consent.clientSignatures": signatureTableXml(signatureNames.length ? signatureNames : [clientName], adviserName),
    },
    imageFields: ["practice.logo", "practice.letterhead", "practice.footer", "adviser.signatureImage"],
  };
}

function defaultAgreementTemplateDocumentXml(agreementType: StandaloneAgreementType) {
  const isAnnual = agreementType === "annual";
  const body = [
    placeholderParagraphXml("document.date", { spacingAfter: 220 }),
    placeholderParagraphXml("client.addressee", { bold: true, spacingAfter: 0 }),
    placeholderParagraphXml("html:client.addressBlock"),
    headingXml("<<agreement.title>>"),
    paragraphXml("Dear <<client.salutation>>,", { spacingAfter: 180 }),
    placeholderParagraphXml("html:agreement.openingParagraphs"),
    placeholderParagraphXml("agreement.detailSections"),
    headingXml("The services you are entitled to receive", 2),
    paragraphXml(
      isAnnual
        ? "The terms of the Fixed Term Arrangement, including the services you are entitled to and the cost, are set out below."
        : "The terms of the Ongoing Service Arrangement, including the services you are entitled to and the cost, are set out below.",
      { spacingAfter: 160 },
    ),
    placeholderParagraphXml("agreement.services"),
    headingXml(isAnnual ? "What fees are payable under my fixed term fee arrangement?" : "What fees are payable under my ongoing fee arrangement?", 2),
    paragraphXml(
      isAnnual
        ? "The following fixed term fees will be payable to cover the services you are entitled to receive under the fixed term fee arrangement:"
        : "The following ongoing fees will be payable to cover the services you are entitled to receive under the ongoing fee arrangement:",
      { spacingAfter: 160 },
    ),
    placeholderParagraphXml("agreement.feesTable"),
    headingXml("Your Acknowledgement", 2),
    placeholderParagraphXml("agreement.acknowledgement"),
    placeholderParagraphXml("client.signatureBlock"),
    pageBreakXml(),
    headingXml("<<consent.title>>"),
    placeholderParagraphXml("html:consent.openingParagraphs"),
    placeholderParagraphXml("html:consent.notes"),
    headingXml(isAnnual ? "What fees are payable under my fixed term fee arrangement?" : "What fees are payable under my ongoing fee arrangement?", 2),
    placeholderParagraphXml("consent.feesTable"),
    headingXml("Your consent to deduct fees from your account", 2),
    paragraphXml(
      isAnnual
        ? "I/we consent to the payment of fixed term advice fees in accordance with the terms of this fee consent form."
        : "I/we consent to the payment of ongoing advice fees in accordance with the terms of this fee consent form.",
      { spacingAfter: 180 },
    ),
    placeholderParagraphXml("client.signatureBlock"),
    placeholderParagraphXml("practice.name"),
    placeholderParagraphXml("practice.licenseeName"),
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function buildDocumentXml(profile: ClientProfile, input: StandaloneAgreementDocxInput = {}) {
  const clientName = personName(profile);
  const clientSalutationName = salutationName(clientName);
  const agreementType = input.agreementType === "annual" ? "annual" : "ongoing";
  const title = agreementType === "annual" ? "Annual Advice Agreement" : "Ongoing Service Agreement";
  const adviserName = text(input.adviserName) || text(profile.adviser?.name) || "<<adviser.name>>";
  const practiceName = text(input.practiceName) || text(profile.practice) || text(profile.adviser?.practice?.name) || "<<practice.name>>";
  const licenseeName = text(input.licenseeName) || text(profile.licensee) || text(profile.adviser?.licensee?.name) || "<<licensee.name>>";
  const signatureNames = [profile.client?.name, profile.partner?.name].filter(Boolean) as string[];
  const addressLines = personAddressLines(profile.client);

  const opening =
    agreementType === "annual"
      ? ANNUAL_ADVICE_AGREEMENT_OPENING_PARAGRAPHS
      : ONGOING_SERVICE_AGREEMENT_OPENING_PARAGRAPHS;
  const agreementDetailSections =
    agreementType === "annual"
      ? ANNUAL_ADVICE_AGREEMENT_DETAIL_SECTIONS
      : ONGOING_SERVICE_AGREEMENT_DETAIL_SECTIONS;
  const acknowledgementParagraphs =
    agreementType === "annual"
      ? ANNUAL_ADVICE_AGREEMENT_ACKNOWLEDGEMENT_PARAGRAPHS
      : ONGOING_SERVICE_AGREEMENT_ACKNOWLEDGEMENT_PARAGRAPHS;
  const acknowledgementItems =
    agreementType === "annual"
      ? ANNUAL_ADVICE_AGREEMENT_ACKNOWLEDGEMENT_ITEMS
      : ONGOING_SERVICE_AGREEMENT_ACKNOWLEDGEMENT_ITEMS;

  const serviceAndFeeXml = [
    headingXml("The services you are entitled to receive", 2),
    paragraphXml(
      agreementType === "annual"
        ? "The terms of the Fixed Term Arrangement, including the services you are entitled to and the cost, are set out below."
        : "The terms of the Ongoing Service Arrangement, including the services you are entitled to and the cost, are set out below.",
      { spacingAfter: 160 },
    ),
    servicesXml(input.services?.filter(Boolean) ?? DEFAULT_SERVICE_AGREEMENT_SERVICES),
    headingXml(agreementType === "annual" ? "What fees are payable under my fixed term fee arrangement?" : "What fees are payable under my ongoing fee arrangement?", 2),
    paragraphXml(
      agreementType === "annual"
        ? "The following fixed term fees will be payable to cover the services you are entitled to receive under the fixed term fee arrangement:"
        : "The following ongoing fees will be payable to cover the services you are entitled to receive under the ongoing fee arrangement:",
      { spacingAfter: 160 },
    ),
    feeTableXml(input.fees),
  ].join("");

  const body = [
    paragraphXml(formatToday(), { spacingAfter: 220 }),
    paragraphXml(clientName, { bold: true, spacingAfter: 0 }),
    ...addressLines.map((line) => paragraphXml(line, { spacingAfter: 0 })),
    headingXml(title),
    paragraphXml(`Dear ${clientSalutationName},`, { spacingAfter: 180 }),
    ...opening.map((paragraph) => paragraphXml(paragraph, { spacingAfter: 160 })),
    sectionsXml(agreementDetailSections),
    headingXml("Your Acknowledgement", 2),
    ...acknowledgementParagraphs.map((paragraph) => paragraphXml(paragraph, { spacingAfter: 160 })),
    ...acknowledgementItems.map((item) => paragraphXml(item, { bullet: true, spacingAfter: 40 })),
    signatureTableXml(signatureNames.length ? signatureNames : [clientName], adviserName),
    headingXml("Consent To Deduct Fees From Your Account", 2),
    paragraphXml(
      agreementType === "annual"
        ? "We are required to obtain your written consent to deduct the fees payable for our advice services for the upcoming 12 months. Without your consent, our fixed term service agreement cannot be entered into."
        : "By signing this consent, you authorise the agreed advice fees to be deducted from the nominated account for the services described in this agreement.",
      { spacingAfter: 160 },
    ),
    text(input.consentNotes) ? paragraphXml(text(input.consentNotes), { spacingAfter: 160 }) : "",
    paragraphXml(
      agreementType === "annual"
        ? "Accordingly, no services or advice will be delivered if you do not return this signed and dated form consenting to payment of our fixed term advice fees."
        : "This consent may be withdrawn by you at any time by notifying us in writing.",
      { spacingAfter: 160 },
    ),
    serviceAndFeeXml,
    headingXml("Your consent to deduct fees from your account", 2),
    paragraphXml(
      agreementType === "annual"
        ? "I/we consent to the payment of fixed term advice fees in accordance with the terms of this fee consent form."
        : "I/we consent to the payment of ongoing advice fees in accordance with the terms of this fee consent form.",
      { spacingAfter: 180 },
    ),
    signatureTableXml(signatureNames.length ? signatureNames : [clientName], adviserName),
    paragraphXml(practiceName, { spacingAfter: 0 }),
    paragraphXml(licenseeName, { spacingAfter: 0 }),
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

async function createDocxFromDocumentXml(documentXml: string) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES_XML);
  zip.folder("_rels")?.file(".rels", ROOT_RELS_XML);
  const word = zip.folder("word");
  word?.file("document.xml", documentXml);
  word?.file("styles.xml", stylesXml(activeDocumentStyle));
  word?.folder("_rels")?.file("document.xml.rels", DOCUMENT_RELS_XML);

  return Buffer.from(await zip.generateAsync({ type: "uint8array", mimeType: DOCX_MIME_TYPE }));
}

function replaceImageFieldWithEmpty(xml: string, fieldName: string) {
  return replaceBlockField(replaceInlineField(xml, fieldName, ""), fieldName, "");
}

async function buildDefaultAgreementTemplateDocx(
  agreementType: StandaloneAgreementType,
  style?: Partial<DocumentStyleProfile> | null,
) {
  activeDocumentStyle = normalizeDocumentStyleProfile(style);
  return createDocxFromDocumentXml(defaultAgreementTemplateDocumentXml(agreementType));
}

async function mergeAgreementTemplateBuffer(
  templateBuffer: Buffer,
  profile: ClientProfile,
  input: StandaloneAgreementDocxInput,
) {
  const zip = await JSZip.loadAsync(templateBuffer);
  const model = buildAgreementTemplateModel(profile, input);

  await Promise.all(
    Object.values(zip.files)
      .filter((file) => /^word\/(?:document|header\d+|footer\d+)\.xml$/i.test(file.name))
      .map(async (file) => {
        let xml = await file.async("string");

        for (const [fieldName, value] of Object.entries(model.blocks)) {
          xml = replaceBlockField(xml, fieldName, value);
          xml = replaceBlockField(xml, `html:${fieldName}`, value);
        }

        for (const [fieldName, value] of Object.entries(model.inline)) {
          xml = replaceInlineField(xml, fieldName, value);
          xml = replaceInlineField(xml, `html:${fieldName}`, paragraphXml(value));
        }

        for (const fieldName of model.imageFields) {
          xml = replaceImageFieldWithEmpty(xml, fieldName);
        }

        if (file.name === "word/document.xml" && extractFinleyTemplateFieldsFromXml(xml).length) {
          xml = xml.replace("</w:body>", `${paragraphXml(TEMPLATE_PLACEHOLDER_WARNING, { italic: true })}</w:body>`);
        }

        zip.file(file.name, xml);
      }),
  );

  zip.folder("word")?.file("styles.xml", stylesXml(activeDocumentStyle));

  return Buffer.from(await zip.generateAsync({ type: "uint8array", mimeType: DOCX_MIME_TYPE }));
}

function formatToday() {
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

export function buildAgreementOutputName(profile: ClientProfile, agreementType: StandaloneAgreementType = "ongoing") {
  const primaryName = personName(profile);
  const suffix = agreementType === "annual" ? "Annual-Advice-Agreement" : "Ongoing-Service-Agreement";
  return `${sanitizeFilename(primaryName) || "Client"}-${suffix}.docx`;
}

export async function renderStandaloneAgreementDocx(
  profile: ClientProfile,
  input: StandaloneAgreementDocxInput = {},
) {
  activeDocumentStyle = normalizeDocumentStyleProfile(input.documentStyleProfile);
  const agreementType = input.agreementType === "annual" ? "annual" : "ongoing";
  const documentType = agreementDocumentType(agreementType);
  const licenseeTemplate = await readLicenseeFinleyTemplate(documentType, resolveLicenseeId(profile));
  const appDefaultTemplate = licenseeTemplate ? null : await readAppDefaultFinleyTemplate(documentType);
  const templateBuffer =
    licenseeTemplate?.content
    ?? appDefaultTemplate?.content
    ?? await buildDefaultAgreementTemplateDocx(agreementType, activeDocumentStyle);

  try {
    return await mergeAgreementTemplateBuffer(templateBuffer, profile, { ...input, agreementType });
  } catch {
    return createDocxFromDocumentXml(buildDocumentXml(profile, { ...input, agreementType }));
  }
}

export async function buildAgreementTemplateSampleDocx(documentType: FinleyTemplateDocumentType) {
  const agreementType = documentType === "annual-agreement" ? "annual" : "ongoing";
  return buildDefaultAgreementTemplateDocx(agreementType, DEFAULT_DOCUMENT_STYLE_PROFILE);
}
