import { NextRequest, NextResponse } from "next/server";
import { persistRexTokens } from "@/lib/rex-token";

const REX_TOKEN_API_BASE_URL = process.env.REX_TOKEN_API_BASE_URL;
const REX_TOKEN_SUBSCRIPTION_KEY = process.env.REX_TOKEN_SUBSCRIPTION_KEY;
const REX_TOKEN_CLIENT_ID = process.env.REX_TOKEN_CLIENT_ID;
const REX_TOKEN_CLIENT_SECRET = process.env.REX_TOKEN_CLIENT_SECRET;
const REX_TOKEN_REDIRECT_URI = process.env.REX_TOKEN_REDIRECT_URI;

export async function POST(request: NextRequest) {
  if (
    !REX_TOKEN_API_BASE_URL ||
    !REX_TOKEN_SUBSCRIPTION_KEY ||
    !REX_TOKEN_CLIENT_ID ||
    !REX_TOKEN_CLIENT_SECRET ||
    !REX_TOKEN_REDIRECT_URI
  ) {
    return NextResponse.json(
      { message: "The REX token OAuth configuration is incomplete." },
      { status: 500 },
    );
  }

  const payload = (await request.json().catch(() => null)) as
    | {
        code?: string;
        codeVerifier?: string;
        redirectUri?: string;
      }
    | null;

  if (!payload?.code || !payload?.codeVerifier) {
    return NextResponse.json(
      { message: "Both code and codeVerifier are required." },
      { status: 400 },
    );
  }

  try {
    const formData = new FormData();
    formData.set("client_id", REX_TOKEN_CLIENT_ID);
    formData.set("client_secret", REX_TOKEN_CLIENT_SECRET);
    formData.set("grant_type", "authorization_code");
    formData.set("code", payload.code);
    formData.set("redirect_uri", payload.redirectUri ?? REX_TOKEN_REDIRECT_URI);
    formData.set("code_verifier", payload.codeVerifier);

    const response = await fetch(new URL("/", REX_TOKEN_API_BASE_URL), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Ocp-Apim-Subscription-Key": REX_TOKEN_SUBSCRIPTION_KEY,
      },
      body: formData,
      cache: "no-store",
    });

    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "application/json";

    const nextResponse = new NextResponse(text, {
      status: response.status,
      headers: {
        "content-type": contentType,
      },
    });

    if (response.ok && contentType.includes("application/json")) {
      const tokenPayload = JSON.parse(text) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };

      persistRexTokens(nextResponse, tokenPayload);
    }

    return nextResponse;
  } catch (error) {
    const message =
      error instanceof Error
        ? `REX token exchange failed: ${error.message}`
        : "REX token exchange failed.";

    return NextResponse.json({ message }, { status: 502 });
  }
}
