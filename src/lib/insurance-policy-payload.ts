import type { ClientPolicyRecord } from "@/lib/api/types";

export const PERSONALLY_HELD_INSURANCE_LABEL = "Held personally";

export function normalizeInsurancePolicyPayload(policy: ClientPolicyRecord): ClientPolicyRecord {
  return {
    ...policy,
    linkedSuperFund: policy.linkedSuperFund?.trim() || PERSONALLY_HELD_INSURANCE_LABEL,
  };
}

export function displayLinkedSuperFund(value: string | null | undefined) {
  return value === PERSONALLY_HELD_INSURANCE_LABEL ? "" : value ?? "";
}
