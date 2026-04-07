import { NextResponse } from "next/server";
import { clearRexTokens } from "@/lib/rex-token";

export async function POST() {
  const response = NextResponse.json({ status: true }, { status: 200 });
  clearRexTokens(response);
  return response;
}
