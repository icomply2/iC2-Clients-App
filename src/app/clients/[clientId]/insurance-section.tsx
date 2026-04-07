"use client";

import { useMemo, useState } from "react";
import type { ClientInsuranceRecord, ClientProfile } from "@/lib/api/types";
import styles from "./page.module.css";

type InsuranceSectionProps = {
  profile: ClientProfile;
  useMockFallback?: boolean;
};

type InsuranceCover = {
  id: string;
  coverType: string;
  sumInsured: string;
  premiumAmount: string;
  frequency: string;
};

type InsurancePolicy = {
  id: string;
  ownerId: string;
  ownerName: string;
  insurer: string;
  policyNumber: string;
  status: string;
  superFundId: string;
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

function formatCurrency(value?: string | null) {
  if (!value) {
    return "";
  }

  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    return value;
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

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildPoliciesFromFlatRecords(
  records: ClientInsuranceRecord[] | null | undefined,
  ownerLookup: Map<string, string>,
) {
  const policies = new Map<string, InsurancePolicy>();

  for (const record of records ?? []) {
    const ownerId = record.owner?.id ?? "";
    const ownerName = record.owner?.name ?? ownerLookup.get(ownerId) ?? "";
    const insurer = record.insurer ?? "";
    const status = record.status ?? "Active";
    const superFundId = record.superFund?.id ?? "";
    const superFundName = record.superFund?.type ?? "";
    const policyKey = [ownerId, insurer, status, superFundId].join("|");

    if (!policies.has(policyKey)) {
      policies.set(policyKey, {
        id: createId("policy"),
        ownerId,
        ownerName,
        insurer,
        policyNumber: "",
        status,
        superFundId,
        superFundName,
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
      sumInsured: record.sumInsured ?? "",
      premiumAmount: record.premiumAmount ?? "",
      frequency: record.frequency?.value ?? record.frequency?.type ?? "Monthly",
    });
  }

  return Array.from(policies.values());
}

export function InsuranceSection({ profile, useMockFallback = false }: InsuranceSectionProps) {
  const ownerOptions = useMemo(
    () =>
      [
        profile.client?.name && profile.client?.id ? { value: profile.client.id, label: profile.client.name } : null,
        profile.partner?.name && profile.partner?.id ? { value: profile.partner.id, label: profile.partner.name } : null,
        ...(profile.entities ?? [])
          .filter((entity) => entity.id && entity.name)
          .map((entity) => ({ value: entity.id ?? "", label: entity.name ?? "" })),
      ].filter((option): option is { value: string; label: string } => Boolean(option)),
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

  const initialPolicies = useMemo(() => {
    const ownerLookup = new Map(ownerOptions.map((option) => [option.value, option.label]));
    return buildPoliciesFromFlatRecords(profile.insurance, ownerLookup);
  }, [ownerOptions, profile.insurance]);

  const [policies, setPolicies] = useState<InsurancePolicy[]>(initialPolicies);
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [policyDeleteId, setPolicyDeleteId] = useState<string | null>(null);
  const [policyOwnerId, setPolicyOwnerId] = useState(ownerOptions[0]?.value ?? "");
  const [policyInsurer, setPolicyInsurer] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [policyStatus, setPolicyStatus] = useState("Active");
  const [policySuperFundId, setPolicySuperFundId] = useState("");

  const [isCoverModalOpen, setIsCoverModalOpen] = useState(false);
  const [activePolicyId, setActivePolicyId] = useState<string | null>(null);
  const [editingCoverId, setEditingCoverId] = useState<string | null>(null);
  const [coverDeleteState, setCoverDeleteState] = useState<{ policyId: string; coverId: string } | null>(null);
  const [coverType, setCoverType] = useState(insuranceCoverOptions[0]);
  const [coverSumInsured, setCoverSumInsured] = useState("");
  const [coverPremiumAmount, setCoverPremiumAmount] = useState("");
  const [coverFrequency, setCoverFrequency] = useState("Monthly");

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
    setPolicyOwnerId(policy.ownerId);
    setPolicyInsurer(policy.insurer);
    setPolicyNumber(policy.policyNumber);
    setPolicyStatus(policy.status);
    setPolicySuperFundId(policy.superFundId);
    setIsPolicyModalOpen(true);
  }

  function savePolicy() {
    const owner = ownerOptions.find((option) => option.value === policyOwnerId);
    if (!owner) {
      return;
    }

    const superFund = superOptions.find((option) => option.value === policySuperFundId);

    if (editingPolicyId) {
      setPolicies((current) =>
        current.map((policy) =>
          policy.id === editingPolicyId
            ? {
                ...policy,
                ownerId: owner.value,
                ownerName: owner.label,
                insurer: policyInsurer.trim(),
                policyNumber: policyNumber.trim(),
                status: policyStatus,
                superFundId: policySuperFundId,
                superFundName: superFund?.label ?? "",
              }
            : policy,
        ),
      );
    } else {
      setPolicies((current) => [
        ...current,
        {
          id: createId("policy"),
          ownerId: owner.value,
          ownerName: owner.label,
          insurer: policyInsurer.trim(),
          policyNumber: policyNumber.trim(),
          status: policyStatus,
          superFundId: policySuperFundId,
          superFundName: superFund?.label ?? "",
          covers: [],
        },
      ]);
    }

    setIsPolicyModalOpen(false);
    resetPolicyForm();
  }

  function openCoverModal(policyId: string, coverId?: string) {
    resetCoverForm(policyId);

    if (coverId) {
      const policy = policies.find((item) => item.id === policyId);
      const cover = policy?.covers.find((item) => item.id === coverId);

      if (cover) {
        setEditingCoverId(cover.id);
        setCoverType(cover.coverType || insuranceCoverOptions[0]);
        setCoverSumInsured(formatCurrencyField(cover.sumInsured));
        setCoverPremiumAmount(formatCurrencyField(cover.premiumAmount));
        setCoverFrequency(cover.frequency || "Monthly");
      }
    }

    setIsCoverModalOpen(true);
  }

  function saveCover() {
    if (!activePolicyId) {
      return;
    }

    const nextCover: InsuranceCover = {
      id: editingCoverId ?? createId("cover"),
      coverType,
      sumInsured: toStoredCurrencyValue(coverSumInsured),
      premiumAmount: toStoredCurrencyValue(coverPremiumAmount),
      frequency: coverFrequency,
    };

    setPolicies((current) =>
      current.map((policy) => {
        if (policy.id !== activePolicyId) {
          return policy;
        }

        return {
          ...policy,
          covers: editingCoverId
            ? policy.covers.map((cover) => (cover.id === editingCoverId ? nextCover : cover))
            : [...policy.covers, nextCover],
        };
      }),
    );

    setIsCoverModalOpen(false);
    resetCoverForm(null);
  }

  function deletePolicy() {
    if (!policyDeleteId) {
      return;
    }

    setPolicies((current) => current.filter((policy) => policy.id !== policyDeleteId));
    setPolicyDeleteId(null);
  }

  function deleteCover() {
    if (!coverDeleteState) {
      return;
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
  }

  return (
    <>
      <div className={styles.sectionHeader}>
        <h1 className={styles.title}>Insurance</h1>
        <button type="button" className={styles.plusButton} aria-label="Add insurance policy" onClick={() => openPolicyModal()}>
          +
        </button>
      </div>

      <p className={styles.dataNotice}>
        Insurance is now structured as policies first, with cover details managed inside each policy. This section is frontend-ready while the
        new policy API contract is being updated.
      </p>
      {useMockFallback ? <p className={styles.actionNotice}>Live client data is temporarily unavailable. Insurance changes in this screen are local only right now.</p> : null}

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
                    <div>{cover.frequency}</div>
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
              <SelectRow label="Status" value={policyStatus} onChange={setPolicyStatus} options={insuranceStatusOptions.map((value) => ({ value, label: value }))} />
              <SelectRow label="Linked Super Fund" value={policySuperFundId} onChange={setPolicySuperFundId} options={[{ value: "", label: "" }, ...superOptions]} />
            </div>
            <div className={styles.identityModalActions}>
              <button type="button" className={styles.identityCreateButton} onClick={savePolicy}>
                {editingPolicyId ? "Save" : "Create"}
              </button>
              <button type="button" className={styles.modalSecondary} onClick={() => setIsPolicyModalOpen(false)}>
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
              <button type="button" className={styles.identityCreateButton} onClick={saveCover}>
                {editingCoverId ? "Save" : "Add"}
              </button>
              <button type="button" className={styles.modalSecondary} onClick={() => setIsCoverModalOpen(false)}>
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
