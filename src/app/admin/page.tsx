import Link from "next/link";
import styles from "./admin.module.css";
import {
  getAdminContext,
  loadAdminLicensees,
  loadAdminPractices,
  loadAdminUsers,
  summarizeLicensees,
  summarizePractices,
} from "@/lib/admin-data";

export default async function AdminPage() {
  const { token } = await getAdminContext();
  const users = await loadAdminUsers(token);
  const [licenseeRecords, practiceRecords] = await Promise.all([
    loadAdminLicensees(token),
    loadAdminPractices(token),
  ]);
  const practices = summarizePractices(practiceRecords, users);
  const licensees = summarizeLicensees(licenseeRecords, practices, users);

  const appAdminCount = users.filter((user) => user.adminEnabled).length;
  const liveIntegrationCount = [process.env.DOCMOSIS_ACCESS_KEY, process.env.DOCMOSIS_API_URL].every(Boolean) ? 2 : 1;

  return (
    <>
      <section className={styles.overviewGrid}>
        <article className={styles.metricCard}>
          <span className={styles.metricLabel}>Users</span>
          <strong className={styles.metricValue}>{users.length}</strong>
          <span className={styles.metricText}>Live user records available to administer.</span>
        </article>
        <article className={styles.metricCard}>
          <span className={styles.metricLabel}>Practices</span>
          <strong className={styles.metricValue}>{practices.length}</strong>
          <span className={styles.metricText}>Derived from the real user hierarchy already in the app.</span>
        </article>
        <article className={styles.metricCard}>
          <span className={styles.metricLabel}>Licensees</span>
          <strong className={styles.metricValue}>{licensees.length}</strong>
          <span className={styles.metricText}>Current operating groups visible through user ownership.</span>
        </article>
        <article className={styles.metricCard}>
          <span className={styles.metricLabel}>App Admins</span>
          <strong className={styles.metricValue}>{appAdminCount}</strong>
          <span className={styles.metricText}>Users currently trusted with Administration Centre access.</span>
        </article>
      </section>

      <section className={styles.contentCard}>
        <div className={styles.contentCardHeader}>
          <div>
            <h2 className={styles.cardTitle}>What this first release covers</h2>
            <p className={styles.cardText}>
              The Administration Centre now has real working sections for users, practices, licensees, and
              integrations. Users are live-backed today, while the org hierarchy is safely derived from the same
              source until dedicated CRUD endpoints are introduced.
            </p>
          </div>

          <span className={styles.badge}>{liveIntegrationCount} live integrations</span>
        </div>

        <div className={styles.overviewGrid}>
          <article className={styles.contentCard}>
            <h3 className={styles.cardTitle}>Users</h3>
            <p className={styles.cardText}>
              Review roles, status, access levels, and which users have app admin enabled.
            </p>
            <Link href="/admin/users" className={styles.secondaryButton}>
              Open Users
            </Link>
          </article>

          <article className={styles.contentCard}>
            <h3 className={styles.cardTitle}>Practices</h3>
            <p className={styles.cardText}>
              Understand how advisers and app admins are distributed across each practice.
            </p>
            <Link href="/admin/practices" className={styles.secondaryButton}>
              Open Practices
            </Link>
          </article>

          <article className={styles.contentCard}>
            <h3 className={styles.cardTitle}>Licensees</h3>
            <p className={styles.cardText}>
              Review the current licensee structure and how many practices roll up underneath each one.
            </p>
            <Link href="/admin/licensees" className={styles.secondaryButton}>
              Open Licensees
            </Link>
          </article>

          <article className={styles.contentCard}>
            <h3 className={styles.cardTitle}>Integrations</h3>
            <p className={styles.cardText}>
              Keep ProductRex, Docmosis, Desktop Broker, and HUB24 visible in one operational view.
            </p>
            <Link href="/admin/integrations" className={styles.secondaryButton}>
              Open Integrations
            </Link>
          </article>

          <article className={styles.contentCard}>
            <h3 className={styles.cardTitle}>Templates</h3>
            <p className={styles.cardText}>
              Manage Docmosis template names, document coverage, and rollout readiness by document type.
            </p>
            <Link href="/admin/templates" className={styles.secondaryButton}>
              Open Templates
            </Link>
          </article>
        </div>
      </section>
    </>
  );
}
