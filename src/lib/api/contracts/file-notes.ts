import type { FileNoteRecord } from "@/lib/api/types";

export const FILE_NOTE_TYPE_OPTIONS = [
  "Client Meeting",
  "Phone Call",
  "Email",
  "Review",
  "Advice",
  "Administration",
  "Other",
] as const;

export const FILE_NOTE_SUBTYPE_OPTIONS: Record<string, string[]> = {
  "Client Meeting": ["Initial Meeting", "Review Meeting", "Strategy Meeting", "Implementation Meeting"],
  "Phone Call": ["Inbound", "Outbound", "Follow Up"],
  Email: ["Client Email", "Adviser Email", "Provider Email"],
  Review: ["Annual Review", "Portfolio Review", "FDS Review"],
  Advice: ["SOA", "ROA", "Strategy Note"],
  Administration: ["Task Update", "Document Request", "Compliance"],
  Other: ["General"],
};

export type FileNoteInput = {
  id?: string | null;
  clientId: string;
  ownerId: string;
  ownerName: string;
  licensee?: string | null;
  practice?: string | null;
  adviserName?: string | null;
  adviserEmail?: string | null;
  subject: string;
  content: string;
  serviceDate: string;
  type: string;
  subType: string;
  joint?: boolean | null;
  attachment?: FileNoteRecord["attachment"];
};

export type FileNotePayload = {
  request: FileNoteRecord;
};

export type FileNoteTypeOption = (typeof FILE_NOTE_TYPE_OPTIONS)[number];
