import type { ClientProfile } from "@/lib/api/types";
import styles from "./page.module.css";

type WizardsSectionProps = {
  profile: ClientProfile;
  useMockFallback?: boolean;
};

type WizardCard = {
  title: string;
  description: string;
  status: "Ready" | "Coming soon";
  fields: string[];
};

const onboardingWizards: WizardCard[] = [
  {
    title: "Client Onboarding",
    description: "Guide the team through the essential setup items for a new client record before advice work begins.",
    status: "Ready",
    fields: ["Client details", "Identity check", "Entities and dependents"],
  },
  {
    title: "Fact Find Review",
    description: "Work through the core household data areas and highlight sections that are incomplete or still sample-only.",
    status: "Ready",
    fields: ["Assets and liabilities", "Income and expenses", "Super and retirement income"],
  },
];

const adviceWizards: WizardCard[] = [
  {
    title: "Insurance Review",
    description: "Prepare the insurance policy and cover information needed once the new backend contract is finalised.",
    status: "Coming soon",
    fields: ["Policy owner", "Linked super", "Cover details"],
  },
  {
    title: "Strategy Prep",
    description: "Collect the key profile inputs that will feed advice documents, annual reviews, and later statement generation.",
    status: "Coming soon",
    fields: ["Risk position", "Client objectives", "Advice-ready summary"],
  },
  {
    title: "Annual Review",
    description: "Track annual agreement and review checkpoints so adviser teams can move through a repeatable servicing workflow.",
    status: "Coming soon",
    fields: ["FDS and annual agreement", "Client changes", "Review prompts"],
  },
];

function countProfileItems(profile: ClientProfile) {
  return {
    entities: profile.entities?.length ?? 0,
    dependants: profile.dependants?.length ?? 0,
    assets: profile.assets?.length ?? 0,
    liabilities: profile.liabilities?.length ?? 0,
    income: profile.income?.length ?? 0,
    expenses: profile.expense?.length ?? 0,
    superannuation: profile.superannuation?.length ?? 0,
    retirementIncome: profile.pension?.length ?? 0,
  };
}

export function WizardsSection({ profile, useMockFallback = false }: WizardsSectionProps) {
  const counts = countProfileItems(profile);
  const clientName = profile.client?.name ?? "this client";

  return (
    <section className={styles.wizardsSection}>
      <div className={styles.sectionHeader}>
        <h1 className={styles.title}>iC2 Wizards</h1>
      </div>

      <div className={styles.wizardHero}>
        <div>
          <h2 className={styles.wizardHeroTitle}>Guided workflows for {clientName}</h2>
          <p className={styles.wizardHeroText}>
            Use wizards to move through the client record in a structured order instead of jumping section by section.
          </p>
        </div>
        <div className={styles.wizardStats}>
          <div className={styles.wizardStat}>
            <span className={styles.wizardStatLabel}>Profile status</span>
            <strong>{useMockFallback ? "Sample data" : "Live data"}</strong>
          </div>
          <div className={styles.wizardStat}>
            <span className={styles.wizardStatLabel}>Household setup</span>
            <strong>{counts.entities + counts.dependants} records</strong>
          </div>
          <div className={styles.wizardStat}>
            <span className={styles.wizardStatLabel}>Financial records</span>
            <strong>{counts.assets + counts.liabilities + counts.income + counts.expenses + counts.superannuation + counts.retirementIncome} items</strong>
          </div>
        </div>
      </div>

      <div className={styles.wizardBlock}>
        <div className={styles.wizardBlockHeader}>
          <h3 className={styles.wizardBlockTitle}>Core Setup</h3>
          <p className={styles.wizardBlockText}>These are the best candidates for the first real wizard flows while the backend catches up.</p>
        </div>
        <div className={styles.wizardGrid}>
          {onboardingWizards.map((wizard) => (
            <article key={wizard.title} className={styles.wizardCard}>
              <div className={styles.wizardCardHeader}>
                <h4 className={styles.wizardCardTitle}>{wizard.title}</h4>
                <span className={`${styles.wizardBadge} ${wizard.status === "Coming soon" ? styles.wizardBadgeMuted : ""}`}>{wizard.status}</span>
              </div>
              <p className={styles.wizardCardText}>{wizard.description}</p>
              <ul className={styles.wizardList}>
                {wizard.fields.map((field) => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
              <div className={styles.wizardActions}>
                <button type="button" className={styles.wizardPrimaryButton}>
                  Open wizard
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className={styles.wizardBlock}>
        <div className={styles.wizardBlockHeader}>
          <h3 className={styles.wizardBlockTitle}>Next Wave</h3>
          <p className={styles.wizardBlockText}>These are staged behind the API work we already know is still moving.</p>
        </div>
        <div className={styles.wizardGrid}>
          {adviceWizards.map((wizard) => (
            <article key={wizard.title} className={styles.wizardCard}>
              <div className={styles.wizardCardHeader}>
                <h4 className={styles.wizardCardTitle}>{wizard.title}</h4>
                <span className={`${styles.wizardBadge} ${styles.wizardBadgeMuted}`}>{wizard.status}</span>
              </div>
              <p className={styles.wizardCardText}>{wizard.description}</p>
              <ul className={styles.wizardList}>
                {wizard.fields.map((field) => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
              <div className={styles.wizardActions}>
                <button type="button" className={styles.wizardSecondaryButton}>
                  Plan later
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
