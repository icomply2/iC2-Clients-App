import { NextRequest, NextResponse } from "next/server";
import {
  readLicenseeFinleyTemplateMetadata,
  writeLicenseeFinleyTemplate,
} from "@/lib/finley-template-store";
import {
  validateFinleyTemplateDocx,
  type FinleyTemplateDocumentType,
} from "@/lib/finley-template-validation";

const DOCUMENT_TYPES = new Set<FinleyTemplateDocumentType>([
  "engagement-letter",
  "ongoing-agreement",
  "annual-agreement",
  "record-of-advice",
]);

function normalizeDocumentType(value?: string | null): FinleyTemplateDocumentType | null {
  if (value && DOCUMENT_TYPES.has(value as FinleyTemplateDocumentType)) {
    return value as FinleyTemplateDocumentType;
  }

  return null;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const documentType = normalizeDocumentType(searchParams.get("documentType"));
  const licenseeId = searchParams.get("licenseeId")?.trim();

  if (!documentType || !licenseeId) {
    return NextResponse.json({ message: "documentType and licenseeId are required." }, { status: 400 });
  }

  const metadata = await readLicenseeFinleyTemplateMetadata(documentType, licenseeId);

  return NextResponse.json(
    {
      data: metadata
        ? { source: "licensee", metadata }
        : { source: "finley-default", metadata: null },
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const documentType = normalizeDocumentType(String(formData.get("documentType") ?? ""));
  const licenseeId = String(formData.get("licenseeId") ?? "").trim();
  const file = formData.get("file");

  if (!documentType || !licenseeId || !(file instanceof File)) {
    return NextResponse.json(
      { message: "documentType, licenseeId and file are required." },
      { status: 400 },
    );
  }

  if (!file.name.toLowerCase().endsWith(".docx")) {
    return NextResponse.json({ message: "Only .docx templates are supported." }, { status: 400 });
  }

  const content = Buffer.from(await file.arrayBuffer());
  const validation = await validateFinleyTemplateDocx(documentType, content);

  if (!validation.valid) {
    return NextResponse.json(
      {
        data: {
          stored: false,
          validation,
        },
      },
      { status: 422 },
    );
  }

  const metadata = await writeLicenseeFinleyTemplate({
    documentType,
    licenseeId,
    fileName: file.name,
    content,
    validation,
  });

  return NextResponse.json(
    {
      data: {
        stored: true,
        metadata,
        validation,
      },
    },
    { status: 200 },
  );
}
