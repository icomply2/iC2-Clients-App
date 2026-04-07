"use client";

import styles from "./page.module.css";

export function EngagementLetterSection() {
  return (
    <>
      <div className={styles.sectionHeader}>
        <h1 className={styles.title}>Engagement Letter</h1>
        <button type="button" className={styles.plusButton} aria-label="Add engagement letter item">
          +
        </button>
      </div>

      <section className={styles.wizardsSection}>
        <div className={styles.emptyStateCard}>Engagement Letter content will go here.</div>
      </section>
    </>
  );
}
