import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const REX_TOKEN_ACCESS_COOKIE = "rex_token_access";
export const REX_TOKEN_REFRESH_COOKIE = "rex_token_refresh";
export const REX_TOKEN_EXPIRES_AT_COOKIE = "rex_token_expires_at";
export const REX_TOKEN_OAUTH_STATE_COOKIE = "rex_token_oauth_state";
export const REX_TOKEN_CODE_VERIFIER_COOKIE = "rex_token_code_verifier";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

export function buildRexCookieOptions(maxAgeSeconds?: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(typeof maxAgeSeconds === "number" ? { maxAge: maxAgeSeconds } : {}),
  };
}

export async function readRexAccessTokenFromCookies() {
  const store = await cookies();
  return store.get(REX_TOKEN_ACCESS_COOKIE)?.value ?? null;
}

export async function readRexRefreshTokenFromCookies() {
  const store = await cookies();
  return store.get(REX_TOKEN_REFRESH_COOKIE)?.value ?? null;
}

export async function readRexConnectionStateFromCookies() {
  const store = await cookies();

  return {
    connected: Boolean(store.get(REX_TOKEN_ACCESS_COOKIE)?.value),
    accessToken: store.get(REX_TOKEN_ACCESS_COOKIE)?.value ?? null,
    refreshToken: store.get(REX_TOKEN_REFRESH_COOKIE)?.value ?? null,
    expiresAt: store.get(REX_TOKEN_EXPIRES_AT_COOKIE)?.value ?? null,
  };
}

export function persistRexTokens(response: NextResponse, tokenPayload: TokenResponse) {
  if (!tokenPayload.access_token) {
    return;
  }

  const expiresIn = Number(tokenPayload.expires_in ?? 0);
  const accessCookieMaxAge = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 60 * 60 * 10;
  const refreshCookieMaxAge = 60 * 60 * 24 * 30;
  const expiresAt = new Date(Date.now() + accessCookieMaxAge * 1000).toISOString();

  response.cookies.set(
    REX_TOKEN_ACCESS_COOKIE,
    tokenPayload.access_token,
    buildRexCookieOptions(accessCookieMaxAge),
  );

  if (tokenPayload.refresh_token) {
    response.cookies.set(
      REX_TOKEN_REFRESH_COOKIE,
      tokenPayload.refresh_token,
      buildRexCookieOptions(refreshCookieMaxAge),
    );
  }

  response.cookies.set(
    REX_TOKEN_EXPIRES_AT_COOKIE,
    expiresAt,
    buildRexCookieOptions(refreshCookieMaxAge),
  );
}

export function clearRexTokens(response: NextResponse) {
  response.cookies.set(REX_TOKEN_ACCESS_COOKIE, "", buildRexCookieOptions(0));
  response.cookies.set(REX_TOKEN_REFRESH_COOKIE, "", buildRexCookieOptions(0));
  response.cookies.set(REX_TOKEN_EXPIRES_AT_COOKIE, "", buildRexCookieOptions(0));
}
