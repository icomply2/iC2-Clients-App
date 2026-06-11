"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientInsuranceRecord, ClientProfile, InsurancePolicyRecord } from "@/lib/api/types";
import { deleteFinancialCollectionItem, saveFinancialCollection } from "@/lib/services/profile-collections";
import styles from "./page.module.css";

type InsuranceSectionProps = {
  profile: ClientProfile;
  useMockFallback?: boolean;
};

type SelectOption = {
  value: string;
  label: string;
};

type InsuranceCover = {
  id: string;
  apiId: string | null;
  coverType: string;
  sumInsured: number | null;
  premiumAmount: number | null;
  premiumFrequency: string;
};

type InsurancePolicy = {
  id: string;
  apiId: string | null;
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

function toCurrencyNumber(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numericValue) ? numericValue : null;
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

function normalizeApiId(value: string | null | undefined) {
  const trimmedValue = value?.trim();
  return trimmedValue || null;
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

function normalizePolicyDetail(detail: InsurancePolicyRecord, index: number, duplicateIdCounts?: Map<string, number>): InsuranceCover {
  const rawApiId = normalizeApiId(detail.id);
  const apiId = rawApiId && (duplicateIdCounts?.get(rawApiId) ?? 1) === 1 ? rawApiId : null;

  return {
    id: apiId ?? createId(`cover-${index}`),
    apiId,
    coverType: detail.coverType ?? "",
    sumInsured: toCurrencyNumber(detail.sumInsured),
    premiumAmount: toCurrencyNumber(detail.premiumAmount),
    premiumFrequency: detail.premiumFrequency?.type ?? detail.premiumFrequency?.value ?? "Monthly",
  };
}

function normalizePolicyDetails(details: InsurancePolicyRecord[] | null | undefined) {
  const duplicateIdCounts = new Map<string, number>();
  for (const detail of details ?? []) {
    const apiId = normalizeApiId(detail.id);
    if (apiId) {
      duplicateIdCounts.set(apiId, (duplicateIdCounts.get(apiId) ?? 0) + 1);
    }
  }

  return (details ?? []).map((detail, index) => normalizePolicyDetail(detail, index, duplicateIdCounts));
}

function buildPoliciesFromProfileInsurance(records: ClientInsuranceRecord[] | null | undefined, ownerOptions: SelectOption[], superOptions: SelectOption[]) {
  return (records ?? []).map((record, index): InsurancePolicy => {
    const matchedOwner = findMatchingOption(record.owner?.id ?? record.owner?.name, ownerOptions);
    const matchedSuper = record.superFund?.id ? findMatchingOption(record.superFund.id, superOptions) : null;
    const apiId = normalizeApiId(record.id);

    return {
      id: apiId ?? createId(`policy-${index}`),
      apiId,
      ownerValue: matchedOwner?.value ?? record.owner?.id ?? "",
      ownerName: matchedOwner?.label ?? record.owner?.name ?? "",
      insurer: record.insurer ?? "",
      policyNumber: record.policyNumber ?? "",
      status: record.status ?? "Active",
      superFundValue: matchedSuper?.value ?? "",
      superFundName: matchedSuper?.label ?? "No linked super fund",
      covers: normalizePolicyDetails(record.policyDetails),
    };
  });
}

function toPolicyPayload(policy: InsurancePolicy): ClientInsuranceRecord {
  return {
    id: policy.apiId,
    owner: policy.ownerValue || policy.ownerName ? { id: policy.ownerValue || null, name: policy.ownerName || null } : null,
    policyNumber: policy.policyNumber.trim() || null,
    insurer: policy.insurer.trim() || null,
    status: policy.status || null,
    superFund: policy.superFundValue ? { id: policy.superFundValue, type: policy.superFundName || null } : { id: "", type: "" },
    policyDetails: policy.covers.map(toPolicyDetail),
  };
}

function calculatePolicyPremiumTotal(policy: InsurancePolicy) {
  return policy.covers.reduce((total, cover) => total + (cover.premiumAmount ?? 0), 0);
}

function toPolicyDetail(cover: InsuranceCover): InsurancePolicyRecord {
  return {
    id: cover.apiId,
    coverType: cover.coverType || null,
    sumInsured: cover.sumInsured === null ? null : cover.sumInsured.toFixed(2),
    premiumAmount: cover.premiumAmount === null ? null : cover.premiumAmount.toFixed(2),
    premiumFrequency: { type: cover.premiumFrequency || "", value: cover.premiumFrequency || "" },
  };
}

export function InsuranceSection({ profile, useMockFallback = false }: InsuranceSectionProps) {
  const router = useRouter();
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

  const profilePolicies = useMemo(
    () => buildPoliciesFromProfileInsurance(profile.insurance, ownerOptions, superOptions),
    [ownerOptions, profile.insurance, superOptions],
  );

  const [policies, setPolicies] = useState<InsurancePolicy[]>(profilePolicies);
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
    setPolicies(profilePolicies);
  }, [profilePolicies]);

  function getFallbackMessage() {
    return "Live client data is temporarily unavailable. Insurance changes in this screen are local only right now.";
  }

  async function savePolicyCollection(nextPolicies: InsurancePolicy[]) {
    if (useMockFallback) {
      throw new Error(getFallbackMessage());
    }

    if (!profile.id) {
      throw new Error("Unable to save insurance without a client profile id.");
    }

    const submittedRecords = nextPolicies.map(toPolicyPayload);
    const savedRecords = await saveFinancialCollection("insurance", profile.id, submittedRecords);
    const savedPolicies = buildPoliciesFromProfileInsurance(savedRecords ?? submittedRecords, ownerOptions, superOptions);
    setPolicies(savedPolicies);
    router.refresh();
    return savedPolicies;
  }

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
      apiId: existingPolicy?.apiId ?? null,
      ownerValue: owner.value,
      ownerName: owner.label,
      insurer: policyInsurer.trim(),
      policyNumber: policyNumber.trim(),
      status: policyStatus,
      superFundValue: policySuperFundId,
      superFundName: superFund?.label ?? "No linked super fund",
      covers: existingPolicy?.covers ?? [],
    };

    setIsSavingPolicy(true);
    setInsuranceError(null);

    try {
      const nextPolicies = editingPolicyId
        ? policies.map((policy) => (policy.id === editingPolicyId ? nextPolicy : policy))
        : [...policies, nextPolicy];
      await savePolicyCollection(nextPolicies);
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

    const activePolicy = policies.find((policy) => policy.id === activePolicyId);
    const existingCover = activePolicy?.covers.find((cover) => cover.id === editingCoverId) ?? null;
    const nextCover: InsuranceCover = {
      id: editingCoverId ?? createId("cover"),
      apiId: existingCover?.apiId ?? null,
      coverType,
      sumInsured: toNumberOrNull(coverSumInsured),
      premiumAmount: toNumberOrNull(coverPremiumAmount),
      premiumFrequency: coverFrequency,
    };

    setIsSavingCover(true);
    setInsuranceError(null);

    try {
      const nextPolicies = policies.map((policy) => {
        if (policy.id !== activePolicyId) {
          return policy;
        }

        return {
          ...policy,
          covers: editingCoverId ? policy.covers.map((cover) => (cover.id === editingCoverId ? nextCover : cover)) : [...policy.covers, nextCover],
        };
      });

      await savePolicyCollection(nextPolicies);

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
      const deletedPolicy = policies.find((policy) => policy.id === policyDeleteId);
      if (deletedPolicy?.apiId && profile.id) {
        await deleteFinancialCollectionItem("insurance", profile.id, deletedPolicy.apiId);
      }

      setPolicies((current) => current.filter((policy) => policy.id !== policyDeleteId));
      router.refresh();
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
      const activePolicy = policies.find((policy) => policy.id === coverDeleteState.policyId);

      if (!activePolicy) {
        setCoverDeleteState(null);
        return;
      }

      await savePolicyCollection(
        policies.map((policy) =>
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
      {insuranceError ? <p className={styles.actionNotice}>{insuranceError}</p> : null}

      <section className={styles.insurancePolicies}>
        {policies.length ? (
          policies.map((policy) => (
            <article key={policy.id} className={styles.policyCard}>
              {(() => {
                const totalPremium = calculatePolicyPremiumTotal(policy);

                return (
                  <>
              <div className={styles.policyHeader}>
                <div className={styles.policyMeta}>
                  <div><strong>Owner:</strong> {policy.ownerName || "-"}</div>
                  <div><strong>Insurer:</strong> {policy.insurer || "-"}</div>
                  <div><strong>Policy No:</strong> {policy.policyNumber}</div>
                  <div><strong>Status:</strong> {policy.status || "-"}</div>
                  <div><strong>Linked Super Fund:</strong> {policy.superFundName || "-"}</div>
                  <div><strong>Total Premium:</strong> {formatCurrency(totalPremium)}</div>
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
                <>
                  {policy.covers.map((cover) => (
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
                  ))}
                  <div className={styles.policyCoverSummaryRow}>
                    <div />
                    <div />
                    <div className={styles.policyCoverSummaryLabel}>{formatCurrency(totalPremium)}</div>
                    <div />
                    <div className={styles.entitiesActions}>
                      <span className={`${styles.rowActionButton} ${styles.policyActionSpacer}`} aria-hidden="true">
                        Edit
                      </span>
                      <span className={`${styles.rowActionButton} ${styles.policyActionSpacer}`} aria-hidden="true">
                        Delete
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className={styles.policyEmptyState}>No cover details</div>
              )}
                  </>
                );
              })()}
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
