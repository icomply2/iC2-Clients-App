import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { dashboardMetrics, sampleClients, workQueue } from "@/lib/navigation";
import styles from "../page.module.css";

export default function DashboardPage() {
  return (
    <AppShell>
      <div className={styles.page}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>V1 foundation</p>
          <h2 className={styles.heroTitle}>Client work should feel calm, fast, and obvious.</h2>
          <p className={styles.heroText}>
            This first build focuses on the day-to-day workflows you called out: client creation,
            client record updates, file notes, document storage, and basic letter generation. We can
            keep the familiar Bubble-era layout while improving structure underneath.
          </p>
          <div className={styles.actions}>
            <Link href="/clients/new" className={styles.actionPrimary}>
              Create new client
            </Link>
            <Link href="/clients" className={styles.actionSecondary}>
              Open client list
            </Link>
          </div>
        </section>

        <div className={styles.metrics}>
          {dashboardMetrics.map((metric) => (
            <SectionCard key={metric.label}>
              <p className={styles.metricValue}>{metric.value}</p>
              <p className={styles.metricLabel}>{metric.label}</p>
              <p className={styles.metricDetail}>{metric.detail}</p>
            </SectionCard>
          ))}
        </div>

        <div className={styles.twoColumn}>
          <SectionCard>
            <h3 className={styles.sectionTitle}>Current work queue</h3>
            <div className={styles.queueList}>
              {workQueue.map((item) => (
                <Link key={item.title} href={item.href} className={styles.queueItem}>
                  <div className={styles.queueTop}>
                    <h4 className={styles.queueTitle}>{item.title}</h4>
                    <span className={styles.status}>{item.status}</span>
                  </div>
                  <p className={styles.queueSummary}>{item.summary}</p>
                </Link>
              ))}
            </div>
          </SectionCard>

          <SectionCard>
            <h3 className={styles.sectionTitle}>Recent clients</h3>
            <div className={styles.clientList}>
              {sampleClients.map((client) => (
                <Link key={client.id} href={`/clients/${client.id}`} className={styles.clientItem}>
                  <div className={styles.clientTop}>
                    <h4 className={styles.clientName}>{client.name}</h4>
                    <span className={styles.status}>{client.status}</span>
                  </div>
                  <p className={styles.clientMeta}>
                    {client.adviser} · {client.practice}
                  </p>
                  <p className={styles.clientUpdated}>{client.updatedAt}</p>
                </Link>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
