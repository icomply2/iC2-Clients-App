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

  return Boolean(
    (email && normalizeText(user.email) === normalizeText(email)) ||
      (id && (normalizeText(user.id) === normalizeText(id) || normalizeText(user.entityId) === normalizeText(id))) ||
      (name && normalizeText(user.name) === normalizeText(name)),
  );
}

function findUserByClaims(users: UserSummary[], payload: Record<string, unknown> | null) {
  if (!payload) return null;

  const email = readStringClaim(payload, ["email", "emails", "preferred_username", "unique_name", "upn"]);
  const name = readStringClaim(payload, ["name", "given_name"]);
  const ids = ["Id", "id", "sub", "nameid"]
    .map((claimName) => readStringClaim(payload, [claimName]))
    .filter((value): value is string => Boolean(value));

  return (
    users.find((user) => email && normalizeText(user.email) === normalizeText(email)) ??
    users.find((user) => ids.some((id) => normalizeText(user.id) === normalizeText(id) || normalizeText(user.entityId) === normalizeText(id))) ??
    users.find((user) => name && normalizeText(user.name) === normalizeText(name)) ??
    null
  );
}

async function fetchUserList(apiBaseUrl: string, token: string) {
  const response = await fetch(new URL("/api/Users", apiBaseUrl), {
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

  return body?.data ?? [];
}

export async function resolveCurrentUserFromApi(token: string) {

  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl) {
    return null;
  }

  const payload = decodeJwtPayload(token);
  const primaryId = payload && typeof payload === "object" ? readStringClaim(payload, ["Id", "id", "sub", "nameid"]) : null;
  let directUser: UserSummary | null = null;

  if (primaryId) {
    const response = await fetch(new URL(`/api/Users/${encodeURIComponent(primaryId)}`, apiBaseUrl), {
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

    if (response.ok) {
      directUser = body?.data ?? null;
    }
  }

  const users = await fetchUserList(apiBaseUrl, token);
  const listUser = findUserByClaims(users, payload && typeof payload === "object" ? payload : null);

  return listUser ?? (userMatchesClaims(directUser, payload && typeof payload === "object" ? payload : null) ? directUser : null);
}
