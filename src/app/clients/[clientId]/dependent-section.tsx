"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiResult, ClientDependantRecord, ClientProfile } from "@/lib/api/types";
import styles from "./page.module.css";

type DependentSectionProps = {
  profile: ClientProfile;
  useMockFallback?: boolean;
};

function getFallbackMessage() {
  return "Live client data is temporarily unavailable. Editing is disabled while sample data is shown.";
}

export function DependentSection({ profile, useMockFallback = false }: DependentSectionProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [editingDependantId, setEditingDependantId] = useState<string | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState("");
  const [dependants, setDependants] = useState<ClientDependantRecord[]>(profile.dependants ?? []);

  useEffect(() => {
    setDependants(profile.dependants ?? []);
  }, [profile.dependants]);

  const displayDependants = useMemo(
    () =>
      dependants.map((dependant) => ({
        id: dependant.id ?? "",
        name: dependant.name ?? "",
        type: dependant.type ?? "Child",
        birthday: dependant.birthday ?? "",
        birthdayDisplay: formatBirthday(dependant.birthday),
      })),
    [dependants],
  );

  const clientOwner =
    profile.client?.name && profile.client?.id
      ? { value: profile.client.id, label: profile.client.name }
      : null;
  const [name, setName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [dependantType, setDependantType] = useState("Child");

  function resetForm() {
    setName("");
    setBirthday("");
    setDependantType("Child");
    setErrorMessage("");
    setEditingDependantId(null);
  }

  function mergeReturnedDependants(
    returnedDependants: ClientDependantRecord[],
    submittedDependants: ClientDependantRecord[],
  ) {
    return returnedDependants.map((returnedDependant) => {
      const matchedDependant =
        submittedDependants.find(
          (submittedDependant) =>
            submittedDependant.id && returnedDependant.id && submittedDependant.id === returnedDependant.id,
        ) ??
        submittedDependants.find(
          (submittedDependant) =>
            (submittedDependant.name ?? "").trim().toLowerCase() === (returnedDependant.name ?? "").trim().toLowerCase() &&
            (submittedDependant.birthday ?? "") === (returnedDependant.birthday ?? "") &&
            (submittedDependant.owner?.id ?? clientOwner?.value ?? "") === (returnedDependant.owner?.id ?? clientOwner?.value ?? ""),
        );

      return {
        ...returnedDependant,
        type: matchedDependant?.type ?? returnedDependant.type ?? "Child",
      };
    });
  }

  function parseResponseBody(responseText: string) {
    if (!responseText) {
      return null;
    }

    try {
      return JSON.parse(responseText) as
        | ApiResult<ClientDependantRecord[]>
        | { message?: string | null; modelErrors?: { errorMessage?: string | null }[] | null };
    } catch {
      return null;
    }
  }

  function formatBirthday(value?: string | null) {
    if (!value) {
      return "";
    }

    const parsedDate = new Date(value);

    if (Number.isNaN(parsedDate.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat("en-AU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(parsedDate);
  }

  async function saveDependants(nextDependants: ClientDependantRecord[], fallbackError: string) {
    if (!profile.id) {
      throw new Error("This client profile does not have a profile id yet.");
    }

    const response = await fetch(`/api/client-profiles/${profile.id}/dependants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentUser: null,
        request: nextDependants.map((dependant) => ({
          id: dependant.id ?? null,
          name: dependant.name ?? null,
          birthday: dependant.birthday ?? null,
          owner: dependant.owner
            ? {
                id: dependant.owner.id ?? null,
                name: dependant.owner.name ?? null,
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

    const returnedDependants = result && "data" in result && Array.isArray(result.data) ? result.data : null;
    setDependants(returnedDependants ? mergeReturnedDependants(returnedDependants, nextDependants) : nextDependants);
    router.refresh();
  }

  async function handleSaveDependant() {
    if (useMockFallback) {
      setErrorMessage(getFallbackMessage());
      return;
    }

    if (!profile.id) {
      setErrorMessage("This client profile does not have a profile id yet.");
      return;
    }

    if (!clientOwner) {
      setErrorMessage("This client does not have a valid owner entity yet.");
      return;
    }

    if (!name.trim()) {
      setErrorMessage("Please enter a dependant name.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    try {
      const nextDependants = editingDependantId
        ? dependants.map((dependant) =>
            dependant.id === editingDependantId
              ? {
                  ...dependant,
                  name: name.trim(),
                  birthday: birthday || null,
                  type: dependantType,
                  owner: {
                    id: clientOwner.value,
                    name: clientOwner.label,
                  },
                }
              : dependant,
          )
        : [
            ...dependants.map((dependant) => ({
              id: dependant.id ?? null,
              name: dependant.name ?? null,
              birthday: dependant.birthday ?? null,
              type: dependant.type ?? "Child",
              owner: dependant.owner
                ? {
                    id: dependant.owner.id ?? null,
                    name: dependant.owner.name ?? null,
                  }
                : null,
            })),
            {
              id: null,
              name: name.trim(),
              birthday: birthday || null,
              type: dependantType,
              owner: {
                id: clientOwner.value,
                name: clientOwner.label,
              },
            },
          ];

      await saveDependants(nextDependants, "Unable to save the dependant right now");
      resetForm();
      setIsOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save the dependant right now.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleEditClick(dependantId: string) {
    if (useMockFallback) {
      setErrorMessage(getFallbackMessage());
      return;
    }

    const dependant = dependants.find((item) => item.id === dependantId);

    if (!dependant) {
      return;
    }

    setEditingDependantId(dependant.id ?? null);
    setName(dependant.name ?? "");
    setBirthday((dependant.birthday ?? "").slice(0, 10));
    setDependantType(dependant.type ?? "Child");
    setErrorMessage("");
    setIsOpen(true);
  }

  async function handleDeleteDependant() {
    if (useMockFallback) {
      setDeleteErrorMessage(getFallbackMessage());
      return;
    }

    if (!profile.id || !deleteCandidateId) {
      return;
    }

    setIsSaving(true);
    setDeleteErrorMessage("");

    try {
      const response = await fetch(`/api/client-profiles/${profile.id}/dependants/${deleteCandidateId}`, {
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
            : responseText || `Unable to delete the dependant right now (status ${response.status}).`);
        throw new Error(`Delete failed (${response.status}): ${message}`);
      }

      setDependants((current) => current.filter((dependant) => dependant.id !== deleteCandidateId));
      router.refresh();
      setDeleteCandidateId(null);
    } catch (error) {
      setDeleteErrorMessage(error instanceof Error ? error.message : "Unable to delete the dependant right now.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <div className={styles.sectionHeader}>
        <h1 className={styles.title}>Dependent</h1>
        <button
          type="button"
          className={styles.plusButton}
          aria-label="Add dependant"
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
        <div className={styles.dependantsHeader}>
          <div>Name</div>
          <div>DOB</div>
          <div>Type</div>
          <div className={styles.dependantsActionsHeader}></div>
        </div>

        {displayDependants.map((dependant) => (
          <div key={dependant.id || dependant.name} className={styles.dependantsRow}>
            <div>{dependant.name}</div>
            <div>{dependant.birthdayDisplay}</div>
            <div>{dependant.type}</div>
            <div className={styles.dependantsActions}>
              <button
                type="button"
                className={styles.rowActionButton}
                onClick={() => handleEditClick(dependant.id)}
                aria-label={`Edit ${dependant.name}`}
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
                  setDeleteCandidateId(dependant.id);
                  setDeleteErrorMessage("");
                }}
                aria-label={`Delete ${dependant.name}`}
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
            <div className={styles.identityModalHeader}>{editingDependantId ? "Edit Dependant" : "Add Dependant"}</div>
            <div className={styles.identityModalBody}>
              <label className={styles.identityFieldRow}>
                <span>Name</span>
                <input value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label className={styles.identityFieldRow}>
                <span>Type</span>
                <select value={dependantType} onChange={(event) => setDependantType(event.target.value)}>
                  <option value="Child">Child</option>
                  <option value="Grandchild">Grandchild</option>
                  <option value="Parent">Parent</option>
                  <option value="Sibling">Sibling</option>
                  <option value="Other">Other</option>
                </select>
              </label>
              <label className={styles.identityFieldRow}>
                <span>Date of Birth</span>
                <input type="date" value={birthday} onChange={(event) => setBirthday(event.target.value)} />
              </label>
            </div>
            <div className={styles.identityModalActions}>
              <button
                type="button"
                className={styles.identityCreateButton}
                onClick={() => void handleSaveDependant()}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : editingDependantId ? "Save" : "Add"}
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
            <h2 className={styles.confirmTitle}>Delete Dependant</h2>
            <p className={styles.confirmText}>Are you sure you want to delete this dependant? This action cannot be undone.</p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={`${styles.modalPrimary} ${styles.confirmDanger}`.trim()}
                onClick={() => void handleDeleteDependant()}
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
