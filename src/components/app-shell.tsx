"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { adminNavItems, appNavItems } from "@/lib/navigation";
import { isAppAdminValue } from "@/lib/app-admin";
import { useCurrentUserScope } from "@/hooks/use-current-user-scope";
import styles from "./app-shell.module.css";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const { data } = useCurrentUserScope();
  const appAdmin = isAppAdminValue(data?.appAdmin);
  const inAdminCentre = pathname?.startsWith("/admin") ?? false;

  const visibleNavItems = useMemo(
    () =>
      inAdminCentre
        ? adminNavItems
        : appNavItems.filter((item) => item.href !== "/admin" || appAdmin),
    [appAdmin, inAdminCentre],
  );

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        {!inAdminCentre ? (
          <div className={styles.brand}>
            <p className={styles.eyebrow}>iC2 Clients</p>
            <h1 className={styles.title}>Advice CRM Workspace</h1>
            <p className={styles.subtitle}>
              A focused home for client records, letters, file notes, and adviser administration.
            </p>
          </div>
        ) : null}

        <nav className={styles.nav} aria-label="Primary">
          {visibleNavItems.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""}`.trim()}
              >
                <span className={styles.navLabel}>{item.label}</span>
                {!inAdminCentre ? <span className={styles.navDescription}>{item.description}</span> : null}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className={styles.content}>{children}</main>
    </div>
  );
}
