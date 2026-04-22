import type { AdviceCaseV1, ProductRexReportV1, RiskProfileV1 } from "@/lib/soa-types";
import type { IntakeAssessmentV1 } from "@/lib/soa-output-contracts";

export type SoaScenarioMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  intakeAssessment?: IntakeAssessmentV1 | null;
};

export type SoaScenarioUpload = {
  id: string;
  kind: "supporting-file";
  name: string;
  mimeType?: string | null;
  extractedText?: string | null;
  productRexReport?: ProductRexReportV1 | null;
};

export type SoaScenarioDraftValue = {
  activeSectionId: string;
  adviceCase: AdviceCaseV1;
  messages: SoaScenarioMessage[];
  uploads: SoaScenarioUpload[];
  workflowStarted: boolean;
  workflowChatStartIndex: number | null;
  selectedProductRexUploadId: string | null;
  intakeAssessment: IntakeAssessmentV1 | null;
  confirmedSections: Record<string, boolean>;
  answeredFollowUpQuestions: string[];
  answeredFollowUpResponses: Record<string, string>;
  activeInsurancePersonId: string | null;
  activeRiskPersonId: string | null;
  riskProfilesByPerson: Record<string, RiskProfileV1>;
};

export type SoaScenario = {
  id: string;
  name: string;
  status: "Draft";
  createdAt: string;
  updatedAt: string;
  draft: SoaScenarioDraftValue | null;
};

export function soaScenarioStorageKey(clientId: string) {
  return `ic2:advice-scenarios:${clientId}:statement-of-advice`;
}

export function readSoaScenarios(clientId: string) {
  if (typeof window === "undefined" || !clientId) {
    return [] as SoaScenario[];
  }

  const raw = window.localStorage.getItem(soaScenarioStorageKey(clientId));
  if (!raw) {
    return [] as SoaScenario[];
  }

  try {
    const parsed = JSON.parse(raw) as SoaScenario[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as SoaScenario[];
  }
}

export function writeSoaScenarios(clientId: string, scenarios: SoaScenario[]) {
  if (typeof window === "undefined" || !clientId) {
    return;
  }

  window.localStorage.setItem(soaScenarioStorageKey(clientId), JSON.stringify(scenarios));
}

export function getSoaScenario(clientId: string, soaId: string) {
  return readSoaScenarios(clientId).find((scenario) => scenario.id === soaId) ?? null;
}

export function upsertSoaScenario(clientId: string, nextScenario: SoaScenario) {
  const current = readSoaScenarios(clientId);
  const existingIndex = current.findIndex((scenario) => scenario.id === nextScenario.id);
  const nextScenarios = [...current];

  if (existingIndex >= 0) {
    nextScenarios[existingIndex] = nextScenario;
  } else {
    nextScenarios.unshift(nextScenario);
  }

  writeSoaScenarios(clientId, nextScenarios);
  return nextScenarios;
}
