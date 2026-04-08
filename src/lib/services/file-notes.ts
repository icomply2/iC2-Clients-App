import type { FileNoteRecord } from "@/lib/api/types";
import type { FileNoteInput, FileNotePayload } from "@/lib/api/contracts/file-notes";
import {
  createFileNote as createFileNoteRequest,
  deleteFileNote as deleteFileNoteRequest,
  listFileNotes as listFileNotesRequest,
  updateFileNote as updateFileNoteRequest,
} from "@/lib/api/adapters/file-notes";

type RequestContext = {
  origin?: string | null;
  cookieHeader?: string | null;
};

export function buildFileNotePayload(input: FileNoteInput): FileNotePayload {
  return {
    request: {
      id: input.id ?? null,
      clientId: input.clientId,
      owner: {
        id: input.ownerId,
        name: input.ownerName,
      },
      joint: input.joint ?? false,
      licensee: input.licensee ?? null,
      practice: input.practice ?? null,
      adviser: input.adviserName || input.adviserEmail
        ? {
            name: input.adviserName ?? null,
            email: input.adviserEmail ?? null,
          }
        : null,
      content: input.content,
      serviceDate: input.serviceDate,
      type: input.type,
      subType: input.subType,
      subject: input.subject,
      attachment: input.attachment ?? [],
    } satisfies FileNoteRecord,
  };
}

export async function createFileNote(input: FileNoteInput, context?: RequestContext) {
  return createFileNoteRequest(buildFileNotePayload(input), context);
}

export async function updateFileNote(id: string, input: FileNoteInput, context?: RequestContext) {
  return updateFileNoteRequest(id, buildFileNotePayload({ ...input, id }), context);
}

export async function listFileNotes(clientId: string, context?: RequestContext) {
  return listFileNotesRequest(clientId, context);
}

export async function deleteFileNote(id: string, context?: RequestContext) {
  return deleteFileNoteRequest(id, context);
}
