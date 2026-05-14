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

    return JSON.parse(payload) as Record<string, unknown>;
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

async function resolveUserById(apiBaseUrl: string, token: string, userId: string) {
  const response = await fetch(new URL(`/api/Users/${encodeURIComponent(userId)}`, apiBaseUrl), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json().catch(() => null)) as
    | {
        data?: UserSummary | null;
      }
    | null;

  return body?.data ?? null;
}

export async function resolveCurrentUserFromApi(token: string) {
  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl) {
    return null;
  }

  const payload = decodeJwtPayload(token);
  const currentUserId = payload
    ? readStringClaim(payload, [
        "nameid",
        "sub",
        "uid",
        "userId",
        "id",
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier",
      ])
    : null;
  const currentEmail = payload
    ? readStringClaim(payload, [
        "email",
        "unique_name",
        "upn",
        "preferred_username",
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
      ])
    : null;

  if (currentUserId) {
    const currentUser = await resolveUserById(apiBaseUrl, token, currentUserId);

    if (currentUser) {
      return currentUser;
    }
  }

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
    throw new Error("Unable to load the current user.");
  }

  return (
    body?.data?.find((user) => currentUserId && user.id && user.id === currentUserId) ??
    body?.data?.find(
      (user) =>
        currentEmail &&
        user.email &&
        currentEmail.trim().toLowerCase() === user.email.trim().toLowerCase(),
    ) ??
    null
  );
}
