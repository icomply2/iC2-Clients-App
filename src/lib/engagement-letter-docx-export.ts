import JSZip from "jszip";
import type { ClientProfile, PersonRecord } from "@/lib/api/types";
import {
  DEFAULT_DOCUMENT_STYLE_PROFILE,
  getDocumentWordFontFamily,
  getWordHexColor,
  normalizeDocumentStyleProfile,
  type DocumentStyleProfile,
} from "@/lib/documents/document-style-profile";

export type EngagementLetterDocxInput = {
  reasonsHtml?: string | null;
  servicesHtml?: string | null;
  advicePreparationFee?: string | null;
  implementationFee?: string | null;
  documentStyleProfile?: Partial<DocumentStyleProfile> | null;
};

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const BODY_FONT_SIZE = 22;
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

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'");
}

function text(value?: string | null) {
  return value?.trim() ?? "";
}

function stripHtml(value?: string | null) {
  return decodeEntities(
    text(value)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/\r/g, ""),
  ).trim();
}

function sanitizeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim();
}

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] ?? value;
}

function getClientName(profile: ClientProfile) {
  const names = [profile.client?.name, profile.partner?.name].map(text).filter(Boolean);
  return names.join(" and ") || "Client";
}

function personAddress(person?: PersonRecord | null) {
  const street = text(person?.street) || text(person?.addressStreet) || text(person?.address?.street) || text(person?.address?.line1);
  const suburb = text(person?.suburb) || text(person?.addressSuburb) || text(person?.address?.suburb) || text(person?.address?.city);
  const state = text(person?.state) || text(person?.addressState) || text(person?.address?.state) || text(person?.address?.region);
  const postcode =
    text(person?.postCode) || text(person?.postcode) || text(person?.addressPostCode) || text(person?.address?.postCode) || text(person?.address?.postcode);
  const locality = [suburb, state, postcode].filter(Boolean).join(" ");

  return [street, locality].filter(Boolean);
}

function parseCurrencyAmount(value?: string | null) {
  const amount = Number(text(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function formatCurrencyAmount(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

type ParagraphOptions = {
  align?: "left" | "center" | "right";
  bold?: boolean;
  color?: string;
  fontSize?: number;
  indentLeft?: number;
  italic?: boolean;
  spacingAfter?: number;
  spacingBefore?: number;
};

function runXml(value: string, options: ParagraphOptions = {}) {
  const bold = options.bold ? "<w:b/>" : "";
  const italic = options.italic ? "<w:i/>" : "";
  const color = getWordHexColor(options.color, `#${activeBodyColor()}`);
  const size = options.fontSize ?? BODY_FONT_SIZE;

  return `<w:r><w:rPr><w:rFonts w:ascii="${activeFontFamily()}" w:hAnsi="${activeFontFamily()}"/>${bold}${italic}<w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r>`;
}

function paragraphXml(value: string, options: ParagraphOptions = {}) {
  const align = options.align ? `<w:jc w:val="${options.align}"/>` : "";
  const indent = options.indentLeft ? `<w:ind w:left="${options.indentLeft}"/>` : "";
  const before = options.spacingBefore ?? 0;
  const after = options.spacingAfter ?? 0;

  return `<w:p><w:pPr>${align}${indent}<w:spacing w:before="${before}" w:after="${after}"/></w:pPr>${runXml(value, options)}</w:p>`;
}

function headingXml(value: string, level: 1 | 2 | 3 = 2) {
  const fontSize = level === 1 ? 36 : level === 2 ? 28 : 24;
  const before = level === 1 ? 160 : 140;
  const after = level === 1 ? 120 : 80;

  return paragraphXml(value, {
    bold: true,
    color: `#${activeHeadingColor()}`,
    fontSize,
    spacingBefore: before,
    spacingAfter: after,
  });
}

function bulletXml(value: string) {
  return paragraphXml(`• ${value}`, { indentLeft: 360 });
}

function htmlToParagraphs(value?: string | null) {
  const html = text(value);
  const listItems = Array.from(html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)).map((match) => stripHtml(match[1]));

  if (listItems.length) {
    return listItems.filter(Boolean).map(bulletXml).join("");
  }

  const lines = stripHtml(html)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => paragraphXml(line, { spacingAfter: 80 })).join("");
}

function tableCellXml(content: string, options: { fill?: string; bold?: boolean; widthPct?: number } = {}) {
  const fill = options.fill ? `<w:shd w:fill="${getWordHexColor(options.fill, `#${activeTableHeaderFill()}`)}"/>` : "";
  const width = options.widthPct ? `<w:tcW w:w="${Math.round(options.widthPct * 50)}" w:type="pct"/>` : "";
  return `<w:tc><w:tcPr>${width}${fill}<w:tcMar><w:top w:w="120" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar></w:tcPr>${paragraphXml(content, { bold: options.bold })}</w:tc>`;
}

function tableRowXml(cells: string) {
  return `<w:tr>${cells}</w:tr>`;
}

function feeEstimateTableXml(advicePreparationFee: number, implementationFee: number) {
  const totalFee = advicePreparationFee + implementationFee;

  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="D7E0EC"/><w:left w:val="single" w:sz="4" w:color="D7E0EC"/><w:bottom w:val="single" w:sz="4" w:color="D7E0EC"/><w:right w:val="single" w:sz="4" w:color="D7E0EC"/><w:insideH w:val="single" w:sz="4" w:color="D7E0EC"/><w:insideV w:val="single" w:sz="4" w:color="D7E0EC"/></w:tblBorders></w:tblPr>
    ${tableRowXml(tableCellXml("Fee type", { fill: `#${activeTableHeaderFill()}`, bold: true, widthPct: 55 }) + tableCellXml("Amount", { fill: `#${activeTableHeaderFill()}`, bold: true, widthPct: 45 }))}
    ${tableRowXml(tableCellXml("Advice preparation fee") + tableCellXml(formatCurrencyAmount(advicePreparationFee)))}
    ${tableRowXml(tableCellXml("Implementation fee") + tableCellXml(formatCurrencyAmount(implementationFee)))}
    ${tableRowXml(tableCellXml("Total", { fill: `#${activeTableHeaderFill()}`, bold: true }) + tableCellXml(formatCurrencyAmount(totalFee), { fill: `#${activeTableHeaderFill()}`, bold: true }))}
  </w:tbl>`;
}

function sectionPropertiesXml() {
  return `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;
}

function buildDocumentXml(profile: ClientProfile, draft: EngagementLetterDocxInput) {
  const clientName = getClientName(profile);
  const clientFirstName = firstName(text(profile.client?.name) || clientName);
  const adviserName = text(profile.adviser?.name) || "<<adviser.name>>";
  const practiceName = text(profile.adviser?.practice?.name) || text(profile.practice) || "<<practice>>";
  const licenseeName = text(profile.adviser?.licensee?.name) || text(profile.licensee);
  const addressLines = personAddress(profile.client);
  const advicePreparationFee = parseCurrencyAmount(draft.advicePreparationFee);
  const implementationFee = parseCurrencyAmount(draft.implementationFee);
  const servicesXml = stripHtml(draft.servicesHtml)
    ? htmlToParagraphs(draft.servicesHtml)
    : [
        "Review and confirm your personal circumstances, goals and advice needs.",
        "Prepare initial advice recommendations for your review.",
        "Discuss the advice, costs and next steps with you before implementation.",
      ]
        .map(bulletXml)
        .join("");

  const body = [
    paragraphXml(formatDate(), { spacingAfter: 160 }),
    paragraphXml(clientName, { bold: true }),
    ...addressLines.map((line) => paragraphXml(line)),
    paragraphXml(`Dear ${clientFirstName},`, { spacingBefore: 220, spacingAfter: 120 }),
    headingXml("Engagement Letter", 1),
    headingXml("Terms of Engagement", 2),
    paragraphXml("Further to our meeting and discussions, this document sets out to:", { spacingAfter: 80 }),
    bulletXml("Detail your service expectations and outcomes, specify the service deliverables."),
    bulletXml("Provide a fee estimate."),
    bulletXml("Explain our trading terms and method of billing, inform you of your next steps."),
    bulletXml("Provide general education information on the various financial concepts identified during our meeting."),
    paragraphXml(
      "An important part of our business philosophy is clear communication. We believe that it is essential that both the client and the advisor have a clear understanding of their respective expectations and obligations in relation to the provision of our services.",
      { spacingBefore: 160, spacingAfter: 120 },
    ),
    paragraphXml(
      "The world of finance, taxation and business advice has become more complex in recent years. Increasingly we find ourselves advising on and providing a far broader range of services than ever before. This document summarises the key elements of our future relationship so that we may ensure that your objectives are met and that potential misunderstandings are avoided.",
      { spacingAfter: 160 },
    ),
    headingXml("Fee Estimate", 2),
    feeEstimateTableXml(advicePreparationFee, implementationFee),
    headingXml("Initial Advice Service", 2),
    paragraphXml(
      "In order to achieve the outcomes and expectations for your particular circumstances, the services that we will deliver are summarised below.",
      { spacingAfter: 120 },
    ),
    paragraphXml("Tasks to be completed by us:", { bold: true, spacingAfter: 80 }),
    servicesXml,
    paragraphXml(
      "Where the implementation of your financial plan incurs additional costs, these will be disclosed to you in your Statement of Advice. Where your decision leads to a clawback of commission, we reserve the right to charge a fee to recoup our costs.",
      { spacingBefore: 160, spacingAfter: 120 },
    ),
    paragraphXml(
      "Should we discover that the advice you require is more complex than we had originally thought, we may need to increase this fee. In this event, we will consult with you first before you incur any additional cost.",
      { spacingAfter: 160 },
    ),
    headingXml("Ongoing Advice Service", 2),
    paragraphXml(
      "We may find as a result of our conversations with you that you would value ongoing advice. If this is the case, we will provide you with an Ongoing Adviser Service Agreement for your consideration at the time of advice presentation.",
      { spacingAfter: 120 },
    ),
    paragraphXml(
      "If you feel this service will be valuable to you, we would be happy to provide you with a fee estimate prior to you engaging with our initial advice service.",
      { spacingAfter: 160 },
    ),
    headingXml("Next Steps", 2),
    paragraphXml(
      "Upon your completion of this engagement letter, we will contact you to begin the data collection process that will allow us to completely understand your current situation, lifestyle objectives and goals.",
      { spacingAfter: 160 },
    ),
    headingXml("Agreement", 2),
    paragraphXml(
      `We ask that you sign this letter to confirm your understanding of these arrangements and to confirm our engagement as your advisors. Could you please return a copy of this engagement letter to ${practiceName}. Alternatively, if you wish to further clarify any of the matters contained in this agreement, please contact your adviser.`,
      { spacingAfter: 120 },
    ),
    paragraphXml(
      "By agreeing to this document, either by printing and signing, electronic signature or written confirmation, you are confirming your understanding of our business arrangements, and agreeing to pay the fee disclosed on the first page of this document.",
      { spacingAfter: 120 },
    ),
    paragraphXml("This offer of engagement is valid for 30 days from its issue.", { spacingAfter: 120 }),
    paragraphXml(
      "We take this opportunity to once again thank you for our appointment. We look forward to a mutually beneficial business partnership.",
      { spacingAfter: 220 },
    ),
    paragraphXml("Yours sincerely,", { spacingAfter: 180 }),
    paragraphXml(adviserName, { bold: true }),
    paragraphXml(practiceName),
    licenseeName ? paragraphXml(licenseeName) : "",
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:w10="urn:schemas-microsoft-com:office:word"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
  xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
  xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
  mc:Ignorable="w14 wp14">
  <w:body>${body}${sectionPropertiesXml()}</w:body>
</w:document>`;
}

export function buildEngagementLetterOutputName(profile: ClientProfile) {
  return `${sanitizeFilename(getClientName(profile)) || "Client"}-Engagement-Letter.docx`;
}

export async function renderEngagementLetterDocx(profile: ClientProfile, draft: EngagementLetterDocxInput = {}) {
  activeDocumentStyle = normalizeDocumentStyleProfile(draft.documentStyleProfile);
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES_XML);
  zip.folder("_rels")?.file(".rels", ROOT_RELS_XML);
  zip.folder("word")?.file("document.xml", buildDocumentXml(profile, draft));
  zip.folder("word")?.file("styles.xml", stylesXml(activeDocumentStyle));
  zip.folder("word")?.folder("_rels")?.file("document.xml.rels", DOCUMENT_RELS_XML);

  return zip.generateAsync({ type: "uint8array", mimeType: DOCX_MIME_TYPE });
}
