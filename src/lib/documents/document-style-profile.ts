export type DocumentStyleProfile = {
  fontFamily: string;
  bodyTextColor: string;
  headingColor: string;
  tableHeaderColor: string;
};

export const DOCUMENT_STYLE_PROFILE_STORAGE_KEY = "finley-document-style-profile-v1";

export const DEFAULT_DOCUMENT_STYLE_PROFILE: DocumentStyleProfile = {
  fontFamily: "\"Titillium Web\", \"Segoe UI\", \"Helvetica Neue\", Arial, sans-serif",
  bodyTextColor: "#2F4A6D",
  headingColor: "#B3742A",
  tableHeaderColor: "#faf7eb",
};

export const DOCUMENT_FONT_OPTIONS = [
  { value: "\"Titillium Web\", \"Segoe UI\", \"Helvetica Neue\", Arial, sans-serif", label: "Titillium Web" },
  { value: "Calibri, \"Segoe UI\", Arial, sans-serif", label: "Calibri" },
  { value: "Arial, sans-serif", label: "Arial" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "'Times New Roman', serif", label: "Times New Roman" },
  { value: "Verdana, sans-serif", label: "Verdana" },
];

const DOCUMENT_FONT_VALUES = new Set(DOCUMENT_FONT_OPTIONS.map((option) => option.value));

export function normalizeHexColor(value: string | null | undefined, fallback: string) {
  const nextValue = value?.trim() ?? "";
  return /^#[0-9a-f]{6}$/i.test(nextValue) ? nextValue : fallback;
}

export function normalizeDocumentStyleProfile(
  value?: Partial<DocumentStyleProfile> | null,
): DocumentStyleProfile {
  return {
    fontFamily:
      value?.fontFamily && DOCUMENT_FONT_VALUES.has(value.fontFamily)
        ? value.fontFamily
        : DEFAULT_DOCUMENT_STYLE_PROFILE.fontFamily,
    bodyTextColor: normalizeHexColor(value?.bodyTextColor, DEFAULT_DOCUMENT_STYLE_PROFILE.bodyTextColor),
    headingColor: normalizeHexColor(value?.headingColor, DEFAULT_DOCUMENT_STYLE_PROFILE.headingColor),
    tableHeaderColor: normalizeHexColor(value?.tableHeaderColor, DEFAULT_DOCUMENT_STYLE_PROFILE.tableHeaderColor),
  };
}

export function getDocumentWordFontFamily(fontFamily?: string | null) {
  const normalized = normalizeDocumentStyleProfile({ fontFamily: fontFamily ?? undefined }).fontFamily;
  return DOCUMENT_FONT_OPTIONS.find((option) => option.value === normalized)?.label ?? "Titillium Web";
}

export function getWordHexColor(value: string | null | undefined, fallback: string) {
  return normalizeHexColor(value, fallback).replace("#", "").toUpperCase();
}
