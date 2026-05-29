import type { FinleyTemplateDocumentType } from "@/lib/finley-template-validation";

export type FinleyManagedTemplate = {
  documentType: FinleyTemplateDocumentType;
  label: string;
  description: string;
  engine: "Finley DOCX";
  scope: "Standalone document" | "Reusable section bundle";
  mergeEnabled: boolean;
  status: "Active" | "Planned";
};

export const FINLEY_MANAGED_TEMPLATES: FinleyManagedTemplate[] = [
  {
    documentType: "engagement-letter",
    label: "Engagement Letter",
    description: "Client engagement letter with fee estimate, scope of services, terms, and signature blocks.",
    engine: "Finley DOCX",
    scope: "Standalone document",
    mergeEnabled: true,
    status: "Active",
  },
  {
    documentType: "ongoing-agreement",
    label: "Ongoing Agreement",
    description: "Ongoing service agreement and fee consent sections.",
    engine: "Finley DOCX",
    scope: "Standalone document",
    mergeEnabled: true,
    status: "Active",
  },
  {
    documentType: "annual-agreement",
    label: "Annual Agreement",
    description: "Fixed-term annual agreement and fee consent sections.",
    engine: "Finley DOCX",
    scope: "Standalone document",
    mergeEnabled: true,
    status: "Active",
  },
  {
    documentType: "record-of-advice",
    label: "Record of Advice",
    description: "ROA advice update bundle with scope, recommendations, portfolio, fees, and authority sections.",
    engine: "Finley DOCX",
    scope: "Reusable section bundle",
    mergeEnabled: false,
    status: "Planned",
  },
];

export function getManagedFinleyTemplate(documentType: string) {
  return FINLEY_MANAGED_TEMPLATES.find((template) => template.documentType === documentType) ?? null;
}
