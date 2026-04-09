"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

type AdviceDocumentPlaceholderSectionProps = {
  clientId: string;
  documentKey: "engagement-letter" | "record-of-advice" | "statement-of-advice";
  title: string;
  stepTitle: string;
  sections: string[];
  outputText: string;
};

type AdviceScenario = {
  id: string;
  name: string;
  status: "Draft";
  createdAt: string;
  updatedAt: string;
};

function storageKey(clientId: string, documentKey: AdviceDocumentPlaceholderSectionProps["documentKey"]) {
  return `ic2:advice-scenarios:${clientId}:${documentKey}`;
}

export function AdviceDocumentPlaceholderSection({
  clientId,
  documentKey,
  title,
  stepTitle,
  sections,
  outputText,
}: AdviceDocumentPlaceholderSectionProps) {
  const [scenarios, setScenarios] = useState<AdviceScenario[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey(clientId, documentKey));
    if (!raw) {
      setScenarios([]);
      setIsLoaded(true);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as AdviceScenario[];
      setScenarios(Array.isArray(parsed) ? parsed : []);
    } catch {
      setScenarios([]);
    } finally {
      setIsLoaded(true);
    }
  }, [clientId, documentKey]);

  useEffect(() => {
    if (!isLoaded) return;
    window.localStorage.setItem(storageKey(clientId, documentKey), JSON.stringify(scenarios));
  }, [clientId, documentKey, isLoaded, scenarios]);

  const nextScenarioName = useMemo(() => `${title} Scenario ${scenarios.length + 1}`, [scenarios.length, title]);

  function handleCreateScenario() {
    const timestamp = new Date().toISOString();
    const nextScenario: AdviceScenario = {
      id: `scenario-${crypto.randomUUID()}`,
      name: nextScenarioName,
      status: "Draft",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    setScenarios((current) => [nextScenario, ...current]);
  }

  return (
    <>
      <div className={styles.sectionHeader}>
        <h1 className={styles.title}>{title}</h1>
        <button
          type="button"
          className={styles.plusButton}
          aria-label={`Create ${title} scenario`}
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
                Each scenario represents a separate draft of this document for the current client.
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
                    Created {new Date(scenario.createdAt).toLocaleDateString("en-AU")} and ready for the next workflow
                    build.
                  </p>
                  <div className={styles.planPreviewGrid}>
                    <div className={styles.planPreviewItem}>
                      <span className={styles.planPreviewLabel}>Status</span>
                      <span className={styles.planPreviewValue}>{scenario.status}</span>
                    </div>
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
                    <button type="button" className={styles.wizardSecondaryButton}>
                      Open scenario
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        <div className={styles.factFindWorkflowCard}>
          <div className={styles.factFindWorkflowHeader}>
            <div>
              <div className={styles.factFindEyebrow}>{title}</div>
              <h2 className={styles.factFindStepTitle}>{stepTitle}</h2>
              <p className={styles.factFindStepDescription}>
                This wizard will guide the adviser through the core sections needed to prepare this advice document.
              </p>
              <div className={styles.factFindGuidance}>
                Placeholder only for now. The next build will connect these sections to Finley-assisted drafting and
                document generation.
              </div>
            </div>
            <div className={styles.factFindStepBadge}>Coming Soon</div>
          </div>

          <div className={styles.factFindGuidance}>
            Click the `+` button to create a saved scenario for this client. Each scenario will represent a separate
            draft of the {title.toLowerCase()}.
          </div>

          <div className={styles.wizardGrid}>
            <div className={styles.wizardCard}>
              <div className={styles.wizardCardHeader}>
                <h3 className={styles.wizardCardTitle}>Sections Planned</h3>
                <span className={`${styles.wizardBadge} ${styles.wizardBadgeMuted}`.trim()}>Placeholder</span>
              </div>
              <ul className={styles.wizardList}>
                {sections.map((section) => (
                  <li key={section}>{section}</li>
                ))}
              </ul>
            </div>

            <div className={styles.wizardCard}>
              <div className={styles.wizardCardHeader}>
                <h3 className={styles.wizardCardTitle}>Planned Output</h3>
                <span className={`${styles.wizardBadge} ${styles.wizardBadgeMuted}`.trim()}>Finley Ready</span>
              </div>
              <p className={styles.wizardCardText}>{outputText}</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
