import type { FileNoteRecord } from "@/lib/api/types";

const STORAGE_KEY = "ic2-file-note-attachments";

type FileNoteLike = {
  id?: string | null;
  clientId?: string | null;
  subject?: string | null;
  serviceDate?: string | null;
  type?: string | null;
  subType?: string | null;
  content?: string | null;
  attachment?: FileNoteRecord["attachment"];
};

type CachedFileNoteAttachmentEntry = {
  noteId: string | null;
  clientId: string;
  fingerprint: string;
  attachment: NonNullable<FileNoteRecord["attachment"]>;
  updatedAt: string;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeValue(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function normalizeDate(value?: string | null) {
  if (!value) return "";

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[2].padStart(2, "0")}-${slashMatch[1].padStart(2, "0")}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return normalizeValue(value);
  }

  return parsed.toISOString().slice(0, 10);
}

function buildFingerprint(note: FileNoteLike) {
  return [
    normalizeValue(note.clientId),
    normalizeDate(note.serviceDate),
    normalizeValue(note.type),
    normalizeValue(note.subType),
    normalizeValue(note.subject),
    normalizeValue(note.content),
  ].join("|");
}

function readEntries(): CachedFileNoteAttachmentEntry[] {
  if (!canUseStorage()) return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as CachedFileNoteAttachmentEntry[] | null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: CachedFileNoteAttachmentEntry[]) {
  if (!canUseStorage()) return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 100)));
  } catch {
    // Ignore storage write failures.
  }
}

function hasAttachmentData(attachment?: FileNoteRecord["attachment"]) {
  return Array.isArray(attachment) && attachment.some((item) => item?.name || item?.url);
}

export function cacheFileNoteAttachments(note: FileNoteLike) {
  if (!note.clientId || !hasAttachmentData(note.attachment)) return;

  const nextEntry: CachedFileNoteAttachmentEntry = {
    noteId: note.id ?? null,
    clientId: String(note.clientId),
    fingerprint: buildFingerprint(note),
    attachment: (note.attachment ?? []).filter((item) => item?.name || item?.url),
    updatedAt: new Date().toISOString(),
  };

  const current = readEntries();
  const filtered = current.filter(
    (entry) =>
      !(entry.noteId && nextEntry.noteId && entry.noteId === nextEntry.noteId)
      && !(entry.clientId === nextEntry.clientId && entry.fingerprint === nextEntry.fingerprint),
  );

  writeEntries([nextEntry, ...filtered]);
}

export function mergeCachedFileNoteAttachments(clientId: string, notes: FileNoteRecord[]) {
  if (!clientId || !notes.length) return notes;

  const entries = readEntries().filter((entry) => entry.clientId === clientId);
  if (!entries.length) return notes;

  const now = Date.now();
  const freshEntries = entries.filter((entry) => now - new Date(entry.updatedAt).getTime() < 1000 * 60 * 60 * 24 * 14);
  if (freshEntries.length !== entries.length) {
    const otherEntries = readEntries().filter((entry) => entry.clientId !== clientId);
    writeEntries([...freshEntries, ...otherEntries]);
  }

  return notes.map((note) => {
    if (hasAttachmentData(note.attachment)) {
      return note;
    }

    const fingerprint = buildFingerprint(note);
    const match = freshEntries.find((entry) => (note.id && entry.noteId === note.id) || entry.fingerprint === fingerprint);
    if (!match) {
      return note;
    }

    return {
      ...note,
      attachment: match.attachment,
    };
  });
}
