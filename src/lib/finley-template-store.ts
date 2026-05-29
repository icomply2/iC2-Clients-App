import "server-only";

import { promises as fs } from "fs";
import path from "path";
import type {
  FinleyTemplateDocumentType,
  FinleyTemplateValidationResult,
} from "@/lib/finley-template-validation";

export type StoredFinleyTemplateMetadata = {
  documentType: FinleyTemplateDocumentType;
  licenseeId?: string;
  scope?: "licensee" | "app-default";
  displayName?: string;
  fileName: string;
  uploadedAt: string;
  validation: FinleyTemplateValidationResult;
};

const STORE_DIR = path.join(process.cwd(), ".codex-temp", "finley-document-templates");
const APP_DEFAULT_SCOPE = "__finley_app_default__";

function safeSegment(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, "_");
}

function templateBasePath(documentType: FinleyTemplateDocumentType, licenseeId: string) {
  return path.join(STORE_DIR, safeSegment(licenseeId), safeSegment(documentType));
}

function templateDocxPath(documentType: FinleyTemplateDocumentType, licenseeId: string) {
  return path.join(templateBasePath(documentType, licenseeId), "template.docx");
}

function templateMetadataPath(documentType: FinleyTemplateDocumentType, licenseeId: string) {
  return path.join(templateBasePath(documentType, licenseeId), "metadata.json");
}

function appDefaultBasePath(documentType: FinleyTemplateDocumentType) {
  return templateBasePath(documentType, APP_DEFAULT_SCOPE);
}

function appDefaultDocxPath(documentType: FinleyTemplateDocumentType) {
  return templateDocxPath(documentType, APP_DEFAULT_SCOPE);
}

function appDefaultMetadataPath(documentType: FinleyTemplateDocumentType) {
  return templateMetadataPath(documentType, APP_DEFAULT_SCOPE);
}

export async function readLicenseeFinleyTemplate(
  documentType: FinleyTemplateDocumentType,
  licenseeId?: string | null,
) {
  if (!licenseeId) {
    return null;
  }

  try {
    const [content, metadataRaw] = await Promise.all([
      fs.readFile(templateDocxPath(documentType, licenseeId)),
      fs.readFile(templateMetadataPath(documentType, licenseeId), "utf8"),
    ]);

    return {
      content,
      metadata: JSON.parse(metadataRaw) as StoredFinleyTemplateMetadata,
    };
  } catch {
    return null;
  }
}

export async function readLicenseeFinleyTemplateMetadata(
  documentType: FinleyTemplateDocumentType,
  licenseeId?: string | null,
) {
  if (!licenseeId) {
    return null;
  }

  try {
    const metadataRaw = await fs.readFile(templateMetadataPath(documentType, licenseeId), "utf8");
    return JSON.parse(metadataRaw) as StoredFinleyTemplateMetadata;
  } catch {
    return null;
  }
}

export async function writeLicenseeFinleyTemplate({
  documentType,
  licenseeId,
  fileName,
  content,
  validation,
}: {
  documentType: FinleyTemplateDocumentType;
  licenseeId: string;
  fileName: string;
  content: Buffer;
  validation: FinleyTemplateValidationResult;
}) {
  const basePath = templateBasePath(documentType, licenseeId);
  const metadata: StoredFinleyTemplateMetadata = {
    documentType,
    licenseeId,
    scope: "licensee",
    fileName,
    uploadedAt: new Date().toISOString(),
    validation,
  };

  await fs.mkdir(basePath, { recursive: true });
  await Promise.all([
    fs.writeFile(templateDocxPath(documentType, licenseeId), content),
    fs.writeFile(templateMetadataPath(documentType, licenseeId), JSON.stringify(metadata, null, 2), "utf8"),
  ]);

  return metadata;
}

export async function readAppDefaultFinleyTemplate(documentType: FinleyTemplateDocumentType) {
  try {
    const [content, metadataRaw] = await Promise.all([
      fs.readFile(appDefaultDocxPath(documentType)),
      fs.readFile(appDefaultMetadataPath(documentType), "utf8"),
    ]);

    return {
      content,
      metadata: JSON.parse(metadataRaw) as StoredFinleyTemplateMetadata,
    };
  } catch {
    return null;
  }
}

export async function readAppDefaultFinleyTemplateMetadata(documentType: FinleyTemplateDocumentType) {
  try {
    const metadataRaw = await fs.readFile(appDefaultMetadataPath(documentType), "utf8");
    return JSON.parse(metadataRaw) as StoredFinleyTemplateMetadata;
  } catch {
    return null;
  }
}

export async function writeAppDefaultFinleyTemplate({
  documentType,
  fileName,
  content,
  validation,
  displayName,
}: {
  documentType: FinleyTemplateDocumentType;
  fileName: string;
  content: Buffer;
  validation: FinleyTemplateValidationResult;
  displayName?: string;
}) {
  const basePath = appDefaultBasePath(documentType);
  const metadata: StoredFinleyTemplateMetadata = {
    documentType,
    scope: "app-default",
    fileName,
    displayName,
    uploadedAt: new Date().toISOString(),
    validation,
  };

  await fs.mkdir(basePath, { recursive: true });
  await Promise.all([
    fs.writeFile(appDefaultDocxPath(documentType), content),
    fs.writeFile(appDefaultMetadataPath(documentType), JSON.stringify(metadata, null, 2), "utf8"),
  ]);

  return metadata;
}

export async function writeAppDefaultFinleyTemplateMetadata(metadata: StoredFinleyTemplateMetadata) {
  const basePath = appDefaultBasePath(metadata.documentType);

  await fs.mkdir(basePath, { recursive: true });
  await fs.writeFile(appDefaultMetadataPath(metadata.documentType), JSON.stringify(metadata, null, 2), "utf8");

  return metadata;
}

export async function renameAppDefaultFinleyTemplate(
  documentType: FinleyTemplateDocumentType,
  displayName: string,
) {
  const existing = await readAppDefaultFinleyTemplateMetadata(documentType);

  if (!existing) {
    return null;
  }

  const metadata: StoredFinleyTemplateMetadata = {
    ...existing,
    displayName,
    uploadedAt: new Date().toISOString(),
  };

  await fs.writeFile(appDefaultMetadataPath(documentType), JSON.stringify(metadata, null, 2), "utf8");

  return metadata;
}

export async function deleteAppDefaultFinleyTemplate(documentType: FinleyTemplateDocumentType) {
  await fs.rm(appDefaultBasePath(documentType), { recursive: true, force: true });
}
