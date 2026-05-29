import { NextRequest, NextResponse } from "next/server";
import {
  editFinleyActiveOutput,
  type FinleyOutputEditKind,
  type FinleyOutputEditRequest,
} from "@/lib/finley-output-edit-service";

function isOutputKind(value: unknown): value is FinleyOutputEditKind {
  return value === "engagement_letter" || value === "ongoing_agreement" || value === "annual_agreement" || value === "record_of_advice";
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as Partial<FinleyOutputEditRequest> | null;

  if (!payload || !isOutputKind(payload.outputKind) || !payload.adviserInstruction?.trim() || !payload.currentOutput) {
    return NextResponse.json(
      { message: "An output kind, current output, and adviser instruction are required." },
      { status: 400 },
    );
  }

  try {
    const result = await editFinleyActiveOutput({
      outputKind: payload.outputKind,
      activeClientName: payload.activeClientName ?? null,
      adviserInstruction: payload.adviserInstruction,
      currentOutput: payload.currentOutput,
      recentMessages: payload.recentMessages ?? [],
      uploadedFiles: payload.uploadedFiles ?? [],
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        decision: "needs_clarification",
        assistantMessage:
          "Finley could not reach the active output editing model, so I have not changed the draft.",
        changeSummary: "",
        missingInformation: ["Try again once the document editing model is available."],
        handoffReason: "",
        updatedEngagementLetter: null,
        updatedAgreement: null,
        updatedRecordOfAdvice: null,
        source: "configuration",
        model: null,
        warning: error instanceof Error ? error.message : "Unknown active output edit error.",
      },
      { status: 200 },
    );
  }
}
