import { NextRequest, NextResponse } from "next/server";
import type { IntakeAssessmentV1 } from "@/lib/soa-output-contracts";
import { generateSoaIntakeAssessment } from "@/lib/soa-intake-service";

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as
    | {
        clientName?: string | null;
        adviserMessage?: string;
        uploadedFiles?: Array<{
          name?: string;
          kind?: string | null;
          extractedText?: string | null;
        }>;
    currentAssessment?: IntakeAssessmentV1 | null;
    recentMessages?: Array<{
      role?: "assistant" | "user";
      content?: string;
    }> | null;
  }
    | null;

  type IntakeUploadPayload = {
    name?: string;
    kind?: string | null;
    extractedText?: string | null;
  };

  const adviserMessage = payload?.adviserMessage?.trim();

  if (!adviserMessage) {
    return NextResponse.json({ message: "An adviser message is required." }, { status: 400 });
  }

  const result = await generateSoaIntakeAssessment({
    clientName: payload?.clientName ?? null,
    adviserMessage,
    uploadedFiles:
      payload?.uploadedFiles
        ?.filter((file): file is IntakeUploadPayload & { name: string } => Boolean(file?.name?.trim()))
        .map((file) => ({
          name: file.name.trim(),
          kind: file.kind ?? null,
          extractedText: typeof file.extractedText === "string" ? file.extractedText : null,
        })) ?? [],
    currentAssessment: payload?.currentAssessment ?? null,
    recentMessages: payload?.recentMessages ?? null,
  });

  return NextResponse.json(result);
}
