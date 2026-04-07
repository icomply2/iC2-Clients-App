import { NextRequest, NextResponse } from "next/server";
import { persistRexTokens, readRexRefreshTokenFromCookies } from "@/lib/rex-token";
import { buildRexTokenUrl } from "../_shared";

const REX_TOKEN_API_BASE_URL = process.env.REX_TOKEN_API_BASE_URL;
const REX_TOKEN_SUBSCRIPTION_KEY = process.env.REX_TOKEN_SUBSCRIPTION_KEY;
const REX_TOKEN_CLIENT_ID = process.env.REX_TOKEN_CLIENT_ID;
const REX_TOKEN_CLIENT_SECRET = process.env.REX_TOKEN_CLIENT_SECRET;

export async function POST(request: NextRequest) {
  if (
    !REX_TOKEN_API_BASE_URL ||
    !REX_TOKEN_SUBSCRIPTION_KEY ||
    !REX_TOKEN_CLIENT_ID ||
    !REX_TOKEN_CLIENT_SECRET
  ) {
    return NextResponse.json(
      { message: "The REX token refresh configuration is incomplete." },
      { status: 500 },
    );
  }

  const payload = (await request.json().catch(() => null)) as
    | {
        refreshToken?: string;
      }
    | null;

  const refreshToken = payload?.refreshToken ?? (await readRexRefreshTokenFromCookies());

  if (!refreshToken) {
    return NextResponse.json(
      { message: "A refreshToken is required." },
      { status: 400 },
    );
  }

  try {
    const formData = new FormData();
    formData.set("client_id", REX_TOKEN_CLIENT_ID);
    formData.set("client_secret", REX_TOKEN_CLIENT_SECRET);
    formData.set("grant_type", "refresh_token");
    formData.set("refresh_token", refreshToken);

    const response = await fetch(buildRexTokenUrl(REX_TOKEN_API_BASE_URL), {
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
        ? `REX token refresh failed: ${error.message}`
        : "REX token refresh failed.";

    return NextResponse.json({ message }, { status: 502 });
  }
}
