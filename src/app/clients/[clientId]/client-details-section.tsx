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
  clientId: string;
  title: string;
  name: string;
  status: string;
  clientCategory: string;
  riskProfile: string;
  practice: string;
  gender: string;
  maritalStatus: string;
  residentStatus: string;
  dateOfBirth: string;
  street: string;
  suburb: string;
  state: string;
  postCode: string;
  preferredPhone: string;
  email: string;
  adviceAgreementRequired: string;
  agreementType: string;
  nextAnniversaryDate: string;
};

type DisplayField = {
  label: string;
  value: string;
  placeholder?: string;
};

type EditStepKey = "overview" | "personal" | "contact" | "agreement";

const EDIT_STEPS: { key: EditStepKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "personal", label: "Client Details" },
  { key: "contact", label: "Contact Details" },
  { key: "agreement", label: "Advice Agreement" },
];

const TITLE_OPTIONS = ["Mr", "Mrs", "Ms", "Miss", "Dr", "Prof"];
const STATUS_OPTIONS = ["Prospect", "Client", "Archived", "Deceased"];
const CLIENT_CATEGORY_OPTIONS = ["Annual Agreement", "Fee For Service", "Ongoing", "Risk Only", "Whoesale"];
const RISK_PROFILE_OPTIONS = ["Cash", "Defensive", "Moderate", "Balanced", "Growth", "High Growth"];
const AGREEMENT_TYPE_OPTIONS = ["Annual Agreement", "Ongoing Agreement"];

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

function getFirstNonEmptyValue(...candidates: Array<string | null | undefined>) {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  return "";
}

function createDraft(person?: PersonRecord | null, profileId?: string | null): EditDraft {
  const record = (person ?? {}) as PersonRecord & Record<string, unknown>;

  return {
    clientId: getFirstNonEmptyValue(profileId, person?.ic2AppId, person?.id),
    title: person?.title ?? "",
    name: person?.name ?? "",
    status: getRecordValue(record, ["status", "clientStatus"]) || "Client",
    clientCategory: getRecordValue(record, ["clientCategory", "category"]),
    riskProfile: person?.riskProfileResponse?.resultDisplay ?? "",
    practice: "",
    gender: person?.gender ?? "",
    maritalStatus: getRecordValue(record, ["maritalStatus"]),
    residentStatus: getRecordValue(record, ["residentStatus"]),
    dateOfBirth: toInputDate(person?.dob),
    street: getNestedRecordValue(record, "address", ["street", "line1"]) || getRecordValue(record, ["street"]),
    suburb: getNestedRecordValue(record, "address", ["suburb", "city"]) || getRecordValue(record, ["suburb"]),
    state: getNestedRecordValue(record, "address", ["state", "region"]) || getRecordValue(record, ["state"]),
    postCode:
      getNestedRecordValue(record, "address", ["postCode", "postcode", "zipCode"]) || getRecordValue(record, ["postCode", "postcode"]),
    preferredPhone:
      getRecordValue(record, ["preferredPhone", "phone", "mobile", "mobilePhone"]) ||
      getNestedRecordValue(record, "contact", ["preferredPhone", "phone"]),
    email: person?.email ?? "",
    adviceAgreementRequired: getRecordValue(record, ["fdsAnnualAgreementRequired", "annualAgreementRequired", "fdsRequired"]),
    agreementType:
      getRecordValue(record, ["agreementType"]) || getNestedRecordValue(record, "annualAgreement", ["type", "agreementType"]),
    nextAnniversaryDate: toInputDate(
      getRecordValue(record, ["nextAnniversaryDate"]) || getNestedRecordValue(record, "annualAgreement", ["nextDueDate", "nextAnniversaryDate"]),
    ),
  };
}

function getDisplayedClientId(person: PersonRecord | null, profile: ClientProfile) {
  return getFirstNonEmptyValue(profile.id, person?.ic2AppId, person?.id);
}

function hasMeaningfulPerson(person: PersonRecord | null | undefined) {
  if (!person) {
    return false;
  }

  return Boolean(
    getFirstNonEmptyValue(
      person.id,
      person.ic2AppId,
      person.name,
      person.email,
      person.dob,
      person.title,
      person.gender,
    ),
  );
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
    { label: "iC2 ID", value: getDisplayedClientId(person, profile), placeholder: "iC2 ID" },
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
      label: "Suburb",
      value: getNestedRecordValue(record, "address", ["suburb", "city"]) || getRecordValue(record, ["suburb"]),
      placeholder: "Suburb",
    },
    {
      label: "State",
      value: getNestedRecordValue(record, "address", ["state", "region"]) || getRecordValue(record, ["state"]),
      placeholder: "State",
    },
    {
      label: "Post Code",
      value: getNestedRecordValue(record, "address", ["postCode", "postcode", "zipCode"]) || getRecordValue(record, ["postCode", "postcode"]),
      placeholder: "Post Code",
    },
    { label: "Email", value: person?.email ?? "", placeholder: "Email" },
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
      label: "Advice Agreement Required",
      value: getRecordValue(record, ["fdsAnnualAgreementRequired", "annualAgreementRequired", "fdsRequired"]),
      placeholder: "Advice Agreement Required",
    },
    {
      label: "Agreement Type",
      value: getRecordValue(record, ["agreementType"]) || getNestedRecordValue(record, "annualAgreement", ["type", "agreementType"]),
      placeholder: "Agreement Type",
    },
    {
      label: "Next Anniversary Date",
      value:
        formatDate(getRecordValue(record, ["nextAnniversaryDate"]) || getNestedRecordValue(record, "annualAgreement", ["nextDueDate", "nextAnniversaryDate"])),
      placeholder: "Next Anniversary Date",
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
  const [draft, setDraft] = useState<EditDraft>(createDraft(profile.client, profile.id));
  const [editStep, setEditStep] = useState<EditStepKey>("overview");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const hasPartner = hasMeaningfulPerson(partner);

  const activePerson = selectedPerson === "partner" && hasPartner ? partner : client;
  const activeSections = buildProfileSections(activePerson, profile);

  function openEditor(target: EditablePerson) {
    const person = target === "client" ? client : partner;
    setDraft({ ...createDraft(person, profile.id), practice: profile.practice ?? "" });
    setEditStep("overview");
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
      const payload = {
        ...draft,
        riskProfileResponse: {
          ...(person.riskProfileResponse ?? {}),
          resultDisplay: draft.riskProfile,
        },
      };

      const response = await fetch(`/api/client-profiles/${profile.id}/${editing}/${person.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const body = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(body?.message ?? "Unable to save changes.");
      }

      const updatedPerson: PersonRecord = {
        ...person,
        title: draft.title,
        name: draft.name,
        status: draft.status,
        clientCategory: draft.clientCategory,
        riskProfileResponse: {
          ...(person.riskProfileResponse ?? {}),
          resultDisplay: draft.riskProfile,
        },
        gender: draft.gender,
        maritalStatus: draft.maritalStatus,
        residentStatus: draft.residentStatus,
        dob: draft.dateOfBirth || person.dob,
        preferredPhone: draft.preferredPhone,
        fdsAnnualAgreementRequired: draft.adviceAgreementRequired,
        annualAgreementRequired: draft.adviceAgreementRequired,
        agreementType: draft.agreementType,
        nextAnniversaryDate: draft.nextAnniversaryDate,
        annualAgreement: {
          ...((person as PersonRecord & Record<string, unknown>).annualAgreement as Record<string, unknown> | null),
          agreementType: draft.agreementType,
          type: draft.agreementType,
          nextDueDate: draft.nextAnniversaryDate,
          nextAnniversaryDate: draft.nextAnniversaryDate,
        },
        address: {
          ...((person as PersonRecord & Record<string, unknown>).address as Record<string, unknown> | null),
          street: draft.street,
          suburb: draft.suburb,
          state: draft.state,
          postCode: draft.postCode,
        },
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
      <section className={styles.clientProfileWorkspace}>
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
                {hasPartner ? (
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
              onClick={() => openEditor(selectedPerson === "partner" && hasPartner ? "partner" : "client")}
              disabled={useMockFallback}
            >
              {selectedPerson === "partner" && hasPartner ? "Edit Partner" : "Edit Client"}
            </button>
          </div>

          <div className={styles.profileFieldGrid}>
            {activeSections.overview.map((field) => (
              <ReadOnlyField key={field.label} field={field} />
            ))}
          </div>

          <ProfileSection title={selectedPerson === "partner" && hasPartner ? "Partner Details" : "Client Details"} fields={activeSections.personal} />
          <ProfileSection title="Contact Details" fields={activeSections.contact} />
          <ProfileSection title="Advice Agreement Details" fields={activeSections.annualAgreement} />
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

            <div className={styles.modalStepTabs}>
              {EDIT_STEPS.map((step, index) => (
                <button
                  key={step.key}
                  type="button"
                  className={`${styles.modalStepTab} ${editStep === step.key ? styles.modalStepTabActive : ""}`.trim()}
                  onClick={() => setEditStep(step.key)}
                >
                  <span className={styles.modalStepNumber}>{index + 1}</span>
                  {step.label}
                </button>
              ))}
            </div>

            {editStep === "overview" ? (
              <div className={styles.modalGrid}>
                <label className={styles.modalField}>
                  <span>Title</span>
                  <select value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })}>
                    <option value="">Select title</option>
                    {TITLE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.modalField}>
                  <span>Full Name</span>
                  <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                </label>
                <label className={styles.modalField}>
                  <span>Status</span>
                  <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
                    <option value="">Select status</option>
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.modalField}>
                  <span>Client Category</span>
                  <select
                    value={draft.clientCategory}
                    onChange={(event) => setDraft({ ...draft, clientCategory: event.target.value })}
                  >
                    <option value="">Select category</option>
                    {CLIENT_CATEGORY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.modalField}>
                  <span>Risk Profile</span>
                  <select value={draft.riskProfile} onChange={(event) => setDraft({ ...draft, riskProfile: event.target.value })}>
                    <option value="">Select risk profile</option>
                    {RISK_PROFILE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.modalField}>
                  <span>Practice</span>
                  <input value={draft.practice} readOnly />
                </label>
              </div>
            ) : null}

            {editStep === "personal" ? (
              <div className={styles.modalGrid}>
                <label className={styles.modalField}>
                  <span>Client ID</span>
                  <input value={draft.clientId} readOnly />
                </label>
                <label className={styles.modalField}>
                  <span>Date of Birth</span>
                  <input type="date" value={draft.dateOfBirth} onChange={(event) => setDraft({ ...draft, dateOfBirth: event.target.value })} />
                </label>
                <label className={styles.modalField}>
                  <span>Marital Status</span>
                  <select
                    value={draft.maritalStatus}
                    onChange={(event) => setDraft({ ...draft, maritalStatus: event.target.value })}
                  >
                    <option value="">Select marital status</option>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="De facto">De facto</option>
                    <option value="Separated">Separated</option>
                    <option value="Divorced">Divorced</option>
                    <option value="Widowed">Widowed</option>
                  </select>
                </label>
                <label className={styles.modalField}>
                  <span>Resident Status</span>
                  <select
                    value={draft.residentStatus}
                    onChange={(event) => setDraft({ ...draft, residentStatus: event.target.value })}
                  >
                    <option value="">Select resident status</option>
                    <option value="Resident">Resident</option>
                    <option value="Non-resident">Non-resident</option>
                    <option value="Temporary Resident">Temporary Resident</option>
                    <option value="Foreign Resident">Foreign Resident</option>
                  </select>
                </label>
                <label className={styles.modalField}>
                  <span>Gender</span>
                  <select value={draft.gender} onChange={(event) => setDraft({ ...draft, gender: event.target.value })}>
                    <option value="">Select gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Non-binary">Non-binary</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </label>
              </div>
            ) : null}

            {editStep === "contact" ? (
              <div className={styles.modalGrid}>
                <label className={styles.modalField}>
                  <span>Street</span>
                  <input value={draft.street} onChange={(event) => setDraft({ ...draft, street: event.target.value })} />
                </label>
                <label className={styles.modalField}>
                  <span>Suburb</span>
                  <input value={draft.suburb} onChange={(event) => setDraft({ ...draft, suburb: event.target.value })} />
                </label>
                <label className={styles.modalField}>
                  <span>State</span>
                  <input value={draft.state} onChange={(event) => setDraft({ ...draft, state: event.target.value })} />
                </label>
                <label className={styles.modalField}>
                  <span>Post Code</span>
                  <input value={draft.postCode} onChange={(event) => setDraft({ ...draft, postCode: event.target.value })} />
                </label>
                <label className={styles.modalField}>
                  <span>Email</span>
                  <input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
                </label>
                <label className={styles.modalField}>
                  <span>Preferred Phone</span>
                  <input value={draft.preferredPhone} onChange={(event) => setDraft({ ...draft, preferredPhone: event.target.value })} />
                </label>
              </div>
            ) : null}

            {editStep === "agreement" ? (
              <div className={styles.modalGrid}>
                <label className={styles.modalField}>
                  <span>Advice Agreement Required</span>
                  <select
                    value={draft.adviceAgreementRequired}
                    onChange={(event) => setDraft({ ...draft, adviceAgreementRequired: event.target.value })}
                  >
                    <option value="">Select an option</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </label>
                <label className={styles.modalField}>
                  <span>Agreement Type</span>
                  <select value={draft.agreementType} onChange={(event) => setDraft({ ...draft, agreementType: event.target.value })}>
                    <option value="">Select agreement type</option>
                    {AGREEMENT_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.modalField}>
                  <span>Next Anniversary Date</span>
                  <input
                    type="date"
                    value={draft.nextAnniversaryDate}
                    onChange={(event) => setDraft({ ...draft, nextAnniversaryDate: event.target.value })}
                  />
                </label>
              </div>
            ) : null}

            {saveError ? <p className={styles.modalError}>{saveError}</p> : null}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalSecondary}
                onClick={() => setEditStep(EDIT_STEPS[Math.max(0, EDIT_STEPS.findIndex((step) => step.key === editStep) - 1)]!.key)}
                disabled={saving || editStep === EDIT_STEPS[0]!.key}
              >
                Back
              </button>
              <button type="button" className={styles.modalSecondary} onClick={() => setEditing(null)} disabled={saving}>
                Cancel
              </button>
              {editStep !== EDIT_STEPS[EDIT_STEPS.length - 1]!.key ? (
                <button
                  type="button"
                  className={styles.modalPrimary}
                  onClick={() => setEditStep(EDIT_STEPS[Math.min(EDIT_STEPS.length - 1, EDIT_STEPS.findIndex((step) => step.key === editStep) + 1)]!.key)}
                  disabled={saving}
                >
                  Next
                </button>
              ) : (
                <button type="button" className={styles.modalPrimary} onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : "Save changes"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
