"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { readSoaScenarios, writeSoaScenarios, type SoaScenario } from "@/lib/soa-scenarios";
import styles from "./page.module.css";

type StatementOfAdviceSectionProps = {
  clientId: string;
};

export function StatementOfAdviceSection({ clientId }: StatementOfAdviceSectionProps) {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<SoaScenario[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

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

  function handleCreateScenario() {
    const timestamp = new Date().toISOString();
    const nextScenario: SoaScenario = {
      id: `soa-${crypto.randomUUID()}`,
      name: `SOA Scenario ${scenarios.length + 1}`,
      status: "Draft",
      createdAt: timestamp,
      updatedAt: timestamp,
      draft: null,
    };

    const nextScenarios = [nextScenario, ...scenarios];
    setScenarios(nextScenarios);
    router.push(`/finley/soa?clientId=${encodeURIComponent(clientId)}&soaId=${encodeURIComponent(nextScenario.id)}`);
  }

  return (
    <>
      <div className={styles.sectionHeader}>
        <h1 className={styles.title}>Statement of Advice</h1>
        <button
          type="button"
          className={styles.plusButton}
          aria-label="Create Statement of Advice scenario"
          onClick={handleCreateScenario}
        >
          +
        </button>
      </div>

      <section className={styles.wizardsSection}>
        {scenarios.length ? (
          <div className={styles.wizardBlock}>
            <div className={styles.wizardBlockHeader}>
              <h3 className={styles.wizardBlockTitle}>Saved SOA Scenarios</h3>
              <p className={styles.wizardBlockText}>
                Each scenario is a saved Statement of Advice draft for this client that can be reopened later.
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
                    Created {new Date(scenario.createdAt).toLocaleDateString("en-AU")} and ready for adviser or paraplanner review.
                  </p>
                  <div className={styles.planPreviewGrid}>
                    <div className={styles.planPreviewItem}>
                      <span className={styles.planPreviewLabel}>Scenario ID</span>
                      <span className={styles.planPreviewValue}>{scenario.id}</span>
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
                      onClick={() =>
                        router.push(
                          `/finley/soa?clientId=${encodeURIComponent(clientId)}&soaId=${encodeURIComponent(scenario.id)}`,
                        )
                      }
                    >
                      Open scenario
                    </button>
                  </div>
                </article>
              ))}
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
    </>
  );
}
