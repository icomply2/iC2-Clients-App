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

function buildCookieHeaders(context?: RequestContext) {
  return context?.cookieHeader ? { Cookie: context.cookieHeader } : undefined;
}

function buildFileNoteFormData(payload: FileNotePayload) {
  const formData = new FormData();

  if (payload.id) formData.append("id", payload.id);
  formData.append("clientId", payload.clientId);
  formData.append("owner.id", payload.owner.id);
  formData.append("owner.name", payload.owner.name);
  formData.append("joint", String(payload.joint));
  formData.append("licensee", payload.licensee ?? "");
  formData.append("practice", payload.practice ?? "");
  formData.append("adviser.id", payload.adviser?.id ?? "");
  formData.append("adviser.email", payload.adviser?.email ?? "");
  formData.append("adviser.name", payload.adviser?.name ?? "");
  formData.append("content", payload.content);
  formData.append("serviceDate", payload.serviceDate);
  formData.append("type", payload.type);
  formData.append("subType", payload.subType);
  formData.append("subject", payload.subject);
  formData.append("creator.id", payload.creator?.id ?? "");
  formData.append("creator.email", payload.creator?.email ?? "");
  formData.append("creator.name", payload.creator?.name ?? "");
  formData.append("modifier.id", payload.modifier?.id ?? "");
  formData.append("modifier.email", payload.modifier?.email ?? "");
  formData.append("modifier.name", payload.modifier?.name ?? "");
  formData.append("modifiedDate", payload.modifiedDate ?? "");
  formData.append("createdDate", payload.createdDate ?? "");

  for (const file of payload.files ?? []) {
    formData.append("files", file);
  }

  for (const attachment of payload.attachment ?? []) {
    formData.append("attachment", JSON.stringify(attachment ?? {}));
  }

  return formData;
}

export async function listFileNotes(clientId: string, context?: RequestContext) {
  const response = await fetch(resolveUrl(`/api/client-profiles/file-notes/client/${encodeURIComponent(clientId)}`, context), {
    method: "GET",
    headers: buildCookieHeaders(context),
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
    headers: buildCookieHeaders(context),
    body: buildFileNoteFormData(payload),
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
    headers: buildCookieHeaders(context),
    body: buildFileNoteFormData(payload),
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
    headers: buildCookieHeaders(context),
    cache: "no-store",
  });

  const responseText = await response.text();
  const result = parseResponseBody<FileNoteRecord>(responseText);

  if (!response.ok) {
    throw new Error(getErrorMessage(result, responseText, "Unable to delete the file note right now", response.status));
  }

  return result && "data" in result ? result.data : null;
}
