import JSZip from "jszip";
import type { ClientProfile, PersonRecord } from "@/lib/api/types";
import {
  DEFAULT_DOCUMENT_STYLE_PROFILE,
  getDocumentWordFontFamily,
  getWordHexColor,
  normalizeDocumentStyleProfile,
  type DocumentStyleProfile,
} from "@/lib/documents/document-style-profile";

export type InvoiceDocxItem = {
  description?: string | null;
  quantity?: string | null;
  priceExGst?: string | null;
  totalGst?: string | null;
};

export type InvoiceDocxInput = {
  referenceNumber?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  adviserName?: string | null;
  serviceType?: string | null;
  clientEntityId?: string | null;
  dueDate?: string | null;
  licenseeName?: string | null;
  licenseeAddress?: string | null;
  licenseeSuburb?: string | null;
  licenseeState?: string | null;
  licenseePostcode?: string | null;
  licenseeBsb?: string | null;
  licenseeAccount?: string | null;
  practiceLogo?: string | null;
  licenseeLogo?: string | null;
  includeStripePaymentLink?: boolean | null;
  hostedPaymentUrl?: string | null;
  items?: InvoiceDocxItem[] | null;
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
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="gif" ContentType="image/gif"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

function documentRelsXml(logoExtension?: string | null) {
  const logoRelationship = logoExtension
    ? `  <Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/invoice-logo.${logoExtension}"/>
`
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
${logoRelationship}</Relationships>`;
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

function text(value?: string | null) {
  return value?.trim() ?? "";
}

function sanitizeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim();
}

function personAddress(person?: PersonRecord | null) {
  const street = text(person?.street) || text(person?.addressStreet) || text(person?.address?.street) || text(person?.address?.line1);
  const suburb = text(person?.suburb) || text(person?.addressSuburb) || text(person?.address?.suburb) || text(person?.address?.city);
  const state = text(person?.state) || text(person?.addressState) || text(person?.address?.state) || text(person?.address?.region);
  const postcode =
    text(person?.postCode) || text(person?.postcode) || text(person?.addressPostCode) || text(person?.address?.postCode) || text(person?.address?.postcode);

  return {
    street,
    locality: [suburb, state, postcode].filter(Boolean).join(" "),
  };
}

function parseNumber(value?: string | null) {
  const numeric = Number(text(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value?: string | null) {
  const raw = text(value);
  const parsed = raw ? new Date(raw) : new Date();

  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function parseImageDataUrl(value?: string | null) {
  const raw = text(value);

  if (!raw) {
    return null;
  }

  const match = raw.match(/^data:(image\/(?:png|jpeg|jpg|gif));base64,(.+)$/i);
  const base64 = match?.[2] ?? (/^[A-Za-z0-9+/=\s]+$/.test(raw) ? raw : "");

  if (!base64) {
    return null;
  }

  const mimeType = (match?.[1] ?? "image/png").toLowerCase().replace("image/jpg", "image/jpeg");
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.replace("image/", "");

  return {
    bytes: Uint8Array.from(Buffer.from(base64.replace(/\s+/g, ""), "base64")),
    extension,
  };
}

type ParagraphOptions = {
  align?: "left" | "center" | "right";
  bold?: boolean;
  color?: string;
  fontSize?: number;
  spacingAfter?: number;
  spacingBefore?: number;
};

function runXml(value: string, options: ParagraphOptions = {}) {
  const color = getWordHexColor(options.color, `#${activeBodyColor()}`);
  const bold = options.bold ? "<w:b/>" : "";
  const size = options.fontSize ?? BODY_FONT_SIZE;

  return `<w:r><w:rPr><w:rFonts w:ascii="${activeFontFamily()}" w:hAnsi="${activeFontFamily()}"/>${bold}<w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r>`;
}

function paragraphXml(value: string, options: ParagraphOptions = {}) {
  const align = options.align ? `<w:jc w:val="${options.align}"/>` : "";
  const before = options.spacingBefore ?? 0;
  const after = options.spacingAfter ?? 0;

  return `<w:p><w:pPr>${align}<w:spacing w:before="${before}" w:after="${after}"/></w:pPr>${runXml(value, options)}</w:p>`;
}

function headingXml(value: string) {
  return paragraphXml(value, {
    bold: true,
    color: `#${activeHeadingColor()}`,
    fontSize: 40,
    spacingAfter: 220,
  });
}

function logoXml() {
  return `<w:p><w:pPr><w:jc w:val="right"/><w:spacing w:after="220"/></w:pPr><w:r><w:drawing>
    <wp:inline distT="0" distB="0" distL="0" distR="0">
      <wp:extent cx="2286000" cy="914400"/>
      <wp:effectExtent l="0" t="0" r="0" b="0"/>
      <wp:docPr id="1" name="Practice logo"/>
      <wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>
      <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:nvPicPr>
              <pic:cNvPr id="0" name="Practice logo"/>
              <pic:cNvPicPr/>
            </pic:nvPicPr>
            <pic:blipFill>
              <a:blip r:embed="rIdLogo"/>
              <a:stretch><a:fillRect/></a:stretch>
            </pic:blipFill>
            <pic:spPr>
              <a:xfrm><a:off x="0" y="0"/><a:ext cx="2286000" cy="914400"/></a:xfrm>
              <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
            </pic:spPr>
          </pic:pic>
        </a:graphicData>
      </a:graphic>
    </wp:inline>
  </w:drawing></w:r></w:p>`;
}

function tableCellXml(content: string, options: { align?: "left" | "right"; fill?: string; bold?: boolean; widthPct?: number } = {}) {
  const fill = options.fill ? `<w:shd w:fill="${getWordHexColor(options.fill, `#${activeTableHeaderFill()}`)}"/>` : "";
  const width = options.widthPct ? `<w:tcW w:w="${Math.round(options.widthPct * 50)}" w:type="pct"/>` : "";

  return `<w:tc><w:tcPr>${width}${fill}<w:tcMar><w:top w:w="120" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar></w:tcPr>${paragraphXml(content, { align: options.align, bold: options.bold })}</w:tc>`;
}

function tableCellBlockXml(content: string, options: { widthPct?: number } = {}) {
  const width = options.widthPct ? `<w:tcW w:w="${Math.round(options.widthPct * 50)}" w:type="pct"/>` : "";

  return `<w:tc><w:tcPr>${width}<w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar></w:tcPr>${content}</w:tc>`;
}

function tableRowXml(cells: string) {
  return `<w:tr>${cells}</w:tr>`;
}

function invoicePartyTableXml({
  clientName,
  address,
  clientEmail,
  practiceName,
  licenseeName,
  adviserName,
  clientEntityId,
}: {
  clientName: string;
  address: ReturnType<typeof personAddress>;
  clientEmail: string;
  practiceName: string;
  licenseeName: string;
  adviserName: string;
  clientEntityId: string;
}) {
  const billToBlock = [
    paragraphXml("Bill to", { bold: true, color: `#${activeHeadingColor()}`, spacingAfter: 60 }),
    paragraphXml(clientName, { bold: true }),
    address.street ? paragraphXml(address.street) : "",
    address.locality ? paragraphXml(address.locality) : "",
    clientEmail ? paragraphXml(clientEmail) : "",
  ].join("");
  const fromBlock = [
    paragraphXml("From", { bold: true, color: `#${activeHeadingColor()}`, spacingAfter: 60 }),
    practiceName ? paragraphXml(practiceName, { bold: true }) : "",
    licenseeName ? paragraphXml(licenseeName) : "",
    adviserName ? paragraphXml(`Adviser: ${adviserName}`) : "",
    clientEntityId ? paragraphXml(`Client entity ID: ${clientEntityId}`) : "",
  ].join("");

  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr>${tableRowXml(
    tableCellBlockXml(billToBlock, { widthPct: 50 }) + tableCellBlockXml(fromBlock, { widthPct: 50 }),
  )}</w:tbl>`;
}

function normaliseInvoiceItems(items?: InvoiceDocxItem[] | null) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => text(item.description) || text(item.quantity) || text(item.priceExGst) || text(item.totalGst))
    .map((item) => {
      const quantity = parseNumber(item.quantity) || 1;
      const unitPrice = parseNumber(item.priceExGst);
      const subtotal = quantity * unitPrice;
      const gst = subtotal * 0.1;
      const enteredTotal = parseNumber(item.totalGst);
      const total = enteredTotal > 0 ? enteredTotal : subtotal + gst;

      return {
        description: text(item.description) || "Advice services",
        quantity,
        unitPrice,
        gst,
        total,
      };
    });
}

function invoiceTableXml(items: ReturnType<typeof normaliseInvoiceItems>) {
  const rows = items.length
    ? items
        .map((item) =>
          tableRowXml(
            tableCellXml(item.description, { widthPct: 42 }) +
              tableCellXml(String(item.quantity), { align: "right", widthPct: 12 }) +
              tableCellXml(formatCurrency(item.unitPrice), { align: "right", widthPct: 16 }) +
              tableCellXml(formatCurrency(item.gst), { align: "right", widthPct: 14 }) +
              tableCellXml(formatCurrency(item.total), { align: "right", widthPct: 16 }),
          ),
        )
        .join("")
    : tableRowXml(tableCellXml("No invoice line items have been added.") + tableCellXml("") + tableCellXml("") + tableCellXml("") + tableCellXml(""));
  const total = items.reduce((sum, item) => sum + item.total, 0);

  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="D7E0EC"/><w:left w:val="single" w:sz="4" w:color="D7E0EC"/><w:bottom w:val="single" w:sz="4" w:color="D7E0EC"/><w:right w:val="single" w:sz="4" w:color="D7E0EC"/><w:insideH w:val="single" w:sz="4" w:color="D7E0EC"/><w:insideV w:val="single" w:sz="4" w:color="D7E0EC"/></w:tblBorders></w:tblPr>
    ${tableRowXml(
      tableCellXml("Description", { fill: `#${activeTableHeaderFill()}`, bold: true }) +
        tableCellXml("Qty", { fill: `#${activeTableHeaderFill()}`, bold: true, align: "right" }) +
        tableCellXml("Unit price", { fill: `#${activeTableHeaderFill()}`, bold: true, align: "right" }) +
        tableCellXml("GST", { fill: `#${activeTableHeaderFill()}`, bold: true, align: "right" }) +
        tableCellXml("Total", { fill: `#${activeTableHeaderFill()}`, bold: true, align: "right" }),
    )}
    ${rows}
    ${tableRowXml(
      tableCellXml("Total", { fill: `#${activeTableHeaderFill()}`, bold: true }) +
        tableCellXml("", { fill: `#${activeTableHeaderFill()}` }) +
        tableCellXml("", { fill: `#${activeTableHeaderFill()}` }) +
        tableCellXml("", { fill: `#${activeTableHeaderFill()}` }) +
        tableCellXml(formatCurrency(total), { fill: `#${activeTableHeaderFill()}`, bold: true, align: "right" }),
    )}
  </w:tbl>`;
}

function invoicePaymentDetailsXml({
  dueDate,
  invoiceNumber,
  licenseeName,
  bsb,
  account,
  includeStripePaymentLink,
  hostedPaymentUrl,
}: {
  dueDate: string;
  invoiceNumber: string;
  licenseeName: string;
  bsb: string;
  account: string;
  includeStripePaymentLink: boolean;
  hostedPaymentUrl: string;
}) {
  return [
    paragraphXml(`Due Date: ${dueDate}`, { bold: true, spacingBefore: 260 }),
    paragraphXml("Please quote invoice number as reference on payment.", { spacingAfter: 160 }),
    paragraphXml(licenseeName || "<<licensee>>"),
    paragraphXml(`BSB: ${bsb || "<<bsb>>"}`),
    paragraphXml(`ACC: ${account || "<<account>>"}`),
    paragraphXml("Please use Invoice Number for Reference", { spacingAfter: 160 }),
    includeStripePaymentLink
      ? paragraphXml(`Card payment link: ${hostedPaymentUrl || "<<hosted_url>>"}`, { spacingAfter: 160 })
      : "",
    paragraphXml(`Payment reference: ${invoiceNumber || "<<invnumber>>"}`, { spacingAfter: 260 }),
  ].join("");
}

function paymentAdviceTableXml({
  clientName,
  invoiceNumber,
  amountDue,
  dueDate,
}: {
  clientName: string;
  invoiceNumber: string;
  amountDue: string;
  dueDate: string;
}) {
  return `<w:tbl><w:tblPr><w:tblW w:w="2600" w:type="pct"/><w:tblBorders><w:bottom w:val="single" w:sz="4" w:color="D7E0EC"/><w:insideH w:val="single" w:sz="4" w:color="D7E0EC"/></w:tblBorders></w:tblPr>
    ${tableRowXml(tableCellXml("Customer", { widthPct: 42 }) + tableCellXml(clientName, { widthPct: 58 }))}
    ${tableRowXml(tableCellXml("Invoice Number", { widthPct: 42 }) + tableCellXml(invoiceNumber || "<<invnumber>>", { widthPct: 58 }))}
    ${tableRowXml(tableCellXml("Amount Due", { widthPct: 42 }) + tableCellXml(amountDue, { widthPct: 58 }))}
    ${tableRowXml(tableCellXml("Due Date", { widthPct: 42 }) + tableCellXml(dueDate, { widthPct: 58 }))}
  </w:tbl>`;
}

function paymentAdviceXml({
  clientName,
  invoiceNumber,
  amountDue,
  dueDate,
  licenseeName,
  licenseeAddress,
  licenseeLocality,
}: {
  clientName: string;
  invoiceNumber: string;
  amountDue: string;
  dueDate: string;
  licenseeName: string;
  licenseeAddress: string;
  licenseeLocality: string;
}) {
  const addressBlock = [
    paragraphXml("To:", { spacingAfter: 0 }),
    paragraphXml(licenseeName || "<<licensee>>", { spacingAfter: 0 }),
    paragraphXml(licenseeAddress || "<<licenseeaddress>>", { spacingAfter: 0 }),
    licenseeLocality ? paragraphXml(licenseeLocality, { spacingAfter: 0 }) : "",
  ].join("");

  return [
    paragraphXml("- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -", {
      spacingBefore: 280,
      spacingAfter: 120,
    }),
    paragraphXml("PAYMENT ADVICE", { fontSize: 48, color: "000000", spacingAfter: 120 }),
    addressBlock,
    paymentAdviceTableXml({ clientName, invoiceNumber, amountDue, dueDate }),
  ].join("");
}

function sectionPropertiesXml() {
  return `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;
}

function buildDocumentXml(profile: ClientProfile, input: InvoiceDocxInput, hasLogo: boolean) {
  const client = profile.client ?? null;
  const address = personAddress(client);
  const clientName = text(input.clientName) || text(client?.name) || "Client";
  const adviserName = text(input.adviserName) || text(profile.adviser?.name);
  const practiceName = text(profile.adviser?.practice?.name) || text(profile.practice);
  const licenseeName = text(input.licenseeName) || text(profile.adviser?.licensee?.name) || text(profile.licensee);
  const licenseeLocality = [text(input.licenseeSuburb), text(input.licenseeState), text(input.licenseePostcode)].filter(Boolean).join(" ");
  const items = normaliseInvoiceItems(input.items);
  const invoiceNumber = text(input.referenceNumber) || "-";
  const dueDate = formatDate(input.dueDate);
  const totalAmount = formatCurrency(items.reduce((sum, item) => sum + item.total, 0));

  const body = [
    hasLogo ? logoXml() : "",
    headingXml("Tax Invoice"),
    paragraphXml(`Invoice number: ${invoiceNumber}`, { bold: true }),
    paragraphXml(`Date: ${formatDate()}`),
    paragraphXml(`Due date: ${dueDate}`, { spacingAfter: 220 }),
    invoicePartyTableXml({
      clientName,
      address,
      clientEmail: text(input.clientEmail),
      practiceName,
      licenseeName,
      adviserName,
      clientEntityId: text(input.clientEntityId),
    }),
    text(input.serviceType) ? paragraphXml(`Service type: ${text(input.serviceType)}`, { spacingAfter: 220 }) : paragraphXml("", { spacingAfter: 220 }),
    invoiceTableXml(items),
    invoicePaymentDetailsXml({
      dueDate,
      invoiceNumber,
      licenseeName,
      bsb: text(input.licenseeBsb),
      account: text(input.licenseeAccount),
      includeStripePaymentLink: Boolean(input.includeStripePaymentLink),
      hostedPaymentUrl: text(input.hostedPaymentUrl),
    }),
    paymentAdviceXml({
      clientName,
      invoiceNumber,
      amountDue: totalAmount,
      dueDate,
      licenseeName,
      licenseeAddress: text(input.licenseeAddress),
      licenseeLocality,
    }),
    paragraphXml("Thank you for your business.", { spacingBefore: 260 }),
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

export function buildInvoiceOutputName(profile: ClientProfile) {
  const primaryName = text(profile.client?.name) || "Client";
  return `${sanitizeFilename(primaryName) || "Client"}-Invoice.docx`;
}

export async function renderInvoiceDocx(profile: ClientProfile, invoice: InvoiceDocxInput = {}) {
  activeDocumentStyle = normalizeDocumentStyleProfile(invoice.documentStyleProfile);
  const logo = parseImageDataUrl(invoice.practiceLogo || profile.adviser?.practiceLogo || invoice.licenseeLogo);
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES_XML);
  zip.folder("_rels")?.file(".rels", ROOT_RELS_XML);
  zip.folder("word")?.file("document.xml", buildDocumentXml(profile, invoice, Boolean(logo)));
  zip.folder("word")?.file("styles.xml", stylesXml(activeDocumentStyle));
  zip.folder("word")?.folder("_rels")?.file("document.xml.rels", documentRelsXml(logo?.extension));

  if (logo) {
    zip.folder("word")?.folder("media")?.file(`invoice-logo.${logo.extension}`, logo.bytes);
  }

  return zip.generateAsync({ type: "uint8array", mimeType: DOCX_MIME_TYPE });
}
