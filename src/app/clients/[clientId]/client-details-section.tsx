"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ClientProfile, PersonRecord } from "@/lib/api/types";
import styles from "./page.module.css";

type EditablePerson = "client" | "partner";

type ClientDetailsSectionProps = {
  profile: ClientProfile;
  useMockFallback: boolean;
};

type EditDraft = {
  title: string;
  name: string;
  gender: string;
  dateOfBirth: string;
  email: string;
};

type DisplayField = {
  label: string;
  value: string;
  placeholder?: string;
};

function formatDate(value?: string | null) {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

function toInputDate(value?: string | null) {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toISOString().slice(0, 10);
}

function createDraft(person?: PersonRecord | null): EditDraft {
  return {
    title: person?.title ?? "",
    name: person?.name ?? "",
    gender: person?.gender ?? "",
    dateOfBirth: toInputDate(person?.dob),
    email: person?.email ?? "",
  };
}

function getRecordValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return "";
}

function getNestedRecordValue(record: Record<string, unknown>, parentKey: string, keys: string[]) {
  const parent = record[parentKey];
  if (!parent || typeof parent !== "object") {
    return "";
  }

  return getRecordValue(parent as Record<string, unknown>, keys);
}

function getAge(value?: string | null) {
  if (!value) {
    return "";
  }

  const dob = new Date(value);
  if (Number.isNaN(dob.getTime())) {
    return "";
  }

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }

  return `${age}`;
}

function ReadOnlyField({ field }: { field: DisplayField }) {
  return (
    <label className={styles.profileField}>
      <span>{field.label}</span>
      <input value={field.value} placeholder={field.placeholder ?? field.label} readOnly />
    </label>
  );
}

function ProfileSection({
  title,
  fields,
}: {
  title: string;
  fields: DisplayField[];
}) {
  return (
    <section className={styles.profileSection}>
      <div className={styles.profileSectionHeading}>{title}</div>
      <div className={styles.profileFieldGrid}>
        {fields.map((field) => (
          <ReadOnlyField key={field.label} field={field} />
        ))}
      </div>
    </section>
  );
}

function buildProfileSections(person: PersonRecord | null, profile: ClientProfile) {
  const record = (person ?? {}) as PersonRecord & Record<string, unknown>;
  const riskDisplay = person?.riskProfileResponse?.resultDisplay ?? "";

  const overview: DisplayField[] = [
    { label: "Name", value: person?.name ?? "", placeholder: "Name" },
    { label: "Status", value: getRecordValue(record, ["status", "clientStatus"]) || "Client", placeholder: "Status" },
    { label: "Client Category", value: getRecordValue(record, ["clientCategory", "category"]), placeholder: "Client Category" },
    { label: "Risk Profile", value: riskDisplay, placeholder: "Risk Profile" },
    { label: "Practice", value: profile.practice ?? "", placeholder: "Practice" },
  ];

  const personal: DisplayField[] = [
    { label: "iC2 ID", value: person?.ic2AppId ?? "", placeholder: "iC2 ID" },
    { label: "Marital Status", value: getRecordValue(record, ["maritalStatus"]), placeholder: "Marital Status" },
    { label: "DOB", value: formatDate(person?.dob), placeholder: "Date of Birth" },
    { label: "Resident Status", value: getRecordValue(record, ["residentStatus"]), placeholder: "Resident Status" },
    { label: "Age", value: getAge(person?.dob), placeholder: "Age" },
    { label: "Gender", value: person?.gender ?? "", placeholder: "Gender" },
  ];

  const contact: DisplayField[] = [
    {
      label: "Street",
      value: getNestedRecordValue(record, "address", ["street", "line1"]) || getRecordValue(record, ["street"]),
      placeholder: "Street",
    },
    {
      label: "Post Code",
      value: getNestedRecordValue(record, "address", ["postCode", "postcode", "zipCode"]) || getRecordValue(record, ["postCode", "postcode"]),
      placeholder: "Post Code",
    },
    {
      label: "Suburb",
      value: getNestedRecordValue(record, "address", ["suburb", "city"]) || getRecordValue(record, ["suburb"]),
      placeholder: "Suburb",
    },
    { label: "Email", value: person?.email ?? "", placeholder: "Email" },
    {
      label: "State",
      value: getNestedRecordValue(record, "address", ["state", "region"]) || getRecordValue(record, ["state"]),
      placeholder: "State",
    },
    {
      label: "Preferred Phone",
      value:
        getRecordValue(record, ["preferredPhone", "phone", "mobile", "mobilePhone"]) ||
        getNestedRecordValue(record, "contact", ["preferredPhone", "phone"]),
      placeholder: "Preferred Phone",
    },
  ];

  const annualAgreement: DisplayField[] = [
    {
      label: "FDS/Annual Agreement Required",
      value: getRecordValue(record, ["fdsAnnualAgreementRequired", "annualAgreementRequired", "fdsRequired"]),
      placeholder: "FDS/Annual Agreement Required",
    },
  ];

  return { overview, personal, contact, annualAgreement };
}

export function ClientDetailsSection({ profile, useMockFallback }: ClientDetailsSectionProps) {
  const router = useRouter();
  const [client, setClient] = useState<PersonRecord | null>(profile.client ?? null);
  const [partner, setPartner] = useState<PersonRecord | null>(profile.partner ?? null);
  const [selectedPerson, setSelectedPerson] = useState<EditablePerson>("client");
  const [editing, setEditing] = useState<EditablePerson | null>(null);
  const [draft, setDraft] = useState<EditDraft>(createDraft(profile.client));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const activePerson = selectedPerson === "partner" && partner ? partner : client;
  const activeSections = buildProfileSections(activePerson, profile);

  function openEditor(target: EditablePerson) {
    const person = target === "client" ? client : partner;
    setDraft(createDraft(person));
    setSaveError(null);
    setEditing(target);
  }

  async function handleSave() {
    if (!editing || !profile.id) {
      return;
    }

    const person = editing === "client" ? client : partner;

    if (!person?.id) {
      setSaveError("This person record does not have an editable identifier yet.");
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetch(`/api/client-profiles/${profile.id}/${editing}/${person.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draft),
      });

      const body = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(body?.message ?? "Unable to save changes.");
      }

      const updatedPerson: PersonRecord = {
        ...person,
        title: draft.title,
        name: draft.name,
        gender: draft.gender,
        dob: draft.dateOfBirth || person.dob,
        email: draft.email,
      };

      if (editing === "client") {
        setClient(updatedPerson);
      } else {
        setPartner(updatedPerson);
      }

      setEditing(null);
      router.refresh();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to save changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <h1 className={styles.title}>Client Detail</h1>

      <section className={styles.clientProfileWorkspace}>
        <div className={styles.clientProfileTopbar}>
          <div className={styles.clientProfileName}>{activePerson?.name ?? client?.name ?? "Client"}</div>
          <div className={styles.clientProfileActions}>
            <button type="button" className={styles.topActionButton}>
              {partner ? "Edit Partner" : "Add Partner"}
            </button>
          </div>
        </div>

        <section className={styles.profilePanel}>
          <div className={styles.profilePanelHeader}>
            <div className={styles.profilePanelHeaderLeft}>
              <h2 className={styles.profilePanelTitle}>Client Details</h2>
              <div className={styles.profileToggle}>
                <button
                  type="button"
                  className={`${styles.profileToggleButton} ${selectedPerson === "client" ? styles.profileToggleButtonActive : ""}`.trim()}
                  onClick={() => setSelectedPerson("client")}
                >
                  Client
                </button>
                {partner ? (
                  <button
                    type="button"
                    className={`${styles.profileToggleButton} ${selectedPerson === "partner" ? styles.profileToggleButtonActive : ""}`.trim()}
                    onClick={() => setSelectedPerson("partner")}
                  >
                    Partner
                  </button>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              className={styles.profilePrimaryButton}
              onClick={() => openEditor(selectedPerson === "partner" && partner ? "partner" : "client")}
              disabled={useMockFallback}
            >
              {selectedPerson === "partner" && partner ? "Edit Partner" : "Edit Client"}
            </button>
          </div>

          <div className={styles.profileFieldGrid}>
            {activeSections.overview.map((field) => (
              <ReadOnlyField key={field.label} field={field} />
            ))}
          </div>

          <ProfileSection title={selectedPerson === "partner" && partner ? "Partner Details" : "Client Details"} fields={activeSections.personal} />
          <ProfileSection title="Contact Details" fields={activeSections.contact} />
          <ProfileSection title="FDS & Annual Agreement Details" fields={activeSections.annualAgreement} />
        </section>
      </section>

      {editing ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{editing === "client" ? "Edit Client" : "Edit Partner"}</h2>
              <button type="button" className={styles.modalClose} onClick={() => setEditing(null)}>
                ×
              </button>
            </div>

            <div className={styles.modalGrid}>
              <label className={styles.modalField}>
                <span>Title</span>
                <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
              </label>
              <label className={styles.modalField}>
                <span>Full Name</span>
                <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              </label>
              <label className={styles.modalField}>
                <span>Gender</span>
                <input value={draft.gender} onChange={(event) => setDraft({ ...draft, gender: event.target.value })} />
              </label>
              <label className={styles.modalField}>
                <span>Date of Birth</span>
                <input type="date" value={draft.dateOfBirth} onChange={(event) => setDraft({ ...draft, dateOfBirth: event.target.value })} />
              </label>
              <label className={styles.modalField}>
                <span>Email</span>
                <input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
              </label>
            </div>

            {saveError ? <p className={styles.modalError}>{saveError}</p> : null}

            <div className={styles.modalActions}>
              <button type="button" className={styles.modalSecondary} onClick={() => setEditing(null)} disabled={saving}>
                Cancel
              </button>
              <button type="button" className={styles.modalPrimary} onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
