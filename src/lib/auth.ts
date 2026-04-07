import { cookies } from "next/headers";

export const AUTH_COOKIE_NAME = "ic2_auth_token";

export type CurrentUser = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
};

export async function readAuthTokenFromCookies() {
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_COOKIE_NAME)?.value ?? null;
}

function decodeJwtPayload(token: string) {
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

function readStringClaim(payload: Record<string, unknown>, claimNames: string[]) {
  for (const claimName of claimNames) {
    const value = payload[claimName];

    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}

export async function readCurrentUserFromCookies(): Promise<CurrentUser | null> {
  const token = await readAuthTokenFromCookies();

  if (!token) {
    return null;
  }

  const payload = decodeJwtPayload(token);

  if (!payload) {
    return null;
  }

  const id = readStringClaim(payload, [
    "nameid",
    "sub",
    "uid",
    "userId",
    "id",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier",
  ]);
  const email = readStringClaim(payload, [
    "email",
    "unique_name",
    "upn",
    "preferred_username",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
  ]);
  const name =
    readStringClaim(payload, [
      "name",
      "given_name",
      "unique_name",
      "preferred_username",
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
    ]) ?? email;

  if (!id && !name && !email) {
    return null;
  }

  return {
    id,
    name,
    email,
  };
}
