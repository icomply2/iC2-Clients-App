"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./page.module.css";

type SectionKey =
  | "details"
  | "identity-check"
  | "entities"
  | "dependents"
  | "file-notes"
  | "wizards"
  | "wizards-fact-find"
  | "wizards-engagement-letter"
  | "wizards-record-of-advice"
  | "wizards-statement-of-advice"
  | "assets"
  | "liabilities"
  | "income"
  | "expenses"
  | "superannuation"
  | "retirement-income"
  | "insurance"
  | "portfolio";

type SidebarNavProps = {
  clientId: string;
  section: SectionKey;
};

const navItems = [
  { label: "All Clients", icon: "◔", href: "/clients", key: "all-clients" },
  { label: "Client Details", icon: "◕", href: "", key: "details" },
  { label: "Identity Check", icon: "◉", href: "/identity-check", key: "identity-check" },
  { label: "Entities", icon: "⌘", href: "/entities", key: "entities" },
  { label: "Dependents", icon: "◔", href: "/dependents", key: "dependents" },
  { label: "Client File Notes", icon: "◫", href: "/file-notes", key: "file-notes" },
  { label: "iC2 Wizards", icon: "✲", href: "/wizards", key: "wizards" },
  { label: "Assets", icon: "$", href: "/assets", key: "assets" },
  { label: "Liability", icon: "▤", href: "/liabilities", key: "liabilities" },
  { label: "Superannuation", icon: "▮", href: "/superannuation", key: "superannuation" },
  { label: "Pensions", icon: "◫", href: "/retirement-income", key: "retirement-income" },
  { label: "Insurance", icon: "✚", href: "/insurance", key: "insurance" },
  { label: "Income", icon: "▥", href: "/income", key: "income" },
  { label: "Expense", icon: "∿", href: "/expenses", key: "expenses" },
  { label: "Portfolio", icon: "⌘", href: "/portfolio", key: "portfolio" },
] as const;

function resolveHref(clientId: string, key: string, href: string) {
  switch (key) {
    case "details":
      return `/clients/${clientId}`;
    case "identity-check":
      return `/clients/${clientId}/identity-check`;
    case "entities":
      return `/clients/${clientId}/entities`;
    case "dependents":
      return `/clients/${clientId}/dependents`;
    case "file-notes":
      return `/clients/${clientId}/file-notes`;
    case "wizards":
      return `/clients/${clientId}/wizards`;
    case "assets":
      return `/clients/${clientId}/assets`;
    case "liabilities":
      return `/clients/${clientId}/liabilities`;
    case "income":
      return `/clients/${clientId}/income`;
    case "expenses":
      return `/clients/${clientId}/expenses`;
    case "superannuation":
      return `/clients/${clientId}/superannuation`;
    case "retirement-income":
      return `/clients/${clientId}/retirement-income`;
    case "insurance":
      return `/clients/${clientId}/insurance`;
    case "portfolio":
      return `/clients/${clientId}/portfolio`;
    default:
      return href;
  }
}

export function WorkspaceSidebar({ clientId, section }: SidebarNavProps) {
  const [wizardsOpen, setWizardsOpen] = useState(
    section === "wizards"
      || section === "wizards-fact-find"
      || section === "wizards-engagement-letter"
      || section === "wizards-record-of-advice"
      || section === "wizards-statement-of-advice",
  );

  return (
    <nav className={styles.nav} aria-label="Client sections">
      {navItems.map((item) => {
        if (item.key === "wizards") {
          const isActive =
            section === "wizards"
            || section === "wizards-fact-find"
            || section === "wizards-engagement-letter"
            || section === "wizards-record-of-advice"
            || section === "wizards-statement-of-advice";

          return (
            <div key={item.label} className={styles.navGroup}>
              <button
                type="button"
                className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`.trim()}
                onClick={() => setWizardsOpen((current) => !current)}
                aria-expanded={wizardsOpen}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                <span className={styles.navLabel}>{item.label}</span>
                <span className={styles.navCaret}>{wizardsOpen ? "▾" : "▸"}</span>
              </button>

              {wizardsOpen ? (
                <div className={styles.subnav}>
                  <Link
                    href={`/clients/${clientId}/wizards/fact-find`}
                    className={`${styles.subnavItem} ${section === "wizards-fact-find" ? styles.subnavItemActive : ""}`.trim()}
                  >
                    Fact Find
                  </Link>
                  <Link
                    href={`/clients/${clientId}/wizards/engagement-letter`}
                    className={`${styles.subnavItem} ${section === "wizards-engagement-letter" ? styles.subnavItemActive : ""}`.trim()}
                  >
                    Engagement Letter
                  </Link>
                  <Link
                    href={`/clients/${clientId}/wizards/record-of-advice`}
                    className={`${styles.subnavItem} ${section === "wizards-record-of-advice" ? styles.subnavItemActive : ""}`.trim()}
                  >
                    Record of Advice
                  </Link>
                  <Link
                    href={`/clients/${encodeURIComponent(clientId)}?section=wizards-statement-of-advice`}
                    className={`${styles.subnavItem} ${section === "wizards-statement-of-advice" ? styles.subnavItemActive : ""}`.trim()}
                  >
                    Statement of Advice
                  </Link>
                </div>
              ) : null}
            </div>
          );
        }

        const href = resolveHref(clientId, item.key, item.href);
        const isActive = item.key === section;

        return (
          <Link key={item.label} href={href} className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`.trim()}>
            <span className={styles.navIcon}>{item.icon}</span>
            <span className={styles.navLabel}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
