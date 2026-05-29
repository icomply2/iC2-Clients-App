import { NextRequest, NextResponse } from "next/server";
import { mapFactFindEvidenceFromFile } from "@/lib/fact-find-mapping";

export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Upload a fact find file before running the projection model." }, { status: 400 });
  }

  try {
    const mapped = await mapFactFindEvidenceFromFile(file);

    return NextResponse.json({
      scenario: mapped.scenario,
      mappingNotes: mapped.mappingNotes,
      confirmationsRequired: mapped.confirmationsRequired,
      source: mapped.source,
      model: mapped.model,
      warning: mapped.warning ?? mapped.warnings[0] ?? null,
      extractedTextLength: mapped.extractedTextLength,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to map this fact find into a projection scenario." },
      { status: 400 },
    );
  }
}
