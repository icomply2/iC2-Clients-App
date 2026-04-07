import { NextRequest, NextResponse } from "next/server";
import {
  REX_TOKEN_CODE_VERIFIER_COOKIE,
  REX_TOKEN_OAUTH_STATE_COOKIE,
  buildRexCookieOptions,
  clearRexTokens,
  persistRexTokens,
} from "@/lib/rex-token";

const REX_TOKEN_API_BASE_URL = process.env.REX_TOKEN_API_BASE_URL;
const REX_TOKEN_SUBSCRIPTION_KEY = process.env.REX_TOKEN_SUBSCRIPTION_KEY;
const REX_TOKEN_CLIENT_ID = process.env.REX_TOKEN_CLIENT_ID;
const REX_TOKEN_CLIENT_SECRET = process.env.REX_TOKEN_CLIENT_SECRET;
const REX_TOKEN_REDIRECT_URI = process.env.REX_TOKEN_REDIRECT_URI;
const APP_BASE_URL = process.env.APP_BASE_URL;

function clearOAuthCookies(response: NextResponse) {
  response.cookies.set(REX_TOKEN_OAUTH_STATE_COOKIE, "", buildRexCookieOptions(0));
  response.cookies.set(REX_TOKEN_CODE_VERIFIER_COOKIE, "", buildRexCookieOptions(0));
}

function buildProfileRedirectUrl(request: NextRequest) {
  if (APP_BASE_URL) {
    return new URL("/profile", APP_BASE_URL);
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");

  if (forwardedProto && forwardedHost) {
    return new URL("/profile", `${forwardedProto}://${forwardedHost}`);
  }

  return new URL("/profile", request.url);
}

export async function GET(request: NextRequest) {
  const redirectUrl = buildProfileRedirectUrl(request);
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  const expectedState = request.cookies.get(REX_TOKEN_OAUTH_STATE_COOKIE)?.value;
  const codeVerifier = request.cookies.get(REX_TOKEN_CODE_VERIFIER_COOKIE)?.value;

  if (error) {
    redirectUrl.searchParams.set("integration", "productrex");
    redirectUrl.searchParams.set("status", "error");
    redirectUrl.searchParams.set("message", error);
    const response = NextResponse.redirect(redirectUrl);
    clearOAuthCookies(response);
    return response;
  }

  if (
    !code ||
    !state ||
    !expectedState ||
    !codeVerifier ||
    state !== expectedState ||
    !REX_TOKEN_API_BASE_URL ||
    !REX_TOKEN_SUBSCRIPTION_KEY ||
    !REX_TOKEN_CLIENT_ID ||
    !REX_TOKEN_CLIENT_SECRET ||
    !REX_TOKEN_REDIRECT_URI
  ) {
    redirectUrl.searchParams.set("integration", "productrex");
    redirectUrl.searchParams.set("status", "error");
    redirectUrl.searchParams.set("message", "callback-validation-failed");
    const response = NextResponse.redirect(redirectUrl);
    clearOAuthCookies(response);
    return response;
  }

  try {
    const formData = new FormData();
    formData.set("client_id", REX_TOKEN_CLIENT_ID);
    formData.set("client_secret", REX_TOKEN_CLIENT_SECRET);
    formData.set("grant_type", "authorization_code");
    formData.set("code", code);
    formData.set("redirect_uri", REX_TOKEN_REDIRECT_URI);
    formData.set("code_verifier", codeVerifier);

    const upstream = await fetch(new URL("/", REX_TOKEN_API_BASE_URL), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Ocp-Apim-Subscription-Key": REX_TOKEN_SUBSCRIPTION_KEY,
      },
      body: formData,
      cache: "no-store",
    });

    const tokenPayload = (await upstream.json().catch(() => null)) as
      | {
          access_token?: string;
          refresh_token?: string;
          expires_in?: number;
        }
      | null;

    if (!upstream.ok || !tokenPayload?.access_token) {
      redirectUrl.searchParams.set("integration", "productrex");
      redirectUrl.searchParams.set("status", "error");
      redirectUrl.searchParams.set("message", "token-exchange-failed");
      const response = NextResponse.redirect(redirectUrl);
      clearOAuthCookies(response);
      clearRexTokens(response);
      return response;
    }

    redirectUrl.searchParams.set("integration", "productrex");
    redirectUrl.searchParams.set("status", "connected");
    const response = NextResponse.redirect(redirectUrl);
    clearOAuthCookies(response);
    persistRexTokens(response, tokenPayload);
    return response;
  } catch {
    redirectUrl.searchParams.set("integration", "productrex");
    redirectUrl.searchParams.set("status", "error");
    redirectUrl.searchParams.set("message", "token-exchange-failed");
    const response = NextResponse.redirect(redirectUrl);
    clearOAuthCookies(response);
    return response;
  }
}
