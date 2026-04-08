import type { ApiResult, FileNoteRecord } from "@/lib/api/types";
import type { FileNotePayload } from "@/lib/api/contracts/file-notes";

type RequestContext = {
  origin?: string | null;
  cookieHeader?: string | null;
};

function parseResponseBody<T>(responseText: string) {
  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(responseText) as
      | ApiResult<T>
      | { message?: string | null; modelErrors?: { errorMessage?: string | null }[] | null };
  } catch {
    return null;
  }
}

function getErrorMessage(
  result: ReturnType<typeof parseResponseBody<FileNoteRecord[] | FileNoteRecord>>,
  responseText: string,
  fallback: string,
  status: number,
) {
  const modelError =
    result && "modelErrors" in result && Array.isArray(result.modelErrors)
      ? result.modelErrors.find((entry) => entry?.errorMessage)?.errorMessage
      : null;

  return modelError ?? (result && "message" in result && result.message ? result.message : responseText || `${fallback} (status ${status}).`);
}

function resolveUrl(path: string, context?: RequestContext) {
  return context?.origin ? `${context.origin}${path}` : path;
}

function buildHeaders(context?: RequestContext) {
  return {
    "Content-Type": "application/json",
    ...(context?.cookieHeader ? { Cookie: context.cookieHeader } : {}),
  };
}

export async function listFileNotes(clientId: string, context?: RequestContext) {
  const response = await fetch(resolveUrl(`/api/client-profiles/file-notes/client/${encodeURIComponent(clientId)}`, context), {
    method: "GET",
    headers: context?.cookieHeader ? { Cookie: context.cookieHeader } : undefined,
    cache: "no-store",
  });
  const responseText = await response.text();
  const result = parseResponseBody<FileNoteRecord[]>(responseText);

  if (!response.ok) {
    throw new Error(getErrorMessage(result, responseText, "Unable to load file notes right now", response.status));
  }

  return result && "data" in result && Array.isArray(result.data) ? result.data : [];
}

export async function createFileNote(payload: FileNotePayload, context?: RequestContext) {
  const response = await fetch(resolveUrl("/api/client-profiles/file-notes", context), {
    method: "POST",
    headers: buildHeaders(context),
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const responseText = await response.text();
  const result = parseResponseBody<FileNoteRecord>(responseText);

  if (!response.ok) {
    throw new Error(getErrorMessage(result, responseText, "Unable to save the file note right now", response.status));
  }

  return result && "data" in result ? result.data : null;
}

export async function updateFileNote(id: string, payload: FileNotePayload, context?: RequestContext) {
  const response = await fetch(resolveUrl(`/api/client-profiles/file-notes/${encodeURIComponent(id)}`, context), {
    method: "PUT",
    headers: buildHeaders(context),
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const responseText = await response.text();
  const result = parseResponseBody<FileNoteRecord>(responseText);

  if (!response.ok) {
    throw new Error(getErrorMessage(result, responseText, "Unable to save the file note right now", response.status));
  }

  return result && "data" in result ? result.data : null;
}

export async function deleteFileNote(id: string, context?: RequestContext) {
  const response = await fetch(resolveUrl(`/api/client-profiles/file-notes/${encodeURIComponent(id)}`, context), {
    method: "DELETE",
    headers: context?.cookieHeader ? { Cookie: context.cookieHeader } : undefined,
    cache: "no-store",
  });

  const responseText = await response.text();
  const result = parseResponseBody<FileNoteRecord>(responseText);

  if (!response.ok) {
    throw new Error(getErrorMessage(result, responseText, "Unable to delete the file note right now", response.status));
  }

  return result && "data" in result ? result.data : null;
}
