"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AssetsSection } from "@/app/clients/[clientId]/assets-section";
import { DependentSection } from "@/app/clients/[clientId]/dependent-section";
import { EntitiesSection } from "@/app/clients/[clientId]/entities-section";
import { FinancialRecordsSection } from "@/app/clients/[clientId]/financial-records-section";
import type { ClientEmploymentRecord, ClientProfile, PersonRecord } from "@/lib/api/types";
import {
  deleteEmploymentRecord,
  updateClientDetails,
  updatePartnerDetails,
  upsertEmploymentRecords,
} from "@/lib/services/client-updates";
import styles from "./page.module.css";

type PersonTarget = "client" | "partner";

type StepKey =
  | "details"
  | "employment"
  | "entities"
  | "dependants"
  | "assets"
  | "liabilities"
  | "superannuation"
  | "pensions"
  | "insurance"
  | "income"
  | "expenses"
  | "riskprofile"
  | "review";

type PersonDraft = {
  name: string;
  dob: string;
  gender: string;
  nationality: string;
  maritalStatus: string;
  residentStatus: string;
  street: string;
  state: string;
  suburb: string;
  postCode: string;
  email: string;
  preferredPhone: string;
  healthStatus: string;
  healthHistory: string;
  smoker: string;
  healthInsurance: string;
};

type EmploymentDraft = {
  id: string;
  persistedId?: string;
  owner: PersonTarget;
  jobTitle: string;
  status: string;
  employer: string;
  salary: string;
  frequency: string;
  primaryEmployment: string;
  startDate: string;
  endDate: string;
};

type CurrentUserSummary = {
  id: string;
  name: string;
  email: string;
};

type RiskQuestionnaireChoice = {
  index: number;
  value: string;
  points: number;
};

type RiskQuestionnaireItem = {
  index: number;
  title: string;
  description: string;
  choices: RiskQuestionnaireChoice[];
  id: string;
};

type RiskProfileScoreResult = {
  graph: string;
  outcome: string;
  description?: string | null;
  rangeFrom: number;
  rangeTo: number;
  id: string;
};

type SelectedRiskChoice = {
  choice: string;
  points: number;
  persisted?: boolean;
};

type RiskAssessmentState = {
  selectedChoices: Record<string, SelectedRiskChoice>;
  validationErrors: Record<string, string>;
  totalScore: number | null;
  result: RiskProfileScoreResult | null;
  agreeOutcome: string;
  notAgree: string;
  submitting: boolean;
  saving: boolean;
  error: string;
  success: string;
};

const STEPS: { key: StepKey; label: string }[] = [
  { key: "details", label: "Client/Partner Details" },
  { key: "employment", label: "Employment" },
  { key: "entities", label: "Entities" },
  { key: "dependants", label: "Dependants" },
  { key: "assets", label: "Assets" },
  { key: "liabilities", label: "Liability" },
  { key: "superannuation", label: "Superannuation" },
  { key: "pensions", label: "Pensions" },
  { key: "insurance", label: "Insurance" },
  { key: "income", label: "Income" },
  { key: "expenses", label: "Expenses" },
  { key: "riskprofile", label: "Risk Profile" },
  { key: "review", label: "Review & Declaration" },
];

const GENDER_OPTIONS = ["Male", "Female", "Non-binary", "Other", "Prefer not to say"];
const MARITAL_STATUS_OPTIONS = ["Single", "Married", "De facto", "Separated", "Divorced", "Widowed"];
const RESIDENT_STATUS_OPTIONS = ["Resident", "Non-resident", "Temporary Resident", "Foreign Resident"];
const HEALTH_STATUS_OPTIONS = ["Excellent", "Good", "Average", "Poor", "Pre-existing condition", "Under review"];
const BOOLEAN_OPTIONS = ["Yes", "No"];
const EMPLOYMENT_STATUS_OPTIONS = ["Full-time", "Part-time", "Casual", "Contract", "Self-employed", "Retired", "Unemployed"];
const FREQUENCY_OPTIONS = ["Weekly", "Fortnightly", "Monthly", "Quarterly", "Annually"];

function createRiskAssessmentState(): RiskAssessmentState {
  return {
    selectedChoices: {},
    validationErrors: {},
    totalScore: null,
    result: null,
    agreeOutcome: "",
    notAgree: "",
    submitting: false,
    saving: false,
    error: "",
    success: "",
  };
}

function getQuestionKey(question: RiskQuestionnaireItem) {
  return question.id?.trim() || `${question.index}`;
}

function normalizeGraphUrl(value?: string | null) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return trimmed;
}

function normalizeRiskLookup(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function createPersistedRiskAssessmentState(person?: PersonRecord | null, questions: RiskQuestionnaireItem[] = []) {
  const persisted = person?.riskProfileResponse;
  const base = createRiskAssessmentState();

  if (!persisted) {
    return base;
  }

  const selectedChoices = (persisted.answer ?? []).reduce<Record<string, SelectedRiskChoice>>((choices, answer) => {
    const answerIndex = normalizeRiskLookup(answer.index);
    const answerQuestion = normalizeRiskLookup(answer.question);
    const answerChoice = answer.choice?.trim() ?? "";
    const question = questions.find((item) => {
      return normalizeRiskLookup(String(item.index)) === answerIndex || normalizeRiskLookup(item.title) === answerQuestion || normalizeRiskLookup(item.description) === answerQuestion;
    });

    if (!question || !answerChoice) {
      return choices;
    }

    const choice = question.choices.find((item) => normalizeRiskLookup(item.value) === normalizeRiskLookup(answerChoice));
    choices[getQuestionKey(question)] = {
      choice: answerChoice,
      points: choice?.points ?? 0,
      persisted: true,
    };
    return choices;
  }, {});

  const score = Number(persisted.score);
  const hasResult = Boolean(persisted.resultDisplay?.trim() || persisted.resultGraph?.trim());

  return {
    ...base,
    selectedChoices,
    totalScore: Number.isFinite(score) ? score : null,
    result: hasResult
      ? {
          graph: persisted.resultGraph ?? "",
          outcome: persisted.resultDisplay ?? "",
          description: null,
          rangeFrom: Number.isFinite(score) ? score : 0,
          rangeTo: Number.isFinite(score) ? score : 0,
          id: "",
        }
      : null,
    agreeOutcome: persisted.agreeOutcome ?? "",
    notAgree: "notAgree" in persisted && typeof persisted.notAgree === "string" ? persisted.notAgree : "",
  };
}

function parseApiMessage(body: unknown, fallback: string) {
  if (body && typeof body === "object") {
    const record = body as { message?: unknown; modelErrors?: unknown };
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message;
    }

    if (Array.isArray(record.modelErrors) && record.modelErrors.length) {
      return record.modelErrors.map((item) => String(item)).join(" ");
    }
  }

  return fallback;
}

async function readJsonResponse<T>(response: Response, fallbackMessage: string) {
  const text = await response.text().catch(() => "");
  const body = (() => {
    if (!text) return null;
    try {
      return JSON.parse(text) as T & { status?: boolean | null; message?: string | null; modelErrors?: unknown[] | null };
    } catch {
      return null;
    }
  })();

  if (!response.ok || (body && body.status === false)) {
    throw new Error(parseApiMessage(body, text.trim() || fallbackMessage));
  }

  return body;
}

function firstText(...values: Array<string | null | undefined>) {
  return values.find((value) => value?.trim())?.trim() ?? "";
}

function toInputDate(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function calculateAge(value: string) {
  if (!value) return "";
  const dob = new Date(value);
  if (Number.isNaN(dob.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age -= 1;
  return `${age}`;
}

function getRecordString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "boolean") return value ? "Yes" : "No";
  }
  return "";
}

function getNestedRecordString(record: Record<string, unknown>, parentKey: string, keys: string[]) {
  const parent = record[parentKey];
  return parent && typeof parent === "object" ? getRecordString(parent as Record<string, unknown>, keys) : "";
}

function normalizeLookup(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function personHasData(person?: PersonRecord | null) {
  return Boolean(firstText(person?.id, person?.ic2AppId, person?.name, person?.email, person?.dob));
}

function getPersonEditableId(profile: ClientProfile, target: PersonTarget, person?: PersonRecord | null) {
  if (target === "client") {
    return firstText(person?.id, person?.ic2AppId, profile.id);
  }

  return firstText(person?.id, person?.ic2AppId);
}

function createPersonDraft(person?: PersonRecord | null): PersonDraft {
  const record = (person ?? {}) as PersonRecord & Record<string, unknown>;

  return {
    name: person?.name ?? "",
    dob: toInputDate(person?.dob),
    gender: person?.gender ?? "",
    nationality: person?.nationality ?? "",
    maritalStatus: getRecordString(record, ["maritalStatus"]),
    residentStatus: getRecordString(record, ["residentStatus"]),
    street: getNestedRecordString(record, "address", ["street", "line1"]) || getRecordString(record, ["street", "addressStreet"]),
    state: getNestedRecordString(record, "address", ["state", "region"]) || getRecordString(record, ["state", "addressState"]),
    suburb: getNestedRecordString(record, "address", ["suburb", "city"]) || getRecordString(record, ["suburb", "addressSuburb"]),
    postCode:
      getNestedRecordString(record, "address", ["postCode", "postcode", "zipCode"]) ||
      getRecordString(record, ["postCode", "postcode", "addressPostCode"]),
    email: person?.email ?? "",
    preferredPhone:
      getRecordString(record, ["preferredPhone", "phone", "mobile", "mobilePhone"]) ||
      getNestedRecordString(record, "contact", ["preferredPhone", "phone"]),
    healthStatus: getRecordString(record, ["healthStatus", "health_status"]),
    healthHistory: getRecordString(record, ["healthHistory", "health_history"]),
    smoker: getRecordString(record, ["smoker"]),
    healthInsurance: getRecordString(record, ["healthInsurance", "health_insurance"]),
  };
}

function employmentBelongsToPerson(item: ClientEmploymentRecord, person?: PersonRecord | null) {
  const ownerId = normalizeLookup(item.owner?.id);
  const ownerName = normalizeLookup(item.owner?.name);
  const personIds = [person?.id, person?.ic2AppId].map(normalizeLookup).filter(Boolean);
  const personName = normalizeLookup(person?.name);

  return Boolean((ownerId && personIds.includes(ownerId)) || (ownerName && personName && ownerName === personName));
}

function employmentFrequency(item: NonNullable<PersonRecord["employment"]>[number] | ClientEmploymentRecord) {
  return typeof item.frequency === "string" ? item.frequency : item.frequency?.value ?? item.frequency?.type ?? "";
}

function getEmploymentRecords(profile: ClientProfile, person?: PersonRecord | null) {
  const profileRecords = profile.employment?.filter((item) => employmentBelongsToPerson(item, person)) ?? [];
  return profileRecords.length ? profileRecords : Array.isArray(person?.employment) ? person.employment : [];
}

function createEmploymentDraft(
  item?: NonNullable<PersonRecord["employment"]>[number] | ClientEmploymentRecord,
  index = 0,
  owner: PersonTarget = "client",
): EmploymentDraft {
  return {
    id: item?.id ?? `employment-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    persistedId: item?.id ?? undefined,
    owner,
    jobTitle: firstText(item?.job_title, item?.jobTitle),
    status: item?.status ?? "",
    employer: item?.employer ?? "",
    salary: item?.salary ?? "",
    frequency: employmentFrequency(item ?? {}),
    primaryEmployment: item?.primaryEmployment === true ? "Yes" : item?.primaryEmployment === false ? "No" : "",
    startDate: toInputDate(item?.startDate),
    endDate: toInputDate(item?.endDate),
  };
}

function createEmploymentDrafts(profile: ClientProfile, person?: PersonRecord | null, owner: PersonTarget = "client") {
  return getEmploymentRecords(profile, person).map((item, index) => createEmploymentDraft(item, index, owner));
}

function formatCurrency(value?: string | null) {
  if (!value) return "";
  const amount = Number(String(value).replace(/[^0-9.-]/g, ""));
  if (Number.isNaN(amount)) return value;
  return amount.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  children,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  type?: string;
  children?: React.ReactNode;
  readOnly?: boolean;
}) {
  return (
    <label className={styles.onboardingField}>
      <span>{label}</span>
      {children ?? (
        <input
          type={type}
          value={value}
          readOnly={readOnly}
          onChange={(event) => onChange?.(event.target.value)}
        />
      )}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <Field label={label} value={value}>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </Field>
  );
}

function SummaryCount({ label, value, onClick }: { label: string; value: number; onClick: () => void }) {
  return (
    <button type="button" className={styles.reviewCount} onClick={onClick} aria-label={`Go to ${label}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  );
}

async function patchOnboardingCompletion(profileId: string, target: PersonTarget, personId: string) {
  const response = await fetch(
    `/api/client-profiles/${encodeURIComponent(profileId)}/${target}/${encodeURIComponent(personId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        declaration: true,
        onboardingStatus: {
          status: "Completed",
          colour: "#14ff53"
        }
      }),
    },
  );

  const text = await response.text().catch(() => "");
  const body = (() => {
    if (!text) return null;
    try {
      return JSON.parse(text) as { message?: string | null; status?: boolean | null; data?: boolean | null };
    } catch {
      return null;
    }
  })();

  if (!response.ok || (body && (body.status === false || body.data === false))) {
    throw new Error(body?.message ?? (text.trim() || "Unable to complete onboarding."));
  }

  return body;
}

export function OnboardingWorkflow({ profile }: { profile: ClientProfile }) {
  const router = useRouter();
  const hasPartner = personHasData(profile.partner);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [clientDraft, setClientDraft] = useState(() => createPersonDraft(profile.client));
  const [partnerDraft, setPartnerDraft] = useState(() => createPersonDraft(profile.partner));
  const [employmentRows, setEmploymentRows] = useState(() => [
    ...createEmploymentDrafts(profile, profile.client, "client"),
    ...(hasPartner ? createEmploymentDrafts(profile, profile.partner, "partner") : []),
  ]);
  const [savingMessage, setSavingMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeDetailsTarget, setActiveDetailsTarget] = useState<PersonTarget>("client");
  const [employmentModalRow, setEmploymentModalRow] = useState<EmploymentDraft | null>(null);
  const [editingEmploymentId, setEditingEmploymentId] = useState<string | null>(null);
  const [deleteEmploymentId, setDeleteEmploymentId] = useState<string | null>(null);
  const [riskQuestionnaires, setRiskQuestionnaires] = useState<RiskQuestionnaireItem[]>([]);
  const [riskQuestionnaireLoading, setRiskQuestionnaireLoading] = useState(true);
  const [riskQuestionnaireError, setRiskQuestionnaireError] = useState("");
  const [riskQuestionIndex, setRiskQuestionIndex] = useState(0);
  const [currentUser, setCurrentUser] = useState<CurrentUserSummary | null>(null);
  const [riskAssessments, setRiskAssessments] = useState<Record<PersonTarget, RiskAssessmentState>>({
    client: createRiskAssessmentState(),
    partner: createRiskAssessmentState(),
  });

  const activeStep = STEPS[activeStepIndex]!;
  const activeStepLabel = activeStep.key === "details" && !hasPartner ? "Client Details" : activeStep.label;

  const personTargets = useMemo(
    () =>
      [
        { target: "client" as const, label: "Client", person: profile.client, draft: clientDraft, setDraft: setClientDraft },
        hasPartner
          ? { target: "partner" as const, label: "Partner", person: profile.partner, draft: partnerDraft, setDraft: setPartnerDraft }
          : null,
      ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [clientDraft, hasPartner, partnerDraft, profile.client, profile.partner],
  );

  const activeDetailsPerson = personTargets.find((item) => item.target === activeDetailsTarget) ?? personTargets[0];

  useEffect(() => {
    let cancelled = false;

    async function loadRiskProfileData() {
      setRiskQuestionnaireLoading(true);
      setRiskQuestionnaireError("");

      try {
        const [questionnaireResponse, userResponse] = await Promise.all([
          fetch("/api/client-profiles/risk-profile-questionnaires", { cache: "no-store" }),
          fetch("/api/users/me", { cache: "no-store" }),
        ]);

        const questionnaireBody = await readJsonResponse<{
          data?: RiskQuestionnaireItem[] | null;
        }>(questionnaireResponse, "Unable to load the risk profile questionnaire.");
        const questions = Array.isArray(questionnaireBody?.data) ? questionnaireBody.data : [];

        if (!cancelled) {
          setRiskQuestionnaires(questions);
          setRiskAssessments({
            client: createPersistedRiskAssessmentState(profile.client, questions),
            partner: createPersistedRiskAssessmentState(profile.partner, questions),
          });
        }

        if (userResponse.ok) {
          const userBody = (await userResponse.json().catch(() => null)) as
            | {
                data?: {
                  id?: string | null;
                  name?: string | null;
                  email?: string | null;
                } | null;
              }
            | null;
          const user = userBody?.data;
          if (!cancelled && user?.id) {
            setCurrentUser({
              id: user.id,
              name: user.name ?? "",
              email: user.email ?? "",
            });
          }
        }
      } catch (error) {
        if (!cancelled) {
          setRiskQuestionnaireError(error instanceof Error ? error.message : "Unable to load the risk profile questionnaire.");
        }
      } finally {
        if (!cancelled) {
          setRiskQuestionnaireLoading(false);
        }
      }
    }

    void loadRiskProfileData();

    return () => {
      cancelled = true;
    };
  }, []);

  function moveStep(offset: number) {
    setErrorMessage("");
    setSavingMessage("");
    setActiveStepIndex((current) => Math.min(Math.max(current + offset, 0), STEPS.length - 1));
  }

  function goToStep(stepKey: StepKey) {
    const index = STEPS.findIndex((step) => step.key === stepKey);
    if (index === -1) return;
    setErrorMessage("");
    setSavingMessage("");
    setActiveStepIndex(index);
  }

  async function handleSignOut() {
    setErrorMessage("");
    setSavingMessage("");

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      router.replace("/");
      router.refresh();
    }
  }

  async function savePersonDetails() {
    if (!profile.id) {
      setErrorMessage("This client profile does not have a profile id yet.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSavingMessage("");

    try {
      for (const item of personTargets) {
        const personId = getPersonEditableId(profile, item.target, item.person);
        if (!item.person || !personId) {
          throw new Error(`${item.label} details cannot be saved because the person record is missing an id.`);
        }

        const payload = {
          profileId: profile.id,
          personId,
          person: item.person,
          target: item.target,
          changes: {
            name: item.draft.name,
            dateOfBirth: item.draft.dob,
            gender: item.draft.gender,
            nationality: item.draft.nationality,
            maritalStatus: item.draft.maritalStatus,
            residentStatus: item.draft.residentStatus,
            street: item.draft.street,
            state: item.draft.state,
            suburb: item.draft.suburb,
            postCode: item.draft.postCode,
            email: item.draft.email,
            preferredPhone: item.draft.preferredPhone,
            healthStatus: item.draft.healthStatus,
            healthHistory: item.draft.healthHistory,
            smoker: item.draft.smoker,
            healthInsurance: item.draft.healthInsurance,
          },
        };

        if (item.target === "client") {
          await updateClientDetails(payload);
        } else {
          await updatePartnerDetails(payload);
        }
      }

      setSavingMessage("Details saved.");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save details right now.");
    } finally {
      setSaving(false);
    }
  }

  async function saveEmployment(rows = employmentRows) {
    if (!profile.id) {
      setErrorMessage("This client profile does not have a profile id yet.");
      return false;
    }

    setSaving(true);
    setErrorMessage("");
    setSavingMessage("");

    try {
      const groups: Array<{
        label: string;
        target: PersonTarget;
        person?: PersonRecord | null;
        rows: EmploymentDraft[];
        ownerName: string;
      }> = [
        { label: "Client", target: "client", person: profile.client, rows: rows.filter((row) => row.owner === "client"), ownerName: clientDraft.name },
        ...(hasPartner
          ? [
              {
                label: "Partner",
                target: "partner" as const,
                person: profile.partner,
                rows: rows.filter((row) => row.owner === "partner"),
                ownerName: partnerDraft.name,
              },
            ]
          : []),
      ];

      for (const group of groups) {
        const ownerId = getPersonEditableId(profile, group.target, group.person);
        if (!group.person || !ownerId || !group.rows.length) continue;

        await upsertEmploymentRecords({
          profileId: profile.id,
          owner: {
            id: ownerId,
            name: group.ownerName || group.person.name || "",
          },
          request: group.rows.map((row) => ({
            id: row.persistedId,
            jobTitle: row.jobTitle,
            status: row.status,
            employer: row.employer,
            salary: row.salary.replace(/[^0-9.-]/g, ""),
            frequency: row.frequency,
            primaryEmployment: row.primaryEmployment,
            startDate: row.startDate,
            endDate: row.endDate,
          })),
        });
      }

      setSavingMessage("Employment saved.");
      router.refresh();
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save employment right now.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function updateEmploymentModalRow(field: keyof EmploymentDraft, value: string) {
    setEmploymentModalRow((current) => (current ? { ...current, [field]: value } : current));
  }

  function openEmploymentModal(row?: EmploymentDraft) {
    setEditingEmploymentId(row?.id ?? null);
    setEmploymentModalRow(row ? { ...row } : createEmploymentDraft(undefined, employmentRows.length));
    setErrorMessage("");
    setSavingMessage("");
  }

  async function saveEmploymentModal() {
    if (!employmentModalRow) return;

    const nextRows = editingEmploymentId
      ? employmentRows.map((row) => (row.id === editingEmploymentId ? employmentModalRow : row))
      : [...employmentRows, employmentModalRow];

    const saved = await saveEmployment(nextRows);
    if (saved) {
      setEmploymentRows(nextRows);
      setEditingEmploymentId(null);
      setEmploymentModalRow(null);
    }
  }

  async function removeEmploymentRow(id: string) {
    const row = employmentRows.find((item) => item.id === id);
    const nextRows = employmentRows.filter((item) => item.id !== id);

    setSaving(true);
    setErrorMessage("");
    setSavingMessage("");

    try {
      if (row?.persistedId) {
        if (!profile.id) {
          throw new Error("This client profile does not have a profile id yet.");
        }

        await deleteEmploymentRecord(profile.id, row.persistedId);
      }

      setEmploymentRows(nextRows);
      setSavingMessage("Employment deleted.");
      router.refresh();
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to delete employment right now.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function employmentOwnerName(owner: PersonTarget) {
    const person = owner === "partner" ? profile.partner : profile.client;
    const draft = owner === "partner" ? partnerDraft : clientDraft;
    return firstText(draft.name, person?.name, owner === "partner" ? "Partner" : "Client");
  }

  function updateRiskAssessment(target: PersonTarget, updater: (current: RiskAssessmentState) => RiskAssessmentState) {
    setRiskAssessments((current) => ({
      ...current,
      [target]: updater(current[target] ?? createRiskAssessmentState()),
    }));
  }

  function selectRiskChoice(target: PersonTarget, question: RiskQuestionnaireItem, choice: RiskQuestionnaireChoice) {
    const questionKey = getQuestionKey(question);

    updateRiskAssessment(target, (current) => {
      const nextValidationErrors = { ...current.validationErrors };
      delete nextValidationErrors[questionKey];

      return {
        ...current,
        selectedChoices: {
          ...current.selectedChoices,
          [questionKey]: {
            choice: choice.value,
            points: Number(choice.points) || 0,
            persisted: false,
          },
        },
        validationErrors: nextValidationErrors,
        result: null,
        totalScore: null,
        agreeOutcome: "",
        notAgree: "",
        error: "",
        success: "",
      };
    });
  }

  async function submitRiskAssessment(target: PersonTarget) {
    const assessment = riskAssessments[target] ?? createRiskAssessmentState();
    const validationErrors = riskQuestionnaires.reduce<Record<string, string>>((errors, question) => {
      const questionKey = getQuestionKey(question);
      if (!assessment.selectedChoices[questionKey]) {
        errors[questionKey] = "Please select an answer.";
      }
      return errors;
    }, {});

    if (!riskQuestionnaires.length) {
      updateRiskAssessment(target, (current) => ({
        ...current,
        error: "No risk profile questionnaire items are available yet.",
        success: "",
      }));
      return false;
    }

    if (Object.keys(validationErrors).length) {
      updateRiskAssessment(target, (current) => ({
        ...current,
        validationErrors,
        error: "Please answer all questions before submitting.",
        success: "",
      }));
      return false;
    }

    const totalScore = riskQuestionnaires.reduce((total, question) => {
      return total + (assessment.selectedChoices[getQuestionKey(question)]?.points ?? 0);
    }, 0);

    updateRiskAssessment(target, (current) => ({
      ...current,
      submitting: true,
      error: "",
      success: "",
      validationErrors: {},
    }));

    try {
      const response = await fetch(
        `/api/client-profiles/risk-profile-scores?rangeFrom=${encodeURIComponent(totalScore)}&rangeTo=${encodeURIComponent(totalScore)}`,
        { cache: "no-store" },
      );
      const body = await readJsonResponse<{ data?: RiskProfileScoreResult[] | null }>(
        response,
        "Unable to retrieve the risk profile result.",
      );
      const result = Array.isArray(body?.data) ? body.data[0] ?? null : null;

      if (!result) {
        throw new Error(`No risk profile result was found for score ${totalScore}.`);
      }

      updateRiskAssessment(target, (current) => ({
        ...current,
        totalScore,
        result,
        agreeOutcome: "",
        notAgree: "",
        submitting: false,
        error: "",
      }));
      return true;
    } catch (error) {
      updateRiskAssessment(target, (current) => ({
        ...current,
        totalScore,
        result: null,
        submitting: false,
        error: error instanceof Error ? error.message : "Unable to retrieve the risk profile result.",
        success: "",
      }));
      return false;
    }
  }

  async function advanceRiskQuestionnaire() {
    const currentQuestion = riskQuestionnaires[riskQuestionIndex];
    const activeRiskTargets = personTargets.map((item) => item.target);

    if (!currentQuestion) {
      return;
    }

    const questionKey = getQuestionKey(currentQuestion);
    const missingTargets = activeRiskTargets.filter((target) => {
      const assessment = riskAssessments[target] ?? createRiskAssessmentState();
      return !assessment.selectedChoices[questionKey];
    });

    if (missingTargets.length) {
      setRiskAssessments((current) => {
        const next = { ...current };
        for (const target of missingTargets) {
          next[target] = {
            ...(next[target] ?? createRiskAssessmentState()),
            validationErrors: {
              ...(next[target]?.validationErrors ?? {}),
              [questionKey]: "Please select an answer.",
            },
            error: "Please answer this question before continuing.",
            success: "",
          };
        }
        return next;
      });
      return;
    }

    if (riskQuestionIndex < riskQuestionnaires.length - 1) {
      setRiskQuestionIndex((current) => current + 1);
      return;
    }

    await Promise.all(activeRiskTargets.map((target) => submitRiskAssessment(target)));
  }

  function resetRiskQuestionnaire() {
    setRiskQuestionIndex(0);
    setRiskAssessments((current) => ({
      client: {
        ...(current.client ?? createRiskAssessmentState()),
        validationErrors: {},
        totalScore: null,
        result: null,
        agreeOutcome: "",
        notAgree: "",
        submitting: false,
        saving: false,
        error: "",
        success: "",
      },
      partner: {
        ...(current.partner ?? createRiskAssessmentState()),
        validationErrors: {},
        totalScore: null,
        result: null,
        agreeOutcome: "",
        notAgree: "",
        submitting: false,
        saving: false,
        error: "",
        success: "",
      },
    }));
  }

  function updateRiskAgreement(target: PersonTarget, value: string) {
    updateRiskAssessment(target, (current) => ({
      ...current,
      agreeOutcome: value,
      notAgree: value === "No" ? current.notAgree : "",
      error: "",
      success: "",
    }));
  }

  function updateRiskDisagreementReason(target: PersonTarget, value: string) {
    updateRiskAssessment(target, (current) => ({
      ...current,
      notAgree: value,
      error: "",
      success: "",
    }));
  }

  function getRiskProfileSaveValidationError(target: PersonTarget) {
    const assessment = riskAssessments[target] ?? createRiskAssessmentState();
    const person = target === "partner" ? profile.partner : profile.client;
    const personId = getPersonEditableId(profile, target, person);

    if (!profile.id) {
      return "This client profile does not have a profile id yet.";
    }

    if (!person || !personId) {
      return `${target === "partner" ? "Partner" : "Client"} risk profile cannot be saved because the person record is missing an id.`;
    }

    if (!assessment.result || assessment.totalScore === null) {
      return "Please submit the questionnaire before saving.";
    }

    if (!assessment.agreeOutcome) {
      return "Please confirm whether you agree with the assessment.";
    }

    if (assessment.agreeOutcome === "No" && !assessment.notAgree.trim()) {
      return "Please provide the reason why you do not agree with the Risk Return Assessment.";
    }

    return "";
  }

  async function saveRiskProfile(target: PersonTarget) {
    const validationError = getRiskProfileSaveValidationError(target);
    if (validationError) {
      updateRiskAssessment(target, (current) => ({ ...current, error: validationError, success: "" }));
      return false;
    }

    const assessment = riskAssessments[target] ?? createRiskAssessmentState();
    const person = target === "partner" ? profile.partner : profile.client;
    const personId = getPersonEditableId(profile, target, person);
    const profileId = profile.id ?? "";
    const result = assessment.result;

    if (!profileId || !personId || !result) {
      updateRiskAssessment(target, (current) => ({ ...current, error: "Risk profile is not ready to save.", success: "" }));
      return false;
    }

    updateRiskAssessment(target, (current) => ({
      ...current,
      saving: true,
      error: "",
      success: "",
    }));

    try {
      const user = currentUser ?? { id: "", name: "", email: "" };
      const now = new Date().toISOString();
      const payload = {
        request: {
          creator: user,
          modifier: user,
          modifiedDate: now,
          createdDate: now,
          agreeOutcome: assessment.agreeOutcome,
          score: String(assessment.totalScore),
          resultDisplay: result.outcome ?? "",
          notAgree: assessment.agreeOutcome === "No" ? assessment.notAgree.trim() : "",
          resultGraph: result.graph ?? "",
          answer: riskQuestionnaires.map((question) => {
            const selected = assessment.selectedChoices[getQuestionKey(question)];
            return {
              index: String(question.index),
              choice: selected?.choice ?? "",
              question: firstText(question.title, question.description),
            };
          }),
        },
      };

      const response = await fetch(
        `/api/client-profiles/${encodeURIComponent(profileId)}/${target}/${encodeURIComponent(personId)}/risk-profile`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
      );

      await readJsonResponse(response, "Unable to save risk profile.");

      updateRiskAssessment(target, (current) => ({
        ...current,
        saving: false,
        error: "",
        success: `${target === "partner" ? "Partner" : "Client"} risk profile saved.`,
      }));
      router.refresh();
      return true;
    } catch (error) {
      updateRiskAssessment(target, (current) => ({
        ...current,
        saving: false,
        error: error instanceof Error ? error.message : "Unable to save risk profile.",
        success: "",
      }));
      return false;
    }
  }

  async function saveAllRiskProfiles() {
    const activeRiskTargets = personTargets.map((item) => item.target);
    const validationErrors = activeRiskTargets.map((target) => ({
      target,
      message: getRiskProfileSaveValidationError(target),
    }));

    if (validationErrors.some((item) => item.message)) {
      setRiskAssessments((current) => {
        const next = { ...current };
        for (const item of validationErrors) {
          if (!item.message) continue;
          next[item.target] = {
            ...(next[item.target] ?? createRiskAssessmentState()),
            error: item.message,
            success: "",
          };
        }
        return next;
      });
      return;
    }

    await Promise.all(activeRiskTargets.map((target) => saveRiskProfile(target)));
  }

  async function submitDeclaration() {
    if (!profile.id) {
      setErrorMessage("This client profile does not have a profile id yet.");
      return;
    }

    if (!declarationAccepted) {
      setErrorMessage("Please accept the client declaration before submitting.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSavingMessage("");

    try {
      for (const item of personTargets) {
        const personId = getPersonEditableId(profile, item.target, item.person);
        if (!item.person || !personId) continue;
        await patchOnboardingCompletion(profile.id, item.target, personId);
      }

      setCompleted(true);
      setSavingMessage("Onboarding completed.");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to complete onboarding right now.");
    } finally {
      setSaving(false);
    }
  }

  function renderPersonFields(item: (typeof personTargets)[number]) {
    const update = (field: keyof PersonDraft, value: string) => item.setDraft((current) => ({ ...current, [field]: value }));

    return (
      <div key={item.target} className={styles.onboardingFieldGroups}>
        <section className={styles.onboardingFieldGroup}>
          <h4>Personal Information</h4>
          <div className={styles.onboardingFormGrid}>
            <Field label="Name" value={item.draft.name} onChange={(value) => update("name", value)} />
            <Field label="DOB" type="date" value={item.draft.dob} onChange={(value) => update("dob", value)} />
            <Field label="Age" value={calculateAge(item.draft.dob)} readOnly />
            <SelectField label="Gender" value={item.draft.gender} onChange={(value) => update("gender", value)} options={GENDER_OPTIONS} />
            <Field label="Nationality" value={item.draft.nationality} onChange={(value) => update("nationality", value)} />
            <SelectField label="Marital Status" value={item.draft.maritalStatus} onChange={(value) => update("maritalStatus", value)} options={MARITAL_STATUS_OPTIONS} />
            <SelectField label="Resident Status" value={item.draft.residentStatus} onChange={(value) => update("residentStatus", value)} options={RESIDENT_STATUS_OPTIONS} />
          </div>
        </section>

        <section className={styles.onboardingFieldGroup}>
          <h4>Contact Details</h4>
          <div className={styles.onboardingFormGrid}>
            <Field label="Street" value={item.draft.street} onChange={(value) => update("street", value)} />
            <Field label="State" value={item.draft.state} onChange={(value) => update("state", value)} />
            <Field label="Suburb" value={item.draft.suburb} onChange={(value) => update("suburb", value)} />
            <Field label="Post Code" value={item.draft.postCode} onChange={(value) => update("postCode", value)} />
            <Field label="Email" type="email" value={item.draft.email} onChange={(value) => update("email", value)} />
            <Field label="Preferred Phone" value={item.draft.preferredPhone} onChange={(value) => update("preferredPhone", value)} />
          </div>
        </section>

        <section className={styles.onboardingFieldGroup}>
          <h4>Health Information</h4>
          <div className={styles.onboardingFormGrid}>
            <SelectField label="Health Status" value={item.draft.healthStatus} onChange={(value) => update("healthStatus", value)} options={HEALTH_STATUS_OPTIONS} />
            <SelectField label="Smoker" value={item.draft.smoker} onChange={(value) => update("smoker", value)} options={[...BOOLEAN_OPTIONS, "Former smoker"]} />
            <SelectField label="Health Insurance" value={item.draft.healthInsurance} onChange={(value) => update("healthInsurance", value)} options={BOOLEAN_OPTIONS} />
            <label className={`${styles.onboardingField} ${styles.onboardingFieldFull}`.trim()}>
              <span>Health History</span>
              <textarea value={item.draft.healthHistory} onChange={(event) => update("healthHistory", event.target.value)} />
            </label>
          </div>
        </section>
      </div>
    );
  }

  function renderDetailsStep() {
    if (!activeDetailsPerson) return null;

    return (
      <section className={styles.onboardingCard}>
        {hasPartner ? (
          <div className={styles.personTabs} role="tablist" aria-label="Client or partner details">
            {personTargets.map((item) => (
              <button
                key={item.target}
                type="button"
                role="tab"
                aria-selected={item.target === activeDetailsPerson.target}
                className={`${styles.personTab} ${item.target === activeDetailsPerson.target ? styles.personTabActive : ""}`.trim()}
                onClick={() => setActiveDetailsTarget(item.target)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}

        {renderPersonFields(activeDetailsPerson)}
      </section>
    );
  }

  function renderEmploymentGroup() {
    const ownerOptions = personTargets.map((item) => ({
      value: item.target,
      label: employmentOwnerName(item.target),
    }));

    return (
      <>
        <section className={styles.onboardingCard}>
          <div className={styles.addActionBar}>
            <button type="button" className={styles.plusButton} onClick={() => openEmploymentModal()} disabled={saving} aria-label="Add employment">
              +
            </button>
          </div>

          {employmentRows.length ? (
            <div className={styles.employmentTable}>
              <div className={styles.employmentTableHeader}>
                <div>Owner</div>
                <div>Job Title</div>
                <div>Employer</div>
                <div>Status</div>
                <div>Salary</div>
                <div aria-hidden="true"></div>
              </div>

              {employmentRows.map((row) => (
                <div key={row.id} className={styles.employmentTableRow}>
                  <div>{employmentOwnerName(row.owner)}</div>
                  <div>{row.jobTitle || "-"}</div>
                  <div>{row.employer || "-"}</div>
                  <div>{row.status || "-"}</div>
                  <div>{formatCurrency(row.salary) || "-"}</div>
                  <div className={styles.rowActions}>
                    <button type="button" className={styles.rowActionButton} onClick={() => openEmploymentModal(row)} disabled={saving}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className={`${styles.rowActionButton} ${styles.rowActionDanger}`.trim()}
                      onClick={() => setDeleteEmploymentId(row.id)}
                      disabled={saving}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.emptyText}>No employment records yet.</p>
          )}
        </section>

        {employmentModalRow ? (
          <div className={styles.modalOverlay}>
            <div className={styles.employmentModalCard}>
              <div className={styles.modalHeader}>{editingEmploymentId ? "Edit Employment" : "Add Employment"}</div>
              <div className={styles.modalBody}>
                <label className={styles.modalFieldRow}>
                  <span>Owner</span>
                  <select value={employmentModalRow.owner} onChange={(event) => updateEmploymentModalRow("owner", event.target.value)}>
                    {ownerOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.modalFieldRow}>
                  <span>Job Title</span>
                  <input value={employmentModalRow.jobTitle} onChange={(event) => updateEmploymentModalRow("jobTitle", event.target.value)} />
                </label>
                <label className={styles.modalFieldRow}>
                  <span>Status</span>
                  <select value={employmentModalRow.status} onChange={(event) => updateEmploymentModalRow("status", event.target.value)}>
                    <option value=""></option>
                    {EMPLOYMENT_STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.modalFieldRow}>
                  <span>Employer</span>
                  <input value={employmentModalRow.employer} onChange={(event) => updateEmploymentModalRow("employer", event.target.value)} />
                </label>
                <label className={styles.modalFieldRow}>
                  <span>Salary</span>
                  <input
                    type="text"
                    value={formatCurrency(employmentModalRow.salary)}
                    onChange={(event) => updateEmploymentModalRow("salary", event.target.value.replace(/[^0-9.-]/g, ""))}
                    inputMode="decimal"
                    placeholder="$0.00"
                  />
                </label>
                <label className={styles.modalFieldRow}>
                  <span>Frequency</span>
                  <select value={employmentModalRow.frequency} onChange={(event) => updateEmploymentModalRow("frequency", event.target.value)}>
                    <option value=""></option>
                    {FREQUENCY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.modalFieldRow}>
                  <span>Primary</span>
                  <select value={employmentModalRow.primaryEmployment} onChange={(event) => updateEmploymentModalRow("primaryEmployment", event.target.value)}>
                    <option value=""></option>
                    {BOOLEAN_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.modalFieldRow}>
                  <span>Start Date</span>
                  <input type="date" value={employmentModalRow.startDate} onChange={(event) => updateEmploymentModalRow("startDate", event.target.value)} />
                </label>
                <label className={styles.modalFieldRow}>
                  <span>End Date</span>
                  <input type="date" value={employmentModalRow.endDate} onChange={(event) => updateEmploymentModalRow("endDate", event.target.value)} />
                </label>
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.modalPrimary} onClick={() => void saveEmploymentModal()} disabled={saving}>
                  {saving ? "Saving..." : "Add"}
                </button>
                <button
                  type="button"
                  className={styles.modalSecondary}
                  onClick={() => {
                    setEditingEmploymentId(null);
                    setEmploymentModalRow(null);
                  }}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {deleteEmploymentId ? (
          <div className={styles.modalOverlay}>
            <div className={styles.confirmDialog}>
              <h3>Delete Employment</h3>
              <p>Are you sure you want to delete this employment record? This action cannot be undone.</p>
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={`${styles.modalPrimary} ${styles.confirmDanger}`.trim()}
                  onClick={async () => {
                    const deleted = await removeEmploymentRow(deleteEmploymentId);
                    if (deleted) {
                      setDeleteEmploymentId(null);
                    }
                  }}
                  disabled={saving}
                >
                  {saving ? "Deleting..." : "Delete"}
                </button>
                <button type="button" className={styles.modalSecondary} onClick={() => setDeleteEmploymentId(null)} disabled={saving}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  function renderRiskQuestionCard(target: PersonTarget, label: string, question: RiskQuestionnaireItem, person?: PersonRecord | null) {
    const assessment = riskAssessments[target] ?? createRiskAssessmentState();
    const personName = firstText(target === "partner" ? partnerDraft.name : clientDraft.name, person?.name, label);
    const questionKey = getQuestionKey(question);
    const selected = assessment.selectedChoices[questionKey]?.choice ?? "";
    const validationError = assessment.validationErrors[questionKey];

    return (
      <section className={styles.riskPersonPanel}>
        <h3>{personName}</h3>
        <fieldset className={styles.riskQuestion}>
          <div className={styles.riskChoiceList}>
            {question.choices.map((choice) => {
              const choiceKey = `${questionKey}-${choice.index}-${choice.value}`;
              return (
                <label key={choiceKey} className={styles.riskChoice}>
                  <input
                    type="radio"
                    name={`${target}-${questionKey}`}
                    value={choice.value}
                    checked={selected === choice.value}
                    onChange={() => selectRiskChoice(target, question, choice)}
                  />
                  <span>{choice.value}</span>
                </label>
              );
            })}
          </div>
          {validationError ? <p className={styles.fieldErrorText}>{validationError}</p> : null}
        </fieldset>

        {assessment.error ? <p className={styles.errorText}>{assessment.error}</p> : null}
      </section>
    );
  }

  function renderRiskResultCard(target: PersonTarget, label: string, person?: PersonRecord | null) {
    const assessment = riskAssessments[target] ?? createRiskAssessmentState();
    const personName = firstText(target === "partner" ? partnerDraft.name : clientDraft.name, person?.name, label);
    const graphUrl = normalizeGraphUrl(assessment.result?.graph);

    return (
      <section className={styles.riskPersonPanel}>
        <h3>{personName}</h3>
        <div className={styles.riskGraphFrame}>
          {graphUrl ? <img src={graphUrl} alt={`${personName} risk profile graph`} /> : <span>No graph available</span>}
        </div>

        {assessment.result ? (
          <div className={styles.riskOutcomeContent}>
            <h4>{assessment.result.outcome || "Risk Profile Result"}</h4>
            {assessment.result.description ? <p>{assessment.result.description}</p> : null}
            <div className={styles.riskAgreementBox}>
              <h5>Do you agree with the risk return assessment?</h5>
              <div className={styles.riskAgreementOptions}>
                {BOOLEAN_OPTIONS.map((option) => (
                  <label key={option} className={styles.riskCheckboxChoice}>
                    <input
                      type="checkbox"
                      checked={assessment.agreeOutcome === option}
                      onChange={() => updateRiskAgreement(target, option)}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
              {assessment.agreeOutcome === "No" ? (
                <label className={`${styles.onboardingField} ${styles.onboardingFieldFull} styles.riskReasonField`.trim()}>
                  <span>Why do you not agree with the outcome?</span>
                  <textarea 
                    value={assessment.notAgree}
                    placeholder="Type here..."
                    onChange={(event) => updateRiskDisagreementReason(target, event.target.value)}
                  />
                </label>
              ) : null}
            </div>

          </div>
        ) : (
          <p className={styles.emptyText}>Risk profile result has not been calculated yet.</p>
        )}

        {assessment.error ? <p className={styles.errorText}>{assessment.error}</p> : null}
        {assessment.success ? <p className={styles.successText}>{assessment.success}</p> : null}
      </section>
    );
  }

  function renderRiskProfileStep() {
    const currentQuestion = riskQuestionnaires[riskQuestionIndex];
    const activeRiskTargets = personTargets.map((item) => item.target);
    const resultsReady =
      riskQuestionnaires.length > 0 &&
      activeRiskTargets.every((target) => Boolean((riskAssessments[target] ?? createRiskAssessmentState()).result));
    const riskSaving = activeRiskTargets.some((target) => (riskAssessments[target] ?? createRiskAssessmentState()).saving);
    const nextDisabled =
      riskQuestionnaireLoading ||
      Boolean(riskQuestionnaireError) ||
      !currentQuestion ||
      activeRiskTargets.some((target) => (riskAssessments[target] ?? createRiskAssessmentState()).submitting);

    if (riskQuestionnaireLoading) {
      return (
        <section className={styles.onboardingCard}>
          <p className={styles.emptyText}>Loading risk profile questionnaire...</p>
        </section>
      );
    }

    if (riskQuestionnaireError) {
      return (
        <section className={styles.onboardingCard}>
          <p className={styles.errorText}>{riskQuestionnaireError}</p>
        </section>
      );
    }

    if (!riskQuestionnaires.length || !currentQuestion) {
      return (
        <section className={styles.onboardingCard}>
          <p className={styles.emptyText}>No risk profile questionnaire items are available.</p>
        </section>
      );
    }

    if (resultsReady) {
      return (
        <section className={styles.riskCanvas}>
          <div className={styles.riskTwoColumnGrid}>
            {renderRiskResultCard("client", "Client", profile.client)}
            {hasPartner ? renderRiskResultCard("partner", "Partner", profile.partner) : null}
          </div>
          <div className={styles.riskActionRow}>
            <button type="button" className={styles.secondaryButton} onClick={resetRiskQuestionnaire}>
              Start again
            </button>
            <button type="button" className={styles.riskSubmitButton} onClick={() => void saveAllRiskProfiles()} disabled={riskSaving}>
              {riskSaving ? "Submitting..." : "Submit"}
            </button>
          </div>
        </section>
      );
    }

    return (
      <section className={styles.riskCanvas}>
        <div className={styles.riskQuestionHeader}>
          <span>
            Question {riskQuestionIndex + 1} of {riskQuestionnaires.length}
          </span>
          <h3>{currentQuestion.title}</h3>
          {currentQuestion.description ? <p>{currentQuestion.description}</p> : null}
        </div>
        <div className={styles.riskTwoColumnGrid}>
          {renderRiskQuestionCard("client", "Client", currentQuestion, profile.client)}
          {hasPartner ? renderRiskQuestionCard("partner", "Partner", currentQuestion, profile.partner) : null}
        </div>
        <div className={styles.riskActionRow}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void advanceRiskQuestionnaire()}
            disabled={nextDisabled}
          >
            {activeRiskTargets.some((target) => (riskAssessments[target] ?? createRiskAssessmentState()).submitting)
              ? "Calculating..."
              : riskQuestionIndex === riskQuestionnaires.length - 1
                ? "Next"
                : "Next"}
          </button>
        </div>
      </section>
    );
  }

  function hasRiskProfileResult(target: PersonTarget, person?: PersonRecord | null) {
    const assessment = riskAssessments[target] ?? createRiskAssessmentState();
    return Boolean(
      assessment.result ||
        person?.riskProfileResponse?.resultDisplay?.trim() ||
        person?.riskProfileResponse?.score?.trim() ||
        person?.riskProfileResponse?.resultGraph?.trim(),
    );
  }

  function getRiskProfileReviewCount() {
    return personTargets.filter((item) => hasRiskProfileResult(item.target, item.person)).length;
  }

  function renderActiveStep() {
    switch (activeStep.key) {
      case "details":
        return (
          <>
            {renderDetailsStep()}
            <button type="button" className={styles.primaryButton} onClick={() => void savePersonDetails()} disabled={saving}>
              {saving ? "Saving..." : "Save details"}
            </button>
          </>
        );
      case "employment":
        return (
          <>
            {renderEmploymentGroup()}
          </>
        );
      case "entities":
        return (
          <section className={styles.onboardingCard}>
            <EntitiesSection profile={profile} hideSectionTitle />
          </section>
        );
      case "dependants":
        return (
          <section className={styles.onboardingCard}>
            <DependentSection profile={profile} hideSectionTitle />
          </section>
        );
      case "assets":
        return (
          <section className={styles.onboardingCard}>
            <AssetsSection profile={profile} hideSectionTitle />
          </section>
        );
      case "liabilities":
        return (
          <section className={styles.onboardingCard}>
            <FinancialRecordsSection profile={profile} kind="liabilities" hideSectionTitle />
          </section>
        );
      case "superannuation":
        return (
          <section className={styles.onboardingCard}>
            <FinancialRecordsSection profile={profile} kind="superannuation" hideSectionTitle />
          </section>
        );
      case "pensions":
        return (
          <section className={styles.onboardingCard}>
            <FinancialRecordsSection profile={profile} kind="retirement-income" hideSectionTitle />
          </section>
        );
      case "insurance":
        return (
          <section className={styles.onboardingCard}>
            <FinancialRecordsSection profile={profile} kind="insurance" hideSectionTitle />
          </section>
        );
      case "income":
        return (
          <section className={styles.onboardingCard}>
            <FinancialRecordsSection profile={profile} kind="income" hideSectionTitle />
          </section>
        );
      case "expenses":
        return (
          <section className={styles.onboardingCard}>
            <FinancialRecordsSection profile={profile} kind="expenses" hideSectionTitle />
          </section>
        );
      case "riskprofile":
        return renderRiskProfileStep();
      case "review":
        return (
          <section className={styles.onboardingCard}>
            <h3>Review all entered information</h3>
            <div className={styles.reviewGrid}>
              <SummaryCount label="People" value={hasPartner ? 2 : 1} onClick={() => goToStep("details")} />
              <SummaryCount label="Employment" value={employmentRows.length} onClick={() => goToStep("employment")} />
              <SummaryCount label="Entities" value={profile.entities?.length ?? 0} onClick={() => goToStep("entities")} />
              <SummaryCount label="Dependants" value={profile.dependants?.length ?? 0} onClick={() => goToStep("dependants")} />
              <SummaryCount label="Assets" value={profile.assets?.length ?? 0} onClick={() => goToStep("assets")} />
              <SummaryCount label="Liabilities" value={profile.liabilities?.length ?? 0} onClick={() => goToStep("liabilities")} />
              <SummaryCount label="Superannuation" value={profile.superannuation?.length ?? 0} onClick={() => goToStep("superannuation")} />
              <SummaryCount label="Pensions" value={profile.pension?.length ?? 0} onClick={() => goToStep("pensions")} />
              <SummaryCount label="Insurance" value={profile.insurance?.length ?? 0} onClick={() => goToStep("insurance")} />
              <SummaryCount label="Income" value={profile.income?.length ?? 0} onClick={() => goToStep("income")} />
              <SummaryCount label="Expenses" value={profile.expense?.length ?? 0} onClick={() => goToStep("expenses")} />
              <SummaryCount label="Risk Profile" value={getRiskProfileReviewCount()} onClick={() => goToStep("riskprofile")} />
            </div>

            <div className={styles.declarationBox}>
              <h3>Client Declaration</h3>
              <ul>
                <li>I/we have reviewed the information entered during onboarding and confirm that it is accurate.</li>
                <li>I/we understand that missing or incorrect information may affect the suitability of any recommendations provided.</li>
                <li>I/we confirm this information represents my/our current financial position, objectives, and needs.</li>
                <li>I/we understand that advice may be based on the information supplied in this onboarding process.</li>
              </ul>
              <label className={styles.declarationCheck}>
                <input
                  type="checkbox"
                  checked={declarationAccepted}
                  onChange={(event) => setDeclarationAccepted(event.target.checked)}
                />
                <span>I accept the client declaration.</span>
              </label>
              <button type="button" className={styles.primaryButton} onClick={() => void submitDeclaration()} disabled={saving || completed}>
                {completed ? "Completed" : saving ? "Submitting..." : "Submit"}
              </button>
            </div>
          </section>
        );
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.header}>
        <div className={styles.headerContent}>
          <div>
            <p className={styles.eyebrow}>Fact Find</p>
            <h1>{profile.practice ?? "Client onboarding"}</h1>
            <p>Complete the following sections to create your client profile and help us understand your financial goals and circumstances. Your information is automatically saved at each step, so you can return and continue whenever needed.</p>
          </div>
          <button type="button" className={styles.signOutButton} onClick={() => void handleSignOut()}>
            Sign out
          </button>
        </div>
      </section>

      <section className={styles.workflowShell}>
        <aside className={styles.stepList} aria-label="Onboarding steps">
          {STEPS.map((step, index) => (
            <button
              key={step.key}
              type="button"
              className={`${styles.stepButton} ${index === activeStepIndex ? styles.stepButtonActive : ""}`.trim()}
              onClick={() => {
                setActiveStepIndex(index);
                setErrorMessage("");
                setSavingMessage("");
              }}
            >
              <span>{index + 1}</span>
              {step.key === "details" && !hasPartner ? "Client Details" : step.label}
            </button>
          ))}
        </aside>

        <section className={styles.stepPanel}>
          <div className={styles.stepHeader}>
            <div>
              <p className={styles.eyebrow}>Step {activeStepIndex + 1} of {STEPS.length}</p>
              <h2>{activeStepLabel}</h2>
            </div>
          </div>

          <div className={styles.onboardingStack}>{renderActiveStep()}</div>

          {errorMessage ? <p className={styles.errorText}>{errorMessage}</p> : null}
          {savingMessage ? <p className={styles.successText}>{savingMessage}</p> : null}

          <div className={styles.workflowActions}>
            <button type="button" className={styles.secondaryButton} onClick={() => moveStep(-1)} disabled={activeStepIndex === 0 || saving}>
              Back
            </button>
            <button type="button" className={styles.primaryButton} onClick={() => moveStep(1)} disabled={activeStepIndex === STEPS.length - 1 || saving}>
              Next
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}
