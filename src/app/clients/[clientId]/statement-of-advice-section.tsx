"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  readSoaScenarios,
  soaScenarioStatuses,
  writeSoaScenarios,
  type SoaScenario,
  type SoaScenarioStatus,
} from "@/lib/soa-scenarios";
import styles from "./page.module.css";

type StatementOfAdviceSectionProps = {
  clientId: string;
};

export function StatementOfAdviceSection({ clientId }: StatementOfAdviceSectionProps) {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<SoaScenario[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<SoaScenario | null>(null);
  const [isCreateScenarioOpen, setIsCreateScenarioOpen] = useState(false);
  const [scenarioName, setScenarioName] = useState("");
  const [scenarioNameError, setScenarioNameError] = useState("");
  const [editCandidate, setEditCandidate] = useState<SoaScenario | null>(null);
  const [editScenarioName, setEditScenarioName] = useState("");
  const [editScenarioStatus, setEditScenarioStatus] = useState<SoaScenarioStatus>("Draft");
  const [editScenarioError, setEditScenarioError] = useState("");

  useEffect(() => {
    const nextScenarios = readSoaScenarios(clientId);
    setScenarios(nextScenarios);
    setIsLoaded(true);
  }, [clientId]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    writeSoaScenarios(clientId, scenarios);
  }, [clientId, isLoaded, scenarios]);

  function openCreateScenarioModal() {
    setScenarioName(`SOA Scenario ${scenarios.length + 1}`);
    setScenarioNameError("");
    setIsCreateScenarioOpen(true);
  }

  function closeCreateScenarioModal() {
    setIsCreateScenarioOpen(false);
    setScenarioName("");
    setScenarioNameError("");
  }

  function handleCreateScenario() {
    const trimmedScenarioName = scenarioName.trim();

    if (!trimmedScenarioName) {
      setScenarioNameError("Enter a scenario name.");
      return;
    }

    const timestamp = new Date().toISOString();
    const nextScenario: SoaScenario = {
      id: `soa-${crypto.randomUUID()}`,
      name: trimmedScenarioName,
      status: "Draft",
      createdAt: timestamp,
      updatedAt: timestamp,
      draft: null,
    };

    const nextScenarios = [nextScenario, ...scenarios];
    setScenarios(nextScenarios);
    closeCreateScenarioModal();
    router.push(`/finley/soa?clientId=${encodeURIComponent(clientId)}&soaId=${encodeURIComponent(nextScenario.id)}`);
  }

  function openScenario(scenarioId: string) {
    router.push(`/finley/soa?clientId=${encodeURIComponent(clientId)}&soaId=${encodeURIComponent(scenarioId)}`);
  }

  function openEditScenarioModal(scenario: SoaScenario) {
    setEditCandidate(scenario);
    setEditScenarioName(scenario.name);
    setEditScenarioStatus(scenario.status);
    setEditScenarioError("");
  }

  function closeEditScenarioModal() {
    setEditCandidate(null);
    setEditScenarioName("");
    setEditScenarioStatus("Draft");
    setEditScenarioError("");
  }

  function saveScenarioEdits() {
    if (!editCandidate) {
      return;
    }

    const trimmedName = editScenarioName.trim();

    if (!trimmedName) {
      setEditScenarioError("Enter a scenario name.");
      return;
    }

    const timestamp = new Date().toISOString();

    setScenarios((current) =>
      current.map((scenario) =>
        scenario.id === editCandidate.id
          ? {
              ...scenario,
              name: trimmedName,
              status: editScenarioStatus,
              updatedAt: timestamp,
            }
          : scenario,
      ),
    );
    closeEditScenarioModal();
  }

  function confirmDeleteScenario() {
    if (!deleteCandidate) {
      return;
    }

    setScenarios((current) => current.filter((scenario) => scenario.id !== deleteCandidate.id));
    setDeleteCandidate(null);
  }

  return (
    <>
      <div className={styles.sectionHeader}>
        <h1 className={styles.title}>Statement of Advice</h1>
        <button
          type="button"
          className={styles.plusButton}
          aria-label="Create Statement of Advice scenario"
          onClick={openCreateScenarioModal}
        >
          +
        </button>
      </div>

      <section className={styles.wizardsSection}>
        {scenarios.length ? (
          <div className={styles.wizardBlock}>
            <div className={styles.soaScenarioList} role="table" aria-label="Saved SOA scenarios">
              <div className={styles.soaScenarioHeader} role="row">
                <div role="columnheader">Created Date</div>
                <div role="columnheader">Scenario Name</div>
                <div role="columnheader">Scenario ID</div>
                <div role="columnheader">Updated</div>
                <div role="columnheader">Status</div>
                <div role="columnheader" aria-label="Scenario actions" />
              </div>
              <div className={styles.soaScenarioRows}>
                {scenarios.map((scenario) => (
                  <div key={scenario.id} className={styles.soaScenarioRow} role="row">
                    <div role="cell">{new Date(scenario.createdAt).toLocaleDateString("en-AU")}</div>
                    <div className={styles.soaScenarioName} role="cell">
                      {scenario.name}
                    </div>
                    <div className={styles.soaScenarioId} role="cell">
                      {scenario.id}
                    </div>
                    <div role="cell">{new Date(scenario.updatedAt).toLocaleDateString("en-AU")}</div>
                    <div role="cell">
                      <span className={styles.wizardBadge}>{scenario.status}</span>
                    </div>
                    <div className={styles.soaScenarioActions} role="cell">
                      <button
                        type="button"
                        className={styles.wizardSecondaryButton}
                        onClick={() => openScenario(scenario.id)}
                      >
                        Open scenario
                      </button>
                      <button
                        type="button"
                        className={styles.soaScenarioEditButton}
                        aria-label={`Edit ${scenario.name}`}
                        onClick={() => openEditScenarioModal(scenario)}
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.soaScenarioActionIcon}>
                          <path d="M4 17.25V20h2.75L17.81 8.94l-2.75-2.75L4 17.25Zm15.71-10.04a1 1 0 0 0 0-1.41L18.2 4.29a1 1 0 0 0-1.41 0l-1.02 1.02 2.75 2.75 1.19-.85Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={styles.soaScenarioDeleteButton}
                        aria-label={`Delete ${scenario.name}`}
                        onClick={() => setDeleteCandidate(scenario)}
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.soaScenarioActionIcon}>
                          <path d="M9 3h6l1 2h4v2H4V5h4l1-2Z" />
                          <path d="M6 9h12l-1 12H7L6 9Zm4 2v8h2v-8h-2Zm4 0v8h2v-8h-2Z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.factFindWorkflowCard}>
            <div className={styles.factFindWorkflowHeader}>
              <div>
                <div className={styles.factFindEyebrow}>Statement of Advice</div>
                <h2 className={styles.factFindStepTitle}>Create Statement of Advice</h2>
                <p className={styles.factFindStepDescription}>
                  Create a saved SOA scenario to launch the Finley SOA workflow and come back to it later.
                </p>
                <div className={styles.factFindGuidance}>
                  Click the `+` button to create the first saved Statement of Advice scenario for this client.
                </div>
              </div>
              <div className={styles.factFindStepBadge}>Ready to Draft</div>
            </div>
          </div>
        )}
      </section>

      {isCreateScenarioOpen ? (
        <div className={styles.modalOverlay} role="presentation" onClick={closeCreateScenarioModal}>
          <form
            className={styles.confirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-soa-scenario-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              handleCreateScenario();
            }}
          >
            <h2 id="create-soa-scenario-title" className={styles.confirmTitle}>
              Name SOA scenario
            </h2>
            <label className={styles.modalField}>
              <span>Scenario name</span>
              <input
                autoFocus
                value={scenarioName}
                onChange={(event) => {
                  setScenarioName(event.target.value);
                  setScenarioNameError("");
                }}
                placeholder="e.g. Retirement advice - April 2026"
              />
            </label>
            {scenarioNameError ? <p className={styles.modalError}>{scenarioNameError}</p> : null}
            <div className={styles.confirmActions}>
              <button type="button" className={styles.modalSecondary} onClick={closeCreateScenarioModal}>
                Cancel
              </button>
              <button type="submit" className={styles.modalPrimary}>
                Create scenario
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {editCandidate ? (
        <div className={styles.modalOverlay} role="presentation" onClick={closeEditScenarioModal}>
          <form
            className={styles.confirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-soa-scenario-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              saveScenarioEdits();
            }}
          >
            <h2 id="edit-soa-scenario-title" className={styles.confirmTitle}>
              Edit SOA scenario
            </h2>
            <label className={styles.modalField}>
              <span>Scenario name</span>
              <input
                autoFocus
                value={editScenarioName}
                onChange={(event) => {
                  setEditScenarioName(event.target.value);
                  setEditScenarioError("");
                }}
              />
            </label>
            <label className={styles.modalField}>
              <span>Status</span>
              <select
                value={editScenarioStatus}
                onChange={(event) => setEditScenarioStatus(event.target.value as SoaScenarioStatus)}
              >
                {soaScenarioStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            {editScenarioError ? <p className={styles.modalError}>{editScenarioError}</p> : null}
            <div className={styles.confirmActions}>
              <button type="button" className={styles.modalSecondary} onClick={closeEditScenarioModal}>
                Cancel
              </button>
              <button type="submit" className={styles.modalPrimary}>
                Save changes
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {deleteCandidate ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setDeleteCandidate(null)}>
          <div
            className={styles.confirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-soa-scenario-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-soa-scenario-title" className={styles.confirmTitle}>
              Delete SOA scenario
            </h2>
            <p className={styles.confirmText}>
              Are you sure you want to delete <strong>{deleteCandidate.name}</strong>?
            </p>
            <p className={styles.confirmText}>This will remove the saved draft for this client.</p>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.modalSecondary} onClick={() => setDeleteCandidate(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.modalPrimary} ${styles.confirmDanger}`.trim()}
                onClick={confirmDeleteScenario}
              >
                Confirm delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
