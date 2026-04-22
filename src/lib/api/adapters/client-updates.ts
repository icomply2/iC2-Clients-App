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
      method: "PUT",
      headers: buildHeaders(context),
      body: JSON.stringify(payload),
      cache: "no-store",
    },
  );

  const text = await response.text().catch(() => "");
  const body = (() => {
    if (!text) return null;
    try {
      return JSON.parse(text) as { message?: string | null; status?: boolean | null; data?: boolean | null };
    } catch {
      return null;
    }
  })();

  if (!response.ok) {
    throw new Error(body?.message ?? (text.trim() || "Unable to save changes."));
  }

  if (body && (body.status === false || body.data === false)) {
    throw new Error(body.message ?? "Unable to save changes.");
  }

  return body;
}
