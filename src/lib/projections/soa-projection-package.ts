import type { FinancialProjectionV1 } from "@/lib/soa-types";

export const SOA_PROJECTION_PACKAGE_EVENT = "finley:soa-projection-package-updated";
export const SOA_PROJECTION_SCENARIO_OPTIONS_EVENT = "finley:soa-projection-scenario-options-updated";

export type SoaProjectionOutputPackage = {
  packageId: string;
  clientId: string;
  soaId: string;
  projectionCaseId: string;
  selectedScenarioId: string;
  selectedScenarioName: string;
  financialProjection: FinancialProjectionV1;
  createdAt: string;
  status: "selected-for-soa";
};

export function soaProjectionPackageStorageKey(clientId: string, soaId: string) {
  return `ic2:projection-package:${clientId}:${soaId}`;
}

export function soaProjectionScenarioOptionsStorageKey(clientId: string, soaId: string) {
  return `ic2:projection-package-options:${clientId}:${soaId}`;
}

export function readSoaProjectionPackage(clientId: string, soaId: string) {
  if (typeof window === "undefined" || !clientId || !soaId) {
    return null;
  }

  const raw = window.localStorage.getItem(soaProjectionPackageStorageKey(clientId, soaId));
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SoaProjectionOutputPackage;
  } catch {
    return null;
  }
}

export function readSoaProjectionScenarioOptions(clientId: string, soaId: string) {
  if (typeof window === "undefined" || !clientId || !soaId) {
    return [];
  }

  const raw = window.localStorage.getItem(soaProjectionScenarioOptionsStorageKey(clientId, soaId));
  if (!raw) {
    return [];
  }

  try {
    const value = JSON.parse(raw) as SoaProjectionOutputPackage[];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function writeSoaProjectionPackage(packageValue: SoaProjectionOutputPackage) {
  if (typeof window === "undefined" || !packageValue.clientId || !packageValue.soaId) {
    return;
  }

  window.localStorage.setItem(
    soaProjectionPackageStorageKey(packageValue.clientId, packageValue.soaId),
    JSON.stringify(packageValue),
  );
  window.dispatchEvent(new CustomEvent(SOA_PROJECTION_PACKAGE_EVENT, { detail: packageValue }));
}

export function writeSoaProjectionScenarioOptions(clientId: string, soaId: string, packages: SoaProjectionOutputPackage[]) {
  if (typeof window === "undefined" || !clientId || !soaId) {
    return;
  }

  window.localStorage.setItem(soaProjectionScenarioOptionsStorageKey(clientId, soaId), JSON.stringify(packages));
  window.dispatchEvent(new CustomEvent(SOA_PROJECTION_SCENARIO_OPTIONS_EVENT, { detail: packages }));
}
