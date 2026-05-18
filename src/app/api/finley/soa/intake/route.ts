import { NextRequest, NextResponse } from "next/server";
import type { IntakeAssessmentV1 } from "@/lib/soa-output-contracts";
import { mapFactFindEvidenceFromText, type SharedFactFindMappingResult } from "@/lib/fact-find-mapping";
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
    activeFollowUpQuestion?: string | null;
    answeredFollowUpResponses?: Record<string, string> | null;
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

  const uploadedFiles =
    payload?.uploadedFiles
      ?.filter((file): file is IntakeUploadPayload & { name: string } => Boolean(file?.name?.trim()))
      .map((file) => ({
        name: file.name.trim(),
        kind: file.kind ?? null,
        extractedText: typeof file.extractedText === "string" ? file.extractedText : null,
      })) ?? [];
  const sharedFactFindResults = await Promise.all(
    uploadedFiles
      .filter((file) => isLikelyFactFindUpload(file))
      .map(async (file) => {
        try {
          return await mapFactFindEvidenceFromText({
            sourceFileName: file.name,
            extractedText: file.extractedText ?? "",
            clientName: payload?.clientName ?? null,
          });
        } catch {
          return null;
        }
      }),
  );
  const factFindResults = sharedFactFindResults.filter((result): result is SharedFactFindMappingResult => Boolean(result));
  const enrichedUploadedFiles = uploadedFiles.map((file) => {
    const shared = factFindResults.find((result) => result.candidate.sourceFileName === file.name);
    if (!shared) return file;

    return {
      ...file,
      extractedText: [
        file.extractedText,
        "Shared fact-find evidence:",
        shared.documentInsight.summary,
        ...shared.documentInsight.extractedFacts,
        ...shared.evidenceBackedConfirmations.map((confirmation) => `Confirm: ${confirmation}`),
      ]
        .filter(Boolean)
        .join("\n"),
    };
  });

  const result = await generateSoaIntakeAssessment({
    clientName: payload?.clientName ?? null,
    adviserMessage,
    uploadedFiles: enrichedUploadedFiles,
    currentAssessment: payload?.currentAssessment ?? null,
    recentMessages: payload?.recentMessages ?? null,
    activeFollowUpQuestion: payload?.activeFollowUpQuestion ?? null,
    answeredFollowUpResponses: payload?.answeredFollowUpResponses ?? null,
  });

  return NextResponse.json({
    ...result,
    assessment: mergeSharedFactFindEvidence(result.assessment, factFindResults),
  });
}

function isLikelyFactFindUpload(file: { name?: string | null; extractedText?: string | null }) {
  const normalized = `${file.name ?? ""}\n${file.extractedText ?? ""}`.toLowerCase();
  return (
    normalized.includes("fact find") ||
    normalized.includes("fact-find") ||
    normalized.includes("factfind") ||
    normalized.includes("client data form") ||
    normalized.includes("financial profile") ||
    (normalized.includes("personal details") &&
      (normalized.includes("assets and liabilities") || normalized.includes("income and expenses") || normalized.includes("superannuation")))
  );
}

function mergeSharedFactFindEvidence(assessment: IntakeAssessmentV1, results: SharedFactFindMappingResult[]) {
  if (!results.length) {
    return assessment;
  }

  const existingDocumentKeys = new Set(
    (assessment.documentInsights ?? []).map((insight) => `${insight.fileName}:${insight.documentType}`),
  );
  const sharedInsights = results
    .map((result) => result.documentInsight)
    .filter((insight) => !existingDocumentKeys.has(`${insight.fileName}:${insight.documentType}`));
  const evidenceBackedConfirmations = [
    ...(assessment.evidenceBackedConfirmations ?? []),
    ...results.flatMap((result) => result.evidenceBackedConfirmations),
  ].filter((item, index, items) => item && items.indexOf(item) === index);

  return {
    ...assessment,
    documentInsights: [...(assessment.documentInsights ?? []), ...sharedInsights],
    evidenceBackedConfirmations,
  };
}
