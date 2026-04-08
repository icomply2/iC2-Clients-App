import type { UpdateClientDetailsInput } from "@/lib/api/contracts/client-updates";

type RequestContext = {
  origin?: string | null;
  cookieHeader?: string | null;
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

export async function updatePersonDetails(
  input: UpdateClientDetailsInput,
  payload: Record<string, unknown>,
  context?: RequestContext,
) {
  const target = input.target === "partner" ? "partner" : "client";
  const response = await fetch(
    resolveUrl(`/api/client-profiles/${encodeURIComponent(input.profileId)}/${target}/${encodeURIComponent(input.personId)}`, context),
    {
      method: "PATCH",
      headers: buildHeaders(context),
      body: JSON.stringify(payload),
      cache: "no-store",
    },
  );

  const body = (await response.json().catch(() => null)) as { message?: string | null } | null;

  if (!response.ok) {
    throw new Error(body?.message ?? "Unable to save changes.");
  }

  return body;
}
