import { AppShell } from "./app-shell";
import { SectionCard } from "./section-card";
import styles from "@/app/section-page.module.css";

type SectionPageProps = {
  title: string;
  description: string;
  items: { title: string; text: string }[];
};

export function SectionPage({ title, description, items }: SectionPageProps) {
  return (
    <AppShell>
      <div className={styles.page}>
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.description}>{description}</p>
        </header>

        <div className={styles.grid}>
          {items.map((item) => (
            <SectionCard key={item.title}>
              <h3 className={styles.itemTitle}>{item.title}</h3>
              <p className={styles.itemText}>{item.text}</p>
            </SectionCard>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
