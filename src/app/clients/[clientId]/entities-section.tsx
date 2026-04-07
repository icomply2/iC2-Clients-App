"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiResult, ClientEntityRecord, ClientProfile } from "@/lib/api/types";
import styles from "./page.module.css";

type EntitiesSectionProps = {
  profile: ClientProfile;
  useMockFallback?: boolean;
};

function getFallbackMessage() {
  return "Live client data is temporarily unavailable. Editing is disabled while sample data is shown.";
}

export function EntitiesSection({ profile, useMockFallback = false }: EntitiesSectionProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState("");

  const [entities, setEntities] = useState<ClientEntityRecord[]>(profile.entities ?? []);

  useEffect(() => {
    setEntities(profile.entities ?? []);
  }, [profile.entities]);

  const displayEntities = useMemo(
    () =>
      entities.map((entity) => ({
        id: entity.id ?? "",
        entitiesId: entity.entitiesId ?? "",
        name: entity.name ?? "",
        owner: entity.owner?.name ?? "",
        ownerId: entity.owner?.id ?? "",
        type: entity.type ?? "",
      })),
    [entities],
  );

  const ownerOptions = [
    profile.client?.name && profile.client?.id
      ? { value: profile.client.id, label: profile.client.name }
      : null,
    profile.partner?.name && profile.partner?.id
      ? { value: profile.partner.id, label: profile.partner.name }
      : null,
    ...entities
      .filter((entity) => entity.name && entity.id)
      .map((entity) => ({ value: entity.id ?? "", label: entity.name ?? "" })),
  ].filter((option): option is { value: string; label: string } => Boolean(option));

  const [ownerId, setOwnerId] = useState(ownerOptions[0]?.value ?? "");
  const [name, setName] = useState("");
  const [type, setType] = useState("");

  useEffect(() => {
    if (!ownerOptions.some((option) => option.value === ownerId)) {
      setOwnerId(ownerOptions[0]?.value ?? "");
    }
  }, [ownerId, ownerOptions]);

  function resetForm() {
    setOwnerId(ownerOptions[0]?.value ?? "");
    setName("");
    setType("");
    setErrorMessage("");
    setEditingEntityId(null);
  }

  function parseResponseBody(responseText: string) {
    if (!responseText) {
      return null;
    }

    try {
      return JSON.parse(responseText) as
        | ApiResult<ClientEntityRecord[]>
        | { message?: string | null; modelErrors?: { errorMessage?: string | null }[] | null };
    } catch {
      return null;
    }
  }

  async function saveEntities(nextEntities: ClientEntityRecord[], fallbackError: string) {
    if (!profile.id) {
      throw new Error("This client profile does not have a profile id yet.");
    }

    const response = await fetch(`/api/client-profiles/${profile.id}/entities`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentUser: null,
        request: nextEntities.map((entity) => ({
          id: entity.id ?? null,
          entitiesId: entity.entitiesId ?? null,
          name: entity.name ?? null,
          type: entity.type ?? null,
          owner: entity.owner
            ? {
                id: entity.owner.id ?? null,
                name: entity.owner.name ?? null,
              }
            : null,
        })),
      }),
    });

    const responseText = await response.text();
    const result = parseResponseBody(responseText);

    if (!response.ok) {
      const modelError =
        result && "modelErrors" in result && Array.isArray(result.modelErrors)
          ? result.modelErrors.find((entry) => entry?.errorMessage)?.errorMessage
          : null;
      const message =
        modelError ??
        (result && "message" in result && result.message
          ? result.message
          : responseText || `${fallbackError} (status ${response.status}).`);
      throw new Error(`Save failed (${response.status}): ${message}`);
    }

    const returnedEntities = result && "data" in result && Array.isArray(result.data) ? result.data : null;
    setEntities(returnedEntities ?? nextEntities);
    router.refresh();
  }

  async function handleAddEntity() {
    if (useMockFallback) {
      setErrorMessage(getFallbackMessage());
      return;
    }

    if (!profile.id) {
      setErrorMessage("This client profile does not have a profile id yet.");
      return;
    }

    const owner = ownerOptions.find((option) => option.value === ownerId);

    if (!owner) {
      setErrorMessage("Please choose an owner.");
      return;
    }

    if (!name.trim()) {
      setErrorMessage("Please enter an entity name.");
      return;
    }

    if (!type) {
      setErrorMessage("Please choose an entity type.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    try {
      const nextEntities = editingEntityId
        ? entities.map((entity) =>
            entity.id === editingEntityId
              ? {
                  ...entity,
                  name: name.trim(),
                  type,
                  owner: {
                    id: owner.value,
                    name: owner.label,
                  },
                }
              : entity,
          )
        : [
            ...entities.map((entity) => ({
              id: entity.id ?? null,
              entitiesId: entity.entitiesId ?? null,
              name: entity.name ?? null,
              type: entity.type ?? null,
              owner: entity.owner
                ? {
                    id: entity.owner.id ?? null,
                    name: entity.owner.name ?? null,
                  }
                : null,
            })),
            {
              id: null,
              entitiesId: null,
              name: name.trim(),
              type,
              owner: {
                id: owner.value,
                name: owner.label,
              },
            },
          ];

      await saveEntities(nextEntities, "Unable to save the entity right now");

      resetForm();
      setIsOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save the entity right now.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleEditClick(entityId: string) {
    if (useMockFallback) {
      setErrorMessage(getFallbackMessage());
      return;
    }

    const entity = entities.find((item) => item.id === entityId);

    if (!entity) {
      return;
    }

    setEditingEntityId(entity.id ?? null);
    setOwnerId(entity.owner?.id ?? ownerOptions[0]?.value ?? "");
    setName(entity.name ?? "");
    setType(entity.type ?? "");
    setErrorMessage("");
    setIsOpen(true);
  }

  async function handleDeleteEntity() {
    if (useMockFallback) {
      setDeleteErrorMessage(getFallbackMessage());
      return;
    }

    if (!deleteCandidateId) {
      return;
    }

    setIsSaving(true);
    setDeleteErrorMessage("");

    try {
      const response = await fetch(`/api/client-profiles/${profile.id}/entities/${deleteCandidateId}`, {
        method: "DELETE",
      });
      const responseText = await response.text();
      const result = parseResponseBody(responseText);

      if (!response.ok) {
        const modelError =
          result && "modelErrors" in result && Array.isArray(result.modelErrors)
            ? result.modelErrors.find((entry) => entry?.errorMessage)?.errorMessage
            : null;
        const message =
          modelError ??
          (result && "message" in result && result.message
            ? result.message
            : responseText || `Unable to delete the entity right now (status ${response.status}).`);
        throw new Error(`Delete failed (${response.status}): ${message}`);
      }

      setEntities((current) => current.filter((entity) => entity.id !== deleteCandidateId));
      router.refresh();
      setDeleteCandidateId(null);
    } catch (error) {
      setDeleteErrorMessage(error instanceof Error ? error.message : "Unable to delete the entity right now.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <div className={styles.sectionHeader}>
        <h1 className={styles.title}>Entities</h1>
        <button
          type="button"
          className={styles.plusButton}
          aria-label="Add entity"
          onClick={() => {
            if (useMockFallback) {
              setErrorMessage(getFallbackMessage());
              return;
            }

            resetForm();
            setIsOpen(true);
          }}
          disabled={useMockFallback}
          title={useMockFallback ? getFallbackMessage() : undefined}
        >
          +
        </button>
      </div>

      {useMockFallback ? <p className={styles.actionNotice}>{getFallbackMessage()}</p> : null}

      <section className={styles.entitiesSection}>
        <div className={styles.entitiesHeader}>
          <div>Name</div>
          <div>Owner</div>
          <div>Type</div>
          <div className={styles.entitiesActionsHeader}></div>
        </div>

        {displayEntities.map((entity) => (
          <div key={entity.id || entity.name} className={styles.entitiesRow}>
            <div>{entity.name}</div>
            <div>{entity.owner}</div>
            <div>{entity.type}</div>
            <div className={styles.entitiesActions}>
              <button
                type="button"
                className={styles.rowActionButton}
                onClick={() => handleEditClick(entity.id)}
                aria-label={`Edit ${entity.name}`}
                disabled={useMockFallback}
              >
                Edit
              </button>
              <button
                type="button"
                className={`${styles.rowActionButton} ${styles.rowActionDanger}`.trim()}
                onClick={() => {
                  if (useMockFallback) {
                    setDeleteErrorMessage(getFallbackMessage());
                    return;
                  }
                  setDeleteCandidateId(entity.id);
                  setDeleteErrorMessage("");
                }}
                aria-label={`Delete ${entity.name}`}
                disabled={useMockFallback}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </section>

      {isOpen ? (
        <div className={styles.modalOverlay}>
          <div className={styles.identityModalCard}>
            <div className={styles.identityModalHeader}>{editingEntityId ? "Edit Entity" : "Add Entities"}</div>
            <div className={styles.identityModalBody}>
              <label className={styles.identityFieldRow}>
                <span>Owner</span>
                <select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
                  {ownerOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.identityFieldRow}>
                <span>Name</span>
                <input value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label className={styles.identityFieldRow}>
                <span>Type</span>
                <select value={type} onChange={(event) => setType(event.target.value)}>
                  <option value=""></option>
                  <option value="SMSF">SMSF</option>
                  <option value="Trust">Trust</option>
                  <option value="Company">Company</option>
                  <option value="Partnership">Partnership</option>
                </select>
              </label>
            </div>
            <div className={styles.identityModalActions}>
              <button
                type="button"
                className={styles.identityCreateButton}
                onClick={() => void handleAddEntity()}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : editingEntityId ? "Save" : "Add"}
              </button>
              <button
                type="button"
                className={styles.modalSecondary}
                onClick={() => {
                  resetForm();
                  setIsOpen(false);
                }}
                disabled={isSaving}
              >
                Cancel
              </button>
            </div>
            {errorMessage ? <p className={styles.modalError}>{errorMessage}</p> : null}
          </div>
        </div>
      ) : null}

      {deleteCandidateId ? (
        <div className={styles.modalOverlay}>
          <div className={styles.confirmDialog}>
            <h2 className={styles.confirmTitle}>Delete Entity</h2>
            <p className={styles.confirmText}>Are you sure you want to delete this entity? This action cannot be undone.</p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={`${styles.modalPrimary} ${styles.confirmDanger}`.trim()}
                onClick={() => void handleDeleteEntity()}
                disabled={isSaving}
              >
                {isSaving ? "Deleting..." : "Delete"}
              </button>
              <button
                type="button"
                className={styles.modalSecondary}
                onClick={() => {
                  setDeleteCandidateId(null);
                  setDeleteErrorMessage("");
                }}
                disabled={isSaving}
              >
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
