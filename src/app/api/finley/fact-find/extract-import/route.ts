import { NextRequest, NextResponse } from "next/server";
import {
  mapFactFindEvidenceFromFile,
  mapFactFindEvidenceFromText,
} from "@/lib/fact-find-mapping";

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  try {
    const mapped = contentType.includes("multipart/form-data")
      ? await mapFromFormData(request)
      : await mapFromJson(request);
    const candidateWarnings = [
      ...mapped.candidate.warnings,
      ...mapped.warnings,
    ].filter((warning, index, warnings) => warning && warnings.indexOf(warning) === index);

    return NextResponse.json({
      candidate: {
        ...mapped.candidate,
        warnings: candidateWarnings,
      },
      source: mapped.source,
      model: mapped.model,
      warning: mapped.warning ?? null,
      mappingNotes: mapped.mappingNotes,
      confirmationsRequired: mapped.confirmationsRequired,
      documentInsight: mapped.documentInsight,
      evidenceBackedConfirmations: mapped.evidenceBackedConfirmations,
      extractedTextLength: mapped.extractedTextLength,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to inspect fact find right now." },
      { status: 400 },
    );
  }
}

async function mapFromFormData(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const clientName = typeof formData?.get("clientName") === "string" ? String(formData.get("clientName")) : null;

  if (!(file instanceof File)) {
    throw new Error("A fact find file is required.");
  }

  return mapFactFindEvidenceFromFile(file, clientName);
}

async function mapFromJson(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | {
        fileName?: string | null;
        extractedText?: string | null;
        clientName?: string | null;
      }
    | null;

  return mapFactFindEvidenceFromText({
    sourceFileName: body?.fileName ?? "",
    extractedText: body?.extractedText ?? "",
    clientName: body?.clientName ?? null,
  });
}
