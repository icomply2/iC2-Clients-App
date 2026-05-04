import JSZip from "jszip";
import type { ClientProfile, PersonRecord } from "@/lib/api/types";
import {
  buildServiceAgreementSectionModel,
  getServiceFeeAnnualAmount,
  getServiceFeeFrequencyLabel,
} from "@/lib/documents/document-sections";
import {
  DEFAULT_DOCUMENT_STYLE_PROFILE,
  type DocumentStyleProfile,
} from "@/lib/documents/document-style-profile";
import { getPortfolioAccountViews, getPrimaryAllocationRows } from "@/lib/soa-portfolio-accounts";
import type {
  AdviceCaseV1,
  CommissionItemV1,
  InsurancePolicyOwnershipGroupV1,
  InsurancePolicyReplacementV1,
  PortfolioHoldingV1,
  ProductRexTransactionRowV1,
} from "@/lib/soa-types";

export type SoaDocxRenderStyle = Partial<DocumentStyleProfile> & {
  fontColor?: string | null;
  tableAccentColor?: string | null;
};

export type SoaDocxExportInput = {
  adviceCase: AdviceCaseV1;
  clientProfile?: ClientProfile | null;
  savedAt: string;
  clientName?: string | null;
  adviserName?: string | null;
  practiceName?: string | null;
  practiceAbn?: string | null;
  renderStyle: SoaDocxRenderStyle;
};

type ParagraphOptions = {
  align?: "left" | "center" | "right";
  bold?: boolean;
  color?: string;
  fontSize?: number;
  heading?: boolean;
  spacingAfter?: number;
  spacingBefore?: number;
};

type TableCell = {
  text: string;
  bold?: boolean;
  fill?: string;
  color?: string;
  widthPct?: number;
};

type AllocationChartSlice = {
  assetClass: string;
  recommendedPct: number;
  color: string;
};

type DocxBuildAssets = {
  allocationChartPng?: Uint8Array | null;
};

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DEFAULT_HEADING_COLOR = "#B3742A";
const DEFAULT_TEXT_COLOR = "#2F4A6D";
const DEFAULT_TABLE_HEADER_COLOR = "#faf7eb";
let activeHeadingColor = DEFAULT_HEADING_COLOR;
const DEFAULT_BODY_FONT_SIZE = 11;
const PIE_SLICE_COLORS = ["#113864", "#f2c500", "#2f855a", "#c05621", "#6b46c1", "#00897b", "#c53030", "#4a5568"];
const ALLOCATION_CHART_RELATIONSHIP_ID = "rIdAssetAllocationChart";
const STRATEGY_RECOMMENDATIONS_INTRO =
  "This section outlines our recommendations, the benefits to you, how these strategies place you in a better position and other key information.";
const FEES_AND_DISCLOSURES_INTRO =
  "This section outlines the amounts you pay for our advice and the services provided. We have also shown the amounts we receive. All amounts are inclusive of GST (where applicable).";
const PRODUCT_FEES_INTRO =
  "The following tables outline the ongoing fees you will incur because of implementing the recommended products in this report:";
const REPLACEMENT_ANALYSIS_INTRO =
  "As part of our recommendation I have completed an investigation into your existing investments and compared both advantages and disadvantages of replacing your investment. This information has been provided to help you identify the reason why I have recommended a switch and assist you in deciding whether to act upon our advice. The research I undertook prior to making our recommendation has been retained on your client file. Should you require a copy, please let me know and I’ll provide it free of charge.";
const EXECUTIVE_SUMMARY_INTRO =
  "This section summarises the scope of advice, explains how our recommendations are appropriate for your objectives, financial situation and needs and explains how our recommendations will help to achieve your goals and objectives. To help you make an informed decision, we’ll outline the consequences and implications of our advice and our fees. Additional details are contained in the body of this Statement of Advice (SoA) and the Appendix.";
const EXECUTIVE_SUMMARY_SCOPE_INTRO =
  "During our meeting we discussed and agreed that our advice will cover the following areas:";
const BETTER_POSITION_STATEMENT_INTRO =
  "The table below provides a brief summary of our recommendation and snapshot of how our recommendations are likely to leave you in a better position compared to your current situation.";
const SUMMARY_OF_ADVICE_FEES_INTRO =
  "The following is a summary of our advice fees. For further details please refer to the Disclosures section:";
const INSURANCE_RECOMMENDATIONS_INTRO =
  "This section summarises the personal insurance policies we recommend you apply for, retain, vary or replace, including ownership, cover levels, premium structure, optional benefits and important underwriting notes.";
const ABOUT_ADVICE_WARNINGS = [
  {
    title: "Incomplete or Inaccurate Information Warning",
    text: "Should you not have provided us all the relevant information, this will limit our ability to provide appropriate advice with regard to your objectives, financial situation and needs.",
  },
  {
    title: "Taxation Considerations",
    text: "Whilst every effort has been made to include relevant tax considerations, we recommend you seek advice from your accountant or an appropriately qualified tax agent about the impact on your tax liabilities and other tax implications arising from the recommended strategies before proceeding.",
  },
  {
    title: "Approved Product List",
    text: "The products I have recommended for you are drawn from the Approved Product List. I can obtain permission to recommend other financial products, but I believe that the products contained on the APL are appropriate for your needs. If you’d like a copy of the Approved Product List please let me know and I’ll provide a copy to you.",
  },
];

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

function documentRelsXml(includeAllocationChart: boolean) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  ${
    includeAllocationChart
      ? `<Relationship Id="${ALLOCATION_CHART_RELATIONSHIP_ID}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/asset-allocation.png"/>`
      : ""
  }
</Relationships>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
</w:styles>`;

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeHexColor(value: string | null | undefined, fallback: string) {
  const candidate = value?.trim() ?? "";
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate.toUpperCase() : fallback;
}

function wordColor(value: string | null | undefined, fallback: string) {
  return normalizeHexColor(value, fallback).replace("#", "");
}

function firstFontFamily(fontFamily: string) {
  return fontFamily.split(",")[0]?.replace(/["']/g, "").trim() || "Titillium Web";
}

function sanitizeOutputName(value: string) {
  return (
    value
      .split("")
      .filter((character) => {
        const code = character.charCodeAt(0);
        return code >= 32 && !`<>:"/\\|?*`.includes(character);
      })
      .join("")
      .replace(/\s+/g, " ")
      .trim() || "SOA"
  );
}

function formatDate(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDateValue(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatCurrency(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function calculateAge(value?: string | null) {
  if (!value) {
    return null;
  }

  const dob = new Date(value);
  if (Number.isNaN(dob.getTime())) {
    return null;
  }

  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }

  return age;
}

function parseNumericValue(value?: string | number | null) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (!value) {
    return 0;
  }

  const parsed = Number(String(value).replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toAnnualAmount(value?: string | null, frequencyType?: string | null) {
  const amount = parseNumericValue(value);
  const frequency = frequencyType?.trim().toLowerCase() ?? "";

  switch (frequency) {
    case "weekly":
      return amount * 52;
    case "fortnightly":
      return amount * 26;
    case "monthly":
      return amount * 12;
    case "quarterly":
      return amount * 4;
    default:
      return amount;
  }
}

function formatPercent(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return `${value.toFixed(2)}%`;
}

function formatInsuranceOwnership(value?: InsurancePolicyOwnershipGroupV1["ownership"] | null) {
  switch (value) {
    case "inside-super":
      return "Superannuation";
    case "outside-super":
      return "Non-superannuation";
    case "flexi-linked":
      return "Flexi-linked";
    case "smsf":
      return "SMSF";
    case "employer":
      return "Employer";
    case "other":
      return "Other";
    case "unknown":
    default:
      return "Ownership to be confirmed";
  }
}

function formatInsuranceFrequency(value?: string | null) {
  return value ? toTitleCase(value) : "-";
}

function getInsuranceAnnualisedPremium(group: InsurancePolicyOwnershipGroupV1) {
  if (group.annualisedPremium !== null && group.annualisedPremium !== undefined) {
    return group.annualisedPremium;
  }

  const multiplier =
    group.premiumFrequency === "weekly"
      ? 52
      : group.premiumFrequency === "fortnightly"
        ? 26
        : group.premiumFrequency === "monthly"
          ? 12
          : group.premiumFrequency === "quarterly"
            ? 4
            : group.premiumFrequency === "half-yearly"
              ? 2
              : group.premiumFrequency === "annually"
                ? 1
                : 0;

  return multiplier && group.premiumAmount != null ? group.premiumAmount * multiplier : null;
}

function getInsuranceCoverTypeKey(policyType?: string | null) {
  switch (policyType) {
    case "life":
      return "life";
    case "tpd":
      return "tpd";
    case "trauma":
      return "trauma";
    case "income-protection":
      return "incomeProtection";
    default:
      return null;
  }
}

function getInsurancePolicySnapshotValue(
  snapshot: InsurancePolicyReplacementV1["currentPolicy"],
  key: keyof InsurancePolicyReplacementV1["currentPolicy"],
) {
  const value = snapshot[key];
  return typeof value === "number" ? formatCurrency(value) : value || "-";
}

function formatProjectionMetricValue(value?: number | null, unit?: "currency" | "percent" | "years" | "other" | null) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  if (unit === "currency") {
    return formatCurrency(value);
  }

  if (unit === "percent") {
    return formatPercent(value);
  }

  if (unit === "years") {
    return `${value.toFixed(1)} years`;
  }

  return String(value);
}

function resolveOwnerName(owner?: { name?: string | null } | null, joint?: boolean | null) {
  if (joint) {
    return "Joint";
  }

  return owner?.name?.trim() || "-";
}

function toTitleCase(value?: string | null) {
  if (!value) {
    return "Balanced";
  }

  return value
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildAddress(person?: PersonRecord | null) {
  const street = person?.street ?? person?.addressStreet ?? person?.address?.street ?? person?.address?.line1 ?? null;
  const suburb = person?.suburb ?? person?.addressSuburb ?? person?.address?.suburb ?? person?.address?.city ?? null;
  const state = person?.state ?? person?.addressState ?? person?.address?.state ?? person?.address?.region ?? null;
  const postCode =
    person?.postCode ??
    person?.postcode ??
    person?.addressPostCode ??
    person?.address?.postCode ??
    person?.address?.postcode ??
    person?.address?.zipCode ??
    null;

  return [street?.trim(), [suburb?.trim(), state?.trim(), postCode?.trim()].filter(Boolean).join(" ")]
    .filter(Boolean) as string[];
}

function buildPreferredContact(person?: PersonRecord | null) {
  return (
    person?.preferredPhone?.trim() ||
    person?.mobile?.trim() ||
    person?.mobilePhone?.trim() ||
    person?.phone?.trim() ||
    person?.contact?.preferredPhone?.trim() ||
    person?.contact?.phone?.trim() ||
    person?.email?.trim() ||
    "-"
  );
}

function buildPersonSnapshot(person?: PersonRecord | null) {
  return {
    name: person?.name?.trim() || "Client",
    age: calculateAge(person?.dob),
    dob: formatDateValue(person?.dob),
    maritalStatus: person?.maritalStatus?.trim() || "-",
    residentStatus: person?.residentStatus?.trim() || "-",
    preferredContact: buildPreferredContact(person),
    employmentStatus: person?.employment?.[0]?.status?.trim() || "-",
    jobTitle: person?.employment?.[0]?.jobTitle?.trim() || person?.employment?.[0]?.job_title?.trim() || "-",
    healthStatus: person?.health_status?.trim() || person?.healthStatus?.trim() || "-",
    healthInsurance: person?.health_insurance?.trim() || person?.healthInsurance?.trim() || "-",
  };
}

function getClientNames(adviceCase: AdviceCaseV1, clientName?: string | null) {
  return adviceCase.clientGroup.clients.map((client) => client.fullName).filter(Boolean).join(" and ") || clientName || "Client";
}

function getAddressee(adviceCase: AdviceCaseV1, clientName?: string | null) {
  const clients = adviceCase.clientGroup.clients;
  return clients.length ? clients.map((client) => client.fullName).join(" and ") : clientName || "Client";
}

function getOwnerName(adviceCase: AdviceCaseV1, ownerPersonId?: string | null) {
  return adviceCase.clientGroup.clients.find((client) => client.personId === ownerPersonId)?.fullName ?? "Client";
}

function getCommissionUpfrontPercentage(commission: CommissionItemV1) {
  return commission.upfrontPercentage ?? (commission.type === "upfront" ? commission.percentage : null);
}

function getCommissionUpfrontAmount(commission: CommissionItemV1) {
  return commission.upfrontAmount ?? (commission.type === "upfront" ? commission.amount : null);
}

function getCommissionOngoingPercentage(commission: CommissionItemV1) {
  return commission.ongoingPercentage ?? (commission.type === "ongoing" ? commission.percentage : null);
}

function getCommissionOngoingAmount(commission: CommissionItemV1) {
  return commission.ongoingAmount ?? (commission.type === "ongoing" ? commission.amount : null);
}

function run(text: string, options: ParagraphOptions, fontFamily: string, defaultColor: string) {
  const color = wordColor(options.color, defaultColor);
  const size = Math.round((options.fontSize ?? DEFAULT_BODY_FONT_SIZE) * 2);
  const bold = options.bold ? "<w:b/>" : "";
  const font = escapeXml(firstFontFamily(fontFamily));

  return `<w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/>${bold}<w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function paragraph(text: string, options: ParagraphOptions, fontFamily: string, defaultColor: string) {
  const alignment = options.align ? `<w:jc w:val="${options.align}"/>` : "";
  const before = options.spacingBefore ?? 0;
  const after = options.spacingAfter ?? (options.heading ? 180 : 120);
  const spacing = `<w:spacing w:before="${before}" w:after="${after}" w:line="276" w:lineRule="auto"/>`;

  return `<w:p><w:pPr>${alignment}${spacing}</w:pPr>${run(text, options, fontFamily, defaultColor)}</w:p>`;
}

function emptyParagraph() {
  return "<w:p/>";
}

function pageBreak() {
  return `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
}

function bullet(text: string, fontFamily: string, defaultColor: string) {
  return `<w:p><w:pPr><w:spacing w:after="80" w:line="276" w:lineRule="auto"/><w:ind w:left="360" w:hanging="180"/></w:pPr>${run(`• ${text}`, {}, fontFamily, defaultColor)}</w:p>`;
}

function table(rows: TableCell[][], fontFamily: string, defaultColor: string) {
  const rowXml = rows
    .map(
      (row) =>
        `<w:tr>${row
          .map((cell) => {
            const fill = cell.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${wordColor(cell.fill, DEFAULT_TABLE_HEADER_COLOR)}"/>` : "";
            const width = cell.widthPct ? `<w:tcW w:w="${Math.round(cell.widthPct * 50)}" w:type="pct"/>` : "";
            return `<w:tc><w:tcPr>${width}${fill}<w:vAlign w:val="top"/></w:tcPr>${paragraph(
              cell.text,
              {
                bold: cell.bold,
                color: cell.color,
                fontSize: DEFAULT_BODY_FONT_SIZE,
                spacingAfter: 0,
              },
              fontFamily,
              defaultColor,
            )}</w:tc>`;
          })
          .join("")}</w:tr>`,
    )
    .join("");

  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="D5DDE7"/><w:left w:val="single" w:sz="4" w:color="D5DDE7"/><w:bottom w:val="single" w:sz="4" w:color="D5DDE7"/><w:right w:val="single" w:sz="4" w:color="D5DDE7"/><w:insideH w:val="single" w:sz="4" w:color="D5DDE7"/><w:insideV w:val="single" w:sz="4" w:color="D5DDE7"/></w:tblBorders><w:tblCellMar><w:top w:w="90" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr>${rowXml}</w:tbl>${emptyParagraph()}`;
}

function imageParagraph(relationshipId: string, name: string, widthEmu: number, heightEmu: number) {
  return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="180"/></w:pPr><w:r><w:drawing>
    <wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0">
      <wp:extent cx="${widthEmu}" cy="${heightEmu}"/>
      <wp:effectExtent l="0" t="0" r="0" b="0"/>
      <wp:docPr id="1" name="${escapeXml(name)}"/>
      <wp:cNvGraphicFramePr>
        <a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>
      </wp:cNvGraphicFramePr>
      <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:nvPicPr>
              <pic:cNvPr id="1" name="${escapeXml(name)}.png"/>
              <pic:cNvPicPr/>
            </pic:nvPicPr>
            <pic:blipFill>
              <a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${relationshipId}"/>
              <a:stretch><a:fillRect/></a:stretch>
            </pic:blipFill>
            <pic:spPr>
              <a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm>
              <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
            </pic:spPr>
          </pic:pic>
        </a:graphicData>
      </a:graphic>
    </wp:inline>
  </w:drawing></w:r></w:p>`;
}

function heading(text: string, level: 1 | 2 | 3, fontFamily: string) {
  const size = level === 1 ? 18 : 14;
  return paragraph(text, { bold: true, color: activeHeadingColor, fontSize: size, heading: true, spacingBefore: level === 1 ? 0 : 180 }, fontFamily, DEFAULT_TEXT_COLOR);
}

function sectionTitle(text: string, fontFamily: string) {
  return heading(text, 1, fontFamily);
}

function normal(text: string, fontFamily: string, defaultColor: string) {
  return paragraph(text, {}, fontFamily, defaultColor);
}

function headerCell(text: string, fill: string, color: string, widthPct?: number): TableCell {
  return { text, bold: true, fill, color, widthPct };
}

function totalCell(text: string, fill: string, color: string, widthPct?: number): TableCell {
  return { text, bold: true, fill, color, widthPct };
}

function groupTransactionsByPlatform(rows: ProductRexTransactionRowV1[]) {
  const groups = new Map<string, ProductRexTransactionRowV1[]>();
  rows.forEach((row) => {
    const key = row.platformName?.trim() || "Unspecified platform";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });
  return [...groups.entries()];
}

function groupHoldingsByPlatform(rows: PortfolioHoldingV1[]) {
  const groups = new Map<string, PortfolioHoldingV1[]>();
  rows.forEach((row) => {
    const key = row.platformName?.trim() || "Unspecified platform";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });
  return [...groups.entries()];
}

function getPortfolioHoldingAmounts(holding: PortfolioHoldingV1) {
  const currentAmount =
    holding.currentAmount ??
    (holding.transactionAmount && holding.transactionAmount < 0 ? Math.abs(holding.transactionAmount) : 0);
  const proposedAmount = holding.proposedAmount ?? holding.amount ?? 0;
  const changeAmount = holding.changeAmount ?? holding.transactionAmount ?? proposedAmount - currentAmount;

  return { currentAmount, changeAmount, proposedAmount };
}

function getProductFeeGroups(adviceCase: AdviceCaseV1) {
  const accounts = getPortfolioAccountViews(adviceCase);
  const groupedFeeIds = new Set<string>();
  const groups = accounts
    .map((account) => {
      const fees = adviceCase.fees.productFees.filter((fee) => {
        const matchesReport =
          Boolean(account.productRexReportId && fee.productRexReportId === account.productRexReportId) ||
          Boolean(account.sourceFileName && fee.sourceFileName === account.sourceFileName);
        const matchesProduct =
          Boolean(account.recommendedProductName && fee.productName === account.recommendedProductName) &&
          Boolean(account.label && fee.ownerName === account.label);
        return matchesReport || matchesProduct;
      });
      fees.forEach((fee) => groupedFeeIds.add(fee.feeId));
      return { key: account.accountId, label: account.label, fees };
    })
    .filter((group) => group.fees.length);
  const ungroupedFees = adviceCase.fees.productFees.filter((fee) => !groupedFeeIds.has(fee.feeId));

  return ungroupedFees.length
    ? [...groups, { key: "other-product-fees", label: groups.length ? "Other product fees" : "Product fees", fees: ungroupedFees }]
    : groups;
}

function getInvestmentPdsGroups(adviceCase: AdviceCaseV1) {
  const accounts = getPortfolioAccountViews(adviceCase);
  const accountGroups = accounts
    .map((account) => {
      const rows = Array.from(
        new Map(
          account.holdings
            .filter((holding) => getPortfolioHoldingAmounts(holding).proposedAmount > 0)
            .map((holding) => [
              holding.fundName,
              {
                productName: holding.code ? `${holding.fundName} (${holding.code})` : holding.fundName,
                pdsProvided: "Yes",
              },
            ] as const),
        ).values(),
      );
      return { key: account.accountId, label: account.label, rows };
    })
    .filter((group) => group.rows.length);
  const groupedProducts = new Set(accountGroups.flatMap((group) => group.rows.map((row) => row.productName)));
  const recommendationRows = inputProductNames(adviceCase)
    .filter((name) => !groupedProducts.has(name))
    .map((name) => ({ productName: name, pdsProvided: "Yes" }));

  return recommendationRows.length
    ? [
        ...accountGroups,
        {
          key: "other-investment-pds",
          label: accountGroups.length ? "Other recommended products" : "Investment products",
          rows: recommendationRows,
        },
      ]
    : accountGroups;
}

function inputProductNames(adviceCase: AdviceCaseV1) {
  return adviceCase.recommendations.product
    .filter((item) => item.productType !== "insurance")
    .map((item) => item.recommendedProductName)
    .filter(Boolean) as string[];
}

function getInsurancePdsRows(adviceCase: AdviceCaseV1) {
  return Array.from(
    new Map(
      [
        ...(adviceCase.recommendations.insurance ?? []).map((recommendation) => [
          [
            recommendation.recommendedProvider?.trim(),
            recommendation.recommendedProductName?.trim(),
          ].filter(Boolean).join(" - ") || recommendation.recommendedProductName?.trim() || recommendation.recommendationText,
          {
            productName:
              [
                recommendation.recommendedProvider?.trim(),
                recommendation.recommendedProductName?.trim(),
              ].filter(Boolean).join(" - ") || recommendation.recommendedProductName?.trim() || "Insurance product",
            pdsProvided: "Yes",
          },
        ] as const),
        ...adviceCase.recommendations.product
          .filter((recommendation) => recommendation.productType === "insurance")
          .map((recommendation) => [
            [
              recommendation.recommendedProvider?.trim(),
              recommendation.recommendedProductName?.trim(),
            ].filter(Boolean).join(" - ") || recommendation.recommendedProductName?.trim() || recommendation.recommendationText,
            {
              productName:
                [
                  recommendation.recommendedProvider?.trim(),
                  recommendation.recommendedProductName?.trim(),
                ].filter(Boolean).join(" - ") || recommendation.recommendedProductName?.trim() || "Insurance product",
              pdsProvided: "Yes",
            },
          ] as const),
        ...(adviceCase.recommendations.insurancePolicies ?? []).map((recommendation) => [
          [
            recommendation.insurerName?.trim(),
            recommendation.productName?.trim(),
            recommendation.policyName?.trim(),
          ].filter(Boolean).join(" - ") || recommendation.recommendationText,
          {
            productName:
              [
                recommendation.insurerName?.trim(),
                recommendation.productName?.trim(),
                recommendation.policyName?.trim(),
              ].filter(Boolean).join(" - ") || "Insurance product",
            pdsProvided: "Yes",
          },
        ] as const),
      ].filter(([key]) => Boolean(key)),
    ).values(),
  );
}

function getProductRexComparisonColumns(report: NonNullable<AdviceCaseV1["productRexReports"]>[number]) {
  if (report.comparisonColumns?.length) {
    return report.comparisonColumns;
  }

  return [
    { columnId: `${report.reportId}-current`, status: "current" as const, productName: report.currentPlatform ?? null },
    { columnId: `${report.reportId}-recommended`, status: "recommended" as const, productName: report.recommendedPlatform ?? null },
    { columnId: `${report.reportId}-alternative`, status: "alternative" as const, productName: report.alternativePlatform ?? null },
  ];
}

function getRiskProfileBenchmarkRows(
  allocationRows:
    | {
        assetClass: string;
        riskProfilePct?: number | null;
      }[]
    | null
    | undefined,
) {
  const ranges: Record<string, { min?: number; max?: number }> = {
    "Domestic Equity": { min: 15, max: 50 },
    "Australian Shares": { min: 15, max: 50 },
    "International Equity": { min: 10, max: 40 },
    "International Shares": { min: 10, max: 40 },
    "Domestic Property": { min: 0, max: 7.5 },
    Property: { min: 0, max: 7.5 },
    "International Property": { min: 0, max: 7.5 },
    Alternative: { min: 0, max: 15 },
    "Domestic Fixed Interest": { min: 5, max: 17.5 },
    "Diversified Fixed Interest": { min: 5, max: 17.5 },
    "International Fixed Interest": { min: 5, max: 17.5 },
    Cash: { min: 0, max: 15 },
    "Domestic Cash": { min: 0, max: 15 },
    "International Cash": { min: 0, max: 8 },
  };

  return (allocationRows ?? []).map((row) => {
    const range = ranges[row.assetClass] ?? {};
    return {
      assetClass: row.assetClass,
      targetPct: row.riskProfilePct ?? null,
      minimumPct: range.min ?? null,
      maximumPct: range.max ?? null,
    };
  });
}

function buildAllocationChartSlices(
  allocationRows:
    | {
        assetClass: string;
        recommendedPct?: number | null;
      }[]
    | null
    | undefined,
) {
  return (allocationRows ?? [])
    .filter(
      (row) =>
        row.recommendedPct !== null &&
        row.recommendedPct !== undefined &&
        row.recommendedPct > 0 &&
        !row.assetClass.toLowerCase().startsWith("total defensive") &&
        !row.assetClass.toLowerCase().startsWith("total growth"),
    )
    .map((row, index) => ({
      assetClass: row.assetClass,
      recommendedPct: row.recommendedPct ?? 0,
      color: PIE_SLICE_COLORS[index % PIE_SLICE_COLORS.length],
    }));
}

function dataUrlToBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function buildAllocationChartPng(slices: AllocationChartSlice[]) {
  if (!slices.length || typeof document === "undefined") {
    return null;
  }

  const canvas = document.createElement("canvas");
  const scale = 2;
  const width = 760;
  const height = 360;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  context.scale(scale, scale);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  const total = slices.reduce((sum, slice) => sum + slice.recommendedPct, 0) || 100;
  const centerX = 175;
  const centerY = 180;
  const radius = 120;
  let currentAngle = -Math.PI / 2;

  slices.forEach((slice) => {
    const sliceAngle = (slice.recommendedPct / total) * Math.PI * 2;
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
    context.closePath();
    context.fillStyle = slice.color;
    context.fill();
    context.strokeStyle = "#ffffff";
    context.lineWidth = 3;
    context.stroke();
    currentAngle += sliceAngle;
  });

  context.font = "700 20px Calibri, Arial, sans-serif";
  context.fillStyle = "#B3742A";
  context.fillText("Recommended Asset Allocation Split", 340, 70);
  context.font = "16px Calibri, Arial, sans-serif";
  context.fillStyle = "#2F4A6D";

  slices.forEach((slice, index) => {
    const y = 112 + index * 32;
    context.fillStyle = slice.color;
    context.fillRect(340, y - 12, 16, 16);
    context.fillStyle = "#2F4A6D";
    context.fillText(slice.assetClass, 370, y + 1);
    context.font = "700 16px Calibri, Arial, sans-serif";
    context.fillText(formatPercent(slice.recommendedPct), 640, y + 1);
    context.font = "16px Calibri, Arial, sans-serif";
  });

  return dataUrlToBytes(canvas.toDataURL("image/png"));
}

function documentXml(bodyXml: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1134" w:bottom="1440" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function getAdviserAddressLocality(clientProfile?: ClientProfile | null) {
  const address = clientProfile?.adviser?.address;
  return [
    address?.suburb?.trim() || address?.city?.trim(),
    address?.state?.trim() || address?.region?.trim(),
    address?.postCode?.trim() || address?.postalCode?.trim(),
  ]
    .filter(Boolean)
    .join(" ");
}

function getAdviserPhone(clientProfile?: ClientProfile | null) {
  return clientProfile?.adviser?.officeNumber?.trim() || clientProfile?.adviser?.phoneNumber?.trim() || "<<adviser.phone>>";
}

function buildCover(input: SoaDocxExportInput, fontFamily: string, textColor: string) {
  const clientNames = getClientNames(input.adviceCase, input.clientName);
  const adviserName = input.clientProfile?.adviser?.name?.trim() || input.adviserName || input.adviceCase.metadata.createdBy?.name || "<<adviser>>";
  const adviserEmail = input.clientProfile?.adviser?.email?.trim() || "<<adviser.email>>";
  const adviserAsicNumber = input.clientProfile?.adviser?.asicNumber?.trim() || "<<car_number>>";
  const adviserAddressLocality = getAdviserAddressLocality(input.clientProfile);
  const adviserAddress = {
    street: input.clientProfile?.adviser?.address?.street?.trim() || "<<adviser.address>>",
    locality: adviserAddressLocality || "<<adviser.suburb>> <<adviser.state>> <<adviser.postcode>>",
    phone: getAdviserPhone(input.clientProfile),
  };
  const practiceName =
    input.clientProfile?.adviser?.practice?.name?.trim() || input.clientProfile?.practice?.trim() || input.practiceName || input.adviceCase.practice.name || "<<practice>>";
  const practiceAbn = input.clientProfile?.adviser?.abn?.trim() || input.practiceAbn || "<<abn>>";
  const licenseeName = input.clientProfile?.adviser?.licensee?.name?.trim() || input.clientProfile?.licensee?.trim() || input.adviceCase.licensee.name || "Insight Investment Partners";

  return [
    paragraph("Statement of Advice", { align: "center", bold: true, color: activeHeadingColor, fontSize: 34, spacingAfter: 360 }, fontFamily, textColor),
    paragraph("Prepared for", { align: "center", bold: true, fontSize: 12 }, fontFamily, textColor),
    paragraph(clientNames, { align: "center", bold: true, fontSize: 12, spacingAfter: 360 }, fontFamily, textColor),
    paragraph("YOUR", { align: "center", bold: true, fontSize: 11, spacingBefore: 180, spacingAfter: 40 }, fontFamily, textColor),
    paragraph("LOGO", { align: "center", bold: true, fontSize: 22, spacingAfter: 40 }, fontFamily, textColor),
    paragraph("HERE", { align: "center", bold: true, fontSize: 11, spacingAfter: 360 }, fontFamily, textColor),
    paragraph("Prepared by", { align: "center", bold: true, fontSize: 12 }, fontFamily, textColor),
    paragraph(adviserName, { align: "center", bold: true, fontSize: 12 }, fontFamily, textColor),
    paragraph(`ASIC Adviser Number: ${adviserAsicNumber}`, { align: "center" }, fontFamily, textColor),
    paragraph(formatDate(input.savedAt), { align: "center", spacingAfter: 360 }, fontFamily, textColor),
    paragraph("Financial Adviser of", { align: "center", bold: true, color: activeHeadingColor, fontSize: 12 }, fontFamily, textColor),
    paragraph(practiceName, { align: "center" }, fontFamily, textColor),
    paragraph(`Corporate Authorised Rep of ${licenseeName}`, { align: "center" }, fontFamily, textColor),
    paragraph(`ASIC Adviser Number: ${adviserAsicNumber}`, { align: "center" }, fontFamily, textColor),
    paragraph(`ABN: ${practiceAbn}`, { align: "center", spacingAfter: 280 }, fontFamily, textColor),
    paragraph(adviserAddress.street, { align: "center" }, fontFamily, textColor),
    paragraph(adviserAddress.locality, { align: "center" }, fontFamily, textColor),
    paragraph(`Telephone: ${adviserAddress.phone}`, { align: "center" }, fontFamily, textColor),
    paragraph(`Email: ${adviserEmail}`, { align: "center", spacingAfter: 280 }, fontFamily, textColor),
    paragraph("Australian Financial Services Licensee", { align: "center", bold: true, color: activeHeadingColor, fontSize: 12 }, fontFamily, textColor),
    paragraph(`Licensee Name: ${licenseeName}`, { align: "center" }, fontFamily, textColor),
    paragraph("AFSL No: 368175", { align: "center" }, fontFamily, textColor),
  ].join("");
}

function buildContents(input: SoaDocxExportInput, fontFamily: string, textColor: string, tableHeaderColor: string) {
  const hasReplacementAnalysis = input.adviceCase.recommendations.replacement.length > 0;
  const hasInsuranceNeedsAnalysis = Boolean(input.adviceCase.recommendations.insuranceNeedsAnalyses?.length);
  const hasInsuranceRecommendations = Boolean(input.adviceCase.recommendations.insurancePolicies?.length);
  const hasInsuranceReplacement = Boolean(input.adviceCase.recommendations.insuranceReplacements?.length);
  const feeAgreement = input.adviceCase.agreements.feeAgreement;
  const hasServiceAgreement = Boolean(feeAgreement?.present);
  const isFixedTermAgreement = feeAgreement?.agreementType === "fixed-term";
  const items = [
    "Statement of Advice",
    "Executive Summary",
    "About This Advice",
    "Your Personal and Financial Position",
    "Risk Profile",
    "Strategy Recommendations",
    "Product Recommendations",
    "Investment Portfolio Recommendations",
    "Portfolio Allocation",
    ...(hasReplacementAnalysis ? ["Replacement Analysis"] : []),
    ...(hasInsuranceNeedsAnalysis ? ["Insurance Needs Analysis"] : []),
    ...(hasInsuranceRecommendations ? ["Recommended Insurance Policies"] : []),
    ...(hasInsuranceReplacement ? ["Insurance Product Replacement"] : []),
    "Projected Outcomes",
    "Fees and Disclosures",
    "Authority to Proceed",
    ...(hasServiceAgreement ? [isFixedTermAgreement ? "Fixed Term Agreement" : "Ongoing Service Agreement"] : []),
    ...(hasServiceAgreement ? ["Consent to Deduct Fees"] : []),
    "Appendix",
  ];

  return [
    sectionTitle("Table of Contents", fontFamily),
    table(
      [
        [headerCell("No.", tableHeaderColor, DEFAULT_TEXT_COLOR, 16), headerCell("Section", tableHeaderColor, DEFAULT_TEXT_COLOR, 84)],
        ...items.map((item, index) => [{ text: String(index + 1).padStart(2, "0"), widthPct: 16 }, { text: item, bold: true, widthPct: 84 }]),
      ],
      fontFamily,
      textColor,
    ),
  ].join("");
}

function buildLetter(input: SoaDocxExportInput, fontFamily: string, textColor: string) {
  const adviceCase = input.adviceCase;
  const clientNames = getClientNames(adviceCase, input.clientName);
  const addressee = getAddressee(adviceCase, input.clientName);
  const addressPerson = input.clientProfile?.client ?? input.clientProfile?.partner ?? null;
  const addressLines = buildAddress(addressPerson);
  const adviserName = input.adviserName || adviceCase.metadata.createdBy?.name || "<<adviser>>";
  const practiceName = input.practiceName || adviceCase.practice.name || "<<practice>>";

  return [
    normal(formatDate(input.savedAt), fontFamily, textColor),
    normal(clientNames, fontFamily, textColor),
    ...addressLines.map((line) => normal(line, fontFamily, textColor)),
    emptyParagraph(),
    normal(`Dear ${addressee},`, fontFamily, textColor),
    heading("Statement of Advice", 1, fontFamily),
    normal("Thank you for the opportunity to advise on your financial affairs. We have pleasure in presenting your Statement of Advice (SoA), which sets out our specific recommendations for your consideration.", fontFamily, textColor),
    normal("This Statement of Advice (SoA) is based on details of your relevant personal circumstances and forms the basis of our recommendations. If any information in this report is incorrect, or if you have anything further to add, please advise us before proceeding any further.", fontFamily, textColor),
    normal("Several steps are involved in designing a strategy to reflect your personal circumstances. The recommendations made in this Statement of Advice (SoA) are the starting point of this process and therefore should only be undertaken after consulting with us.", fontFamily, textColor),
    normal("It is very important that you take full ownership of your financial decisions. To that end, we can assist you in making the appropriate decisions, but those decisions remain yours. If necessary, please seek more information and advice from us until you are comfortable to do so.", fontFamily, textColor),
    normal("We look forward to being of service to you in implementing the recommended strategies and assisting you in the attainment of your personal and investment objectives.", fontFamily, textColor),
    emptyParagraph(),
    normal("Yours sincerely,", fontFamily, textColor),
    paragraph(adviserName, { bold: true, fontSize: 14 }, fontFamily, textColor),
    normal(adviserName, fontFamily, textColor),
    normal(practiceName, fontFamily, textColor),
  ].join("");
}

function buildExecutiveSummary(input: SoaDocxExportInput, fontFamily: string, textColor: string, tableHeaderColor: string) {
  const adviceCase = input.adviceCase;
  const adviceFeeTotal = adviceCase.fees.adviceFees.reduce((sum, fee) => sum + (fee.amount ?? 0), 0);
  const serviceAgreementFeeItems = adviceCase.agreements.feeAgreement?.feeItems ?? [];
  const totalServiceAgreementFees = serviceAgreementFeeItems.reduce((sum, feeItem) => sum + getServiceFeeAnnualAmount(feeItem), 0);
  const betterPositionRows = [
    ...adviceCase.recommendations.strategic.map((recommendation) => ({
      recommendation: recommendation.recommendationText || "Draft strategy recommendation not yet written.",
      betterPosition:
        [
          ...recommendation.clientBenefits.map((benefit) => benefit.text).filter(Boolean),
          recommendation.rationale ?? "",
        ]
          .filter(Boolean)
          .join(" ") || "Benefits to be confirmed.",
    })),
    ...adviceCase.recommendations.product.map((recommendation) => ({
      recommendation: recommendation.recommendationText || "Draft product recommendation not yet written.",
      betterPosition:
        [
          ...recommendation.clientBenefits.map((benefit) => benefit.text).filter(Boolean),
          recommendation.suitabilityRationale ?? "",
        ]
          .filter(Boolean)
          .join(" ") || "Benefits to be confirmed.",
    })),
  ];

  return [
    sectionTitle("Executive Summary", fontFamily),
    normal(EXECUTIVE_SUMMARY_INTRO, fontFamily, textColor),
    heading("What Our Advice Covers", 2, fontFamily),
    normal(EXECUTIVE_SUMMARY_SCOPE_INTRO, fontFamily, textColor),
    ...(adviceCase.scope.included.length
      ? adviceCase.scope.included.map((item) => bullet(item.topic, fontFamily, textColor))
      : [normal("No scope items have been recorded.", fontFamily, textColor)]),
    heading("Better Position Statement", 2, fontFamily),
    normal(BETTER_POSITION_STATEMENT_INTRO, fontFamily, textColor),
    table(
      [
        [
          headerCell("Recommendation", tableHeaderColor, DEFAULT_TEXT_COLOR, 50),
          headerCell("Better position", tableHeaderColor, DEFAULT_TEXT_COLOR, 50),
        ],
        ...(betterPositionRows.length
          ? betterPositionRows.map((row) => [
              { text: row.recommendation, widthPct: 50 },
              { text: row.betterPosition, widthPct: 50 },
            ])
          : [[{ text: "No recommendations have been drafted yet.", widthPct: 50 }, { text: "-", widthPct: 50 }]]),
      ],
      fontFamily,
      textColor,
    ),
    heading("Summary of Advice Fees", 2, fontFamily),
    normal(SUMMARY_OF_ADVICE_FEES_INTRO, fontFamily, textColor),
    heading("Advice Preparation & Implementation Fee", 2, fontFamily),
    table(
      [
        [headerCell("Fee Type", tableHeaderColor, DEFAULT_TEXT_COLOR, 60), headerCell("Amount (including GST)", tableHeaderColor, DEFAULT_TEXT_COLOR, 40)],
        ...adviceCase.fees.adviceFees.map((fee) => [{ text: toTitleCase(fee.type), widthPct: 60 }, { text: formatCurrency(fee.amount), widthPct: 40 }]),
        [totalCell("Total", tableHeaderColor, DEFAULT_TEXT_COLOR, 60), totalCell(formatCurrency(adviceFeeTotal), tableHeaderColor, DEFAULT_TEXT_COLOR, 40)],
      ],
      fontFamily,
      textColor,
    ),
    heading("Ongoing Fees", 2, fontFamily),
    table(
      [
        [
          headerCell("Entity", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
          headerCell("Product", tableHeaderColor, DEFAULT_TEXT_COLOR, 22),
          headerCell("Account Number", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
          headerCell("Fee Amount", tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
          headerCell("Frequency", tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
          headerCell("Total Annual Fee", tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
        ],
        ...(serviceAgreementFeeItems.length
          ? [
              ...serviceAgreementFeeItems.map((feeItem) => [
                { text: getOwnerName(adviceCase, feeItem.ownerPersonId), widthPct: 18 },
                { text: feeItem.productName || "-", widthPct: 22 },
                { text: feeItem.accountNumber || "-", widthPct: 18 },
                { text: formatCurrency(feeItem.feeAmount), widthPct: 14 },
                { text: getServiceFeeFrequencyLabel(feeItem.frequency), widthPct: 14 },
                { text: formatCurrency(getServiceFeeAnnualAmount(feeItem)), widthPct: 14 },
              ]),
              [
                totalCell("Total Annual Advice Fees", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
                totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 22),
                totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
                totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
                totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
                totalCell(formatCurrency(totalServiceAgreementFees), tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
              ],
            ]
          : [[{ text: "No ongoing fee rows have been drafted.", widthPct: 18 }, { text: "-", widthPct: 22 }, { text: "-", widthPct: 18 }, { text: "-", widthPct: 14 }, { text: "-", widthPct: 14 }, { text: "-", widthPct: 14 }]]),
      ],
      fontFamily,
      textColor,
    ),
  ].join("");
}

function buildAbout(input: SoaDocxExportInput, fontFamily: string, textColor: string) {
  const adviceCase = input.adviceCase;
  const limitationsAndExclusions = [...adviceCase.scope.excluded.map((item) => item.topic), ...adviceCase.scope.limitations];

  return [
    sectionTitle("About This Advice", fontFamily),
    heading("Scope of Advice", 2, fontFamily),
    paragraph("Included scope", { bold: true, fontSize: DEFAULT_BODY_FONT_SIZE, spacingAfter: 20 }, fontFamily, textColor),
    ...(adviceCase.scope.included.length
      ? adviceCase.scope.included.map((item) => bullet(item.topic, fontFamily, textColor))
      : [normal("No included scope has been recorded.", fontFamily, textColor)]),
    paragraph("Limitations and exclusions", { bold: true, fontSize: DEFAULT_BODY_FONT_SIZE, spacingBefore: 120, spacingAfter: 20 }, fontFamily, textColor),
    ...(limitationsAndExclusions.length
      ? limitationsAndExclusions.map((item) => bullet(item, fontFamily, textColor))
      : [normal("No limitations or exclusions have been recorded.", fontFamily, textColor)]),
    heading("Client Objectives", 2, fontFamily),
    ...(adviceCase.objectives.length
      ? adviceCase.objectives.map((objective) => bullet(objective.text, fontFamily, textColor))
      : [normal("No client objectives have been recorded.", fontFamily, textColor)]),
    heading("Warnings and Limitations", 2, fontFamily),
    ...ABOUT_ADVICE_WARNINGS.flatMap((warning) => [
      paragraph(warning.title, { bold: true, fontSize: DEFAULT_BODY_FONT_SIZE, spacingAfter: 20 }, fontFamily, textColor),
      normal(warning.text, fontFamily, textColor),
    ]),
  ].join("");
}

function buildPersonalFinancialPosition(input: SoaDocxExportInput, fontFamily: string, textColor: string, tableHeaderColor: string) {
  const profile = input.clientProfile;
  const clientNames = getClientNames(input.adviceCase, input.clientName);
  const clientSnapshot = buildPersonSnapshot(profile?.client);
  const partnerSnapshot = buildPersonSnapshot(profile?.partner);
  const hasPartner = Boolean(profile?.partner?.name?.trim());
  const addressLines = buildAddress(profile?.client ?? profile?.partner ?? null);
  const combinedAddress = addressLines.join(", ") || "-";
  const dependants = profile?.dependants ?? [];
  const incomeRows = (profile?.income ?? []).map((entry) => ({
    id: entry.id ?? `${entry.description ?? entry.type}-${entry.owner?.name ?? "owner"}`,
    description: entry.description?.trim() || entry.type?.trim() || "Income",
    owner: resolveOwnerName(entry.owner, entry.joint),
    amount: toAnnualAmount(entry.amount, entry.frequency?.type ?? entry.frequency?.value),
  }));
  const expenseRows = [
    ...(profile?.expense ?? []).map((entry) => ({
      id: entry.id ?? `${entry.description ?? entry.type}-${entry.owner?.name ?? "owner"}`,
      description: entry.description?.trim() || entry.type?.trim() || "Expense",
      owner: resolveOwnerName(entry.owner, entry.joint),
      amount: toAnnualAmount(entry.amount, entry.frequency?.type ?? entry.frequency?.value),
    })),
    ...(profile?.liabilities ?? [])
      .filter((entry) => parseNumericValue(entry.repaymentAmount) > 0)
      .map((entry) => ({
        id: entry.id ?? `${entry.loanType ?? entry.bankName ?? "liability"}-repayment`,
        description: entry.loanType?.trim() || entry.bankName?.trim() || "Liability repayment",
        owner: resolveOwnerName(entry.owner, entry.joint),
        amount: toAnnualAmount(entry.repaymentAmount, entry.repaymentFrequency?.type ?? entry.repaymentFrequency?.value),
      })),
  ];
  const assetRows = profile?.assets ?? [];
  const liabilityRows = profile?.liabilities ?? [];
  const superRows = profile?.superannuation ?? [];
  const pensionRows = profile?.pension ?? [];
  const insuranceRows = profile?.insurance ?? [];
  const entityRows = profile?.entities ?? [];
  const totalExpenses = expenseRows.reduce((sum, entry) => sum + entry.amount, 0);
  const totalAssets = assetRows.reduce((sum, entry) => sum + parseNumericValue(entry.currentValue), 0);
  const totalLiabilities = liabilityRows.reduce((sum, entry) => sum + parseNumericValue(entry.outstandingBalance), 0);

  const currentSituationRows = [
    [headerCell("Description", tableHeaderColor, DEFAULT_TEXT_COLOR, 34), headerCell(clientSnapshot.name, tableHeaderColor, DEFAULT_TEXT_COLOR, 33), headerCell(hasPartner ? partnerSnapshot.name : "", tableHeaderColor, DEFAULT_TEXT_COLOR, 33)],
    [{ text: "Age", widthPct: 34 }, { text: clientSnapshot.age !== null ? String(clientSnapshot.age) : "-", widthPct: 33 }, { text: hasPartner && partnerSnapshot.age !== null ? String(partnerSnapshot.age) : "-", widthPct: 33 }],
    [{ text: "Date of birth", widthPct: 34 }, { text: clientSnapshot.dob, widthPct: 33 }, { text: hasPartner ? partnerSnapshot.dob : "-", widthPct: 33 }],
    [{ text: "Marital status", widthPct: 34 }, { text: clientSnapshot.maritalStatus, widthPct: 33 }, { text: hasPartner ? partnerSnapshot.maritalStatus : "-", widthPct: 33 }],
    [{ text: "Resident status", widthPct: 34 }, { text: clientSnapshot.residentStatus, widthPct: 33 }, { text: hasPartner ? partnerSnapshot.residentStatus : "-", widthPct: 33 }],
    [{ text: "Preferred contact", widthPct: 34 }, { text: clientSnapshot.preferredContact, widthPct: 33 }, { text: hasPartner ? partnerSnapshot.preferredContact : "-", widthPct: 33 }],
    [{ text: "Preferred address", widthPct: 34 }, { text: combinedAddress, widthPct: 33 }, { text: hasPartner ? combinedAddress : "-", widthPct: 33 }],
    [{ text: "Employment status", widthPct: 34 }, { text: clientSnapshot.employmentStatus, widthPct: 33 }, { text: hasPartner ? partnerSnapshot.employmentStatus : "-", widthPct: 33 }],
    [{ text: "Job title", widthPct: 34 }, { text: clientSnapshot.jobTitle, widthPct: 33 }, { text: hasPartner ? partnerSnapshot.jobTitle : "-", widthPct: 33 }],
    [{ text: "Current state of health", widthPct: 34 }, { text: clientSnapshot.healthStatus, widthPct: 33 }, { text: hasPartner ? partnerSnapshot.healthStatus : "-", widthPct: 33 }],
    [{ text: "Private health insurance", widthPct: 34 }, { text: clientSnapshot.healthInsurance, widthPct: 33 }, { text: hasPartner ? partnerSnapshot.healthInsurance : "-", widthPct: 33 }],
  ];

  return [
    sectionTitle("Your Personal and Financial Position", fontFamily),
    normal("Here is a summary of the relevant aspects of your personal and financial details that you have provided to us. We have taken this into consideration when developing our advice, so if any information is incomplete or incorrect, please advise us before proceeding.", fontFamily, textColor),
    heading(`${clientNames}'s Current Situation`, 2, fontFamily),
    table(currentSituationRows, fontFamily, textColor),
    heading("Children/Dependants", 2, fontFamily),
    table(
      [
        [headerCell("Name", tableHeaderColor, DEFAULT_TEXT_COLOR, 40), headerCell("Date of Birth", tableHeaderColor, DEFAULT_TEXT_COLOR, 30), headerCell("Owner", tableHeaderColor, DEFAULT_TEXT_COLOR, 30)],
        ...(dependants.length
          ? dependants.map((entry) => [
              { text: entry.name ?? "-", widthPct: 40 },
              { text: formatDateValue(entry.birthday), widthPct: 30 },
              { text: entry.owner?.name?.trim() || "-", widthPct: 30 },
            ])
          : [[{ text: "No dependants have been recorded.", widthPct: 40 }, { text: "-", widthPct: 30 }, { text: "-", widthPct: 30 }]]),
      ],
      fontFamily,
      textColor,
    ),
    pageBreak(),
    heading("Income", 2, fontFamily),
    table(
      [
        [headerCell("Income", tableHeaderColor, DEFAULT_TEXT_COLOR, 42), headerCell("Owner", tableHeaderColor, DEFAULT_TEXT_COLOR, 28), headerCell("Amount (p.a.)", tableHeaderColor, DEFAULT_TEXT_COLOR, 30)],
        ...(incomeRows.length
          ? incomeRows.map((entry) => [{ text: entry.description, widthPct: 42 }, { text: entry.owner, widthPct: 28 }, { text: formatCurrency(entry.amount), widthPct: 30 }])
          : [[{ text: "No income has been recorded.", widthPct: 42 }, { text: "-", widthPct: 28 }, { text: "-", widthPct: 30 }]]),
      ],
      fontFamily,
      textColor,
    ),
    heading("Expenditure", 2, fontFamily),
    table(
      [
        [headerCell("Expense", tableHeaderColor, DEFAULT_TEXT_COLOR, 42), headerCell("Owner", tableHeaderColor, DEFAULT_TEXT_COLOR, 28), headerCell("Amount (p.a.)", tableHeaderColor, DEFAULT_TEXT_COLOR, 30)],
        ...(expenseRows.length
          ? [
              ...expenseRows.map((entry) => [{ text: entry.description, widthPct: 42 }, { text: entry.owner, widthPct: 28 }, { text: formatCurrency(entry.amount), widthPct: 30 }]),
              [totalCell("Total expenses (per annum)", tableHeaderColor, DEFAULT_TEXT_COLOR, 42), totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 28), totalCell(formatCurrency(totalExpenses), tableHeaderColor, DEFAULT_TEXT_COLOR, 30)],
            ]
          : [[{ text: "No expenses have been recorded.", widthPct: 42 }, { text: "-", widthPct: 28 }, { text: "-", widthPct: 30 }]]),
      ],
      fontFamily,
      textColor,
    ),
    heading("Assets", 2, fontFamily),
    table(
      [
        [headerCell("Description", tableHeaderColor, DEFAULT_TEXT_COLOR, 42), headerCell("Owner", tableHeaderColor, DEFAULT_TEXT_COLOR, 28), headerCell("Amount", tableHeaderColor, DEFAULT_TEXT_COLOR, 30)],
        ...(assetRows.length
          ? [
              ...assetRows.map((entry) => [
                { text: entry.description?.trim() || entry.assetType?.trim() || entry.type?.trim() || "Asset", widthPct: 42 },
                { text: resolveOwnerName(entry.owner, entry.joint), widthPct: 28 },
                { text: formatCurrency(parseNumericValue(entry.currentValue)), widthPct: 30 },
              ]),
              [totalCell("Total assets", tableHeaderColor, DEFAULT_TEXT_COLOR, 42), totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 28), totalCell(formatCurrency(totalAssets), tableHeaderColor, DEFAULT_TEXT_COLOR, 30)],
            ]
          : [[{ text: "No assets have been recorded.", widthPct: 42 }, { text: "-", widthPct: 28 }, { text: "-", widthPct: 30 }]]),
      ],
      fontFamily,
      textColor,
    ),
    heading("Liabilities", 2, fontFamily),
    table(
      [
        [headerCell("Description", tableHeaderColor, DEFAULT_TEXT_COLOR, 42), headerCell("Owner", tableHeaderColor, DEFAULT_TEXT_COLOR, 28), headerCell("Outstanding", tableHeaderColor, DEFAULT_TEXT_COLOR, 30)],
        ...(liabilityRows.length
          ? [
              ...liabilityRows.map((entry) => [
                { text: entry.loanType?.trim() || entry.bankName?.trim() || "Liability", widthPct: 42 },
                { text: resolveOwnerName(entry.owner, entry.joint), widthPct: 28 },
                { text: formatCurrency(parseNumericValue(entry.outstandingBalance)), widthPct: 30 },
              ]),
              [totalCell("Total liabilities", tableHeaderColor, DEFAULT_TEXT_COLOR, 42), totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 28), totalCell(formatCurrency(totalLiabilities), tableHeaderColor, DEFAULT_TEXT_COLOR, 30)],
            ]
          : [[{ text: "No liabilities have been recorded.", widthPct: 42 }, { text: "-", widthPct: 28 }, { text: "-", widthPct: 30 }]]),
      ],
      fontFamily,
      textColor,
    ),
    pageBreak(),
    heading("Superannuation funds", 2, fontFamily),
    table(
      [
        [headerCell("Description", tableHeaderColor, DEFAULT_TEXT_COLOR, 42), headerCell("Owner", tableHeaderColor, DEFAULT_TEXT_COLOR, 28), headerCell("Current Balance", tableHeaderColor, DEFAULT_TEXT_COLOR, 30)],
        ...(superRows.length
          ? superRows.map((entry) => [
              { text: entry.superFund?.trim() || entry.type?.trim() || "Super fund", widthPct: 42 },
              { text: resolveOwnerName(entry.owner, entry.joint), widthPct: 28 },
              { text: formatCurrency(parseNumericValue(entry.balance)), widthPct: 30 },
            ])
          : [[{ text: "No superannuation funds have been recorded.", widthPct: 42 }, { text: "-", widthPct: 28 }, { text: "-", widthPct: 30 }]]),
      ],
      fontFamily,
      textColor,
    ),
    heading("Pension funds", 2, fontFamily),
    table(
      [
        [headerCell("Description", tableHeaderColor, DEFAULT_TEXT_COLOR, 42), headerCell("Owner", tableHeaderColor, DEFAULT_TEXT_COLOR, 28), headerCell("Current Balance", tableHeaderColor, DEFAULT_TEXT_COLOR, 30)],
        ...(pensionRows.length
          ? pensionRows.map((entry) => [
              { text: entry.superFund?.trim() || entry.type?.trim() || "Pension fund", widthPct: 42 },
              { text: resolveOwnerName(entry.owner, false), widthPct: 28 },
              { text: formatCurrency(parseNumericValue(entry.balance)), widthPct: 30 },
            ])
          : [[{ text: "No pension funds have been recorded.", widthPct: 42 }, { text: "-", widthPct: 28 }, { text: "-", widthPct: 30 }]]),
      ],
      fontFamily,
      textColor,
    ),
    heading("Personal insurance policies", 2, fontFamily),
    table(
      [
        [
          headerCell("Policy Purpose", tableHeaderColor, DEFAULT_TEXT_COLOR, 26),
          headerCell("Owner", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
          headerCell("Type", tableHeaderColor, DEFAULT_TEXT_COLOR, 20),
          headerCell("Cover", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
          headerCell("Premium", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
        ],
        ...(insuranceRows.length
          ? insuranceRows.map((entry) => [
              { text: entry.insurer?.trim() || "Insurance policy", widthPct: 26 },
              { text: resolveOwnerName(entry.owner, entry.joint), widthPct: 18 },
              { text: entry.coverRequired?.trim() || "-", widthPct: 20 },
              { text: formatCurrency(parseNumericValue(entry.sumInsured)), widthPct: 18 },
              { text: formatCurrency(parseNumericValue(entry.premiumAmount)), widthPct: 18 },
            ])
          : [[{ text: "No personal insurance policies have been recorded.", widthPct: 26 }, { text: "-", widthPct: 18 }, { text: "-", widthPct: 20 }, { text: "-", widthPct: 18 }, { text: "-", widthPct: 18 }]]),
      ],
      fontFamily,
      textColor,
    ),
    heading("Linked entities", 2, fontFamily),
    table(
      [
        [
          headerCell("Name", tableHeaderColor, DEFAULT_TEXT_COLOR, 40),
          headerCell("Owner", tableHeaderColor, DEFAULT_TEXT_COLOR, 30),
          headerCell("Type", tableHeaderColor, DEFAULT_TEXT_COLOR, 30),
        ],
        ...(entityRows.length
          ? entityRows.map((entry) => [
              { text: entry.name?.trim() || "-", widthPct: 40 },
              { text: entry.owner?.name?.trim() || "-", widthPct: 30 },
              { text: entry.type?.trim() || "-", widthPct: 30 },
            ])
          : [[{ text: "No linked entities have been recorded.", widthPct: 40 }, { text: "-", widthPct: 30 }, { text: "-", widthPct: 30 }]]),
      ],
      fontFamily,
      textColor,
    ),
  ].join("");
}

function buildRiskProfile(input: SoaDocxExportInput, fontFamily: string, textColor: string, tableHeaderColor: string) {
  const clientNames = getClientNames(input.adviceCase, input.clientName);
  const riskProfileLabel = toTitleCase(input.adviceCase.riskProfile?.profile);
  const benchmarkRows = getRiskProfileBenchmarkRows(getPrimaryAllocationRows(input.adviceCase));

  return [
    sectionTitle("Risk Profile", fontFamily),
    normal("We discussed your attitude to investment risk and your degree of concern regarding several investment related issues. As we discussed, we assess your appetite for, and tolerance of, investment risk to assist us to develop an investment strategy appropriate to your particular circumstances.", fontFamily, textColor),
    normal("When designing a portfolio consistent with your risk profile, we considered your preferences, the appropriate exposure to investment sectors and asset classes such as cash, fixed interest, property, and shares.", fontFamily, textColor),
    normal(`${clientNames}, based on your previous responses to the risk profile questionnaire and our discussions about your preferences, experience, and knowledge, we have classified you as ${riskProfileLabel} investors.`, fontFamily, textColor),
    input.adviceCase.riskProfile?.toleranceNotes ? normal(input.adviceCase.riskProfile.toleranceNotes, fontFamily, textColor) : "",
    heading(`Benchmark Asset Allocation for a ${riskProfileLabel} Investor`, 2, fontFamily),
    benchmarkRows.length
      ? table(
          [
            [
              headerCell("Asset Class", tableHeaderColor, DEFAULT_TEXT_COLOR, 34),
              headerCell("Recommended Target Asset Allocation", tableHeaderColor, DEFAULT_TEXT_COLOR, 34),
              headerCell("Minimum", tableHeaderColor, DEFAULT_TEXT_COLOR, 16),
              headerCell("Maximum", tableHeaderColor, DEFAULT_TEXT_COLOR, 16),
            ],
            ...benchmarkRows.map((row) => [
              { text: row.assetClass, widthPct: 34 },
              { text: formatPercent(row.targetPct), widthPct: 34 },
              { text: formatPercent(row.minimumPct), widthPct: 16 },
              { text: formatPercent(row.maximumPct), widthPct: 16 },
            ]),
          ],
          fontFamily,
          textColor,
        )
      : normal("No benchmark asset allocation data has been populated.", fontFamily, textColor),
  ].join("");
}

function buildStrategyRecommendations(input: SoaDocxExportInput, fontFamily: string, textColor: string) {
  const recommendations = input.adviceCase.recommendations.strategic;

  if (!recommendations.length) {
    return [sectionTitle("Strategy Recommendations", fontFamily), normal("No strategy recommendations have been drafted.", fontFamily, textColor)].join("");
  }

  return recommendations
    .map((recommendation, index) => {
      const benefits = [
        ...recommendation.clientBenefits.map((benefit) => benefit.text).filter(Boolean),
        recommendation.rationale ?? "",
      ].filter(Boolean);
      const consequences = recommendation.consequences.map((consequence) =>
        [consequence.type ? toTitleCase(consequence.type) : null, consequence.text].filter(Boolean).join(": "),
      );
      const alternatives = recommendation.alternativesConsidered.map((alternative) =>
        [alternative.optionText, alternative.reasonNotRecommended ? `Reason not recommended: ${alternative.reasonNotRecommended}` : null]
          .filter(Boolean)
          .join(" - "),
      );

      return [
        index === 0 ? sectionTitle("Strategy Recommendations", fontFamily) : pageBreak(),
        index === 0 ? normal(STRATEGY_RECOMMENDATIONS_INTRO, fontFamily, textColor) : "",
        heading(`Recommendation ${index + 1}`, 2, fontFamily),
        normal(recommendation.recommendationText || "Draft recommendation not yet written.", fontFamily, textColor),
        heading("Benefits", 2, fontFamily),
        ...(benefits.length ? benefits.map((benefit) => bullet(benefit, fontFamily, textColor)) : [normal("No benefits have been drafted.", fontFamily, textColor)]),
        heading("Consequences and trade-offs", 2, fontFamily),
        ...(consequences.length
          ? consequences.map((consequence) => bullet(consequence, fontFamily, textColor))
          : [normal("No consequences or trade-offs have been drafted.", fontFamily, textColor)]),
        heading("Alternatives considered", 2, fontFamily),
        ...(alternatives.length
          ? alternatives.map((alternative) => bullet(alternative, fontFamily, textColor))
          : [normal("No alternatives have been drafted.", fontFamily, textColor)]),
      ].join("");
    })
    .join("");
}

function buildProductRecommendations(
  input: SoaDocxExportInput,
  fontFamily: string,
  textColor: string,
  tableHeaderColor: string,
) {
  const recommendations = input.adviceCase.recommendations.product;

  if (!recommendations.length) {
    return [sectionTitle("Product Recommendations", fontFamily), normal("No product recommendations have been drafted.", fontFamily, textColor)].join("");
  }

  return recommendations
    .map((recommendation, index) => {
      const benefits = [
        ...recommendation.clientBenefits.map((benefit) => benefit.text).filter(Boolean),
        recommendation.suitabilityRationale ?? "",
      ].filter(Boolean);
      const consequences = recommendation.consequences.map((consequence) =>
        [consequence.type ? toTitleCase(consequence.type) : null, consequence.text].filter(Boolean).join(": "),
      );
      const alternatives = recommendation.alternativesConsidered.map((alternative) =>
        [alternative.productName, alternative.reasonDiscounted ? `Reason not recommended: ${alternative.reasonDiscounted}` : null]
          .filter(Boolean)
          .join(" - "),
      );
      const summaryRows = [
        [
          headerCell("Action", tableHeaderColor, DEFAULT_TEXT_COLOR, 25),
          headerCell("Product Type", tableHeaderColor, DEFAULT_TEXT_COLOR, 25),
          headerCell("Current Product", tableHeaderColor, DEFAULT_TEXT_COLOR, 25),
          headerCell("Recommended Product", tableHeaderColor, DEFAULT_TEXT_COLOR, 25),
        ],
        [
          { text: toTitleCase(recommendation.action), widthPct: 25 },
          { text: toTitleCase(recommendation.productType), widthPct: 25 },
          { text: recommendation.currentProductName || "-", widthPct: 25 },
          { text: recommendation.recommendedProductName || "-", widthPct: 25 },
        ],
      ];

      return [
        index === 0 ? sectionTitle("Product Recommendations", fontFamily) : pageBreak(),
        heading(`Product Recommendation ${index + 1}`, 2, fontFamily),
        table(summaryRows, fontFamily, textColor),
        normal(recommendation.recommendationText || "Draft product recommendation not yet written.", fontFamily, textColor),
        heading("Benefits", 2, fontFamily),
        ...(benefits.length ? benefits.map((benefit) => bullet(benefit, fontFamily, textColor)) : [normal("No benefits have been drafted.", fontFamily, textColor)]),
        heading("Consequences and trade-offs", 2, fontFamily),
        ...(consequences.length
          ? consequences.map((consequence) => bullet(consequence, fontFamily, textColor))
          : [normal("No consequences or trade-offs have been drafted.", fontFamily, textColor)]),
        heading("Alternatives considered", 2, fontFamily),
        ...(alternatives.length
          ? alternatives.map((alternative) => bullet(alternative, fontFamily, textColor))
          : [normal("No alternatives have been drafted.", fontFamily, textColor)]),
      ].join("");
    })
    .join("");
}

function buildInsuranceNeedsAnalysis(input: SoaDocxExportInput, fontFamily: string, textColor: string, tableHeaderColor: string) {
  const analyses = input.adviceCase.recommendations.insuranceNeedsAnalyses ?? [];

  if (!analyses.length) {
    return "";
  }

  return [
    sectionTitle("Insurance Needs Analysis", fontFamily),
    normal("The following is a summary analysis of your insurance needs.", fontFamily, textColor),
    normal("Assumptions:", fontFamily, textColor),
    bullet("Inflation equals 3% pa.", fontFamily, textColor),
    bullet("Discount rate of 3% applied to the insured sum.", fontFamily, textColor),
    ...input.adviceCase.clientGroup.clients.flatMap((person) => {
      const personAnalyses = analyses.filter((analysis) => analysis.ownerPersonIds.includes(person.personId));
      if (!personAnalyses.length) {
        return [];
      }

      const totals = personAnalyses.reduce(
        (sum, analysis) => {
          const key = getInsuranceCoverTypeKey(analysis.policyType);
          if (key) {
            sum.required[key] += analysis.outputs.targetCoverAmount ?? 0;
            sum.available[key] += analysis.inputs.existingCoverAmount ?? 0;
            sum.cover[key] += analysis.outputs.coverGapAmount ?? Math.max((analysis.outputs.targetCoverAmount ?? 0) - (analysis.inputs.existingCoverAmount ?? 0), 0);
          }
          return sum;
        },
        {
          required: { life: 0, tpd: 0, trauma: 0, incomeProtection: 0 },
          available: { life: 0, tpd: 0, trauma: 0, incomeProtection: 0 },
          cover: { life: 0, tpd: 0, trauma: 0, incomeProtection: 0 },
        },
      );
      const amountRow = (label: string, analysis: (typeof personAnalyses)[number], amount?: number | null) => {
        const key = getInsuranceCoverTypeKey(analysis.policyType);
        return [
          { text: label, widthPct: 36 },
          { text: key === "life" ? formatCurrency(amount) : "-", widthPct: 16 },
          { text: key === "tpd" ? formatCurrency(amount) : "-", widthPct: 16 },
          { text: key === "trauma" ? formatCurrency(amount) : "-", widthPct: 16 },
          { text: key === "incomeProtection" ? formatCurrency(amount) : "-", widthPct: 16 },
        ];
      };

      return [
        heading(person.fullName, 2, fontFamily),
        table(
          [
            [headerCell(person.fullName, tableHeaderColor, DEFAULT_TEXT_COLOR, 36), headerCell("Life", tableHeaderColor, DEFAULT_TEXT_COLOR, 16), headerCell("TPD", tableHeaderColor, DEFAULT_TEXT_COLOR, 16), headerCell("Trauma", tableHeaderColor, DEFAULT_TEXT_COLOR, 16), headerCell("IP (p.a.)", tableHeaderColor, DEFAULT_TEXT_COLOR, 16)],
            [totalCell("Capital Requirements", tableHeaderColor, DEFAULT_TEXT_COLOR, 36), totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 16), totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 16), totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 16), totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 16)],
            ...personAnalyses.map((analysis) => amountRow(analysis.purpose || `${toTitleCase(analysis.policyType)} cover required`, analysis, analysis.outputs.targetCoverAmount)),
            [totalCell("Total Capital Required", tableHeaderColor, DEFAULT_TEXT_COLOR, 36), totalCell(formatCurrency(totals.required.life), tableHeaderColor, DEFAULT_TEXT_COLOR, 16), totalCell(formatCurrency(totals.required.tpd), tableHeaderColor, DEFAULT_TEXT_COLOR, 16), totalCell(formatCurrency(totals.required.trauma), tableHeaderColor, DEFAULT_TEXT_COLOR, 16), totalCell(formatCurrency(totals.required.incomeProtection), tableHeaderColor, DEFAULT_TEXT_COLOR, 16)],
            [totalCell("Capital Provisions", tableHeaderColor, DEFAULT_TEXT_COLOR, 36), totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 16), totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 16), totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 16), totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 16)],
            ...personAnalyses.map((analysis) => amountRow("Existing cover and available provisions", analysis, analysis.inputs.existingCoverAmount)),
            [totalCell("Total Capital Available", tableHeaderColor, DEFAULT_TEXT_COLOR, 36), totalCell(formatCurrency(totals.available.life), tableHeaderColor, DEFAULT_TEXT_COLOR, 16), totalCell(formatCurrency(totals.available.tpd), tableHeaderColor, DEFAULT_TEXT_COLOR, 16), totalCell(formatCurrency(totals.available.trauma), tableHeaderColor, DEFAULT_TEXT_COLOR, 16), totalCell(formatCurrency(totals.available.incomeProtection), tableHeaderColor, DEFAULT_TEXT_COLOR, 16)],
            [totalCell("Total Cover Required", tableHeaderColor, DEFAULT_TEXT_COLOR, 36), totalCell(formatCurrency(totals.cover.life), tableHeaderColor, DEFAULT_TEXT_COLOR, 16), totalCell(formatCurrency(totals.cover.tpd), tableHeaderColor, DEFAULT_TEXT_COLOR, 16), totalCell(formatCurrency(totals.cover.trauma), tableHeaderColor, DEFAULT_TEXT_COLOR, 16), totalCell(formatCurrency(totals.cover.incomeProtection), tableHeaderColor, DEFAULT_TEXT_COLOR, 16)],
          ],
          fontFamily,
          textColor,
        ),
        heading("Basis", 2, fontFamily),
        ...(personAnalyses.map((analysis) => analysis.rationale || analysis.inputs.notes || analysis.outputs.suggestedStructureNotes).filter(Boolean) as string[])
          .map((item) => bullet(item, fontFamily, textColor)),
      ];
    }),
  ].join("");
}

function buildInsuranceRecommendations(input: SoaDocxExportInput, fontFamily: string, textColor: string, tableHeaderColor: string) {
  const policies = input.adviceCase.recommendations.insurancePolicies ?? [];

  if (!policies.length) {
    return "";
  }

  return [
    sectionTitle("Recommended Insurance Policies", fontFamily),
    normal(INSURANCE_RECOMMENDATIONS_INTRO, fontFamily, textColor),
    ...policies.flatMap((policy, policyIndex) => {
      const insuredPerson = input.adviceCase.clientGroup.clients.find((person) => person.personId === policy.insuredPersonId);
      const insuredName = insuredPerson?.fullName || "Insured person to be confirmed";
      const productDescription = [policy.insurerName, policy.productName, policy.policyName].filter(Boolean).join(" - ");

      return [
        policyIndex > 0 ? pageBreak() : "",
        heading(insuredName, 2, fontFamily),
        productDescription ? paragraph(productDescription, { bold: true, spacingAfter: 80 }, fontFamily, textColor) : "",
        policy.recommendationText ? normal(policy.recommendationText, fontFamily, textColor) : "",
        ...policy.ownershipGroups.flatMap((group) => [
          heading(formatInsuranceOwnership(group.ownership), 2, fontFamily),
          table(
            [
              [
                headerCell("Cover Type", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
                headerCell("Details", tableHeaderColor, DEFAULT_TEXT_COLOR, 34),
                headerCell("Premium Type", tableHeaderColor, DEFAULT_TEXT_COLOR, 24),
                headerCell("Sum Insured / Benefit", tableHeaderColor, DEFAULT_TEXT_COLOR, 24),
              ],
              ...(group.covers.length
                ? group.covers.map((cover) => [
                    { text: toTitleCase(cover.coverType), widthPct: 18 },
                    {
                      text:
                        [cover.details, cover.waitingPeriod ? `Wait: ${cover.waitingPeriod}` : "", cover.benefitPeriod ? `Benefit: ${cover.benefitPeriod}` : ""]
                          .filter(Boolean)
                          .join(", ") || "-",
                      widthPct: 34,
                    },
                    { text: toTitleCase(cover.premiumType), widthPct: 24 },
                    {
                      text: cover.coverType === "income-protection" ? `${formatCurrency(cover.monthlyBenefit)}/month` : formatCurrency(cover.sumInsured),
                      widthPct: 24,
                    },
                  ])
                : [[{ text: "No cover components have been recorded.", widthPct: 100 }]]),
              [
                totalCell(`${formatInsuranceFrequency(group.premiumFrequency)} premium${group.fundingSource ? ` funded via ${group.fundingSource}` : ""}`, tableHeaderColor, DEFAULT_TEXT_COLOR, 76),
                totalCell(formatCurrency(group.premiumAmount), tableHeaderColor, DEFAULT_TEXT_COLOR, 24),
              ],
              [
                totalCell("Annualised premium subtotal", tableHeaderColor, DEFAULT_TEXT_COLOR, 76),
                totalCell(formatCurrency(getInsuranceAnnualisedPremium(group)), tableHeaderColor, DEFAULT_TEXT_COLOR, 24),
              ],
            ],
            fontFamily,
            textColor,
          ),
        ]),
        (policy.optionalBenefits ?? []).length
          ? [
              heading("Optional benefits", 2, fontFamily),
              ...(policy.optionalBenefits ?? []).map((benefit) => bullet(benefit, fontFamily, textColor)),
            ].join("")
          : "",
        policy.underwritingNotes ? normal(policy.underwritingNotes, fontFamily, textColor) : "",
        policy.replacementNotes ? normal(policy.replacementNotes, fontFamily, textColor) : "",
      ];
    }),
  ].join("");
}

function buildInsuranceReplacement(input: SoaDocxExportInput, fontFamily: string, textColor: string, tableHeaderColor: string) {
  const replacements = input.adviceCase.recommendations.insuranceReplacements ?? [];

  if (!replacements.length) {
    return "";
  }

  return [
    sectionTitle("Insurance Product Replacement", fontFamily),
    normal(
      "The table below shows a direct comparison of your current cover against the recommended replacement policies.",
      fontFamily,
      textColor,
    ),
    ...replacements.flatMap((replacement, index) => {
      const ownerName = getOwnerName(input.adviceCase, replacement.ownerPersonId);
      const premiumDifference =
        replacement.premiumDifference ??
        ((replacement.recommendedPolicy.totalAnnualPremium ?? 0) - (replacement.currentPolicy.totalAnnualPremium ?? 0));

      return [
        index > 0 ? pageBreak() : "",
        heading(ownerName, 2, fontFamily),
        table(
          [
            [
              headerCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 34),
              headerCell("Current Insurance Policy/Policies", tableHeaderColor, DEFAULT_TEXT_COLOR, 33),
              headerCell("Recommended Insurance Policy", tableHeaderColor, DEFAULT_TEXT_COLOR, 33),
            ],
            [
              { text: "Insurer", widthPct: 34 },
              { text: getInsurancePolicySnapshotValue(replacement.currentPolicy, "insurer"), widthPct: 33 },
              { text: getInsurancePolicySnapshotValue(replacement.recommendedPolicy, "insurer"), widthPct: 33 },
            ],
            [
              { text: "Total Life Cover", widthPct: 34 },
              { text: getInsurancePolicySnapshotValue(replacement.currentPolicy, "totalLifeCover"), widthPct: 33 },
              { text: getInsurancePolicySnapshotValue(replacement.recommendedPolicy, "totalLifeCover"), widthPct: 33 },
            ],
            [
              { text: "Total TPD Cover", widthPct: 34 },
              { text: getInsurancePolicySnapshotValue(replacement.currentPolicy, "totalTpdCover"), widthPct: 33 },
              { text: getInsurancePolicySnapshotValue(replacement.recommendedPolicy, "totalTpdCover"), widthPct: 33 },
            ],
            [
              { text: "Total Income Protection Cover", widthPct: 34 },
              { text: getInsurancePolicySnapshotValue(replacement.currentPolicy, "totalIncomeProtectionCover"), widthPct: 33 },
              { text: getInsurancePolicySnapshotValue(replacement.recommendedPolicy, "totalIncomeProtectionCover"), widthPct: 33 },
            ],
            [
              { text: "Total Trauma Cover", widthPct: 34 },
              { text: getInsurancePolicySnapshotValue(replacement.currentPolicy, "totalTraumaCover"), widthPct: 33 },
              { text: getInsurancePolicySnapshotValue(replacement.recommendedPolicy, "totalTraumaCover"), widthPct: 33 },
            ],
            [
              { text: "Total Premium (Annual)", widthPct: 34 },
              { text: getInsurancePolicySnapshotValue(replacement.currentPolicy, "totalAnnualPremium"), widthPct: 33 },
              { text: getInsurancePolicySnapshotValue(replacement.recommendedPolicy, "totalAnnualPremium"), widthPct: 33 },
            ],
            [
              totalCell("Difference in Premiums", tableHeaderColor, DEFAULT_TEXT_COLOR, 34),
              totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 33),
              totalCell(formatCurrency(premiumDifference), tableHeaderColor, DEFAULT_TEXT_COLOR, 33),
            ],
          ],
          fontFamily,
          textColor,
        ),
        heading("Replacement Details", 2, fontFamily),
        ...(replacement.reasons.length ? replacement.reasons.map((reason) => bullet(reason, fontFamily, textColor)) : [normal("No replacement reasons have been drafted.", fontFamily, textColor)]),
        heading("Costs of Replacement", 2, fontFamily),
        ...(replacement.costs.length ? replacement.costs.map((cost) => bullet(cost, fontFamily, textColor)) : [normal("No replacement costs have been drafted.", fontFamily, textColor)]),
        heading("Policy Benefits", 2, fontFamily),
        table(
          [
            [
              headerCell("Gained", tableHeaderColor, DEFAULT_TEXT_COLOR, 50),
              headerCell("Lost", tableHeaderColor, DEFAULT_TEXT_COLOR, 50),
            ],
            [
              { text: replacement.benefitsGained.length ? replacement.benefitsGained.map((benefit) => `• ${benefit}`).join("\n") : "-", widthPct: 50 },
              { text: replacement.benefitsLost.length ? replacement.benefitsLost.map((benefit) => `• ${benefit}`).join("\n") : "-", widthPct: 50 },
            ],
          ],
          fontFamily,
          textColor,
        ),
        replacement.notes ? normal(replacement.notes, fontFamily, textColor) : "",
      ];
    }),
  ].join("");
}

function buildInvestmentPortfolioRecommendations(
  input: SoaDocxExportInput,
  fontFamily: string,
  textColor: string,
  tableHeaderColor: string,
) {
  const portfolioAccounts = getPortfolioAccountViews(input.adviceCase);
  const accountsWithHoldings = portfolioAccounts.filter((account) => account.holdings.length);

  if (!accountsWithHoldings.length) {
    return [
      sectionTitle("Investment Portfolio Recommendations", fontFamily),
      normal("No portfolio data has been populated.", fontFamily, textColor),
    ].join("");
  }

  const accountTables = accountsWithHoldings.flatMap((account) => {
    const rows = groupHoldingsByPlatform(account.holdings).flatMap(([platformName, items]) => {
      const subtotalCurrent = items.reduce((sum, holding) => sum + getPortfolioHoldingAmounts(holding).currentAmount, 0);
      const subtotalChange = items.reduce((sum, holding) => sum + getPortfolioHoldingAmounts(holding).changeAmount, 0);
      const subtotalProposed = items.reduce((sum, holding) => sum + getPortfolioHoldingAmounts(holding).proposedAmount, 0);

      return [
        [
          totalCell(platformName, tableHeaderColor, DEFAULT_TEXT_COLOR, 40),
          totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 20),
          totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 20),
          totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 20),
        ],
        ...items.map((holding) => {
          const { currentAmount, changeAmount, proposedAmount } = getPortfolioHoldingAmounts(holding);

          return [
            { text: holding.fundName, widthPct: 40 },
            { text: formatCurrency(currentAmount), widthPct: 20 },
            { text: formatCurrency(changeAmount), widthPct: 20 },
            { text: formatCurrency(proposedAmount), widthPct: 20 },
          ];
        }),
        [
          totalCell("Subtotal", tableHeaderColor, DEFAULT_TEXT_COLOR, 40),
          totalCell(formatCurrency(subtotalCurrent), tableHeaderColor, DEFAULT_TEXT_COLOR, 20),
          totalCell(formatCurrency(subtotalChange), tableHeaderColor, DEFAULT_TEXT_COLOR, 20),
          totalCell(formatCurrency(subtotalProposed), tableHeaderColor, DEFAULT_TEXT_COLOR, 20),
        ],
      ];
    });

    return [
      paragraph(account.label, { bold: true, spacingBefore: 180, spacingAfter: 80 }, fontFamily, textColor),
      table(
        [
          [
            headerCell("Fund", tableHeaderColor, DEFAULT_TEXT_COLOR, 40),
            headerCell("Current", tableHeaderColor, DEFAULT_TEXT_COLOR, 20),
            headerCell("Change", tableHeaderColor, DEFAULT_TEXT_COLOR, 20),
            headerCell("Proposed", tableHeaderColor, DEFAULT_TEXT_COLOR, 20),
          ],
          ...rows,
        ],
        fontFamily,
        textColor,
      ),
    ];
  });

  return [
    sectionTitle("Investment Portfolio Recommendations", fontFamily),
    heading("Recommended Holdings", 2, fontFamily),
    ...accountTables,
  ].join("");
}

function buildPortfolioAllocation(
  input: SoaDocxExportInput,
  fontFamily: string,
  textColor: string,
  tableHeaderColor: string,
  assets: DocxBuildAssets,
) {
  const portfolioAccounts = getPortfolioAccountViews(input.adviceCase);
  const accountsWithAllocation = portfolioAccounts.filter((account) => account.allocationComparison.length);
  const allocationRows = getPrimaryAllocationRows(input.adviceCase);
  const recommendedRows = buildAllocationChartSlices(allocationRows);

  if (!accountsWithAllocation.length && !recommendedRows.length) {
    return [
      sectionTitle("Portfolio Allocation", fontFamily),
      normal("No asset allocation data has been populated.", fontFamily, textColor),
    ].join("");
  }

  return [
    sectionTitle("Portfolio Allocation", fontFamily),
    heading("Asset Allocation Comparison", 2, fontFamily),
    normal("Upon implementation of our recommendations, the asset allocation of each entity will be as shown below:", fontFamily, textColor),
    ...accountsWithAllocation.flatMap((account) => [
      paragraph(account.label, { bold: true, spacingBefore: 180, spacingAfter: 80 }, fontFamily, textColor),
      table(
        [
          [
            headerCell("Asset Class", tableHeaderColor, DEFAULT_TEXT_COLOR, 28),
            headerCell("Current", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
            headerCell("Risk Profile", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
            headerCell("Recommended", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
            headerCell("Variance", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
          ],
          ...account.allocationComparison.map((row) => {
            const isTotalRow =
              row.assetClass.toLowerCase().startsWith("total defensive") ||
              row.assetClass.toLowerCase().startsWith("total growth");
            const cell = isTotalRow ? totalCell : (text: string, _fill: string, _color: string, widthPct?: number) => ({ text, widthPct });

            return [
              cell(row.assetClass, tableHeaderColor, DEFAULT_TEXT_COLOR, 28),
              cell(formatPercent(row.currentPct), tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
              cell(formatPercent(row.riskProfilePct), tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
              cell(formatPercent(row.recommendedPct), tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
              cell(formatPercent(row.variancePct), tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
            ];
          }),
        ],
        fontFamily,
        textColor,
      ),
    ]),
    recommendedRows.length
      ? [
          heading("Recommended Asset Allocation Split", 2, fontFamily),
          assets.allocationChartPng
            ? imageParagraph(ALLOCATION_CHART_RELATIONSHIP_ID, "Recommended Asset Allocation Split", 5486400, 2599200)
            : "",
          table(
            [
              [headerCell("Asset Class", tableHeaderColor, DEFAULT_TEXT_COLOR, 70), headerCell("Recommended", tableHeaderColor, DEFAULT_TEXT_COLOR, 30)],
              ...recommendedRows.map((row) => [
                { text: row.assetClass, widthPct: 70 },
                { text: formatPercent(row.recommendedPct), widthPct: 30 },
              ]),
            ],
            fontFamily,
            textColor,
          ),
        ].join("")
      : "",
  ].join("");
}

function buildReplacementAnalysis(input: SoaDocxExportInput, fontFamily: string, textColor: string, tableHeaderColor: string) {
  const replacementRecommendations = input.adviceCase.recommendations.replacement;

  if (!replacementRecommendations.length) {
    return "";
  }

  const productRexReports = input.adviceCase.productRexReports ?? [];

  return [
    sectionTitle("Replacement Analysis", fontFamily),
    normal(REPLACEMENT_ANALYSIS_INTRO, fontFamily, textColor),
    ...productRexReports.map((report) =>
      {
        const columns = getProductRexComparisonColumns(report);
        const itemWidth = 25;
        const valueWidth = (100 - itemWidth) / Math.max(columns.length, 1);

        return [
          heading("Platform Fee Comparison", 2, fontFamily),
          report.ownerName ? paragraph(report.ownerName, { bold: true, spacingBefore: 80, spacingAfter: 80 }, fontFamily, textColor) : "",
          productRexReports.length > 1 ? normal(report.sourceFileName, fontFamily, textColor) : "",
          table(
            [
              [
                headerCell("Item", tableHeaderColor, DEFAULT_TEXT_COLOR, itemWidth),
                ...columns.map((column) => headerCell(toTitleCase(column.status), tableHeaderColor, DEFAULT_TEXT_COLOR, valueWidth)),
              ],
              [
                totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, itemWidth),
                ...columns.map((column) => totalCell(column.productName || "-", tableHeaderColor, DEFAULT_TEXT_COLOR, valueWidth)),
              ],
              ...report.platformComparisonRows.map((row) => [
                { text: row.label, widthPct: itemWidth },
                ...columns.map((_, columnIndex) => ({ text: row.values?.[columnIndex] || "-", widthPct: valueWidth })),
              ]),
            ],
            fontFamily,
            textColor,
          ),
        ].join("");
      },
    ),
    heading("Replacement Reasons", 2, fontFamily),
    ...replacementRecommendations.map((recommendation, index) =>
      normal(
        `${replacementRecommendations.length > 1 ? `Replacement ${index + 1}: ` : ""}${
          recommendation.replacementReasonText || "Replacement rationale has not been drafted yet."
        }`,
        fontFamily,
        textColor,
      ),
    ),
  ].join("");
}

function buildProjections(input: SoaDocxExportInput, fontFamily: string, textColor: string, tableHeaderColor: string) {
  const projections = input.adviceCase.financialProjections ?? [];

  if (!projections.length) {
    return [
      sectionTitle("Projected Outcomes", fontFamily),
      heading("Assumptions", 2, fontFamily),
      normal("Projection assumptions will be included here once the projection modelling has been completed.", fontFamily, textColor),
      heading("Cashflow and Taxation Projections", 2, fontFamily),
      normal("Maintaining adequate cashflow to meet living expenses is fundamental to the success of your plan. A summary of estimated income, expenses, tax and overall cashflow after implementing our recommendations will be included here.", fontFamily, textColor),
      heading("Capital Projections", 2, fontFamily),
      normal("Charts showing your projected cashflow and capital position will be included here. Values will be adjusted for inflation and shown in today's dollars where applicable.", fontFamily, textColor),
      heading("Key Outcome", 2, fontFamily),
      normal("The key projected outcome will be included here once the projection analysis has been completed.", fontFamily, textColor),
    ].join("");
  }

  return [
    sectionTitle("Projected Outcomes", fontFamily),
    ...projections.flatMap((projection, index) => [
      index > 0 ? pageBreak() : "",
      heading(projection.name || `Projection ${index + 1}`, 2, fontFamily),
      projection.purpose ? normal(projection.purpose, fontFamily, textColor) : "",
      projection.inputsSummary ? normal(projection.inputsSummary, fontFamily, textColor) : "",
      heading("Assumptions", 2, fontFamily),
      table(
        [
          [headerCell("Assumption", tableHeaderColor, DEFAULT_TEXT_COLOR, 45), headerCell("Value", tableHeaderColor, DEFAULT_TEXT_COLOR, 55)],
          [{ text: "Inflation", widthPct: 45 }, { text: formatPercent(projection.assumptions.inflationPct), widthPct: 55 }],
          [{ text: "Earnings rate", widthPct: 45 }, { text: formatPercent(projection.assumptions.earningsRatePct), widthPct: 55 }],
          [{ text: "Salary growth", widthPct: 45 }, { text: formatPercent(projection.assumptions.salaryGrowthPct), widthPct: 55 }],
          [{ text: "Contribution growth", widthPct: 45 }, { text: formatPercent(projection.assumptions.contributionGrowthPct), widthPct: 55 }],
          [{ text: "Drawdown rate", widthPct: 45 }, { text: formatPercent(projection.assumptions.drawdownRatePct), widthPct: 55 }],
          [{ text: "Tax assumptions", widthPct: 45 }, { text: projection.assumptions.taxAssumptions || "-", widthPct: 55 }],
          [{ text: "Legislative assumptions", widthPct: 45 }, { text: projection.assumptions.legislativeAssumptions || "-", widthPct: 55 }],
          [{ text: "Notes", widthPct: 45 }, { text: projection.assumptions.notes || "-", widthPct: 55 }],
        ],
        fontFamily,
        textColor,
      ),
      heading("Key Outcome", 2, fontFamily),
      projection.outputs.currentPositionSummary ? normal(`Current position: ${projection.outputs.currentPositionSummary}`, fontFamily, textColor) : "",
      projection.outputs.recommendedPositionSummary ? normal(`Recommended position: ${projection.outputs.recommendedPositionSummary}`, fontFamily, textColor) : "",
      projection.outputs.betterPositionSummary ? normal(`Better position: ${projection.outputs.betterPositionSummary}`, fontFamily, textColor) : "",
      projection.outputs.keyMetrics.length
        ? table(
            [
              [
                headerCell("Metric", tableHeaderColor, DEFAULT_TEXT_COLOR, 40),
                headerCell("Current", tableHeaderColor, DEFAULT_TEXT_COLOR, 20),
                headerCell("Recommended", tableHeaderColor, DEFAULT_TEXT_COLOR, 20),
                headerCell("Difference", tableHeaderColor, DEFAULT_TEXT_COLOR, 20),
              ],
              ...projection.outputs.keyMetrics.map((metric) => [
                { text: metric.name, widthPct: 40 },
                { text: formatProjectionMetricValue(metric.currentValue, metric.unit), widthPct: 20 },
                { text: formatProjectionMetricValue(metric.recommendedValue, metric.unit), widthPct: 20 },
                { text: formatProjectionMetricValue(metric.differenceValue, metric.unit), widthPct: 20 },
              ]),
            ],
            fontFamily,
            textColor,
          )
        : "",
    ]),
  ].join("");
}

function buildFees(input: SoaDocxExportInput, fontFamily: string, textColor: string, tableHeaderColor: string) {
  const adviceCase = input.adviceCase;
  const adviceFeeTotal = adviceCase.fees.adviceFees.reduce((sum, fee) => sum + (fee.amount ?? 0), 0);
  const productFeeTotal = adviceCase.fees.productFees.reduce((sum, fee) => sum + (fee.amount ?? 0), 0);
  const productFeeGroups = getProductFeeGroups(adviceCase);
  const insuranceCommissions = adviceCase.fees.commissions.filter((commission) => commission.productType === "insurance");
  const upfrontTotal = insuranceCommissions.reduce((sum, commission) => sum + (getCommissionUpfrontAmount(commission) ?? 0), 0);
  const ongoingTotal = insuranceCommissions.reduce((sum, commission) => sum + (getCommissionOngoingAmount(commission) ?? 0), 0);
  const serviceAgreementFeeItems = adviceCase.agreements.feeAgreement?.feeItems ?? [];
  const totalServiceAgreementFees = serviceAgreementFeeItems.reduce((sum, feeItem) => sum + getServiceFeeAnnualAmount(feeItem), 0);

  return [
    sectionTitle("Fees and Disclosures", fontFamily),
    normal(FEES_AND_DISCLOSURES_INTRO, fontFamily, textColor),
    heading("Advice Preparation & Implementation Fee", 2, fontFamily),
    table(
      [
        [headerCell("Fee Type", tableHeaderColor, DEFAULT_TEXT_COLOR, 60), headerCell("Amount (including GST)", tableHeaderColor, DEFAULT_TEXT_COLOR, 40)],
        ...adviceCase.fees.adviceFees.map((fee) => [{ text: toTitleCase(fee.type), widthPct: 60 }, { text: formatCurrency(fee.amount), widthPct: 40 }]),
        [totalCell("Total", tableHeaderColor, DEFAULT_TEXT_COLOR, 60), totalCell(formatCurrency(adviceFeeTotal), tableHeaderColor, DEFAULT_TEXT_COLOR, 40)],
      ],
      fontFamily,
      textColor,
    ),
    heading("Product Fees", 2, fontFamily),
    normal(PRODUCT_FEES_INTRO, fontFamily, textColor),
    ...(productFeeGroups.length
      ? productFeeGroups.flatMap((group) => [
          paragraph(group.label, { bold: true, spacingBefore: 180, spacingAfter: 80 }, fontFamily, textColor),
          table(
            [
              [
                headerCell("Product", tableHeaderColor, DEFAULT_TEXT_COLOR, 38),
                headerCell("Fee Type", tableHeaderColor, DEFAULT_TEXT_COLOR, 24),
                headerCell("%", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
                headerCell("$", tableHeaderColor, DEFAULT_TEXT_COLOR, 20),
              ],
              ...group.fees.map((fee) => [
                { text: fee.productName || "-", widthPct: 38 },
                { text: fee.feeType, widthPct: 24 },
                { text: formatPercent(fee.percentage), widthPct: 18 },
                { text: formatCurrency(fee.amount), widthPct: 20 },
              ]),
              [
                totalCell("Total", tableHeaderColor, DEFAULT_TEXT_COLOR, 38),
                totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 24),
                totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
                totalCell(formatCurrency(group.fees.reduce((sum, fee) => sum + (fee.amount ?? 0), 0)), tableHeaderColor, DEFAULT_TEXT_COLOR, 20),
              ],
            ],
            fontFamily,
            textColor,
          ),
        ])
      : [normal("No product fees have been drafted.", fontFamily, textColor)]),
    productFeeGroups.length > 1
      ? table(
          [
            [
              totalCell("Total product fees", tableHeaderColor, DEFAULT_TEXT_COLOR, 80),
              totalCell(formatCurrency(productFeeTotal), tableHeaderColor, DEFAULT_TEXT_COLOR, 20),
            ],
          ],
          fontFamily,
          textColor,
        )
      : "",
    heading("Ongoing Fees", 2, fontFamily),
    table(
      [
        [
          headerCell("Entity", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
          headerCell("Product", tableHeaderColor, DEFAULT_TEXT_COLOR, 22),
          headerCell("Account Number", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
          headerCell("Fee Amount", tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
          headerCell("Frequency", tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
          headerCell("Total Annual Fee", tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
        ],
        ...(serviceAgreementFeeItems.length
          ? [
              ...serviceAgreementFeeItems.map((feeItem) => [
                { text: getOwnerName(adviceCase, feeItem.ownerPersonId), widthPct: 18 },
                { text: feeItem.productName || "-", widthPct: 22 },
                { text: feeItem.accountNumber || "-", widthPct: 18 },
                { text: formatCurrency(feeItem.feeAmount), widthPct: 14 },
                { text: getServiceFeeFrequencyLabel(feeItem.frequency), widthPct: 14 },
                { text: formatCurrency(getServiceFeeAnnualAmount(feeItem)), widthPct: 14 },
              ]),
              [
                totalCell("Total Annual Advice Fees", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
                totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 22),
                totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
                totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
                totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
                totalCell(formatCurrency(totalServiceAgreementFees), tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
              ],
            ]
          : [[{ text: "No ongoing fee rows have been drafted.", widthPct: 18 }, { text: "-", widthPct: 22 }, { text: "-", widthPct: 18 }, { text: "-", widthPct: 14 }, { text: "-", widthPct: 14 }, { text: "-", widthPct: 14 }]]),
      ],
      fontFamily,
      textColor,
    ),
    insuranceCommissions.length
      ? [
          heading("Insurance Commissions", 2, fontFamily),
          normal("The insurance commissions noted in the table below are not in addition to the premiums. The only amount you pay is the premium plus the policy fee.", fontFamily, textColor),
          table(
            [
              [
                headerCell("Policy Owner", tableHeaderColor, DEFAULT_TEXT_COLOR, 20),
                headerCell("Product", tableHeaderColor, DEFAULT_TEXT_COLOR, 24),
                headerCell("Upfront %", tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
                headerCell("Upfront $", tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
                headerCell("Ongoing %", tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
                headerCell("Ongoing $", tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
              ],
              ...insuranceCommissions.map((commission) => [
                { text: getOwnerName(adviceCase, commission.ownerPersonId), widthPct: 20 },
                { text: commission.productName || "-", widthPct: 24 },
                { text: formatPercent(getCommissionUpfrontPercentage(commission)), widthPct: 14 },
                { text: formatCurrency(getCommissionUpfrontAmount(commission)), widthPct: 14 },
                { text: formatPercent(getCommissionOngoingPercentage(commission)), widthPct: 14 },
                { text: formatCurrency(getCommissionOngoingAmount(commission)), widthPct: 14 },
              ]),
              [
                totalCell("Total Commission Amount", tableHeaderColor, DEFAULT_TEXT_COLOR, 20),
                totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 24),
                totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
                totalCell(formatCurrency(upfrontTotal), tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
                totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
                totalCell(formatCurrency(ongoingTotal), tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
              ],
            ],
            fontFamily,
            textColor,
          ),
        ].join("")
      : "",
  ].join("");
}

function buildAuthorityToProceed(input: SoaDocxExportInput, fontFamily: string, textColor: string) {
  const adviceCase = input.adviceCase;
  const clientNames = getClientNames(adviceCase, input.clientName);
  const practiceName = input.practiceName || adviceCase.practice.name || "<<practice>>";
  const adviserName = input.adviserName || adviceCase.metadata.createdBy?.name || "<<adviser>>";
  const hasInsuranceCommission = adviceCase.fees.commissions.some((commission) => commission.productType === "insurance");
  const signaturePeople = adviceCase.clientGroup.clients.length
    ? adviceCase.clientGroup.clients.slice(0, 2)
    : [{ personId: "client", fullName: clientNames }];
  const signatureColumnWidth = signaturePeople.length > 1 ? 50 : 100;
  const signatureLine = "________________________________";

  return [
    sectionTitle("Authority to Proceed", fontFamily),
    normal(formatDate(input.savedAt), fontFamily, textColor),
    normal(clientNames, fontFamily, textColor),
    bullet(`I have read and understood this Statement of Advice (SOA) prepared by my adviser and dated ${formatDate(input.savedAt)}, including the disclosure of fees and commission.`, fontFamily, textColor),
    bullet("I confirm that the information provided by me and restated in this SOA accurately summarises my current circumstances.", fontFamily, textColor),
    bullet("I understand that the recommendations in this SOA have been prepared for my sole use and are current for a period of 60 days from the date of the SOA.", fontFamily, textColor),
    bullet("I have received your Financial Services Guide and understood the contents.", fontFamily, textColor),
    bullet("I accept the recommendations offered in this document and authorise my adviser to implement all recommendations.", fontFamily, textColor),
    hasInsuranceCommission
      ? bullet(`I/we consent to ${practiceName} receiving the monetary benefits in connection with the life risk insurance product recommendations as set out in the insurance commission disclosure section of this SOA.`, fontFamily, textColor)
      : "",
    table(
      [
        [{ text: "Variations to Advice", bold: true, color: activeHeadingColor, widthPct: 100 }],
        [
          {
            text: "I agree to proceed as varied below. I understand that by choosing to implement a variation to the advice, I risk making a financial decision that may be inappropriate to my needs.",
            widthPct: 100,
          },
        ],
        [{ text: " ", widthPct: 100 }],
        [{ text: signatureLine.repeat(2), widthPct: 100 }],
        [{ text: signatureLine.repeat(2), widthPct: 100 }],
        [{ text: signatureLine.repeat(2), widthPct: 100 }],
      ],
      fontFamily,
      textColor,
    ),
    table(
      [
        signaturePeople.map(() => ({ text: "Signed:", widthPct: signatureColumnWidth })),
        signaturePeople.map(() => ({ text: signatureLine, widthPct: signatureColumnWidth })),
        signaturePeople.map((person) => ({ text: person.fullName, bold: true, widthPct: signatureColumnWidth })),
        signaturePeople.map(() => ({ text: "Date:", widthPct: signatureColumnWidth })),
        signaturePeople.map(() => ({ text: signatureLine, widthPct: signatureColumnWidth })),
      ],
      fontFamily,
      textColor,
    ),
    emptyParagraph(),
    normal(`Adviser: ${adviserName}`, fontFamily, textColor),
  ].join("");
}

function buildServiceAgreement(input: SoaDocxExportInput, fontFamily: string, textColor: string, tableHeaderColor: string) {
  const adviceCase = input.adviceCase;
  const clientNames = getClientNames(adviceCase, input.clientName);
  const practiceName = input.clientProfile?.adviser?.practice?.name?.trim() || input.clientProfile?.practice?.trim() || input.practiceName || adviceCase.practice.name || "<<practice>>";
  const adviserName = input.clientProfile?.adviser?.name?.trim() || input.adviserName || adviceCase.metadata.createdBy?.name || "<<adviser>>";
  const adviserEmail = input.clientProfile?.adviser?.email?.trim() || "<<adviser.email>>";
  const adviserPhone = getAdviserPhone(input.clientProfile);
  const licenseeName = input.clientProfile?.adviser?.licensee?.name?.trim() || input.clientProfile?.licensee?.trim() || adviceCase.licensee.name || "Insight Investment Partners";
  const serviceAgreement = buildServiceAgreementSectionModel({
    adviceCase,
    savedAt: input.savedAt,
    clientNames,
    adviserName,
    adviserEmail,
    adviserPhone,
    practiceName,
    licenseeName,
    getOwnerName: (ownerPersonId?: string | null) => getOwnerName(adviceCase, ownerPersonId),
  });

  if (!serviceAgreement) {
    return "";
  }

  const isFixedTermAgreement = serviceAgreement.isFixedTermAgreement;
  const agreementTitle = serviceAgreement.agreementTitle;
  const arrangementLabel = serviceAgreement.arrangementLabel;
  const serviceAgreementFeeItems = serviceAgreement.feeItems;
  const totalServiceAgreementFees = serviceAgreement.totalAnnualFees;
  const serviceGroups = serviceAgreement.serviceGroups;
  const referenceDate = serviceAgreement.referenceDate;
  const expiryDate = serviceAgreement.expiryDate;
  const signatureNames = serviceAgreement.signatureNames;
  const signatureWidth = signatureNames.length > 1 ? 50 : 100;
  const signatureLine = "________________________________";
  const feeRows = serviceAgreement.feeRows.length
    ? serviceAgreement.feeRows.map((feeRow) => [
        { text: feeRow.accountLabel, widthPct: 28 },
        { text: "Flat Fee", widthPct: 18 },
        { text: feeRow.frequencyLabel, widthPct: 18 },
        { text: formatCurrency(feeRow.feeItem.feeAmount), widthPct: 18 },
        { text: formatCurrency(feeRow.annualAmount), widthPct: 18 },
      ])
    : [[{ text: "No advice fee rows have been drafted.", widthPct: 100 }]];

  return [
    sectionTitle(agreementTitle, fontFamily),
    normal(formatDate(input.savedAt), fontFamily, textColor),
    normal(clientNames, fontFamily, textColor),
    normal(
      isFixedTermAgreement
        ? "As your Financial Adviser, it is our role to provide you with the advice you need to achieve your financial goals. The purpose of this letter is to establish an Annual Advice Agreement."
        : "As your Financial Adviser, it is our role to provide you with the advice you need to achieve your financial goals. This Ongoing Service Agreement sets out the terms and conditions of our services.",
      fontFamily,
      textColor,
    ),
    normal(
      isFixedTermAgreement
        ? "The services you receive as part of your Annual Advice Agreement are important as they offer support to help you stay on track. The terms of the Annual Advice Agreement, including the services you are entitled to and the cost, are set out below."
        : "We cannot enter into an Ongoing Service Agreement without this agreement and the relevant fee consent being signed and dated by you. Your ongoing fee arrangement will need to be renewed annually.",
      fontFamily,
      textColor,
    ),
    heading(isFixedTermAgreement ? "My Annual Advice Service Includes" : "The Services You Are Entitled To Receive", 2, fontFamily),
    serviceGroups
      .map((group) =>
        [
          group.heading ? paragraph(group.heading, { bold: true }, fontFamily, textColor) : "",
          ...group.items.map((item) => bullet(item, fontFamily, textColor)),
        ].join(""),
      )
      .join(""),
    heading("Fees Payable", 2, fontFamily),
    normal("The fees payable for this agreement are set out in the Fees and Disclosures section of this Statement of Advice. All fees include GST where applicable.", fontFamily, textColor),
    table(
      [
        [
          headerCell("Entity", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
          headerCell("Product", tableHeaderColor, DEFAULT_TEXT_COLOR, 22),
          headerCell("Account Number", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
          headerCell("Fee Amount", tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
          headerCell("Frequency", tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
          headerCell("Total Annual Fee", tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
        ],
        ...(serviceAgreementFeeItems.length
          ? [
              ...serviceAgreementFeeItems.map((feeItem) => [
                { text: getOwnerName(adviceCase, feeItem.ownerPersonId), widthPct: 18 },
                { text: feeItem.productName || "-", widthPct: 22 },
                { text: feeItem.accountNumber || "-", widthPct: 18 },
                { text: formatCurrency(feeItem.feeAmount), widthPct: 14 },
                { text: getServiceFeeFrequencyLabel(feeItem.frequency), widthPct: 14 },
                { text: formatCurrency(getServiceFeeAnnualAmount(feeItem)), widthPct: 14 },
              ]),
              [
                totalCell("Total Annual Advice Fees", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
                totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 22),
                totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
                totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
                totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
                totalCell(formatCurrency(totalServiceAgreementFees), tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
              ],
            ]
          : [[{ text: "No annual advice fee rows have been drafted.", widthPct: 100 }]]),
      ],
      fontFamily,
      textColor,
    ),
    table(
      [
        signatureNames.map(() => ({ text: "Signed:", widthPct: signatureWidth })),
        signatureNames.map(() => ({ text: signatureLine, widthPct: signatureWidth })),
        signatureNames.map((name) => ({ text: name, bold: true, widthPct: signatureWidth })),
        signatureNames.map(() => ({ text: "Date:", widthPct: signatureWidth })),
        signatureNames.map(() => ({ text: signatureLine, widthPct: signatureWidth })),
      ],
      fontFamily,
      textColor,
    ),
    pageBreak(),
    sectionTitle("Consent To Deduct Fees From Your Account", fontFamily),
    normal("We are required to obtain your written consent to deduct the fees payable for our services for the upcoming 12 months. Without your consent, this agreement cannot be entered into.", fontFamily, textColor),
    normal("Accordingly, no ongoing services or advice will be delivered if you do not return this signed and dated form consenting to payment of our advice fees.", fontFamily, textColor),
    normal(`You can terminate this ${arrangementLabel} at any time by providing us with written notice. If you terminate the arrangement in writing, no further fees will be charged to you, and no further services will be provided by us.`, fontFamily, textColor),
    heading(`What fees are payable under my ${arrangementLabel}?`, 2, fontFamily),
    normal("The following fees will be payable to cover the services you are entitled to receive under the arrangement:", fontFamily, textColor),
    table(
      [
        [
          headerCell("Account", tableHeaderColor, DEFAULT_TEXT_COLOR, 28),
          headerCell("Fee Structure", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
          headerCell("Frequency", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
          headerCell("Adviser Service Fee", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
          headerCell("Annualised", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
        ],
        ...feeRows,
        [
          totalCell("Total Annual Adviser Service Fee", tableHeaderColor, DEFAULT_TEXT_COLOR, 28),
          totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
          totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
          totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
          totalCell(formatCurrency(totalServiceAgreementFees), tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
        ],
      ],
      fontFamily,
      textColor,
    ),
    heading("The services you are entitled to receive", 2, fontFamily),
    normal("The terms of this service arrangement, including the services you are entitled to and the cost, are set out below.", fontFamily, textColor),
    serviceGroups
      .map((group) =>
        [
          group.heading ? paragraph(group.heading, { bold: true }, fontFamily, textColor) : "",
          ...group.items.map((item) => bullet(item, fontFamily, textColor)),
        ].join(""),
      )
      .join(""),
    heading("Who is my financial adviser under this agreement?", 2, fontFamily),
    normal("Your financial adviser and fee recipient is as follows:", fontFamily, textColor),
    normal(adviserName, fontFamily, textColor),
    normal(practiceName, fontFamily, textColor),
    normal(adviserEmail, fontFamily, textColor),
    normal(adviserPhone, fontFamily, textColor),
    normal(`Authorised Representative of ${licenseeName}`, fontFamily, textColor),
    normal("AFSL No: 368175", fontFamily, textColor),
    heading("How long will my consent last?", 2, fontFamily),
    normal(`Your ongoing fee arrangement reference day is ${formatDate(referenceDate)}.`, fontFamily, textColor),
    normal(`Your consent will expire on ${formatDate(expiryDate)}.`, fontFamily, textColor),
    normal(`We will contact you prior to this with instructions about how you can renew your fee arrangement. If you choose not to provide your consent to renew the arrangement, no further fees will be charged, or services provided, after ${formatDate(expiryDate)}.`, fontFamily, textColor),
    heading("Your consent to deduct fees from your account", 2, fontFamily),
    normal("I/we consent to the payment of advice fees in accordance with the terms of this fee consent form.", fontFamily, textColor),
    table(
      [
        signatureNames.map(() => ({ text: "Signed:", widthPct: signatureWidth })),
        signatureNames.map(() => ({ text: signatureLine, widthPct: signatureWidth })),
        signatureNames.map((name) => ({ text: name, bold: true, widthPct: signatureWidth })),
        signatureNames.map(() => ({ text: "Date:", widthPct: signatureWidth })),
        signatureNames.map(() => ({ text: signatureLine, widthPct: signatureWidth })),
      ],
      fontFamily,
      textColor,
    ),
  ].join("");
}

function buildAppendix(input: SoaDocxExportInput, fontFamily: string, textColor: string, tableHeaderColor: string) {
  const investmentPdsGroups = getInvestmentPdsGroups(input.adviceCase);
  const insurancePdsRows = getInsurancePdsRows(input.adviceCase);
  const transactionRows = (input.adviceCase.productRexReports ?? []).flatMap((report) => report.transactionRows);
  const transactionTotal = transactionRows.reduce((sum, row) => sum + (row.buySellSpreadAmount ?? 0) + (row.brokerageAmount ?? 0), 0);

  return [
    sectionTitle("Appendix", fontFamily),
    normal("Supporting material, calculations, additional comparisons, and reference tables can be included in this appendix as the SOA draft is refined further.", fontFamily, textColor),
    pageBreak(),
    sectionTitle("Product Disclosure Statements (PDS)", fontFamily),
    normal("The following Product Disclosure Statements should be provided where applicable.", fontFamily, textColor),
    ...(investmentPdsGroups.length
      ? investmentPdsGroups.flatMap((group) => [
          paragraph(group.label, { bold: true, spacingBefore: 180, spacingAfter: 80 }, fontFamily, textColor),
          table(
            [
              [headerCell("Product", tableHeaderColor, DEFAULT_TEXT_COLOR, 70), headerCell("PDS Provided", tableHeaderColor, DEFAULT_TEXT_COLOR, 30)],
              ...group.rows.map((row) => [{ text: row.productName, widthPct: 70 }, { text: row.pdsProvided, widthPct: 30 }]),
            ],
            fontFamily,
            textColor,
          ),
        ])
      : [normal("No product disclosure statement rows have been recorded.", fontFamily, textColor)]),
    insurancePdsRows.length
      ? [
          paragraph("Insurance products", { bold: true, spacingBefore: 180, spacingAfter: 80 }, fontFamily, textColor),
          table(
            [
              [headerCell("Product", tableHeaderColor, DEFAULT_TEXT_COLOR, 70), headerCell("PDS Provided", tableHeaderColor, DEFAULT_TEXT_COLOR, 30)],
              ...insurancePdsRows.map((row) => [{ text: row.productName, widthPct: 70 }, { text: row.pdsProvided, widthPct: 30 }]),
            ],
            fontFamily,
            textColor,
          ),
        ].join("")
      : "",
    transactionRows.length ? pageBreak() : "",
    transactionRows.length ? sectionTitle("Transaction Costs", fontFamily) : "",
    transactionRows.length
      ? table(
          [
            [
              headerCell("Fund", tableHeaderColor, DEFAULT_TEXT_COLOR, 42),
              headerCell("Transaction", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
              headerCell("Buy/Sell %", tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
              headerCell("Buy/Sell $", tableHeaderColor, DEFAULT_TEXT_COLOR, 13),
              headerCell("Brokerage", tableHeaderColor, DEFAULT_TEXT_COLOR, 13),
            ],
            ...groupTransactionsByPlatform(transactionRows).flatMap(([platformName, rows]) => [
              [
                { text: platformName, bold: true, widthPct: 42 },
                { text: "", widthPct: 18 },
                { text: "", widthPct: 14 },
                { text: "", widthPct: 13 },
                { text: "", widthPct: 13 },
              ],
              ...rows.map((row) => [
                { text: row.fundName, widthPct: 42 },
                { text: formatCurrency(row.transactionAmount), widthPct: 18 },
                { text: formatPercent(row.buySellSpreadPct), widthPct: 14 },
                { text: formatCurrency(row.buySellSpreadAmount), widthPct: 13 },
                { text: formatCurrency(row.brokerageAmount), widthPct: 13 },
              ]),
            ]),
            [
              totalCell("Total", tableHeaderColor, DEFAULT_TEXT_COLOR, 42),
              totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 18),
              totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 14),
              totalCell(formatCurrency(transactionTotal), tableHeaderColor, DEFAULT_TEXT_COLOR, 13),
              totalCell("", tableHeaderColor, DEFAULT_TEXT_COLOR, 13),
            ],
          ],
          fontFamily,
          textColor,
        )
      : "",
  ].join("");
}

function buildDocument(input: SoaDocxExportInput, assets: DocxBuildAssets) {
  const fontFamily = input.renderStyle.fontFamily || DEFAULT_DOCUMENT_STYLE_PROFILE.fontFamily;
  const textColor = normalizeHexColor(
    input.renderStyle.bodyTextColor ?? input.renderStyle.fontColor,
    DEFAULT_TEXT_COLOR,
  );
  const tableHeaderColor = normalizeHexColor(input.renderStyle.tableHeaderColor, DEFAULT_TABLE_HEADER_COLOR);
  activeHeadingColor = normalizeHexColor(
    input.renderStyle.headingColor ?? input.renderStyle.tableAccentColor,
    DEFAULT_HEADING_COLOR,
  );
  const replacementAnalysis = buildReplacementAnalysis(input, fontFamily, textColor, tableHeaderColor);
  const insuranceNeedsAnalysis = buildInsuranceNeedsAnalysis(input, fontFamily, textColor, tableHeaderColor);
  const insuranceRecommendations = buildInsuranceRecommendations(input, fontFamily, textColor, tableHeaderColor);
  const insuranceReplacement = buildInsuranceReplacement(input, fontFamily, textColor, tableHeaderColor);
  const serviceAgreement = buildServiceAgreement(input, fontFamily, textColor, tableHeaderColor);

  const body = [
    buildLetter(input, fontFamily, textColor),
    pageBreak(),
    buildCover(input, fontFamily, textColor),
    pageBreak(),
    buildContents(input, fontFamily, textColor, tableHeaderColor),
    pageBreak(),
    buildExecutiveSummary(input, fontFamily, textColor, tableHeaderColor),
    pageBreak(),
    buildAbout(input, fontFamily, textColor),
    pageBreak(),
    buildPersonalFinancialPosition(input, fontFamily, textColor, tableHeaderColor),
    pageBreak(),
    buildRiskProfile(input, fontFamily, textColor, tableHeaderColor),
    pageBreak(),
    buildStrategyRecommendations(input, fontFamily, textColor),
    pageBreak(),
    buildProductRecommendations(input, fontFamily, textColor, tableHeaderColor),
    pageBreak(),
    buildInvestmentPortfolioRecommendations(input, fontFamily, textColor, tableHeaderColor),
    pageBreak(),
    buildPortfolioAllocation(input, fontFamily, textColor, tableHeaderColor, assets),
    pageBreak(),
    ...(replacementAnalysis ? [replacementAnalysis, pageBreak()] : []),
    ...(insuranceNeedsAnalysis ? [insuranceNeedsAnalysis, pageBreak()] : []),
    ...(insuranceRecommendations ? [insuranceRecommendations, pageBreak()] : []),
    ...(insuranceReplacement ? [insuranceReplacement, pageBreak()] : []),
    buildProjections(input, fontFamily, textColor, tableHeaderColor),
    pageBreak(),
    buildFees(input, fontFamily, textColor, tableHeaderColor),
    pageBreak(),
    buildAuthorityToProceed(input, fontFamily, textColor),
    pageBreak(),
    ...(serviceAgreement ? [serviceAgreement, pageBreak()] : []),
    buildAppendix(input, fontFamily, textColor, tableHeaderColor),
  ].join("");

  return documentXml(body);
}

export async function buildSoaDocx(input: SoaDocxExportInput) {
  const allocationChartSlices = buildAllocationChartSlices(getPrimaryAllocationRows(input.adviceCase));
  const allocationChartPng = await buildAllocationChartPng(allocationChartSlices);
  const assets: DocxBuildAssets = { allocationChartPng };
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES_XML);
  zip.folder("_rels")?.file(".rels", ROOT_RELS_XML);
  const word = zip.folder("word");
  word?.file("document.xml", buildDocument(input, assets));
  word?.file("styles.xml", STYLES_XML);
  word?.folder("_rels")?.file("document.xml.rels", documentRelsXml(Boolean(allocationChartPng)));
  if (allocationChartPng) {
    word?.folder("media")?.file("asset-allocation.png", allocationChartPng);
  }

  const blob = await zip.generateAsync({ type: "blob", mimeType: DOCX_MIME_TYPE });
  const fileName = `${sanitizeOutputName(getClientNames(input.adviceCase, input.clientName))}-Statement-of-Advice.docx`;

  return { blob, fileName };
}
