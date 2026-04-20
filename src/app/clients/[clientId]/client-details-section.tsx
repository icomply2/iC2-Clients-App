"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  deleteEmploymentRecord,
  updateClientDetails,
  updateClientProfileAdviser,
  updatePartnerDetails,
  updatePersonRiskProfile,
  upsertEmploymentRecords,
} from "@/lib/services/client-updates";
import type { ClientAdviserRecord, ClientProfile, PersonRecord, UserSummary } from "@/lib/api/types";
import { useCurrentUserScope } from "@/hooks/use-current-user-scope";
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
  adviser: string;
  gender: string;
  maritalStatus: string;
  residentStatus: string;
  dateOfBirth: string;
  healthStatus: string;
  healthHistory: string;
  smoker: string;
  healthInsurance: string;
  employment: EmploymentDraft[];
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

type EmploymentDisplayRecord = {
  id: string;
  title: string;
  fields: DisplayField[];
};

type EmploymentDraft = {
  id: string;
  persistedId?: string;
  jobTitle: string;
  status: string;
  employer: string;
  salary: string;
  frequency: string;
};

type EditStepKey = "overview" | "personal" | "contact" | "health" | "employment" | "agreement";

const EDIT_STEPS: { key: EditStepKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "personal", label: "Client Details" },
  { key: "contact", label: "Contact Details" },
  { key: "health", label: "Health Details" },
  { key: "employment", label: "Employment" },
  { key: "agreement", label: "Advice Agreement" },
];

const TITLE_OPTIONS = ["Mr", "Mrs", "Ms", "Miss", "Dr", "Prof"];
const STATUS_OPTIONS = ["Prospect", "Client", "Archived", "Deceased"];
const CLIENT_CATEGORY_OPTIONS = ["Annual Agreement", "Fee For Service", "Ongoing", "Risk Only", "Whoesale"];
const RISK_PROFILE_OPTIONS = ["Cash", "Defensive", "Moderate", "Balanced", "Growth", "High Growth"];
const AGREEMENT_TYPE_OPTIONS = ["Annual Agreement", "Ongoing Agreement"];
const EMPLOYMENT_STATUS_OPTIONS = ["Full-time", "Part-time", "Casual", "Contract", "Self-employed", "Retired", "Unemployed"];
const FREQUENCY_OPTIONS = ["Weekly", "Fortnightly", "Monthly", "Quarterly", "Annually"];
const HEALTH_STATUS_OPTIONS = ["Excellent", "Good", "Average", "Poor", "Pre-existing condition", "Under review"];
const BOOLEAN_OPTIONS = ["Yes", "No"];

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

function formatCurrency(value?: string | null) {
  if (!value) {
    return "";
  }

  const normalized = value.replace(/[^0-9.-]/g, "");
  const amount = Number(normalized);

  if (Number.isNaN(amount)) {
    return value;
  }

  return amount.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function toCurrencyInput(value?: string | null) {
  if (!value) {
    return "";
  }

  const normalized = value.replace(/[^0-9.-]/g, "");
  if (!normalized) {
    return "";
  }

  return formatCurrency(normalized);
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

function createDraft(person?: PersonRecord | null, profileId?: string | null, adviserName?: string | null): EditDraft {
  const record = (person ?? {}) as PersonRecord & Record<string, unknown>;
  const employment = Array.isArray(record.employment) ? record.employment : [];

  return {
    clientId: getFirstNonEmptyValue(profileId, person?.ic2AppId, person?.id),
    title: person?.title ?? "",
    name: person?.name ?? "",
    status: getRecordValue(record, ["status", "clientStatus", "accountStatus"]) || "Client",
    clientCategory: getRecordValue(record, ["clientCategory", "category"]),
    riskProfile: person?.riskProfileResponse?.resultDisplay ?? "",
    adviser: adviserName ?? "",
    gender: person?.gender ?? "",
    maritalStatus: getRecordValue(record, ["maritalStatus"]),
    residentStatus: getRecordValue(record, ["residentStatus"]),
    dateOfBirth: toInputDate(person?.dob),
    healthStatus: getRecordValue(record, ["health_status", "healthStatus"]),
    healthHistory: getRecordValue(record, ["health_history", "healthHistory"]),
    smoker: getRecordValue(record, ["smoker"]),
    healthInsurance: getRecordValue(record, ["health_insurance", "healthInsurance"]),
    employment: employment.map((item, index) => ({
      id: item?.id ?? `${person?.id ?? "employment"}-${index}`,
      persistedId: item?.id ?? undefined,
      jobTitle: getFirstNonEmptyValue(item?.job_title, item?.jobTitle),
      status: item?.status ?? "",
      employer: item?.employer ?? "",
      salary: item?.salary ?? "",
      frequency:
        typeof item?.frequency === "string"
          ? item.frequency
          : item?.frequency?.value ?? item?.frequency?.type ?? "",
    })),
    street:
      getNestedRecordValue(record, "address", ["street", "line1"]) || getRecordValue(record, ["street", "addressStreet"]),
    suburb:
      getNestedRecordValue(record, "address", ["suburb", "city"]) || getRecordValue(record, ["suburb", "addressSuburb"]),
    state:
      getNestedRecordValue(record, "address", ["state", "region"]) || getRecordValue(record, ["state", "addressState"]),
    postCode:
      getNestedRecordValue(record, "address", ["postCode", "postcode", "zipCode"]) ||
      getRecordValue(record, ["postCode", "postcode", "addressPostCode"]),
    preferredPhone:
      getRecordValue(record, ["preferredPhone", "phone", "mobile", "mobilePhone"]) ||
      getNestedRecordValue(record, "contact", ["preferredPhone", "phone"]),
    email: person?.email ?? "",
    adviceAgreementRequired: getRecordValue(record, ["fdsAnnualAgreementRequired", "annualAgreementRequired", "fdsRequired"]),
    agreementType:
      getRecordValue(record, ["agreementType", "annualAgreementStatus"]) ||
      getNestedRecordValue(record, "annualAgreement", ["type", "agreementType"]),
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
    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
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

function createEmploymentDraft(): EmploymentDraft {
  return {
    id: `employment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    persistedId: undefined,
    jobTitle: "",
    status: "",
    employer: "",
    salary: "",
    frequency: "",
  };
}

function EmploymentSection({ records }: { records: EmploymentDisplayRecord[] }) {
  if (!records.length) {
    return null;
  }

  return (
    <section className={styles.profileSection}>
      <div className={styles.profileSectionHeading}>Employment Details</div>
      {records.map((record) => (
        <div key={record.id} className={styles.profileNestedSection}>
          <div className={styles.profileNestedHeading}>{record.title}</div>
          <div className={styles.profileFieldGrid}>
            {record.fields.map((field) => (
              <ReadOnlyField key={`${record.id}-${field.label}`} field={field} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function buildProfileSections(person: PersonRecord | null, profile: ClientProfile, adviserName: string) {
  const record = (person ?? {}) as PersonRecord & Record<string, unknown>;
  const riskDisplay = person?.riskProfileResponse?.resultDisplay ?? "";
  const employment = Array.isArray(record.employment) ? record.employment : [];

  const overview: DisplayField[] = [
    { label: "Name", value: person?.name ?? "", placeholder: "Name" },
    { label: "Status", value: getRecordValue(record, ["status", "clientStatus", "accountStatus"]) || "Client", placeholder: "Status" },
    { label: "Client Category", value: getRecordValue(record, ["clientCategory", "category"]), placeholder: "Client Category" },
    { label: "Risk Profile", value: riskDisplay, placeholder: "Risk Profile" },
    { label: "Practice", value: profile.practice ?? "", placeholder: "Practice" },
    { label: "Adviser", value: adviserName, placeholder: "Adviser" },
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
      value: getNestedRecordValue(record, "address", ["street", "line1"]) || getRecordValue(record, ["street", "addressStreet"]),
      placeholder: "Street",
    },
    {
      label: "Suburb",
      value: getNestedRecordValue(record, "address", ["suburb", "city"]) || getRecordValue(record, ["suburb", "addressSuburb"]),
      placeholder: "Suburb",
    },
    {
      label: "State",
      value: getNestedRecordValue(record, "address", ["state", "region"]) || getRecordValue(record, ["state", "addressState"]),
      placeholder: "State",
    },
    {
      label: "Post Code",
      value:
        getNestedRecordValue(record, "address", ["postCode", "postcode", "zipCode"]) ||
        getRecordValue(record, ["postCode", "postcode", "addressPostCode"]),
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
      value:
        getRecordValue(record, ["agreementType", "annualAgreementStatus"]) ||
        getNestedRecordValue(record, "annualAgreement", ["type", "agreementType"]),
      placeholder: "Agreement Type",
    },
    {
      label: "Next Anniversary Date",
      value:
        formatDate(getRecordValue(record, ["nextAnniversaryDate"]) || getNestedRecordValue(record, "annualAgreement", ["nextDueDate", "nextAnniversaryDate"])),
      placeholder: "Next Anniversary Date",
    },
  ];

  const health: DisplayField[] = [
    {
      label: "Health Status",
      value: getRecordValue(record, ["health_status", "healthStatus"]),
      placeholder: "Health Status",
    },
    {
      label: "Health History",
      value: getRecordValue(record, ["health_history", "healthHistory"]),
      placeholder: "Health History",
    },
    {
      label: "Smoker",
      value: getRecordValue(record, ["smoker"]),
      placeholder: "Smoker",
    },
    {
      label: "Health Insurance",
      value: getRecordValue(record, ["health_insurance", "healthInsurance"]),
      placeholder: "Health Insurance",
    },
  ];

  const employmentRecords: EmploymentDisplayRecord[] = employment
    .map((item, index) => {
      const frequency =
        typeof item?.frequency === "string"
          ? item.frequency
          : item?.frequency?.value ?? item?.frequency?.type ?? "";
      const fields: DisplayField[] = [
        {
          label: "Job Title",
          value: getFirstNonEmptyValue(item?.job_title, item?.jobTitle),
          placeholder: "Job Title",
        },
        {
          label: "Employment Status",
          value: item?.status ?? "",
          placeholder: "Employment Status",
        },
        {
          label: "Employer",
          value: item?.employer ?? "",
          placeholder: "Employer",
        },
        {
          label: "Salary",
          value: formatCurrency(item?.salary),
          placeholder: "Salary",
        },
        {
          label: "Frequency",
          value: frequency,
          placeholder: "Frequency",
        },
      ].filter((field) => field.value.trim().length > 0);

      if (!fields.length) {
        return null;
      }

      return {
        id: `employment-${index}`,
        title: fields.find((field) => field.label === "Job Title")?.value || `Employment ${index + 1}`,
        fields,
      };
    })
    .filter((value): value is EmploymentDisplayRecord => Boolean(value));

  return { overview, personal, contact, annualAgreement, health, employmentRecords };
}

export function ClientDetailsSection({ profile, useMockFallback }: ClientDetailsSectionProps) {
  const router = useRouter();
  const { data: currentUserScope } = useCurrentUserScope();
  const [client, setClient] = useState<PersonRecord | null>(profile.client ?? null);
  const [partner, setPartner] = useState<PersonRecord | null>(profile.partner ?? null);
  const [selectedPerson, setSelectedPerson] = useState<EditablePerson>("client");
  const [editing, setEditing] = useState<EditablePerson | null>(null);
  const [draft, setDraft] = useState<EditDraft>(createDraft(profile.client, profile.id, profile.adviser?.name));
  const [editStep, setEditStep] = useState<EditStepKey>("overview");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removedEmploymentIds, setRemovedEmploymentIds] = useState<string[]>([]);
  const [adviserName, setAdviserName] = useState(profile.adviser?.name ?? "");
  const [adviserOptions, setAdviserOptions] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const hasPartner = hasMeaningfulPerson(partner);

  const activePerson = selectedPerson === "partner" && hasPartner ? partner : client;
  const activeSections = buildProfileSections(activePerson, profile, adviserName);

  useEffect(() => {
    let isMounted = true;

    async function loadAdviserOptions() {
      const practiceName = currentUserScope?.practice?.name?.trim().toLowerCase();

      if (!practiceName) {
        if (isMounted) {
          setAdviserOptions([]);
        }
        return;
      }

      try {
        const response = await fetch("/api/users", {
          method: "GET",
          cache: "no-store",
        });

        const body = (await response.json().catch(() => null)) as
          | {
              data?: UserSummary[] | null;
            }
          | null;

        if (!response.ok || !isMounted) {
          return;
        }

        const nextOptions = Array.from(
          new Map(
            (body?.data ?? [])
              .filter((user) => user.userRole?.trim().toLowerCase() === "adviser")
              .filter((user) => user.practice?.name?.trim().toLowerCase() === practiceName)
              .filter((user) => typeof user.name === "string" && user.name.trim())
              .map((user) => [
                user.id ?? user.name!,
                { id: user.id ?? user.name!, name: user.name!.trim(), email: user.email?.trim() ?? "" },
              ]),
          ).values(),
        ).sort((left, right) => left.name.localeCompare(right.name));

        setAdviserOptions(nextOptions);
      } catch {
        if (isMounted) {
          setAdviserOptions([]);
        }
      }
    }

    void loadAdviserOptions();

    return () => {
      isMounted = false;
    };
  }, [currentUserScope?.practice?.name]);

  function updateEmploymentRow(id: string, field: keyof EmploymentDraft, value: string) {
    setDraft((current) => ({
      ...current,
      employment: current.employment.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    }));
  }

  function addEmploymentRow() {
    setDraft((current) => ({
      ...current,
      employment: [...current.employment, createEmploymentDraft()],
    }));
  }

  function removeEmploymentRow(id: string) {
    setDraft((current) => {
      const match = current.employment.find((item) => item.id === id);
      if (match?.persistedId) {
        setRemovedEmploymentIds((existing) =>
          existing.includes(match.persistedId!) ? existing : [...existing, match.persistedId!],
        );
      }

      return {
        ...current,
        employment: current.employment.filter((item) => item.id !== id),
      };
    });
  }

  function openEditor(target: EditablePerson) {
    const person = target === "client" ? client : partner;
    setDraft(createDraft(person, profile.id, adviserName || profile.adviser?.name));
    setEditStep("overview");
    setSaveError(null);
    setRemovedEmploymentIds([]);
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
      const selectedAdviserOption = adviserOptions.find((option) => option.name === draft.adviser) ?? null;
      const nextAdviser: ClientAdviserRecord | null =
        draft.adviser.trim()
          ? {
              id: selectedAdviserOption?.id ?? profile.adviser?.id ?? null,
              name: draft.adviser.trim(),
              email: selectedAdviserOption?.email || profile.adviser?.email || null,
              entity: profile.adviser?.entity ?? null,
            }
          : null;

      const changes = {
        title: draft.title,
        name: draft.name,
        status: draft.status,
        clientCategory: draft.clientCategory,
        gender: draft.gender,
        maritalStatus: draft.maritalStatus,
        residentStatus: draft.residentStatus,
        dateOfBirth: draft.dateOfBirth,
        healthStatus: draft.healthStatus,
        healthHistory: draft.healthHistory,
        smoker: draft.smoker,
        healthInsurance: draft.healthInsurance,
        street: draft.street,
        suburb: draft.suburb,
        state: draft.state,
        postCode: draft.postCode,
        preferredPhone: draft.preferredPhone,
        email: draft.email,
        adviceAgreementRequired: draft.adviceAgreementRequired,
        agreementType: draft.agreementType,
        nextAnniversaryDate: draft.nextAnniversaryDate,
      };

      if (draft.adviser.trim() !== adviserName.trim()) {
        await updateClientProfileAdviser(
          profile.id,
          {
            adviser: nextAdviser,
            practiceName: currentUserScope?.practice?.name ?? profile.practice ?? null,
            licenseeName: currentUserScope?.licensee?.name ?? profile.licensee ?? null,
          },
        );
      }

      if (editing === "client") {
        await updateClientDetails({
          profileId: profile.id,
          personId: person.id,
          person,
          changes,
        });
      } else {
        await updatePartnerDetails({
          profileId: profile.id,
          personId: person.id,
          person,
          changes,
        });
      }

      const savedRiskProfile = await updatePersonRiskProfile(
        {
          profileId: profile.id,
          personId: person.id,
          target: editing,
          changes: {},
        },
        draft.riskProfile,
      );

      for (const employmentId of removedEmploymentIds) {
        await deleteEmploymentRecord(profile.id, employmentId);
      }

      const employmentRequest = draft.employment.map((item) => ({
        id: item.persistedId,
        jobTitle: item.jobTitle,
        status: item.status,
        employer: item.employer,
        salary: item.salary.replace(/[^0-9.-]/g, ""),
        frequency: item.frequency,
      }));

      const savedEmployment =
        employmentRequest.length > 0
          ? await upsertEmploymentRecords({
              profileId: profile.id,
              owner: {
                id: person.id,
                name: draft.name || person.name || "",
              },
              request: employmentRequest,
            })
          : [];

      const updatedPerson: PersonRecord = {
        ...person,
        title: draft.title,
        name: draft.name,
        status: draft.status,
        clientCategory: draft.clientCategory,
        riskProfileResponse: {
          ...(person.riskProfileResponse ?? {}),
          resultDisplay:
            typeof savedRiskProfile?.resultDisplay === "string" ? savedRiskProfile.resultDisplay : draft.riskProfile,
          agreeOutcome:
            typeof savedRiskProfile?.agreeOutcome === "string"
              ? savedRiskProfile.agreeOutcome
              : person.riskProfileResponse?.agreeOutcome,
          score:
            typeof savedRiskProfile?.score === "string" ? savedRiskProfile.score : person.riskProfileResponse?.score,
          resultGraph:
            typeof savedRiskProfile?.resultGraph === "string"
              ? savedRiskProfile.resultGraph
              : person.riskProfileResponse?.resultGraph,
        },
        gender: draft.gender,
        maritalStatus: draft.maritalStatus,
        residentStatus: draft.residentStatus,
        dob: draft.dateOfBirth || person.dob,
        health_status: draft.healthStatus,
        healthStatus: draft.healthStatus,
        health_history: draft.healthHistory,
        healthHistory: draft.healthHistory,
        smoker: draft.smoker,
        health_insurance: draft.healthInsurance,
        healthInsurance: draft.healthInsurance,
        employment: savedEmployment.map((item) => ({
          id: typeof item === "object" && item && "id" in item ? ((item as { id?: string | null }).id ?? null) : null,
          job_title:
            typeof item === "object" && item && "jobTitle" in item ? ((item as { jobTitle?: string | null }).jobTitle ?? "") : "",
          jobTitle:
            typeof item === "object" && item && "jobTitle" in item ? ((item as { jobTitle?: string | null }).jobTitle ?? "") : "",
          status:
            typeof item === "object" && item && "status" in item ? ((item as { status?: string | null }).status ?? "") : "",
          employer:
            typeof item === "object" && item && "employer" in item ? ((item as { employer?: string | null }).employer ?? "") : "",
          salary:
            typeof item === "object" && item && "salary" in item ? ((item as { salary?: string | null }).salary ?? "") : "",
          frequency:
            typeof item === "object" && item && "frequency" in item ? ((item as { frequency?: string | null }).frequency ?? "") : "",
          owner:
            typeof item === "object" && item && "owner" in item
              ? ((item as { owner?: { id?: string | null; name?: string | null } | null }).owner ?? null)
              : null,
        })),
        preferredPhone: draft.preferredPhone,
        fdsAnnualAgreementRequired: draft.adviceAgreementRequired,
        annualAgreementRequired: draft.adviceAgreementRequired,
        annualAgreementStatus: draft.agreementType,
        agreementType: draft.agreementType,
        nextAnniversaryDate: draft.nextAnniversaryDate,
        accountStatus: draft.status,
        category: draft.clientCategory,
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

      setAdviserName(draft.adviser);
      setRemovedEmploymentIds([]);
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
          <ProfileSection title="Health Details" fields={activeSections.health} />
          <EmploymentSection records={activeSections.employmentRecords} />
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
                  <span>Adviser</span>
                  <select value={draft.adviser} onChange={(event) => setDraft({ ...draft, adviser: event.target.value })}>
                    <option value="">
                      {currentUserScope?.practice?.name ? "Select adviser" : "No practice selected"}
                    </option>
                    {adviserOptions.map((option) => (
                      <option key={option.id} value={option.name}>
                        {option.name}
                      </option>
                    ))}
                  </select>
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

            {editStep === "health" ? (
              <div className={styles.modalGrid}>
                <label className={styles.modalField}>
                  <span>Health Status</span>
                  <select
                    value={draft.healthStatus}
                    onChange={(event) => setDraft({ ...draft, healthStatus: event.target.value })}
                  >
                    <option value="">Select health status</option>
                    {HEALTH_STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.modalField}>
                  <span>Smoker</span>
                  <select value={draft.smoker} onChange={(event) => setDraft({ ...draft, smoker: event.target.value })}>
                    <option value="">Select an option</option>
                    {BOOLEAN_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                    <option value="Former smoker">Former smoker</option>
                  </select>
                </label>
                <label className={styles.modalField}>
                  <span>Health Insurance</span>
                  <select
                    value={draft.healthInsurance}
                    onChange={(event) => setDraft({ ...draft, healthInsurance: event.target.value })}
                  >
                    <option value="">Select an option</option>
                    {BOOLEAN_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`${styles.modalField} ${styles.modalFieldFull}`.trim()}>
                  <span>Health History</span>
                  <textarea
                    className={styles.modalTextarea}
                    value={draft.healthHistory}
                    onChange={(event) => setDraft({ ...draft, healthHistory: event.target.value })}
                  />
                </label>
              </div>
            ) : null}

            {editStep === "employment" ? (
              <div className={styles.modalSectionStack}>
                {draft.employment.length ? (
                  draft.employment.map((item, index) => (
                    <div key={item.id} className={styles.modalEmploymentCard}>
                      <div className={styles.modalEmploymentHeader}>
                        <strong>{item.jobTitle || `Employment ${index + 1}`}</strong>
                        <button
                          type="button"
                          className={styles.modalSecondary}
                          onClick={() => removeEmploymentRow(item.id)}
                          disabled={saving}
                        >
                          Remove
                        </button>
                      </div>
                      <div className={styles.modalGrid}>
                        <label className={styles.modalField}>
                          <span>Job Title</span>
                          <input value={item.jobTitle} onChange={(event) => updateEmploymentRow(item.id, "jobTitle", event.target.value)} />
                        </label>
                        <label className={styles.modalField}>
                          <span>Employment Status</span>
                          <select value={item.status} onChange={(event) => updateEmploymentRow(item.id, "status", event.target.value)}>
                            <option value="">Select employment status</option>
                            {EMPLOYMENT_STATUS_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className={styles.modalField}>
                          <span>Employer</span>
                          <input value={item.employer} onChange={(event) => updateEmploymentRow(item.id, "employer", event.target.value)} />
                        </label>
                        <label className={styles.modalField}>
                          <span>Salary</span>
                          <input
                            inputMode="decimal"
                            value={toCurrencyInput(item.salary)}
                            onChange={(event) => updateEmploymentRow(item.id, "salary", event.target.value.replace(/[^0-9.-]/g, ""))}
                          />
                        </label>
                        <label className={styles.modalField}>
                          <span>Frequency</span>
                          <select value={item.frequency} onChange={(event) => updateEmploymentRow(item.id, "frequency", event.target.value)}>
                            <option value="">Select frequency</option>
                            {FREQUENCY_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className={styles.modalEmptyText}>No employment records yet.</p>
                )}

                <div className={styles.modalInlineActions}>
                  <button type="button" className={styles.modalSecondary} onClick={addEmploymentRow} disabled={saving}>
                    Add employment
                  </button>
                </div>
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
