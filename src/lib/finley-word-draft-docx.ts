import JSZip from "jszip";
import {
  DEFAULT_DOCUMENT_STYLE_PROFILE,
  getDocumentWordFontFamily,
  getWordHexColor,
  normalizeDocumentStyleProfile,
  type DocumentStyleProfile,
} from "@/lib/documents/document-style-profile";

export const FINLEY_WORD_DRAFT_DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type BuildFinleyWordDraftDocxInput = {
  title: string;
  content: string;
  createdAt?: string | null;
  documentStyleProfile?: Partial<DocumentStyleProfile> | null;
};

type ParsedDraftLine =
  | { kind: "heading1"; text: string }
  | { kind: "heading2"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "blank" };

export async function buildFinleyWordDraftDocx(input: BuildFinleyWordDraftDocxInput) {
  const style = normalizeDocumentStyleProfile(input.documentStyleProfile ?? DEFAULT_DOCUMENT_STYLE_PROFILE);
  const fontFamily = getDocumentWordFontFamily(style.fontFamily);
  const bodyColor = getWordHexColor(style.bodyTextColor, DEFAULT_DOCUMENT_STYLE_PROFILE.bodyTextColor);
  const headingColor = getWordHexColor(style.headingColor, DEFAULT_DOCUMENT_STYLE_PROFILE.headingColor);
  const tableHeaderColor = getWordHexColor(style.tableHeaderColor, DEFAULT_DOCUMENT_STYLE_PROFILE.tableHeaderColor);
  const title = cleanText(input.title) || "Finley Draft";
  const createdAt = cleanText(input.createdAt) || new Intl.DateTimeFormat("en-AU").format(new Date());
  const paragraphs = parseMarkdownishContent(input.content).map((line) =>
    buildParagraphXml(line, { fontFamily, bodyColor, headingColor }),
  );

  const zip = new JSZip();
  zip.file("[Content_Types].xml", buildContentTypesXml());
  zip.folder("_rels")?.file(".rels", buildRelsXml());
  const word = zip.folder("word");
  word?.file("document.xml", buildDocumentXml({ title, createdAt, paragraphs }));
  word?.file("styles.xml", buildStylesXml({ fontFamily, bodyColor, headingColor, tableHeaderColor }));

  return zip.generateAsync({ type: "uint8array" });
}

function buildDocumentXml({
  title,
  createdAt,
  paragraphs,
}: {
  title: string;
  createdAt: string;
  paragraphs: string[];
}) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${buildParagraphXml({ kind: "heading1", text: title }, { fontFamily: "", bodyColor: "", headingColor: "" })}
    ${buildParagraphXml({ kind: "paragraph", text: `Prepared ${createdAt}` }, { fontFamily: "", bodyColor: "", headingColor: "" })}
    ${paragraphs.join("\n")}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function buildParagraphXml(
  line: ParsedDraftLine,
  style: { fontFamily: string; bodyColor: string; headingColor: string },
) {
  if (line.kind === "blank") {
    return "<w:p/>";
  }

  const text = line.kind === "bullet" ? `- ${line.text}` : line.text;
  const styleId = line.kind === "heading1" ? "Heading1" : line.kind === "heading2" ? "Heading2" : "Normal";
  const size = line.kind === "heading1" ? "32" : line.kind === "heading2" ? "24" : "22";
  const color =
    line.kind === "heading1" || line.kind === "heading2"
      ? style.headingColor || getWordHexColor(DEFAULT_DOCUMENT_STYLE_PROFILE.headingColor, "#B3742A")
      : style.bodyColor || getWordHexColor(DEFAULT_DOCUMENT_STYLE_PROFILE.bodyTextColor, "#2F4A6D");
  const font = style.fontFamily || getDocumentWordFontFamily(DEFAULT_DOCUMENT_STYLE_PROFILE.fontFamily);
  const bold = line.kind === "heading1" || line.kind === "heading2" ? "<w:b/>" : "";

  return `<w:p>
    <w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>
    <w:r>
      <w:rPr>
        ${bold}
        <w:rFonts w:ascii="${escapeXml(font)}" w:hAnsi="${escapeXml(font)}"/>
        <w:color w:val="${color}"/>
        <w:sz w:val="${size}"/>
      </w:rPr>
      <w:t xml:space="preserve">${escapeXml(stripSimpleMarkdown(text))}</w:t>
    </w:r>
  </w:p>`;
}

function buildStylesXml({
  fontFamily,
  bodyColor,
  headingColor,
  tableHeaderColor,
}: {
  fontFamily: string;
  bodyColor: string;
  headingColor: string;
  tableHeaderColor: string;
}) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="${escapeXml(fontFamily)}" w:hAnsi="${escapeXml(fontFamily)}"/>
        <w:color w:val="${bodyColor}"/>
        <w:sz w:val="22"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr>
      <w:rFonts w:ascii="${escapeXml(fontFamily)}" w:hAnsi="${escapeXml(fontFamily)}"/>
      <w:color w:val="${bodyColor}"/>
      <w:sz w:val="22"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:rPr>
      <w:b/>
      <w:rFonts w:ascii="${escapeXml(fontFamily)}" w:hAnsi="${escapeXml(fontFamily)}"/>
      <w:color w:val="${headingColor}"/>
      <w:sz w:val="32"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:rPr>
      <w:b/>
      <w:rFonts w:ascii="${escapeXml(fontFamily)}" w:hAnsi="${escapeXml(fontFamily)}"/>
      <w:color w:val="${headingColor}"/>
      <w:sz w:val="24"/>
    </w:rPr>
  </w:style>
  <w:style w:type="table" w:default="1" w:styleId="TableNormal">
    <w:name w:val="Normal Table"/>
    <w:tblPr>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:color="${tableHeaderColor}"/>
        <w:left w:val="single" w:sz="4" w:color="${tableHeaderColor}"/>
        <w:bottom w:val="single" w:sz="4" w:color="${tableHeaderColor}"/>
        <w:right w:val="single" w:sz="4" w:color="${tableHeaderColor}"/>
        <w:insideH w:val="single" w:sz="4" w:color="${tableHeaderColor}"/>
        <w:insideV w:val="single" w:sz="4" w:color="${tableHeaderColor}"/>
      </w:tblBorders>
    </w:tblPr>
  </w:style>
</w:styles>`;
}

function buildContentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;
}

function buildRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
}

function parseMarkdownishContent(content: string): ParsedDraftLine[] {
  return content.split(/\r?\n/).map((rawLine) => {
    const line = rawLine.trim();
    if (!line) return { kind: "blank" };
    if (line.startsWith("## ")) return { kind: "heading1", text: line.slice(3).trim() };
    if (line.startsWith("### ")) return { kind: "heading2", text: line.slice(4).trim() };
    if (line.startsWith("- ")) return { kind: "bullet", text: line.slice(2).trim() };
    if (line.startsWith("• ")) return { kind: "bullet", text: line.slice(2).trim() };
    return { kind: "paragraph", text: line };
  });
}

function stripSimpleMarkdown(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
