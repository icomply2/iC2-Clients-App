"use client";

import { useMemo, useState } from "react";
import {
  createAdminLicensee,
  createAdminPractice,
  getAdminLicensee,
  updateAdminLicensee,
  updateAdminPractice,
} from "@/lib/api/admin";
import type { LicenseeSummary, PracticeSummary } from "@/lib/admin-data";
import type { LicenseeDto } from "@/lib/api/types";
import styles from "@/app/admin/admin.module.css";

type Mode = "create" | "edit";

type StructureDraft = {
  name: string;
  licenseeId: string;
  abn: string;
  account: string;
  asicLicenseeNumber: string;
  b2bPay: string;
  bsb: string;
  customPrompt: boolean;
  hubDoc: string;
  licenseeAddress: string;
  licenseeLogo: string;
  licenseePostCode: string;
  licenseeState: string;
  suburb: string;
  xplanUrl: string;
};

type LicenseeTextDraftKey =
  | "abn"
  | "account"
  | "asicLicenseeNumber"
  | "b2bPay"
  | "bsb"
  | "hubDoc"
  | "licenseeAddress"
  | "licenseeLogo"
  | "licenseePostCode"
  | "licenseeState"
  | "suburb"
  | "xplanUrl";

const licenseeTextFields: { key: LicenseeTextDraftKey; label: string; placeholder?: string }[] = [
  { key: "asicLicenseeNumber", label: "AFSL number", placeholder: "Australian Financial Services Licence number" },
  { key: "abn", label: "ABN", placeholder: "Licensee ABN" },
  { key: "licenseeAddress", label: "Street address", placeholder: "Licensee street address" },
  { key: "suburb", label: "Suburb", placeholder: "Suburb" },
  { key: "licenseeState", label: "State", placeholder: "State" },
  { key: "licenseePostCode", label: "Post code", placeholder: "Post code" },
  { key: "bsb", label: "BSB", placeholder: "Payment BSB" },
  { key: "account", label: "Account number", placeholder: "Payment account number" },
  { key: "b2bPay", label: "B2BPay", placeholder: "B2BPay reference or account" },
  { key: "xplanUrl", label: "Xplan URL", placeholder: "Xplan URL" },
  { key: "hubDoc", label: "HubDoc", placeholder: "HubDoc reference or URL" },
  { key: "licenseeLogo", label: "Licensee logo", placeholder: "Logo URL or data URL" },
];

function cleanText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function emptyDraft(): StructureDraft {
  return {
    name: "",
    licenseeId: "",
    abn: "",
    account: "",
    asicLicenseeNumber: "",
    b2bPay: "",
    bsb: "",
    customPrompt: false,
    hubDoc: "",
    licenseeAddress: "",
    licenseeLogo: "",
    licenseePostCode: "",
    licenseeState: "",
    suburb: "",
    xplanUrl: "",
  };
}

function licenseeToDraft(licensee: LicenseeDto | null | undefined, fallback?: LicenseeSummary | null): StructureDraft {
  return {
    ...emptyDraft(),
    name: cleanText(licensee?.name) || fallback?.name || "",
    abn: cleanText(licensee?.abn),
    account: cleanText(licensee?.account),
    asicLicenseeNumber: cleanText(licensee?.asicLicenseeNumber),
    b2bPay: cleanText(licensee?.b2bPay),
    bsb: cleanText(licensee?.bsb),
    customPrompt: Boolean(licensee?.customPrompt),
    hubDoc: cleanText(licensee?.hubDoc),
    licenseeAddress: cleanText(licensee?.licenseeAddress),
    licenseeLogo: cleanText(licensee?.licenseeLogo),
    licenseePostCode: cleanText(licensee?.licenseePostCode),
    licenseeState: cleanText(licensee?.licenseeState),
    suburb: cleanText(licensee?.suburb),
    xplanUrl: cleanText(licensee?.xplanUrl),
  };
}

function nullableText(value: string) {
  return value.trim() || null;
}

type AdminStructuresManagerProps =
  | {
      kind: "practices";
      initialItems: PracticeSummary[];
      licensees: LicenseeSummary[];
    }
  | {
      kind: "licensees";
      initialItems: LicenseeSummary[];
    };

export function AdminStructuresManager(props: AdminStructuresManagerProps) {
  const isPractice = props.kind === "practices";
  const [items, setItems] = useState(props.initialItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("create");
  const [draft, setDraft] = useState<StructureDraft | null>(null);
  const [practiceQuery, setPracticeQuery] = useState("");
  const [selectedLicensee, setSelectedLicensee] = useState("All licensees");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  const licenseeOptions = useMemo(() => {
    if (!isPractice) {
      return ["All licensees"];
    }

    const values = Array.from(
      new Set(
        items
          .map((item) => ("licenseeName" in item ? item.licenseeName?.trim() : ""))
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort((left, right) => left.localeCompare(right));

    return ["All licensees", ...values];
  }, [isPractice, items]);

  const filteredItems = useMemo(() => {
    if (!isPractice) {
      return items;
    }

    const normalizedQuery = practiceQuery.trim().toLowerCase();

    return items.filter((item) => {
      const matchesPractice = !normalizedQuery || item.name.toLowerCase().includes(normalizedQuery);
      const matchesLicensee =
        selectedLicensee === "All licensees" ||
        ("licenseeName" in item && item.licenseeName?.trim() === selectedLicensee);

      return matchesPractice && matchesLicensee;
    });
  }, [isPractice, items, practiceQuery, selectedLicensee]);

  const editingItem = items.find((item) => item.id === editingId) ?? null;

  function openCreate() {
    setMode("create");
    setEditingId(null);
    setSaveError(null);
    setSaveSuccess(null);
    setDraft(emptyDraft());
  }

  async function openEdit(item: PracticeSummary | LicenseeSummary) {
    setMode("edit");
    setEditingId(item.id);
    setSaveError(null);
    setSaveSuccess(null);
    setDraft(
      isPractice
        ? {
            ...emptyDraft(),
            name: item.name,
            licenseeId: "licenseeId" in item ? item.licenseeId?.trim() || "" : "",
          }
        : licenseeToDraft("record" in item ? item.record : null, item as LicenseeSummary),
    );

    if (!isPractice) {
      setIsLoadingDetails(true);

      try {
        const result = await getAdminLicensee(item.id);
        const fullRecord = result?.data ?? null;

        if (fullRecord) {
          setDraft(licenseeToDraft(fullRecord, item as LicenseeSummary));
          setItems((existing) =>
            ((existing as LicenseeSummary[]).map((existingItem) =>
              existingItem.id === item.id && "practiceCount" in existingItem
                ? { ...existingItem, name: fullRecord.name?.trim() || existingItem.name, record: fullRecord }
                : existingItem,
            ) as LicenseeSummary[]),
          );
        }
      } catch (error) {
        setSaveError(
          error instanceof Error
            ? error.message
            : "Unable to load the full licensee details. The summary details are still available.",
        );
      } finally {
        setIsLoadingDetails(false);
      }
    }
  }

  function closeEditor() {
    setEditingId(null);
    setDraft(null);
    setIsSaving(false);
    setIsLoadingDetails(false);
    setSaveError(null);
  }

  async function saveEntity() {
    if (!draft) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      if (isPractice) {
        const licenseeRecord = props.licensees.find((item) => item.id === draft.licenseeId) ?? null;
        const current = mode === "edit" ? (editingItem as PracticeSummary | null) : null;
        const payload = {
          ...(current?.record ?? {}),
          id: mode === "edit" ? current?.record.id ?? current?.id ?? null : null,
          name: draft.name.trim() || "Untitled practice",
          status: current?.record.status ?? current?.statusName ?? "Active",
          licensee: licenseeRecord
            ? {
                id: licenseeRecord.id,
                name: licenseeRecord.name,
              }
            : null,
        };

        const result =
          mode === "edit" && current
            ? await updateAdminPractice(current.id, payload)
            : await createAdminPractice(payload);

        const saved = result?.data ?? payload;
        const nextSummary: PracticeSummary = {
          id: saved.id?.trim() || current?.id || `practice-${Date.now()}`,
          name: saved.name?.trim() || payload.name,
          licenseeName: saved.licensee?.name?.trim() || licenseeRecord?.name || "Unassigned licensee",
          licenseeId: saved.licensee?.id?.trim() || licenseeRecord?.id || null,
          statusName: saved.status?.trim() || "Active",
          userCount: current?.userCount ?? 0,
          appAdminCount: current?.appAdminCount ?? 0,
          adviserCount: current?.adviserCount ?? 0,
          record: saved,
        };

        setItems((existing) =>
          mode === "edit" && current
            ? (existing.map((item) => (item.id === current.id ? nextSummary : item)) as PracticeSummary[])
            : ([...existing, nextSummary].sort((left, right) => left.name.localeCompare(right.name)) as PracticeSummary[]),
        );
      } else {
        const current = mode === "edit" ? (editingItem as LicenseeSummary | null) : null;
        const payload = {
          ...(current?.record ?? {}),
          id: mode === "edit" ? current?.record.id ?? current?.id ?? null : null,
          name: draft.name.trim() || "Untitled licensee",
          abn: nullableText(draft.abn),
          account: nullableText(draft.account),
          asicLicenseeNumber: nullableText(draft.asicLicenseeNumber),
          b2bPay: nullableText(draft.b2bPay),
          bsb: nullableText(draft.bsb),
          customPrompt: draft.customPrompt,
          hubDoc: nullableText(draft.hubDoc),
          licenseeAddress: nullableText(draft.licenseeAddress),
          licenseeLogo: nullableText(draft.licenseeLogo),
          licenseePostCode: nullableText(draft.licenseePostCode),
          licenseeState: nullableText(draft.licenseeState),
          suburb: nullableText(draft.suburb),
          xplanUrl: nullableText(draft.xplanUrl),
        };

        const result =
          mode === "edit" && current
            ? await updateAdminLicensee(current.id, payload)
            : await createAdminLicensee(payload);

        const saved = result?.data ?? payload;
        const nextSummary: LicenseeSummary = {
          id: saved.id?.trim() || current?.id || `licensee-${Date.now()}`,
          name: saved.name?.trim() || payload.name,
          practiceCount: current?.practiceCount ?? 0,
          userCount: current?.userCount ?? 0,
          appAdminCount: current?.appAdminCount ?? 0,
          record: saved,
        };

        setItems((existing) =>
          mode === "edit" && current
            ? (existing.map((item) => (item.id === current.id ? nextSummary : item)) as LicenseeSummary[])
            : ([...existing, nextSummary].sort((left, right) => left.name.localeCompare(right.name)) as LicenseeSummary[]),
        );
      }

      setSaveSuccess(`${isPractice ? "Practice" : "Licensee"} saved.`);
      closeEditor();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : `Unable to save ${isPractice ? "practice" : "licensee"}.`);
      setIsSaving(false);
    }
  }

  return (
    <>
      <section className={styles.contentCard}>
        <div className={styles.contentCardHeader}>
          <div>
            <h2 className={styles.cardTitle}>{isPractice ? "Practices" : "Licensees"}</h2>
            <p className={styles.cardText}>
              {isPractice
                ? "Live practices are now loaded from the backend and can be created or updated directly from this screen."
                : "Live licensees are now loaded from the backend and can be created or updated directly from this screen."}
            </p>
          </div>

          <button type="button" className={styles.primaryButton} onClick={openCreate}>
            {isPractice ? "Add practice" : "Add licensee"}
          </button>
        </div>

        {isPractice ? (
          <div className={styles.filterRowCompact}>
            <label className={styles.field}>
              <span>Practice name</span>
              <input
                value={practiceQuery}
                onChange={(event) => setPracticeQuery(event.target.value)}
                placeholder="Search by practice name"
              />
            </label>

            <label className={styles.field}>
              <span>Licensee</span>
              <select value={selectedLicensee} onChange={(event) => setSelectedLicensee(event.target.value)}>
                {licenseeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {saveSuccess ? <p className={styles.successText}>{saveSuccess}</p> : null}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{isPractice ? "Practice" : "Licensee"}</th>
                {isPractice ? <th>Licensee</th> : <th>Practices</th>}
                <th>Users</th>
                <th>App admins</th>
                {isPractice ? <th>Advisers</th> : null}
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  {isPractice ? (
                    <td>{"licenseeName" in item ? item.licenseeName : "Unassigned licensee"}</td>
                  ) : (
                    <td>{"practiceCount" in item ? item.practiceCount : 0}</td>
                  )}
                  <td>{"userCount" in item ? item.userCount : 0}</td>
                  <td>{"appAdminCount" in item ? item.appAdminCount : 0}</td>
                  {isPractice ? <td>{"adviserCount" in item ? item.adviserCount : 0}</td> : null}
                  <td>
                    <button type="button" className={styles.secondaryButton} onClick={() => void openEdit(item)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={isPractice ? 6 : 5}>
                    No {isPractice ? "practices" : "licensees"} match the selected filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {draft ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.contentCardHeader}>
              <div>
                <h3 className={styles.cardTitle}>
                  {mode === "edit" ? `Edit ${isPractice ? "practice" : "licensee"}` : `Create ${isPractice ? "practice" : "licensee"}`}
                </h3>
                <p className={styles.cardText}>
                  {mode === "edit"
                    ? `Update the ${isPractice ? "practice" : "licensee"} and save it to the live API.`
                    : `Create a new ${isPractice ? "practice" : "licensee"} in the live API.`}
                </p>
              </div>
            </div>

            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>{isPractice ? "Practice name" : "Licensee name"}</span>
                <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              </label>

              {isPractice ? (
                <label className={styles.field}>
                  <span>Licensee</span>
                  <select
                    value={draft.licenseeId}
                    onChange={(event) => setDraft({ ...draft, licenseeId: event.target.value })}
                  >
                    <option value="">Unassigned licensee</option>
                    {props.licensees.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {!isPractice
                ? licenseeTextFields.map((field) => (
                    <label className={styles.field} key={field.key}>
                      <span>{field.label}</span>
                      <input
                        value={draft[field.key]}
                        onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                        placeholder={field.placeholder}
                      />
                    </label>
                  ))
                : null}

              {!isPractice ? (
                <label className={styles.field}>
                  <span>Custom prompt</span>
                  <select
                    value={draft.customPrompt ? "true" : "false"}
                    onChange={(event) => setDraft({ ...draft, customPrompt: event.target.value === "true" })}
                  >
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </label>
              ) : null}
            </div>

            {isLoadingDetails ? <p className={styles.cardText}>Loading full licensee details...</p> : null}

            {saveError ? <p className={styles.errorText}>{saveError}</p> : null}

            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={closeEditor} disabled={isSaving}>
                Cancel
              </button>
              <button type="button" className={styles.primaryButton} onClick={saveEntity} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
