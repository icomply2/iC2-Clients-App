import JSZip from "jszip";
import type { ClientProfile, PersonRecord } from "@/lib/api/types";
import {
  DEFAULT_DOCUMENT_STYLE_PROFILE,
  getDocumentWordFontFamily,
  getWordHexColor,
  normalizeDocumentStyleProfile,
  type DocumentStyleProfile,
} from "@/lib/documents/document-style-profile";
import { readAppDefaultFinleyTemplate, readLicenseeFinleyTemplate } from "@/lib/finley-template-store";
import { buildProfileScalarTemplateFields } from "@/lib/finley-template-profile-fields";
import {
  extractFinleyTemplateFieldsFromXml,
  validateFinleyTemplateDocx,
} from "@/lib/finley-template-validation";

export type EngagementLetterTemplateInput = {
  reasonsHtml?: string | null;
  servicesHtml?: string | null;
  advicePreparationFee?: string | null;
  implementationFee?: string | null;
  documentStyleProfile?: Partial<DocumentStyleProfile> | null;
};

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const BODY_FONT_SIZE = 22;
const TEMPLATE_PLACEHOLDER_WARNING =
  "This template contains unsupported Finley placeholders. Validate the template in Admin > Templates before using it.";
let activeDocumentStyle = DEFAULT_DOCUMENT_STYLE_PROFILE;

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

function getClientName(profile: ClientProfile) {
  const names = [profile.client?.name, profile.partner?.name].map(text).filter(Boolean);
  return names.join(" and ") || "Client";
}

function uniqueNames(names: string[]) {
  return Array.from(new Map(names.filter(Boolean).map((name) => [name.toLowerCase(), name])).values());
}

function personAddress(person?: PersonRecord | null) {
  const street = text(person?.street) || text(person?.addressStreet) || text(person?.address?.street) || text(person?.address?.line1);
  const suburb = text(person?.suburb) || text(person?.addressSuburb) || text(person?.address?.suburb) || text(person?.address?.city);
  const state = text(person?.state) || text(person?.addressState) || text(person?.address?.state) || text(person?.address?.region);
  const postcode =
    text(person?.postCode) || text(person?.postcode) || text(person?.addressPostCode) || text(person?.address?.postCode) || text(person?.address?.postcode);
  const locality = [suburb, state, postcode].filter(Boolean).join(" ");
  const lines = [street, locality].filter(Boolean);

  return lines.length ? lines : ["<<address>>", "<<Suburb>> <<State>> <<Postcode>>"];
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

function placeholderParagraphXml(fieldName: string, options: ParagraphOptions = {}) {
  return paragraphXml(`<<${fieldName}>>`, options);
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

function defaultReasonsXml(adviserName: string) {
  const adviser = adviserName || "your adviser";

  return [
    paragraphXml("You have asked us to help clarify your current priorities and agree the scope of advice for the next stage of work.", {
      spacingAfter: 80,
    }),
    bulletXml("We will review the information you have provided about your current financial position, goals and advice needs."),
    bulletXml("We will confirm the services, deliverables and next steps that are relevant to this engagement."),
    bulletXml(`We will document how ${adviser} will provide advice and, where you choose to proceed, implementation support.`),
  ].join("");
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

function signatureCellXml(name: string) {
  if (!name) {
    return `<w:tc><w:tcPr><w:tcW w:w="2500" w:type="pct"/></w:tcPr><w:p/></w:tc>`;
  }

  return `<w:tc><w:tcPr><w:tcW w:w="2500" w:type="pct"/><w:tcMar><w:top w:w="120" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar></w:tcPr>
    ${paragraphXml("Signed: ______________________________", { bold: true, spacingAfter: 40 })}
    ${paragraphXml(name, { align: "center", spacingAfter: 240 })}
    ${paragraphXml("Date: ______________________________", { bold: true, spacingAfter: 160 })}
  </w:tc>`;
}

function signatureTableXml(names: string[]) {
  const signers = uniqueNames(names.map(text).filter(Boolean));
  const rows: string[] = [];

  for (let index = 0; index < signers.length; index += 2) {
    rows.push(tableRowXml(signatureCellXml(signers[index]) + (signers[index + 1] ? signatureCellXml(signers[index + 1]) : signatureCellXml(""))));
  }

  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr>${rows.join("")}</w:tbl>`;
}

type TemplateImage = {
  fieldName: string;
  fileName: string;
  relationshipId: string;
  contentType: "image/png" | "image/jpeg";
  extension: "png" | "jpg";
  bytes: Buffer;
  widthEmu: number;
  heightEmu: number;
};

function imageParagraphXml(image: TemplateImage) {
  const docPrId = image.relationshipId.replace(/\D/g, "") || "1";

  return `<w:p><w:r><w:drawing>
    <wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0">
      <wp:extent cx="${image.widthEmu}" cy="${image.heightEmu}"/>
      <wp:effectExtent l="0" t="0" r="0" b="0"/>
      <wp:docPr id="${docPrId}" name="${escapeXml(image.fieldName)}"/>
      <wp:cNvGraphicFramePr>
        <a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>
      </wp:cNvGraphicFramePr>
      <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:nvPicPr>
              <pic:cNvPr id="${docPrId}" name="${escapeXml(image.fileName)}"/>
              <pic:cNvPicPr/>
            </pic:nvPicPr>
            <pic:blipFill>
              <a:blip r:embed="${image.relationshipId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
              <a:stretch><a:fillRect/></a:stretch>
            </pic:blipFill>
            <pic:spPr>
              <a:xfrm><a:off x="0" y="0"/><a:ext cx="${image.widthEmu}" cy="${image.heightEmu}"/></a:xfrm>
              <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
            </pic:spPr>
          </pic:pic>
        </a:graphicData>
      </a:graphic>
    </wp:inline>
  </w:drawing></w:r></w:p>`;
}

function imageExtensionFromContentType(contentType?: string | null): TemplateImage["extension"] | null {
  const normalized = contentType?.toLowerCase() ?? "";
  if (normalized.includes("png")) return "png";
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  return null;
}

async function loadTemplateImage(
  fieldName: string,
  sourceUrl?: string | null,
  index = 1,
): Promise<TemplateImage | null> {
  const source = text(sourceUrl);

  if (!source || !/^https?:\/\//i.test(source)) {
    return null;
  }

  try {
    const response = await fetch(source, { cache: "no-store" });
    if (!response.ok) return null;

    const extension = imageExtensionFromContentType(response.headers.get("content-type"))
      ?? (source.toLowerCase().includes(".png") ? "png" : source.toLowerCase().match(/\.(?:jpg|jpeg)(?:$|[?#])/) ? "jpg" : null);

    if (!extension) return null;

    const bytes = Buffer.from(await response.arrayBuffer());
    const relationshipId = `rIdFinleyImage${index}`;

    return {
      fieldName,
      fileName: `${fieldName.replace(/[^a-z0-9_-]/gi, "_")}.${extension}`,
      relationshipId,
      contentType: extension === "png" ? "image/png" : "image/jpeg",
      extension,
      bytes,
      widthEmu: fieldName === "adviser.signatureImage" ? 1600000 : 1900000,
      heightEmu: fieldName === "adviser.signatureImage" ? 520000 : 700000,
    };
  } catch {
    return null;
  }
}

async function resolveTemplateImages(profile: ClientProfile) {
  const imageCandidates = [
    await loadTemplateImage("practice.logo", profile.adviser?.practiceLogo, 1),
    await loadTemplateImage("adviser.signatureImage", profile.adviser?.profilePhoto, 2),
  ];

  return imageCandidates.filter((image): image is TemplateImage => Boolean(image));
}

async function upsertImageParts(zip: JSZip, images: TemplateImage[]) {
  if (!images.length) return;

  const word = zip.folder("word");
  const media = word?.folder("media");

  images.forEach((image) => {
    media?.file(image.fileName, image.bytes);
  });

  const relsPath = "word/_rels/document.xml.rels";
  const existingRels = await zip.file(relsPath)?.async("string");
  const relationshipXml = images
    .map((image) => `<Relationship Id="${image.relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${image.fileName}"/>`)
    .join("");
  const nextRels = existingRels?.includes("</Relationships>")
    ? existingRels.replace("</Relationships>", `${relationshipXml}</Relationships>`)
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationshipXml}</Relationships>`;

  zip.file(relsPath, nextRels);

  const contentTypesPath = "[Content_Types].xml";
  const existingContentTypes = await zip.file(contentTypesPath)?.async("string");
  if (!existingContentTypes) return;

  let nextContentTypes = existingContentTypes;
  const needsPng = images.some((image) => image.extension === "png") && !nextContentTypes.includes('Extension="png"');
  const needsJpg = images.some((image) => image.extension === "jpg") && !nextContentTypes.includes('Extension="jpg"');
  const defaults = [
    needsPng ? '<Default Extension="png" ContentType="image/png"/>' : "",
    needsJpg ? '<Default Extension="jpg" ContentType="image/jpeg"/>' : "",
  ].join("");

  if (defaults) {
    nextContentTypes = nextContentTypes.replace("</Types>", `${defaults}</Types>`);
    zip.file(contentTypesPath, nextContentTypes);
  }
}

function sectionPropertiesXml() {
  return `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;
}

function baseDocumentXml(body: string) {
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

function defaultEngagementTemplateDocumentXml() {
  const body = [
    placeholderParagraphXml("document.date", { spacingAfter: 160 }),
    placeholderParagraphXml("client.addressee", { bold: true }),
    placeholderParagraphXml("html:client.addressBlock"),
    paragraphXml("Dear <<client.salutation>>,", { spacingBefore: 220, spacingAfter: 120 }),
    headingXml("Engagement Letter", 1),
    headingXml("Terms of Engagement", 2),
    paragraphXml("Further to our meeting and discussions, this document sets out to:", { spacingAfter: 80 }),
    bulletXml("Detail your service expectations and outcomes, specify the service deliverables."),
    bulletXml("Provide a fee estimate."),
    bulletXml("Explain our trading terms and method of billing, inform you of your next steps."),
    bulletXml("Provide general education information on the various financial concepts identified during our meeting."),
    paragraphXml(
      "An important part of our business philosophy is clear communication. We believe that it is essential that both you and your adviser have a clear understanding of the services to be provided, the expected outcomes, and the fees payable.",
      { spacingBefore: 160, spacingAfter: 120 },
    ),
    paragraphXml(
      "The world of finance, taxation and business advice has become more complex in recent years. Increasingly we find ourselves advising on and providing a far broader range of services than ever before. This document summarises the key elements of our future relationship so that your objectives are met and potential misunderstandings are avoided.",
      { spacingAfter: 160 },
    ),
    headingXml("Fee Estimate", 2),
    placeholderParagraphXml("engagement.feeEstimateTable"),
    headingXml("Initial Advice Service", 2),
    paragraphXml(
      "In order to achieve the outcomes and expectations for your particular circumstances, the services that we will deliver are summarised below.",
      { spacingAfter: 120 },
    ),
    paragraphXml("Reasons for seeking advice", { bold: true, spacingAfter: 80 }),
    placeholderParagraphXml("html:engagement.reasonsForSeekingAdvice"),
    paragraphXml("Tasks to be completed by us:", { bold: true, spacingAfter: 80 }),
    placeholderParagraphXml("html:engagement.tasksToBeCompleted"),
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
      "We ask that you sign this letter to confirm your understanding of these arrangements and to confirm our engagement as your advisers. Could you please return a copy of this engagement letter to <<practice.name>>. Alternatively, if you wish to further clarify any of the matters contained in this agreement, please contact your adviser.",
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
    placeholderParagraphXml("adviser.signatureBlock"),
    headingXml("Your Acknowledgement - Engagement Letter", 2),
    paragraphXml("You understand the engagement between you and <<practice.name>> will start on the date this agreement is signed.", { spacingAfter: 120 }),
    paragraphXml("You accept the services, fees and terms as outlined in this letter.", { spacingAfter: 160 }),
    placeholderParagraphXml("client.signatureBlock"),
  ].join("");

  return baseDocumentXml(body);
}

async function createDocxFromDocumentXml(documentXml: string) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES_XML);
  zip.folder("_rels")?.file(".rels", ROOT_RELS_XML);
  zip.folder("word")?.file("document.xml", documentXml);
  zip.folder("word")?.file("styles.xml", stylesXml(activeDocumentStyle));
  zip.folder("word")?.folder("_rels")?.file("document.xml.rels", DOCUMENT_RELS_XML);

  return Buffer.from(await zip.generateAsync({ type: "uint8array", mimeType: DOCX_MIME_TYPE }));
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

function replaceImageFieldWithEmpty(xml: string, fieldName: string) {
  return replaceBlockField(replaceInlineField(xml, fieldName, ""), fieldName, "");
}

function buildTemplateModel(profile: ClientProfile, draft: EngagementLetterTemplateInput) {
  const clientName = getClientName(profile);
  const clientSignatureName = text(profile.client?.name) || clientName;
  const partnerSignatureName = text(profile.partner?.name);
  const adviserName = text(profile.adviser?.name) || "<<adviser.name>>";
  const practiceName = text(profile.adviser?.practice?.name) || text(profile.practice) || "<<practice>>";
  const licenseeName = text(profile.adviser?.licensee?.name) || text(profile.licensee);
  const addressLines = personAddress(profile.client);
  const advicePreparationFee = parseCurrencyAmount(draft.advicePreparationFee);
  const implementationFee = parseCurrencyAmount(draft.implementationFee);
  const reasonsXml = stripHtml(draft.reasonsHtml)
    ? htmlToParagraphs(draft.reasonsHtml)
    : defaultReasonsXml(adviserName);
  const servicesXml = stripHtml(draft.servicesHtml)
    ? htmlToParagraphs(draft.servicesHtml)
    : [
        "Review and confirm your personal circumstances, goals and advice needs.",
        "Prepare initial advice recommendations for your review.",
        "Discuss the advice, costs and next steps with you before implementation.",
      ]
        .map(bulletXml)
        .join("");

  return {
    inline: {
      ...buildProfileScalarTemplateFields(profile),
      "document.date": formatDate(),
      "client.addressee": clientName,
      "client.salutation": salutationName(clientName),
      "adviser.name": adviserName,
      "practice.name": practiceName,
      "practice.licenseeName": licenseeName,
    },
    blocks: {
      "client.addressBlock": addressLines.map((line) => paragraphXml(line)).join(""),
      "client.signatureBlock": signatureTableXml([clientSignatureName, partnerSignatureName]),
      "engagement.reasonsForSeekingAdvice": reasonsXml,
      "engagement.tasksToBeCompleted": servicesXml,
      "engagement.feeEstimateTable": feeEstimateTableXml(advicePreparationFee, implementationFee),
      "engagement.clientAcknowledgementSignatures": signatureTableXml([clientSignatureName, partnerSignatureName]),
      "adviser.signatureBlock": [
        paragraphXml("Yours sincerely,", { spacingAfter: 180 }),
        paragraphXml(adviserName, { bold: true }),
        paragraphXml(practiceName),
        licenseeName ? paragraphXml(licenseeName) : "",
      ].join(""),
    },
    imageFields: ["practice.logo", "practice.letterhead", "practice.footer", "adviser.signatureImage"],
  };
}

async function mergeTemplateBuffer(templateBuffer: Buffer, profile: ClientProfile, draft: EngagementLetterTemplateInput) {
  const zip = await JSZip.loadAsync(templateBuffer);
  const model = buildTemplateModel(profile, draft);
  const images = await resolveTemplateImages(profile);

  await upsertImageParts(zip, images);

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
          const image = file.name === "word/document.xml"
            ? images.find((candidate) => candidate.fieldName === fieldName)
            : null;
          xml = image ? replaceBlockField(xml, fieldName, imageParagraphXml(image)) : replaceImageFieldWithEmpty(xml, fieldName);
        }

        if (extractFinleyTemplateFieldsFromXml(xml).length) {
          xml = `${xml.replace("</w:body>", `${paragraphXml(TEMPLATE_PLACEHOLDER_WARNING, { italic: true })}</w:body>`)}`;
        }

        zip.file(file.name, xml);
      }),
  );

  zip.folder("word")?.file("styles.xml", stylesXml(activeDocumentStyle));

  return Buffer.from(await zip.generateAsync({ type: "uint8array", mimeType: DOCX_MIME_TYPE }));
}

async function buildDefaultEngagementTemplateDocx(style?: Partial<DocumentStyleProfile> | null) {
  activeDocumentStyle = normalizeDocumentStyleProfile(style);
  return createDocxFromDocumentXml(defaultEngagementTemplateDocumentXml());
}

function resolveLicenseeId(profile: ClientProfile) {
  return text(profile.adviser?.licensee?.id) || text(profile.licensee);
}

export async function buildEngagementLetterTemplateSampleDocx() {
  return buildDefaultEngagementTemplateDocx(DEFAULT_DOCUMENT_STYLE_PROFILE);
}

export async function renderEngagementLetterTemplateDocx(
  profile: ClientProfile,
  draft: EngagementLetterTemplateInput = {},
) {
  activeDocumentStyle = normalizeDocumentStyleProfile(draft.documentStyleProfile);
  const licenseeTemplate = await readLicenseeFinleyTemplate("engagement-letter", resolveLicenseeId(profile));
  const appDefaultTemplate = licenseeTemplate ? null : await readAppDefaultFinleyTemplate("engagement-letter");
  const templateBuffer =
    licenseeTemplate?.content ?? appDefaultTemplate?.content ?? await buildDefaultEngagementTemplateDocx(activeDocumentStyle);

  return mergeTemplateBuffer(templateBuffer, profile, draft);
}

export async function validateEngagementLetterTemplateSample() {
  const sample = await buildEngagementLetterTemplateSampleDocx();
  return validateFinleyTemplateDocx("engagement-letter", sample);
}

export function buildEngagementLetterTemplateOutputName(profile: ClientProfile) {
  return `${sanitizeFilename(getClientName(profile)) || "Client"}-Engagement-Letter.docx`;
}
