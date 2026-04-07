"use client";

import { useState } from "react";
import styles from "./page.module.css";

type IdentityDraft = {
  verifiedFrom: string;
  dateOfIssue: string;
  placeOfIssue: string;
  countryOfIssue: string;
  description: string;
  nameOnDocument: string;
  dateOfBirth: string;
  placeOfResidence: string;
  expiryDate: string;
  documentNumber: string;
  cardNumber: string;
  documentIssuer: string;
  verifiedDate: string;
  verifiedBy: string;
};

type IdentityRecord = IdentityDraft & {
  id: string;
};

type SensitiveFieldKey = "documentNumber" | "cardNumber";
type IdentityStepKey = "identity" | "risk";

const emptyDraft: IdentityDraft = {
  verifiedFrom: "",
  dateOfIssue: "",
  placeOfIssue: "",
  countryOfIssue: "",
  description: "",
  nameOnDocument: "",
  dateOfBirth: "",
  placeOfResidence: "",
  expiryDate: "",
  documentNumber: "",
  cardNumber: "",
  documentIssuer: "",
  verifiedDate: "",
  verifiedBy: "",
};

function maskSensitiveValue(value: string) {
  if (!value) {
    return "";
  }

  if (value.length <= 3) {
    return value;
  }

  return `${"*".repeat(value.length - 3)}${value.slice(-3)}`;
}

const IDENTITY_STEPS: { key: IdentityStepKey; label: string }[] = [
  { key: "identity", label: "Identity Details" },
  { key: "risk", label: "Risk Assessment" },
];

export function IdentityCheckSection() {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<IdentityDraft>(emptyDraft);
  const [records, setRecords] = useState<IdentityRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recordPendingDelete, setRecordPendingDelete] = useState<IdentityRecord | null>(null);
  const [revealedField, setRevealedField] = useState<SensitiveFieldKey | null>(null);
  const [step, setStep] = useState<IdentityStepKey>("identity");

  function updateField<K extends keyof IdentityDraft>(key: K, value: IdentityDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function closeModal() {
    setIsOpen(false);
    setDraft(emptyDraft);
    setEditingId(null);
    setRevealedField(null);
    setStep("identity");
  }

  function handleCreate() {
    if (editingId) {
      setRecords((current) => current.map((record) => (record.id === editingId ? { ...record, ...draft } : record)));
    } else {
      setRecords((current) => [
        {
          ...draft,
          id: `${Date.now()}`,
        },
        ...current,
      ]);
    }
    closeModal();
  }

  function handleEdit(record: IdentityRecord) {
    setDraft({
      verifiedFrom: record.verifiedFrom,
      dateOfIssue: record.dateOfIssue,
      placeOfIssue: record.placeOfIssue,
      countryOfIssue: record.countryOfIssue,
      description: record.description,
      nameOnDocument: record.nameOnDocument,
      dateOfBirth: record.dateOfBirth,
      placeOfResidence: record.placeOfResidence,
      expiryDate: record.expiryDate,
      documentNumber: record.documentNumber,
      cardNumber: record.cardNumber,
      documentIssuer: record.documentIssuer,
      verifiedDate: record.verifiedDate,
      verifiedBy: record.verifiedBy,
    });
    setEditingId(record.id);
    setStep("identity");
    setIsOpen(true);
  }

  function handleDeleteConfirmed() {
    if (!recordPendingDelete) {
      return;
    }

    setRecords((current) => current.filter((record) => record.id !== recordPendingDelete.id));
    setRecordPendingDelete(null);
  }

  return (
    <>
      <div className={styles.sectionHeader}>
        <h1 className={styles.title}>Identity Check</h1>
        <button
          type="button"
          className={styles.plusButton}
          aria-label="Add identity document"
          onClick={() => {
            setDraft(emptyDraft);
            setEditingId(null);
            setStep("identity");
            setIsOpen(true);
          }}
        >
          +
        </button>
      </div>

      <section className={styles.identitySection}>
        <div className={styles.identityHeader}>
          <div>Date Issue</div>
          <div>Name on Document</div>
          <div>Expiry Date</div>
          <div>Verified By</div>
          <div>Verified By</div>
        </div>
        {records.map((record) => (
          <div key={record.id} className={styles.identityRow}>
            <div>{record.dateOfIssue}</div>
            <div>{record.nameOnDocument}</div>
            <div>{record.expiryDate}</div>
            <div>{record.verifiedDate}</div>
            <div>{record.verifiedBy}</div>
            <div className={styles.recordActions}>
              <button type="button" className={styles.actionButton} onClick={() => handleEdit(record)}>
                Edit
              </button>
              <button type="button" className={`${styles.actionButton} ${styles.actionButtonDanger}`.trim()} onClick={() => setRecordPendingDelete(record)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </section>

      {isOpen ? (
        <div className={styles.modalOverlay}>
          <div className={styles.identityModalCard}>
            <div className={styles.identityModalHeader}>{editingId ? "Edit Identity Check" : "Create Identity Check"}</div>

            <div className={styles.modalStepTabs}>
              {IDENTITY_STEPS.map((item, index) => (
                <button
                  key={item.key}
                  type="button"
                  className={`${styles.modalStepTab} ${step === item.key ? styles.modalStepTabActive : ""}`.trim()}
                  onClick={() => setStep(item.key)}
                >
                  <span className={styles.modalStepNumber}>{index + 1}</span>
                  {item.label}
                </button>
              ))}
            </div>

            {step === "identity" ? (
              <div className={styles.identityModalBody}>
                <label className={styles.identityFieldRow}>
                  <span>Verified From</span>
                  <select value={draft.verifiedFrom} onChange={(event) => updateField("verifiedFrom", event.target.value)}>
                    <option value=""></option>
                    <option value="Passport">Passport</option>
                    <option value="Driver Licence">Driver Licence</option>
                    <option value="Birth Certificate">Birth Certificate</option>
                  </select>
                </label>

                <label className={styles.identityFieldRow}>
                  <span>Date of Issue</span>
                  <input type="date" value={draft.dateOfIssue} onChange={(event) => updateField("dateOfIssue", event.target.value)} />
                </label>

                <label className={styles.identityFieldRow}>
                  <span>Place of Issue</span>
                  <input value={draft.placeOfIssue} onChange={(event) => updateField("placeOfIssue", event.target.value)} />
                </label>

                <label className={styles.identityFieldRow}>
                  <span>Country of Issue</span>
                  <input value={draft.countryOfIssue} onChange={(event) => updateField("countryOfIssue", event.target.value)} />
                </label>

                <label className={styles.identityFieldRow}>
                  <span>Description</span>
                  <input value={draft.description} onChange={(event) => updateField("description", event.target.value)} />
                </label>

                <label className={styles.identityFieldRow}>
                  <span>Name on Document</span>
                  <input value={draft.nameOnDocument} onChange={(event) => updateField("nameOnDocument", event.target.value)} />
                </label>

                <label className={styles.identityFieldRow}>
                  <span>Date of Birth</span>
                  <input type="date" value={draft.dateOfBirth} onChange={(event) => updateField("dateOfBirth", event.target.value)} />
                </label>

                <label className={styles.identityFieldRow}>
                  <span>Place of Residence</span>
                  <input value={draft.placeOfResidence} onChange={(event) => updateField("placeOfResidence", event.target.value)} />
                </label>

                <label className={styles.identityFieldRow}>
                  <span>Expiry Date</span>
                  <input type="date" value={draft.expiryDate} onChange={(event) => updateField("expiryDate", event.target.value)} />
                </label>

                <label className={styles.identityFieldRow}>
                  <span>Document Number</span>
                  <input
                    value={revealedField === "documentNumber" ? draft.documentNumber : maskSensitiveValue(draft.documentNumber)}
                    onFocus={() => setRevealedField("documentNumber")}
                    onBlur={() => setRevealedField((current) => (current === "documentNumber" ? null : current))}
                    onChange={(event) => updateField("documentNumber", event.target.value)}
                  />
                </label>

                <label className={styles.identityFieldRow}>
                  <span>Card Number</span>
                  <input
                    value={revealedField === "cardNumber" ? draft.cardNumber : maskSensitiveValue(draft.cardNumber)}
                    onFocus={() => setRevealedField("cardNumber")}
                    onBlur={() => setRevealedField((current) => (current === "cardNumber" ? null : current))}
                    onChange={(event) => updateField("cardNumber", event.target.value)}
                  />
                </label>

                <label className={styles.identityFieldRow}>
                  <span>Document Issuer</span>
                  <input value={draft.documentIssuer} onChange={(event) => updateField("documentIssuer", event.target.value)} />
                </label>

                <label className={styles.identityFieldRow}>
                  <span>Verified Date</span>
                  <input type="date" value={draft.verifiedDate} onChange={(event) => updateField("verifiedDate", event.target.value)} />
                </label>

                <label className={styles.identityFieldRow}>
                  <span>Verified By</span>
                  <input value={draft.verifiedBy} onChange={(event) => updateField("verifiedBy", event.target.value)} />
                </label>
              </div>
            ) : null}

            {step === "risk" ? (
              <div className={styles.identityRiskPlaceholder}>
                <h3 className={styles.identityRiskPlaceholderTitle}>Risk Assessment</h3>
                <p className={styles.identityRiskPlaceholderText}>
                  Step 2 is ready for the risk assessment inputs. Once you give me those fields, I’ll wire them straight into this step.
                </p>
              </div>
            ) : null}

            <div className={styles.identityModalActions}>
              <button
                type="button"
                className={styles.modalSecondary}
                onClick={() => setStep(step === "risk" ? "identity" : "identity")}
                disabled={step === "identity"}
              >
                Back
              </button>
              <button type="button" className={styles.modalSecondary} onClick={closeModal}>
                Cancel
              </button>
              {step === "identity" ? (
                <button type="button" className={styles.identityCreateButton} onClick={() => setStep("risk")}>
                  Next
                </button>
              ) : (
                <button type="button" className={styles.identityCreateButton} onClick={handleCreate}>
                  {editingId ? "Save" : "Create"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {recordPendingDelete ? (
        <div className={styles.modalOverlay}>
          <div className={styles.confirmDialog}>
            <h2 className={styles.confirmTitle}>Delete identity check?</h2>
            <p className={styles.confirmText}>
              This will remove the identity record for {recordPendingDelete.nameOnDocument || "this document"} from the current page.
            </p>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.modalSecondary} onClick={() => setRecordPendingDelete(null)}>
                Cancel
              </button>
              <button type="button" className={`${styles.modalPrimary} ${styles.confirmDanger}`.trim()} onClick={handleDeleteConfirmed}>
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
