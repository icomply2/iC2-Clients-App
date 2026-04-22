import { NextRequest } from "next/server";
import { proxyDesktopBrokerGet } from "../_shared";

export async function GET(request: NextRequest) {
  return proxyDesktopBrokerGet("api/account/contractnotes", request);
}
