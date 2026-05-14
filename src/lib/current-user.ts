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

export async function resolveCurrentUserFromApi(token: string) {

  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl) {
    return null;
  }

  const payload = decodeJwtPayload(token);
 
  const response = await fetch(new URL(`/api/Users/${payload.Id}`, apiBaseUrl), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as
    | {
        data?: UserSummary | null;
      }
    | null;


  if (!response.ok) {
    throw new Error("Unable to load the current user.");
  }

  return (
    body?.data?? null
  );
}
