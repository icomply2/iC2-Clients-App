"use client";

import styles from "./page.module.css";

export function FactFindSection() {
  return (
    <>
      <div className={styles.sectionHeader}>
        <h1 className={styles.title}>Fact Find</h1>
        <button type="button" className={styles.plusButton} aria-label="Add fact find item">
          +
        </button>
      </div>

      <section className={styles.wizardsSection}>
        <div className={styles.emptyStateCard}>Fact Find content will go here.</div>
      </section>
    </>
  );
}
