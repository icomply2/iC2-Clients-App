export type RecommendationMarkdownBlock =
  | {
      type: "paragraph";
      text: string;
    }
  | {
      type: "table";
      headers: string[];
      rows: string[][];
    };

function isPipeRow(line: string) {
  const trimmed = line.trim();
  return trimmed.includes("|") && trimmed.split("|").filter((cell) => cell.trim()).length >= 2;
}

function splitPipeRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isSeparatorRow(line: string) {
  if (!isPipeRow(line)) return false;
  const cells = splitPipeRow(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function normalizeTableRows(headers: string[], rows: string[][]) {
  const width = headers.length;
  return rows.map((row) => {
    if (row.length === width) return row;
    if (row.length > width) return row.slice(0, width);
    return [...row, ...Array.from({ length: width - row.length }, () => "")];
  });
}

export function parseRecommendationMarkdown(text?: string | null): RecommendationMarkdownBlock[] {
  const lines = (text ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: RecommendationMarkdownBlock[] = [];
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    const paragraph = paragraphLines.join(" ").replace(/\s+/g, " ").trim();
    if (paragraph) {
      blocks.push({ type: "paragraph", text: paragraph });
    }
    paragraphLines = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const nextLine = lines[index + 1] ?? "";

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    if (isPipeRow(line) && isSeparatorRow(nextLine)) {
      const headers = splitPipeRow(line);
      const rows: string[][] = [];
      index += 2;

      while (index < lines.length && isPipeRow(lines[index] ?? "")) {
        rows.push(splitPipeRow(lines[index] ?? ""));
        index += 1;
      }

      index -= 1;
      flushParagraph();
      blocks.push({ type: "table", headers, rows: normalizeTableRows(headers, rows) });
      continue;
    }

    paragraphLines.push(line.trim());
  }

  flushParagraph();
  return blocks;
}
