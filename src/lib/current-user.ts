import type { UserSummary } from "@/lib/api/types";
import { getApiBaseUrl } from "@/lib/server-runtime";

export function decodeJwtPayload(token: string) {
  const parts = token.split(".");

  if (parts.length < 2) {
    return null;
  }

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = Buffer.from(padded, "base64").toString("utf8");

    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export function readStringClaim(payload: Record<string, unknown>, claimNames: string[]) {
  for (const claimName of claimNames) {
    const value = payload[claimName];

    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}

function normalizeText(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function userMatchesClaims(user: UserSummary | null | undefined, payload: Record<string, unknown> | null) {
  if (!user || !payload) return false;

  const email = readStringClaim(payload, ["email", "emails", "preferred_username", "unique_name", "upn"]);
  const name = readStringClaim(payload, ["name", "given_name"]);
  const id = readStringClaim(payload, ["Id", "id", "sub", "nameid"]);

  const payload = decodeJwtPayload(token);
  const userId = payload
    ? readStringClaim(payload, [
        "Id",
        "nameid",
        "sub",
        "uid",
        "userId",
        "id",
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier",
      ])
    : null;

  if (!userId) {
    return null;
  }
 
  const response = await fetch(new URL(`/api/Users/${encodeURIComponent(userId)}`, apiBaseUrl), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as
    | {
        data?: UserSummary[] | null;
      }
    | null;

  if (!response.ok) {
    return [] as UserSummary[];
  }

  return (
    body?.data?? null
  );
}
