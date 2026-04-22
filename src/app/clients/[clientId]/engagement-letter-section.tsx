"use client";

import { useEffect, useMemo, useState } from "react";
import { EngagementLetterDraftCard, type EngagementLetterDraftValue } from "@/components/engagement-letter-draft-card";
import type { ClientProfile } from "@/lib/api/types";
import styles from "./page.module.css";

type EngagementLetterSectionProps = {
  clientId: string;
  profile: ClientProfile;
};

type EngagementLetterScenario = {
  id: string;
  name: string;
  status: "Draft";
  createdAt: string;
  updatedAt: string;
  draft: EngagementLetterDraftValue;
};

const EMPTY_DRAFT: EngagementLetterDraftValue = {
  reasonsHtml: "",
  servicesHtml: "",
  advicePreparationFee: "",
  implementationFee: "",
};

function storageKey(clientId: string) {
  return `ic2:advice-scenarios:${clientId}:engagement-letter`;
}

export function EngagementLetterSection({ clientId, profile }: EngagementLetterSectionProps) {
  const [scenarios, setScenarios] = useState<EngagementLetterScenario[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey(clientId));
    if (!raw) {
      setScenarios([]);
      setActiveScenarioId(null);
      setIsLoaded(true);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as EngagementLetterScenario[];
      const nextScenarios = Array.isArray(parsed) ? parsed : [];
      setScenarios(nextScenarios);
      setActiveScenarioId(nextScenarios[0]?.id ?? null);
    } catch {
      setScenarios([]);
      setActiveScenarioId(null);
    } finally {
      setIsLoaded(true);
    }
  }, [clientId]);

  useEffect(() => {
    if (!isLoaded) return;
    window.localStorage.setItem(storageKey(clientId), JSON.stringify(scenarios));
  }, [clientId, isLoaded, scenarios]);

  const activeScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === activeScenarioId) ?? null,
    [activeScenarioId, scenarios],
  );

  async function handlePrint() {
    if (!activeScenario) return;

    setIsPrinting(true);
    setPrintError(null);

    try {
      const response = await fetch("/api/wizards/engagement-letter/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId,
          draft: activeScenario.draft,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Unable to generate the engagement letter right now.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const disposition = response.headers.get("Content-Disposition");
      const fileNameMatch = disposition?.match(/filename="?([^"]+)"?/i);

      anchor.href = url;
      anchor.download = fileNameMatch?.[1] ?? "Engagement.docx";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setPrintError(error instanceof Error ? error.message : "Unable to generate the engagement letter right now.");
    } finally {
      setIsPrinting(false);
    }
  }

  function handleCreateScenario() {
    const timestamp = new Date().toISOString();
    const nextScenario: EngagementLetterScenario = {
      id: `scenario-${crypto.randomUUID()}`,
      name: `Engagement Letter Scenario ${scenarios.length + 1}`,
      status: "Draft",
      createdAt: timestamp,
      updatedAt: timestamp,
      draft: EMPTY_DRAFT,
    };

    setScenarios((current) => [nextScenario, ...current]);
    setActiveScenarioId(nextScenario.id);
  }

  function updateScenarioDraft(nextDraft: EngagementLetterDraftValue) {
    if (!activeScenarioId) return;

    setScenarios((current) =>
      current.map((scenario) =>
        scenario.id === activeScenarioId
          ? {
              ...scenario,
              draft: nextDraft,
              updatedAt: new Date().toISOString(),
            }
          : scenario,
      ),
    );
  }

  return (
    <>
      <div className={styles.sectionHeader}>
        <h1 className={styles.title}>Engagement Letter</h1>
        <button
          type="button"
          className={styles.plusButton}
          aria-label="Create Engagement Letter scenario"
          onClick={handleCreateScenario}
        >
          +
        </button>
      </div>

      <section className={styles.wizardsSection}>
        {scenarios.length ? (
          <div className={styles.wizardBlock}>
            <div className={styles.wizardBlockHeader}>
              <h3 className={styles.wizardBlockTitle}>Saved Scenarios</h3>
              <p className={styles.wizardBlockText}>
                Each scenario represents a separate draft of the engagement letter for this client.
              </p>
            </div>
            <div className={styles.wizardGrid}>
              {scenarios.map((scenario) => (
                <article key={scenario.id} className={styles.wizardCard}>
                  <div className={styles.wizardCardHeader}>
                    <h3 className={styles.wizardCardTitle}>{scenario.name}</h3>
                    <span className={styles.wizardBadge}>{scenario.status}</span>
                  </div>
                  <p className={styles.wizardCardText}>
                    Created {new Date(scenario.createdAt).toLocaleDateString("en-AU")} and ready for adviser drafting.
                  </p>
                  <div className={styles.planPreviewGrid}>
                    <div className={styles.planPreviewItem}>
                      <span className={styles.planPreviewLabel}>Created</span>
                      <span className={styles.planPreviewValue}>
                        {new Date(scenario.createdAt).toLocaleDateString("en-AU")}
                      </span>
                    </div>
                    <div className={styles.planPreviewItem}>
                      <span className={styles.planPreviewLabel}>Updated</span>
                      <span className={styles.planPreviewValue}>
                        {new Date(scenario.updatedAt).toLocaleDateString("en-AU")}
                      </span>
                    </div>
                  </div>
                  <div className={styles.wizardActions}>
                    <button
                      type="button"
                      className={styles.wizardSecondaryButton}
                      onClick={() => setActiveScenarioId(scenario.id)}
                    >
                      Open scenario
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {activeScenario ? (
          <EngagementLetterDraftCard
            title={activeScenario.name}
            description="Send your client an initial engagement letter to outline the services you will provide and disclose the costs of your advice."
            badge="Drafting Card"
            clientName={profile.client?.name ?? "this client"}
            adviserName={profile.adviser?.name ?? ""}
            value={activeScenario.draft}
            onChange={updateScenarioDraft}
            onPrint={handlePrint}
            isPrinting={isPrinting}
            printError={printError}
          />
        ) : (
          <div className={styles.factFindWorkflowCard}>
            <div className={styles.factFindWorkflowHeader}>
              <div>
                <div className={styles.factFindEyebrow}>Engagement Letter</div>
                <h2 className={styles.factFindStepTitle}>Prepare Engagement Letter</h2>
                <p className={styles.factFindStepDescription}>
                  Create a saved scenario to start drafting the engagement letter with rich-text sections and AI help.
                </p>
                <div className={styles.factFindGuidance}>
                  Click the `+` button to create the first engagement letter scenario for this client.
                </div>
              </div>
              <div className={styles.factFindStepBadge}>Ready to Draft</div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
