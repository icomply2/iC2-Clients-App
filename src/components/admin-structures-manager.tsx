"use client";

import { useMemo, useState } from "react";
import {
  createAdminLicensee,
  createAdminPractice,
  updateAdminLicensee,
  updateAdminPractice,
} from "@/lib/api/admin";
import type { LicenseeSummary, PracticeSummary } from "@/lib/admin-data";
import styles from "@/app/admin/admin.module.css";

type Mode = "create" | "edit";

type StructureDraft = {
  name: string;
  licenseeId: string;
};

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
    setDraft(
      isPractice
        ? { name: "", licenseeId: "" }
        : { name: "", licenseeId: "" },
    );
  }

  function openEdit(item: PracticeSummary | LicenseeSummary) {
    setMode("edit");
    setEditingId(item.id);
    setSaveError(null);
    setSaveSuccess(null);
    setDraft(
      isPractice
        ? {
            name: item.name,
            licenseeId: "licenseeId" in item ? item.licenseeId?.trim() || "" : "",
          }
        : {
            name: item.name,
            licenseeId: "",
          },
    );
  }

  function closeEditor() {
    setEditingId(null);
    setDraft(null);
    setIsSaving(false);
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
          customPrompt: current?.record.customPrompt ?? false,
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
                    <button type="button" className={styles.secondaryButton} onClick={() => openEdit(item)}>
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
            </div>

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
