import type {
  ProductRexComparisonColumnV1,
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
  "Admin Fee (Floating)",
  "Expense Recovery Fee (Flat)",
  "Expense Recovery Fee (Floating)",
  "ORR Levy",
  "Transactional Costs",
  "Buy/Sell Fees",
  "Net Ongoing Cost",
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
  const likeForLikeIndex = findContainsIndex(lines, "Like for Like Fee Comparison");
  const productComparisonIndex = findContainsIndex(lines, "Product Comparison");
  const markerIndex =
    likeForLikeIndex >= 0 && productComparisonIndex >= 0
      ? Math.min(likeForLikeIndex, productComparisonIndex)
      : Math.max(likeForLikeIndex, productComparisonIndex);
  if (markerIndex < 0) {
    return {
      rows: [] as ProductRexFeeComparisonRowV1[],
      currentPlatform: null,
      recommendedPlatform: null,
      alternativePlatform: null,
      columns: [] as ProductRexComparisonColumnV1[],
    };
  }

  const endIndex = nextMarkerIndex(lines, markerIndex, [
    "Reasons for Replacement",
    "Like for Like Fee Comparison",
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
  const statusIndex = sectionLines.findIndex((line) => line === "Status");
  const productIndex = sectionLines.findIndex((line, index) => index > statusIndex && line === "Product");
  const statusValues =
    statusIndex >= 0 && productIndex > statusIndex
      ? sectionLines.slice(statusIndex + 1, productIndex)
      : ["Current", "Recommended", "Alternative"];
  const columnCount = Math.max(statusValues.length, 3);

  for (let index = 0; index < sectionLines.length; index += 1) {
    const line = sectionLines[index];
    if (!FEE_COMPARISON_ROW_LABELS.has(line)) {
      continue;
    }

    const values = sectionLines.slice(index + 1, index + 1 + columnCount).map((value) => value ?? null);
    const currentValue = values.find((_, valueIndex) => statusValues[valueIndex]?.toLowerCase() === "current") ?? values[0] ?? null;
    const recommendedValue =
      values.find((_, valueIndex) => statusValues[valueIndex]?.toLowerCase() === "recommended") ?? values[1] ?? null;
    const alternativeValue =
      values.find((_, valueIndex) => statusValues[valueIndex]?.toLowerCase() === "alternative") ?? values[2] ?? null;

    if (line === "Product") {
      currentPlatform =
        values
          .filter((_, valueIndex) => statusValues[valueIndex]?.toLowerCase() === "current")
          .filter(Boolean)
          .join(" + ") || currentValue;
      recommendedPlatform = recommendedValue;
      alternativePlatform =
        values
          .filter((_, valueIndex) => statusValues[valueIndex]?.toLowerCase() === "alternative")
          .filter(Boolean)
          .join(" + ") || alternativeValue;
    }

    rows.push({
      rowId: makeId("productrex-fee-row"),
      label: line,
      currentValue,
      recommendedValue,
      alternativeValue,
      values,
    });

    index += columnCount;
  }

  const productRow = rows.find((row) => row.label === "Product");
  const balanceRow = rows.find((row) => row.label === "Account Balance");
  const columns = statusValues.map((status, index) => ({
    columnId: makeId("productrex-column"),
    status:
      status.toLowerCase() === "current"
        ? ("current" as const)
        : status.toLowerCase() === "recommended"
          ? ("recommended" as const)
          : status.toLowerCase() === "alternative"
            ? ("alternative" as const)
            : ("unknown" as const),
    productName: productRow?.values?.[index] ?? null,
    accountBalance: balanceRow?.values?.[index] ?? null,
  }));

  return { rows, currentPlatform, recommendedPlatform, alternativePlatform, columns };
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

function isCurrencyLike(value?: string | null) {
  return Boolean(value && /-?\$?\d[\d,]*(?:\.\d+)?/.test(value));
}

function inferOwnerName(fileName: string, lines: string[]) {
  const fileMatch = fileName.match(/ProductRex\s+for\s+(.+?)\s+Rol?lovers/i);
  if (fileMatch?.[1]) {
    return normalizeLine(fileMatch[1]);
  }

  const recommendationIndex = findContainsIndex(lines, "Product Recommendations");
  const candidates = lines
    .slice(0, recommendationIndex >= 0 ? recommendationIndex : 12)
    .filter((line) => /^[A-Z][A-Za-z' -]+$/.test(line) && !/^(Investment|Product|Recommendations|Leech)$/i.test(line));

  return candidates.at(-1) ?? null;
}

function parseHoldingsMovementSummary(lines: string[]) {
  const fundNameIndex = lines.findIndex((line, index) =>
    line === "Fund Name" &&
    lines[index + 1] === "Current" &&
    lines[index + 2] === "Change" &&
    lines[index + 3] === "Recommended",
  );

  if (fundNameIndex < 0) {
    return [] as ProductRexHoldingV1[];
  }

  const endIndex = nextMarkerIndex(lines, fundNameIndex, [
    "Reasons for Platform Recommendations",
    "Product Comparison",
    "Transaction Fee Summary",
    "Investment Summary",
    "Asset Allocation Tables",
  ]);
  const sectionLines = lines.slice(fundNameIndex + 4, endIndex);
  const holdings: ProductRexHoldingV1[] = [];
  let activePlatform: string | null = null;

  for (let index = 0; index < sectionLines.length; index += 1) {
    const line = sectionLines[index];

    if (!line || line === "Total") {
      if (line === "Total") {
        index += 3;
      }
      continue;
    }

    const nextOne = sectionLines[index + 1] ?? null;
    const nextTwo = sectionLines[index + 2] ?? null;
    const nextThree = sectionLines[index + 3] ?? null;

    if (line === "Subtotal") {
      index += 3;
      continue;
    }

    if (!isCurrencyLike(nextOne)) {
      activePlatform = line;
      continue;
    }

    holdings.push({
      holdingId: makeId("productrex-holding"),
      platformName: activePlatform,
      fundName: line,
      code: null,
      currentAmount: parseCurrency(nextOne),
      changeAmount: parseCurrency(nextTwo),
      proposedAmount: parseCurrency(nextThree),
      amount: parseCurrency(nextThree),
      investmentFeePct: null,
      investmentFeeAmount: null,
    });

    index += 3;
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
  const platformNames = feeComparison.columns.map((column) => column.productName);
  const movementHoldings = parseHoldingsMovementSummary(lines);
  const investmentHoldings = parseInvestmentSummary(lines, platformNames);
  const holdings = movementHoldings.length
    ? movementHoldings
    : investmentHoldings.filter(
        (holding) => !feeComparison.recommendedPlatform || holding.platformName === feeComparison.recommendedPlatform,
      );
  const transactionRows = parseTransactionSummary(lines, platformNames);
  const allocationRows = parseAllocationRows(lines);

  return {
    reportId: makeId("productrex-report"),
    sourceFileName: input.fileName,
    ownerName: inferOwnerName(input.fileName, lines),
    currentPlatform: feeComparison.currentPlatform,
    recommendedPlatform: feeComparison.recommendedPlatform,
    alternativePlatform: feeComparison.alternativePlatform,
    comparisonColumns: feeComparison.columns,
    replacementReasons: parseReasonsForReplacement(lines),
    platformComparisonRows: feeComparison.rows,
    recommendedHoldings: holdings,
    transactionRows,
    allocationRows,
    managedAccountFeeNotes: parseManagedAccountFeeNotes(lines),
    sourceExcerpt: lines.slice(0, 24).join("\n"),
    parsedAt: new Date().toISOString(),
  };
}
