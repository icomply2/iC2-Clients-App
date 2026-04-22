import type { ApiResult } from "@/lib/api/types";
import type {
  ProfileCollectionKind,
  ProfileCollectionRecord,
  ProfileCollectionSavePayload,
} from "@/lib/api/contracts/profile-collections";

type RequestContext = {
  origin?: string | null;
  cookieHeader?: string | null;
};

const COLLECTION_PATHS: Record<ProfileCollectionKind, string> = {
  assets: "assets",
  liabilities: "liabilities",
  income: "income",
  expenses: "expenses",
  superannuation: "superannuation",
  "retirement-income": "retirement-income",
  insurance: "insurance",
};

function resolveUrl(path: string, context?: RequestContext) {
  return context?.origin ? `${context.origin}${path}` : path;
}

function buildHeaders(context?: RequestContext) {
  return {
    "Content-Type": "application/json",
    ...(context?.cookieHeader ? { Cookie: context.cookieHeader } : {}),
  };
}

function parseResponseBody<T>(responseText: string) {
  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(responseText) as
      | ApiResult<T[]>
      | { message?: string | null; modelErrors?: { errorMessage?: string | null }[] | null };
  } catch {
    return null;
  }
}

function getErrorMessage<T>(
  result: ReturnType<typeof parseResponseBody<T>>,
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

export async function saveProfileCollection<K extends ProfileCollectionKind>(
  kind: K,
  profileId: string,
  payload: ProfileCollectionSavePayload<K>,
  context?: RequestContext,
) {
  const path = COLLECTION_PATHS[kind];
  const response = await fetch(resolveUrl(`/api/client-profiles/${encodeURIComponent(profileId)}/${path}`, context), {
    method: "POST",
    headers: buildHeaders(context),
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const responseText = await response.text();
  const result = parseResponseBody<ProfileCollectionRecord<K>>(responseText);

  if (!response.ok) {
    throw new Error(getErrorMessage(result, responseText, `Unable to save ${kind} right now`, response.status));
  }

  return result && "data" in result && Array.isArray(result.data) ? result.data : null;
}

export async function deleteProfileCollectionItem(
  kind: ProfileCollectionKind,
  profileId: string,
  recordId: string,
  context?: RequestContext,
) {
  const path = COLLECTION_PATHS[kind];
  const response = await fetch(
    resolveUrl(`/api/client-profiles/${encodeURIComponent(profileId)}/${path}/${encodeURIComponent(recordId)}`, context),
    {
      method: "DELETE",
      headers: context?.cookieHeader ? { Cookie: context.cookieHeader } : undefined,
      cache: "no-store",
    },
  );

  const responseText = await response.text();
  const result = parseResponseBody<Record<string, string>>(responseText);

  if (!response.ok) {
    throw new Error(getErrorMessage(result, responseText, `Unable to delete ${kind} right now`, response.status));
  }

  return true;
}
