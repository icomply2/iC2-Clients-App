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

export type FileNoteAttachmentMeta = NonNullable<FileNoteRecord["attachment"]>[number];

export type FileNoteInput = {
  id?: string | null;
  clientId: string;
  ownerId: string;
  ownerName: string;
  licensee?: string | null;
  practice?: string | null;
  adviserId?: string | null;
  adviserName?: string | null;
  adviserEmail?: string | null;
  subject: string;
  content: string;
  serviceDate: string;
  type: string;
  subType: string;
  joint?: boolean | null;
  attachment?: FileNoteRecord["attachment"];
  files?: File[];
  creatorId?: string | null;
  creatorName?: string | null;
  creatorEmail?: string | null;
  modifierId?: string | null;
  modifierName?: string | null;
  modifierEmail?: string | null;
  modifiedDate?: string | null;
  createdDate?: string | null;
};

export type FileNotePayload = {
  id?: string | null;
  clientId: string;
  owner: {
    id: string;
    name: string;
  };
  joint: boolean;
  licensee?: string | null;
  practice?: string | null;
  adviser?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
  content: string;
  serviceDate: string;
  type: string;
  subType: string;
  subject: string;
  creator?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
  modifier?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
  modifiedDate?: string | null;
  createdDate?: string | null;
  attachment?: FileNoteRecord["attachment"];
  files?: File[];
};

export type FileNoteTypeOption = (typeof FILE_NOTE_TYPE_OPTIONS)[number];
