import { NextResponse } from "next/server";
import { readRexAccessTokenFromCookies } from "@/lib/rex-token";

const REX_TOKEN_API_BASE_URL = process.env.REX_TOKEN_API_BASE_URL;
const REX_TOKEN_BEARER_TOKEN = process.env.REX_TOKEN_BEARER_TOKEN;
const REX_TOKEN_SUBSCRIPTION_KEY = process.env.REX_TOKEN_SUBSCRIPTION_KEY;

export async function GET() {
  if (!REX_TOKEN_API_BASE_URL || !REX_TOKEN_SUBSCRIPTION_KEY) {
    return NextResponse.json(
      { message: "The REX token integration is not configured yet." },
      { status: 500 },
    );
  }

  const accessToken = (await readRexAccessTokenFromCookies()) ?? REX_TOKEN_BEARER_TOKEN;

  if (!accessToken) {
    return NextResponse.json(
      { message: "ProductRex is not connected for this user yet." },
      { status: 401 },
    );
  }

  try {
    const response = await fetch(new URL("/user/", REX_TOKEN_API_BASE_URL), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Ocp-Apim-Subscription-Key": REX_TOKEN_SUBSCRIPTION_KEY,
      },
      cache: "no-store",
    });

    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "application/json";

    return new NextResponse(text, {
      status: response.status,
      headers: {
        "content-type": contentType,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? `REX token user proxy failed: ${error.message}`
        : "REX token user proxy failed.";

    return NextResponse.json({ message }, { status: 502 });
  }
}
