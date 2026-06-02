import JSZip from "jszip";
import type {
  ClientEmploymentRecord,
  ClientProfile,
  PersonRecord,
} from "@/lib/api/types";
import {
  DEFAULT_DOCUMENT_STYLE_PROFILE,
  getDocumentWordFontFamily,
  getWordHexColor,
  normalizeDocumentStyleProfile,
  type DocumentStyleProfile,
} from "@/lib/documents/document-style-profile";

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const BODY_FONT_SIZE = 20;
let activeDocumentStyle = DEFAULT_DOCUMENT_STYLE_PROFILE;

type EmploymentSourceRecord = NonNullable<PersonRecord["employment"]>[number] | ClientEmploymentRecord;

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
        <w:spacing w:after="80"/>
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

function text(value?: string | number | boolean | null) {
  return value == null ? "" : String(value).trim();
}

function firstText(...values: Array<string | null | undefined>) {
  return values.map(text).find(Boolean) ?? "";
}

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

function sanitizeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim();
}

function clientNames(profile: ClientProfile) {
  return [profile.client?.name, profile.partner?.name].map(text).filter(Boolean).join(" & ") || "Client";
}

function formatDate(value?: string | null) {
  const raw = text(value);
  if (!raw) return "";

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }

  const slashMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, "0");
    const month = slashMatch[2].padStart(2, "0");
    const year = slashMatch[3].length === 2 ? `${Number(slashMatch[3]) >= 50 ? "19" : "20"}${slashMatch[3]}` : slashMatch[3];
    return `${day}/${month}/${year}`;
  }

  return raw;
}

function numberValue(value?: string | number | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(text(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value?: string | number | null) {
  const raw = text(value);
  if (!raw) return "";

  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numberValue(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function frequency(value?: { type?: string | null; value?: string | null } | string | null) {
  return typeof value === "string" ? text(value) : firstText(value?.value, value?.type);
}

function personAddress(person?: PersonRecord | null) {
  const street = firstText(person?.street, person?.addressStreet, person?.address?.street, person?.address?.line1);
  const suburb = firstText(person?.suburb, person?.addressSuburb, person?.address?.suburb, person?.address?.city);
  const state = firstText(person?.state, person?.addressState, person?.address?.state, person?.address?.region);
  const postCode = firstText(person?.postCode, person?.postcode, person?.addressPostCode, person?.address?.postCode, person?.address?.postcode);

  return [street, suburb, [state, postCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

function preferredPhone(person?: PersonRecord | null) {
  return firstText(person?.preferredPhone, person?.contact?.preferredPhone, person?.mobile, person?.mobilePhone, person?.phone, person?.contact?.phone);
}

function ageFromDate(value?: string | null) {
  const raw = text(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";

  const today = new Date();
  let age = today.getFullYear() - Number(match[1]);
  const monthDelta = today.getMonth() + 1 - Number(match[2]);
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < Number(match[3]))) age -= 1;
  return age >= 0 ? String(age) : "";
}

function paragraphXml(
  value: string,
  options: { bold?: boolean; size?: number; color?: string; spacingAfter?: number; align?: "left" | "center" | "right" } = {},
) {
  const align = options.align && options.align !== "left" ? `<w:jc w:val="${options.align}"/>` : "";
  const spacing = `<w:spacing w:after="${options.spacingAfter ?? 80}"/>`;
  const bold = options.bold ? "<w:b/>" : "";
  const color = `<w:color w:val="${options.color ?? activeBodyColor()}"/>`;
  const size = `<w:sz w:val="${options.size ?? BODY_FONT_SIZE}"/><w:szCs w:val="${options.size ?? BODY_FONT_SIZE}"/>`;
  const font = `<w:rFonts w:ascii="${activeFontFamily()}" w:hAnsi="${activeFontFamily()}"/>`;

  return `<w:p><w:pPr>${spacing}${align}</w:pPr><w:r><w:rPr>${font}${bold}${color}${size}</w:rPr><w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r></w:p>`;
}

function headingXml(value: string, level: 1 | 2 = 1) {
  return paragraphXml(value, {
    bold: true,
    size: level === 1 ? 32 : 24,
    color: activeHeadingColor(),
    spacingAfter: level === 1 ? 180 : 120,
  });
}

function cellXml(value: string, options: { header?: boolean; width?: number } = {}) {
  const fill = options.header ? `<w:shd w:fill="${activeTableHeaderFill()}"/>` : "";
  const bold = options.header ? "<w:b/>" : "";
  const color = options.header ? "FFFFFF" : activeBodyColor();
  const width = options.width ? `<w:tcW w:w="${options.width}" w:type="pct"/>` : "";

  return `<w:tc><w:tcPr>${width}${fill}<w:tcMar><w:top w:w="90" w:type="dxa"/><w:left w:w="110" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:r><w:rPr><w:rFonts w:ascii="${activeFontFamily()}" w:hAnsi="${activeFontFamily()}"/>${bold}<w:color w:val="${color}"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r></w:p></w:tc>`;
}

function cellParagraphsXml(
  paragraphs: string[],
  options: { header?: boolean; width?: number } = {},
) {
  const fill = options.header ? `<w:shd w:fill="${activeTableHeaderFill()}"/>` : "";
  const bold = options.header ? "<w:b/>" : "";
  const color = options.header ? "FFFFFF" : activeBodyColor();
  const width = options.width ? `<w:tcW w:w="${options.width}" w:type="pct"/>` : "";
  const paragraphNodes = (paragraphs.length ? paragraphs : [""]).map(
    (paragraph) =>
      `<w:p><w:r><w:rPr><w:rFonts w:ascii="${activeFontFamily()}" w:hAnsi="${activeFontFamily()}"/>${bold}<w:color w:val="${color}"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">${escapeXml(paragraph)}</w:t></w:r></w:p>`,
  );

  return `<w:tc><w:tcPr>${width}${fill}<w:tcMar><w:top w:w="90" w:type="dxa"/><w:left w:w="110" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tcMar></w:tcPr>${paragraphNodes.join("")}</w:tc>`;
}

function tableXml(headers: string[], rows: string[][]) {
  if (!rows.length) {
    return paragraphXml("No records recorded.", { spacingAfter: 160 });
  }

  const width = Math.floor(5000 / Math.max(headers.length, 1));
  const headerXml = `<w:tr>${headers.map((header) => cellXml(header, { header: true, width })).join("")}</w:tr>`;
  const rowsXml = rows
    .map((row) => `<w:tr>${headers.map((_, index) => cellXml(row[index] ?? "", { width })).join("")}</w:tr>`)
    .join("");

  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="D7DEE7"/><w:left w:val="single" w:sz="4" w:color="D7DEE7"/><w:bottom w:val="single" w:sz="4" w:color="D7DEE7"/><w:right w:val="single" w:sz="4" w:color="D7DEE7"/><w:insideH w:val="single" w:sz="4" w:color="E5EAF0"/><w:insideV w:val="single" w:sz="4" w:color="E5EAF0"/></w:tblBorders></w:tblPr>${headerXml}${rowsXml}</w:tbl>${paragraphXml("", { spacingAfter: 120 })}`;
}

function detailTable(title: string, rows: Array<[string, string]>) {
  return [
    headingXml(title, 2),
    tableXml(
      ["Field", "Value"],
      rows.map(([label, value]) => [label, value]),
    ),
  ].join("");
}

function personDetailRows(person?: PersonRecord | null): Array<[string, string]> {
  if (!person) return [];

  return [
    ["Name", text(person.name)],
    ["Email", text(person.email)],
    ["Preferred Phone", preferredPhone(person)],
    ["Date of Birth", formatDate(person.dob)],
    ["Age", ageFromDate(person.dob)],
    ["Gender", text(person.gender)],
    ["Marital Status", text(person.maritalStatus)],
    ["Resident Status", text(person.residentStatus)],
    ["Status", firstText(person.status, person.clientStatus, person.accountStatus)],
    ["Client Category", firstText(person.clientCategory, person.category)],
    ["Risk Profile", text(person.riskProfileResponse?.resultDisplay)],
    ["Address", personAddress(person)],
    ["Health Status", firstText(person.healthStatus, person.health_status)],
    ["Smoker", text(person.smoker)],
    ["Health Insurance", firstText(person.healthInsurance, person.health_insurance)],
  ];
}

function clientPartnerDetailsXml(profile: ClientProfile) {
  const clientRows = personDetailRows(profile.client);
  const partnerRows = personDetailRows(profile.partner);
  const labels = Array.from(new Set([...clientRows, ...partnerRows].map(([label]) => label)));
  const clientMap = new Map(clientRows);
  const partnerMap = new Map(partnerRows);

  if (!labels.length) return "";

  return [
    headingXml("Client and Partner Details", 2),
    tableXml(
      profile.partner ? ["Field", "Client", "Partner"] : ["Field", "Client"],
      labels.map((label) =>
        profile.partner
          ? [label, clientMap.get(label) ?? "", partnerMap.get(label) ?? ""]
          : [label, clientMap.get(label) ?? ""],
      ),
    ),
  ].join("");
}

function acknowledgementXml(profile: ClientProfile) {
  const people = [
    { label: "Client", name: text(profile.client?.name) || "Client" },
    ...(profile.partner ? [{ label: "Partner", name: text(profile.partner.name) || "Partner" }] : []),
  ];
  const width = Math.floor(5000 / Math.max(people.length, 1));
  const headerXml = `<w:tr>${people.map((person) => cellXml(person.label, { header: true, width })).join("")}</w:tr>`;
  const signatureXml = `<w:tr><w:trPr><w:trHeight w:val="1300" w:hRule="atLeast"/></w:trPr>${people
    .map((person) =>
      cellParagraphsXml(
        [
          "Signed:",
          "",
          "",
          person.name,
          "",
          "Date:",
          "",
        ],
        { width },
      ),
    )
    .join("")}</w:tr>`;

  return [
    headingXml("Your Acknowledgement", 2),
    paragraphXml("- I/we have read and checked the information contained in this Fact Find document and confirm that it is accurate."),
    paragraphXml("- I/we acknowledge that if we have chosen not to disclose any information, or the information provided is incorrect, it could seriously affect the suitability of any recommendations provided."),
    paragraphXml("- The information set out in this form accurately represents my/our investment objectives, financial situation, and particular needs. I/we are not aware of any other information which may be relevant to the preparation of my/our financial plan."),
    paragraphXml("- I/we understand that a financial plan/investment recommendation will be based solely on the information supplied in this fact find, and should be implemented within a period of one month."),
    paragraphXml("- I/we understand that if we do not proceed with the implementation of the financial plan within a month, it will be necessary to review the information, which has been supplied before proceeding with the financial plan."),
    `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="D7DEE7"/><w:left w:val="single" w:sz="4" w:color="D7DEE7"/><w:bottom w:val="single" w:sz="4" w:color="D7DEE7"/><w:right w:val="single" w:sz="4" w:color="D7DEE7"/><w:insideH w:val="single" w:sz="4" w:color="E5EAF0"/><w:insideV w:val="single" w:sz="4" w:color="E5EAF0"/></w:tblBorders></w:tblPr>${headerXml}${signatureXml}</w:tbl>`,
  ].join("");
}

function compareRiskProfileAnswerIndex(left: string, right: string, leftFallback: number, rightFallback: number) {
  const leftNumeric = Number(left);
  const rightNumeric = Number(right);

  if (Number.isFinite(leftNumeric) && Number.isFinite(rightNumeric) && leftNumeric !== rightNumeric) {
    return leftNumeric - rightNumeric;
  }

  return (
    left.localeCompare(right, undefined, {
      numeric: true,
      sensitivity: "base",
    }) || leftFallback - rightFallback
  );
}

function riskProfileAnswerRows(person: PersonRecord | null | undefined, personLabel: string) {
  const answers = person?.riskProfileResponse?.answer;
  if (!Array.isArray(answers)) return [];

  return answers
    .map((answer, fallbackIndex) => {
      const index = text(answer?.index) || String(fallbackIndex + 1);

      return {
        personLabel,
        index,
        question: text(answer?.question),
        choice: text(answer?.choice),
        fallbackIndex,
      };
    })
    .sort((left, right) =>
      compareRiskProfileAnswerIndex(left.index, right.index, left.fallbackIndex, right.fallbackIndex),
    );
}

function riskProfileXml(profile: ClientProfile) {
  const people = [
    { label: "Client", person: profile.client },
    ...(profile.partner ? [{ label: "Partner", person: profile.partner }] : []),
  ].filter((entry): entry is { label: string; person: PersonRecord } => Boolean(entry.person));

  if (!people.length) return "";

  const outcomeRows = people.map(({ label, person }) => [
    label,
    text(person.riskProfileResponse?.resultDisplay),
    text(person.riskProfileResponse?.score),
  ]);
  const answerRows = people.flatMap(({ label, person }) =>
    riskProfileAnswerRows(person, label).map((answer) => [
      answer.personLabel,
      answer.index,
      answer.question,
      answer.choice,
    ]),
  );

  return [
    headingXml("Risk Profile", 2),
    tableXml(["Person", "Outcome", "Score"], outcomeRows),
    tableXml(["Person", "Index", "Question", "Answer"], answerRows),
  ].join("");
}

function employmentRecords(profile: ClientProfile) {
  const profileEmployment = profile.employment ?? [];
  const nestedEmployment: EmploymentSourceRecord[] = [
    ...(profile.client?.employment ?? []),
    ...(profile.partner?.employment ?? []),
  ];

  return profileEmployment.length ? profileEmployment : nestedEmployment;
}

function employmentOwnerName(item: EmploymentSourceRecord, profile: ClientProfile) {
  if (item.owner?.name) return text(item.owner.name);
  if (profile.client?.employment?.some((entry) => entry === item)) return text(profile.client.name);
  if (profile.partner?.employment?.some((entry) => entry === item)) return text(profile.partner.name);
  return "";
}

function buildDocumentXml(profile: ClientProfile) {
  const assets = profile.assets ?? [];
  const liabilities = profile.liabilities ?? [];
  const income = profile.income ?? [];
  const expenses = profile.expense ?? [];
  const superannuation = profile.superannuation ?? [];
  const pensions = profile.pension ?? [];
  const insurance = profile.insurance ?? [];
  const totalAssets = assets.reduce((sum, item) => sum + numberValue(item.currentValue), 0);
  const totalLiabilities = liabilities.reduce((sum, item) => sum + numberValue(item.outstandingBalance), 0);
  const totalIncome = income.reduce((sum, item) => sum + numberValue(item.amount), 0);
  const totalExpenses = expenses.reduce((sum, item) => sum + numberValue(item.amount), 0);
  const totalSuper = superannuation.reduce((sum, item) => sum + numberValue(item.balance), 0);
  const totalPension = pensions.reduce((sum, item) => sum + numberValue(item.balance), 0);

  const body = [
    headingXml("Fact Find"),
    paragraphXml(clientNames(profile), { bold: true, size: 26, spacingAfter: 80 }),
    paragraphXml(`Generated ${formatDate(new Date().toISOString())}`, { spacingAfter: 180 }),
    detailTable("Advice Team", [
      ["Adviser", text(profile.adviser?.name)],
      ["Practice", firstText(profile.practice, profile.adviser?.practice?.name)],
      ["Licensee", firstText(profile.licensee, profile.adviser?.licensee?.name)],
    ]),
    clientPartnerDetailsXml(profile),
    headingXml("Dependants", 2),
    tableXml(
      ["Owner", "Name", "Type", "Date of Birth"],
      (profile.dependants ?? []).map((item) => [text(item.owner?.name), text(item.name), text(item.type), formatDate(item.birthday)]),
    ),
    headingXml("Entities", 2),
    tableXml(
      ["Owner", "Name", "Type"],
      (profile.entities ?? []).map((item) => [text(item.owner?.name), text(item.name), text(item.type)]),
    ),
    headingXml("Employment", 2),
    tableXml(
      ["Owner", "Job Title", "Status", "Employer", "Salary", "Frequency"],
      employmentRecords(profile).map((item) => [
        employmentOwnerName(item, profile),
        firstText(item.jobTitle, item.job_title),
        text(item.status),
        text(item.employer),
        formatCurrency(item.salary),
        frequency(item.frequency),
      ]),
    ),
    headingXml("Assets", 2),
    tableXml(
      ["Owner", "Category", "Type", "Description", "Current Value"],
      assets.map((item) => [text(item.owner?.name), text(item.type), text(item.assetType), text(item.description), formatCurrency(item.currentValue)]),
    ),
    paragraphXml(`Total Assets: ${formatNumber(totalAssets)}`, { bold: true, spacingAfter: 180 }),
    headingXml("Liabilities", 2),
    tableXml(
      ["Owner", "Type", "Provider", "Balance", "Repayment", "Frequency"],
      liabilities.map((item) => [
        text(item.owner?.name),
        text(item.loanType),
        text(item.bankName),
        formatCurrency(item.outstandingBalance),
        formatCurrency(item.repaymentAmount),
        frequency(item.repaymentFrequency),
      ]),
    ),
    paragraphXml(`Total Liabilities: ${formatNumber(totalLiabilities)}`, { bold: true, spacingAfter: 180 }),
    headingXml("Income", 2),
    tableXml(
      ["Owner", "Type", "Description", "Amount", "Frequency"],
      income.map((item) => [text(item.owner?.name), text(item.type), text(item.description), formatCurrency(item.amount), frequency(item.frequency)]),
    ),
    paragraphXml(`Total Income: ${formatNumber(totalIncome)}`, { bold: true, spacingAfter: 180 }),
    headingXml("Expenses", 2),
    tableXml(
      ["Owner", "Type", "Description", "Amount", "Frequency"],
      expenses.map((item) => [text(item.owner?.name), text(item.type), text(item.description), formatCurrency(item.amount), frequency(item.frequency)]),
    ),
    paragraphXml(`Total Expenses: ${formatNumber(totalExpenses)}`, { bold: true, spacingAfter: 180 }),
    headingXml("Superannuation", 2),
    tableXml(
      ["Owner", "Fund", "Type", "Account", "Balance", "Contribution"],
      superannuation.map((item) => [
        text(item.owner?.name),
        text(item.superFund),
        text(item.type),
        text(item.accountNumber),
        formatCurrency(item.balance),
        formatCurrency(item.contributionAmount),
      ]),
    ),
    paragraphXml(`Total Superannuation: ${formatNumber(totalSuper)}`, { bold: true, spacingAfter: 180 }),
    headingXml("Retirement Income", 2),
    tableXml(
      ["Owner", "Provider", "Type", "Account", "Balance", "Payment"],
      pensions.map((item) => [
        text(item.owner?.name),
        text(item.superFund),
        text(item.type),
        text(item.accountNumber),
        formatCurrency(item.balance),
        formatCurrency(item.payment),
      ]),
    ),
    paragraphXml(`Total Retirement Income Balance: ${formatNumber(totalPension)}`, { bold: true, spacingAfter: 180 }),
    headingXml("Insurance", 2),
    tableXml(
      ["Owner", "Cover", "Insurer", "Sum Insured", "Premium", "Frequency", "Status"],
      insurance.map((item) => [
        text(item.owner?.name),
        text(item.coverRequired),
        text(item.insurer),
        formatCurrency(item.sumInsured),
        formatCurrency(item.premiumAmount),
        frequency(item.frequency),
        text(item.status),
      ]),
    ),
    riskProfileXml(profile),
    acknowledgementXml(profile),
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

export function buildFactFindOutputName(profile: ClientProfile) {
  return `${sanitizeFilename(text(profile.client?.name) || "Client") || "Client"}-FactFind.docx`;
}

export async function renderFactFindDocx(
  profile: ClientProfile,
  input: { documentStyleProfile?: Partial<DocumentStyleProfile> | null } = {},
) {
  activeDocumentStyle = normalizeDocumentStyleProfile(input.documentStyleProfile);

  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES_XML);
  zip.folder("_rels")?.file(".rels", ROOT_RELS_XML);
  const word = zip.folder("word");
  word?.file("document.xml", buildDocumentXml(profile));
  word?.file("styles.xml", stylesXml(activeDocumentStyle));
  word?.folder("_rels")?.file("document.xml.rels", DOCUMENT_RELS_XML);

  return zip.generateAsync({
    type: "arraybuffer",
    mimeType: DOCX_MIME_TYPE,
    compression: "DEFLATE",
  });
}
