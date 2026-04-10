import type { UserSummary } from "@/lib/api/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

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

export async function resolveCurrentUserFromApi(token: string) {
  if (!API_BASE_URL) {
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

  const response = await fetch(new URL("/api/Users", API_BASE_URL), {
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
