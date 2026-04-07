import { NextRequest, NextResponse } from "next/server";
import {
  REX_TOKEN_CODE_VERIFIER_COOKIE,
  REX_TOKEN_OAUTH_STATE_COOKIE,
  buildRexCookieOptions,
  clearRexTokens,
  persistRexTokens,
} from "@/lib/rex-token";
import { buildRexTokenUrl } from "../_shared";

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

  let validationMessage: string | null = null;

  if (!code) {
    validationMessage = "missing-code";
  } else if (!state) {
    validationMessage = "missing-state";
  } else if (!expectedState) {
    validationMessage = "missing-session-state";
  } else if (!codeVerifier) {
    validationMessage = "missing-code-verifier";
  } else if (state !== expectedState) {
    validationMessage = "state-mismatch";
  } else if (
    !REX_TOKEN_API_BASE_URL ||
    !REX_TOKEN_SUBSCRIPTION_KEY ||
    !REX_TOKEN_CLIENT_ID ||
    !REX_TOKEN_CLIENT_SECRET ||
    !REX_TOKEN_REDIRECT_URI
  ) {
    validationMessage = "missing-config";
  }

  if (validationMessage) {
    redirectUrl.searchParams.set("integration", "productrex");
    redirectUrl.searchParams.set("status", "error");
    redirectUrl.searchParams.set("message", validationMessage);
    const response = NextResponse.redirect(redirectUrl);
    clearOAuthCookies(response);
    return response;
  }

  try {
    const authCode = code!;
    const verifier = codeVerifier!;
    const clientId = REX_TOKEN_CLIENT_ID!;
    const clientSecret = REX_TOKEN_CLIENT_SECRET!;
    const redirectUri = REX_TOKEN_REDIRECT_URI!;
    const apiBaseUrl = REX_TOKEN_API_BASE_URL!;
    const subscriptionKey = REX_TOKEN_SUBSCRIPTION_KEY!;

    const formData = new FormData();
    formData.set("client_id", clientId);
    formData.set("client_secret", clientSecret);
    formData.set("grant_type", "authorization_code");
    formData.set("code", authCode);
    formData.set("redirect_uri", redirectUri);
    formData.set("code_verifier", verifier);

    const upstream = await fetch(buildRexTokenUrl(apiBaseUrl), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Ocp-Apim-Subscription-Key": subscriptionKey,
      },
      body: formData,
      cache: "no-store",
    });

    const rawBody = await upstream.text();
    let parsedPayload: {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    } | null = null;

    if (rawBody) {
      try {
        parsedPayload = JSON.parse(rawBody) as {
          access_token?: string;
          refresh_token?: string;
          expires_in?: number;
          error?: string;
          error_description?: string;
        };
      } catch {
        parsedPayload = null;
      }
    }

    const tokenPayload = parsedPayload as
      | {
          access_token?: string;
          refresh_token?: string;
          expires_in?: number;
          error?: string;
          error_description?: string;
        }
      | null;

    if (!upstream.ok || !tokenPayload?.access_token) {
      redirectUrl.searchParams.set("integration", "productrex");
      redirectUrl.searchParams.set("status", "error");
      const upstreamMessage =
        tokenPayload?.error_description ||
        tokenPayload?.error ||
        rawBody.trim() ||
        `upstream-${upstream.status}`;
      redirectUrl.searchParams.set("message", `token-exchange-${upstream.status}-${upstreamMessage}`);
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
