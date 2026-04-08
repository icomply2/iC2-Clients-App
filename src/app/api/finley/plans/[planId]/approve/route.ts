import { NextRequest, NextResponse } from "next/server";
import { approveStoredPlan } from "@/lib/finley";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  const { planId } = await params;
  const payload = (await request.json().catch(() => null)) as
    | {
        type?: string;
        subType?: string;
      }
    | null;
  const result = await approveStoredPlan(planId, payload, {
    origin: request.nextUrl.origin,
    cookieHeader: request.headers.get("cookie"),
  });

  if (!result) {
    return NextResponse.json({ message: "Plan not found." }, { status: 404 });
  }

  return NextResponse.json(result);
}
