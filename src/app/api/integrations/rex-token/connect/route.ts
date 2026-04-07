import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  REX_TOKEN_CODE_VERIFIER_COOKIE,
  REX_TOKEN_OAUTH_STATE_COOKIE,
  buildRexCookieOptions,
} from "@/lib/rex-token";

const REX_TOKEN_FUNCTION_AUTH_URL = process.env.REX_TOKEN_FUNCTION_AUTH_URL;
const REX_TOKEN_AUTHORIZATION_URL = process.env.REX_TOKEN_AUTHORIZATION_URL;
const REX_TOKEN_CLIENT_ID = process.env.REX_TOKEN_CLIENT_ID;
const REX_TOKEN_REDIRECT_URI = process.env.REX_TOKEN_REDIRECT_URI;
const REX_TOKEN_SCOPE = process.env.REX_TOKEN_SCOPE ?? "read write groups";

function toBase64Url(input: Buffer) {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function GET(request: NextRequest) {
  const fallbackUrl = new URL("/profile?integration=productrex&status=error&message=missing-config", request.url);

  if (REX_TOKEN_FUNCTION_AUTH_URL) {
    return NextResponse.redirect(REX_TOKEN_FUNCTION_AUTH_URL);
  }

  if (!REX_TOKEN_AUTHORIZATION_URL || !REX_TOKEN_CLIENT_ID || !REX_TOKEN_REDIRECT_URI) {
    return NextResponse.redirect(fallbackUrl);
  }

  const state = toBase64Url(randomBytes(24));
  const codeVerifier = toBase64Url(randomBytes(48));
  const codeChallenge = toBase64Url(createHash("sha256").update(codeVerifier).digest());

  const authorizeUrl = new URL(REX_TOKEN_AUTHORIZATION_URL);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", REX_TOKEN_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", REX_TOKEN_REDIRECT_URI);
  authorizeUrl.searchParams.set("scope", REX_TOKEN_SCOPE);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(REX_TOKEN_OAUTH_STATE_COOKIE, state, buildRexCookieOptions(60 * 15));
  response.cookies.set(
    REX_TOKEN_CODE_VERIFIER_COOKIE,
    codeVerifier,
    buildRexCookieOptions(60 * 15),
  );

  return response;
}
