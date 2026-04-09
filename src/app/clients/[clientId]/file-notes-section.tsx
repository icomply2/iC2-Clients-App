"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClientProfile, FileNoteRecord } from "@/lib/api/types";
import { FILE_NOTE_SUBTYPE_OPTIONS, FILE_NOTE_TYPE_OPTIONS } from "@/lib/api/contracts/file-notes";
import {
  createFileNote as createFileNoteAction,
  deleteFileNote as deleteFileNoteAction,
  listFileNotes as listFileNotesAction,
  updateFileNote as updateFileNoteAction,
} from "@/lib/services/file-notes";
import { cacheFileNoteAttachments, mergeCachedFileNoteAttachments } from "@/lib/file-note-attachment-cache";
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
  attachment: NonNullable<FileNoteRecord["attachment"]>;
  files: File[];
  creatorId: string;
  creatorEmail: string;
  creatorName: string;
  modifierId: string;
  modifierEmail: string;
  modifierName: string;
  createdDate: string;
  modifiedDate: string;
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
    attachment: [],
    files: [],
    creatorId: "",
    creatorEmail: "",
    creatorName: "",
    modifierId: "",
    modifierEmail: "",
    modifierName: "",
    createdDate: "",
    modifiedDate: "",
  };
}

function getFallbackMessage() {
  return "Live client data is temporarily unavailable. Editing is disabled while sample data is shown.";
}

function hasAttachments(note: FileNoteRecord) {
  return Array.isArray(note.attachment) && note.attachment.some((item) => item?.name || item?.url);
}

function fallbackAttachments(draft: FileNoteDraft): NonNullable<FileNoteRecord["attachment"]> {
  return [
    ...draft.attachment,
    ...draft.files.map((file) => ({
      name: file.name,
      url: null,
    })),
  ];
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

  const subtypeOptions = useMemo(() => FILE_NOTE_SUBTYPE_OPTIONS[draft.type] ?? [], [draft.type]);

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
      const data = await listFileNotesAction(resolvedClientId);
      setNotes(mergeCachedFileNoteAttachments(resolvedClientId, data));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load file notes right now.";
      if (message.includes("403")) {
        setApiForbidden(true);
      }
      setLoadError(message);
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
      attachment: note.attachment ?? [],
      files: [],
      creatorId: note.creator?.id ?? "",
      creatorEmail: note.creator?.email ?? "",
      creatorName: note.creator?.name ?? "",
      modifierId: note.modifier?.id ?? "",
      modifierEmail: note.modifier?.email ?? "",
      modifierName: note.modifier?.name ?? "",
      createdDate: note.createdDate ?? "",
      modifiedDate: note.modifiedDate ?? "",
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

    try {
      const input = {
        id: draft.id,
        clientId: profile.client.id,
        ownerId: profile.client.id,
        ownerName: profile.client.name ?? "",
        joint: false,
        licensee: profile.licensee ?? null,
        practice: profile.practice ?? null,
        adviserName: profile.adviser?.name ?? null,
        adviserEmail: profile.adviser?.email ?? null,
        adviserId: profile.adviser?.id ?? null,
        content: draft.content,
        serviceDate: draft.serviceDate,
        type: draft.type,
        subType: draft.subType,
        subject: draft.subject,
        attachment: draft.attachment,
        files: draft.files,
        creatorId: draft.creatorId || null,
        creatorEmail: draft.creatorEmail || null,
        creatorName: draft.creatorName || null,
        modifierId: draft.modifierId || null,
        modifierEmail: draft.modifierEmail || null,
        modifierName: draft.modifierName || null,
        createdDate: draft.createdDate || null,
        modifiedDate: draft.modifiedDate || null,
      };

      const savedNote = (draft.id
        ? await updateFileNoteAction(draft.id, input)
        : await createFileNoteAction(input)) as FileNoteRecord | null;
      const nextNote: FileNoteRecord = {
        ...(savedNote ?? {}),
        id: savedNote?.id ?? draft.id ?? crypto.randomUUID(),
        clientId: savedNote?.clientId ?? profile.client.id,
        owner: savedNote?.owner ?? {
          id: profile.client.id,
          name: profile.client.name ?? "",
        },
        joint: savedNote?.joint ?? false,
        licensee: savedNote?.licensee ?? profile.licensee ?? null,
        practice: savedNote?.practice ?? profile.practice ?? null,
        adviser: savedNote?.adviser ?? {
          id: profile.adviser?.id ?? null,
          email: profile.adviser?.email ?? null,
          name: profile.adviser?.name ?? null,
        },
        content: savedNote?.content ?? draft.content,
        serviceDate: savedNote?.serviceDate ?? draft.serviceDate,
        type: savedNote?.type ?? draft.type,
        subType: savedNote?.subType ?? draft.subType,
        subject: savedNote?.subject ?? draft.subject,
        creator: savedNote?.creator ?? {
          id: draft.creatorId || null,
          email: draft.creatorEmail || null,
          name: draft.creatorName || null,
        },
        modifier: savedNote?.modifier ?? {
          id: draft.modifierId || null,
          email: draft.modifierEmail || null,
          name: draft.modifierName || null,
        },
        createdDate: savedNote?.createdDate ?? draft.createdDate ?? new Date().toISOString(),
        modifiedDate: savedNote?.modifiedDate ?? new Date().toISOString(),
        attachment:
          Array.isArray(savedNote?.attachment) && savedNote.attachment.length
            ? savedNote.attachment
            : fallbackAttachments(draft),
      };

      cacheFileNoteAttachments(nextNote);

      setNotes((current) =>
        draft.id
          ? current.map((note) => (note.id === draft.id ? nextNote : note))
          : [nextNote, ...current],
      );

      setIsModalOpen(false);
      setDraft(emptyDraft());
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
      await deleteFileNoteAction(deleteCandidate.id);

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
          {FILE_NOTE_TYPE_OPTIONS.map((option) => (
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
          <div>Attachment</div>
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
                <div className={styles.fileNoteAttachmentCell}>
                  {hasAttachments(note) ? (
                    <span className={styles.fileNoteAttachmentIcon} title="This file note has attachments" aria-label="Has attachments">
                      📎
                    </span>
                  ) : (
                    <span className={styles.fileNoteAttachmentEmpty}>—</span>
                  )}
                </div>
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
                    {FILE_NOTE_TYPE_OPTIONS.map((option) => (
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
                <span>Attachments:</span>
                {draft.files.length || draft.attachment.length ? (
                  <div className={styles.attachmentList}>
                    {draft.attachment.map((attachment, index) => (
                      <div key={`${attachment.name ?? "attachment"}-${index}`} className={styles.attachmentItem}>
                        <span>{attachment.name ?? "Existing attachment"}</span>
                        <button
                          type="button"
                          className={styles.rowActionButton}
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              attachment: current.attachment.filter((_, currentIndex) => currentIndex !== index),
                            }))
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    {draft.files.map((file, index) => (
                      <div key={`${file.name}-${index}`} className={styles.attachmentItem}>
                        <span>{file.name}</span>
                        <button
                          type="button"
                          className={styles.rowActionButton}
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              files: current.files.filter((_, currentIndex) => currentIndex !== index),
                            }))
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                {draft.files.length || draft.attachment.length ? (
                  <span className={styles.attachmentSubLabel}>Add another attachment:</span>
                ) : null}
                <div className={styles.fileNoteUploadPlaceholder}>
                  <input
                    type="file"
                    multiple
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        files: [...current.files, ...Array.from(event.target.files ?? [])],
                      }))
                    }
                  />
                </div>
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
