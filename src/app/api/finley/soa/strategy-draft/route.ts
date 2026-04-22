import { NextRequest, NextResponse } from "next/server";
import type { IntakeAssessmentV1 } from "@/lib/soa-output-contracts";
import type { AdviceScopeV1, RiskProfileV1 } from "@/lib/soa-types";
import { generateSoaStrategyDrafts } from "@/lib/soa-strategy-draft-service";

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as
    | {
        clientName?: string | null;
        objectives?: Array<{
          text?: string | null;
          priority?: "high" | "medium" | "low" | "unknown" | null;
        }>;
        scope?: AdviceScopeV1 | null;
        riskProfile?: RiskProfileV1 | null;
        intakeAssessment?: IntakeAssessmentV1 | null;
        uploadedFiles?: Array<{
          name?: string;
          kind?: string | null;
          extractedText?: string | null;
        }>;
        recentMessages?: Array<{
          role?: "assistant" | "user";
          content?: string;
        }> | null;
      }
    | null;

  const objectives =
    payload?.objectives
      ?.filter((objective): objective is { text: string; priority?: "high" | "medium" | "low" | "unknown" | null } =>
        Boolean(objective?.text?.trim()),
      )
      .map((objective) => ({
        text: objective.text.trim(),
        priority: objective.priority ?? null,
      })) ?? [];

  if (!objectives.length) {
    return NextResponse.json({ message: "At least one objective is required." }, { status: 400 });
  }

  const result = await generateSoaStrategyDrafts({
    clientName: payload?.clientName ?? null,
    objectives,
    scope: payload?.scope ?? null,
    riskProfile: payload?.riskProfile ?? null,
    intakeAssessment: payload?.intakeAssessment ?? null,
    uploadedFiles:
      payload?.uploadedFiles
        ?.filter((file): file is { name: string; kind?: string | null; extractedText?: string | null } => Boolean(file?.name?.trim()))
        .map((file) => ({
          name: file.name.trim(),
          kind: file.kind ?? null,
          extractedText: typeof file.extractedText === "string" ? file.extractedText : null,
        })) ?? [],
    recentMessages: payload?.recentMessages ?? null,
  });

  return NextResponse.json(result);
}
