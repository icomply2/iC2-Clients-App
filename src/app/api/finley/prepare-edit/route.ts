import { NextRequest, NextResponse } from "next/server";
import { prepareFinleyDisplayCardEdit } from "@/lib/finley";

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as
    | {
        activeClientId?: string | null;
        activeClientName?: string | null;
        threadId?: string | null;
        kind?: "assets" | "liabilities" | "income" | "expenses" | "superannuation" | "retirement-income" | "insurance" | "entities" | "dependants";
        recordId?: string | null;
      }
    | null;

  if (!payload?.kind || !payload.recordId) {
    return NextResponse.json({ message: "A collection kind and record id are required." }, { status: 400 });
  }

  const result = await prepareFinleyDisplayCardEdit({
    activeClientId: payload.activeClientId ?? null,
    activeClientName: payload.activeClientName ?? null,
    threadId: payload.threadId ?? null,
    kind: payload.kind,
    recordId: payload.recordId,
  });

  return NextResponse.json(result);
}
