import type { AdvicePersonV1, InsuranceAdvicePersonV1 } from "@/lib/soa-types";

export type InsuranceWorkspaceDraftValue = {
  clientProfileId?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  people?: AdvicePersonV1[];
  insuranceAdvice?: InsuranceAdvicePersonV1[];
  activeTab?: string | null;
  updatedAt?: string | null;
};

export function insuranceWorkspaceStorageKey(clientId: string | null | undefined) {
  return `finley:insurance-workspace:${clientId || "standalone"}`;
}

export function readInsuranceWorkspaceDraft(clientId: string | null | undefined): InsuranceWorkspaceDraftValue | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(insuranceWorkspaceStorageKey(clientId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as InsuranceWorkspaceDraftValue;
    return Array.isArray(parsed.insuranceAdvice) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeInsuranceWorkspaceDraft(
  clientId: string | null | undefined,
  draft: InsuranceWorkspaceDraftValue,
): InsuranceWorkspaceDraftValue | null {
  if (typeof window === "undefined") return null;

  const nextDraft = {
    ...draft,
    updatedAt: draft.updatedAt ?? new Date().toISOString(),
  };

  window.localStorage.setItem(insuranceWorkspaceStorageKey(clientId), JSON.stringify(nextDraft));
  return nextDraft;
}
