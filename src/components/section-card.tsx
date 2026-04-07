import styles from "./section-card.module.css";

type SectionCardProps = {
  children: React.ReactNode;
  className?: string;
};

export function SectionCard({ children, className }: SectionCardProps) {
  return <section className={[styles.card, className].filter(Boolean).join(" ")}>{children}</section>;
}
