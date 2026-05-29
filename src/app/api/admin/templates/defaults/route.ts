import { NextRequest, NextResponse } from "next/server";
import { FINLEY_MANAGED_TEMPLATES, getManagedFinleyTemplate } from "@/lib/finley-template-catalog";
import {
  deleteAppDefaultFinleyTemplate,
  readAppDefaultFinleyTemplate,
  readAppDefaultFinleyTemplateMetadata,
  renameAppDefaultFinleyTemplate,
  writeAppDefaultFinleyTemplate,
  writeAppDefaultFinleyTemplateMetadata,
} from "@/lib/finley-template-store";
import { buildAgreementTemplateSampleDocx } from "@/lib/agreement-docx-export";
import { buildEngagementLetterTemplateSampleDocx } from "@/lib/finley-engagement-template-docx";
import { validateFinleyTemplateDocx, type FinleyTemplateDocumentType } from "@/lib/finley-template-validation";

function isFinleyTemplateDocumentType(value: string): value is FinleyTemplateDocumentType {
  return Boolean(getManagedFinleyTemplate(value));
}

async function buildTemplateRow(documentType: FinleyTemplateDocumentType) {
  const template = getManagedFinleyTemplate(documentType);
  if (!template) {
    throw new Error(`Unknown Finley template type: ${documentType}`);
  }

  const storedTemplate = await readAppDefaultFinleyTemplate(documentType);
  const metadata = await readAppDefaultFinleyTemplateMetadata(documentType);
  const hasUploadedTemplate = Boolean(storedTemplate);

  return {
    ...template,
    displayName: metadata?.displayName || template.label,
    fileName: metadata?.fileName ?? "Generated Finley default",
    source: hasUploadedTemplate ? "Uploaded app default" : "Generated app default",
    lastModified: metadata?.uploadedAt ?? null,
    validation: metadata?.validation ?? null,
    uploadEnabled: template.mergeEnabled,
  };
}

async function buildGeneratedTemplateValidation(documentType: FinleyTemplateDocumentType) {
  if (documentType === "engagement-letter") {
    const sample = await buildEngagementLetterTemplateSampleDocx();
    return validateFinleyTemplateDocx(documentType, sample);
  }

  if (documentType === "ongoing-agreement" || documentType === "annual-agreement") {
    const sample = await buildAgreementTemplateSampleDocx(documentType);
    return validateFinleyTemplateDocx(documentType, sample);
  }

  return {
    documentType,
    valid: true,
    supportedFields: [],
    unknownFields: [],
    missingRequiredFields: [],
    imagePlaceholders: [],
    unsupportedConstructs: [],
    warnings: ["This template type remains on the coded fallback path in V1."],
  };
}

export async function GET() {
  const rows = await Promise.all(FINLEY_MANAGED_TEMPLATES.map((template) => buildTemplateRow(template.documentType)));

  return NextResponse.json({ templates: rows });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const documentType = String(formData.get("documentType") ?? "");
  const file = formData.get("file");

  if (!isFinleyTemplateDocumentType(documentType)) {
    return NextResponse.json({ message: "Unknown Finley template type." }, { status: 400 });
  }

  const template = getManagedFinleyTemplate(documentType);

  if (!template?.mergeEnabled) {
    return NextResponse.json(
      { message: `${template?.label ?? "This template"} is not upload-enabled in V1.` },
      { status: 400 },
    );
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "A DOCX template file is required." }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".docx")) {
    return NextResponse.json({ message: "Only DOCX templates can be uploaded." }, { status: 400 });
  }

  const content = Buffer.from(await file.arrayBuffer());
  const validation = await validateFinleyTemplateDocx(documentType, content);

  if (!validation.valid) {
    return NextResponse.json({ message: "Template validation failed.", validation }, { status: 422 });
  }

  const existingMetadata = await readAppDefaultFinleyTemplateMetadata(documentType);
  const metadata = await writeAppDefaultFinleyTemplate({
    documentType,
    fileName: file.name,
    content,
    validation,
    displayName: existingMetadata?.displayName ?? template.label,
  });

  return NextResponse.json({
    message: `${template.label} default template uploaded.`,
    template: await buildTemplateRow(documentType),
    validation: metadata.validation,
  });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null) as { documentType?: string; displayName?: string } | null;
  const documentType = String(body?.documentType ?? "");
  const displayName = String(body?.displayName ?? "").trim();

  if (!isFinleyTemplateDocumentType(documentType)) {
    return NextResponse.json({ message: "Unknown Finley template type." }, { status: 400 });
  }

  if (!displayName) {
    return NextResponse.json({ message: "Template name is required." }, { status: 400 });
  }

  const existingMetadata = await renameAppDefaultFinleyTemplate(documentType, displayName);

  if (!existingMetadata) {
    await writeAppDefaultFinleyTemplateMetadata({
      documentType,
      scope: "app-default",
      displayName,
      fileName: "Generated Finley default",
      uploadedAt: new Date().toISOString(),
      validation: await buildGeneratedTemplateValidation(documentType),
    });

    return NextResponse.json({
      message: "Template renamed.",
      template: await buildTemplateRow(documentType),
    });
  }

  return NextResponse.json({
    message: "Template renamed.",
    template: await buildTemplateRow(documentType),
  });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const documentType = searchParams.get("documentType") ?? "";

  if (!isFinleyTemplateDocumentType(documentType)) {
    return NextResponse.json({ message: "Unknown Finley template type." }, { status: 400 });
  }

  await deleteAppDefaultFinleyTemplate(documentType);

  return NextResponse.json({
    message: "Template reset to generated Finley default.",
    template: await buildTemplateRow(documentType),
  });
}
