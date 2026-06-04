"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import JSZip from "jszip";
import { currentProjectionAssumptions } from "@/lib/projections/assumptions";
import { isCashAssetType, isInvestmentAssetType } from "@/lib/projections/assets-engine";
import { runProjection } from "@/lib/projections/engine";
import { isCashflowExpenseCategory, isCashflowIncomeCategory } from "@/lib/projections/types";
import type { ProjectionScenario } from "@/lib/projections/types";
import {
  readSoaProjectionPackage,
  writeSoaProjectionPackage,
  writeSoaProjectionScenarioOptions,
} from "@/lib/projections/soa-projection-package";
import { listAdminLicensees } from "@/lib/api/admin";
import type { ClientProfile, LicenseeDto, LicenseeRiskProfile, PersonRecord } from "@/lib/api/types";
import type { FinancialProjectionV1 } from "@/lib/soa-types";
import styles from "./projections.module.css";

type ScenarioMapResponse = {
  scenario?: ProjectionScenario;
  source?: "llm" | "fallback";
  model?: string | null;
  mappingNotes?: string[];
  confirmationsRequired?: string[];
  warning?: string;
  error?: string;
};

type ProjectionSection =
  | "scenario-inputs"
  | "personal-cashflow"
  | "taxation"
  | "assets-liabilities"
  | "superannuation"
  | "pensions"
  | "centrelink"
  | "assumptions";

type ScenarioInputTab =
  | "scenario-details"
  | "cashflow"
  | "assets-liabilities"
  | "superannuation"
  | "pensions";

type ScenarioAssumptionOverrides = {
  cpiRate: number;
  superGuaranteeRate: number;
  concessionalContributionsCap: number;
  contributionsTaxRate: number;
  investmentEarningsTaxRate: number;
  riskProfiles: Record<
    string,
    {
      incomeRate: number;
      growthRate: number;
      standardDeviation?: number | null;
      defensivePct?: number | null;
      growthPct?: number | null;
      strategicAllocations?: Array<{
        assetClassId: string;
        assetClassName: string;
        category: "Defensive" | "Growth";
        targetPct: number;
        minimumPct?: number | null;
        maximumPct?: number | null;
      }>;
    }
  >;
};

type ProjectionTableRow = {
  label: string;
  values: string[];
  isSection?: boolean;
  isTotal?: boolean;
  control?: "surplus-allocation";
};

type ProjectionTableGroup = {
  groupId: string;
  title: string;
  ownerPersonId: string;
  ownerName: string;
  subtitle: string;
  rows: ProjectionTableRow[];
};

type ProjectionChartSeries = {
  label: string;
  values: number[];
  color: string;
};

type WorkbookCell = string | number | boolean | null | undefined;

type WorkbookChart = {
  title: string;
  barSeriesCount: number;
  lineColumnIndex: number;
};

type WorkbookSheet = {
  name: string;
  rows: WorkbookCell[][];
  chart?: WorkbookChart;
};

type ClientImportStatus = "idle" | "importing" | "imported" | "error";

type StoredProjectionWorkspaceState = {
  scenarios: ProjectionScenario[];
  activeScenarioId: string | null;
  scenarioAssumptionOverrides: ScenarioAssumptionOverrides;
  activeSection: ProjectionSection;
  activeScenarioInputTab: ScenarioInputTab | "scenario-assumptions";
  updatedAt: string;
};

const projectionSections: Array<{ id: ProjectionSection; label: string }> = [
  { id: "scenario-inputs", label: "Scenario inputs" },
  { id: "personal-cashflow", label: "Personal cash flow" },
  { id: "taxation", label: "Taxation" },
  { id: "assets-liabilities", label: "Asset and Liabilities" },
  { id: "superannuation", label: "Superannuation" },
  { id: "pensions", label: "Pensions" },
  { id: "centrelink", label: "Centrelink" },
  { id: "assumptions", label: "Assumptions" },
];

const cashflowChartPalette = [
  "#2fb9bc",
  "#f4766c",
  "#4d8ed8",
  "#f0b33b",
  "#6f74d9",
  "#46a56f",
  "#c76aa7",
  "#7b8794",
];

const projectionAssetTypeOptions: Array<{ value: ProjectionScenario["assets"][number]["type"]; label: string }> = [
  { value: "primary-residence", label: "Primary residence" },
  { value: "cash", label: "Cash" },
  { value: "bank-account", label: "Bank account" },
  { value: "offset-account", label: "Offset account" },
  { value: "term-deposit", label: "Term deposit" },
  { value: "investment", label: "Investment portfolio" },
  { value: "investment-property", label: "Investment property" },
  { value: "australian-shares", label: "Australian shares" },
  { value: "international-shares", label: "International shares" },
  { value: "managed-fund", label: "Managed fund" },
  { value: "etf", label: "ETF" },
  { value: "funeral-bond", label: "Funeral bond" },
  { value: "home-contents", label: "Home contents" },
  { value: "motor-vehicle", label: "Motor vehicle" },
  { value: "personal-asset", label: "Personal asset" },
  { value: "business", label: "Business asset" },
  { value: "other", label: "Other asset" },
];
const projectionCgtTreatmentOptions: Array<{
  value: NonNullable<ProjectionScenario["assets"][number]["cgtTreatment"]>;
  label: string;
}> = [
  { value: "taxable", label: "Taxable CGT asset" },
  { value: "main-residence-exempt", label: "Main residence exempt" },
  { value: "personal-use-exempt", label: "Personal use exempt" },
  { value: "not-applicable", label: "Not applicable" },
];
const defaultChartTickCount = 5;

const scenarioInputTabs: Array<{ id: ScenarioInputTab; label: string }> = [
  { id: "scenario-details", label: "Scenario details" },
  { id: "cashflow", label: "Cashflow" },
  { id: "assets-liabilities", label: "Assets and liabilities" },
  { id: "superannuation", label: "Superannuation" },
  { id: "pensions", label: "Pensions" },
];

const incomeCategoryOptions: Array<{ value: ProjectionScenario["cashflowItems"][number]["category"]; label: string }> = [
  { value: "employment-income", label: "Employment income" },
  { value: "salary-income", label: "Salary or wages" },
  { value: "business-income", label: "Business income" },
  { value: "rental-income", label: "Rental income" },
  { value: "investment-income", label: "Investment income" },
  { value: "superannuation-income", label: "Superannuation income" },
  { value: "pension-income", label: "Pension income" },
  { value: "centrelink-income", label: "Centrelink income" },
  { value: "annuity-income", label: "Annuity income" },
  { value: "other-income", label: "Other income" },
];

const expenseCategoryOptions: Array<{ value: ProjectionScenario["cashflowItems"][number]["category"]; label: string }> = [
  { value: "living-expense", label: "Living expense" },
  { value: "housing-expense", label: "Housing expense" },
  { value: "rent-expense", label: "Rent" },
  { value: "mortgage-repayment", label: "Mortgage repayment" },
  { value: "loan-repayment", label: "Loan repayment" },
  { value: "insurance-premium", label: "Insurance premium" },
  { value: "medical-expense", label: "Medical expense" },
  { value: "transport-expense", label: "Transport expense" },
  { value: "education-expense", label: "Education expense" },
  { value: "travel-expense", label: "Travel expense" },
  { value: "entertainment-expense", label: "Entertainment expense" },
  { value: "tax-expense", label: "Tax expense" },
  { value: "advice-fee", label: "Advice fee" },
  { value: "other-expense", label: "Other expense" },
];

function normalizeScenarioInputTab(tab: StoredProjectionWorkspaceState["activeScenarioInputTab"] | null | undefined): ScenarioInputTab {
  return scenarioInputTabs.some((candidate) => candidate.id === tab) ? tab as ScenarioInputTab : "scenario-details";
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnName(index: number) {
  let name = "";
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function safeSheetName(name: string) {
  const invalidSheetNameChars = new Set(["[", "]", ":", "*", "?", "/", "\\"]);
  const sanitized = Array.from(name)
    .map((character) => (invalidSheetNameChars.has(character) ? " " : character))
    .join("")
    .replace(/\s+/g, " ")
    .trim() || "Sheet";
  return sanitized.slice(0, 31);
}

function uniqueSheetName(name: string, usedNames: Set<string>) {
  const baseName = safeSheetName(name);
  let candidate = baseName;
  let index = 2;

  while (usedNames.has(candidate.toLowerCase())) {
    const suffix = ` ${index}`;
    candidate = `${baseName.slice(0, 31 - suffix.length)}${suffix}`;
    index += 1;
  }

  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function workbookSheetReference(sheetName: string) {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

function buildWorksheetXml(sheet: WorkbookSheet, sheetIndex: number) {
  const rowsXml = sheet.rows
    .map((row, rowIndex) => {
      const cellsXml = row
        .map((cell, columnIndex) => {
          const cellRef = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
          if (typeof cell === "number" && Number.isFinite(cell)) {
            return `<c r="${cellRef}"><v>${cell}</v></c>`;
          }
          if (typeof cell === "boolean") {
            return `<c r="${cellRef}" t="b"><v>${cell ? 1 : 0}</v></c>`;
          }

          return `<c r="${cellRef}" t="inlineStr"><is><t>${escapeXml(String(cell ?? ""))}</t></is></c>`;
        })
        .join("");

      return `<row r="${rowIndex + 1}">${cellsXml}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetData>${rowsXml}</sheetData>
  ${sheet.chart ? `<drawing r:id="rId${sheetIndex}"/>` : ""}
</worksheet>`;
}

function buildDrawingXml(chartIndex: number) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>20</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>12</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>42</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:graphicFrame macro="">
      <xdr:nvGraphicFramePr>
        <xdr:cNvPr id="${chartIndex + 1}" name="Projection Chart ${chartIndex}"/>
        <xdr:cNvGraphicFramePr/>
      </xdr:nvGraphicFramePr>
      <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
          <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/>
        </a:graphicData>
      </a:graphic>
    </xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;
}

function buildChartXml(sheet: WorkbookSheet, chartIndex: number) {
  const chart = sheet.chart;
  if (!chart) return "";

  const sheetRef = workbookSheetReference(sheet.name);
  const lastRow = Math.max(2, sheet.rows.length);
  const axisId = 10_000 + chartIndex;
  const valueAxisId = 20_000 + chartIndex;
  const lineAxisId = 30_000 + chartIndex;
  const categoryRef = `${sheetRef}!$A$2:$A$${lastRow}`;
  const barSeries = Array.from({ length: chart.barSeriesCount }, (_, index) => {
    const column = columnName(index + 2);
    const titleCell = `${sheetRef}!$${column}$1`;
    const valueRef = `${sheetRef}!$${column}$2:$${column}$${lastRow}`;

    return `<c:ser>
      <c:idx val="${index}"/><c:order val="${index}"/>
      <c:tx><c:strRef><c:f>${titleCell}</c:f></c:strRef></c:tx>
      <c:cat><c:strRef><c:f>${categoryRef}</c:f></c:strRef></c:cat>
      <c:val><c:numRef><c:f>${valueRef}</c:f></c:numRef></c:val>
    </c:ser>`;
  }).join("");
  const lineColumn = columnName(chart.lineColumnIndex);
  const lineTitleCell = `${sheetRef}!$${lineColumn}$1`;
  const lineValueRef = `${sheetRef}!$${lineColumn}$2:$${lineColumn}$${lastRow}`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:chart>
    <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${escapeXml(chart.title)}</a:t></a:r></a:p></c:rich></c:tx></c:title>
    <c:plotArea>
      <c:layout/>
      <c:barChart>
        <c:barDir val="col"/><c:grouping val="stacked"/>
        ${barSeries}
        <c:axId val="${axisId}"/><c:axId val="${valueAxisId}"/>
      </c:barChart>
      <c:lineChart>
        <c:grouping val="standard"/>
        <c:ser>
          <c:idx val="${chart.barSeriesCount}"/><c:order val="${chart.barSeriesCount}"/>
          <c:tx><c:strRef><c:f>${lineTitleCell}</c:f></c:strRef></c:tx>
          <c:cat><c:strRef><c:f>${categoryRef}</c:f></c:strRef></c:cat>
          <c:val><c:numRef><c:f>${lineValueRef}</c:f></c:numRef></c:val>
        </c:ser>
        <c:axId val="${axisId}"/><c:axId val="${lineAxisId}"/>
      </c:lineChart>
      <c:catAx><c:axId val="${axisId}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="b"/><c:crossAx val="${valueAxisId}"/><c:tickLblPos val="nextTo"/></c:catAx>
      <c:valAx><c:axId val="${valueAxisId}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="l"/><c:crossAx val="${axisId}"/><c:tickLblPos val="nextTo"/></c:valAx>
      <c:valAx><c:axId val="${lineAxisId}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="r"/><c:crossAx val="${axisId}"/><c:tickLblPos val="nextTo"/></c:valAx>
    </c:plotArea>
    <c:legend><c:legendPos val="b"/><c:layout/></c:legend>
    <c:plotVisOnly val="1"/>
  </c:chart>
</c:chartSpace>`;
}

async function downloadWorkbook(fileName: string, workbookSheets: WorkbookSheet[]) {
  const zip = new JSZip();
  const usedSheetNames = new Set<string>();
  const sheets = workbookSheets.map((sheet) => ({
    ...sheet,
    name: uniqueSheetName(sheet.name, usedSheetNames),
  }));
  const chartSheets = sheets
    .map((sheet, index) => ({ sheet, sheetIndex: index + 1 }))
    .filter(({ sheet }) => sheet.chart);

  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
  ${chartSheets.map((_, index) => `<Override PartName="/xl/drawings/drawing${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`).join("")}
  ${chartSheets.map((_, index) => `<Override PartName="/xl/charts/chart${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join("")}
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);
  zip.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Projection Export</dc:title>
  <dc:creator>iC2 Clients</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
</cp:coreProperties>`);
  zip.file("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>iC2 Clients</Application></Properties>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets>
</workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}
</Relationships>`);

  sheets.forEach((sheet, index) => {
    const sheetIndex = index + 1;
    zip.file(`xl/worksheets/sheet${sheetIndex}.xml`, buildWorksheetXml(sheet, sheetIndex));
  });
  chartSheets.forEach(({ sheet, sheetIndex }, chartIndex) => {
    const chartNumber = chartIndex + 1;
    zip.file(`xl/worksheets/_rels/sheet${sheetIndex}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId${sheetIndex}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${chartNumber}.xml"/>
</Relationships>`);
    zip.file(`xl/drawings/drawing${chartNumber}.xml`, buildDrawingXml(chartNumber));
    zip.file(`xl/drawings/_rels/drawing${chartNumber}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${chartNumber}.xml"/>
</Relationships>`);
    zip.file(`xl/charts/chart${chartNumber}.xml`, buildChartXml(sheet, chartNumber));
  });

  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

const editableRiskProfileNames = ["Cash", "Defensive", "Moderate", "Balanced", "Growth", "High Growth"];
const jointOwnerId = "joint";

const blankProjectionScenario: ProjectionScenario = {
  scenarioId: "blank-scenario",
  scenarioName: "Blank scenario",
  startYear: 2026,
  startMonth: 7,
  primaryPersonId: "client",
  projectionEnd: {
    type: "life-expectancy",
    personId: "client",
  },
  people: [
    {
      personId: "client",
      name: "Client",
      role: "client",
      gender: "unknown",
      dateOfBirth: null,
      startAge: 18,
      retirementAge: null,
      relationshipStatus: null,
      isHomeowner: false,
    },
  ],
  dependants: [],
  assets: [],
  liabilities: [],
  assetSaleEvents: [],
  assetPurchaseEvents: [],
  liabilityDrawdownEvents: [],
  liabilityPaymentEvents: [],
  retirementAccounts: [],
  superContributionStrategies: [],
  superRolloverEvents: [],
  pensionWithdrawalEvents: [],
  cashflowItems: [],
  cashflowAllocation: {
    surplusTarget: null,
  },
};

function getInitialRiskProfileAssumptions() {
  return Object.fromEntries(
    editableRiskProfileNames.map((profileName) => {
      const profile = currentProjectionAssumptions.investmentProfiles.profiles[profileName];

      return [
        profileName,
        {
          incomeRate: profile?.incomeRate ?? 0,
          growthRate: profile?.growthRate ?? 0,
          standardDeviation: profile?.standardDeviation ?? null,
          defensivePct: profile?.defensivePct ?? null,
          growthPct: profile?.growthPct ?? null,
        },
      ];
    }),
  );
}

function normalizeLookupValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function activeLicenseeRiskProfiles(licensee: LicenseeDto | null | undefined) {
  return (licensee?.riskProfiles ?? [])
    .filter((profile) => profile?.riskProfileName?.trim() && profile.isActive !== false)
    .sort((left, right) => {
      const leftOrder = left.displayOrder ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.displayOrder ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left.riskProfileName.localeCompare(right.riskProfileName);
    });
}

function findClientLicensee(licensees: LicenseeDto[], profile: ClientProfile | null | undefined) {
  const clientLicenseeName = normalizeLookupValue(profile?.licensee);
  const adviserLicenseeName = normalizeLookupValue(profile?.adviser?.licensee?.name);
  const adviserLicenseeId = normalizeLookupValue(profile?.adviser?.licensee?.id);

  return (
    licensees.find((licensee) => adviserLicenseeId && normalizeLookupValue(licensee.id) === adviserLicenseeId) ??
    licensees.find((licensee) => adviserLicenseeName && normalizeLookupValue(licensee.name) === adviserLicenseeName) ??
    licensees.find((licensee) => clientLicenseeName && normalizeLookupValue(licensee.name) === clientLicenseeName) ??
    null
  );
}

function mapLicenseeRiskProfilesToProjectionAssumptions(riskProfiles: LicenseeRiskProfile[]) {
  return Object.fromEntries(
    riskProfiles.map((riskProfile) => {
      const name = riskProfile.riskProfileName.trim();
      const incomeRate = (riskProfile.expectedReturns?.expectedIncomePercent ?? 0) / 100;
      const growthRate = (riskProfile.expectedReturns?.expectedGrowthPercent ?? 0) / 100;
      const totalReturn = (riskProfile.expectedReturns?.totalExpectedReturnPercent ?? 0) / 100;
      const defensivePct = riskProfile.assetAllocationSummary?.defensiveAssetsPercent != null
        ? riskProfile.assetAllocationSummary.defensiveAssetsPercent / 100
        : null;
      const growthPct = riskProfile.assetAllocationSummary?.growthAssetsPercent != null
        ? riskProfile.assetAllocationSummary.growthAssetsPercent / 100
        : defensivePct != null
          ? Math.max(0, 1 - defensivePct)
          : null;

      return [
        name,
        {
          incomeRate,
          growthRate: growthRate || Math.max(0, totalReturn - incomeRate),
          standardDeviation: riskProfile.volatilityPercent != null ? riskProfile.volatilityPercent / 100 : null,
          defensivePct,
          growthPct,
          strategicAllocations: (riskProfile.strategicAssetAllocations ?? [])
            .filter((allocation) => allocation.assetClassName?.trim())
            .map((allocation) => ({
              assetClassId: allocation.assetClassId,
              assetClassName: allocation.assetClassName,
              category: allocation.category,
              targetPct: (allocation.targetPercent ?? 0) / 100,
              minimumPct: allocation.minimumPercent != null ? allocation.minimumPercent / 100 : null,
              maximumPct: allocation.maximumPercent != null ? allocation.maximumPercent / 100 : null,
            })),
        },
      ];
    }),
  );
}

function riskProfileAssumptionNames(riskProfiles: LicenseeRiskProfile[]) {
  const names = riskProfiles.map((profile) => profile.riskProfileName.trim()).filter(Boolean);
  return names.length ? names : editableRiskProfileNames;
}

function getInitialScenarioAssumptionOverrides(): ScenarioAssumptionOverrides {
  return {
    cpiRate: currentProjectionAssumptions.economic.cpiRate,
    superGuaranteeRate: currentProjectionAssumptions.legislative.superannuation.superGuaranteeRate,
    concessionalContributionsCap: currentProjectionAssumptions.legislative.superannuation.concessionalContributionsCap,
    contributionsTaxRate: currentProjectionAssumptions.legislative.superannuation.contributionsTaxRate,
    investmentEarningsTaxRate: currentProjectionAssumptions.legislative.superannuation.investmentEarningsTaxRate,
    riskProfiles: getInitialRiskProfileAssumptions(),
  };
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function projectionWorkspaceStorageKey(clientId: string, soaId: string) {
  if (clientId && soaId) {
    return `ic2:projection-workspace:${clientId}:${soaId}`;
  }

  if (clientId) {
    return `ic2:projection-workspace:${clientId}:standalone`;
  }

  return "ic2:projection-workspace:standalone";
}

function buildStoredProjectionWorkspaceState(
  state: Omit<StoredProjectionWorkspaceState, "updatedAt">,
): StoredProjectionWorkspaceState {
  return {
    ...state,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeProjectionScenario(scenario: ProjectionScenario): ProjectionScenario {
  const retirementAccounts = scenario.retirementAccounts ?? [];
  const legacyContributionStrategies = retirementAccounts
    .filter((account) => account.accountType === "super-accumulation" && (account.annualContribution ?? 0) > 0)
    .map((account) => ({
      strategyId: `${account.accountId}-legacy-additional-contribution`,
      ownerPersonId: account.ownerPersonId,
      targetAccountId: account.accountId,
      label: "Additional contributions",
      annualAmount: account.annualContribution ?? 0,
      contributionType: account.annualContributionType ?? "concessional" as const,
      startDate: null,
      endDate: null,
      indexedToCpi: false,
      enabled: true,
    }));
  const legacyRolloverEvents = retirementAccounts
    .filter((account) => account.accountType === "super-accumulation" && account.rolloverToPensionDate)
    .map((account) => ({
      eventId: `${account.accountId}-legacy-rollover`,
      label: "Rollover to pension",
      sourceAccountId: account.accountId,
      destinationAccountId: null,
      destinationPensionName: account.rolloverPensionName?.trim() || `${account.productName} pension`,
      rolloverDate: account.rolloverToPensionDate ?? null,
      amountMode: "full-balance" as const,
      fixedAmount: 0,
      annualDrawdown: account.rolloverAnnualDrawdown ?? 0,
      drawdownIndexedToCpi: account.rolloverDrawdownIndexedToCpi ?? false,
      enabled: true,
    }));

  return {
    ...scenario,
    dependants: scenario.dependants ?? [],
    assets: (scenario.assets ?? []).map((asset) => ({
      ...asset,
      type: assetTypeValue(asset.type),
      centrelink: assetCentrelinkValue(asset.centrelink),
      costBase: asset.costBase ?? asset.openingValue,
      acquisitionDate: asset.acquisitionDate ?? null,
      cgtTreatment: cgtTreatmentValue(asset.cgtTreatment, assetTypeValue(asset.type)),
    })),
    assetSaleEvents: scenario.assetSaleEvents ?? [],
    assetPurchaseEvents: scenario.assetPurchaseEvents ?? [],
    liabilityDrawdownEvents: scenario.liabilityDrawdownEvents ?? [],
    liabilityPaymentEvents: scenario.liabilityPaymentEvents ?? [],
    liabilities: (scenario.liabilities ?? []).map((liability) => ({
      ...liability,
      repaymentType: liability.repaymentType ?? "principal-and-interest",
      interestDeductible: liability.interestDeductible ?? false,
    })),
    retirementAccounts,
    superContributionStrategies: (scenario.superContributionStrategies ?? []).length
      ? scenario.superContributionStrategies
      : legacyContributionStrategies,
    superRolloverEvents: (scenario.superRolloverEvents ?? []).length ? scenario.superRolloverEvents : legacyRolloverEvents,
    pensionWithdrawalEvents: scenario.pensionWithdrawalEvents ?? [],
    cashflowAllocation: scenario.cashflowAllocation ?? { surplusTarget: null },
  };
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numericValue(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value !== "string") {
    return 0;
  }

  const parsed = Number(value.replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function assetCentrelinkValue(value: unknown): ProjectionScenario["assets"][number]["centrelink"] {
  return value === "exempt" || value === "financial-asset" || value === "assessable" ? value : "assessable";
}

function assetTypeValue(value: unknown): ProjectionScenario["assets"][number]["type"] {
  return projectionAssetTypeOptions.some((option) => option.value === value) ? value as ProjectionScenario["assets"][number]["type"] : "other";
}

function defaultAssetName(type: ProjectionScenario["assets"][number]["type"]) {
  if (type === "cash" || type === "bank-account" || type === "offset-account") return "New cash reserve";
  if (type === "term-deposit") return "New term deposit";
  if (type === "investment-property") return "New investment property";
  if (isInvestmentAssetType(type)) return "New investment";
  if (type === "motor-vehicle") return "New motor vehicle";
  if (type === "home-contents") return "Home contents";
  if (type === "business") return "New business asset";
  return "New asset";
}

function defaultAssetGrowthRateKey(type: ProjectionScenario["assets"][number]["type"], name = "") {
  if (type === "offset-account") return "none" as const;
  if (isCashAssetType(type)) return "cash" as const;
  if (type === "primary-residence" || type === "investment-property") return "cpi" as const;
  if (isInvestmentAssetType(type)) return "Balanced" as const;
  if (/offset/i.test(name)) return "none" as const;
  return "none" as const;
}

function defaultAssetCentrelink(type: ProjectionScenario["assets"][number]["type"]) {
  if (type === "primary-residence" || type === "funeral-bond") return "exempt" as const;
  if (isCashAssetType(type) || isInvestmentAssetType(type)) return "financial-asset" as const;
  return "assessable" as const;
}

function defaultAssetCgtTreatment(type: ProjectionScenario["assets"][number]["type"]): NonNullable<ProjectionScenario["assets"][number]["cgtTreatment"]> {
  if (type === "primary-residence") return "main-residence-exempt";
  if (isCashAssetType(type)) return "not-applicable";
  if (type === "home-contents" || type === "motor-vehicle" || type === "personal-asset") return "personal-use-exempt";
  return "taxable";
}

function cgtTreatmentValue(
  value: unknown,
  assetType: ProjectionScenario["assets"][number]["type"],
): NonNullable<ProjectionScenario["assets"][number]["cgtTreatment"]> {
  return projectionCgtTreatmentOptions.some((option) => option.value === value)
    ? value as NonNullable<ProjectionScenario["assets"][number]["cgtTreatment"]>
    : defaultAssetCgtTreatment(assetType);
}

function normalizeRateValue(value: unknown) {
  const parsed = numericValue(value);
  if (parsed <= 0) return 0;
  return parsed > 1 ? parsed / 100 : parsed;
}

function frequencyLabel(value: unknown) {
  if (typeof value === "string") return value.toLowerCase();
  if (value && typeof value === "object") {
    const record = value as { type?: string | null; value?: string | null };
    return (record.type ?? record.value ?? "").toLowerCase();
  }
  return "";
}

function annualizeAmount(amount: unknown, frequency: unknown) {
  const value = numericValue(amount);
  const frequencyText = frequencyLabel(frequency);
  if (frequencyText.includes("week") && !frequencyText.includes("fortnight")) return value * 52;
  if (frequencyText.includes("fortnight")) return value * 26;
  if (frequencyText.includes("month")) return value * 12;
  if (frequencyText.includes("quarter")) return value * 4;
  return value;
}

function incomeCategoryFromText(value: string): ProjectionScenario["cashflowItems"][number]["category"] {
  const text = value.toLowerCase();
  if (/employment|salary|wage|payg/.test(text)) return "employment-income";
  if (/business|self.?employed|sole trader/.test(text)) return "business-income";
  if (/rent|rental/.test(text)) return "rental-income";
  if (/dividend|interest|distribution|investment/.test(text)) return "investment-income";
  if (/super|superannuation/.test(text)) return "superannuation-income";
  if (/age pension|pension/.test(text)) return "pension-income";
  if (/centrelink|jobseeker|family tax|disability support/.test(text)) return "centrelink-income";
  if (/annuity/.test(text)) return "annuity-income";
  return "other-income";
}

function expenseCategoryFromText(value: string): ProjectionScenario["cashflowItems"][number]["category"] {
  const text = value.toLowerCase();
  if (/mortgage/.test(text)) return "mortgage-repayment";
  if (/loan|repayment|debt/.test(text)) return "loan-repayment";
  if (/\brent\b/.test(text)) return "rent-expense";
  if (/home|housing|rates|strata|utilities|electricity|gas|water/.test(text)) return "housing-expense";
  if (/insurance|premium/.test(text)) return "insurance-premium";
  if (/medical|health|doctor|hospital|pharmacy/.test(text)) return "medical-expense";
  if (/car|vehicle|transport|fuel|rego|registration/.test(text)) return "transport-expense";
  if (/education|school|university/.test(text)) return "education-expense";
  if (/holiday|travel/.test(text)) return "travel-expense";
  if (/entertainment|dining|restaurant|recreation/.test(text)) return "entertainment-expense";
  if (/\btax\b|ato/.test(text)) return "tax-expense";
  if (/advice|advisor|adviser|fee/.test(text)) return "advice-fee";
  if (/living|household|grocer|food/.test(text)) return "living-expense";
  return "other-expense";
}

function calculateStartAge(dateOfBirth: string | null | undefined, startYear: number, startMonth: number) {
  if (!dateOfBirth) {
    return 18;
  }

  const parsed = new Date(dateOfBirth);
  if (Number.isNaN(parsed.getTime())) {
    return 18;
  }

  const projectionStart = new Date(startYear, startMonth - 1, 1);
  let age = projectionStart.getFullYear() - parsed.getFullYear();
  const birthdayThisYear = new Date(projectionStart.getFullYear(), parsed.getMonth(), parsed.getDate());
  if (birthdayThisYear > projectionStart) {
    age -= 1;
  }
  return Math.max(18, age);
}

function personName(person?: PersonRecord | null, fallback = "Client") {
  return textValue(person?.name) || fallback;
}

function personGender(person?: PersonRecord | null): ProjectionScenario["people"][number]["gender"] {
  const gender = textValue(person?.gender).toLowerCase();
  if (gender.includes("female")) return "female";
  if (gender.includes("male")) return "male";
  return "unknown";
}

function mapClientProfileToProjectionScenario(profile: ClientProfile): ProjectionScenario {
  const startYear = blankProjectionScenario.startYear;
  const startMonth = blankProjectionScenario.startMonth;
  const hasPartner = Boolean(textValue(profile.partner?.name));
  const people: ProjectionScenario["people"] = [
    {
      personId: "client",
      name: personName(profile.client, "Client"),
      role: "client",
      gender: personGender(profile.client),
      dateOfBirth: profile.client?.dob ?? null,
      startAge: calculateStartAge(profile.client?.dob, startYear, startMonth),
      retirementAge: null,
      relationshipStatus: hasPartner ? "couple" : profile.client?.maritalStatus ?? null,
      isHomeowner: false,
    },
    ...(hasPartner
      ? [
          {
            personId: "partner" as const,
            name: personName(profile.partner, "Partner"),
            role: "partner" as const,
            gender: personGender(profile.partner),
            dateOfBirth: profile.partner?.dob ?? null,
            startAge: calculateStartAge(profile.partner?.dob, startYear, startMonth),
            retirementAge: null,
            relationshipStatus: "couple",
            isHomeowner: false,
          },
        ]
      : []),
  ];
  const clientNameLower = people[0]?.name.toLowerCase() ?? "";
  const partnerNameLower = people.find((person) => person.role === "partner")?.name.toLowerCase() ?? "";
  const ownerPersonId = (record?: { joint?: boolean | null; owner?: { id?: string | null; name?: string | null } | null }) => {
    if (record?.joint) return jointOwnerId;
    const ownerName = textValue(record?.owner?.name).toLowerCase();
    if (ownerName && partnerNameLower && (ownerName === partnerNameLower || partnerNameLower.includes(ownerName) || ownerName.includes(partnerNameLower))) {
      return "partner";
    }
    if (ownerName && clientNameLower && (ownerName === clientNameLower || clientNameLower.includes(ownerName) || ownerName.includes(clientNameLower))) {
      return "client";
    }
    return "client";
  };
  const dependants: NonNullable<ProjectionScenario["dependants"]> = (profile.dependants ?? []).map((dependant, index) => ({
    dependantId: dependant.id ?? `dependant-${index + 1}`,
    ownerPersonId: ownerPersonId({ owner: dependant.owner }),
    name: dependant.name ?? `Dependant ${index + 1}`,
    relationship: dependant.type ?? null,
    dateOfBirth: dependant.birthday ?? null,
  }));
  const assetType = (value: string): ProjectionScenario["assets"][number]["type"] => {
    const normalized = value.toLowerCase();
    if (/home|residence|property.*home|principal|primary/.test(normalized)) return "primary-residence";
    if (/offset/.test(normalized)) return "offset-account";
    if (/term deposit/.test(normalized)) return "term-deposit";
    if (/cash/.test(normalized)) return "cash";
    if (/bank|savings|transaction|cheque/.test(normalized)) return "bank-account";
    if (/funeral/.test(normalized)) return "funeral-bond";
    if (/investment.*property|rental.*property/.test(normalized)) return "investment-property";
    if (/australian.*share|asx|domestic.*share/.test(normalized)) return "australian-shares";
    if (/international.*share|global.*share/.test(normalized)) return "international-shares";
    if (/managed/.test(normalized)) return "managed-fund";
    if (/etf/.test(normalized)) return "etf";
    if (/share|investment|portfolio/.test(normalized)) return "investment";
    if (/contents|household/.test(normalized)) return "home-contents";
    if (/vehicle|car|motor/.test(normalized)) return "motor-vehicle";
    if (/business|company/.test(normalized)) return "business";
    return "personal-asset";
  };
  const liabilityType = (value: string): ProjectionScenario["liabilities"][number]["type"] => {
    const normalized = value.toLowerCase();
    if (/mortgage|home loan/.test(normalized)) return "mortgage";
    if (/credit card/.test(normalized)) return "credit-card";
    if (/loan|debt|hecs|help/.test(normalized)) return "personal-loan";
    return "other";
  };
  const investmentProfile = (value: string) => {
    const normalized = value.toLowerCase();
    if (normalized.includes("high")) return "High Growth";
    if (normalized.includes("growth")) return "Growth";
    if (normalized.includes("balanced")) return "Balanced";
    if (normalized.includes("moderate")) return "Moderate";
    if (normalized.includes("defensive") || normalized.includes("conservative")) return "Defensive";
    return "Balanced";
  };
  const assets = (profile.assets ?? []).map((asset, index) => {
    const name = textValue(asset.description) || textValue(asset.type) || textValue(asset.assetType) || `Asset ${index + 1}`;
    const type = assetType(`${asset.type ?? ""} ${asset.assetType ?? ""} ${asset.description ?? ""}`);

    return {
      assetId: slug(asset.id || name) || `asset-${index + 1}`,
      ownerPersonId: ownerPersonId(asset),
      type,
      name,
      openingValue: numericValue(asset.currentValue),
      annualIncome: annualizeAmount(asset.incomeAmount, asset.incomeFrequency),
      growthRateKey: defaultAssetGrowthRateKey(type, name),
      centrelink: defaultAssetCentrelink(type),
      reserveTarget: isCashAssetType(type) ? 60000 : null,
      costBase: numericValue(asset.cost) || numericValue(asset.currentValue),
      acquisitionDate: asset.acquisitionDate ?? null,
      cgtTreatment: defaultAssetCgtTreatment(type),
    };
  });
  const hasPrimaryResidence = assets.some((asset) => asset.type === "primary-residence");
  people.forEach((person) => {
    person.isHomeowner = hasPrimaryResidence;
  });
  const liabilities = (profile.liabilities ?? []).map((liability, index) => {
    const name = textValue(liability.bankName) || textValue(liability.loanType) || textValue(liability.accountNumber) || `Liability ${index + 1}`;
    const annualInterestRate = normalizeRateValue(liability.interestRate);
    const annualRepayment = annualizeAmount(liability.repaymentAmount, liability.repaymentFrequency);
    const openingBalance = numericValue(liability.outstandingBalance);
    const annualInterest = openingBalance * annualInterestRate;
    const loanText = `${liability.loanType ?? ""} ${liability.bankName ?? ""} ${liability.securityAssets?.type ?? ""} ${liability.securityAssets?.description ?? ""}`;

    return {
      liabilityId: slug(liability.id || name) || `liability-${index + 1}`,
      ownerPersonId: ownerPersonId(liability),
      type: liabilityType(`${liability.loanType ?? ""} ${liability.bankName ?? ""}`),
      name,
      openingBalance,
      annualInterestRate,
      annualRepayment,
      repaymentTiming: "end-of-year" as const,
      repaymentType: annualInterest > 0 && Math.abs(annualRepayment - annualInterest) <= Math.max(annualInterest * 0.08, 500)
        ? "interest-only" as const
        : "principal-and-interest" as const,
      interestDeductible: /investment|rental|business/.test(loanText.toLowerCase()),
    };
  });
  const employmentRecords = [...(profile.employment ?? []), ...(profile.client?.employment ?? []), ...(profile.partner?.employment ?? [])];
  const employmentItems = employmentRecords
    .filter((entry) => numericValue(entry.salary) > 0)
    .map((entry, index) => {
      const ownerId = ownerPersonId(entry);
      const owner = people.find((person) => person.personId === ownerId);

      return {
        itemId: slug(entry.id || `${entry.owner?.name ?? "employment"}-${index}`) || `employment-${index + 1}`,
        ownerPersonId: ownerId,
        category: "employment-income" as const,
        label: `${owner?.name ?? people[0]?.name ?? "Client"} employment income`,
        annualAmount: annualizeAmount(entry.salary, entry.frequency),
        startDate: entry.startDate ?? null,
        endDate: entry.endDate ?? null,
        indexedToCpi: true,
        taxable: true,
      };
    });
  const incomeItems = (profile.income ?? [])
    .filter((entry) => numericValue(entry.amount) > 0 && !/age pension/i.test(`${entry.type ?? ""} ${entry.description ?? ""}`))
    .map((entry, index) => ({
      itemId: slug(entry.id || entry.description || entry.type || `income-${index + 1}`) || `income-${index + 1}`,
      ownerPersonId: ownerPersonId(entry),
      category: incomeCategoryFromText(`${entry.type ?? ""} ${entry.description ?? ""}`),
      label: textValue(entry.description) || textValue(entry.type) || `Income ${index + 1}`,
      annualAmount: annualizeAmount(entry.amount, entry.frequency),
      startDate: null,
      endDate: null,
      indexedToCpi: true,
      taxable: !/tax.?free|non.?tax/i.test(`${entry.taxType ?? ""} ${entry.type ?? ""} ${entry.description ?? ""}`),
    }));
  const expenseItems = (profile.expense ?? [])
    .filter((entry) => numericValue(entry.amount) > 0)
    .map((entry, index) => ({
      itemId: slug(entry.id || entry.description || entry.type || `expense-${index + 1}`) || `expense-${index + 1}`,
      ownerPersonId: ownerPersonId(entry),
      category: expenseCategoryFromText(`${entry.type ?? ""} ${entry.description ?? ""}`),
      label: textValue(entry.description) || textValue(entry.type) || `Expense ${index + 1}`,
      annualAmount: annualizeAmount(entry.amount, entry.frequency),
      startDate: null,
      endDate: null,
      indexedToCpi: !/no|false|0/i.test(textValue(entry.indexation)),
      taxable: false,
    }));
  const superAccounts = (profile.superannuation ?? []).map((account, index) => ({
    accountId: slug(account.id || account.superFund || `super-${index + 1}`) || `super-${index + 1}`,
    ownerPersonId: ownerPersonId(account),
    accountType: "super-accumulation" as const,
    provider: textValue(account.superFund) || "Super fund",
    productName: textValue(account.type) || textValue(account.superFund) || `Super account ${index + 1}`,
    openingBalance: numericValue(account.balance),
    annualFeeRate: 0.015,
    annualInsurancePremium: 0,
    annualContribution: 0,
    annualContributionType: "concessional" as const,
    rolloverToPensionDate: null,
    rolloverPensionName: null,
    rolloverAnnualDrawdown: 0,
    rolloverDrawdownIndexedToCpi: false,
    investmentProfileKey: investmentProfile(`${account.type ?? ""} ${account.superFund ?? ""}`),
    annualDrawdown: 0,
    drawdownIndexedToCpi: false,
    taxableToClient: false,
    centrelink: "financial-asset" as const,
  }));
  const superContributionStrategies = (profile.superannuation ?? [])
    .map((account, index) => {
      const annualAmount = annualizeAmount(account.contributionAmount, account.frequency);
      const accountId = slug(account.id || account.superFund || `super-${index + 1}`) || `super-${index + 1}`;

      return annualAmount > 0
        ? {
            strategyId: `${accountId}-contribution-strategy`,
            ownerPersonId: ownerPersonId(account),
            targetAccountId: accountId,
            label: "Additional contributions",
            annualAmount,
            contributionType: "concessional" as const,
            startDate: null,
            endDate: null,
            indexedToCpi: false,
            enabled: true,
          }
        : null;
    })
    .filter((strategy): strategy is NonNullable<typeof strategy> => Boolean(strategy));
  const pensionAccounts = (profile.pension ?? []).map((account, index) => ({
    accountId: slug(account.id || account.superFund || `pension-${index + 1}`) || `pension-${index + 1}`,
    ownerPersonId: ownerPersonId(account),
    accountType: "account-based-pension" as const,
    provider: textValue(account.superFund) || "Pension provider",
    productName: textValue(account.type) || textValue(account.superFund) || `Pension account ${index + 1}`,
    openingBalance: numericValue(account.balance),
    annualFeeRate: 0.015,
    annualInsurancePremium: 0,
    annualContribution: 0,
    annualContributionType: "concessional" as const,
    rolloverToPensionDate: null,
    rolloverPensionName: null,
    rolloverAnnualDrawdown: 0,
    rolloverDrawdownIndexedToCpi: false,
    investmentProfileKey: investmentProfile(`${account.type ?? ""} ${account.superFund ?? ""} ${account.annualReturn ?? ""}`),
    annualDrawdown: annualizeAmount(account.payment, account.frequency),
    drawdownIndexedToCpi: true,
    taxableToClient: false,
    centrelink: "financial-asset" as const,
  }));

  return {
    scenarioId: makeId("client-profile"),
    scenarioName: "Current Situation",
    startYear,
    startMonth,
    people,
    dependants,
    primaryPersonId: "client",
    projectionEnd: { type: "life-expectancy", personId: "client" },
    assets,
    liabilities,
    assetSaleEvents: [],
    assetPurchaseEvents: [],
    liabilityDrawdownEvents: [],
    liabilityPaymentEvents: [],
    retirementAccounts: [...superAccounts, ...pensionAccounts],
    superContributionStrategies,
    superRolloverEvents: [],
    pensionWithdrawalEvents: [],
    cashflowItems: [...employmentItems, ...incomeItems, ...expenseItems],
  };
}

function buildProjectionViewModel(activeScenario: ProjectionScenario, projectionAssumptions = currentProjectionAssumptions) {
const projectionResult = runProjection(activeScenario, projectionAssumptions);
const projectionRows = projectionResult.years;
const primaryPersonId = activeScenario.primaryPersonId;
const projectionStartYear = activeScenario.startYear;
const endAge = projectionRows.at(-1)?.ageByPersonId[primaryPersonId] ?? 0;
const cashAsset = activeScenario.assets.find((asset) => isCashAssetType(asset.type));
const cashReserveTarget = cashAsset?.reserveTarget ?? 0;
const openingCash = cashAsset?.openingValue ?? 0;
const cashAssetName = cashAsset?.name ?? "cash reserve";
const openingAmpPension =
  activeScenario.retirementAccounts.find((account) => account.accountType === "account-based-pension")?.openingBalance ?? 0;
const startingNetWorth =
  activeScenario.assets.reduce((total, asset) => total + asset.openingValue, 0) +
  activeScenario.retirementAccounts.reduce((total, account) => total + account.openingBalance, 0) -
  activeScenario.liabilities.reduce((total, liability) => total + liability.openingBalance, 0);

function money(value: number) {
  const rounded = Math.round(value);
  const formatted = Math.abs(rounded).toLocaleString("en-AU", {
    maximumFractionDigits: 0,
  });

  return rounded < 0 ? `($${formatted})` : `$${formatted}`;
}

function hasAnyAmount(values: number[]) {
  return values.some((value) => Math.abs(Math.round(value)) > 0);
}

const finalProjectionYear = projectionRows.at(-1);
const firstReserveBreach = projectionRows.find((row) => row.cashReserve < cashReserveTarget);
const personNameById = Object.fromEntries(activeScenario.people.map((person) => [person.personId, person.name]));
const projectionAgePeople = activeScenario.people.filter((person) => person.role === "client" || person.role === "partner");
const projectionAgeRows: ProjectionTableRow[] = (projectionAgePeople.length ? projectionAgePeople : activeScenario.people).map(
  (person) => ({
    label: `Age - ${person.name}`,
    values: projectionRows.map((row) => `${row.ageByPersonId[person.personId] ?? ""}`),
  }),
);
const liabilityRepaymentItemIds = new Set(activeScenario.liabilities.map((liability) => `${liability.liabilityId}-repayment`));
const duplicatedCashflowLabels = new Set(
  activeScenario.cashflowItems
    .map((item) => item.label)
    .filter((label, index, labels) => labels.indexOf(label) !== index),
);

function cashflowItemLabel(item: ProjectionScenario["cashflowItems"][number]) {
  return duplicatedCashflowLabels.has(item.label) ? `${ownerName(item.ownerPersonId)} - ${item.label}` : item.label;
}

function ownerName(ownerPersonId: string) {
  return ownerPersonId === jointOwnerId ? "Joint" : personNameById[ownerPersonId] ?? "Client";
}

function ownerIncludesPerson(ownerPersonId: string, personId: string) {
  return ownerPersonId === personId || ownerPersonId === jointOwnerId;
}

function ownerShare(activeOwnerPersonId: string) {
  const householdPeople = activeScenario.people.filter((person) => person.role === "client" || person.role === "partner");
  return activeOwnerPersonId === jointOwnerId && householdPeople.length > 1 ? 1 / householdPeople.length : 1;
}

function rolloverPensionAccountId(accountId: string) {
  return `${accountId}-rollover-pension`;
}

const superContributionStrategies = activeScenario.superContributionStrategies ?? [];
const displayContributionStrategies = superContributionStrategies.length
  ? superContributionStrategies
  : activeScenario.retirementAccounts
      .filter((account) => account.accountType === "super-accumulation" && (account.annualContribution ?? 0) > 0)
      .map((account) => ({
        strategyId: `${account.accountId}-legacy-additional-contribution`,
        ownerPersonId: account.ownerPersonId,
        targetAccountId: account.accountId,
        label: "Additional contributions",
        annualAmount: account.annualContribution ?? 0,
        contributionType: account.annualContributionType ?? "concessional",
        startDate: null,
        endDate: null,
        indexedToCpi: false,
        enabled: true,
      }));
const superRolloverEvents = activeScenario.superRolloverEvents ?? [];
const displayRolloverEvents = superRolloverEvents.length
  ? superRolloverEvents
  : activeScenario.retirementAccounts
      .filter((account) => account.accountType === "super-accumulation" && account.rolloverToPensionDate)
      .map((account) => ({
        eventId: `${account.accountId}-legacy-rollover`,
        label: "Rollover to pension",
        sourceAccountId: account.accountId,
        destinationAccountId: null,
        destinationPensionName: account.rolloverPensionName?.trim() || `${account.productName} pension`,
        rolloverDate: account.rolloverToPensionDate ?? null,
        amountMode: "full-balance" as const,
        fixedAmount: 0,
        annualDrawdown: account.rolloverAnnualDrawdown ?? 0,
        drawdownIndexedToCpi: account.rolloverDrawdownIndexedToCpi ?? false,
        enabled: true,
      }));
const displayPensionWithdrawalEvents = activeScenario.pensionWithdrawalEvents ?? [];

function rolloverDestinationAccountId(event: (typeof displayRolloverEvents)[number]) {
  return event.destinationAccountId?.trim() || rolloverPensionAccountId(event.sourceAccountId);
}

function createRolloverPensionAccount(
  event: (typeof displayRolloverEvents)[number],
  account: ProjectionScenario["retirementAccounts"][number],
) {
  return {
    ...account,
    accountId: rolloverDestinationAccountId(event),
    accountType: "account-based-pension" as const,
    productName: event.destinationPensionName?.trim() || `${account.productName} pension`,
    openingBalance: 0,
    annualInsurancePremium: 0,
    annualContribution: 0,
    annualContributionType: "concessional" as const,
    rolloverToPensionDate: null,
    rolloverPensionName: null,
    rolloverAnnualDrawdown: 0,
    rolloverDrawdownIndexedToCpi: false,
    annualDrawdown: event.annualDrawdown ?? 0,
    drawdownIndexedToCpi: event.drawdownIndexedToCpi ?? false,
    taxableToClient: false,
  };
}

const rolloverPensionAccounts = displayRolloverEvents
  .filter((event) => event.enabled && event.rolloverDate)
  .map((event) => {
    const sourceAccount = activeScenario.retirementAccounts.find((account) => account.accountId === event.sourceAccountId);
    const destinationAccountId = rolloverDestinationAccountId(event);
    const existingDestination = activeScenario.retirementAccounts.find((account) => account.accountId === destinationAccountId);

    return sourceAccount && !existingDestination ? createRolloverPensionAccount(event, sourceAccount) : null;
  })
  .filter((account): account is NonNullable<typeof account> => Boolean(account));
const retirementDisplayAccounts = [...activeScenario.retirementAccounts, ...rolloverPensionAccounts];

function assignChartColors(rows: Array<{ label: string; rawValues: number[] }>): ProjectionChartSeries[] {
  return rows.map((row, index) => ({
    label: row.label,
    values: row.rawValues,
    color: cashflowChartPalette[index % cashflowChartPalette.length],
  }));
}

const mappedIncomeRawRows = activeScenario.cashflowItems
  .filter((item) => isCashflowIncomeCategory(item.category))
  .map((item) => ({
    label: cashflowItemLabel(item),
    rawValues: projectionRows.map((row) => row.cashflowItemValues[item.itemId] ?? 0),
  }));
const mappedIncomeRows = mappedIncomeRawRows.map((row) => ({
  label: row.label,
  values: row.rawValues.map((value) => money(value)),
}));
const assetIncomeRawRows = activeScenario.assets
  .map((asset) => ({
    label: `${asset.name} income`,
    rawValues: projectionRows.map((row) => row.assetIncomeValues[asset.assetId] ?? 0),
  }))
  .filter((row) => hasAnyAmount(row.rawValues));
const assetIncomeRows = assetIncomeRawRows.map((row) => ({
  label: row.label,
  values: row.rawValues.map((value) => money(value)),
}));
const assetSaleRawRows = (activeScenario.assetSaleEvents ?? [])
  .map((event) => {
    const asset = activeScenario.assets.find((entry) => entry.assetId === event.assetId);

    return {
      label: event.label.trim() || `Sale of ${asset?.name ?? "asset"}`,
      rawValues: projectionRows.map((row) => row.assetSaleEventValues[event.eventId] ?? 0),
    };
  })
  .filter((row) => hasAnyAmount(row.rawValues));
const assetSaleRows = assetSaleRawRows.map((row) => ({
  label: row.label,
  values: row.rawValues.map((value) => money(value)),
}));
const assetPurchaseRawRows = (activeScenario.assetPurchaseEvents ?? [])
  .map((event) => {
    const asset = activeScenario.assets.find((entry) => entry.assetId === event.assetId);

    return {
      label: event.label.trim() || `Purchase of ${asset?.name ?? "asset"}`,
      rawValues: projectionRows.map((row) => row.assetPurchaseEventValues[event.eventId] ?? 0),
    };
  })
  .filter((row) => hasAnyAmount(row.rawValues));
const assetPurchaseRows = assetPurchaseRawRows.map((row) => ({
  label: row.label,
  values: row.rawValues.map((value) => money(value)),
}));
const pensionLumpSumRawRows = displayPensionWithdrawalEvents
  .map((event) => {
    const account = retirementDisplayAccounts.find((entry) => entry.accountId === event.accountId);

    return {
      label: `${event.label.trim() || "Lump sum withdrawal"} - ${account?.productName ?? "pension"}`,
      rawValues: projectionRows.map((row) => {
        const detail = row.retirementAccountDetails[event.accountId]?.pensionWithdrawalDetails.find(
          (entry) => entry.eventId === event.eventId,
        );
        return detail?.amount ?? 0;
      }),
    };
  })
  .filter((row) => hasAnyAmount(row.rawValues));
const pensionLumpSumRows = pensionLumpSumRawRows.map((row) => ({
  label: row.label,
  values: row.rawValues.map((value) => money(value)),
}));
const mappedExpenseRows = activeScenario.cashflowItems
  .filter(
    (item) =>
      isCashflowExpenseCategory(item.category) && !liabilityRepaymentItemIds.has(item.itemId),
  )
  .map((item) => ({
    label: cashflowItemLabel(item),
    values: projectionRows.map((row) => money(row.cashflowItemValues[item.itemId] ?? 0)),
  }));
const liabilityRepaymentRows = activeScenario.liabilities
  .filter((liability) => liability.annualRepayment > 0)
  .map((liability) => ({
    label: `${liability.name} repayment`,
    values: projectionRows.map((row) => money(row.liabilityRepaymentValues[liability.liabilityId] ?? 0)),
  }));
const liabilityPaymentRawRows = (activeScenario.liabilityPaymentEvents ?? [])
  .map((event) => {
    const liability = activeScenario.liabilities.find((entry) => entry.liabilityId === event.liabilityId);

    return {
      label: event.label.trim() || `Payment to ${liability?.name ?? "liability"}`,
      rawValues: projectionRows.map((row) => row.liabilityPaymentEventValues[event.eventId] ?? 0),
    };
  })
  .filter((row) => hasAnyAmount(row.rawValues));
const liabilityPaymentRows = liabilityPaymentRawRows.map((row) => ({
  label: row.label,
  values: row.rawValues.map((value) => money(value)),
}));
const liabilityDrawdownRawRows = (activeScenario.liabilityDrawdownEvents ?? [])
  .map((event) => {
    const liability = activeScenario.liabilities.find((entry) => entry.liabilityId === event.liabilityId);

    return {
      label: event.label.trim() || `Drawdown from ${liability?.name ?? "liability"}`,
      rawValues: projectionRows.map((row) => row.liabilityDrawdownEventValues[event.eventId] ?? 0),
    };
  })
  .filter((row) => hasAnyAmount(row.rawValues));
const liabilityDrawdownRows = liabilityDrawdownRawRows.map((row) => ({
  label: row.label,
  values: row.rawValues.map((value) => money(value)),
}));
const superContributionExpenseRows = displayContributionStrategies
  .map((strategy) => {
    const targetAccount = retirementDisplayAccounts.find((account) => account.accountId === strategy.targetAccountId);

    return {
      label: `${strategy.label} - ${targetAccount?.productName ?? "super"}`,
      rawValues: projectionRows.map((row) => {
        const detail = row.retirementAccountDetails[strategy.targetAccountId]?.contributionStrategyDetails.find(
          (entry) => entry.strategyId === strategy.strategyId,
        );
        return detail?.grossContribution ?? 0;
      }),
    };
  })
  .filter((row) => hasAnyAmount(row.rawValues))
  .map((row) => ({
    label: row.label,
    values: row.rawValues.map((value) => money(value)),
  }));
const taxPayableRows = activeScenario.people
  .map((person) => ({
    label: `${person.name} tax payable`,
    rawValues: projectionRows.map((row) => row.taxByPersonId[person.personId]?.taxPayable ?? 0),
  }))
  .filter((row) => hasAnyAmount(row.rawValues))
  .map((row) => ({
    label: row.label,
    values: row.rawValues.map((value) => money(value)),
  }));
const accountBasedPensionIncomeRows = activeScenario.retirementAccounts
  .filter((account) => account.accountType === "account-based-pension")
  .map((account) => {
    const ownerLabel = ownerName(account.ownerPersonId);

    return {
      label: `${account.productName} - ${ownerLabel}`,
      rawValues: projectionRows.map((row) => row.retirementAccountDetails[account.accountId]?.drawdown ?? 0),
    };
  });
const calculatedIncomeRows = [
  ...accountBasedPensionIncomeRows,
  ...activeScenario.people.map((person) => ({
    label: `Age Pension - ${person.name}`,
    rawValues: projectionRows.map((row) => row.agePensionByPersonId[person.personId]?.annualPayment ?? 0),
  })),
  {
    label: "Bank interest",
    rawValues: projectionRows.map((row) => row.bankInterest),
  },
].filter((row) => hasAnyAmount(row.rawValues));
function niceChartAxisStep(rawStep: number) {
  if (!Number.isFinite(rawStep) || rawStep <= 0) {
    return 1;
  }

  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const niceNormalized =
    normalized <= 1
      ? 1
      : normalized <= 2
        ? 2
        : normalized <= 2.5
          ? 2.5
          : normalized <= 5
            ? 5
            : 10;

  return niceNormalized * magnitude;
}

function chartAxisFor(rawMaxValue: number, targetTickCount = defaultChartTickCount) {
  const safeMaxValue = Math.max(1, rawMaxValue);
  const axisStep = niceChartAxisStep(safeMaxValue / targetTickCount);
  const maxValue = Math.max(axisStep, Math.ceil(safeMaxValue / axisStep) * axisStep);

  return { axisStep, maxValue };
}

const cashflowChartSeries = assignChartColors([
  ...mappedIncomeRawRows,
  ...assetIncomeRawRows,
  ...assetSaleRawRows,
  ...liabilityDrawdownRawRows,
  ...calculatedIncomeRows,
  ...pensionLumpSumRawRows,
]);
const cashflowEventIncomeValues = projectionRows.map((_, yearIndex) =>
  [...assetSaleRawRows, ...liabilityDrawdownRawRows, ...pensionLumpSumRawRows].reduce(
    (total, row) => total + (row.rawValues[yearIndex] ?? 0),
    0,
  ),
);
const cashflowEventExpenseValues = projectionRows.map((_, yearIndex) =>
  [...assetPurchaseRawRows, ...liabilityPaymentRawRows].reduce((total, row) => total + (row.rawValues[yearIndex] ?? 0), 0),
);
const cashflowTotalIncomeValues = projectionRows.map((row, yearIndex) => row.totalIncome + cashflowEventIncomeValues[yearIndex]);
const cashflowExpenseValues = projectionRows.map(
  (row, yearIndex) => row.expenses + row.tax.taxPayable + cashflowEventExpenseValues[yearIndex],
);
const cashflowNetValues = projectionRows.map(
  (row, yearIndex) => row.netCashflowAfterTax + cashflowEventIncomeValues[yearIndex] - cashflowEventExpenseValues[yearIndex],
);
const cashflowChartRawMaxValue = Math.max(
  1,
  ...cashflowTotalIncomeValues,
  ...cashflowExpenseValues,
);
const cashflowChartAxis = chartAxisFor(cashflowChartRawMaxValue);
const cashflowChartMaxValue = cashflowChartAxis.maxValue;
const cashflowChartAxisStep = cashflowChartAxis.axisStep;
const surplusAllocationTarget = activeScenario.cashflowAllocation?.surplusTarget ?? null;
const surplusTargetAsset = surplusAllocationTarget?.targetType === "cash-asset"
  ? activeScenario.assets.find((asset) => asset.assetId === surplusAllocationTarget.targetId)
  : null;
const surplusTargetLiability = surplusAllocationTarget?.targetType === "liability"
  ? activeScenario.liabilities.find((liability) => liability.liabilityId === surplusAllocationTarget.targetId)
  : null;
const surplusAllocationLabel = surplusTargetLiability
  ? `Surplus to ${surplusTargetLiability.name}`
  : `Surplus to ${surplusTargetAsset?.name ?? cashAssetName}`;

const fallbackAllocationRows = [
  {
    label: surplusAllocationLabel,
    control: "surplus-allocation" as const,
    rawValues: projectionRows.map(
      (row) => row.cashflowFallbackAllocation.surplusToCash + row.cashflowFallbackAllocation.surplusToLiability,
    ),
  },
  {
    label: `Shortfall funded from ${cashAssetName}`,
    rawValues: projectionRows.map((row) => row.cashflowFallbackAllocation.shortfallFromCash),
  },
  {
    label: "Extra account-based pension drawdown",
    rawValues: projectionRows.map((row) => row.cashflowFallbackAllocation.extraAccountBasedPensionDrawdown),
  },
  {
    label: "Non-super investment sale",
    rawValues: projectionRows.map((row) => row.cashflowFallbackAllocation.nonSuperInvestmentSale),
  },
  {
    label: "Debt drawdown",
    rawValues: projectionRows.map((row) => row.cashflowFallbackAllocation.debtDrawdown),
  },
  {
    label: "Unresolved shortfall",
    rawValues: projectionRows.map((row) => row.cashflowFallbackAllocation.unresolvedShortfall),
  },
]
  .filter((row) => hasAnyAmount(row.rawValues))
  .map((row) => ({
    label: row.label,
    control: row.control,
    values: row.rawValues.map((value) => money(value)),
  }));

const cashflowProjectionRows: ProjectionTableRow[] = [
  ...projectionAgeRows,
  { label: "Income", values: [], isSection: true },
  ...mappedIncomeRows,
  ...assetIncomeRows,
  ...calculatedIncomeRows.map((row) => ({
    label: row.label,
    values: row.rawValues.map((value) => money(value)),
  })),
  ...assetSaleRows,
  ...liabilityDrawdownRows,
  ...pensionLumpSumRows,
  { label: "Total income", values: cashflowTotalIncomeValues.map((value) => money(value)), isTotal: true },
  { label: "Expenses", values: [], isSection: true },
  ...mappedExpenseRows,
  ...liabilityRepaymentRows,
  ...assetPurchaseRows,
  ...liabilityPaymentRows,
  ...superContributionExpenseRows,
  ...taxPayableRows,
  {
    label: "Total expenses including tax",
    values: cashflowExpenseValues.map((value) => money(value)),
    isTotal: true,
  },
  { label: "Net cashflow after tax", values: cashflowNetValues.map((value) => money(value)) },
  ...(fallbackAllocationRows.length
    ? [{ label: "Surplus / shortfall allocation", values: [], isSection: true }, ...fallbackAllocationRows]
    : []),
];
const superProjectionGroups = activeScenario.retirementAccounts
  .filter((account) => account.accountType === "super-accumulation")
  .map<ProjectionTableGroup>((account) => {
    const ownerName = personNameById[account.ownerPersonId] ?? "Client";
    const accountRolloverEvents = displayRolloverEvents.filter((event) => event.enabled && event.sourceAccountId === account.accountId);
    const accountContributionStrategies = displayContributionStrategies.filter((strategy) => strategy.enabled && strategy.targetAccountId === account.accountId);
    const strategyRows = accountContributionStrategies.map((strategy) => ({
      label: strategy.label,
      values: projectionRows.map((row) => {
        const detail = row.retirementAccountDetails[account.accountId]?.contributionStrategyDetails.find(
          (entry) => entry.strategyId === strategy.strategyId,
        );
        return money(detail?.grossContribution ?? 0);
      }),
    }));
    const rolloverRows = accountRolloverEvents.map((event) => {
      const destinationAccount = retirementDisplayAccounts.find((entry) => entry.accountId === rolloverDestinationAccountId(event));

      return {
        label: `Rollover to ${destinationAccount?.productName ?? event.destinationPensionName ?? "pension"}`,
        values: projectionRows.map((row) => {
          const detail = row.retirementAccountDetails[account.accountId]?.rolloverEventDetails.find(
            (entry) => entry.eventId === event.eventId,
          );
          return money(detail?.rolloverOut ?? 0);
        }),
      };
    });

    return {
      groupId: account.accountId,
      title: account.productName,
      ownerPersonId: account.ownerPersonId,
      ownerName,
      subtitle: accountRolloverEvents.length
        ? `Owner: ${ownerName} | Investment option: ${account.investmentProfileKey} | ${accountRolloverEvents.length} rollover event(s)`
        : `Owner: ${ownerName} | Investment option: ${account.investmentProfileKey}`,
      rows: [
        ...projectionAgeRows,
        {
          label: "Opening balance",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.openingBalance ?? 0)),
          isTotal: true,
        },
        { label: "Money in", values: [], isSection: true },
        {
          label: "Employer contributions",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.grossEmployerContribution ?? 0)),
        },
        ...strategyRows,
        ...(strategyRows.length > 1
          ? [
              {
                label: "Total strategy contributions",
                values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.additionalContribution ?? 0)),
                isTotal: true,
              },
            ]
          : []),
        {
          label: "Investment income",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.investmentIncome ?? 0)),
        },
        {
          label: "Investment growth",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.investmentGrowth ?? 0)),
        },
        { label: "Money out", values: [], isSection: true },
        {
          label: "Contributions tax",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.contributionTax ?? 0)),
        },
        {
          label: "Investment earnings tax",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.investmentTax ?? 0)),
        },
        {
          label: "Fees",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.fees ?? 0)),
        },
        {
          label: "Insurance premiums",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.insurancePremium ?? 0)),
        },
        {
          label: "Total tax payable",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.taxPayable ?? 0)),
          isTotal: true,
        },
        ...rolloverRows,
        {
          label: "Closing balance",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.closingBalance ?? 0)),
          isTotal: true,
        },
      ],
    };
  });
const pensionProjectionGroups = retirementDisplayAccounts
  .filter((account) => account.accountType === "account-based-pension")
  .map<ProjectionTableGroup>((account) => {
    const ownerName = personNameById[account.ownerPersonId] ?? "Client";
    const accountPensionWithdrawalEvents = displayPensionWithdrawalEvents.filter(
      (event) => event.enabled && event.accountId === account.accountId,
    );
    const pensionWithdrawalRows = accountPensionWithdrawalEvents.map((event) => ({
      label: event.label,
      values: projectionRows.map((row) => {
        const detail = row.retirementAccountDetails[account.accountId]?.pensionWithdrawalDetails.find(
          (entry) => entry.eventId === event.eventId,
        );
        return money(detail?.amount ?? 0);
      }),
    }));

    return {
      groupId: account.accountId,
      title: account.productName,
      ownerPersonId: account.ownerPersonId,
      ownerName,
      subtitle: `Owner: ${ownerName} | Investment option: ${account.investmentProfileKey}`,
      rows: [
        ...projectionAgeRows,
        {
          label: "Opening balance",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.openingBalance ?? 0)),
          isTotal: true,
        },
        { label: "Money in", values: [], isSection: true },
        {
          label: "Rollover from super",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.rolloverIn ?? 0)),
        },
        {
          label: "Investment income",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.investmentIncome ?? 0)),
        },
        {
          label: "Investment growth",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.investmentGrowth ?? 0)),
        },
        { label: "Money out", values: [], isSection: true },
        {
          label: "Pension drawdown",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.drawdown ?? 0)),
        },
        ...pensionWithdrawalRows,
        {
          label: "Tax payable",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.taxPayable ?? 0)),
        },
        {
          label: "Fees",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.fees ?? 0)),
        },
        {
          label: "Closing balance",
          values: projectionRows.map((row) => money(row.retirementAccountDetails[account.accountId]?.closingBalance ?? 0)),
          isTotal: true,
        },
      ],
    };
  });
const taxProjectionRowsByPersonId = Object.fromEntries(
  activeScenario.people.map((person) => {
    const taxableIncomeRows = activeScenario.cashflowItems
      .filter((item) => isCashflowIncomeCategory(item.category) && item.taxable && ownerIncludesPerson(item.ownerPersonId, person.personId))
      .map((item) => ({
        label: cashflowItemLabel(item),
        values: projectionRows.map((row) => money((row.cashflowItemValues[item.itemId] ?? 0) * ownerShare(item.ownerPersonId))),
      }));
    const taxableAssetIncomeRows = activeScenario.assets
      .filter((asset) => ownerIncludesPerson(asset.ownerPersonId, person.personId))
      .map((asset) => ({
        label: `${asset.name} taxable income`,
        rawValues: projectionRows.map((row) => (row.assetIncomeValues[asset.assetId] ?? 0) * ownerShare(asset.ownerPersonId)),
      }))
      .filter((row) => hasAnyAmount(row.rawValues))
      .map((row) => ({
        label: row.label,
        values: row.rawValues.map((value) => money(value)),
      }));
    const excludedPensionRows = activeScenario.retirementAccounts
      .filter((account) => account.accountType === "account-based-pension" && account.ownerPersonId === person.personId)
      .map((account) => ({
        label: `${account.productName} excluded from tax`,
        rawValues: projectionRows.map((row) => row.retirementAccountDetails[account.accountId]?.drawdown ?? 0),
      }))
      .filter((row) => hasAnyAmount(row.rawValues))
      .map((row) => ({
        label: row.label,
        values: row.rawValues.map((value) => money(value)),
      }));
    const taxRows = projectionRows.map((row) => row.taxByPersonId[person.personId] ?? row.tax);

    return [
      person.personId,
      [
        ...projectionAgeRows,
        ...taxableIncomeRows,
        ...taxableAssetIncomeRows,
        ...[
          {
            label: "Taxable bank interest",
            rawValues: taxRows.map((row) => row.taxableBankInterest),
          },
          {
            label: "Taxable Age Pension",
            rawValues: taxRows.map((row) => row.taxableAgePension),
          },
          {
            label: "Net taxable capital gains",
            rawValues: taxRows.map((row) => row.taxableCapitalGains),
          },
          {
            label: "Deductible loan interest",
            rawValues: taxRows.map((row) => -row.deductibleInterest),
          },
        ]
          .filter((row) => hasAnyAmount(row.rawValues))
          .map((row) => ({
            label: row.label,
            values: row.rawValues.map((value) => money(value)),
          })),
        ...excludedPensionRows,
        { label: "Taxable income", values: taxRows.map((row) => money(row.taxableIncome)), isTotal: true },
        { label: "Gross tax", values: taxRows.map((row) => money(row.grossTax)) },
        { label: "Medicare levy", values: taxRows.map((row) => money(row.medicareLevy)) },
        ...(hasAnyAmount(taxRows.map((row) => row.lowIncomeTaxOffset))
          ? [{ label: "Low income tax offset", values: taxRows.map((row) => money(row.lowIncomeTaxOffset)) }]
          : []),
        ...(hasAnyAmount(taxRows.map((row) => row.seniorsAndPensionersTaxOffset))
          ? [{ label: "Seniors and pensioners tax offset", values: taxRows.map((row) => money(row.seniorsAndPensionersTaxOffset)) }]
          : []),
        ...(hasAnyAmount(taxRows.map((row) => row.taxOffsets))
          ? [{ label: "Total tax offsets", values: taxRows.map((row) => money(row.taxOffsets)) }]
          : []),
        { label: "Tax payable", values: taxRows.map((row) => money(row.taxPayable)), isTotal: true },
      ],
    ];
  }),
);
const taxProjectionRows = taxProjectionRowsByPersonId[primaryPersonId] ?? [];
const agePensionProjectionRowsByPersonId = Object.fromEntries(
  activeScenario.people.map((person) => {
    const personAgePensionRows = projectionRows.map((row) => row.agePensionByPersonId[person.personId]);

    return [
      person.personId,
      [
        ...projectionAgeRows,
        { label: "Household assessment inputs", values: [], isSection: true },
        { label: "Assessable assets", values: personAgePensionRows.map((row) => money(row?.assessableAssets ?? 0)) },
        { label: "Deemed income", values: personAgePensionRows.map((row) => money(row?.deemedIncome ?? 0)) },
        { label: `${person.name} eligibility`, values: [], isSection: true },
        { label: "Age eligible", values: personAgePensionRows.map((row) => (row?.ageEligible ? "Yes" : "No")) },
        { label: "Maximum annual rate", values: personAgePensionRows.map((row) => money(row?.maximumAnnualRate ?? 0)) },
        { label: "Assets test rate", values: personAgePensionRows.map((row) => money(row?.assetsTestAnnualRate ?? 0)) },
        { label: "Income test rate", values: personAgePensionRows.map((row) => money(row?.incomeTestAnnualRate ?? 0)) },
        { label: "Binding test", values: personAgePensionRows.map((row) => row?.bindingTest ?? "not-eligible") },
        { label: `${person.name} Age Pension`, values: personAgePensionRows.map((row) => money(row?.annualPayment ?? 0)), isTotal: true },
        { label: "Household Age Pension", values: projectionRows.map((row) => money(row.agePension.annualPayment)), isTotal: true },
      ],
    ];
  }),
);
const agePensionProjectionRows = [
  ...projectionAgeRows,
  { label: "Assessment inputs", values: [], isSection: true },
  { label: "Assessable assets", values: projectionRows.map((row) => money(row.agePension.assessableAssets)) },
  { label: "Deemed income", values: projectionRows.map((row) => money(row.agePension.deemedIncome)) },
  { label: "Legislative test outcomes", values: [], isSection: true },
  { label: "Maximum annual rate", values: projectionRows.map((row) => money(row.agePension.maximumAnnualRate)) },
  { label: "Assets test rate", values: projectionRows.map((row) => money(row.agePension.assetsTestAnnualRate)) },
  { label: "Income test rate", values: projectionRows.map((row) => money(row.agePension.incomeTestAnnualRate)) },
  { label: "Result", values: [], isSection: true },
  { label: "Household Age Pension", values: projectionRows.map((row) => money(row.agePension.annualPayment)), isTotal: true },
  { label: "Binding test", values: projectionRows.map((row) => row.agePension.bindingTest) },
];
const balanceSheetProjectionRows = [
  ...projectionAgeRows,
  { label: "Assets", values: [], isSection: true },
  ...activeScenario.assets.map((asset) => ({
    label: asset.name,
    values: projectionRows.map((row) => money(row.assetValues[asset.assetId] ?? 0)),
  })),
  ...(activeScenario.retirementAccounts.length ? [{ label: "Retirement accounts", values: [], isSection: true }] : []),
  ...retirementDisplayAccounts.map((account) => ({
    label: account.productName,
    values: projectionRows.map((row) => money(row.retirementAccountBalances[account.accountId] ?? 0)),
  })),
  { label: "Total assets", values: projectionRows.map((row) => money(row.totalAssets)), isTotal: true },
  ...(activeScenario.liabilities.length ? [{ label: "Liabilities", values: [], isSection: true }] : []),
  ...activeScenario.liabilities.map((liability) => ({
    label: liability.name,
    values: projectionRows.map((row) => money(row.liabilityBalances[liability.liabilityId] ?? 0)),
  })),
  { label: "Total liabilities", values: projectionRows.map((row) => money(row.totalLiabilities)), isTotal: true },
  { label: "Net position", values: [], isSection: true },
  { label: "Net worth", values: projectionRows.map((row) => money(row.netWorth)), isTotal: true },
];
const assetLiabilityChartSeries = assignChartColors([
  ...activeScenario.assets
    .map((asset) => ({
      label: asset.name,
      rawValues: projectionRows.map((row) => row.assetValues[asset.assetId] ?? 0),
    }))
    .filter((row) => hasAnyAmount(row.rawValues)),
  ...retirementDisplayAccounts
    .map((account) => ({
      label: account.productName,
      rawValues: projectionRows.map((row) => row.retirementAccountBalances[account.accountId] ?? 0),
    }))
    .filter((row) => hasAnyAmount(row.rawValues)),
]);
const assetLiabilityLineValues = projectionRows.map((row) => row.totalLiabilities);
const assetLiabilityChartRawMaxValue = Math.max(
  1,
  ...projectionRows.map((row) => row.totalAssets),
  ...assetLiabilityLineValues,
);
const assetLiabilityChartAxis = chartAxisFor(assetLiabilityChartRawMaxValue);
const assetLiabilityChartAxisStep = assetLiabilityChartAxis.axisStep;
const assetLiabilityChartMaxValue = assetLiabilityChartAxis.maxValue;

const assets = [
  ...activeScenario.assets.map((asset) => ({
    name: asset.name,
    owner: ownerName(asset.ownerPersonId),
    type: asset.type,
    value: money(asset.openingValue),
    treatment:
      asset.centrelink === "exempt"
        ? "Excluded from Centrelink assessment in this scenario"
        : asset.centrelink === "financial-asset"
          ? "Deemed asset; included for deeming and assets test"
          : "Assessable asset; confirm treatment before relying on outputs",
  })),
  ...retirementDisplayAccounts.map((account) => ({
    name: account.productName,
    owner: ownerName(account.ownerPersonId),
    type: account.accountType,
    value: money(account.openingBalance),
    treatment: "Retirement account projected by the engine",
  })),
];

const cashflowRows = [
  ...activeScenario.cashflowItems
    .filter((item) => isCashflowIncomeCategory(item.category))
    .map((item) => ({
      section: "Inflow",
      item: item.label,
      annual: money(item.annualAmount),
      notes: item.taxable ? "Taxable income mapped from uploaded scenario" : "Non-taxable income mapped from uploaded scenario",
    })),
  {
    section: "Super",
    item: "Employer SG contributions",
    annual: money(projectionRows[0].employerSuperContributions),
    notes: "Calculated by the engine from taxable employment income and legislative SG assumptions",
  },
  {
    section: "Super",
    item: "Contributions tax",
    annual: money(-projectionRows[0].concessionalContributionsTax),
    notes: "15% contributions tax deducted inside super before investment earnings",
  },
  {
    section: "Super",
    item: "Net employer SG invested",
    annual: money(projectionRows[0].netEmployerSuperContributions),
    notes: "Allocated to each person's mapped accumulation account",
  },
  {
    section: "Inflow",
    item: "Account-based pension",
    annual: money(projectionRows[0].accountBasedPension),
    notes: activeScenario.retirementAccounts.some((account) => account.accountType === "account-based-pension")
      ? "Drawdown mapped from uploaded pension accounts"
      : "No account-based pension drawdown mapped",
  },
  { section: "Inflow", item: "Modelled Age Pension", annual: money(projectionRows[0].agePension.annualPayment), notes: `Calculated from ${projectionRows[0].agePension.bindingTest} test` },
  { section: "Inflow", item: "Bank interest", annual: money(projectionRows[0].bankInterest), notes: "Cash reserve interest taxed personally" },
  ...activeScenario.cashflowItems
    .filter(
      (item) =>
        isCashflowExpenseCategory(item.category) && !liabilityRepaymentItemIds.has(item.itemId),
    )
    .map((item) => ({
      section: "Outflow",
      item: item.label,
      annual: money(-item.annualAmount),
      notes: item.indexedToCpi ? "Mapped outflow indexed by CPI" : "Mapped outflow held flat",
    })),
  ...activeScenario.liabilities
    .filter((liability) => liability.annualRepayment > 0)
    .map((liability) => ({
      section: "Outflow",
      item: `${liability.name} repayment`,
      annual: money(-(projectionRows[0].liabilityRepaymentValues[liability.liabilityId] ?? 0)),
      notes: "Generated from the liability repayment input",
    })),
  { section: "Outflow", item: "Tax payable", annual: money(projectionRows[0].tax.taxPayable), notes: "Calculated from legislative assumptions below" },
  { section: "Net", item: "Estimated surplus / shortfall", annual: money(projectionRows[0].netCashflowAfterTax), notes: "After modelled tax, before ad hoc expenses" },
];

const retirementAccounts = retirementDisplayAccounts.map((account) => ({
  account: account.productName,
  balance: money(account.openingBalance),
  profile: account.investmentProfileKey,
  drawdown: account.annualDrawdown ? `${money(account.annualDrawdown)} p.a.` : "N/A",
  schemaRows: ["Opening Value", "Transaction (SOP)", "Earnings", "Ongoing Fee", "Tax Payable (EOP)", "Closing Value"],
}));

const projectionChecks = [
  "Confirm age, residency, and Age Pension eligibility before relying on Centrelink outputs.",
  "Age Pension is included in taxable income with core LITO and SAPTO offsets; confirm special-case tax treatments separately.",
  "CGT is a practical projection estimate using cost base, acquisition date, exemptions, losses, and the 50% discount; confirm detailed tax advice separately.",
  "Deductible loan interest reduces taxable income in the projection year only; confirm deductibility and loan purpose before relying on the result.",
  "Confirm pension minimum drawdown and current pension features where a pension account exists.",
  "Confirm current pension tax components and Centrelink assessment treatment.",
  "Confirm product fees, transaction costs, buy/sell spreads, and any loss of existing features before replacement modelling.",
  "Keep closing balances and tax outcomes locked as calculated outputs, not editable LLM fields.",
];

const assumptionSources = [
  { layer: "Economic", source: "Assumption_Economic.csv", use: "CPI, AWOTE, life expectancy factors, asset class growth and income assumptions" },
  { layer: "Investment profiles", source: "Assumption_Investment profiles.csv", use: "Balanced, Conservative, and Conservative/Balanced return profiles" },
  { layer: "Legislative", source: "Assumption_Legislative.csv", use: "Tax rates, offsets, Medicare, and general legislative settings" },
  { layer: "Account-based pension", source: "Assumption_Legislative - Account Based Pension.csv", use: "Minimum drawdown factors and pension constraints" },
  { layer: "Superannuation", source: "Assumption_Legislative_Superannuation.csv", use: "Contribution caps and super-specific rules" },
];

  return {
    activeScenario,
    money,
    projectionRows,
    primaryPersonId,
    projectionStartYear,
    endAge,
    cashReserveTarget,
    openingCash,
    openingAmpPension,
    startingNetWorth,
    finalProjectionYear,
    firstReserveBreach,
    cashflowProjectionRows,
    cashflowChartSeries,
    cashflowExpenseValues,
    cashflowChartMaxValue,
    cashflowChartAxisStep,
    assetLiabilityChartSeries,
    assetLiabilityLineValues,
    assetLiabilityChartMaxValue,
    assetLiabilityChartAxisStep,
    superProjectionGroups,
    pensionProjectionGroups,
    taxProjectionRows,
    taxProjectionRowsByPersonId,
    agePensionProjectionRows,
    agePensionProjectionRowsByPersonId,
    balanceSheetProjectionRows,
    assets,
    cashflowRows,
    retirementAccounts,
    projectionChecks,
    assumptions: assumptionSources,
  };
}

function ProjectionsPageContent() {
  const searchParams = useSearchParams();
  const linkedClientId = (searchParams.get("clientId") ?? searchParams.get("clientid"))?.trim() ?? "";
  const linkedSoaId = searchParams.get("soaId")?.trim() ?? "";
  const hasLinkedSoaContext = Boolean(linkedClientId && linkedSoaId);
  const [scenarioUploadName, setScenarioUploadName] = useState<string | null>(null);
  const [scenarioFile, setScenarioFile] = useState<File | null>(null);
  const [pendingClientProfileScenario, setPendingClientProfileScenario] = useState<ProjectionScenario | null>(null);
  const [scenarios, setScenarios] = useState<ProjectionScenario[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [workspaceStateLoaded, setWorkspaceStateLoaded] = useState(false);
  const [mappingResult, setMappingResult] = useState<ScenarioMapResponse | null>(null);
  const [mappingStatus, setMappingStatus] = useState<"idle" | "mapping" | "mapped" | "error">("idle");
  const [clientImportStatus, setClientImportStatus] = useState<ClientImportStatus>("idle");
  const [clientImportMessage, setClientImportMessage] = useState<string | null>(null);
  const [licenseeRiskProfiles, setLicenseeRiskProfiles] = useState<LicenseeRiskProfile[]>([]);
  const [licenseeRiskProfileSource, setLicenseeRiskProfileSource] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<ProjectionSection>("scenario-inputs");
  const [activeScenarioInputTab, setActiveScenarioInputTab] = useState<ScenarioInputTab>("scenario-details");
  const [cashflowViewMode, setCashflowViewMode] = useState<"table" | "chart">("table");
  const [assetLiabilityViewMode, setAssetLiabilityViewMode] = useState<"table" | "chart">("table");
  const [superOwnerFilter, setSuperOwnerFilter] = useState("all");
  const [activeAssetEditModalId, setActiveAssetEditModalId] = useState<string | null>(null);
  const [activeAssetSaleModalId, setActiveAssetSaleModalId] = useState<string | null>(null);
  const [activeAssetPurchaseModalId, setActiveAssetPurchaseModalId] = useState<string | null>(null);
  const [activeLiabilityDrawdownModalId, setActiveLiabilityDrawdownModalId] = useState<string | null>(null);
  const [activeLiabilityPaymentModalId, setActiveLiabilityPaymentModalId] = useState<string | null>(null);
  const [activePensionWithdrawalModalId, setActivePensionWithdrawalModalId] = useState<string | null>(null);
  const [activeSuperStrategyModalId, setActiveSuperStrategyModalId] = useState<string | null>(null);
  const [activeSuperRolloverModalId, setActiveSuperRolloverModalId] = useState<string | null>(null);
  const [taxPersonFilter, setTaxPersonFilter] = useState<string | null>(null);
  const [centrelinkPersonFilter, setCentrelinkPersonFilter] = useState<string | null>(null);
  const [scenarioAssumptionOverrides, setScenarioAssumptionOverrides] = useState<ScenarioAssumptionOverrides>(
    getInitialScenarioAssumptionOverrides,
  );
  const workspaceStorageKey = useMemo(
    () => projectionWorkspaceStorageKey(linkedClientId, linkedSoaId),
    [linkedClientId, linkedSoaId],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      setWorkspaceStateLoaded(true);
      return;
    }

    const raw = window.localStorage.getItem(workspaceStorageKey);
    if (!raw) {
      setWorkspaceStateLoaded(true);
      return;
    }

    try {
      const stored = JSON.parse(raw) as StoredProjectionWorkspaceState;
      if (Array.isArray(stored.scenarios) && stored.scenarios.length) {
        const storedScenarios = stored.scenarios.map(normalizeProjectionScenario);
        setScenarios(storedScenarios);
        setActiveScenarioId(
          stored.activeScenarioId && storedScenarios.some((scenario) => scenario.scenarioId === stored.activeScenarioId)
            ? stored.activeScenarioId
            : storedScenarios[0]?.scenarioId ?? null,
        );
        const fallbackAssumptions = getInitialScenarioAssumptionOverrides();
        setScenarioAssumptionOverrides({
          ...fallbackAssumptions,
          ...stored.scenarioAssumptionOverrides,
          riskProfiles: {
            ...fallbackAssumptions.riskProfiles,
            ...(stored.scenarioAssumptionOverrides?.riskProfiles ?? {}),
          },
        });
        setActiveSection(stored.activeSection ?? "scenario-inputs");
        setActiveScenarioInputTab(normalizeScenarioInputTab(stored.activeScenarioInputTab));
      }
    } catch {
      // Ignore corrupted local workspace state and start clean.
    } finally {
      setWorkspaceStateLoaded(true);
    }
  }, [workspaceStorageKey]);

  useEffect(() => {
    if (!workspaceStateLoaded || !linkedClientId) {
      return;
    }

    let cancelled = false;

    async function loadLicenseeRiskProfiles() {
      try {
        const [profileResponse, licenseesResult] = await Promise.all([
          fetch(`/api/finley/soa/client-profile?clientId=${encodeURIComponent(linkedClientId)}`, {
            method: "GET",
            cache: "no-store",
          }),
          listAdminLicensees(),
        ]);
        const profileBody = (await profileResponse.json().catch(() => null)) as { profile?: ClientProfile } | null;

        if (cancelled || !profileResponse.ok || !profileBody?.profile) {
          return;
        }

        const licensees = licenseesResult?.data ?? [];
        const matchedLicensee = findClientLicensee(licensees, profileBody.profile);
        const matchedRiskProfiles = activeLicenseeRiskProfiles(matchedLicensee);

        setLicenseeRiskProfiles(matchedRiskProfiles);
        setLicenseeRiskProfileSource(matchedRiskProfiles.length ? matchedLicensee?.name ?? "client licensee" : null);

        if (matchedRiskProfiles.length) {
          const licenseeAssumptions = mapLicenseeRiskProfilesToProjectionAssumptions(matchedRiskProfiles);
          setScenarioAssumptionOverrides((current) => ({
            ...current,
            riskProfiles: {
              ...current.riskProfiles,
              ...licenseeAssumptions,
            },
          }));
        }
      } catch {
        if (!cancelled) {
          setLicenseeRiskProfiles([]);
          setLicenseeRiskProfileSource(null);
        }
      }
    }

    loadLicenseeRiskProfiles();

    return () => {
      cancelled = true;
    };
  }, [linkedClientId, workspaceStateLoaded]);

  useEffect(() => {
    if (!workspaceStateLoaded || typeof window === "undefined") {
      return;
    }

    const stored = buildStoredProjectionWorkspaceState({
      scenarios,
      activeScenarioId,
      scenarioAssumptionOverrides,
      activeSection,
      activeScenarioInputTab,
    });
    window.localStorage.setItem(workspaceStorageKey, JSON.stringify(stored));

    if (hasLinkedSoaContext) {
      const packages = scenarios.map((scenario) => createProjectionPackageForScenario(scenario));
      writeSoaProjectionScenarioOptions(linkedClientId, linkedSoaId, packages);

      const selectedPackage = readSoaProjectionPackage(linkedClientId, linkedSoaId);
      const refreshedSelectedPackage = packages.find(
        (packageValue) => packageValue.selectedScenarioId === selectedPackage?.selectedScenarioId,
      );
      if (refreshedSelectedPackage) {
        writeSoaProjectionPackage(refreshedSelectedPackage);
      }
    }
  }, [
    activeScenarioId,
    activeScenarioInputTab,
    activeSection,
    hasLinkedSoaContext,
    linkedClientId,
    linkedSoaId,
    scenarioAssumptionOverrides,
    scenarios,
    workspaceStateLoaded,
    workspaceStorageKey,
  ]);

  function closeRowActionMenus(except?: HTMLDetailsElement) {
    if (typeof document === "undefined") {
      return;
    }

    document.querySelectorAll<HTMLDetailsElement>(`details.${styles.rowActionMenu}[open]`).forEach((menu) => {
      if (menu !== except) {
        menu.open = false;
      }
    });
  }

  function handleRowActionMenuToggle(event: { currentTarget: HTMLDetailsElement }) {
    if (event.currentTarget.open) {
      closeRowActionMenus(event.currentTarget);
    }
  }

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element) || target.closest(`details.${styles.rowActionMenu}`)) {
        return;
      }

      closeRowActionMenus();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeRowActionMenus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const mappedScenario = scenarios.find((scenario) => scenario.scenarioId === activeScenarioId) ?? null;
  const hasSourceDataReady = Boolean(scenarioFile || pendingClientProfileScenario);
  const activeRiskProfileNames = useMemo(() => riskProfileAssumptionNames(licenseeRiskProfiles), [licenseeRiskProfiles]);
  const activeAssumptions = useMemo(
    () => {
      const licenseeAssumptions = mapLicenseeRiskProfilesToProjectionAssumptions(licenseeRiskProfiles);
      const baseRiskProfiles = {
        ...currentProjectionAssumptions.investmentProfiles.profiles,
        ...Object.fromEntries(
          Object.entries(licenseeAssumptions).map(([profileName, profile]) => [
            profileName,
            {
              incomeRate: profile.incomeRate,
              growthRate: profile.growthRate,
              totalReturn: profile.incomeRate + profile.growthRate,
              standardDeviation: profile.standardDeviation ?? 0,
              defensivePct: profile.defensivePct ?? 0,
              growthPct: profile.growthPct ?? 0,
            },
          ]),
        ),
      };
      const riskProfiles = Object.fromEntries(
        Object.entries(baseRiskProfiles).map(([profileName, profile]) => {
          const override = scenarioAssumptionOverrides.riskProfiles[profileName];
          const incomeRate = override?.incomeRate ?? profile.incomeRate;
          const growthRate = override?.growthRate ?? profile.growthRate;

          return [
            profileName,
            {
              ...profile,
              incomeRate,
              growthRate,
              totalReturn: incomeRate + growthRate,
              standardDeviation: override?.standardDeviation ?? profile.standardDeviation,
              defensivePct: override?.defensivePct ?? profile.defensivePct,
              growthPct: override?.growthPct ?? profile.growthPct,
            },
          ];
        }),
      );

      return {
        ...currentProjectionAssumptions,
        economic: {
          ...currentProjectionAssumptions.economic,
          cpiRate: scenarioAssumptionOverrides.cpiRate,
        },
        legislative: {
          ...currentProjectionAssumptions.legislative,
          superannuation: {
            ...currentProjectionAssumptions.legislative.superannuation,
            superGuaranteeRate: scenarioAssumptionOverrides.superGuaranteeRate,
            concessionalContributionsCap: scenarioAssumptionOverrides.concessionalContributionsCap,
            contributionsTaxRate: scenarioAssumptionOverrides.contributionsTaxRate,
            investmentEarningsTaxRate: scenarioAssumptionOverrides.investmentEarningsTaxRate,
          },
        },
        investmentProfiles: {
          profiles: riskProfiles,
        },
      };
    },
    [licenseeRiskProfiles, scenarioAssumptionOverrides],
  );
  const viewModel = useMemo(
    () => buildProjectionViewModel(mappedScenario ?? blankProjectionScenario, activeAssumptions),
    [activeAssumptions, mappedScenario],
  );
  const {
    activeScenario,
    money,
    projectionRows,
    primaryPersonId,
    projectionStartYear,
    endAge,
    cashReserveTarget,
    openingCash,
    openingAmpPension,
    startingNetWorth,
    finalProjectionYear,
    firstReserveBreach,
    cashflowProjectionRows,
    cashflowChartSeries,
    cashflowExpenseValues,
    cashflowChartMaxValue,
    cashflowChartAxisStep,
    assetLiabilityChartSeries,
    assetLiabilityLineValues,
    assetLiabilityChartMaxValue,
    assetLiabilityChartAxisStep,
    superProjectionGroups,
    pensionProjectionGroups,
    taxProjectionRows,
    taxProjectionRowsByPersonId,
    agePensionProjectionRows,
    agePensionProjectionRowsByPersonId,
    balanceSheetProjectionRows,
    assets,
    cashflowRows,
    retirementAccounts,
    projectionChecks,
    assumptions,
  } = viewModel;
  const primaryPerson = activeScenario.people.find((person) => person.personId === activeScenario.primaryPersonId);
  const activeClientName = mappedScenario ? primaryPerson?.name ?? activeScenario.scenarioName : "Blank scenario";
  const selectedTaxPersonId = activeScenario.people.some((person) => person.personId === taxPersonFilter)
    ? taxPersonFilter
    : activeScenario.primaryPersonId;
  const selectedTaxProjectionRows = taxProjectionRowsByPersonId[selectedTaxPersonId ?? activeScenario.primaryPersonId] ?? taxProjectionRows;
  const selectedCentrelinkPersonId = activeScenario.people.some((person) => person.personId === centrelinkPersonFilter)
    ? centrelinkPersonFilter
    : activeScenario.primaryPersonId;
  const selectedCentrelinkProjectionRows =
    agePensionProjectionRowsByPersonId[selectedCentrelinkPersonId ?? activeScenario.primaryPersonId] ?? agePensionProjectionRows;
  const filteredSuperProjectionGroups =
    superOwnerFilter === "all"
      ? superProjectionGroups
      : superProjectionGroups.filter((group) => group.ownerPersonId === superOwnerFilter);
  const filteredPensionProjectionGroups =
    superOwnerFilter === "all"
      ? pensionProjectionGroups
      : pensionProjectionGroups.filter((group) => group.ownerPersonId === superOwnerFilter);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const activeLiabilityRepaymentItemIds = new Set(
    activeScenario.liabilities.map((liability) => `${liability.liabilityId}-repayment`),
  );
  const activeAssetEdit = activeScenario.assets.find((asset) => asset.assetId === activeAssetEditModalId) ?? null;
  const activeAssetSale = (activeScenario.assetSaleEvents ?? []).find((event) => event.eventId === activeAssetSaleModalId) ?? null;
  const activeAssetSaleAsset = activeAssetSale
    ? activeScenario.assets.find((asset) => asset.assetId === activeAssetSale.assetId) ?? null
    : null;
  const activeAssetSaleOwnerCashAssets = activeAssetSaleAsset
    ? activeScenario.assets.filter(
        (asset) =>
          isCashAssetType(asset.type) &&
          (asset.ownerPersonId === activeAssetSaleAsset.ownerPersonId || asset.ownerPersonId === jointOwnerId),
      )
    : [];
  const activeAssetSaleCashAssets =
    activeAssetSaleOwnerCashAssets.length > 0 ? activeAssetSaleOwnerCashAssets : activeScenario.assets.filter((asset) => isCashAssetType(asset.type));
  const activeAssetPurchase =
    (activeScenario.assetPurchaseEvents ?? []).find((event) => event.eventId === activeAssetPurchaseModalId) ?? null;
  const activeAssetPurchaseAsset = activeAssetPurchase
    ? activeScenario.assets.find((asset) => asset.assetId === activeAssetPurchase.assetId) ?? null
    : null;
  const activeAssetPurchaseOwnerCashAssets = activeAssetPurchaseAsset
    ? activeScenario.assets.filter(
        (asset) =>
          isCashAssetType(asset.type) &&
          (asset.ownerPersonId === activeAssetPurchaseAsset.ownerPersonId || asset.ownerPersonId === jointOwnerId),
      )
    : [];
  const activeAssetPurchaseCashAssets =
    activeAssetPurchaseOwnerCashAssets.length > 0
      ? activeAssetPurchaseOwnerCashAssets
      : activeScenario.assets.filter((asset) => isCashAssetType(asset.type));
  const activeLiabilityDrawdown =
    (activeScenario.liabilityDrawdownEvents ?? []).find((event) => event.eventId === activeLiabilityDrawdownModalId) ?? null;
  const activeLiabilityDrawdownLiability = activeLiabilityDrawdown
    ? activeScenario.liabilities.find((liability) => liability.liabilityId === activeLiabilityDrawdown.liabilityId) ?? null
    : null;
  const activeLiabilityDrawdownOwnerCashAssets = activeLiabilityDrawdownLiability
    ? activeScenario.assets.filter(
        (asset) =>
          isCashAssetType(asset.type) &&
          (asset.ownerPersonId === activeLiabilityDrawdownLiability.ownerPersonId || asset.ownerPersonId === jointOwnerId),
      )
    : [];
  const activeLiabilityDrawdownCashAssets =
    activeLiabilityDrawdownOwnerCashAssets.length > 0
      ? activeLiabilityDrawdownOwnerCashAssets
      : activeScenario.assets.filter((asset) => isCashAssetType(asset.type));
  const activeLiabilityPayment =
    (activeScenario.liabilityPaymentEvents ?? []).find((event) => event.eventId === activeLiabilityPaymentModalId) ?? null;
  const activeLiabilityPaymentLiability = activeLiabilityPayment
    ? activeScenario.liabilities.find((liability) => liability.liabilityId === activeLiabilityPayment.liabilityId) ?? null
    : null;
  const activeLiabilityPaymentOwnerCashAssets = activeLiabilityPaymentLiability
    ? activeScenario.assets.filter(
        (asset) =>
          isCashAssetType(asset.type) &&
          (asset.ownerPersonId === activeLiabilityPaymentLiability.ownerPersonId || asset.ownerPersonId === jointOwnerId),
      )
    : [];
  const activeLiabilityPaymentCashAssets =
    activeLiabilityPaymentOwnerCashAssets.length > 0
      ? activeLiabilityPaymentOwnerCashAssets
      : activeScenario.assets.filter((asset) => isCashAssetType(asset.type));
  const activePensionWithdrawal =
    (activeScenario.pensionWithdrawalEvents ?? []).find((event) => event.eventId === activePensionWithdrawalModalId) ?? null;
  const activePensionWithdrawalAccount = activePensionWithdrawal
    ? activeScenario.retirementAccounts.find((account) => account.accountId === activePensionWithdrawal.accountId) ?? null
    : null;
  const activePensionWithdrawalOwnerCashAssets = activePensionWithdrawalAccount
    ? activeScenario.assets.filter(
        (asset) =>
          isCashAssetType(asset.type) &&
          (asset.ownerPersonId === activePensionWithdrawalAccount.ownerPersonId || asset.ownerPersonId === jointOwnerId),
      )
    : [];
  const activePensionWithdrawalCashAssets =
    activePensionWithdrawalOwnerCashAssets.length > 0
      ? activePensionWithdrawalOwnerCashAssets
      : activeScenario.assets.filter((asset) => isCashAssetType(asset.type));
  const activeSuperStrategy = (activeScenario.superContributionStrategies ?? []).find(
    (strategy) => strategy.strategyId === activeSuperStrategyModalId,
  ) ?? null;
  const activeSuperRollover = (activeScenario.superRolloverEvents ?? []).find(
    (rolloverEvent) => rolloverEvent.eventId === activeSuperRolloverModalId,
  ) ?? null;
  const superAccumulationAccounts = activeScenario.retirementAccounts.filter(
    (account) => account.accountType === "super-accumulation",
  );
  const accountBasedPensionAccounts = activeScenario.retirementAccounts.filter(
    (account) => account.accountType === "account-based-pension",
  );
  const activeSuperStrategyTargetAccount = activeSuperStrategy
    ? superAccumulationAccounts.find((account) => account.accountId === activeSuperStrategy.targetAccountId) ?? null
    : null;
  const activeSuperStrategyOwnerName = activeSuperStrategyTargetAccount
    ? activeScenario.people.find((person) => person.personId === activeSuperStrategyTargetAccount.ownerPersonId)?.name ?? "Client"
    : "Client";
  const activeSuperRolloverSourceAccount = activeSuperRollover
    ? superAccumulationAccounts.find((account) => account.accountId === activeSuperRollover.sourceAccountId) ?? null
    : null;
  const activeSuperRolloverDestinationAccounts = activeSuperRolloverSourceAccount
    ? accountBasedPensionAccounts.filter(
        (account) => account.ownerPersonId === activeSuperRolloverSourceAccount.ownerPersonId,
      )
    : [];
  const activeSuperRolloverDestinationAccountId =
    activeSuperRollover?.destinationAccountId &&
    activeSuperRolloverDestinationAccounts.some((account) => account.accountId === activeSuperRollover.destinationAccountId)
      ? activeSuperRollover.destinationAccountId
      : "";
  const activeSuperRolloverCreatesNewPension = Boolean(activeSuperRollover && !activeSuperRolloverDestinationAccountId);

  function scenarioVersionId(prefix = "scenario") {
    return makeId(prefix);
  }

  function updateActiveScenario(applyUpdate: (draft: ProjectionScenario) => void) {
    const nextScenario = structuredClone(activeScenario) as ProjectionScenario;
    applyUpdate(nextScenario);
    const scenarioId = !activeScenarioId || activeScenarioId === blankProjectionScenario.scenarioId
      ? scenarioVersionId("manual")
      : activeScenarioId;
    nextScenario.scenarioId = scenarioId;

    setScenarios((currentScenarios) => {
      if (!currentScenarios.some((scenario) => scenario.scenarioId === scenarioId)) {
        return [nextScenario];
      }

      return currentScenarios.map((scenario) => (scenario.scenarioId === scenarioId ? nextScenario : scenario));
    });
    setActiveScenarioId(scenarioId);
  }

  function numberFromInput(value: string, fallback = 0) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
  }

  function numberFromCurrencyInput(value: string, fallback = 0) {
    const isNegativeParentheses = /^\s*\(.*\)\s*$/.test(value);
    const numericValue = Number(value.replace(/[,$\s()]/g, ""));

    if (!Number.isFinite(numericValue)) {
      return fallback;
    }

    return isNegativeParentheses ? -Math.abs(numericValue) : numericValue;
  }

  function currencyInputValue(value: number) {
    if (!Number.isFinite(value)) {
      return "";
    }

    return value.toLocaleString("en-AU", {
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    });
  }

  function percentInputValue(value: number) {
    return Math.round(value * 10000) / 100;
  }

  function renderCurrencyInput(input: { value: number; onChange: (value: number) => void }) {
    return (
      <div className={styles.affixInput}>
        <span>$</span>
        <input
          type="text"
          inputMode="decimal"
          value={currencyInputValue(input.value)}
          onChange={(event) => input.onChange(numberFromCurrencyInput(event.target.value, input.value))}
        />
      </div>
    );
  }

  function renderPercentInput(input: { value: number; onChange: (value: number) => void; compact?: boolean }) {
    return (
      <div className={`${styles.affixInput} ${styles.percentAffixInput} ${input.compact ? styles.compactAffixInput : ""}`.trim()}>
        <input
          type="number"
          step="0.1"
          value={percentInputValue(input.value)}
          onChange={(event) => input.onChange(numberFromInput(event.target.value, percentInputValue(input.value)) / 100)}
        />
        <span>%</span>
      </div>
    );
  }

  function updateRiskProfileAssumption(
    profileName: string,
    applyUpdate: (profile: ScenarioAssumptionOverrides["riskProfiles"][string]) => void,
  ) {
    setScenarioAssumptionOverrides((current) => {
      const existingProfile = current.riskProfiles[profileName] ?? {
        incomeRate: 0,
        growthRate: 0,
        standardDeviation: null,
        defensivePct: null,
        growthPct: null,
      };
      const nextProfile = { ...existingProfile };
      applyUpdate(nextProfile);

      return {
        ...current,
        riskProfiles: {
          ...current.riskProfiles,
          [profileName]: nextProfile,
        },
      };
    });
  }

  function updatePerson(personId: string, applyUpdate: (person: ProjectionScenario["people"][number]) => void) {
    updateActiveScenario((draft) => {
      const person = draft.people.find((entry) => entry.personId === personId);
      if (person) {
        applyUpdate(person);
      }
    });
  }

  function updateDependant(
    dependantId: string,
    applyUpdate: (dependant: NonNullable<ProjectionScenario["dependants"]>[number]) => void,
  ) {
    updateActiveScenario((draft) => {
      const dependant = (draft.dependants ?? []).find((entry) => entry.dependantId === dependantId);
      if (dependant) {
        applyUpdate(dependant);
      }
    });
  }

  function updateCashflowItem(itemId: string, applyUpdate: (item: ProjectionScenario["cashflowItems"][number]) => void) {
    updateActiveScenario((draft) => {
      const item = draft.cashflowItems.find((entry) => entry.itemId === itemId);
      if (item) {
        applyUpdate(item);
      }
    });
  }

  function updateAsset(assetId: string, applyUpdate: (asset: ProjectionScenario["assets"][number]) => void) {
    updateActiveScenario((draft) => {
      const asset = draft.assets.find((entry) => entry.assetId === assetId);
      if (asset) {
        applyUpdate(asset);
      }
    });
  }

  function updateLiability(liabilityId: string, applyUpdate: (liability: ProjectionScenario["liabilities"][number]) => void) {
    updateActiveScenario((draft) => {
      const liability = draft.liabilities.find((entry) => entry.liabilityId === liabilityId);
      if (liability) {
        applyUpdate(liability);
      }
    });
  }

  function updateRetirementAccount(
    accountId: string,
    applyUpdate: (account: ProjectionScenario["retirementAccounts"][number]) => void,
  ) {
    updateActiveScenario((draft) => {
      const account = draft.retirementAccounts.find((entry) => entry.accountId === accountId);
      if (account) {
        applyUpdate(account);
      }
    });
  }

  function createScenarioInputId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function addCashflowItem(category: ProjectionScenario["cashflowItems"][number]["category"]) {
    updateActiveScenario((draft) => {
      draft.cashflowItems.push({
        itemId: createScenarioInputId("cashflow"),
        ownerPersonId: draft.primaryPersonId,
        category,
        label: isCashflowIncomeCategory(category) ? "New income" : "New expense",
        annualAmount: 0,
        startDate: null,
        endDate: null,
        indexedToCpi: isCashflowExpenseCategory(category),
        taxable: isCashflowIncomeCategory(category),
      });
    });
  }

  function deleteCashflowItem(itemId: string) {
    updateActiveScenario((draft) => {
      draft.cashflowItems = draft.cashflowItems.filter((item) => item.itemId !== itemId);
    });
  }

  function addAsset(type: ProjectionScenario["assets"][number]["type"]) {
    updateActiveScenario((draft) => {
      draft.assets.push({
        assetId: createScenarioInputId("asset"),
        ownerPersonId: draft.primaryPersonId,
        type,
        name: defaultAssetName(type),
        openingValue: 0,
        annualIncome: 0,
        growthRateKey: defaultAssetGrowthRateKey(type),
        centrelink: defaultAssetCentrelink(type),
        reserveTarget: isCashAssetType(type) ? 0 : null,
        costBase: 0,
        acquisitionDate: null,
        cgtTreatment: defaultAssetCgtTreatment(type),
      });
    });
  }

  function deleteAsset(assetId: string) {
    updateActiveScenario((draft) => {
      draft.assets = draft.assets.filter((asset) => asset.assetId !== assetId);
      draft.assetSaleEvents = (draft.assetSaleEvents ?? []).filter(
        (event) => event.assetId !== assetId && event.targetAssetId !== assetId,
      );
      draft.assetPurchaseEvents = (draft.assetPurchaseEvents ?? []).filter(
        (event) => event.assetId !== assetId && event.sourceAssetId !== assetId,
      );
      draft.liabilityDrawdownEvents = (draft.liabilityDrawdownEvents ?? []).filter((event) => event.targetAssetId !== assetId);
      draft.liabilityPaymentEvents = (draft.liabilityPaymentEvents ?? []).filter((event) => event.sourceAssetId !== assetId);
      draft.pensionWithdrawalEvents = (draft.pensionWithdrawalEvents ?? []).filter((event) => event.targetAssetId !== assetId);
    });
    setActiveAssetEditModalId((currentId) => currentId === assetId ? null : currentId);
  }

  function addLiability(type: ProjectionScenario["liabilities"][number]["type"]) {
    updateActiveScenario((draft) => {
      draft.liabilities.push({
        liabilityId: createScenarioInputId("liability"),
        ownerPersonId: draft.primaryPersonId,
        type,
        name: type === "mortgage" ? "New home loan" : type === "credit-card" ? "New credit card" : "New liability",
        openingBalance: 0,
        annualInterestRate: 0,
        annualRepayment: 0,
        repaymentTiming: "end-of-year",
        repaymentType: "principal-and-interest",
        interestDeductible: false,
      });
    });
  }

  function deleteLiability(liabilityId: string) {
    updateActiveScenario((draft) => {
      draft.liabilities = draft.liabilities.filter((liability) => liability.liabilityId !== liabilityId);
      draft.liabilityDrawdownEvents = (draft.liabilityDrawdownEvents ?? []).filter((event) => event.liabilityId !== liabilityId);
      draft.liabilityPaymentEvents = (draft.liabilityPaymentEvents ?? []).filter((event) => event.liabilityId !== liabilityId);
    });
  }

  function updateAssetSaleEvent(
    eventId: string,
    applyUpdate: (event: NonNullable<ProjectionScenario["assetSaleEvents"]>[number]) => void,
  ) {
    updateActiveScenario((draft) => {
      draft.assetSaleEvents = draft.assetSaleEvents ?? [];
      const saleEvent = draft.assetSaleEvents.find((entry) => entry.eventId === eventId);
      if (saleEvent) {
        applyUpdate(saleEvent);
      }
    });
  }

  function addAssetSaleEvent(assetId?: string) {
    const eventId = createScenarioInputId("asset-sale");

    updateActiveScenario((draft) => {
      const sourceAsset = draft.assets.find((asset) => asset.assetId === assetId) ?? draft.assets[0];
      if (!sourceAsset) {
        return;
      }

      const cashAsset =
        draft.assets.find((asset) => isCashAssetType(asset.type) && asset.ownerPersonId === sourceAsset.ownerPersonId) ??
        draft.assets.find((asset) => isCashAssetType(asset.type) && asset.ownerPersonId === jointOwnerId) ??
        draft.assets.find((asset) => isCashAssetType(asset.type));

      draft.assetSaleEvents = draft.assetSaleEvents ?? [];
      draft.assetSaleEvents.push({
        eventId,
        label: `Sell ${sourceAsset.name}`,
        assetId: sourceAsset.assetId,
        saleDate: null,
        amountMode: "full-value",
        fixedAmount: 0,
        targetAssetId: cashAsset?.assetId ?? null,
        enabled: true,
      });
    });
    setActiveAssetSaleModalId(eventId);
  }

  function deleteAssetSaleEvent(eventId: string) {
    updateActiveScenario((draft) => {
      draft.assetSaleEvents = (draft.assetSaleEvents ?? []).filter((event) => event.eventId !== eventId);
    });
    setActiveAssetSaleModalId((currentId) => currentId === eventId ? null : currentId);
  }

  function updateAssetPurchaseEvent(
    eventId: string,
    applyUpdate: (event: NonNullable<ProjectionScenario["assetPurchaseEvents"]>[number]) => void,
  ) {
    updateActiveScenario((draft) => {
      draft.assetPurchaseEvents = draft.assetPurchaseEvents ?? [];
      const purchaseEvent = draft.assetPurchaseEvents.find((entry) => entry.eventId === eventId);
      if (purchaseEvent) {
        applyUpdate(purchaseEvent);
      }
    });
  }

  function addAssetPurchaseEvent(assetId?: string) {
    const eventId = createScenarioInputId("asset-purchase");

    updateActiveScenario((draft) => {
      const targetAsset = draft.assets.find((asset) => asset.assetId === assetId) ?? draft.assets[0];
      if (!targetAsset) {
        return;
      }

      const cashAsset =
        draft.assets.find((asset) => isCashAssetType(asset.type) && asset.ownerPersonId === targetAsset.ownerPersonId) ??
        draft.assets.find((asset) => isCashAssetType(asset.type) && asset.ownerPersonId === jointOwnerId) ??
        draft.assets.find((asset) => isCashAssetType(asset.type));

      draft.assetPurchaseEvents = draft.assetPurchaseEvents ?? [];
      draft.assetPurchaseEvents.push({
        eventId,
        label: `Buy ${targetAsset.name}`,
        assetId: targetAsset.assetId,
        purchaseDate: null,
        amount: 0,
        sourceAssetId: cashAsset?.assetId ?? null,
        enabled: true,
      });
    });
    setActiveAssetPurchaseModalId(eventId);
  }

  function deleteAssetPurchaseEvent(eventId: string) {
    updateActiveScenario((draft) => {
      draft.assetPurchaseEvents = (draft.assetPurchaseEvents ?? []).filter((event) => event.eventId !== eventId);
    });
    setActiveAssetPurchaseModalId((currentId) => currentId === eventId ? null : currentId);
  }

  function updateLiabilityDrawdownEvent(
    eventId: string,
    applyUpdate: (event: NonNullable<ProjectionScenario["liabilityDrawdownEvents"]>[number]) => void,
  ) {
    updateActiveScenario((draft) => {
      draft.liabilityDrawdownEvents = draft.liabilityDrawdownEvents ?? [];
      const drawdownEvent = draft.liabilityDrawdownEvents.find((entry) => entry.eventId === eventId);
      if (drawdownEvent) {
        applyUpdate(drawdownEvent);
      }
    });
  }

  function addLiabilityDrawdownEvent(liabilityId?: string) {
    const eventId = createScenarioInputId("liability-drawdown");

    updateActiveScenario((draft) => {
      const liability = draft.liabilities.find((entry) => entry.liabilityId === liabilityId) ?? draft.liabilities[0];
      if (!liability) {
        return;
      }

      const cashAsset =
        draft.assets.find((asset) => isCashAssetType(asset.type) && asset.ownerPersonId === liability.ownerPersonId) ??
        draft.assets.find((asset) => isCashAssetType(asset.type) && asset.ownerPersonId === jointOwnerId) ??
        draft.assets.find((asset) => isCashAssetType(asset.type));

      draft.liabilityDrawdownEvents = draft.liabilityDrawdownEvents ?? [];
      draft.liabilityDrawdownEvents.push({
        eventId,
        label: `Draw ${liability.name}`,
        liabilityId: liability.liabilityId,
        drawdownDate: null,
        amount: 0,
        targetAssetId: cashAsset?.assetId ?? null,
        enabled: true,
      });
    });
    setActiveLiabilityDrawdownModalId(eventId);
  }

  function deleteLiabilityDrawdownEvent(eventId: string) {
    updateActiveScenario((draft) => {
      draft.liabilityDrawdownEvents = (draft.liabilityDrawdownEvents ?? []).filter((event) => event.eventId !== eventId);
    });
    setActiveLiabilityDrawdownModalId((currentId) => currentId === eventId ? null : currentId);
  }

  function updateLiabilityPaymentEvent(
    eventId: string,
    applyUpdate: (event: NonNullable<ProjectionScenario["liabilityPaymentEvents"]>[number]) => void,
  ) {
    updateActiveScenario((draft) => {
      draft.liabilityPaymentEvents = draft.liabilityPaymentEvents ?? [];
      const paymentEvent = draft.liabilityPaymentEvents.find((entry) => entry.eventId === eventId);
      if (paymentEvent) {
        applyUpdate(paymentEvent);
      }
    });
  }

  function addLiabilityPaymentEvent(liabilityId?: string) {
    const eventId = createScenarioInputId("liability-payment");

    updateActiveScenario((draft) => {
      const liability = draft.liabilities.find((entry) => entry.liabilityId === liabilityId) ?? draft.liabilities[0];
      if (!liability) {
        return;
      }

      const cashAsset =
        draft.assets.find((asset) => isCashAssetType(asset.type) && asset.ownerPersonId === liability.ownerPersonId) ??
        draft.assets.find((asset) => isCashAssetType(asset.type) && asset.ownerPersonId === jointOwnerId) ??
        draft.assets.find((asset) => isCashAssetType(asset.type));

      draft.liabilityPaymentEvents = draft.liabilityPaymentEvents ?? [];
      draft.liabilityPaymentEvents.push({
        eventId,
        label: `Pay ${liability.name}`,
        liabilityId: liability.liabilityId,
        paymentDate: null,
        amountMode: "full-balance",
        fixedAmount: 0,
        sourceAssetId: cashAsset?.assetId ?? null,
        enabled: true,
      });
    });
    setActiveLiabilityPaymentModalId(eventId);
  }

  function deleteLiabilityPaymentEvent(eventId: string) {
    updateActiveScenario((draft) => {
      draft.liabilityPaymentEvents = (draft.liabilityPaymentEvents ?? []).filter((event) => event.eventId !== eventId);
    });
    setActiveLiabilityPaymentModalId((currentId) => currentId === eventId ? null : currentId);
  }

  function addRetirementAccount(accountType: ProjectionScenario["retirementAccounts"][number]["accountType"]) {
    updateActiveScenario((draft) => {
      draft.retirementAccounts.push({
        accountId: createScenarioInputId("retirement"),
        ownerPersonId: draft.primaryPersonId,
        accountType,
        provider: "To be confirmed",
        productName: accountType === "account-based-pension" ? "New account-based pension" : "New super account",
        openingBalance: 0,
        annualFeeRate: 0.015,
        annualInsurancePremium: 0,
        annualContribution: 0,
        annualContributionType: "concessional",
        rolloverToPensionDate: null,
        rolloverPensionName: null,
        rolloverAnnualDrawdown: 0,
        rolloverDrawdownIndexedToCpi: false,
        investmentProfileKey: "Balanced",
        annualDrawdown: accountType === "account-based-pension" ? 0 : 0,
        drawdownIndexedToCpi: false,
        taxableToClient: false,
        centrelink: "financial-asset",
      });
    });
  }

  function deleteRetirementAccount(accountId: string) {
    updateActiveScenario((draft) => {
      draft.retirementAccounts = draft.retirementAccounts.filter((account) => account.accountId !== accountId);
      draft.superContributionStrategies = (draft.superContributionStrategies ?? []).filter(
        (strategy) => strategy.targetAccountId !== accountId,
      );
      draft.superRolloverEvents = (draft.superRolloverEvents ?? []).filter(
        (event) => event.sourceAccountId !== accountId && event.destinationAccountId !== accountId,
      );
      draft.pensionWithdrawalEvents = (draft.pensionWithdrawalEvents ?? []).filter((event) => event.accountId !== accountId);
    });
  }

  function updatePensionWithdrawalEvent(
    eventId: string,
    applyUpdate: (event: NonNullable<ProjectionScenario["pensionWithdrawalEvents"]>[number]) => void,
  ) {
    updateActiveScenario((draft) => {
      draft.pensionWithdrawalEvents = draft.pensionWithdrawalEvents ?? [];
      const withdrawalEvent = draft.pensionWithdrawalEvents.find((entry) => entry.eventId === eventId);
      if (withdrawalEvent) {
        applyUpdate(withdrawalEvent);
      }
    });
  }

  function addPensionWithdrawalEvent(accountId?: string) {
    const eventId = createScenarioInputId("pension-withdrawal");

    updateActiveScenario((draft) => {
      const account =
        draft.retirementAccounts.find((entry) => entry.accountId === accountId && entry.accountType === "account-based-pension") ??
        draft.retirementAccounts.find((entry) => entry.accountType === "account-based-pension");
      if (!account) {
        return;
      }

      const cashAsset =
        draft.assets.find((asset) => isCashAssetType(asset.type) && asset.ownerPersonId === account.ownerPersonId) ??
        draft.assets.find((asset) => isCashAssetType(asset.type) && asset.ownerPersonId === jointOwnerId) ??
        draft.assets.find((asset) => isCashAssetType(asset.type));

      draft.pensionWithdrawalEvents = draft.pensionWithdrawalEvents ?? [];
      draft.pensionWithdrawalEvents.push({
        eventId,
        label: "New lump sum withdrawal",
        accountId: account.accountId,
        withdrawalDate: null,
        amountMode: "fixed-amount",
        fixedAmount: 0,
        targetAssetId: cashAsset?.assetId ?? null,
        enabled: true,
      });
    });
    setActivePensionWithdrawalModalId(eventId);
  }

  function deletePensionWithdrawalEvent(eventId: string) {
    updateActiveScenario((draft) => {
      draft.pensionWithdrawalEvents = (draft.pensionWithdrawalEvents ?? []).filter((event) => event.eventId !== eventId);
    });
    setActivePensionWithdrawalModalId((currentId) => currentId === eventId ? null : currentId);
  }

  function updateSuperContributionStrategy(
    strategyId: string,
    applyUpdate: (strategy: NonNullable<ProjectionScenario["superContributionStrategies"]>[number]) => void,
  ) {
    updateActiveScenario((draft) => {
      draft.superContributionStrategies = draft.superContributionStrategies ?? [];
      const strategy = draft.superContributionStrategies.find((entry) => entry.strategyId === strategyId);
      if (strategy) {
        applyUpdate(strategy);
      }
    });
  }

  function addSuperContributionStrategy(targetAccountId?: string) {
    const strategyId = createScenarioInputId("super-strategy");

    updateActiveScenario((draft) => {
      const targetAccount =
        draft.retirementAccounts.find((account) => account.accountId === targetAccountId && account.accountType === "super-accumulation") ??
        draft.retirementAccounts.find((account) => account.accountType === "super-accumulation");
      if (!targetAccount) {
        return;
      }

      draft.superContributionStrategies = draft.superContributionStrategies ?? [];
      draft.superContributionStrategies.push({
        strategyId,
        ownerPersonId: targetAccount.ownerPersonId,
        targetAccountId: targetAccount.accountId,
        label: "New contribution strategy",
        annualAmount: 0,
        contributionType: "concessional",
        startDate: null,
        endDate: null,
        indexedToCpi: false,
        enabled: true,
      });
    });
    setActiveSuperStrategyModalId(strategyId);
  }

  function deleteSuperContributionStrategy(strategyId: string) {
    updateActiveScenario((draft) => {
      draft.superContributionStrategies = (draft.superContributionStrategies ?? []).filter(
        (strategy) => strategy.strategyId !== strategyId,
      );
    });
    setActiveSuperStrategyModalId((currentId) => currentId === strategyId ? null : currentId);
  }

  function updateSuperRolloverEvent(
    eventId: string,
    applyUpdate: (event: NonNullable<ProjectionScenario["superRolloverEvents"]>[number]) => void,
  ) {
    updateActiveScenario((draft) => {
      draft.superRolloverEvents = draft.superRolloverEvents ?? [];
      const rolloverEvent = draft.superRolloverEvents.find((entry) => entry.eventId === eventId);
      if (rolloverEvent) {
        applyUpdate(rolloverEvent);
      }
    });
  }

  function addSuperRolloverEvent(sourceAccountId?: string) {
    const eventId = createScenarioInputId("super-rollover");

    updateActiveScenario((draft) => {
      const sourceAccount =
        draft.retirementAccounts.find((account) => account.accountId === sourceAccountId && account.accountType === "super-accumulation") ??
        draft.retirementAccounts.find((account) => account.accountType === "super-accumulation");
      if (!sourceAccount) {
        return;
      }

      draft.superRolloverEvents = draft.superRolloverEvents ?? [];
      draft.superRolloverEvents.push({
        eventId,
        label: "New rollover strategy",
        sourceAccountId: sourceAccount.accountId,
        destinationAccountId: null,
        destinationPensionName: `${sourceAccount.productName} pension`,
        rolloverDate: null,
        amountMode: "full-balance",
        fixedAmount: 0,
        annualDrawdown: 0,
        drawdownIndexedToCpi: false,
        enabled: true,
      });
    });
    setActiveSuperRolloverModalId(eventId);
  }

  function deleteSuperRolloverEvent(eventId: string) {
    updateActiveScenario((draft) => {
      draft.superRolloverEvents = (draft.superRolloverEvents ?? []).filter((event) => event.eventId !== eventId);
    });
    setActiveSuperRolloverModalId((currentId) => currentId === eventId ? null : currentId);
  }

  async function handleRunScenario() {
    if (pendingClientProfileScenario && !scenarioFile) {
      const scenarioId = scenarioVersionId("client-profile");
      const importedScenario = normalizeProjectionScenario({
        ...pendingClientProfileScenario,
        scenarioId,
        scenarioName: scenarios.length ? pendingClientProfileScenario.scenarioName : "Current Situation",
      });

      setScenarios((currentScenarios) => [...currentScenarios, importedScenario]);
      setActiveScenarioId(scenarioId);
      setActiveSection("scenario-inputs");
      setActiveScenarioInputTab("scenario-details");
      setMappingResult({
        source: "fallback",
        mappingNotes: ["Imported structured client fact find data from the app into the projection model."],
      });
      setMappingStatus("mapped");
      setClientImportStatus("idle");
      setClientImportMessage(null);
      setPendingClientProfileScenario(null);
      return;
    }

    if (!scenarioFile) {
      setMappingResult({ error: "Upload or import a fact find before running the projection model." });
      setMappingStatus("error");
      return;
    }

    setMappingStatus("mapping");
    setMappingResult(null);

    const formData = new FormData();
    formData.append("file", scenarioFile);

    try {
      const response = await fetch("/api/projections/scenario-map", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json().catch(() => null)) as ScenarioMapResponse | null;

      if (!response.ok || !body?.scenario) {
        throw new Error(body?.error ?? "Finley could not map this fact find into a projection scenario.");
      }

      const scenarioId = scenarioVersionId("uploaded");
      const uploadedScenario = normalizeProjectionScenario({
        ...body.scenario,
        scenarioId,
        scenarioName: scenarios.length ? body.scenario.scenarioName : "Current Situation",
      });
      setScenarios((currentScenarios) => [...currentScenarios, uploadedScenario]);
      setActiveScenarioId(scenarioId);
      setMappingResult(body);
      setMappingStatus("mapped");
      setPendingClientProfileScenario(null);
    } catch (error) {
      setMappingResult({ error: error instanceof Error ? error.message : "Finley could not map this fact find." });
      setMappingStatus("error");
    }
  }

  async function handleImportClientProfileScenario() {
    if (!linkedClientId) {
      setClientImportStatus("error");
      setClientImportMessage("Open projections from an SOA or client record before importing the app fact find.");
      return;
    }

    setClientImportStatus("importing");
    setClientImportMessage(null);

    try {
      const response = await fetch(`/api/finley/soa/client-profile?clientId=${encodeURIComponent(linkedClientId)}`, {
        method: "GET",
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as { profile?: ClientProfile; error?: string } | null;

      if (!response.ok || !body?.profile) {
        throw new Error(body?.error ?? "Finley could not load the app fact find for this client.");
      }

      const importedScenario = mapClientProfileToProjectionScenario(body.profile);
      importedScenario.scenarioName = scenarios.length ? `${personName(body.profile.client, "Client")} current situation` : "Current Situation";

      setPendingClientProfileScenario(importedScenario);
      setScenarioFile(null);
      setScenarioUploadName(null);
      setClientImportStatus("imported");
      setClientImportMessage("App fact find loaded. Run the projection model to create the scenario.");
      setMappingResult(null);
      setMappingStatus("idle");
    } catch (error) {
      setClientImportStatus("error");
      setClientImportMessage(error instanceof Error ? error.message : "Finley could not import the app fact find.");
    }
  }

  function duplicateActiveScenario() {
    if (!mappedScenario) {
      return;
    }

    const scenarioId = scenarioVersionId("recommended");
    const copiedScenario = structuredClone(mappedScenario) as ProjectionScenario;
    copiedScenario.scenarioId = scenarioId;
    copiedScenario.scenarioName = /current situation/i.test(mappedScenario.scenarioName)
      ? "Recommended Scenario"
      : `${mappedScenario.scenarioName} - copy`;

    setScenarios((currentScenarios) => [...currentScenarios, copiedScenario]);
    setActiveScenarioId(scenarioId);
    setActiveSection("scenario-inputs");
    setActiveScenarioInputTab("scenario-details");
  }

  function deleteActiveScenario() {
    if (!mappedScenario) {
      return;
    }

    setScenarios((currentScenarios) => {
      const scenarioIndex = currentScenarios.findIndex((scenario) => scenario.scenarioId === mappedScenario.scenarioId);
      const nextScenarios = currentScenarios.filter((scenario) => scenario.scenarioId !== mappedScenario.scenarioId);
      const nextScenario = nextScenarios[Math.max(0, scenarioIndex - 1)] ?? nextScenarios[0] ?? null;

      setActiveScenarioId(nextScenario?.scenarioId ?? null);
      return nextScenarios;
    });
    setActiveSection("scenario-inputs");
    setActiveScenarioInputTab("scenario-details");
  }

  function projectionTableWorksheetRows(title: string, rows: ProjectionTableRow[]) {
    return [
      [title],
      [],
      ["Date", ...projectionRows.map((row) => `1 Jul ${String(row.year).slice(-2)}`)],
      ...rows.map((row) => (row.isSection ? [row.label] : [row.label, ...row.values])),
    ];
  }

  function groupedProjectionTableWorksheetRows(title: string, groups: ProjectionTableGroup[]) {
    const worksheetRows: WorkbookCell[][] = [[title], []];
    const header = ["Date", ...projectionRows.map((row) => `1 Jul ${String(row.year).slice(-2)}`)];

    if (!groups.length) {
      return [...worksheetRows, ["No accounts mapped for this person."]];
    }

    groups.forEach((group, index) => {
      if (index > 0) {
        worksheetRows.push([]);
      }
      worksheetRows.push([group.title]);
      worksheetRows.push([group.subtitle]);
      worksheetRows.push(header);
      group.rows.forEach((row) => {
        worksheetRows.push(row.isSection ? [row.label] : [row.label, ...row.values]);
      });
    });

    return worksheetRows;
  }

  function chartWorksheetRows(series: ProjectionChartSeries[], lineValues: number[], lineLabel: string) {
    return [
      ["Date", ...series.map((item) => item.label), lineLabel],
      ...projectionRows.map((row, index) => [
        `1 Jul ${String(row.year).slice(-2)}`,
        ...series.map((item) => item.values[index] ?? 0),
        lineValues[index] ?? 0,
      ]),
    ];
  }

  function personExportLabel(person: ProjectionScenario["people"][number]) {
    return `${person.role === "partner" ? "Partner" : "Client"} - ${person.name}`;
  }

  async function handleExportProjectionWorkbook() {
    if (!mappedScenario) {
      return;
    }

    const exportPeople = activeScenario.people.filter((person) => person.role === "client" || person.role === "partner");
    const peopleForExport = exportPeople.length ? exportPeople : activeScenario.people;
    const scenarioFileName = activeScenario.scenarioName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "projection";
    const sheets: WorkbookSheet[] = [
      {
        name: "Summary",
        rows: [
          ["Scenario", activeScenario.scenarioName],
          ["Client", activeClientName],
          ["Start date", `1 ${monthNames[activeScenario.startMonth - 1] ?? "Jul"} ${projectionStartYear}`],
          ["Projected to age", endAge],
          ["Exported", new Date().toLocaleString("en-AU")],
        ],
      },
      {
        name: "Personal Cashflow",
        rows: projectionTableWorksheetRows("Personal cash flow", cashflowProjectionRows),
      },
      {
        name: "Cashflow Graph",
        rows: chartWorksheetRows(cashflowChartSeries, cashflowExpenseValues, "Total expenses including tax"),
        chart: {
          title: "Personal cash flow",
          barSeriesCount: cashflowChartSeries.length,
          lineColumnIndex: cashflowChartSeries.length + 2,
        },
      },
      {
        name: "Assets Liabilities",
        rows: projectionTableWorksheetRows("Assets and liabilities", balanceSheetProjectionRows),
      },
      {
        name: "Assets Graph",
        rows: chartWorksheetRows(assetLiabilityChartSeries, assetLiabilityLineValues, "Total liabilities"),
        chart: {
          title: "Assets and liabilities",
          barSeriesCount: assetLiabilityChartSeries.length,
          lineColumnIndex: assetLiabilityChartSeries.length + 2,
        },
      },
      {
        name: "Assumptions",
        rows: [
          ["Layer", "Source", "Use"],
          ...assumptions.map((assumption) => [assumption.layer, assumption.source, assumption.use]),
          [],
          ["Projection checks"],
          ...projectionChecks.map((check) => [check]),
        ],
      },
    ];

    peopleForExport.forEach((person) => {
      const personLabel = personExportLabel(person);
      sheets.push({
        name: `Tax ${personLabel}`,
        rows: projectionTableWorksheetRows(`Taxation - ${personLabel}`, taxProjectionRowsByPersonId[person.personId] ?? taxProjectionRows),
      });
      sheets.push({
        name: `Centrelink ${personLabel}`,
        rows: projectionTableWorksheetRows(
          `Centrelink - ${personLabel}`,
          agePensionProjectionRowsByPersonId[person.personId] ?? agePensionProjectionRows,
        ),
      });
      sheets.push({
        name: `Super ${personLabel}`,
        rows: groupedProjectionTableWorksheetRows(
          `Superannuation - ${personLabel}`,
          superProjectionGroups.filter((group) => group.ownerPersonId === person.personId),
        ),
      });
      sheets.push({
        name: `Pensions ${personLabel}`,
        rows: groupedProjectionTableWorksheetRows(
          `Pensions - ${personLabel}`,
          pensionProjectionGroups.filter((group) => group.ownerPersonId === person.personId),
        ),
      });
    });

    await downloadWorkbook(`${scenarioFileName}-projection-export.xlsx`, sheets);
  }

  function createFinancialProjectionForScenario(scenario: ProjectionScenario): FinancialProjectionV1 {
    const scenarioViewModel =
      scenario.scenarioId === activeScenario.scenarioId ? viewModel : buildProjectionViewModel(scenario, activeAssumptions);
    const {
      activeScenario: outputScenario,
      money: outputMoney,
      projectionRows: outputProjectionRows,
      primaryPersonId: outputPrimaryPersonId,
      endAge: outputEndAge,
      startingNetWorth: outputStartingNetWorth,
      finalProjectionYear: outputFinalProjectionYear,
      cashflowProjectionRows: outputCashflowProjectionRows,
      assetLiabilityChartSeries: outputAssetLiabilityChartSeries,
      assetLiabilityLineValues: outputAssetLiabilityLineValues,
      assetLiabilityChartMaxValue: outputAssetLiabilityChartMaxValue,
      assetLiabilityChartAxisStep: outputAssetLiabilityChartAxisStep,
      superProjectionGroups: outputSuperProjectionGroups,
      pensionProjectionGroups: outputPensionProjectionGroups,
      balanceSheetProjectionRows: outputBalanceSheetProjectionRows,
    } = scenarioViewModel;
    const outputPrimaryPerson = outputScenario.people.find((person) => person.personId === outputScenario.primaryPersonId);
    const outputClientName = outputPrimaryPerson?.name ?? outputScenario.scenarioName;
    const projectionType = /recommended/i.test(outputScenario.scenarioName)
      ? ("recommended-position" as const)
      : ("current-position" as const);
    const firstProjectionYear = outputProjectionRows[0];
    const cashflowTableColumnCount = Math.min(5, outputProjectionRows.length);
    const projectionColumns = outputProjectionRows.map((row) => `1 Jul ${String(row.year).slice(-2)}`);
    const currentValueKey = projectionType === "recommended-position" ? "recommendedValue" : "currentValue";
    const percentForSoa = (value: number | null | undefined) =>
      value === null || value === undefined || Number.isNaN(value) ? "-" : `${Math.round(value * 10000) / 100}%`;
    const metric = (metricId: string, name: string, value: number | null, unit: "currency" | "percent" | "years" | "other" = "currency") => ({
      metricId,
      name,
      currentValue: currentValueKey === "currentValue" ? value : null,
      recommendedValue: currentValueKey === "recommendedValue" ? value : null,
      differenceValue: null,
      unit,
      notes: null,
    });
    const tableRowsForSoa = (rows: ProjectionTableRow[]) =>
      rows.map((row) => ({
        label: row.label,
        values: row.values,
        isSection: row.isSection ?? false,
        isTotal: row.isTotal ?? false,
      }));
    const groupedTablesForSoa = (tablePrefix: string, groups: ProjectionTableGroup[]) =>
      groups.map((group) => ({
        tableId: `${tablePrefix.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${group.groupId}`,
        title: `${tablePrefix} - ${group.title} (${group.ownerName})`,
        columns: projectionColumns,
        rows: [
          { label: group.subtitle, values: [], isSection: true },
          ...tableRowsForSoa(group.rows),
        ],
      }));

    return {
      projectionId: `projection-${outputScenario.scenarioId}`,
      name: outputScenario.scenarioName || "Projection scenario",
      projectionType,
      purpose: `Projection output selected from the projections workspace for ${outputClientName}.`,
      timeframe: {
        startDate: `${outputScenario.startYear}-${String(outputScenario.startMonth).padStart(2, "0")}-01`,
        projectionYears: outputProjectionRows.length,
        retirementAge: outputPrimaryPerson?.retirementAge ?? null,
        endAge: outputEndAge,
      },
      assumptions: {
        inflationPct: activeAssumptions.economic.cpiRate * 100,
        earningsRatePct: null,
        salaryGrowthPct: activeAssumptions.economic.cpiRate * 100,
        contributionGrowthPct: activeAssumptions.economic.cpiRate * 100,
        drawdownRatePct: null,
        taxAssumptions: "Individual tax calculated from legislative resident tax rates and Medicare levy assumptions.",
        legislativeAssumptions: `Legislative assumption set effective ${activeAssumptions.legislative.effectiveDate}.`,
        notes: "Projection tables are calculated by the projections engine and selected for SOA use by the adviser.",
      },
      inputsSummary: `${outputScenario.people.length} person(s), ${outputScenario.assets.length} asset(s), ${outputScenario.liabilities.length} liabilit${outputScenario.liabilities.length === 1 ? "y" : "ies"}, and ${outputScenario.retirementAccounts.length} retirement account(s) were modelled.`,
      outputs: {
        currentPositionSummary:
          projectionType === "current-position" && outputFinalProjectionYear
            ? `Projected net worth at age ${outputEndAge} is ${outputMoney(outputFinalProjectionYear.netWorth)}.`
            : null,
        recommendedPositionSummary:
          projectionType === "recommended-position" && outputFinalProjectionYear
            ? `Projected net worth at age ${outputEndAge} is ${outputMoney(outputFinalProjectionYear.netWorth)}.`
            : null,
        betterPositionSummary: outputFinalProjectionYear
          ? `Final projected cash reserve is ${outputMoney(outputFinalProjectionYear.cashReserve)} and final net cashflow is ${outputMoney(outputFinalProjectionYear.netCashflowAfterTax)}.`
          : null,
        keyMetrics: [
          metric("opening-net-worth", "Opening net worth", outputStartingNetWorth),
          metric("projected-net-worth", `Projected net worth at age ${outputEndAge}`, outputFinalProjectionYear?.netWorth ?? null),
          metric("final-net-cashflow", "Final annual net cashflow after tax", outputFinalProjectionYear?.netCashflowAfterTax ?? null),
          metric("final-cash-reserve", "Final cash reserve", outputFinalProjectionYear?.cashReserve ?? null),
          metric("first-year-tax", "First year tax payable", firstProjectionYear?.tax.taxPayable ?? null),
        ],
        yearlySeries: outputProjectionRows.map((row, index) => ({
          yearIndex: index,
          age: row.ageByPersonId[outputPrimaryPersonId] ?? null,
          calendarYear: row.year,
          currentValue: currentValueKey === "currentValue" ? row.netWorth : null,
          recommendedValue: currentValueKey === "recommendedValue" ? row.netWorth : null,
          differenceValue: null,
        })),
        cashflowTable: {
          tableId: "personal-cashflow",
          title: "Personal cash flow",
          columns: outputProjectionRows.slice(0, cashflowTableColumnCount).map((row) => `1 Jul ${String(row.year).slice(-2)}`),
          rows: outputCashflowProjectionRows.map((row) => ({
            label: row.label,
            values: row.values.slice(0, cashflowTableColumnCount),
            isSection: "isSection" in row ? row.isSection ?? false : false,
            isTotal: "isTotal" in row ? row.isTotal ?? false : false,
          })),
        },
        assetLiabilityTable: {
          tableId: "asset-liability-projections",
          title: "Asset and liability projections",
          columns: projectionColumns,
          rows: tableRowsForSoa(outputBalanceSheetProjectionRows),
        },
        assetLiabilityChart: {
          chartId: "asset-liability-chart",
          title: "Asset and liability chart",
          columns: projectionColumns,
          series: outputAssetLiabilityChartSeries.map((series) => ({
            label: series.label,
            values: series.values,
            color: series.color,
          })),
          lineLabel: "Total liabilities",
          lineValues: outputAssetLiabilityLineValues,
          axisMax: outputAssetLiabilityChartMaxValue,
          axisStep: outputAssetLiabilityChartAxisStep,
        },
        superTables: groupedTablesForSoa("Superannuation", outputSuperProjectionGroups),
        pensionTables: groupedTablesForSoa("Pension", outputPensionProjectionGroups),
        assumptionTables: [
          {
            tableId: "core-modelling-assumptions",
            title: "Core modelling assumptions",
            columns: ["Value"],
            rows: [
              { label: "CPI indexation (% p.a.)", values: [percentForSoa(activeAssumptions.economic.cpiRate)] },
              { label: "Employer SG (%)", values: [percentForSoa(activeAssumptions.legislative.superannuation.superGuaranteeRate)] },
              { label: "Concessional cap", values: [money(activeAssumptions.legislative.superannuation.concessionalContributionsCap)] },
              { label: "Contributions tax (%)", values: [percentForSoa(activeAssumptions.legislative.superannuation.contributionsTaxRate)] },
              { label: "Super earnings tax (%)", values: [percentForSoa(activeAssumptions.legislative.superannuation.investmentEarningsTaxRate)] },
            ],
          },
          {
            tableId: "risk-profile-return-assumptions",
            title: "Risk profile return assumptions",
            columns: ["Income return", "Growth return", "Total return", "Volatility", "Defensive assets", "Growth assets"],
            rows: activeRiskProfileNames.map((profileName) => {
              const profile = activeAssumptions.investmentProfiles.profiles[profileName];
              const incomeRate = profile?.incomeRate ?? 0;
              const growthRate = profile?.growthRate ?? 0;

              return {
                label: profileName,
                values: [
                  percentForSoa(incomeRate),
                  percentForSoa(growthRate),
                  percentForSoa(incomeRate + growthRate),
                  percentForSoa(profile?.standardDeviation),
                  percentForSoa(profile?.defensivePct),
                  percentForSoa(profile?.growthPct),
                ],
              };
            }),
          },
        ],
      },
      linkedRecommendationIds: [],
      rationale: "Selected projection package from the standalone projections module.",
    };
  }

  function createProjectionPackageForScenario(scenario: ProjectionScenario) {
    return {
      packageId: makeId("projection-package"),
      clientId: linkedClientId,
      soaId: linkedSoaId,
      projectionCaseId: `projection-case-${linkedSoaId}`,
      selectedScenarioId: scenario.scenarioId,
      selectedScenarioName: scenario.scenarioName,
      financialProjection: createFinancialProjectionForScenario(scenario),
      createdAt: new Date().toISOString(),
      status: "selected-for-soa" as const,
    };
  }

  function getSurplusAllocationSelectValue() {
    const target = activeScenario.cashflowAllocation?.surplusTarget;

    if (target?.targetType === "cash-asset") {
      return `cash-asset:${target.targetId}`;
    }

    if (target?.targetType === "liability") {
      return `liability:${target.targetId}`;
    }

    const defaultCashAssetId = activeScenario.assets.find((asset) => isCashAssetType(asset.type))?.assetId;
    return defaultCashAssetId ? `cash-asset:${defaultCashAssetId}` : "";
  }

  function updateSurplusAllocationTarget(value: string) {
    const [targetType, targetId] = value.split(":");

    updateActiveScenario((draft) => {
      draft.cashflowAllocation = {
        ...(draft.cashflowAllocation ?? {}),
        surplusTarget:
          (targetType === "cash-asset" || targetType === "liability") && targetId
            ? { targetType, targetId }
            : null,
      };
    });
  }

  function renderSurplusAllocationControl() {
    const cashAssets = activeScenario.assets.filter((asset) => isCashAssetType(asset.type));
    const liabilities = activeScenario.liabilities;
    const hasOptions = cashAssets.length > 0 || liabilities.length > 0;

    return (
      <label className={styles.allocationControl}>
        <span>Surplus to</span>
        <select
          value={getSurplusAllocationSelectValue()}
          disabled={!hasOptions}
          onChange={(event) => updateSurplusAllocationTarget(event.target.value)}
        >
          {cashAssets.map((asset) => (
            <option key={asset.assetId} value={`cash-asset:${asset.assetId}`}>
              {asset.name}
            </option>
          ))}
          {liabilities.map((liability) => (
            <option key={liability.liabilityId} value={`liability:${liability.liabilityId}`}>
              {liability.name}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function renderProjectionTable(rows: ProjectionTableRow[], highlightNetCashflow = false) {
    if (rows.length <= 1) {
      return <p className={styles.emptyState}>No projection rows have been mapped for this section yet.</p>;
    }

    return (
      <div className={styles.tableWrap}>
        <table className={`${styles.dataTable} ${styles.projectionTable}`.trim()}>
          <thead>
            <tr>
              <th className={styles.stickyLabelCell}>Date</th>
              {projectionRows.map((row) => (
                <th key={row.year}>1 Jul {String(row.year).slice(-2)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) =>
              row.isSection ? (
                <tr key={row.label} className={styles.projectionSectionRow}>
                  <td colSpan={projectionRows.length + 1}>{row.label}</td>
                </tr>
              ) : (
                <tr key={row.label} className={row.isTotal ? styles.totalProjectionRow : undefined}>
                  <td className={styles.stickyLabelCell}>
                    {row.control === "surplus-allocation" ? renderSurplusAllocationControl() : row.label}
                  </td>
                  {row.values.map((value, index) => {
                    const projectionRow = projectionRows[index];
                    const isNegativeCashflow =
                      highlightNetCashflow && row.label === "Net cashflow after tax" && projectionRow.netCashflowAfterTax < 0;
                    const isPositiveCashflow =
                      highlightNetCashflow && row.label === "Net cashflow after tax" && projectionRow.netCashflowAfterTax >= 0;
                    const isCashReserveWarning = row.label === "Cash reserve" && projectionRow.cashReserve < cashReserveTarget;

                    return (
                      <td
                        key={`${row.label}-${projectionRow.year}`}
                        className={[
                          styles.numberCell,
                          isNegativeCashflow ? styles.negativeCell : "",
                          isPositiveCashflow ? styles.positiveCell : "",
                          isCashReserveWarning ? styles.warningText : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    );
  }

  function renderStackedBarLineChart({
    series,
    lineValues,
    lineLabel,
    maxValue,
    axisStep,
    emptyMessage,
    barTotalValues,
    barTotalLabel,
  }: {
    series: ProjectionChartSeries[];
    lineValues: number[];
    lineLabel: string;
    maxValue: number;
    axisStep: number;
    emptyMessage: string;
    barTotalValues: number[];
    barTotalLabel: string;
  }) {
    if (!projectionRows.length || !series.length) {
      return <p className={styles.emptyState}>{emptyMessage}</p>;
    }

    const linePoints = projectionRows
      .map((row, index) => {
        const x = ((index + 0.5) / projectionRows.length) * 100;
        const y = 100 - Math.min(100, Math.max(0, ((lineValues[index] ?? 0) / maxValue) * 100));
        return `${x},${y}`;
      })
      .join(" ");
    const axisTicks = Array.from(
      { length: Math.floor(maxValue / axisStep) + 1 },
      (_, index) => maxValue - index * axisStep,
    );

    return (
      <div className={styles.cashflowChartShell}>
        <div className={styles.cashflowChartLegend}>
          {series.map((item) => (
            <span key={item.label}>
              <i style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
          <span>
            <i className={styles.expenseLegendLine} />
            {lineLabel}
          </span>
        </div>
        <div className={styles.cashflowChartScroller}>
          <div className={styles.cashflowChart}>
            <div className={styles.cashflowChartScale}>
              <div className={styles.cashflowChartScaleInner}>
                {axisTicks.map((tick) => (
                  <span key={tick} style={{ bottom: `${(tick / maxValue) * 100}%` }}>
                    {money(tick)}
                  </span>
                ))}
              </div>
            </div>
            <div className={styles.cashflowChartPlot}>
              <div className={styles.cashflowChartGrid} aria-hidden="true">
                {axisTicks.map((tick) => (
                  <span key={tick} style={{ bottom: `${(tick / maxValue) * 100}%` }} />
                ))}
              </div>
              <svg className={styles.cashflowExpenseLine} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <polyline points={linePoints} />
              </svg>
              <div
                className={styles.cashflowChartColumns}
                style={{ gridTemplateColumns: `repeat(${projectionRows.length}, minmax(3.6rem, 1fr))` }}
              >
                {projectionRows.map((row, yearIndex) => (
                  <div className={styles.cashflowChartColumn} key={row.year}>
                    <div
                      className={styles.cashflowChartBar}
                      title={`1 Jul ${String(row.year).slice(-2)} ${barTotalLabel} ${money(
                        barTotalValues[yearIndex] ?? 0,
                      )}; ${lineLabel} ${money(lineValues[yearIndex] ?? 0)}`}
                    >
                      {series.map((item) => {
                        const value = Math.max(0, item.values[yearIndex] ?? 0);
                        const height = maxValue ? (value / maxValue) * 100 : 0;

                        return (
                          <span
                            key={`${item.label}-${row.year}`}
                            className={styles.cashflowChartSegment}
                            style={{
                              backgroundColor: item.color,
                              height: `${height}%`,
                            }}
                            title={`${item.label}: ${money(value)}`}
                          />
                        );
                      })}
                    </div>
                    <span className={styles.cashflowChartYear}>1 Jul {String(row.year).slice(-2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderCashflowChart() {
    return renderStackedBarLineChart({
      series: cashflowChartSeries,
      lineValues: cashflowExpenseValues,
      lineLabel: "Total expenses including tax",
      maxValue: cashflowChartMaxValue,
      axisStep: cashflowChartAxisStep,
      emptyMessage: "No cashflow income rows have been mapped for this chart yet.",
      barTotalValues: projectionRows.map((row) => row.totalIncome),
      barTotalLabel: "income",
    });
  }

  function renderAssetLiabilityChart() {
    return renderStackedBarLineChart({
      series: assetLiabilityChartSeries,
      lineValues: assetLiabilityLineValues,
      lineLabel: "Total liabilities",
      maxValue: assetLiabilityChartMaxValue,
      axisStep: assetLiabilityChartAxisStep,
      emptyMessage: "No asset rows have been mapped for this chart yet.",
      barTotalValues: projectionRows.map((row) => row.totalAssets),
      barTotalLabel: "assets",
    });
  }

  function renderGroupedProjectionTable(groups: ProjectionTableGroup[]) {
    if (!groups.length) {
      return <p className={styles.emptyState}>No superannuation accounts match this view.</p>;
    }

    return (
      <div className={styles.tableWrap}>
        <table className={`${styles.dataTable} ${styles.projectionTable}`.trim()}>
          <thead>
            <tr>
              <th className={styles.stickyLabelCell}>Date</th>
              {projectionRows.map((row) => (
                <th key={row.year}>1 Jul {String(row.year).slice(-2)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.flatMap((group) => [
              <tr key={`${group.groupId}-heading`} className={styles.projectionGroupRow}>
                <td colSpan={projectionRows.length + 1}>
                  <strong>{group.title}</strong>
                  <span>{group.subtitle}</span>
                </td>
              </tr>,
              ...group.rows.map((row) =>
                row.isSection ? (
                  <tr key={`${group.groupId}-${row.label}`} className={styles.projectionSectionRow}>
                    <td colSpan={projectionRows.length + 1}>{row.label}</td>
                  </tr>
                ) : (
                  <tr key={`${group.groupId}-${row.label}`} className={row.isTotal ? styles.totalProjectionRow : undefined}>
                    <td className={styles.stickyLabelCell}>
                      {row.control === "surplus-allocation" ? renderSurplusAllocationControl() : row.label}
                    </td>
                    {row.values.map((value, index) => (
                      <td key={`${group.groupId}-${row.label}-${projectionRows[index].year}`} className={styles.numberCell}>
                        {value}
                      </td>
                    ))}
                  </tr>
                ),
              ),
            ])}
          </tbody>
        </table>
      </div>
    );
  }

  function renderScenarioAssumptionInputs() {
    return (
      <div className={styles.inputStack}>
        <div className={styles.inputCard}>
          <h4>Core modelling assumptions</h4>
          <div className={styles.inputGrid}>
            <label>
              CPI indexation (% p.a.)
              {renderPercentInput({
                value: activeAssumptions.economic.cpiRate,
                onChange: (value) => setScenarioAssumptionOverrides((current) => ({
                  ...current,
                  cpiRate: value,
                })),
              })}
            </label>
            <label>
              Employer SG (%)
              {renderPercentInput({
                value: activeAssumptions.legislative.superannuation.superGuaranteeRate,
                onChange: (value) => setScenarioAssumptionOverrides((current) => ({
                  ...current,
                  superGuaranteeRate: value,
                })),
              })}
            </label>
            <label>
              Concessional cap
              {renderCurrencyInput({
                value: activeAssumptions.legislative.superannuation.concessionalContributionsCap,
                onChange: (value) => setScenarioAssumptionOverrides((current) => ({
                  ...current,
                  concessionalContributionsCap: value,
                })),
              })}
            </label>
            <label>
              Contributions tax (%)
              {renderPercentInput({
                value: activeAssumptions.legislative.superannuation.contributionsTaxRate,
                onChange: (value) => setScenarioAssumptionOverrides((current) => ({
                  ...current,
                  contributionsTaxRate: value,
                })),
              })}
            </label>
            <label>
              Super earnings tax (%)
              {renderPercentInput({
                value: activeAssumptions.legislative.superannuation.investmentEarningsTaxRate,
                onChange: (value) => setScenarioAssumptionOverrides((current) => ({
                  ...current,
                  investmentEarningsTaxRate: value,
                })),
              })}
            </label>
          </div>
        </div>

        <div className={styles.inputCard}>
          <h4>Risk profile return assumptions</h4>
          {licenseeRiskProfileSource ? (
            <p className={styles.inputHint}>
              Using risk profiles configured for {licenseeRiskProfileSource}.
            </p>
          ) : (
            <p className={styles.inputHint}>
              Using the default projection risk profiles because no active licensee profiles are available for this client.
            </p>
          )}
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Risk profile</th>
                  <th>Income return</th>
                  <th>Growth return</th>
                  <th>Total return</th>
                  <th>Volatility</th>
                  <th>Defensive assets</th>
                  <th>Growth assets</th>
                </tr>
              </thead>
              <tbody>
                {activeRiskProfileNames.map((profileName) => {
                  const profile = scenarioAssumptionOverrides.riskProfiles[profileName];
                  const incomeRate = profile?.incomeRate ?? 0;
                  const growthRate = profile?.growthRate ?? 0;

                  return (
                    <tr key={profileName}>
                      <td>{profileName}</td>
                      <td>
                        {renderPercentInput({
                          value: incomeRate,
                          onChange: (value) => updateRiskProfileAssumption(profileName, (draft) => {
                            draft.incomeRate = value;
                          }),
                        })}
                      </td>
                      <td>
                        {renderPercentInput({
                          value: growthRate,
                          onChange: (value) => updateRiskProfileAssumption(profileName, (draft) => {
                            draft.growthRate = value;
                          }),
                        })}
                      </td>
                      <td>{percentInputValue(incomeRate + growthRate)}%</td>
                      <td>
                        {renderPercentInput({
                          value: profile?.standardDeviation ?? 0,
                          onChange: (value) => updateRiskProfileAssumption(profileName, (draft) => {
                            draft.standardDeviation = value;
                          }),
                        })}
                      </td>
                      <td>
                        {renderPercentInput({
                          value: profile?.defensivePct ?? 0,
                          onChange: (value) => updateRiskProfileAssumption(profileName, (draft) => {
                            draft.defensivePct = value;
                            draft.growthPct = Math.max(0, 1 - value);
                          }),
                        })}
                      </td>
                      <td>{percentInputValue(profile?.growthPct ?? 0)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className={styles.inputCard}>
          <h4>Strategic asset allocations</h4>
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Risk profile</th>
                  <th>Asset class</th>
                  <th>Category</th>
                  <th>Target</th>
                  <th>Minimum</th>
                  <th>Maximum</th>
                </tr>
              </thead>
              <tbody>
                {activeRiskProfileNames.flatMap((profileName) => {
                  const allocations = scenarioAssumptionOverrides.riskProfiles[profileName]?.strategicAllocations ?? [];

                  return allocations.map((allocation) => (
                    <tr key={`${profileName}-${allocation.assetClassId || allocation.assetClassName}`}>
                      <td>{profileName}</td>
                      <td>{allocation.assetClassName}</td>
                      <td>{allocation.category}</td>
                      <td>{percentInputValue(allocation.targetPct)}%</td>
                      <td>{allocation.minimumPct == null ? "-" : `${percentInputValue(allocation.minimumPct)}%`}</td>
                      <td>{allocation.maximumPct == null ? "-" : `${percentInputValue(allocation.maximumPct)}%`}</td>
                    </tr>
                  ));
                })}
                {activeRiskProfileNames.every(
                  (profileName) => !(scenarioAssumptionOverrides.riskProfiles[profileName]?.strategicAllocations ?? []).length,
                ) ? (
                  <tr>
                    <td colSpan={6}>No strategic asset allocations configured for this licensee.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  function renderScenarioInputContent() {
    if (activeScenarioInputTab === "scenario-details") {
      return (
        <div className={styles.inputStack}>
          <div className={styles.inputCard}>
            <h4>Scenario setup</h4>
            <div className={styles.inputGrid}>
              <label>
                Scenario name
                <input
                  value={activeScenario.scenarioName}
                  onChange={(event) => updateActiveScenario((draft) => {
                    draft.scenarioName = event.target.value;
                  })}
                />
              </label>
              <label>
                Start month
                <select
                  value={activeScenario.startMonth}
                  onChange={(event) => updateActiveScenario((draft) => {
                    draft.startMonth = numberFromInput(event.target.value, draft.startMonth);
                  })}
                >
                  {monthNames.map((month, index) => (
                    <option key={month} value={index + 1}>
                      {month}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Start year
                <input
                  type="number"
                  value={activeScenario.startYear}
                  onChange={(event) => updateActiveScenario((draft) => {
                    draft.startYear = numberFromInput(event.target.value, draft.startYear);
                  })}
                />
              </label>
              <label>
                Primary client
                <select
                  value={activeScenario.primaryPersonId}
                  onChange={(event) => updateActiveScenario((draft) => {
                    draft.primaryPersonId = event.target.value;
                    draft.projectionEnd.personId = event.target.value;
                  })}
                >
                  {activeScenario.people.map((person) => (
                    <option key={person.personId} value={person.personId}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className={styles.inputCard}>
            <h4>People</h4>
            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Date of birth</th>
                    <th>Start age</th>
                    <th>Retirement age</th>
                    <th>Homeowner</th>
                  </tr>
                </thead>
                <tbody>
                  {activeScenario.people.map((person) => (
                    <tr key={person.personId}>
                      <td>{person.name}</td>
                      <td>{person.role}</td>
                      <td>
                        <input
                          className={styles.compactInput}
                          type="date"
                          value={person.dateOfBirth?.slice(0, 10) ?? ""}
                          onChange={(event) => updatePerson(person.personId, (draft) => {
                            draft.dateOfBirth = event.target.value || null;
                            if (event.target.value) {
                              draft.startAge = calculateStartAge(event.target.value, activeScenario.startYear, activeScenario.startMonth);
                            }
                          })}
                        />
                      </td>
                      <td>
                        <input
                          className={styles.compactInput}
                          type="number"
                          value={person.startAge}
                          onChange={(event) => updatePerson(person.personId, (draft) => {
                            draft.startAge = numberFromInput(event.target.value, draft.startAge);
                          })}
                        />
                      </td>
                      <td>
                        <input
                          className={styles.compactInput}
                          type="number"
                          value={person.retirementAge ?? ""}
                          placeholder="Not set"
                          onChange={(event) => updatePerson(person.personId, (draft) => {
                            draft.retirementAge = event.target.value ? numberFromInput(event.target.value) : null;
                          })}
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={person.isHomeowner}
                          onChange={(event) => updatePerson(person.personId, (draft) => {
                            draft.isHomeowner = event.target.checked;
                          })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={styles.inputCard}>
            <h4>Dependants</h4>
            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Relationship</th>
                    <th>Date of birth</th>
                    <th>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {(activeScenario.dependants ?? []).length ? (
                    (activeScenario.dependants ?? []).map((dependant) => (
                      <tr key={dependant.dependantId}>
                        <td>{dependant.name}</td>
                        <td>{dependant.relationship ?? "Dependant"}</td>
                        <td>
                          <input
                            className={styles.compactInput}
                            type="date"
                            value={dependant.dateOfBirth?.slice(0, 10) ?? ""}
                            onChange={(event) => updateDependant(dependant.dependantId, (draft) => {
                              draft.dateOfBirth = event.target.value || null;
                            })}
                          />
                        </td>
                        <td>
                          {activeScenario.people.find((person) => person.personId === dependant.ownerPersonId)?.name ?? "Client"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4}>No dependants recorded.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }

    if (activeScenarioInputTab === "cashflow") {
      const editableCashflowItems = activeScenario.cashflowItems.filter(
        (item) => !activeLiabilityRepaymentItemIds.has(item.itemId),
      );
      const incomeItems = editableCashflowItems.filter((item) => isCashflowIncomeCategory(item.category));
      const expenseItems = editableCashflowItems.filter((item) => isCashflowExpenseCategory(item.category));
      const renderCashflowRows = (
        items: ProjectionScenario["cashflowItems"],
        emptyMessage: string,
        mode: "income" | "expense",
      ) => (
        <tbody>
          {items.length ? (
            items.map((item) => (
              <tr key={item.itemId}>
                <td>
                  <input
                    className={styles.compactInput}
                    value={item.label}
                    onChange={(event) => updateCashflowItem(item.itemId, (draft) => {
                      draft.label = event.target.value;
                    })}
                  />
                </td>
                <td>
                  <select
                    className={styles.compactInput}
                    value={item.category}
                    onChange={(event) => updateCashflowItem(item.itemId, (draft) => {
                      const nextCategory = event.target.value as ProjectionScenario["cashflowItems"][number]["category"];
                      draft.category = nextCategory;
                      draft.taxable = isCashflowIncomeCategory(nextCategory);
                      draft.indexedToCpi = isCashflowExpenseCategory(nextCategory);
                    })}
                  >
                    {(mode === "income" ? incomeCategoryOptions : expenseCategoryOptions).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className={styles.compactInput}
                    value={item.ownerPersonId}
                    onChange={(event) => updateCashflowItem(item.itemId, (draft) => {
                      draft.ownerPersonId = event.target.value;
                    })}
                  >
                    {activeScenario.people.length > 1 ? <option value={jointOwnerId}>Joint</option> : null}
                    {activeScenario.people.map((person) => (
                      <option key={person.personId} value={person.personId}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {renderCurrencyInput({
                    value: item.annualAmount,
                    onChange: (value) => updateCashflowItem(item.itemId, (draft) => {
                      draft.annualAmount = value;
                    }),
                  })}
                </td>
                <td>
                  <input
                    type="date"
                    className={styles.compactInput}
                    value={item.startDate ?? ""}
                    onChange={(event) => updateCashflowItem(item.itemId, (draft) => {
                      draft.startDate = event.target.value || null;
                    })}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    className={styles.compactInput}
                    value={item.endDate ?? ""}
                    onChange={(event) => updateCashflowItem(item.itemId, (draft) => {
                      draft.endDate = event.target.value || null;
                    })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={item.indexedToCpi}
                    onChange={(event) => updateCashflowItem(item.itemId, (draft) => {
                      draft.indexedToCpi = event.target.checked;
                    })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={item.taxable}
                    onChange={(event) => updateCashflowItem(item.itemId, (draft) => {
                      draft.taxable = event.target.checked;
                    })}
                  />
                </td>
                <td>
                  <button type="button" className={styles.dangerButton} onClick={() => deleteCashflowItem(item.itemId)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={9}>{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      );

      return (
        <div className={styles.inputStack}>
          <div className={styles.inputCard}>
            <div className={styles.inputCardHeader}>
              <h4>Income</h4>
              <div className={styles.tableActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => addCashflowItem("other-income")}>
                  Add income
                </button>
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Category</th>
                    <th>Owner</th>
                    <th>Annual amount</th>
                    <th>Start date</th>
                    <th>End date</th>
                    <th>Indexed</th>
                    <th>Taxable</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                {renderCashflowRows(incomeItems, "No income rows recorded.", "income")}
              </table>
            </div>
          </div>

          <div className={styles.inputCard}>
            <div className={styles.inputCardHeader}>
              <h4>Expenses</h4>
              <div className={styles.tableActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => addCashflowItem("living-expense")}>
                  Add expense
                </button>
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Category</th>
                    <th>Owner</th>
                    <th>Annual amount</th>
                    <th>Start date</th>
                    <th>End date</th>
                    <th>Indexed</th>
                    <th>Taxable</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                {renderCashflowRows(expenseItems, "No expense rows recorded.", "expense")}
              </table>
            </div>
          </div>
        </div>
      );
    }

    if (activeScenarioInputTab === "assets-liabilities") {
      return (
        <div className={styles.inputStack}>
          <div className={styles.inputCard}>
            <div className={styles.inputCardHeader}>
              <h4>Assets</h4>
              <div className={styles.tableActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => addAsset("personal-asset")}>
                  Add asset
                </button>
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Owner</th>
                    <th>Type</th>
                    <th>Opening value</th>
                    <th>Income</th>
                    <th>Growth</th>
                    <th>Centrelink</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeScenario.assets.map((asset) => {
                    const assetSaleEvents = (activeScenario.assetSaleEvents ?? []).filter((event) => event.assetId === asset.assetId);

                    return (
                    <tr key={asset.assetId}>
                      <td>
                        <input
                          className={styles.compactInput}
                          value={asset.name}
                          onChange={(event) => updateAsset(asset.assetId, (draft) => {
                            draft.name = event.target.value;
                          })}
                        />
                      </td>
                      <td>
                        <select
                          className={styles.compactInput}
                          value={asset.ownerPersonId}
                          onChange={(event) => updateAsset(asset.assetId, (draft) => {
                            draft.ownerPersonId = event.target.value;
                          })}
                        >
                          {activeScenario.people.length > 1 ? <option value={jointOwnerId}>Joint</option> : null}
                          {activeScenario.people.map((person) => (
                            <option key={person.personId} value={person.personId}>
                              {person.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className={styles.compactInput}
                          value={asset.type}
                          onChange={(event) => updateAsset(asset.assetId, (draft) => {
                            const nextType = event.target.value as ProjectionScenario["assets"][number]["type"];
                            draft.type = nextType;
                            draft.cgtTreatment = defaultAssetCgtTreatment(nextType);
                          })}
                        >
                          {projectionAssetTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {renderCurrencyInput({
                          value: asset.openingValue,
                          onChange: (value) => updateAsset(asset.assetId, (draft) => {
                            draft.openingValue = value;
                          }),
                        })}
                      </td>
                      <td>
                        {renderCurrencyInput({
                          value: asset.annualIncome ?? 0,
                          onChange: (value) => updateAsset(asset.assetId, (draft) => {
                            draft.annualIncome = value;
                          }),
                        })}
                      </td>
                      <td>
                        <select
                          className={styles.compactInput}
                          value={asset.growthRateKey}
                          onChange={(event) => updateAsset(asset.assetId, (draft) => {
                            draft.growthRateKey = event.target.value as ProjectionScenario["assets"][number]["growthRateKey"];
                          })}
                        >
                          <option value="none">None</option>
                          <option value="cpi">CPI</option>
                          <option value="cash">Cash</option>
                          {activeRiskProfileNames.map((profileName) => (
                            <option key={profileName} value={profileName}>
                              {profileName}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className={styles.compactInput}
                          value={asset.centrelink}
                          onChange={(event) => updateAsset(asset.assetId, (draft) => {
                            draft.centrelink = event.target.value as ProjectionScenario["assets"][number]["centrelink"];
                          })}
                        >
                          <option value="assessable">Assessable</option>
                          <option value="exempt">Exempt</option>
                          <option value="financial-asset">Deemed</option>
                        </select>
                      </td>
                      <td>
                        <details className={styles.rowActionMenu} onToggle={handleRowActionMenuToggle}>
                          <summary aria-label={`Actions for ${asset.name}`}>...</summary>
                          <div className={styles.rowActionMenuList}>
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              onClick={() => setActiveAssetEditModalId(asset.assetId)}
                            >
                              Edit asset
                            </button>
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              onClick={() => addAssetSaleEvent(asset.assetId)}
                            >
                              Add sale
                            </button>
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              onClick={() => addAssetPurchaseEvent(asset.assetId)}
                            >
                              Add purchase
                            </button>
                            {assetSaleEvents.map((saleEvent, index) => (
                              <button
                                key={saleEvent.eventId}
                                type="button"
                                className={styles.secondaryButton}
                                onClick={() => setActiveAssetSaleModalId(saleEvent.eventId)}
                              >
                                {saleEvent.label.trim() || (assetSaleEvents.length > 1 ? `Edit sale ${index + 1}` : "Edit sale")}
                              </button>
                            ))}
                            {(activeScenario.assetPurchaseEvents ?? [])
                              .filter((purchaseEvent) => purchaseEvent.assetId === asset.assetId)
                              .map((purchaseEvent, index) => (
                                <button
                                  key={purchaseEvent.eventId}
                                  type="button"
                                  className={styles.secondaryButton}
                                  onClick={() => setActiveAssetPurchaseModalId(purchaseEvent.eventId)}
                                >
                                  {purchaseEvent.label.trim() ||
                                    ((activeScenario.assetPurchaseEvents ?? []).length > 1 ? `Edit purchase ${index + 1}` : "Edit purchase")}
                                </button>
                              ))}
                            <button type="button" className={styles.dangerButton} onClick={() => deleteAsset(asset.assetId)}>
                              Delete
                            </button>
                          </div>
                        </details>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className={styles.inputCard}>
            <div className={styles.inputCardHeader}>
              <h4>Liabilities</h4>
              <div className={styles.tableActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => addLiability("other")}>
                  Add liability
                </button>
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Liability</th>
                    <th>Owner</th>
                    <th>Type</th>
                    <th>Opening balance</th>
                    <th>Interest rate</th>
                    <th>Annual repayment</th>
                    <th>Repayment type</th>
                    <th>Deductible interest</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeScenario.liabilities.map((liability) => {
                    const liabilityPaymentEvents = (activeScenario.liabilityPaymentEvents ?? []).filter(
                      (event) => event.liabilityId === liability.liabilityId,
                    );

                    return (
                    <tr key={liability.liabilityId}>
                      <td>
                        <input
                          className={styles.compactInput}
                          value={liability.name}
                          onChange={(event) => updateLiability(liability.liabilityId, (draft) => {
                            draft.name = event.target.value;
                          })}
                        />
                      </td>
                      <td>
                        <select
                          className={styles.compactInput}
                          value={liability.ownerPersonId}
                          onChange={(event) => updateLiability(liability.liabilityId, (draft) => {
                            draft.ownerPersonId = event.target.value;
                          })}
                        >
                          {activeScenario.people.length > 1 ? <option value={jointOwnerId}>Joint</option> : null}
                          {activeScenario.people.map((person) => (
                            <option key={person.personId} value={person.personId}>
                              {person.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className={styles.compactInput}
                          value={liability.type}
                          onChange={(event) => updateLiability(liability.liabilityId, (draft) => {
                            draft.type = event.target.value as ProjectionScenario["liabilities"][number]["type"];
                          })}
                        >
                          <option value="credit-card">Credit card</option>
                          <option value="mortgage">Mortgage</option>
                          <option value="personal-loan">Personal loan</option>
                          <option value="other">Other</option>
                        </select>
                      </td>
                      <td>
                        {renderCurrencyInput({
                          value: liability.openingBalance,
                          onChange: (value) => updateLiability(liability.liabilityId, (draft) => {
                            draft.openingBalance = value;
                          }),
                        })}
                      </td>
                      <td>
                        {renderPercentInput({
                          value: liability.annualInterestRate,
                          onChange: (value) => updateLiability(liability.liabilityId, (draft) => {
                            draft.annualInterestRate = value;
                          }),
                        })}
                      </td>
                      <td>
                        {renderCurrencyInput({
                          value: liability.annualRepayment,
                          onChange: (value) => updateLiability(liability.liabilityId, (draft) => {
                            draft.annualRepayment = value;
                          }),
                        })}
                      </td>
                      <td>
                        <select
                          className={styles.compactInput}
                          value={liability.repaymentType ?? "principal-and-interest"}
                          onChange={(event) => updateLiability(liability.liabilityId, (draft) => {
                            draft.repaymentType = event.target.value as NonNullable<ProjectionScenario["liabilities"][number]["repaymentType"]>;
                          })}
                        >
                          <option value="principal-and-interest">Principal and interest</option>
                          <option value="interest-only">Interest only</option>
                        </select>
                      </td>
                      <td>
                        <label className={styles.inlineCheckbox}>
                          <input
                            type="checkbox"
                            checked={liability.interestDeductible ?? false}
                            onChange={(event) => updateLiability(liability.liabilityId, (draft) => {
                              draft.interestDeductible = event.target.checked;
                            })}
                          />
                          Yes
                        </label>
                      </td>
                      <td>
                        <details className={styles.rowActionMenu} onToggle={handleRowActionMenuToggle}>
                          <summary aria-label={`Actions for ${liability.name}`}>...</summary>
                          <div className={styles.rowActionMenuList}>
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              onClick={() => addLiabilityDrawdownEvent(liability.liabilityId)}
                            >
                              Add drawdown
                            </button>
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              onClick={() => addLiabilityPaymentEvent(liability.liabilityId)}
                            >
                              Add payment
                            </button>
                            {(activeScenario.liabilityDrawdownEvents ?? [])
                              .filter((drawdownEvent) => drawdownEvent.liabilityId === liability.liabilityId)
                              .map((drawdownEvent, index) => (
                                <button
                                  key={drawdownEvent.eventId}
                                  type="button"
                                  className={styles.secondaryButton}
                                  onClick={() => setActiveLiabilityDrawdownModalId(drawdownEvent.eventId)}
                                >
                                  {drawdownEvent.label.trim() ||
                                    ((activeScenario.liabilityDrawdownEvents ?? []).length > 1 ? `Edit drawdown ${index + 1}` : "Edit drawdown")}
                                </button>
                              ))}
                            {liabilityPaymentEvents.map((paymentEvent, index) => (
                              <button
                                key={paymentEvent.eventId}
                                type="button"
                                className={styles.secondaryButton}
                                onClick={() => setActiveLiabilityPaymentModalId(paymentEvent.eventId)}
                              >
                                {paymentEvent.label.trim() ||
                                  (liabilityPaymentEvents.length > 1 ? `Edit payment ${index + 1}` : "Edit payment")}
                              </button>
                            ))}
                            <button type="button" className={styles.dangerButton} onClick={() => deleteLiability(liability.liabilityId)}>
                              Delete
                            </button>
                          </div>
                        </details>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }

    const accountType = activeScenarioInputTab === "superannuation" ? "super-accumulation" : "account-based-pension";
    const accounts = activeScenario.retirementAccounts.filter((account) => account.accountType === accountType);

    return (
      <div className={styles.inputStack}>
        <div className={styles.tableActions}>
          <button type="button" className={styles.secondaryButton} onClick={() => addRetirementAccount(accountType)}>
            {accountType === "account-based-pension" ? "Add pension" : "Add super account"}
          </button>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Account</th>
                <th>Owner</th>
                <th>Opening balance</th>
                <th>Fees</th>
                {accountType === "super-accumulation" ? <th>Insurance premiums</th> : null}
                <th>Investment profile</th>
                {accountType === "account-based-pension" ? <th>Annual drawdown</th> : null}
                {accountType === "account-based-pension" ? <th>Indexed</th> : null}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => {
                const accountContributionStrategies = (activeScenario.superContributionStrategies ?? []).filter(
                  (strategy) => strategy.targetAccountId === account.accountId,
                );
                const accountRolloverEvents = (activeScenario.superRolloverEvents ?? []).filter(
                  (rolloverEvent) => rolloverEvent.sourceAccountId === account.accountId && Boolean(rolloverEvent.rolloverDate),
                );
                const accountPensionWithdrawalEvents = (activeScenario.pensionWithdrawalEvents ?? []).filter(
                  (withdrawalEvent) => withdrawalEvent.accountId === account.accountId,
                );

                return (
                <tr key={account.accountId}>
                  <td>
                    <input
                      className={styles.compactInput}
                      value={account.productName}
                      onChange={(event) => updateRetirementAccount(account.accountId, (draft) => {
                        draft.productName = event.target.value;
                      })}
                    />
                  </td>
                  <td>
                    <select
                      className={styles.compactInput}
                      value={account.ownerPersonId}
                      onChange={(event) => updateRetirementAccount(account.accountId, (draft) => {
                        draft.ownerPersonId = event.target.value;
                      })}
                    >
                      {activeScenario.people.map((person) => (
                        <option key={person.personId} value={person.personId}>
                          {person.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {renderCurrencyInput({
                      value: account.openingBalance,
                      onChange: (value) => updateRetirementAccount(account.accountId, (draft) => {
                        draft.openingBalance = value;
                      }),
                    })}
                  </td>
                  <td>
                    {renderPercentInput({
                      value: account.annualFeeRate ?? 0.015,
                      compact: true,
                      onChange: (value) => updateRetirementAccount(account.accountId, (draft) => {
                        draft.annualFeeRate = value;
                      }),
                    })}
                  </td>
                  {accountType === "super-accumulation" ? (
                    <td>
                      {renderCurrencyInput({
                        value: account.annualInsurancePremium ?? 0,
                        onChange: (value) => updateRetirementAccount(account.accountId, (draft) => {
                          draft.annualInsurancePremium = value;
                        }),
                      })}
                    </td>
                  ) : null}
                  <td>
                    <select
                      className={styles.compactInput}
                      value={account.investmentProfileKey}
                      onChange={(event) => updateRetirementAccount(account.accountId, (draft) => {
                        draft.investmentProfileKey = event.target.value;
                      })}
                    >
                      <option value="Defensive">Defensive</option>
                      <option value="Moderate">Moderate</option>
                      <option value="Balanced">Balanced</option>
                      <option value="Growth">Growth</option>
                      <option value="High Growth">High Growth</option>
                    </select>
                  </td>
                  {accountType === "account-based-pension" ? (
                    <td>
                      {renderCurrencyInput({
                        value: account.annualDrawdown,
                        onChange: (value) => updateRetirementAccount(account.accountId, (draft) => {
                          draft.annualDrawdown = value;
                        }),
                      })}
                    </td>
                  ) : null}
                  {accountType === "account-based-pension" ? (
                    <td>
                      <input
                        type="checkbox"
                        checked={account.drawdownIndexedToCpi}
                        onChange={(event) => updateRetirementAccount(account.accountId, (draft) => {
                          draft.drawdownIndexedToCpi = event.target.checked;
                        })}
                      />
                    </td>
                  ) : null}
                  <td>
                    <details className={styles.rowActionMenu} onToggle={handleRowActionMenuToggle}>
                      <summary aria-label={`Actions for ${account.productName}`}>...</summary>
                      <div className={styles.rowActionMenuList}>
                        {accountType === "super-accumulation" ? (
                          <>
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              onClick={() => addSuperContributionStrategy(account.accountId)}
                            >
                              Add contribution
                            </button>
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              onClick={() => addSuperRolloverEvent(account.accountId)}
                            >
                              Add rollover
                            </button>
                            {accountContributionStrategies.map((strategy, index) => (
                              <button
                                key={strategy.strategyId}
                                type="button"
                              className={styles.secondaryButton}
                              onClick={() => setActiveSuperStrategyModalId(strategy.strategyId)}
                            >
                                {strategy.label.trim() || (accountContributionStrategies.length > 1 ? `Edit contribution ${index + 1}` : "Edit contribution")}
                              </button>
                            ))}
                            {accountRolloverEvents.map((rolloverEvent, index) => (
                              <button
                                key={rolloverEvent.eventId}
                                type="button"
                              className={styles.secondaryButton}
                              onClick={() => setActiveSuperRolloverModalId(rolloverEvent.eventId)}
                            >
                                {rolloverEvent.label?.trim() || (accountRolloverEvents.length > 1 ? `Edit rollover ${index + 1}` : "Edit rollover")}
                              </button>
                            ))}
                          </>
                        ) : null}
                        {accountType === "account-based-pension" ? (
                          <>
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              onClick={() => addPensionWithdrawalEvent(account.accountId)}
                            >
                              Add lump sum
                            </button>
                            {accountPensionWithdrawalEvents.map((withdrawalEvent, index) => (
                              <button
                                key={withdrawalEvent.eventId}
                                type="button"
                                className={styles.secondaryButton}
                                onClick={() => setActivePensionWithdrawalModalId(withdrawalEvent.eventId)}
                              >
                                {withdrawalEvent.label.trim() ||
                                  (accountPensionWithdrawalEvents.length > 1
                                    ? `Edit lump sum ${index + 1}`
                                    : "Edit lump sum")}
                              </button>
                            ))}
                          </>
                        ) : null}
                        <button type="button" className={styles.dangerButton} onClick={() => deleteRetirementAccount(account.accountId)}>
                          Delete
                        </button>
                      </div>
                    </details>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderActiveProjectionSection() {
    if (activeSection === "scenario-inputs") {
      return (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Scenario inputs</p>
              <h3>Configure scenario variables</h3>
            </div>
            <span className={styles.badge}>Editable inputs</span>
          </div>
          <div className={styles.inputTabList} aria-label="Scenario input tabs">
            {scenarioInputTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={activeScenarioInputTab === tab.id ? styles.inputTabActive : styles.inputTab}
                onClick={() => setActiveScenarioInputTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {renderScenarioInputContent()}
        </section>
      );
    }

    if (!mappedScenario) {
      return (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Projection workspace</p>
              <h3>No scenario loaded</h3>
            </div>
            <span className={styles.badge}>Awaiting fact find</span>
          </div>
          <p className={styles.subtitle}>
            Upload a fact find or client pack, then run the projection model to map the scenario inputs and generate the projection tables.
          </p>
        </section>
      );
    }

    if (activeSection === "personal-cashflow") {
      return (
        <section className={styles.panel}>
          <div className={styles.tableControls}>
            <div className={styles.segmentedControl} aria-label="Personal cashflow view">
              <button
                className={cashflowViewMode === "table" ? styles.segmentedButtonActive : styles.segmentedButton}
                type="button"
                onClick={() => setCashflowViewMode("table")}
              >
                Table
              </button>
              <button
                className={cashflowViewMode === "chart" ? styles.segmentedButtonActive : styles.segmentedButton}
                type="button"
                onClick={() => setCashflowViewMode("chart")}
              >
                Bar chart
              </button>
            </div>
          </div>
          {cashflowViewMode === "chart" ? renderCashflowChart() : renderProjectionTable(cashflowProjectionRows, true)}
        </section>
      );
    }

    if (activeSection === "taxation") {
      return (
        <section className={styles.panel}>
          <div className={styles.tableControls}>
            <label>
              View tax for
              <select
                value={selectedTaxPersonId ?? activeScenario.primaryPersonId}
                onChange={(event) => setTaxPersonFilter(event.target.value)}
              >
                {activeScenario.people.map((person) => (
                  <option key={person.personId} value={person.personId}>
                    {person.role === "partner" ? "Partner" : "Client"}: {person.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {renderProjectionTable(selectedTaxProjectionRows)}
        </section>
      );
    }

    if (activeSection === "assets-liabilities") {
      return (
        <section className={styles.panel}>
          <div className={styles.tableControls}>
            <div className={styles.segmentedControl} aria-label="Assets and liabilities view">
              <button
                className={assetLiabilityViewMode === "table" ? styles.segmentedButtonActive : styles.segmentedButton}
                type="button"
                onClick={() => setAssetLiabilityViewMode("table")}
              >
                Table
              </button>
              <button
                className={assetLiabilityViewMode === "chart" ? styles.segmentedButtonActive : styles.segmentedButton}
                type="button"
                onClick={() => setAssetLiabilityViewMode("chart")}
              >
                Bar chart
              </button>
            </div>
          </div>
          {assetLiabilityViewMode === "chart" ? renderAssetLiabilityChart() : renderProjectionTable(balanceSheetProjectionRows)}
        </section>
      );
    }

    if (activeSection === "superannuation") {
      return (
        <section className={styles.panel}>
          <div className={styles.tableControls}>
            <label>
              View funds for
              <select value={superOwnerFilter} onChange={(event) => setSuperOwnerFilter(event.target.value)}>
                <option value="all">Client and partner</option>
                {activeScenario.people.map((person) => (
                  <option key={person.personId} value={person.personId}>
                    {person.role === "partner" ? "Partner" : "Client"}: {person.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {renderGroupedProjectionTable(filteredSuperProjectionGroups)}
        </section>
      );
    }

    if (activeSection === "pensions") {
      return (
        <section className={styles.panel}>
          <div className={styles.tableControls}>
            <label>
              View pensions for
              <select value={superOwnerFilter} onChange={(event) => setSuperOwnerFilter(event.target.value)}>
                <option value="all">Client and partner</option>
                {activeScenario.people.map((person) => (
                  <option key={person.personId} value={person.personId}>
                    {person.role === "partner" ? "Partner" : "Client"}: {person.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {renderGroupedProjectionTable(filteredPensionProjectionGroups)}
        </section>
      );
    }

    if (activeSection === "centrelink") {
      return (
        <section className={styles.panel}>
          <div className={styles.tableControls}>
            <label>
              View Centrelink for
              <select
                value={selectedCentrelinkPersonId ?? activeScenario.primaryPersonId}
                onChange={(event) => setCentrelinkPersonFilter(event.target.value)}
              >
                {activeScenario.people.map((person) => (
                  <option key={person.personId} value={person.personId}>
                    {person.role === "partner" ? "Partner" : "Client"}: {person.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {renderProjectionTable(selectedCentrelinkProjectionRows)}
        </section>
      );
    }

    if (activeSection === "assumptions") {
      return (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Assumptions</p>
              <h3>Configure scenario assumptions</h3>
            </div>
            <span className={styles.badge}>Editable inputs</span>
          </div>
          {renderScenarioAssumptionInputs()}
        </section>
      );
    }

    return null;
  }

  function renderStartProjectionPanel() {
    const isScenarioLoading = mappingStatus === "mapping" || clientImportStatus === "importing";

    return (
      <section className={styles.startPanel}>
        <div className={styles.startPanelContent}>
          <p className={styles.eyebrow}>Projection workspace</p>
          <h2>Start a projection scenario</h2>
          <p>
            Choose the source data first. Once the fact find data is loaded, run the projection model to create the editable
            scenario inputs and projection tables.
          </p>
          <div className={styles.startActions}>
            <label className={styles.uploadButton} htmlFor="projection-start-upload">
              Upload fact find
            </label>
            <input
              id="projection-start-upload"
              className={styles.uploadInput}
              type="file"
              accept=".docx,.pdf,.csv,.txt"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setScenarioFile(file);
                setScenarioUploadName(file?.name ?? null);
                setPendingClientProfileScenario(null);
                setClientImportStatus("idle");
                setClientImportMessage(null);
                setMappingResult(null);
                setMappingStatus("idle");
              }}
            />
            <button
              className={styles.uploadButton}
              type="button"
              disabled={!linkedClientId || clientImportStatus === "importing"}
              onClick={handleImportClientProfileScenario}
            >
              {clientImportStatus === "importing" ? "Importing fact find..." : "Import fact find"}
            </button>
            <button
              className={styles.runModelButton}
              type="button"
              disabled={!hasSourceDataReady || mappingStatus === "mapping" || clientImportStatus === "importing"}
              onClick={handleRunScenario}
            >
              {mappingStatus === "mapping" ? "Running model..." : "Run projection model"}
            </button>
          </div>
          {scenarioUploadName ? (
            <p className={styles.startStatus}>
              <strong>Selected file</strong>
              {scenarioUploadName}
            </p>
          ) : null}
          {clientImportMessage ? (
            <p className={clientImportStatus === "error" ? styles.startError : styles.startStatus}>
              {clientImportMessage}
            </p>
          ) : null}
          {isScenarioLoading ? (
            <div className={styles.startLoader} role="status" aria-live="polite">
              <span className={styles.loaderDots} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span>
                {mappingStatus === "mapping"
                  ? "Finley is reading the source data and building the projection scenario."
                  : "Finley is loading the app fact find."}
              </span>
            </div>
          ) : null}
          {mappingResult?.error ? <p className={styles.startError}>{mappingResult.error}</p> : null}
        </div>
      </section>
    );
  }

  function renderLoadingProjectionPanel() {
    return (
      <section className={styles.startPanel}>
        <div className={styles.startPanelContent}>
          <p className={styles.eyebrow}>Projection workspace</p>
          <h2>Loading projection scenario</h2>
          <p>Restoring the saved projection workspace for this SOA.</p>
        </div>
      </section>
    );
  }

  return (
    <div className={styles.projectionsShell}>
      <aside className={styles.projectionsSidebar} aria-label="Projection workspace navigation">
        <div className={styles.sidebarBrand}>
          <span>iC2 Clients</span>
          <strong>Projection Workspace</strong>
          <p>Scenario modelling, assumptions, and projection outputs.</p>
        </div>

        <nav className={styles.sidebarNav}>
          {scenarios.length ? (
            <div className={styles.scenarioUploadCard}>
              <div>
                <strong>Scenarios</strong>
                <span>Select or copy a scenario.</span>
              </div>
              <select
                className={styles.sidebarSelect}
                value={activeScenarioId ?? ""}
                onChange={(event) => setActiveScenarioId(event.target.value)}
              >
                {scenarios.map((scenario) => (
                  <option key={scenario.scenarioId} value={scenario.scenarioId}>
                    {scenario.scenarioName}
                  </option>
                ))}
              </select>
              <button
                className={styles.runModelButton}
                type="button"
                disabled={!mappedScenario}
                onClick={duplicateActiveScenario}
              >
                Copy to new scenario
              </button>
              <button
                className={styles.deleteScenarioButton}
                type="button"
                disabled={!mappedScenario}
                onClick={deleteActiveScenario}
              >
                Delete scenario
              </button>
            </div>
          ) : null}

          {mappedScenario ? (
          <div className={styles.sectionNav} aria-label="Projection sections">
            {projectionSections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={section.id === activeSection ? styles.sectionNavItemActive : styles.sectionNavItem}
                onClick={() => setActiveSection(section.id)}
              >
                {section.label}
              </button>
            ))}
          </div>
          ) : null}
        </nav>
      </aside>

      <main className={styles.content}>
        <div className={styles.page}>
        {hasLinkedSoaContext ? (
          <section className={styles.contextBand}>
            <div>
              <p className={styles.eyebrow}>Linked SOA workflow</p>
              <h3>Projection case for this SOA</h3>
              <p>Client ID: {linkedClientId}</p>
              <p>SOA ID: {linkedSoaId}</p>
            </div>
            {mappedScenario ? (
              <button className={styles.exportButton} type="button" onClick={handleExportProjectionWorkbook}>
                Export Excel
              </button>
            ) : null}
          </section>
        ) : null}
        {!workspaceStateLoaded ? (
          renderLoadingProjectionPanel()
        ) : !mappedScenario ? (
          renderStartProjectionPanel()
        ) : (
          <>
        <section className={styles.headerBand}>
          <div>
            <p className={styles.eyebrow}>Projection workspace</p>
            <h2 className={styles.title}>{activeClientName} projection model</h2>
            <p className={styles.subtitle}>
              {mappedScenario
                ? "Uploaded fact find scenario mapped into the projection schema. This view projects the mapped cashflow, assets, liabilities, and retirement accounts through life expectancy using the assumption pack."
                : "Upload a fact find or client pack to map a new scenario into the projection engine. No client data is preloaded."}
            </p>
            {mappingResult?.mappingNotes?.length || mappingResult?.confirmationsRequired?.length || mappingResult?.warning ? (
              <div className={styles.mappingNotice}>
                {mappingResult.warning ? <p>{mappingResult.warning}</p> : null}
                {mappingResult.mappingNotes?.slice(0, 3).map((note) => (
                  <p key={note}>{note}</p>
                ))}
                {mappingResult.confirmationsRequired?.length ? (
                  <p>Confirm: {mappingResult.confirmationsRequired.slice(0, 2).join(" ")}</p>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className={styles.statusPanel}>
            <span className={styles.statusLabel}>Scenario</span>
            {mappedScenario ? (
              <>
                <strong>{activeScenario.scenarioName}</strong>
                <span>
                  Start date: 1 {monthNames[activeScenario.startMonth - 1] ?? "Jul"} {projectionStartYear}
                </span>
                <span>Projected to age {endAge}</span>
              </>
            ) : (
              <>
                <strong>No scenario loaded</strong>
                <span>Upload a fact find to begin</span>
              </>
            )}
          </div>
        </section>

        {renderActiveProjectionSection()}
          </>
        )}

        <div className={styles.hiddenLegacySections} aria-hidden="true">
        <section className={styles.twoColumn}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Projection inputs</p>
                <h3>Cashflow baseline</h3>
              </div>
              <span className={styles.badge}>Editable levers</span>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Section</th>
                    <th>Item</th>
                    <th>Annual amount</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {cashflowRows.map((row) => (
                    <tr key={`${row.section}-${row.item}`}>
                      <td>{row.section}</td>
                      <td>{row.item}</td>
                      <td className={styles.numberCell}>{row.annual}</td>
                      <td>{row.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Model boundary</p>
                <h3>How Finley should interact</h3>
              </div>
              <span className={styles.badge}>Controlled</span>
            </div>
            <div className={styles.ruleStack}>
              <div>
                <strong>LLM role</strong>
                <p>Interpret adviser instructions, identify projection levers, explain affected areas, and ask for missing assumptions.</p>
              </div>
              <div>
                <strong>Engine role</strong>
                <p>Calculate cashflow, tax, pension balances, Age Pension impacts, fees, and closing values deterministically.</p>
              </div>
              <div>
                <strong>Locked outputs</strong>
                <p>Closing values, tax outcomes, and sustainability results should be generated by the engine, not manually edited by Finley.</p>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Centrelink calculation</p>
              <h3>Age Pension under legislative assumptions</h3>
            </div>
            <span className={styles.badge}>Feeds cashflow</span>
          </div>
          <div className={styles.assumptionStrip}>
            <span>Single homeowner asset threshold: $321,500</span>
            <span>Assets taper: $3 per $1,000 per fortnight</span>
            <span>Income threshold: $5,668 p.a.</span>
            <span>Income taper: $0.50 per dollar</span>
            <span>Deeming: 1.25% / 3.25%</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={`${styles.dataTable} ${styles.projectionTable}`.trim()}>
              <thead>
                <tr>
                  <th className={styles.stickyLabelCell}>Date</th>
                  {projectionRows.map((row) => (
                    <th key={row.year}>1 Jul {String(row.year).slice(-2)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agePensionProjectionRows.map((row) => (
                  <tr key={row.label}>
                    <td className={styles.stickyLabelCell}>{row.label}</td>
                    {row.values.map((value, index) => (
                      <td key={`${row.label}-${projectionRows[index].year}`} className={styles.numberCell}>
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Current-situation projection</p>
              <h3>Cashflow to life expectancy</h3>
            </div>
            <span className={styles.badge}>Deterministic prototype</span>
          </div>
          <div className={styles.assumptionStrip}>
            <span>CPI indexed eligible Age Pension and expenses: 3.00% p.a.</span>
            <span>Account-based pension drawdowns use mapped scenario values</span>
            <span>Employer SG: 12.00% up to cap, less 15.00% contributions tax</span>
            <span>Retirement returns use mapped investment profiles</span>
            <span>Cash reserve return: 2.50% p.a.</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={`${styles.dataTable} ${styles.projectionTable}`.trim()}>
              <thead>
                <tr>
                  <th className={styles.stickyLabelCell}>Date</th>
                  {projectionRows.map((row) => (
                    <th key={row.year}>1 Jul {String(row.year).slice(-2)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cashflowProjectionRows.map((row) => (
                  <tr key={row.label}>
                    <td className={styles.stickyLabelCell}>
                      {row.control === "surplus-allocation" ? renderSurplusAllocationControl() : row.label}
                    </td>
                    {row.values.map((value, index) => {
                      const projectionRow = projectionRows[index];
                      const isNegativeCashflow = row.label === "Net cashflow after tax" && projectionRow.netCashflowAfterTax < 0;
                      const isPositiveCashflow = row.label === "Net cashflow after tax" && projectionRow.netCashflowAfterTax >= 0;

                      return (
                        <td
                          key={`${row.label}-${projectionRow.year}`}
                          className={[
                            styles.numberCell,
                            isNegativeCashflow ? styles.negativeCell : "",
                            isPositiveCashflow ? styles.positiveCell : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Taxation calculation</p>
              <h3>Tax payable under legislative assumptions</h3>
            </div>
            <span className={styles.badge}>Feeds cashflow</span>
          </div>
          <div className={styles.assumptionStrip}>
            <span>Resident rates: 0%, 16%, 30%, 37%, 45%</span>
            <span>Medicare levy: 2.00%</span>
            <span>Medicare threshold: $27,222</span>
            <span>Shade-in threshold: $34,028</span>
            <span>Age Pension included with LITO/SAPTO offsets</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={`${styles.dataTable} ${styles.projectionTable}`.trim()}>
              <thead>
                <tr>
                  <th className={styles.stickyLabelCell}>Date</th>
                  {projectionRows.map((row) => (
                    <th key={row.year}>1 Jul {String(row.year).slice(-2)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {taxProjectionRows.map((row) => (
                  <tr key={row.label}>
                    <td className={styles.stickyLabelCell}>{row.label}</td>
                    {row.values.map((value, index) => (
                      <td key={`${row.label}-${projectionRows[index].year}`} className={styles.numberCell}>
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Current-situation projection</p>
              <h3>Assets, liabilities and net worth to life expectancy</h3>
            </div>
            <span className={styles.badge}>Balance sheet</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={`${styles.dataTable} ${styles.projectionTable}`.trim()}>
              <thead>
                <tr>
                  <th className={styles.stickyLabelCell}>Date</th>
                  {projectionRows.map((row) => (
                    <th key={row.year}>1 Jul {String(row.year).slice(-2)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {balanceSheetProjectionRows.map((row) => (
                  <tr key={row.label}>
                    <td className={styles.stickyLabelCell}>{row.label}</td>
                    {row.values.map((value, index) => {
                      const projectionRow = projectionRows[index];
                      const isCashReserveWarning = row.label === "Cash reserve" && projectionRow.cashReserve < cashReserveTarget;

                      return (
                        <td
                          key={`${row.label}-${projectionRow.year}`}
                          className={[styles.numberCell, isCashReserveWarning ? styles.warningText : ""]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.twoColumn}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Sustainability read</p>
                <h3>What the current settings imply</h3>
              </div>
              <span className={styles.badge}>Current only</span>
            </div>
            <div className={styles.ruleStack}>
              <div>
                <strong>Cash reserve pressure</strong>
                <p>
                  The reserve starts at {money(openingCash)} and is projected to be {finalProjectionYear ? money(finalProjectionYear.cashReserve) : "$0"} by age {endAge}.{" "}
                  {firstReserveBreach
                    ? `It first falls below the ${money(cashReserveTarget)} target in ${firstReserveBreach.year}.`
                    : `It remains above the ${money(cashReserveTarget)} target.`}
                </p>
              </div>
              <div>
                <strong>Retirement capital</strong>
                <p>
                  The first mapped retirement account is projected from {money(openingAmpPension)} to{" "}
                  {finalProjectionYear ? money(Object.values(finalProjectionYear.retirementAccountBalances)[0] ?? 0) : "$0"} after current withdrawals and investment-profile earnings.
                </p>
              </div>
              <div>
                <strong>Net worth</strong>
                <p>
                  Net worth starts at approximately {money(startingNetWorth)} and is projected to {finalProjectionYear ? money(finalProjectionYear.netWorth) : "$0"}, with the home unit indexed by CPI.
                </p>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Visual check</p>
                <h3>Cash reserve path</h3>
              </div>
              <span className={styles.badge}>Target {money(cashReserveTarget)}</span>
            </div>
            <div className={styles.reserveChart} aria-label="Projected cash reserve by year">
              {projectionRows.map((row) => {
                const width = Math.min(100, Math.max(2, (row.cashReserve / openingCash) * 100));

                return (
                  <div key={row.year} className={styles.reserveRow}>
                    <span>{row.year}</span>
                    <div className={styles.reserveTrack}>
                      <div
                        className={row.cashReserve < cashReserveTarget ? styles.reserveBarWarning : styles.reserveBar}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <strong>{money(row.cashReserve)}</strong>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Assets and liabilities</p>
              <h3>Current balance sheet mapping</h3>
            </div>
            <span className={styles.badge}>Source: fact find</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Owner</th>
                  <th>Type</th>
                  <th>Value</th>
                  <th>Projection treatment</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => (
                  <tr key={asset.name}>
                    <td>{asset.name}</td>
                    <td>{asset.owner}</td>
                    <td>{asset.type}</td>
                    <td className={styles.numberCell}>{asset.value}</td>
                    <td>{asset.treatment}</td>
                  </tr>
                ))}
                <tr>
                  <td>Credit card</td>
                  <td>Margaret</td>
                  <td>Liability</td>
                  <td className={styles.numberCell}>($1,200)</td>
                  <td>Repaid monthly; no interest modelled unless adviser changes assumption</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.twoColumn}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Super and pension</p>
                <h3>Account schema mapping</h3>
              </div>
              <span className={styles.badge}>Calculated outputs</span>
            </div>
            <div className={styles.accountStack}>
              {retirementAccounts.map((account) => (
                <article key={account.account} className={styles.accountItem}>
                  <div className={styles.accountTop}>
                    <strong>{account.account}</strong>
                    <span>{account.balance}</span>
                  </div>
                  <dl className={styles.definitionGrid}>
                    <div>
                      <dt>Investment profile</dt>
                      <dd>{account.profile}</dd>
                    </div>
                    <div>
                      <dt>Drawdown</dt>
                      <dd>{account.drawdown}</dd>
                    </div>
                  </dl>
                  <div className={styles.tagRow}>
                    {account.schemaRows.map((row) => (
                      <span key={row}>{row}</span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Assumption set</p>
                <h3>Files driving the model</h3>
              </div>
              <span className={styles.badge}>Version required</span>
            </div>
            <div className={styles.assumptionList}>
              {assumptions.map((assumption) => (
                <div key={assumption.layer} className={styles.assumptionItem}>
                  <strong>{assumption.layer}</strong>
                  <span>{assumption.source}</span>
                  <p>{assumption.use}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Projection years</p>
              <h3>Baseline timeline summary</h3>
            </div>
            <span className={styles.badge}>To life expectancy</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Margaret age</th>
                  <th>Income</th>
                  <th>Expenses</th>
                  <th>Retirement balance</th>
                  <th>Cash reserve</th>
                </tr>
              </thead>
              <tbody>
                {projectionRows.filter((_, index) => index % 3 === 0 || index === projectionRows.length - 1).map((row) => (
                  <tr key={row.year}>
                    <td>{row.year}</td>
                    <td>{row.ageByPersonId[primaryPersonId]}</td>
                    <td>{money(row.totalIncome)}</td>
                    <td>{money(row.expenses)}</td>
                    <td>{money(Object.values(row.retirementAccountBalances)[0] ?? 0)}</td>
                    <td>{money(row.cashReserve)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Before modelling recommendations</p>
              <h3>Required checks</h3>
            </div>
            <span className={styles.badge}>Adviser review</span>
          </div>
          <ul className={styles.checkList}>
            {projectionChecks.map((check) => (
              <li key={check}>{check}</li>
            ))}
          </ul>
        </section>
        </div>
        </div>
      </main>
      {activeAssetEdit ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setActiveAssetEditModalId(null)}>
          <section
            className={styles.modalPanel}
            role="dialog"
            aria-modal="true"
            aria-label="Edit asset"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>Assets and liabilities</p>
                <h3>Edit asset</h3>
              </div>
            </div>
            <div className={styles.modalGrid}>
              <label>
                Asset
                <input
                  className={styles.compactInput}
                  value={activeAssetEdit.name}
                  onChange={(event) => updateAsset(activeAssetEdit.assetId, (draft) => {
                    draft.name = event.target.value;
                  })}
                />
              </label>
              <label>
                Cost base
                {renderCurrencyInput({
                  value: activeAssetEdit.costBase ?? activeAssetEdit.openingValue,
                  onChange: (value) => updateAsset(activeAssetEdit.assetId, (draft) => {
                    draft.costBase = value;
                  }),
                })}
              </label>
              <label>
                Acquisition date
                <input
                  type="date"
                  className={styles.compactInput}
                  value={activeAssetEdit.acquisitionDate ?? ""}
                  onChange={(event) => updateAsset(activeAssetEdit.assetId, (draft) => {
                    draft.acquisitionDate = event.target.value || null;
                  })}
                />
              </label>
              <label>
                CGT treatment
                <select
                  className={styles.compactInput}
                  value={activeAssetEdit.cgtTreatment ?? defaultAssetCgtTreatment(activeAssetEdit.type)}
                  onChange={(event) => updateAsset(activeAssetEdit.assetId, (draft) => {
                    draft.cgtTreatment = event.target.value as NonNullable<ProjectionScenario["assets"][number]["cgtTreatment"]>;
                  })}
                >
                  {projectionCgtTreatmentOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setActiveAssetEditModalId(null)}>
                Save
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {activeAssetSale ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setActiveAssetSaleModalId(null)}>
          <section
            className={styles.modalPanel}
            role="dialog"
            aria-modal="true"
            aria-label="Asset sale"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>Assets and liabilities</p>
                <h3>Asset sale</h3>
              </div>
            </div>
            <div className={styles.modalGrid}>
              <label>
                Strategy
                <input
                  className={styles.compactInput}
                  value={activeAssetSale.label}
                  onChange={(event) => updateAssetSaleEvent(activeAssetSale.eventId, (draft) => {
                    draft.label = event.target.value;
                  })}
                />
              </label>
              <label>
                Asset
                <input
                  className={styles.compactInput}
                  value={activeAssetSaleAsset?.name ?? "Selected asset"}
                  readOnly
                />
              </label>
              <label>
                Sale date
                <input
                  type="date"
                  className={styles.compactInput}
                  value={activeAssetSale.saleDate ?? ""}
                  onChange={(event) => updateAssetSaleEvent(activeAssetSale.eventId, (draft) => {
                    draft.saleDate = event.target.value || null;
                  })}
                />
              </label>
              <label>
                Proceeds to
                <select
                  className={styles.compactInput}
                  value={
                    activeAssetSale.targetAssetId &&
                    activeAssetSaleCashAssets.some((asset) => asset.assetId === activeAssetSale.targetAssetId)
                      ? activeAssetSale.targetAssetId
                      : ""
                  }
                  onChange={(event) => updateAssetSaleEvent(activeAssetSale.eventId, (draft) => {
                    draft.targetAssetId = event.target.value || null;
                  })}
                >
                  <option value="">Select cash account</option>
                  {activeAssetSaleCashAssets.map((asset) => (
                    <option key={asset.assetId} value={asset.assetId}>
                      {asset.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Amount
                <select
                  className={styles.compactInput}
                  value={activeAssetSale.amountMode}
                  onChange={(event) => updateAssetSaleEvent(activeAssetSale.eventId, (draft) => {
                    draft.amountMode = event.target.value as ProjectionScenario["assetSaleEvents"][number]["amountMode"];
                  })}
                >
                  <option value="full-value">Full value</option>
                  <option value="fixed-amount">Fixed amount</option>
                </select>
              </label>
              {activeAssetSale.amountMode === "fixed-amount" ? (
                <label>
                  Fixed amount
                  {renderCurrencyInput({
                    value: activeAssetSale.fixedAmount ?? 0,
                    onChange: (value) => updateAssetSaleEvent(activeAssetSale.eventId, (draft) => {
                      draft.fixedAmount = value;
                    }),
                  })}
                </label>
              ) : null}
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setActiveAssetSaleModalId(null)}>
                Save
              </button>
              <button type="button" className={styles.dangerButton} onClick={() => deleteAssetSaleEvent(activeAssetSale.eventId)}>
                Delete sale
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {activeAssetPurchase ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setActiveAssetPurchaseModalId(null)}>
          <section
            className={styles.modalPanel}
            role="dialog"
            aria-modal="true"
            aria-label="Asset purchase"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>Assets and liabilities</p>
                <h3>Asset purchase</h3>
              </div>
            </div>
            <div className={styles.modalGrid}>
              <label>
                Strategy
                <input
                  className={styles.compactInput}
                  value={activeAssetPurchase.label}
                  onChange={(event) => updateAssetPurchaseEvent(activeAssetPurchase.eventId, (draft) => {
                    draft.label = event.target.value;
                  })}
                />
              </label>
              <label>
                Asset
                <input
                  className={styles.compactInput}
                  value={activeAssetPurchaseAsset?.name ?? "Selected asset"}
                  readOnly
                />
              </label>
              <label>
                Purchase date
                <input
                  type="date"
                  className={styles.compactInput}
                  value={activeAssetPurchase.purchaseDate ?? ""}
                  onChange={(event) => updateAssetPurchaseEvent(activeAssetPurchase.eventId, (draft) => {
                    draft.purchaseDate = event.target.value || null;
                  })}
                />
              </label>
              <label>
                Pay from
                <select
                  className={styles.compactInput}
                  value={
                    activeAssetPurchase.sourceAssetId &&
                    activeAssetPurchaseCashAssets.some((asset) => asset.assetId === activeAssetPurchase.sourceAssetId)
                      ? activeAssetPurchase.sourceAssetId
                      : ""
                  }
                  onChange={(event) => updateAssetPurchaseEvent(activeAssetPurchase.eventId, (draft) => {
                    draft.sourceAssetId = event.target.value || null;
                  })}
                >
                  <option value="">Select cash account</option>
                  {activeAssetPurchaseCashAssets.map((asset) => (
                    <option key={asset.assetId} value={asset.assetId}>
                      {asset.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Purchase amount
                {renderCurrencyInput({
                  value: activeAssetPurchase.amount,
                  onChange: (value) => updateAssetPurchaseEvent(activeAssetPurchase.eventId, (draft) => {
                    draft.amount = value;
                  }),
                })}
              </label>
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setActiveAssetPurchaseModalId(null)}>
                Save
              </button>
              <button type="button" className={styles.dangerButton} onClick={() => deleteAssetPurchaseEvent(activeAssetPurchase.eventId)}>
                Delete purchase
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {activeLiabilityDrawdown ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setActiveLiabilityDrawdownModalId(null)}>
          <section
            className={styles.modalPanel}
            role="dialog"
            aria-modal="true"
            aria-label="Liability drawdown"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>Assets and liabilities</p>
                <h3>Liability drawdown</h3>
              </div>
            </div>
            <div className={styles.modalGrid}>
              <label>
                Strategy
                <input
                  className={styles.compactInput}
                  value={activeLiabilityDrawdown.label}
                  onChange={(event) => updateLiabilityDrawdownEvent(activeLiabilityDrawdown.eventId, (draft) => {
                    draft.label = event.target.value;
                  })}
                />
              </label>
              <label>
                Liability
                <input
                  className={styles.compactInput}
                  value={activeLiabilityDrawdownLiability?.name ?? "Selected liability"}
                  readOnly
                />
              </label>
              <label>
                Drawdown date
                <input
                  type="date"
                  className={styles.compactInput}
                  value={activeLiabilityDrawdown.drawdownDate ?? ""}
                  onChange={(event) => updateLiabilityDrawdownEvent(activeLiabilityDrawdown.eventId, (draft) => {
                    draft.drawdownDate = event.target.value || null;
                  })}
                />
              </label>
              <label>
                Funds to
                <select
                  className={styles.compactInput}
                  value={
                    activeLiabilityDrawdown.targetAssetId &&
                    activeLiabilityDrawdownCashAssets.some((asset) => asset.assetId === activeLiabilityDrawdown.targetAssetId)
                      ? activeLiabilityDrawdown.targetAssetId
                      : ""
                  }
                  onChange={(event) => updateLiabilityDrawdownEvent(activeLiabilityDrawdown.eventId, (draft) => {
                    draft.targetAssetId = event.target.value || null;
                  })}
                >
                  <option value="">Select cash account</option>
                  {activeLiabilityDrawdownCashAssets.map((asset) => (
                    <option key={asset.assetId} value={asset.assetId}>
                      {asset.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Drawdown amount
                {renderCurrencyInput({
                  value: activeLiabilityDrawdown.amount,
                  onChange: (value) => updateLiabilityDrawdownEvent(activeLiabilityDrawdown.eventId, (draft) => {
                    draft.amount = value;
                  }),
                })}
              </label>
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setActiveLiabilityDrawdownModalId(null)}>
                Save
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => deleteLiabilityDrawdownEvent(activeLiabilityDrawdown.eventId)}
              >
                Delete drawdown
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {activeLiabilityPayment ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setActiveLiabilityPaymentModalId(null)}>
          <section
            className={styles.modalPanel}
            role="dialog"
            aria-modal="true"
            aria-label="Liability payment"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>Assets and liabilities</p>
                <h3>Liability payment</h3>
              </div>
            </div>
            <div className={styles.modalGrid}>
              <label>
                Strategy
                <input
                  className={styles.compactInput}
                  value={activeLiabilityPayment.label}
                  onChange={(event) => updateLiabilityPaymentEvent(activeLiabilityPayment.eventId, (draft) => {
                    draft.label = event.target.value;
                  })}
                />
              </label>
              <label>
                Liability
                <input
                  className={styles.compactInput}
                  value={activeLiabilityPaymentLiability?.name ?? "Selected liability"}
                  readOnly
                />
              </label>
              <label>
                Payment date
                <input
                  type="date"
                  className={styles.compactInput}
                  value={activeLiabilityPayment.paymentDate ?? ""}
                  onChange={(event) => updateLiabilityPaymentEvent(activeLiabilityPayment.eventId, (draft) => {
                    draft.paymentDate = event.target.value || null;
                  })}
                />
              </label>
              <label>
                Pay from
                <select
                  className={styles.compactInput}
                  value={
                    activeLiabilityPayment.sourceAssetId &&
                    activeLiabilityPaymentCashAssets.some((asset) => asset.assetId === activeLiabilityPayment.sourceAssetId)
                      ? activeLiabilityPayment.sourceAssetId
                      : ""
                  }
                  onChange={(event) => updateLiabilityPaymentEvent(activeLiabilityPayment.eventId, (draft) => {
                    draft.sourceAssetId = event.target.value || null;
                  })}
                >
                  <option value="">Select cash account</option>
                  {activeLiabilityPaymentCashAssets.map((asset) => (
                    <option key={asset.assetId} value={asset.assetId}>
                      {asset.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Amount
                <select
                  className={styles.compactInput}
                  value={activeLiabilityPayment.amountMode}
                  onChange={(event) => updateLiabilityPaymentEvent(activeLiabilityPayment.eventId, (draft) => {
                    draft.amountMode = event.target.value as ProjectionScenario["liabilityPaymentEvents"][number]["amountMode"];
                  })}
                >
                  <option value="full-balance">Full balance</option>
                  <option value="fixed-amount">Fixed amount</option>
                </select>
              </label>
              {activeLiabilityPayment.amountMode === "fixed-amount" ? (
                <label>
                  Fixed amount
                  {renderCurrencyInput({
                    value: activeLiabilityPayment.fixedAmount ?? 0,
                    onChange: (value) => updateLiabilityPaymentEvent(activeLiabilityPayment.eventId, (draft) => {
                      draft.fixedAmount = value;
                    }),
                  })}
                </label>
              ) : null}
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setActiveLiabilityPaymentModalId(null)}>
                Save
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => deleteLiabilityPaymentEvent(activeLiabilityPayment.eventId)}
              >
                Delete payment
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {activePensionWithdrawal ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setActivePensionWithdrawalModalId(null)}>
          <section
            className={styles.modalPanel}
            role="dialog"
            aria-modal="true"
            aria-label="Pension lump sum withdrawal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>Pensions</p>
                <h3>Lump sum withdrawal</h3>
              </div>
            </div>
            <div className={styles.modalGrid}>
              <label>
                Strategy
                <input
                  className={styles.compactInput}
                  value={activePensionWithdrawal.label}
                  onChange={(event) => updatePensionWithdrawalEvent(activePensionWithdrawal.eventId, (draft) => {
                    draft.label = event.target.value;
                  })}
                />
              </label>
              <label>
                Pension account
                <input
                  className={styles.compactInput}
                  value={activePensionWithdrawalAccount?.productName ?? "Selected pension account"}
                  readOnly
                />
              </label>
              <label>
                Withdrawal date
                <input
                  type="date"
                  className={styles.compactInput}
                  value={activePensionWithdrawal.withdrawalDate ?? ""}
                  onChange={(event) => updatePensionWithdrawalEvent(activePensionWithdrawal.eventId, (draft) => {
                    draft.withdrawalDate = event.target.value || null;
                  })}
                />
              </label>
              <label>
                Pay to
                <select
                  className={styles.compactInput}
                  value={
                    activePensionWithdrawal.targetAssetId &&
                    activePensionWithdrawalCashAssets.some((asset) => asset.assetId === activePensionWithdrawal.targetAssetId)
                      ? activePensionWithdrawal.targetAssetId
                      : ""
                  }
                  onChange={(event) => updatePensionWithdrawalEvent(activePensionWithdrawal.eventId, (draft) => {
                    draft.targetAssetId = event.target.value || null;
                  })}
                >
                  <option value="">Select cash account</option>
                  {activePensionWithdrawalCashAssets.map((asset) => (
                    <option key={asset.assetId} value={asset.assetId}>
                      {asset.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Amount
                <select
                  className={styles.compactInput}
                  value={activePensionWithdrawal.amountMode}
                  onChange={(event) => updatePensionWithdrawalEvent(activePensionWithdrawal.eventId, (draft) => {
                    draft.amountMode = event.target.value as ProjectionScenario["pensionWithdrawalEvents"][number]["amountMode"];
                  })}
                >
                  <option value="fixed-amount">Fixed amount</option>
                  <option value="full-balance">Full balance</option>
                </select>
              </label>
              {activePensionWithdrawal.amountMode === "fixed-amount" ? (
                <label>
                  Fixed amount
                  {renderCurrencyInput({
                    value: activePensionWithdrawal.fixedAmount ?? 0,
                    onChange: (value) => updatePensionWithdrawalEvent(activePensionWithdrawal.eventId, (draft) => {
                      draft.fixedAmount = value;
                    }),
                  })}
                </label>
              ) : null}
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setActivePensionWithdrawalModalId(null)}>
                Save
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => deletePensionWithdrawalEvent(activePensionWithdrawal.eventId)}
              >
                Delete withdrawal
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {activeSuperStrategy ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setActiveSuperStrategyModalId(null)}>
          <section
            className={styles.modalPanel}
            role="dialog"
            aria-modal="true"
            aria-label="Contribution strategy"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>Superannuation</p>
                <h3>Contribution strategy</h3>
              </div>
            </div>
            <div className={styles.modalGrid}>
              <label>
                Strategy
                <input
                  className={styles.compactInput}
                  value={activeSuperStrategy.label}
                  onChange={(event) => updateSuperContributionStrategy(activeSuperStrategy.strategyId, (draft) => {
                    draft.label = event.target.value;
                  })}
                />
              </label>
              <label>
                Owner
                <input
                  className={styles.compactInput}
                  value={activeSuperStrategyOwnerName}
                  readOnly
                />
              </label>
              <label>
                Target account
                <input
                  className={styles.compactInput}
                  value={activeSuperStrategyTargetAccount?.productName ?? "Selected super account"}
                  readOnly
                />
              </label>
              <label>
                Annual amount
                {renderCurrencyInput({
                  value: activeSuperStrategy.annualAmount,
                  onChange: (value) => updateSuperContributionStrategy(activeSuperStrategy.strategyId, (draft) => {
                    draft.annualAmount = value;
                  }),
                })}
              </label>
              <label>
                Type
                <select
                  className={styles.compactInput}
                  value={activeSuperStrategy.contributionType}
                  onChange={(event) => updateSuperContributionStrategy(activeSuperStrategy.strategyId, (draft) => {
                    draft.contributionType = event.target.value as ProjectionScenario["superContributionStrategies"][number]["contributionType"];
                  })}
                >
                  <option value="concessional">Concessional</option>
                  <option value="non-concessional">Non-concessional</option>
                </select>
              </label>
              <label>
                Start date
                <input
                  type="date"
                  className={styles.compactInput}
                  value={activeSuperStrategy.startDate ?? ""}
                  onChange={(event) => updateSuperContributionStrategy(activeSuperStrategy.strategyId, (draft) => {
                    draft.startDate = event.target.value || null;
                  })}
                />
              </label>
              <label>
                End date
                <input
                  type="date"
                  className={styles.compactInput}
                  value={activeSuperStrategy.endDate ?? ""}
                  onChange={(event) => updateSuperContributionStrategy(activeSuperStrategy.strategyId, (draft) => {
                    draft.endDate = event.target.value || null;
                  })}
                />
              </label>
              <label className={styles.checkboxField}>
                <input
                  type="checkbox"
                  checked={activeSuperStrategy.indexedToCpi}
                  onChange={(event) => updateSuperContributionStrategy(activeSuperStrategy.strategyId, (draft) => {
                    draft.indexedToCpi = event.target.checked;
                  })}
                />
                Indexed
              </label>
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setActiveSuperStrategyModalId(null)}>
                Save
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => deleteSuperContributionStrategy(activeSuperStrategy.strategyId)}
              >
                Delete strategy
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {activeSuperRollover ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setActiveSuperRolloverModalId(null)}>
          <section
            className={styles.modalPanel}
            role="dialog"
            aria-modal="true"
            aria-label="Rollover event"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>Superannuation</p>
                <h3>Rollover event</h3>
              </div>
            </div>
            <div className={styles.modalGrid}>
              <label>
                Strategy
                <input
                  className={styles.compactInput}
                  value={activeSuperRollover.label ?? ""}
                  onChange={(event) => updateSuperRolloverEvent(activeSuperRollover.eventId, (draft) => {
                    draft.label = event.target.value;
                  })}
                />
              </label>
              <label>
                Source account
                <input
                  className={styles.compactInput}
                  value={activeSuperRolloverSourceAccount?.productName ?? "Selected super account"}
                  readOnly
                />
              </label>
              <label>
                Destination
                <select
                  className={styles.compactInput}
                  value={activeSuperRolloverDestinationAccountId}
                  onChange={(event) => updateSuperRolloverEvent(activeSuperRollover.eventId, (draft) => {
                    draft.destinationAccountId = event.target.value || null;
                  })}
                >
                  <option value="">New pension account</option>
                  {activeSuperRolloverDestinationAccounts.map((account) => (
                    <option key={account.accountId} value={account.accountId}>
                      {account.productName}
                    </option>
                  ))}
                </select>
              </label>
              {activeSuperRolloverCreatesNewPension ? (
                <label>
                  New pension name
                  <input
                    className={styles.compactInput}
                    value={activeSuperRollover.destinationPensionName ?? ""}
                    onChange={(event) => updateSuperRolloverEvent(activeSuperRollover.eventId, (draft) => {
                      draft.destinationPensionName = event.target.value;
                    })}
                  />
                </label>
              ) : null}
              <label>
                Rollover date
                <input
                  type="date"
                  className={styles.compactInput}
                  value={activeSuperRollover.rolloverDate ?? ""}
                  onChange={(event) => updateSuperRolloverEvent(activeSuperRollover.eventId, (draft) => {
                    draft.rolloverDate = event.target.value || null;
                  })}
                />
              </label>
              <label>
                Amount
                <select
                  className={styles.compactInput}
                  value={activeSuperRollover.amountMode}
                  onChange={(event) => updateSuperRolloverEvent(activeSuperRollover.eventId, (draft) => {
                    draft.amountMode = event.target.value as ProjectionScenario["superRolloverEvents"][number]["amountMode"];
                  })}
                >
                  <option value="full-balance">Full balance</option>
                  <option value="fixed-amount">Fixed amount</option>
                </select>
              </label>
              {activeSuperRollover.amountMode === "fixed-amount" ? (
                <label>
                  Fixed amount
                  {renderCurrencyInput({
                    value: activeSuperRollover.fixedAmount ?? 0,
                    onChange: (value) => updateSuperRolloverEvent(activeSuperRollover.eventId, (draft) => {
                      draft.fixedAmount = value;
                    }),
                  })}
                </label>
              ) : null}
              {activeSuperRolloverCreatesNewPension ? (
                <>
                  <label>
                    Pension payment
                    {renderCurrencyInput({
                      value: activeSuperRollover.annualDrawdown ?? 0,
                      onChange: (value) => updateSuperRolloverEvent(activeSuperRollover.eventId, (draft) => {
                        draft.annualDrawdown = value;
                      }),
                    })}
                  </label>
                  <label className={styles.checkboxField}>
                    <input
                      type="checkbox"
                      checked={activeSuperRollover.drawdownIndexedToCpi ?? false}
                      onChange={(event) => updateSuperRolloverEvent(activeSuperRollover.eventId, (draft) => {
                        draft.drawdownIndexedToCpi = event.target.checked;
                      })}
                    />
                    Indexed
                  </label>
                </>
              ) : null}
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setActiveSuperRolloverModalId(null)}>
                Save
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => deleteSuperRolloverEvent(activeSuperRollover.eventId)}
              >
                Delete rollover
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default function ProjectionsPage() {
  return (
    <Suspense fallback={<div className={styles.loadingState}>Loading projections...</div>}>
      <ProjectionsPageContent />
    </Suspense>
  );
}
