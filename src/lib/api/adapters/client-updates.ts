import type { UpdateClientDetailsInput } from "@/lib/api/contracts/client-updates";

type RequestContext = {
  origin?: string | null;
  cookieHeader?: string | null;
  apiBaseUrl?: string | null;
  token?: string | null;
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

function canWriteDirect(context?: RequestContext) {
  return Boolean(context?.apiBaseUrl && context.token);
}

export async function updatePersonDetails(
  input: UpdateClientDetailsInput,
  payload: Record<string, unknown>,
  context?: RequestContext,
) {
  const target = input.target === "partner" ? "partner" : "client";
  const response = canWriteDirect(context)
    ? await fetch(
        new URL(
          `/api/ClientProfiles/${encodeURIComponent(input.profileId)}/${target === "partner" ? "Partner" : "Client"}/${encodeURIComponent(input.personId)}`,
          context!.apiBaseUrl!,
        ),
        {
          method: "PUT",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${context!.token}`,
          },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
      )
    : await fetch(
        resolveUrl(`/api/client-profiles/${encodeURIComponent(input.profileId)}/${target}/${encodeURIComponent(input.personId)}`, context),
        {
          method: "PUT",
          headers: buildHeaders(context),
          body: JSON.stringify(payload),
          cache: "no-store",
        },
      );

  console.log(response);

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
