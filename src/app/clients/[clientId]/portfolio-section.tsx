"use client";

import styles from "./page.module.css";

export function PortfolioSection() {
  return (
    <>
      <div className={styles.sectionHeader}>
        <h1 className={styles.title}>Portfolio</h1>
        <button type="button" className={styles.plusButton} aria-label="Add portfolio item">
          +
        </button>
      </div>

      <section className={styles.entitiesSection}>
        <div className={styles.emptyStateCard}>
          Portfolio content will go here.
        </div>
      </section>
    </>
  );
}
