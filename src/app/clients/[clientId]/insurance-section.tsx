"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClientInsuranceRecord, ClientPolicyRecord, ClientProfile, PolicyCoverRecord } from "@/lib/api/types";
import styles from "./page.module.css";

type InsuranceSectionProps = {
  clientId: string;
  profile: ClientProfile;
  useMockFallback?: boolean;
};

type SelectOption = {
  value: string;
  label: string;
};

type InsuranceCover = {
  id: string;
  coverType: string;
  sumInsured: number | null;
  premiumAmount: number | null;
  premiumFrequency: string;
};

type InsurancePolicy = {
  id: string;
  ownerValue: string;
  ownerName: string;
  insurer: string;
  policyNumber: string;
  status: string;
  superFundValue: string;
  superFundName: string;
  covers: InsuranceCover[];
};

const insuranceCoverOptions = ["Life", "TPD", "Trauma", "Income Protection", "Health", "Other"];
const insuranceStatusOptions = ["Active", "Pending", "Cancelled", "Claimed"];
const frequencyOptions = ["Weekly", "Fortnightly", "Monthly", "Quarterly", "Annually"];

function normalizeCurrencyInput(value: string) {
  const digitsOnly = value.replace(/[^\d.]/g, "");
  const firstDecimalIndex = digitsOnly.indexOf(".");

  if (firstDecimalIndex === -1) {
    return digitsOnly;
  }

  const integerPart = digitsOnly.slice(0, firstDecimalIndex + 1);
  const decimalPart = digitsOnly
    .slice(firstDecimalIndex + 1)
    .replace(/\./g, "")
    .slice(0, 2);

  return `${integerPart}${decimalPart}`;
}

function formatCurrencyField(value: string) {
  const normalizedValue = normalizeCurrencyInput(value);

  if (!normalizedValue) {
    return "";
  }

  const [integerPartRaw, decimalPartRaw = ""] = normalizedValue.split(".");
  const groupedIntegerPart = Number(integerPartRaw || "0").toLocaleString("en-AU");

  if (normalizedValue.includes(".")) {
    return `$${groupedIntegerPart}.${decimalPartRaw}`;
  }

  return `$${groupedIntegerPart}`;
}

function formatCurrency(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const numericValue = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numericValue)) {
    return String(value);
  }

  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue);
}

function toStoredCurrencyValue(value: string) {
  const normalizedValue = normalizeCurrencyInput(value);

  if (!normalizedValue) {
    return "";
  }

  const numericValue = Number(normalizedValue);
  return Number.isNaN(numericValue) ? "" : numericValue.toFixed(2);
}

function toNumberOrNull(value: string) {
  const storedValue = toStoredCurrencyValue(value);
  if (!storedValue) {
    return null;
  }

  const numericValue = Number(storedValue);
  return Number.isNaN(numericValue) ? null : numericValue;
}

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function findMatchingOption(rawValue: string | null | undefined, options: SelectOption[]) {
  const normalized = rawValue?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return (
    options.find((option) => option.value.trim().toLowerCase() === normalized) ??
    options.find((option) => option.label.trim().toLowerCase() === normalized) ??
    null
  );
}

function normalizePolicyCover(cover: PolicyCoverRecord): InsuranceCover {
  return {
    id: cover.id ?? createId("cover"),
    coverType: cover.coverType ?? "",
    sumInsured: typeof cover.sumInsured === "number" ? cover.sumInsured : null,
    premiumAmount: typeof cover.premiumAmount === "number" ? cover.premiumAmount : null,
    premiumFrequency: cover.premiumFrequency ?? "Monthly",
  };
}

function mapApiPolicyToViewModel(policy: ClientPolicyRecord, ownerOptions: SelectOption[], superOptions: SelectOption[]): InsurancePolicy {
  const matchedOwner = findMatchingOption(policy.policyOwner, ownerOptions);
  const matchedSuperFund = findMatchingOption(policy.linkedSuperFund, superOptions);

  return {
    id: policy.id ?? createId("policy"),
    ownerValue: matchedOwner?.value ?? "",
    ownerName: matchedOwner?.label ?? policy.policyOwner ?? "",
    insurer: policy.insurer ?? "",
    policyNumber: policy.policyNumber ?? "",
    status: policy.status ?? "Active",
    superFundValue: matchedSuperFund?.value ?? "",
    superFundName: matchedSuperFund?.label ?? policy.linkedSuperFund ?? "",
    covers: (policy.covers ?? []).map(normalizePolicyCover),
  };
}

function buildPoliciesFromLegacyRecords(records: ClientInsuranceRecord[] | null | undefined, ownerOptions: SelectOption[], superOptions: SelectOption[]) {
  const policies = new Map<string, InsurancePolicy>();

  for (const record of records ?? []) {
    const matchedOwner = findMatchingOption(record.owner?.id ?? record.owner?.name, ownerOptions);
    const matchedSuper = findMatchingOption(record.superFund?.id ?? record.superFund?.type, superOptions);
    const policyKey = [
      matchedOwner?.label ?? record.owner?.name ?? "",
      record.insurer ?? "",
      record.status ?? "Active",
      matchedSuper?.label ?? record.superFund?.type ?? "",
    ].join("|");

    if (!policies.has(policyKey)) {
      policies.set(policyKey, {
        id: createId("policy"),
        ownerValue: matchedOwner?.value ?? record.owner?.id ?? "",
        ownerName: matchedOwner?.label ?? record.owner?.name ?? "",
        insurer: record.insurer ?? "",
        policyNumber: "",
        status: record.status ?? "Active",
        superFundValue: matchedSuper?.value ?? record.superFund?.id ?? "",
        superFundName: matchedSuper?.label ?? record.superFund?.type ?? "",
        covers: [],
      });
    }

    const policy = policies.get(policyKey);
    if (!policy) {
      continue;
    }

    policy.covers.push({
      id: record.id ?? createId("cover"),
      coverType: record.coverRequired ?? "",
      sumInsured: record.sumInsured ? Number(record.sumInsured) : null,
      premiumAmount: record.premiumAmount ? Number(record.premiumAmount) : null,
      premiumFrequency: record.frequency?.value ?? record.frequency?.type ?? "Monthly",
    });
  }

  return Array.from(policies.values());
}

function toPolicyPayload(policy: InsurancePolicy, clientId: string): ClientPolicyRecord {
  return {
    id: policy.id.startsWith("policy-") ? null : policy.id,
    clientId,
    policyOwner: policy.ownerName || null,
    insurer: policy.insurer.trim() || null,
    policyNumber: policy.policyNumber.trim() || null,
    status: policy.status || null,
    linkedSuperFund: policy.superFundName || null,
    covers: policy.covers.map((cover) => ({
      id: cover.id.startsWith("cover-") ? null : cover.id,
      coverType: cover.coverType || null,
      sumInsured: cover.sumInsured,
      premiumAmount: cover.premiumAmount,
      premiumFrequency: cover.premiumFrequency || null,
    })),
  };
}

function toCoverPayload(cover: InsuranceCover): PolicyCoverRecord {
  return {
    id: cover.id.startsWith("cover-") ? null : cover.id,
    coverType: cover.coverType || null,
    sumInsured: cover.sumInsured,
    premiumAmount: cover.premiumAmount,
    premiumFrequency: cover.premiumFrequency || null,
  };
}

function getApiErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  if ("message" in payload && typeof payload.message === "string" && payload.message.trim()) {
    return payload.message;
  }

  if ("errors" in payload && payload.errors && typeof payload.errors === "object") {
    const entries = Object.values(payload.errors as Record<string, unknown>).flatMap((value) =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [],
    );
    if (entries.length) {
      return entries[0];
    }
  }

  if ("modelErrors" in payload && Array.isArray(payload.modelErrors) && payload.modelErrors.length) {
    const firstModelError = payload.modelErrors.find(
      (item): item is { errorMessage?: string | null } => Boolean(item && typeof item === "object"),
    );
    if (firstModelError?.errorMessage) {
      return firstModelError.errorMessage;
    }
  }

  return fallback;
}

export function InsuranceSection({ clientId, profile, useMockFallback = false }: InsuranceSectionProps) {
  const ownerOptions = useMemo(
    () =>
      [
        profile.client?.name && profile.client?.id ? { value: profile.client.id, label: profile.client.name } : null,
        profile.partner?.name && profile.partner?.id ? { value: profile.partner.id, label: profile.partner.name } : null,
        ...(profile.entities ?? [])
          .filter((entity) => entity.id && entity.name)
          .map((entity) => ({ value: entity.id ?? "", label: entity.name ?? "" })),
      ].filter((option): option is SelectOption => Boolean(option)),
    [profile.client?.id, profile.client?.name, profile.entities, profile.partner?.id, profile.partner?.name],
  );

  const superOptions = useMemo(
    () =>
      (profile.superannuation ?? [])
        .filter((item) => item.id)
        .map((item) => ({
          value: item.id ?? "",
          label: item.superFund ?? item.type ?? "Super Fund",
        })),
    [profile.superannuation],
  );

  const legacyPolicies = useMemo(
    () => buildPoliciesFromLegacyRecords(profile.insurance, ownerOptions, superOptions),
    [ownerOptions, profile.insurance, superOptions],
  );

  const [policies, setPolicies] = useState<InsurancePolicy[]>(legacyPolicies);
  const [isLoadingPolicies, setIsLoadingPolicies] = useState(false);
  const [insuranceError, setInsuranceError] = useState<string | null>(null);
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [policyDeleteId, setPolicyDeleteId] = useState<string | null>(null);
  const [policyOwnerId, setPolicyOwnerId] = useState(ownerOptions[0]?.value ?? "");
  const [policyInsurer, setPolicyInsurer] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [policyStatus, setPolicyStatus] = useState("Active");
  const [policySuperFundId, setPolicySuperFundId] = useState("");
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);

  const [isCoverModalOpen, setIsCoverModalOpen] = useState(false);
  const [activePolicyId, setActivePolicyId] = useState<string | null>(null);
  const [editingCoverId, setEditingCoverId] = useState<string | null>(null);
  const [coverDeleteState, setCoverDeleteState] = useState<{ policyId: string; coverId: string } | null>(null);
  const [coverType, setCoverType] = useState(insuranceCoverOptions[0]);
  const [coverSumInsured, setCoverSumInsured] = useState("");
  const [coverPremiumAmount, setCoverPremiumAmount] = useState("");
  const [coverFrequency, setCoverFrequency] = useState("Monthly");
  const [isSavingCover, setIsSavingCover] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function loadPolicies() {
      setIsLoadingPolicies(true);
      setInsuranceError(null);

      try {
        const response = await fetch(`/api/insurance/${encodeURIComponent(clientId)}/policies`, { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as { data?: ClientPolicyRecord[] | null; message?: string | null } | null;

        if (!response.ok) {
          throw new Error(getApiErrorMessage(payload, `Unable to load insurance right now (status ${response.status}).`));
        }

        if (isCancelled) {
          return;
        }

        setPolicies((payload?.data ?? []).map((policy) => mapApiPolicyToViewModel(policy, ownerOptions, superOptions)));
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setPolicies(legacyPolicies);
        setInsuranceError(error instanceof Error ? error.message : "Unable to load insurance right now.");
      } finally {
        if (!isCancelled) {
          setIsLoadingPolicies(false);
        }
      }
    }

    void loadPolicies();

    return () => {
      isCancelled = true;
    };
  }, [clientId, legacyPolicies, ownerOptions, superOptions]);

  function resetPolicyForm() {
    setPolicyOwnerId(ownerOptions[0]?.value ?? "");
    setPolicyInsurer("");
    setPolicyNumber("");
    setPolicyStatus("Active");
    setPolicySuperFundId("");
    setEditingPolicyId(null);
  }

  function resetCoverForm(policyId?: string | null) {
    setActivePolicyId(policyId ?? null);
    setEditingCoverId(null);
    setCoverType(insuranceCoverOptions[0]);
    setCoverSumInsured("");
    setCoverPremiumAmount("");
    setCoverFrequency("Monthly");
  }

  function openPolicyModal(policyId?: string) {
    if (!policyId) {
      resetPolicyForm();
      setIsPolicyModalOpen(true);
      return;
    }

    const policy = policies.find((item) => item.id === policyId);
    if (!policy) {
      return;
    }

    setEditingPolicyId(policy.id);
    setPolicyOwnerId(policy.ownerValue);
    setPolicyInsurer(policy.insurer);
    setPolicyNumber(policy.policyNumber);
    setPolicyStatus(policy.status);
    setPolicySuperFundId(policy.superFundValue);
    setIsPolicyModalOpen(true);
  }

  async function savePolicy() {
    const owner = ownerOptions.find((option) => option.value === policyOwnerId);
    if (!owner) {
      setInsuranceError("Please choose a policy owner.");
      return;
    }

    const superFund = superOptions.find((option) => option.value === policySuperFundId);
    const existingPolicy = policies.find((policy) => policy.id === editingPolicyId) ?? null;
    const nextPolicy: InsurancePolicy = {
      id: editingPolicyId ?? createId("policy"),
      ownerValue: owner.value,
      ownerName: owner.label,
      insurer: policyInsurer.trim(),
      policyNumber: policyNumber.trim(),
      status: policyStatus,
      superFundValue: policySuperFundId,
      superFundName: superFund?.label ?? "",
      covers: existingPolicy?.covers ?? [],
    };

    setIsSavingPolicy(true);
    setInsuranceError(null);

    try {
      const endpoint = editingPolicyId
        ? `/api/insurance/${encodeURIComponent(clientId)}/policy/${encodeURIComponent(editingPolicyId)}`
        : `/api/insurance/${encodeURIComponent(clientId)}/policy`;
      const method = editingPolicyId ? "PUT" : "POST";
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPolicyPayload(nextPolicy, clientId)),
      });

      const payload = (await response.json().catch(() => null)) as { data?: ClientPolicyRecord | null; message?: string | null } | null;

      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, `Unable to save insurance policy right now (status ${response.status}).`));
      }

      const savedPolicy = mapApiPolicyToViewModel(payload?.data ?? toPolicyPayload(nextPolicy, clientId), ownerOptions, superOptions);

      setPolicies((current) =>
        editingPolicyId ? current.map((policy) => (policy.id === editingPolicyId ? savedPolicy : policy)) : [...current, savedPolicy],
      );
      setIsPolicyModalOpen(false);
      resetPolicyForm();
    } catch (error) {
      setInsuranceError(error instanceof Error ? error.message : "Unable to save insurance policy right now.");
    } finally {
      setIsSavingPolicy(false);
    }
  }

  function openCoverModal(policyId: string, coverId?: string) {
    resetCoverForm(policyId);

    if (coverId) {
      const policy = policies.find((item) => item.id === policyId);
      const cover = policy?.covers.find((item) => item.id === coverId);

      if (cover) {
        setEditingCoverId(cover.id);
        setCoverType(cover.coverType || insuranceCoverOptions[0]);
        setCoverSumInsured(formatCurrencyField(String(cover.sumInsured ?? "")));
        setCoverPremiumAmount(formatCurrencyField(String(cover.premiumAmount ?? "")));
        setCoverFrequency(cover.premiumFrequency || "Monthly");
      }
    }

    setIsCoverModalOpen(true);
  }

  async function saveCover() {
    if (!activePolicyId) {
      return;
    }

    const nextCover: InsuranceCover = {
      id: editingCoverId ?? createId("cover"),
      coverType,
      sumInsured: toNumberOrNull(coverSumInsured),
      premiumAmount: toNumberOrNull(coverPremiumAmount),
      premiumFrequency: coverFrequency,
    };

    setIsSavingCover(true);
    setInsuranceError(null);

    try {
      const response = await fetch(`/api/insurance/${encodeURIComponent(clientId)}/policy/${encodeURIComponent(activePolicyId)}/covers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([toCoverPayload(nextCover)]),
      });

      const payload = (await response.json().catch(() => null)) as { data?: PolicyCoverRecord[] | null; message?: string | null } | null;

      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, `Unable to save insurance cover right now (status ${response.status}).`));
      }

      const returnedCover = payload?.data?.[0] ? normalizePolicyCover(payload.data[0]) : nextCover;

      setPolicies((current) =>
        current.map((policy) => {
          if (policy.id !== activePolicyId) {
            return policy;
          }

          return {
            ...policy,
            covers: editingCoverId
              ? policy.covers.map((cover) => (cover.id === editingCoverId ? returnedCover : cover))
              : [...policy.covers, returnedCover],
          };
        }),
      );

      setIsCoverModalOpen(false);
      resetCoverForm(null);
    } catch (error) {
      setInsuranceError(error instanceof Error ? error.message : "Unable to save insurance cover right now.");
    } finally {
      setIsSavingCover(false);
    }
  }

  async function deletePolicy() {
    if (!policyDeleteId) {
      return;
    }

    setInsuranceError(null);

    try {
      const response = await fetch(`/api/insurance/${encodeURIComponent(clientId)}/policy/${encodeURIComponent(policyDeleteId)}`, {
        method: "DELETE",
      });

      const payload = (await response.json().catch(() => null)) as { message?: string | null } | null;
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, `Unable to delete insurance policy right now (status ${response.status}).`));
      }

      setPolicies((current) => current.filter((policy) => policy.id !== policyDeleteId));
      setPolicyDeleteId(null);
    } catch (error) {
      setInsuranceError(error instanceof Error ? error.message : "Unable to delete insurance policy right now.");
    }
  }

  async function deleteCover() {
    if (!coverDeleteState) {
      return;
    }

    setInsuranceError(null);

    try {
      const response = await fetch(
        `/api/insurance/${encodeURIComponent(clientId)}/policy/${encodeURIComponent(coverDeleteState.policyId)}/covers/${encodeURIComponent(
          coverDeleteState.coverId,
        )}`,
        { method: "DELETE" },
      );

      const payload = (await response.json().catch(() => null)) as { message?: string | null } | null;
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, `Unable to delete insurance cover right now (status ${response.status}).`));
      }

      setPolicies((current) =>
        current.map((policy) =>
          policy.id === coverDeleteState.policyId
            ? {
                ...policy,
                covers: policy.covers.filter((cover) => cover.id !== coverDeleteState.coverId),
              }
            : policy,
        ),
      );
      setCoverDeleteState(null);
    } catch (error) {
      setInsuranceError(error instanceof Error ? error.message : "Unable to delete insurance cover right now.");
    }
  }

  return (
    <>
      <div className={styles.sectionHeader}>
        <h1 className={styles.title}>Insurance</h1>
        <button type="button" className={styles.plusButton} aria-label="Add insurance policy" onClick={() => openPolicyModal()}>
          +
        </button>
      </div>

      {useMockFallback ? <p className={styles.actionNotice}>Live client data is temporarily unavailable. Insurance changes in this screen are local only right now.</p> : null}
      {isLoadingPolicies ? <p className={styles.dataNotice}>Loading insurance policies...</p> : null}
      {insuranceError ? <p className={styles.actionNotice}>{insuranceError}</p> : null}

      <section className={styles.insurancePolicies}>
        {policies.length ? (
          policies.map((policy) => (
            <article key={policy.id} className={styles.policyCard}>
              <div className={styles.policyHeader}>
                <div className={styles.policyMeta}>
                  <div><strong>Owner:</strong> {policy.ownerName || "-"}</div>
                  <div><strong>Insurer:</strong> {policy.insurer || "-"}</div>
                  <div><strong>Policy No:</strong> {policy.policyNumber || "-"}</div>
                  <div><strong>Status:</strong> {policy.status || "-"}</div>
                  <div><strong>Linked Super Fund:</strong> {policy.superFundName || "-"}</div>
                </div>
                <div className={styles.entitiesActions}>
                  <button type="button" className={styles.rowActionButton} onClick={() => openPolicyModal(policy.id)}>
                    Edit Policy
                  </button>
                  <button type="button" className={styles.rowActionButton} onClick={() => openCoverModal(policy.id)}>
                    Add Cover
                  </button>
                  <button
                    type="button"
                    className={`${styles.rowActionButton} ${styles.rowActionDanger}`.trim()}
                    onClick={() => setPolicyDeleteId(policy.id)}
                  >
                    Delete Policy
                  </button>
                </div>
              </div>

              <div className={styles.policyCoverHeader}>
                <div>Cover Type</div>
                <div>Sum Insured</div>
                <div>Premium</div>
                <div>Frequency</div>
                <div className={styles.entitiesActionsHeader}></div>
              </div>

              {policy.covers.length ? (
                policy.covers.map((cover) => (
                  <div key={cover.id} className={styles.policyCoverRow}>
                    <div>{cover.coverType}</div>
                    <div>{formatCurrency(cover.sumInsured)}</div>
                    <div>{formatCurrency(cover.premiumAmount)}</div>
                    <div>{cover.premiumFrequency}</div>
                    <div className={styles.entitiesActions}>
                      <button type="button" className={styles.rowActionButton} onClick={() => openCoverModal(policy.id, cover.id)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className={`${styles.rowActionButton} ${styles.rowActionDanger}`.trim()}
                        onClick={() => setCoverDeleteState({ policyId: policy.id, coverId: cover.id })}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className={styles.policyEmptyState}>No cover details added yet for this policy.</div>
              )}
            </article>
          ))
        ) : (
          <div className={styles.policyEmptyState}>No insurance policies yet. Create a policy first, then add its cover details.</div>
        )}
      </section>

      {isPolicyModalOpen ? (
        <div className={styles.modalOverlay}>
          <div className={styles.financialModalCard}>
            <div className={styles.identityModalHeader}>{editingPolicyId ? "Edit Insurance Policy" : "Add Insurance Policy"}</div>
            <div className={styles.identityModalBody}>
              <SelectRow label="Policy Owner" value={policyOwnerId} onChange={setPolicyOwnerId} options={ownerOptions} />
              <InputRow label="Insurer" value={policyInsurer} onChange={setPolicyInsurer} />
              <InputRow label="Policy Number" value={policyNumber} onChange={setPolicyNumber} />
              <SelectRow
                label="Status"
                value={policyStatus}
                onChange={setPolicyStatus}
                options={insuranceStatusOptions.map((value) => ({ value, label: value }))}
              />
              <SelectRow label="Linked Super Fund" value={policySuperFundId} onChange={setPolicySuperFundId} options={[{ value: "", label: "" }, ...superOptions]} />
            </div>
            <div className={styles.identityModalActions}>
              <button type="button" className={styles.identityCreateButton} onClick={savePolicy} disabled={isSavingPolicy}>
                {isSavingPolicy ? "Saving..." : editingPolicyId ? "Save" : "Create"}
              </button>
              <button type="button" className={styles.modalSecondary} onClick={() => setIsPolicyModalOpen(false)} disabled={isSavingPolicy}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCoverModalOpen ? (
        <div className={styles.modalOverlay}>
          <div className={styles.financialModalCard}>
            <div className={styles.identityModalHeader}>{editingCoverId ? "Edit Cover Detail" : "Add Cover Detail"}</div>
            <div className={styles.identityModalBody}>
              <SelectRow label="Cover Type" value={coverType} onChange={setCoverType} options={insuranceCoverOptions.map((value) => ({ value, label: value }))} />
              <CurrencyRow label="Sum Insured" value={coverSumInsured} onChange={setCoverSumInsured} />
              <CurrencyRow label="Premium Amount" value={coverPremiumAmount} onChange={setCoverPremiumAmount} />
              <SelectRow label="Frequency" value={coverFrequency} onChange={setCoverFrequency} options={frequencyOptions.map((value) => ({ value, label: value }))} />
            </div>
            <div className={styles.identityModalActions}>
              <button type="button" className={styles.identityCreateButton} onClick={saveCover} disabled={isSavingCover}>
                {isSavingCover ? "Saving..." : editingCoverId ? "Save" : "Add"}
              </button>
              <button type="button" className={styles.modalSecondary} onClick={() => setIsCoverModalOpen(false)} disabled={isSavingCover}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {policyDeleteId ? (
        <div className={styles.modalOverlay}>
          <div className={styles.confirmDialog}>
            <h2 className={styles.confirmTitle}>Delete Policy</h2>
            <p className={styles.confirmText}>Are you sure you want to delete this insurance policy and all of its cover details?</p>
            <div className={styles.confirmActions}>
              <button type="button" className={`${styles.modalPrimary} ${styles.confirmDanger}`.trim()} onClick={deletePolicy}>
                Delete
              </button>
              <button type="button" className={styles.modalSecondary} onClick={() => setPolicyDeleteId(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {coverDeleteState ? (
        <div className={styles.modalOverlay}>
          <div className={styles.confirmDialog}>
            <h2 className={styles.confirmTitle}>Delete Cover Detail</h2>
            <p className={styles.confirmText}>Are you sure you want to delete this cover detail?</p>
            <div className={styles.confirmActions}>
              <button type="button" className={`${styles.modalPrimary} ${styles.confirmDanger}`.trim()} onClick={deleteCover}>
                Delete
              </button>
              <button type="button" className={styles.modalSecondary} onClick={() => setCoverDeleteState(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function InputRow({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className={styles.identityFieldRow}>
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function CurrencyRow({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className={styles.identityFieldRow}>
      <span>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(formatCurrencyField(event.target.value))}
        inputMode="decimal"
        placeholder="$0.00"
      />
    </label>
  );
}

function SelectRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className={styles.identityFieldRow}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
