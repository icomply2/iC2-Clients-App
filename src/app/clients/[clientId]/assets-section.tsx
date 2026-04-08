"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientAssetRecord, ClientProfile } from "@/lib/api/types";
import {
  deleteAssetCollectionItem,
  saveAssetCollection,
  upsertAssetCollection,
} from "@/lib/services/profile-collections";
import styles from "./page.module.css";

type AssetsSectionProps = {
  profile: ClientProfile;
  useMockFallback?: boolean;
};

const assetCategoryOptions = ["Cash", "Investment", "Property", "Superannuation", "Business", "Personal"];
const incomeFrequencyOptions = ["Weekly", "Fortnightly", "Monthly", "Quarterly", "Annually"];
const assetTypeOptionsByCategory: Record<string, string[]> = {
  Cash: ["Cash on Hand", "Current Savings", "Fixed Deposits"],
  Investment: ["Bonds", "Other Investments", "Stocks", "Unit Trusts", "Annuity"],
  Property: ["Investment Property", "Primary Residence"],
  Superannuation: ["Pension", "Superannuation"],
  Business: ["Other Investments"],
  Personal: ["Antiques", "Artwork", "Household Contents", "Jewellery", "Motor Vehicle", "Other Life Style"],
};

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
  const integerPart = integerPartRaw || "0";
  const groupedIntegerPart = Number(integerPart).toLocaleString("en-AU");

  if (normalizedValue.includes(".")) {
    return `$${groupedIntegerPart}.${decimalPartRaw}`;
  }

  return `$${groupedIntegerPart}`;
}

function toStoredCurrencyValue(value: string) {
  const normalizedValue = normalizeCurrencyInput(value);

  if (!normalizedValue) {
    return null;
  }

  const numericValue = Number(normalizedValue);

  if (Number.isNaN(numericValue)) {
    return null;
  }

  return numericValue.toFixed(2);
}

function normalizeIncomeFrequency(
  value?: {
    type?: string | null;
    value?: string | null;
  } | null,
) {
  if (value?.type || value?.value) {
    return {
      type: value.type ?? value.value ?? "",
      value: value.value ?? value.type ?? "",
    };
  }

  return {
    type: "",
    value: "",
  };
}

function formatDate(value?: string | null) {
  if (!value) {
    return "";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsedDate);
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

function toNumericValue(value?: string | null) {
  if (!value) {
    return 0;
  }

  const numericValue = Number(value);
  return Number.isNaN(numericValue) ? 0 : numericValue;
}

function getFallbackMessage() {
  return "Live client data is temporarily unavailable. Editing is disabled while sample data is shown.";
}

export function AssetsSection({ profile, useMockFallback = false }: AssetsSectionProps) {
  const router = useRouter();
  const hasPartner = Boolean(profile.partner?.id);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [deleteErrorMessage, setDeleteErrorMessage] = useState("");
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [assets, setAssets] = useState<ClientAssetRecord[]>(profile.assets ?? []);

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

  const [ownerId, setOwnerId] = useState(ownerOptions[0]?.value ?? "");
  const [type, setType] = useState("");
  const [assetType, setAssetType] = useState("");
  const [description, setDescription] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [cost, setCost] = useState("");
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeFrequency, setIncomeFrequency] = useState("");
  const [acquisitionDate, setAcquisitionDate] = useState("");
  const [joint, setJoint] = useState(false);

  const assetTypeOptions = useMemo(() => assetTypeOptionsByCategory[type] ?? [], [type]);

  useEffect(() => {
    setAssets(profile.assets ?? []);
  }, [profile.assets]);

  useEffect(() => {
    if (!ownerOptions.some((option) => option.value === ownerId)) {
      setOwnerId(ownerOptions[0]?.value ?? "");
    }
  }, [ownerId, ownerOptions]);

  useEffect(() => {
    if (assetType && !assetTypeOptions.includes(assetType)) {
      setAssetType("");
    }
  }, [assetType, assetTypeOptions]);

  const displayAssets = useMemo(
    () =>
      assets.map((asset) => ({
        id: asset.id ?? "",
        owner: asset.owner?.name ?? "",
        type: asset.type ?? "",
        assetType: asset.assetType ?? "",
        description: asset.description ?? "",
        currentValue: formatCurrency(asset.currentValue),
        acquisitionDate: formatDate(asset.acquisitionDate),
      })),
    [assets],
  );

  const totalCurrentValue = useMemo(
    () => assets.reduce((sum, asset) => sum + toNumericValue(asset.currentValue), 0),
    [assets],
  );

  function resetForm() {
    setOwnerId(ownerOptions[0]?.value ?? "");
    setType("");
    setAssetType("");
    setDescription("");
    setCurrentValue("");
    setCost("");
    setIncomeAmount("");
    setIncomeFrequency("");
    setAcquisitionDate("");
    setJoint(false);
    setEditingAssetId(null);
    setErrorMessage("");
  }

  async function saveAssets(nextAssets: ClientAssetRecord[]) {
    if (!profile.id) {
      throw new Error("This client profile does not have a profile id yet.");
    }

    const savedAssets = await saveAssetCollection(profile.id, nextAssets);
    setAssets(savedAssets);
    router.refresh();
  }

  function buildAssetRecord() {
    const owner = ownerOptions.find((option) => option.value === ownerId);

    if (!owner) {
      throw new Error("Please choose an owner.");
    }

    if (!type) {
      throw new Error("Please choose an asset category.");
    }

    if (!assetType) {
      throw new Error("Please choose an asset type.");
    }

    if (!description.trim()) {
      throw new Error("Please enter an asset description.");
    }

    return {
      type,
      assetType,
      description: description.trim(),
      currentValue: toStoredCurrencyValue(currentValue),
      cost: toStoredCurrencyValue(cost),
      incomeAmount: toStoredCurrencyValue(incomeAmount),
      incomeFrequency: normalizeIncomeFrequency(
        incomeFrequency
          ? {
              type: incomeFrequency,
              value: incomeFrequency,
            }
          : null,
      ),
      acquisitionDate: acquisitionDate || null,
      joint: hasPartner ? joint : false,
      owner: {
        id: owner.value,
        name: owner.label,
      },
    } satisfies ClientAssetRecord;
  }

  async function handleSaveAsset() {
    if (useMockFallback) {
      setErrorMessage(getFallbackMessage());
      return;
    }

    if (!profile.id) {
      setErrorMessage("This client profile does not have a profile id yet.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    try {
      const assetRecord = buildAssetRecord();
      const nextAssets = upsertAssetCollection(assets, assetRecord, editingAssetId);

      await saveAssets(nextAssets);
      resetForm();
      setIsOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save the asset right now.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleEditClick(assetId: string) {
    if (useMockFallback) {
      setErrorMessage(getFallbackMessage());
      return;
    }

    const asset = assets.find((item) => item.id === assetId);

    if (!asset) {
      return;
    }

    setEditingAssetId(asset.id ?? null);
    setOwnerId(asset.owner?.id ?? ownerOptions[0]?.value ?? "");
    setType(asset.type ?? "");
    setAssetType(asset.assetType ?? "");
    setDescription(asset.description ?? "");
    setCurrentValue(formatCurrencyField(asset.currentValue ?? ""));
    setCost(formatCurrencyField(asset.cost ?? ""));
    setIncomeAmount(formatCurrencyField(asset.incomeAmount ?? ""));
    setIncomeFrequency(asset.incomeFrequency?.value ?? asset.incomeFrequency?.type ?? "");
    setAcquisitionDate((asset.acquisitionDate ?? "").slice(0, 10));
    setJoint(hasPartner ? Boolean(asset.joint) : false);
    setErrorMessage("");
    setIsOpen(true);
  }

  async function handleDeleteAsset() {
    if (useMockFallback) {
      setDeleteErrorMessage(getFallbackMessage());
      return;
    }

    if (!profile.id || !deleteCandidateId) {
      return;
    }

    setIsSaving(true);
    setDeleteErrorMessage("");

    try {
      await deleteAssetCollectionItem(profile.id, deleteCandidateId);

      setAssets((current) => current.filter((asset) => asset.id !== deleteCandidateId));
      router.refresh();
      setDeleteCandidateId(null);
    } catch (error) {
      setDeleteErrorMessage(error instanceof Error ? error.message : "Unable to delete the asset right now.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <div className={styles.sectionHeader}>
        <h1 className={styles.title}>Assets</h1>
        <button
          type="button"
          className={styles.plusButton}
          aria-label="Add asset"
          onClick={() => {
            if (useMockFallback) {
              setErrorMessage(getFallbackMessage());
              return;
            }

            resetForm();
            setIsOpen(true);
          }}
          disabled={useMockFallback}
          title={useMockFallback ? getFallbackMessage() : undefined}
        >
          +
        </button>
      </div>

      {useMockFallback ? <p className={styles.actionNotice}>{getFallbackMessage()}</p> : null}

      <section className={styles.assetsSection}>
        <div className={styles.assetsHeader}>
          <div>Owner</div>
          <div>Category</div>
          <div>Type</div>
          <div>Description</div>
          <div>Current Value</div>
          <div className={styles.entitiesActionsHeader}></div>
        </div>

        {displayAssets.map((asset) => (
          <div key={asset.id || `${asset.owner}-${asset.description}`} className={styles.assetsRow}>
            <div>{asset.owner}</div>
            <div>{asset.type}</div>
            <div>{asset.assetType}</div>
            <div className={styles.assetDescription}>{asset.description}</div>
            <div>{asset.currentValue}</div>
            <div className={styles.entitiesActions}>
              <button
                type="button"
                className={styles.rowActionButton}
                onClick={() => handleEditClick(asset.id)}
                aria-label={`Edit ${asset.description || "asset"}`}
                disabled={useMockFallback}
              >
                Edit
              </button>
              <button
                type="button"
                className={`${styles.rowActionButton} ${styles.rowActionDanger}`.trim()}
                onClick={() => {
                  if (useMockFallback) {
                    setDeleteErrorMessage(getFallbackMessage());
                    return;
                  }
                  setDeleteCandidateId(asset.id);
                  setDeleteErrorMessage("");
                }}
                aria-label={`Delete ${asset.description || "asset"}`}
                disabled={useMockFallback}
              >
                Delete
              </button>
            </div>
          </div>
        ))}

        {displayAssets.length ? (
          <div className={`${styles.assetSummaryRow} ${styles.summaryRow}`.trim()}>
            <div />
            <div />
            <div />
            <div className={`${styles.summaryLabel} ${styles.assetSummaryLabel}`.trim()}>Total</div>
            <div className={`${styles.summaryValue} ${styles.assetSummaryValue}`.trim()}>
              {formatCurrency(totalCurrentValue.toFixed(2))}
            </div>
            <div className={styles.assetSummarySpacer} aria-hidden="true" />
          </div>
        ) : null}
      </section>

      {isOpen ? (
        <div className={styles.modalOverlay}>
          <div className={styles.assetModalCard}>
            <div className={styles.identityModalHeader}>{editingAssetId ? "Edit Asset" : "Add Asset"}</div>
            <div className={styles.identityModalBody}>
              <label className={styles.identityFieldRow}>
                <span>Owner</span>
                <select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
                  {ownerOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.identityFieldRow}>
                <span>Category</span>
                <select value={type} onChange={(event) => setType(event.target.value)}>
                  <option value=""></option>
                  {assetCategoryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.identityFieldRow}>
                <span>Type</span>
                <select value={assetType} onChange={(event) => setAssetType(event.target.value)}>
                  <option value=""></option>
                  {assetTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.identityFieldRow}>
                <span>Description</span>
                <input value={description} onChange={(event) => setDescription(event.target.value)} />
              </label>
              <label className={styles.identityFieldRow}>
                <span>Current Value</span>
                <input
                  type="text"
                  value={currentValue}
                  onChange={(event) => setCurrentValue(formatCurrencyField(event.target.value))}
                  inputMode="decimal"
                  placeholder="$0.00"
                />
              </label>
              <label className={styles.identityFieldRow}>
                <span>Cost</span>
                <input
                  type="text"
                  value={cost}
                  onChange={(event) => setCost(formatCurrencyField(event.target.value))}
                  inputMode="decimal"
                  placeholder="$0.00"
                />
              </label>
              <label className={styles.identityFieldRow}>
                <span>Income Amount</span>
                <input
                  type="text"
                  value={incomeAmount}
                  onChange={(event) => setIncomeAmount(formatCurrencyField(event.target.value))}
                  inputMode="decimal"
                  placeholder="$0.00"
                />
              </label>
              <label className={styles.identityFieldRow}>
                <span>Income Frequency</span>
                <select value={incomeFrequency} onChange={(event) => setIncomeFrequency(event.target.value)}>
                  <option value=""></option>
                  {incomeFrequencyOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.identityFieldRow}>
                <span>Acquired</span>
                <input type="date" value={acquisitionDate} onChange={(event) => setAcquisitionDate(event.target.value)} />
              </label>
              {hasPartner ? (
                <label className={styles.assetCheckboxRow}>
                  <span>Joint Asset</span>
                  <input type="checkbox" checked={joint} onChange={(event) => setJoint(event.target.checked)} />
                </label>
              ) : null}
            </div>
            <div className={styles.identityModalActions}>
              <button
                type="button"
                className={styles.identityCreateButton}
                onClick={() => void handleSaveAsset()}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : editingAssetId ? "Save" : "Add"}
              </button>
              <button
                type="button"
                className={styles.modalSecondary}
                onClick={() => {
                  resetForm();
                  setIsOpen(false);
                }}
                disabled={isSaving}
              >
                Cancel
              </button>
            </div>
            {errorMessage ? <p className={styles.modalError}>{errorMessage}</p> : null}
          </div>
        </div>
      ) : null}

      {deleteCandidateId ? (
        <div className={styles.modalOverlay}>
          <div className={styles.confirmDialog}>
            <h2 className={styles.confirmTitle}>Delete Asset</h2>
            <p className={styles.confirmText}>Are you sure you want to delete this asset? This action cannot be undone.</p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={`${styles.modalPrimary} ${styles.confirmDanger}`.trim()}
                onClick={() => void handleDeleteAsset()}
                disabled={isSaving}
              >
                {isSaving ? "Deleting..." : "Delete"}
              </button>
              <button
                type="button"
                className={styles.modalSecondary}
                onClick={() => {
                  setDeleteCandidateId(null);
                  setDeleteErrorMessage("");
                }}
                disabled={isSaving}
              >
                Cancel
              </button>
            </div>
            {deleteErrorMessage ? <p className={styles.modalError}>{deleteErrorMessage}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
