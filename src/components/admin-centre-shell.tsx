import styles from "@/app/admin/admin.module.css";

type AdminCentreShellProps = {
  children: React.ReactNode;
};

export function AdminCentreShell({ children }: AdminCentreShellProps) {
  return (
    <div className={styles.page}>
      <section className={styles.headerBar}>
        <span className={styles.headerTitle}>Administration Centre</span>
      </section>

      <div className={styles.main}>{children}</div>
    </div>
  );
}
