import { NextRequest, NextResponse } from "next/server";
import { assistFinleyFileNoteField } from "@/lib/finley";

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as
    | {
        fieldKey?: "subject" | "content";
        message?: string;
        activeClientName?: string | null;
        currentSubject?: string | null;
        currentContent?: string | null;
        type?: string | null;
        subType?: string | null;
      }
    | null;

  if (!payload?.message?.trim() || !payload.fieldKey) {
    return NextResponse.json({ message: "A field key and prompt are required." }, { status: 400 });
  }

  const result = await assistFinleyFileNoteField({
    fieldKey: payload.fieldKey,
    message: payload.message,
    activeClientName: payload.activeClientName ?? null,
    currentSubject: payload.currentSubject ?? null,
    currentContent: payload.currentContent ?? null,
    type: payload.type ?? null,
    subType: payload.subType ?? null,
  });

  return NextResponse.json(result);
}
