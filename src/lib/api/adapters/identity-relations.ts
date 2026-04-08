import type { ApiResult, ClientDependantRecord, ClientEntityRecord } from "@/lib/api/types";
import type {
  IdentityRelationKind,
  IdentityRelationRecord,
  IdentityRelationSavePayload,
} from "@/lib/api/contracts/identity-relations";

type RequestContext = {
  origin?: string | null;
  cookieHeader?: string | null;
};

function resolveUrl(path: string, context?: RequestContext) {
  return context?.origin ? `${context.origin}${path}` : path;
}

function parseResponseBody<T>(responseText: string) {
  if (!responseText) return null;

  try {
    return JSON.parse(responseText) as
      | ApiResult<T>
      | { message?: string | null; modelErrors?: { errorMessage?: string | null }[] | null };
  } catch {
    return null;
  }
}

function getErrorMessage(
  result: ReturnType<typeof parseResponseBody<ClientEntityRecord[] | ClientDependantRecord[]>>,
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

function kindPath(kind: IdentityRelationKind) {
  return kind === "entities" ? "entities" : "dependants";
}

export async function saveIdentityRelationCollection<K extends IdentityRelationKind>(
  kind: K,
  profileId: string,
  payload: IdentityRelationSavePayload<K>,
  context?: RequestContext,
) {
  const response = await fetch(resolveUrl(`/api/client-profiles/${encodeURIComponent(profileId)}/${kindPath(kind)}`, context), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(context?.cookieHeader ? { Cookie: context.cookieHeader } : {}),
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const responseText = await response.text();
  const result = parseResponseBody<Array<IdentityRelationRecord<K>>>(responseText);

  if (!response.ok) {
    throw new Error(getErrorMessage(result, responseText, `Unable to save ${kind} right now`, response.status));
  }

  return result && "data" in result && Array.isArray(result.data) ? result.data : null;
}

export async function deleteIdentityRelationItem(
  kind: IdentityRelationKind,
  profileId: string,
  recordId: string,
  context?: RequestContext,
) {
  const response = await fetch(
    resolveUrl(`/api/client-profiles/${encodeURIComponent(profileId)}/${kindPath(kind)}/${encodeURIComponent(recordId)}`, context),
    {
      method: "DELETE",
      headers: context?.cookieHeader ? { Cookie: context.cookieHeader } : undefined,
      cache: "no-store",
    },
  );

  const responseText = await response.text();
  const result = parseResponseBody<IdentityRelationRecord<typeof kind>>(responseText);

  if (!response.ok) {
    throw new Error(getErrorMessage(result, responseText, `Unable to delete ${kind} right now`, response.status));
  }

  return result && "data" in result ? result.data : null;
}
