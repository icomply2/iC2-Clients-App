"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { appNavItems } from "@/lib/navigation";
import styles from "./app-shell.module.css";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <p className={styles.eyebrow}>iC2 Clients</p>
          <h1 className={styles.title}>Advice CRM Workspace</h1>
          <p className={styles.subtitle}>
            A focused home for client records, letters, file notes, and adviser administration.
          </p>
        </div>

        <nav className={styles.nav} aria-label="Primary">
          {appNavItems.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""}`.trim()}
              >
                <span className={styles.navLabel}>{item.label}</span>
                <span className={styles.navDescription}>{item.description}</span>
              </Link>
            );
          })}
        </nav>

        <section className={styles.profileCard} aria-label="Current user">
          <p className={styles.profileName}>Adviser Workspace</p>
          <p className={styles.profileRole}>
            Initial shell for advisers, paraplanners, and support staff with role-aware access to follow.
          </p>
        </section>
      </aside>

      <main className={styles.content}>{children}</main>
    </div>
  );
}
