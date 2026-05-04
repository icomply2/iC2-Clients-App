import { NextRequest, NextResponse } from "next/server";
import { editSoaSection } from "@/lib/soa-section-edit-service";

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as
    | {
        sectionId?: string;
        clientName?: string | null;
        adviserInstruction?: string;
        sectionState?: unknown;
        recentMessages?: Array<{
          role?: "assistant" | "user";
          content?: string;
        }> | null;
      }
    | null;

  const sectionId = payload?.sectionId?.trim();
  const adviserInstruction = payload?.adviserInstruction?.trim();

  if (!sectionId) {
    return NextResponse.json({ message: "A section id is required." }, { status: 400 });
  }

  if (!adviserInstruction) {
    return NextResponse.json({ message: "An adviser instruction is required." }, { status: 400 });
  }

  const result = await editSoaSection({
    sectionId,
    clientName: payload?.clientName ?? null,
    adviserInstruction,
    sectionState: payload?.sectionState ?? null,
    recentMessages: payload?.recentMessages ?? null,
  });

  return NextResponse.json(result);
}
