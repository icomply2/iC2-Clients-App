import { NextRequest, NextResponse } from "next/server";
import { prepareFinleyFactFindWorkflow } from "@/lib/finley";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | {
        activeClientId?: string | null;
        activeClientName?: string | null;
      }
    | null;

  const workflow = await prepareFinleyFactFindWorkflow({
    activeClientId: body?.activeClientId ?? null,
    activeClientName: body?.activeClientName ?? null,
  });

  return NextResponse.json({ workflow });
}
