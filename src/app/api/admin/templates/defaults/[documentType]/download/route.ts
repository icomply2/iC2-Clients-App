import { NextResponse } from "next/server";
import { buildEngagementLetterTemplateSampleDocx } from "@/lib/finley-engagement-template-docx";
import { getManagedFinleyTemplate } from "@/lib/finley-template-catalog";
import { readAppDefaultFinleyTemplate } from "@/lib/finley-template-store";
import type { FinleyTemplateDocumentType } from "@/lib/finley-template-validation";

const DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function sanitizeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim();
}

function isFinleyTemplateDocumentType(value: string): value is FinleyTemplateDocumentType {
  return Boolean(getManagedFinleyTemplate(value));
}

export async function GET(_request: Request, context: { params: Promise<{ documentType: string }> }) {
  const { documentType } = await context.params;

  if (!isFinleyTemplateDocumentType(documentType)) {
    return NextResponse.json({ message: "Unknown Finley template type." }, { status: 404 });
  }

  const template = getManagedFinleyTemplate(documentType);

  if (!template?.mergeEnabled) {
    return NextResponse.json({ message: `${template?.label ?? "This template"} is not downloadable yet.` }, { status: 404 });
  }

  const storedTemplate = await readAppDefaultFinleyTemplate(documentType);
  const buffer = storedTemplate?.content ?? await buildEngagementLetterTemplateSampleDocx();
  const fileName = storedTemplate?.metadata.fileName
    ?? `${sanitizeFilename(template.label) || "Finley"}-Default-Template.docx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": DOCX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
