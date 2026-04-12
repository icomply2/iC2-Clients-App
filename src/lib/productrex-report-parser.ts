import type {
  ProductRexAllocationRowV1,
  ProductRexFeeComparisonRowV1,
  ProductRexHoldingV1,
  ProductRexReportV1,
  ProductRexTransactionRowV1,
} from "@/lib/soa-types";

type ParseInput = {
  fileName: string;
  extractedText?: string | null;
};

const FEE_COMPARISON_ROW_LABELS = new Set([
  "Product",
  "Account Balance",
  "Investment Fee",
  "Sliding Admin Fee",
  "Admin Fee (Flat)",
  "Expense Recovery Fee (Flat)",
  "Expense Recovery Fee (Floating)",
  "Transactional Costs",
  "Buy/Sell Fees",
  "Net Ongoing Costs",
]);

const ALLOCATION_ROW_LABELS = new Set([
  "Cash",
  "Diversified Fixed Interest",
  "Australian Shares",
  "International Shares",
  "Property",
  "Alternative",
  "Total Defensive Assets",
  "Total Growth Assets",
]);

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeLine(line: string) {
  return line.replace(/\s+/g, " ").trim();
}

function toLines(text: string) {
  return text
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);
}

function findContainsIndex(lines: string[], marker: string) {
  return lines.findIndex((line) => line.toLowerCase().includes(marker.toLowerCase()));
}

function nextMarkerIndex(lines: string[], start: number, markers: string[]) {
  const nextIndices = markers
    .map((marker) => findContainsIndex(lines.slice(start + 1), marker))
    .filter((index) => index >= 0)
    .map((index) => start + 1 + index);

  return nextIndices.length ? Math.min(...nextIndices) : lines.length;
}

function parseCurrency(value?: string | null) {
  if (!value) return null;
  const cleaned = value.replace(/[$,%\s,]/g, "");
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function parsePercent(value?: string | null) {
  if (!value) return null;
  const match = value.match(/-?\d+(?:\.\d+)?(?=%)/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function parseFeeComparison(lines: string[]) {
  const markerIndex = findContainsIndex(lines, "Like for Like Fee Comparison");
  if (markerIndex < 0) {
    return {
      rows: [] as ProductRexFeeComparisonRowV1[],
      currentPlatform: null,
      recommendedPlatform: null,
      alternativePlatform: null,
    };
  }

  const endIndex = nextMarkerIndex(lines, markerIndex, [
    "Managed Account Transaction Fees",
    "Asset Allocation Tables",
    "Transaction Fee Summary",
    "Investment Summary",
  ]);
  const sectionLines = lines.slice(markerIndex, endIndex);
  const rows: ProductRexFeeComparisonRowV1[] = [];
  let currentPlatform: string | null = null;
  let recommendedPlatform: string | null = null;
  let alternativePlatform: string | null = null;

  for (let index = 0; index < sectionLines.length; index += 1) {
    const line = sectionLines[index];
    if (!FEE_COMPARISON_ROW_LABELS.has(line)) {
      continue;
    }

    const currentValue = sectionLines[index + 1] ?? null;
    const recommendedValue = sectionLines[index + 2] ?? null;
    const alternativeValue = sectionLines[index + 3] ?? null;

    if (line === "Product") {
      currentPlatform = currentValue;
      recommendedPlatform = recommendedValue;
      alternativePlatform = alternativeValue;
    }

    rows.push({
      rowId: makeId("productrex-fee-row"),
      label: line,
      currentValue,
      recommendedValue,
      alternativeValue,
    });

    index += 3;
  }

  return { rows, currentPlatform, recommendedPlatform, alternativePlatform };
}

function parseReasonsForReplacement(lines: string[]) {
  const markerIndex = findContainsIndex(lines, "Reasons for Replacement");
  if (markerIndex < 0) {
    return [] as string[];
  }

  const endIndex = nextMarkerIndex(lines, markerIndex, [
    "Like for Like Fee Comparison",
    "Product Comparison",
  ]);

  return lines
    .slice(markerIndex + 1, endIndex)
    .filter(
      (line) =>
        !/^I recommend the replacement advice above/i.test(line) &&
        !/^Reasons for Replacement$/i.test(line),
    );
}

function parseManagedAccountFeeNotes(lines: string[]) {
  const notes = lines.filter((line) => /Managed Account Transaction Fees/i.test(line) || /^- /.test(line));
  return notes;
}

function parseInvestmentSummary(
  lines: string[],
  platformNames: Array<string | null | undefined>,
) {
  const markerIndex = findContainsIndex(lines, "Investment Summary");
  if (markerIndex < 0) {
    return [] as ProductRexHoldingV1[];
  }

  const endIndex = nextMarkerIndex(lines, markerIndex, [
    "Reasons for Platform Recommendations",
    "Product Comparison",
    "Transaction Fee Summary",
    "Asset Allocation Tables",
  ]);
  const sectionLines = lines.slice(markerIndex + 1, endIndex);
  const knownPlatforms = platformNames.filter(Boolean) as string[];
  let activePlatform: string | null = null;
  const holdings: ProductRexHoldingV1[] = [];

  for (let index = 0; index < sectionLines.length; index += 1) {
    const line = sectionLines[index];

    if (
      ["The table below shows your current and the recommended investments and their investment fees:", "Fund Name", "Code", "Amount", "Investment Fee"].includes(line)
    ) {
      continue;
    }

    if (knownPlatforms.includes(line)) {
      activePlatform = line;
      continue;
    }

    if (line === "Subtotal") {
      index += 2;
      continue;
    }

    const fundName = line;
    const code = sectionLines[index + 1] ?? null;
    const amountText = sectionLines[index + 2] ?? null;
    const investmentFeePctText = sectionLines[index + 3] ?? null;
    const investmentFeeAmountText = sectionLines[index + 4] ?? null;

    if (!amountText?.includes("$")) {
      continue;
    }

    holdings.push({
      holdingId: makeId("productrex-holding"),
      platformName: activePlatform,
      fundName,
      code,
      amount: parseCurrency(amountText),
      investmentFeePct: parsePercent(investmentFeePctText),
      investmentFeeAmount: parseCurrency(investmentFeeAmountText),
    });

    index += 4;
  }

  return holdings;
}

function parseTransactionSummary(
  lines: string[],
  platformNames: Array<string | null | undefined>,
) {
  const markerIndex = findContainsIndex(lines, "Transaction Fee Summary");
  if (markerIndex < 0) {
    return [] as ProductRexTransactionRowV1[];
  }

  const endIndex = nextMarkerIndex(lines, markerIndex, [
    "Asset Allocation Tables",
    "Investment Summary",
    "Reasons for Platform Recommendations",
  ]);
  const sectionLines = lines.slice(markerIndex + 1, endIndex);
  const knownPlatforms = platformNames.filter(Boolean) as string[];
  let activePlatform: string | null = null;
  const rows: ProductRexTransactionRowV1[] = [];

  for (let index = 0; index < sectionLines.length; index += 1) {
    const line = sectionLines[index];

    if (
      ["The table below shows the transaction fees that will apply if you proceed with the recommendations in full:", "Fund Name", "Transaction", "Buy/Sell Spread", "Brokerage"].includes(line)
    ) {
      continue;
    }

    if (knownPlatforms.includes(line)) {
      activePlatform = line;
      continue;
    }

    if (line === "Subtotal") {
      index += 2;
      continue;
    }

    const fundName = line;
    const transactionAmountText = sectionLines[index + 1] ?? null;
    const buySellSpreadPctText = sectionLines[index + 2] ?? null;
    const buySellSpreadAmountText = sectionLines[index + 3] ?? null;
    const brokerageAmountText = sectionLines[index + 4] ?? null;

    if (!transactionAmountText?.includes("$")) {
      continue;
    }

    rows.push({
      transactionId: makeId("productrex-transaction"),
      platformName: activePlatform,
      fundName,
      transactionAmount: parseCurrency(transactionAmountText),
      buySellSpreadPct: parsePercent(buySellSpreadPctText),
      buySellSpreadAmount: parseCurrency(buySellSpreadAmountText),
      brokerageAmount: parseCurrency(brokerageAmountText),
    });

    index += 4;
  }

  return rows;
}

function parseAllocationRows(lines: string[]) {
  const markerIndex = findContainsIndex(lines, "Asset Allocation Tables");
  if (markerIndex < 0) {
    return [] as ProductRexAllocationRowV1[];
  }

  const endIndex = nextMarkerIndex(lines, markerIndex, ["Investment Summary", "Transaction Fee Summary"]);
  const sectionLines = lines.slice(markerIndex + 1, endIndex);
  const rows: ProductRexAllocationRowV1[] = [];

  for (let index = 0; index < sectionLines.length; index += 1) {
    const line = sectionLines[index];
    if (!ALLOCATION_ROW_LABELS.has(line)) {
      continue;
    }

    rows.push({
      rowId: makeId("productrex-allocation"),
      assetClass: line,
      currentPct: parsePercent(sectionLines[index + 1]),
      riskProfilePct: parsePercent(sectionLines[index + 2]),
      recommendedPct: parsePercent(sectionLines[index + 3]),
      variancePct: parsePercent(sectionLines[index + 4]),
    });

    index += 4;
  }

  return rows;
}

export function isLikelyProductRexReport(input: ParseInput) {
  const name = input.fileName.toLowerCase();
  const text = input.extractedText?.toLowerCase() ?? "";

  return (
    name.includes("productrex") ||
    text.includes("investment product recommendations") ||
    text.includes("like for like fee comparison") ||
    text.includes("asset allocation tables")
  );
}

export function parseProductRexReport(input: ParseInput): ProductRexReportV1 | null {
  const extractedText = input.extractedText?.trim();
  if (!extractedText || !isLikelyProductRexReport(input)) {
    return null;
  }

  const lines = toLines(extractedText);
  const feeComparison = parseFeeComparison(lines);
  const holdings = parseInvestmentSummary(lines, [
    feeComparison.currentPlatform,
    feeComparison.recommendedPlatform,
    feeComparison.alternativePlatform,
  ]);
  const transactionRows = parseTransactionSummary(lines, [
    feeComparison.currentPlatform,
    feeComparison.recommendedPlatform,
    feeComparison.alternativePlatform,
  ]);
  const allocationRows = parseAllocationRows(lines);

  return {
    reportId: makeId("productrex-report"),
    sourceFileName: input.fileName,
    currentPlatform: feeComparison.currentPlatform,
    recommendedPlatform: feeComparison.recommendedPlatform,
    alternativePlatform: feeComparison.alternativePlatform,
    replacementReasons: parseReasonsForReplacement(lines),
    platformComparisonRows: feeComparison.rows,
    recommendedHoldings: holdings.filter(
      (holding) => !feeComparison.recommendedPlatform || holding.platformName === feeComparison.recommendedPlatform,
    ),
    transactionRows: transactionRows.filter(
      (row) => !feeComparison.recommendedPlatform || row.platformName === feeComparison.recommendedPlatform,
    ),
    allocationRows,
    managedAccountFeeNotes: parseManagedAccountFeeNotes(lines),
    sourceExcerpt: lines.slice(0, 24).join("\n"),
    parsedAt: new Date().toISOString(),
  };
}
