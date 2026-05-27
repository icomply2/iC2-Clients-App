import type { ClientProfile } from "@/lib/api/types";
import type { DocumentStyleProfile } from "@/lib/documents/document-style-profile";
import {
  buildEngagementLetterTemplateOutputName,
  renderEngagementLetterTemplateDocx,
} from "@/lib/finley-engagement-template-docx";

export type EngagementLetterDocxInput = {
  reasonsHtml?: string | null;
  servicesHtml?: string | null;
  advicePreparationFee?: string | null;
  implementationFee?: string | null;
  documentStyleProfile?: Partial<DocumentStyleProfile> | null;
};

export function buildEngagementLetterOutputName(profile: ClientProfile) {
  return buildEngagementLetterTemplateOutputName(profile);
}

export async function renderEngagementLetterDocx(profile: ClientProfile, draft: EngagementLetterDocxInput = {}) {
  return renderEngagementLetterTemplateDocx(profile, draft);
}
