"use client";

import { useEffect, useMemo, useState } from "react";
import type { ApiResult, ClientProfile, FileNoteRecord } from "@/lib/api/types";
import styles from "./page.module.css";

type FileNotesSectionProps = {
  profile: ClientProfile;
  useMockFallback?: boolean;
};

type FileNoteDraft = {
  id: string | null;
  type: string;
  subType: string;
  subject: string;
  serviceDate: string;
  content: string;
};

const noteTypeOptions = ["Client Meeting", "Phone Call", "Email", "Review", "Advice", "Administration", "Other"];
const subTypeOptionsByType: Record<string, string[]> = {
  "Client Meeting": ["Initial Meeting", "Review Meeting", "Strategy Meeting", "Implementation Meeting"],
  "Phone Call": ["Inbound", "Outbound", "Follow Up"],
  Email: ["Client Email", "Adviser Email", "Provider Email"],
  Review: ["Annual Review", "Portfolio Review", "FDS Review"],
  Advice: ["SOA", "ROA", "Strategy Note"],
  Administration: ["Task Update", "Document Request", "Compliance"],
  Other: ["General"],
};

function formatDate(value?: string | null) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

function toInputDate(value?: string | null) {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  return parsed.toISOString().slice(0, 10);
}

function emptyDraft(): FileNoteDraft {
  return {
    id: null,
    type: "",
    subType: "",
    subject: "",
    serviceDate: new Date().toISOString().slice(0, 10),
    content: "",
  };
}

function parseResponseBody<T>(responseText: string) {
  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(responseText) as
      | ApiResult<T>
      | { message?: string | null; modelErrors?: { errorMessage?: string | null }[] | null };
  } catch {
    return null;
  }
}

function getErrorMessage(
  result: ReturnType<typeof parseResponseBody<FileNoteRecord[] | FileNoteRecord>>,
  responseText: string,
  fallback: string,
  status: number,
) {
  const modelError =
    result && "modelErrors" in result && Array.isArray(result.modelErrors)
      ? result.modelErrors.find((entry) => entry?.errorMessage)?.errorMessage
      : null;

  return modelError ?? (result && "message" in result && result.message ? result.message : responseText || `${fallback} (status ${status}).`);
}

function getFallbackMessage() {
  return "Live client data is temporarily unavailable. Editing is disabled while sample data is shown.";
}

export function FileNotesSection({ profile, useMockFallback = false }: FileNotesSectionProps) {
  const [notes, setNotes] = useState<FileNoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [apiForbidden, setApiForbidden] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draft, setDraft] = useState<FileNoteDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [deleteCandidate, setDeleteCandidate] = useState<FileNoteRecord | null>(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState("");

  const subtypeOptions = useMemo(() => subTypeOptionsByType[draft.type] ?? [], [draft.type]);

  async function loadNotes() {
    const resolvedClientId = profile.client?.id;

    if (useMockFallback || !resolvedClientId) {
      setNotes([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError("");
    setApiForbidden(false);

    try {
      const response = await fetch(`/api/client-profiles/file-notes/client/${encodeURIComponent(resolvedClientId)}`, {
        method: "GET",
        cache: "no-store",
      });
      const responseText = await response.text();
      const result = parseResponseBody<FileNoteRecord[]>(responseText);

      if (!response.ok) {
        if (response.status === 403) {
          setApiForbidden(true);
        }
        throw new Error(getErrorMessage(result, responseText, "Unable to load file notes right now", response.status));
      }

      const data = result && "data" in result && Array.isArray(result.data) ? result.data : [];
      setNotes(data ?? []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load file notes right now.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadNotes();
  }, [profile.id, useMockFallback]);

  const filteredNotes = useMemo(
    () =>
      notes.filter((note) => {
        const matchesSearch = !search || (note.subject ?? "").toLowerCase().includes(search.toLowerCase());
        const matchesType = !typeFilter || note.type === typeFilter;
        return matchesSearch && matchesType;
      }),
    [notes, search, typeFilter],
  );

  function openCreateModal() {
    if (useMockFallback || apiForbidden) {
      setErrorMessage(getFallbackMessage());
      return;
    }

    setDraft(emptyDraft());
    setErrorMessage("");
    setIsModalOpen(true);
  }

  function openEditModal(note: FileNoteRecord) {
    if (useMockFallback || apiForbidden) {
      setErrorMessage(getFallbackMessage());
      return;
    }

    setDraft({
      id: note.id ?? null,
      type: note.type ?? "",
      subType: note.subType ?? "",
      subject: note.subject ?? "",
      serviceDate: toInputDate(note.serviceDate),
      content: note.content ?? "",
    });
    setErrorMessage("");
    setIsModalOpen(true);
  }

  async function handleSave() {
    if (useMockFallback || apiForbidden) {
      setErrorMessage(
        apiForbidden
          ? "The file note API is currently returning 403 Forbidden for this user, so saving is disabled until the backend permission issue is resolved."
          : getFallbackMessage(),
      );
      return;
    }

    if (!profile.client?.id) {
      setErrorMessage("This client record does not have a client id yet.");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    const requestBody: FileNoteRecord = {
      id: draft.id,
      clientId: profile.client.id,
      owner: profile.client?.id
        ? {
            id: profile.client.id,
            name: profile.client.name ?? "",
          }
        : null,
      joint: false,
      licensee: profile.licensee ?? null,
      practice: profile.practice ?? null,
      adviser: profile.adviser
        ? {
            name: profile.adviser.name ?? null,
            email: profile.adviser.email ?? null,
          }
        : null,
      content: draft.content,
      serviceDate: draft.serviceDate,
      type: draft.type,
      subType: draft.subType,
      subject: draft.subject,
      attachment: [],
    };

    try {
      const response = await fetch(
        draft.id
          ? `/api/client-profiles/file-notes/${encodeURIComponent(draft.id)}`
          : "/api/client-profiles/file-notes",
        {
          method: draft.id ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            request: requestBody,
          }),
        },
      );

      const responseText = await response.text();
      const result = parseResponseBody<FileNoteRecord>(responseText);

      if (!response.ok) {
        if (response.status === 403) {
          setApiForbidden(true);
        }
        throw new Error(getErrorMessage(result, responseText, "Unable to save the file note right now", response.status));
      }

      setIsModalOpen(false);
      setDraft(emptyDraft());
      await loadNotes();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save the file note right now.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteCandidate?.id) {
      return;
    }

    setSaving(true);
    setDeleteErrorMessage("");

    try {
      const response = await fetch(`/api/client-profiles/file-notes/${encodeURIComponent(deleteCandidate.id)}`, {
        method: "DELETE",
      });
      const responseText = await response.text();
      const result = parseResponseBody<FileNoteRecord>(responseText);

      if (!response.ok) {
        throw new Error(getErrorMessage(result, responseText, "Unable to delete the file note right now", response.status));
      }

      setDeleteCandidate(null);
      await loadNotes();
    } catch (error) {
      setDeleteErrorMessage(error instanceof Error ? error.message : "Unable to delete the file note right now.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className={styles.fileNotesToolbar}>
        <div className={styles.fileNotesTitle}>File Notes</div>
        <input
          className={styles.fileNotesSearch}
          placeholder="Search by subject..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select className={styles.fileNotesFilter} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="">Choose an option...</option>
          {noteTypeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <button type="button" className={styles.topActionButton} onClick={openCreateModal} disabled={useMockFallback || apiForbidden}>
          Add File Note
        </button>
      </section>

      {useMockFallback ? <p className={styles.actionNotice}>{getFallbackMessage()}</p> : null}
      {apiForbidden ? (
        <p className={styles.actionNotice}>
          The file note API is responding with `403 Forbidden` for this signed-in user. The frontend is ready, but backend access needs to be enabled before live file notes can load or save.
        </p>
      ) : null}
      {loadError ? <p className={styles.modalError}>{loadError}</p> : null}

      <section className={styles.fileNotesSection}>
        <div className={styles.fileNotesHeader}>
          <div>Type</div>
          <div>Sub Type</div>
          <div>Subject</div>
          <div>Date</div>
          <div>Created Date</div>
          <div>Action</div>
        </div>

        {loading ? <div className={styles.fileNoteEmpty}>Loading file notes...</div> : null}
        {!loading && !filteredNotes.length ? <div className={styles.fileNoteEmpty}>No file notes found.</div> : null}

        {!loading
          ? filteredNotes.map((note) => (
              <div key={note.id ?? `${note.subject}-${note.createdDate}`} className={styles.fileNotesRow}>
                <div>{note.type ?? ""}</div>
                <div>{note.subType ?? ""}</div>
                <div>{note.subject ?? ""}</div>
                <div>{formatDate(note.serviceDate)}</div>
                <div>{formatDate(note.createdDate)}</div>
                <div className={styles.entitiesActions}>
                  <button type="button" className={styles.rowActionButton} onClick={() => openEditModal(note)} disabled={useMockFallback}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className={`${styles.rowActionButton} ${styles.rowActionDanger}`.trim()}
                    onClick={() => setDeleteCandidate(note)}
                    disabled={useMockFallback || apiForbidden}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          : null}
      </section>

      <div className={styles.fileNotesPager}>
        <button type="button" className={styles.modalSecondary}>
          Previous
        </button>
        <button type="button" className={styles.modalSecondary}>
          Next
        </button>
      </div>

      {isModalOpen ? (
        <div className={styles.modalOverlay}>
          <div className={styles.fileNoteModalCard}>
            <div className={styles.identityModalHeader}>
              {draft.id ? "Edit File Note" : "Create File Note:"}
              <button type="button" className={styles.fileNoteCloseButton} onClick={() => setIsModalOpen(false)}>
                ×
              </button>
            </div>
            <div className={styles.identityModalBody}>
              <label className={styles.identityFieldRow}>
                <span>Client/s:</span>
                <input value={profile.client?.name ?? ""} readOnly />
              </label>
              <div className={styles.fileNotesSplitRow}>
                <label className={styles.profileField}>
                  <span>Type:</span>
                  <select
                    value={draft.type}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        type: event.target.value,
                        subType: "",
                      }))
                    }
                  >
                    <option value="">Note type</option>
                    {noteTypeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.profileField}>
                  <span>Date:</span>
                  <input
                    type="date"
                    value={draft.serviceDate}
                    onChange={(event) => setDraft((current) => ({ ...current, serviceDate: event.target.value }))}
                  />
                </label>
              </div>
              <label className={styles.profileField}>
                <span>Subtype:</span>
                <select
                  value={draft.subType}
                  onChange={(event) => setDraft((current) => ({ ...current, subType: event.target.value }))}
                >
                  <option value="">Note subtype</option>
                  {subtypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.profileField}>
                <span>Subject:</span>
                <input
                  placeholder="Type here..."
                  value={draft.subject}
                  onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))}
                />
              </label>
              <label className={styles.profileField}>
                <span>Body:</span>
                <textarea
                  className={styles.fileNoteBody}
                  value={draft.content}
                  onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}
                />
              </label>
              <label className={styles.profileField}>
                <span>Add Attachment:</span>
                <div className={styles.fileNoteUploadPlaceholder}>Drop files here to upload (or click)</div>
              </label>
            </div>
            <div className={styles.identityModalActions}>
              <button type="button" className={styles.identityCreateButton} onClick={() => void handleSave()} disabled={saving}>
                {saving ? "Saving..." : draft.id ? "Save File Note" : "Create File Note"}
              </button>
            </div>
            {errorMessage ? <p className={styles.modalError}>{errorMessage}</p> : null}
          </div>
        </div>
      ) : null}

      {deleteCandidate ? (
        <div className={styles.modalOverlay}>
          <div className={styles.confirmDialog}>
            <h2 className={styles.confirmTitle}>Delete File Note</h2>
            <p className={styles.confirmText}>Are you sure you want to delete this file note? This action cannot be undone.</p>
            <div className={styles.confirmActions}>
              <button type="button" className={`${styles.modalPrimary} ${styles.confirmDanger}`.trim()} onClick={() => void handleDelete()} disabled={saving}>
                {saving ? "Deleting..." : "Delete"}
              </button>
              <button type="button" className={styles.modalSecondary} onClick={() => setDeleteCandidate(null)} disabled={saving}>
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
