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

export function IdentityCheckSection() {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<IdentityDraft>(emptyDraft);

  function updateField<K extends keyof IdentityDraft>(key: K, value: IdentityDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function closeModal() {
    setIsOpen(false);
  }

  function handleCreate() {
    // UI-only for now. We can wire this to a real endpoint next.
    setIsOpen(false);
  }

  return (
    <>
      <div className={styles.sectionHeader}>
        <h1 className={styles.title}>Identity Check</h1>
        <button type="button" className={styles.plusButton} aria-label="Add identity document" onClick={() => setIsOpen(true)}>
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
      </section>

      {isOpen ? (
        <div className={styles.modalOverlay}>
          <div className={styles.identityModalCard}>
            <div className={styles.identityModalHeader}>Create Identity Check</div>

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
                <input value={draft.dateOfIssue} onChange={(event) => updateField("dateOfIssue", event.target.value)} />
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
                <input value={draft.dateOfBirth} onChange={(event) => updateField("dateOfBirth", event.target.value)} />
              </label>

              <label className={styles.identityFieldRow}>
                <span>Place of Residence</span>
                <input value={draft.placeOfResidence} onChange={(event) => updateField("placeOfResidence", event.target.value)} />
              </label>

              <label className={styles.identityFieldRow}>
                <span>Expiry Date</span>
                <input value={draft.expiryDate} onChange={(event) => updateField("expiryDate", event.target.value)} />
              </label>

              <label className={styles.identityFieldRow}>
                <span>Document Number</span>
                <input value={draft.documentNumber} onChange={(event) => updateField("documentNumber", event.target.value)} />
              </label>

              <label className={styles.identityFieldRow}>
                <span>Card Number</span>
                <input value={draft.cardNumber} onChange={(event) => updateField("cardNumber", event.target.value)} />
              </label>

              <label className={styles.identityFieldRow}>
                <span>Document Issuer</span>
                <input value={draft.documentIssuer} onChange={(event) => updateField("documentIssuer", event.target.value)} />
              </label>

              <label className={styles.identityFieldRow}>
                <span>Verified Date</span>
                <input value={draft.verifiedDate} onChange={(event) => updateField("verifiedDate", event.target.value)} />
              </label>

              <label className={styles.identityFieldRow}>
                <span>Verified By</span>
                <input value={draft.verifiedBy} onChange={(event) => updateField("verifiedBy", event.target.value)} />
              </label>
            </div>

            <div className={styles.identityModalActions}>
              <button type="button" className={styles.identityCreateButton} onClick={handleCreate}>
                Create
              </button>
              <button type="button" className={styles.modalSecondary} onClick={closeModal}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
