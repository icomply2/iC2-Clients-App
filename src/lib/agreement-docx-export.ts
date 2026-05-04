import JSZip from "jszip";
import type { ClientProfile, PersonRecord } from "@/lib/api/types";
import {
  DEFAULT_DOCUMENT_STYLE_PROFILE,
  getDocumentWordFontFamily,
  getWordHexColor,
  normalizeDocumentStyleProfile,
  type DocumentStyleProfile,
} from "@/lib/documents/document-style-profile";
import { DEFAULT_SERVICE_AGREEMENT_SERVICES, groupServiceAgreementServices } from "@/lib/documents/document-sections";

export type StandaloneAgreementType = "ongoing" | "annual";

export type StandaloneAgreementDocxInput = {
  agreementType?: StandaloneAgreementType | null;
  adviserName?: string | null;
  practiceName?: string | null;
  licenseeName?: string | null;
  services?: string[] | null;
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

function feeTableXml() {
  const headerFill = activeTableHeaderFill();

  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="D7E1EC"/><w:left w:val="single" w:sz="4" w:color="D7E1EC"/><w:bottom w:val="single" w:sz="4" w:color="D7E1EC"/><w:right w:val="single" w:sz="4" w:color="D7E1EC"/><w:insideH w:val="single" w:sz="4" w:color="D7E1EC"/><w:insideV w:val="single" w:sz="4" w:color="D7E1EC"/></w:tblBorders></w:tblPr>
    ${tableRowXml(
      tableCellXml("Entity", { widthPct: 25, bold: true, fill: headerFill })
        + tableCellXml("Product", { widthPct: 25, bold: true, fill: headerFill })
        + tableCellXml("Fee amount", { widthPct: 20, bold: true, fill: headerFill })
        + tableCellXml("Frequency", { widthPct: 15, bold: true, fill: headerFill })
        + tableCellXml("Annual fee", { widthPct: 15, bold: true, fill: headerFill, align: "right" }),
    )}
    ${tableRowXml(
      tableCellXml("To be confirmed", { widthPct: 25 })
        + tableCellXml("To be confirmed", { widthPct: 25 })
        + tableCellXml("$0.00", { widthPct: 20 })
        + tableCellXml("Monthly", { widthPct: 15 })
        + tableCellXml("$0.00", { widthPct: 15, align: "right" }),
    )}
    ${tableRowXml(
      tableCellXml("Total annual advice fees", { widthPct: 85, bold: true, fill: headerFill })
        + tableCellXml("$0.00", { widthPct: 15, bold: true, fill: headerFill, align: "right" }),
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

function buildDocumentXml(profile: ClientProfile, input: StandaloneAgreementDocxInput = {}) {
  const clientName = personName(profile);
  const clientFirstName = firstName(profile.client?.name || clientName);
  const agreementType = input.agreementType === "annual" ? "annual" : "ongoing";
  const title = agreementType === "annual" ? "Annual Advice Agreement" : "Ongoing Service Agreement";
  const adviserName = text(input.adviserName) || text(profile.adviser?.name) || "<<adviser.name>>";
  const practiceName = text(input.practiceName) || text(profile.practice) || text(profile.adviser?.practice?.name) || "<<practice.name>>";
  const licenseeName = text(input.licenseeName) || text(profile.licensee) || text(profile.adviser?.licensee?.name) || "<<licensee.name>>";
  const signatureNames = [profile.client?.name, profile.partner?.name].filter(Boolean) as string[];
  const addressLines = personAddressLines(profile.client);

  const opening =
    agreementType === "annual"
      ? [
          "As your Financial Adviser, it is our role to provide you with the advice you need to achieve your financial goals. The purpose of this letter is to establish an Annual Advice Agreement.",
          "The services you receive as part of your Annual Advice Agreement are important as they offer support to help you stay on track. The terms of the Annual Advice Agreement, including the services you are entitled to and the cost, are set out below.",
          `This arrangement will be between ${clientName} and ${practiceName}. The arrangement will commence on the date you sign this agreement.`,
        ]
      : [
          "As your Financial Adviser, it is our role to provide you with the advice you need to achieve your financial goals. This Ongoing Service Agreement sets out the terms and conditions of our services.",
          "We cannot enter into an Ongoing Service Agreement without this agreement and the relevant fee consent being signed and dated by you. Your ongoing fee arrangement will need to be renewed annually.",
          "The commencement date of this arrangement is the date you sign this agreement. Upon signing this agreement, any existing service agreement between us is deemed to be automatically terminated and replaced by this agreement.",
        ];

  const body = [
    paragraphXml(formatToday(), { spacingAfter: 220 }),
    paragraphXml(clientName, { bold: true, spacingAfter: 0 }),
    ...addressLines.map((line) => paragraphXml(line, { spacingAfter: 0 })),
    paragraphXml(`Dear ${clientFirstName},`, { spacingAfter: 180 }),
    headingXml(title),
    ...opening.map((paragraph) => paragraphXml(paragraph, { spacingAfter: 160 })),
    headingXml(agreementType === "annual" ? "My Annual Advice Service Includes" : "The Services You Are Entitled To Receive", 2),
    servicesXml(input.services?.filter(Boolean) ?? DEFAULT_SERVICE_AGREEMENT_SERVICES),
    headingXml("Fees Payable", 2),
    paragraphXml("The fees payable for this agreement are set out below. All fees include GST where applicable.", { spacingAfter: 160 }),
    feeTableXml(),
    headingXml("Consent To Deduct Fees From Your Account", 2),
    paragraphXml("By signing this consent, you authorise the agreed advice fees to be deducted from the nominated account for the services described in this agreement.", { spacingAfter: 160 }),
    paragraphXml("This consent may be withdrawn by you at any time by notifying us in writing.", { spacingAfter: 160 }),
    headingXml(agreementType === "annual" ? "Next Steps" : "Your Acknowledgement", 2),
    paragraphXml(
      agreementType === "annual"
        ? "Please sign the acknowledgement below and accept the Annual Advice Agreement outlined in this letter."
        : "You agree to be bound by the terms and conditions of this agreement. You may terminate or vary the agreement at any time by notifying us in writing.",
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

  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES_XML);
  zip.folder("_rels")?.file(".rels", ROOT_RELS_XML);
  const word = zip.folder("word");
  word?.file("document.xml", buildDocumentXml(profile, input));
  word?.file("styles.xml", stylesXml(activeDocumentStyle));
  word?.folder("_rels")?.file("document.xml.rels", DOCUMENT_RELS_XML);

  return zip.generateAsync({
    type: "arraybuffer",
    mimeType: DOCX_MIME_TYPE,
    compression: "DEFLATE",
  });
}
