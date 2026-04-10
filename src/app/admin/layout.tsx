import { AppShell } from "@/components/app-shell";
import { AppTopbar } from "@/components/app-topbar";
import { AdminCentreShell } from "@/components/admin-centre-shell";
import { getAdminContext } from "@/lib/admin-data";
import styles from "./admin.module.css";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin } = await getAdminContext();

  if (!isAdmin) {
    return (
      <>
        <AppTopbar finleyHref="/finley" />
        <AppShell>
          <div className={styles.page}>
            <section className={styles.hero}>
              <div>
                <p className={styles.eyebrow}>Administration Centre</p>
                <h1 className={styles.title}>You do not have access to Administration Centre</h1>
                <p className={styles.description}>
                  Administration access is only available to users with the app admin flag enabled.
                </p>
              </div>
            </section>
          </div>
        </AppShell>
      </>
    );
  }

  return (
    <>
      <AppTopbar finleyHref="/finley" />
      <AppShell>
        <AdminCentreShell>{children}</AdminCentreShell>
      </AppShell>
    </>
  );
}
