import Link from "next/link";
import { UserInitialsAvatar } from "@/components/user-initials-avatar";
import { FinleyConsole } from "./finley-console";
import styles from "./page.module.css";

type FinleyPageProps = {
  searchParams?: Promise<{
    clientId?: string;
  }>;
};

export default async function FinleyPage({ searchParams }: FinleyPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <button type="button" className={styles.gridButton} aria-label="App menu">
            {Array.from({ length: 9 }).map((_, index) => (
              <span key={index} className={styles.gridDot} />
            ))}
          </button>
          <Link href="/admin" className={styles.inviteButton}>
            + Invite New User
          </Link>
          <span className={styles.pageName}>Finley</span>
        </div>

        <div className={styles.topbarRight}>
          <Link href="/finley" className={styles.topLink} aria-current="page">
            <span className={styles.icon}>F</span>
            <span>Finley</span>
          </Link>
          <Link href="/profile" className={styles.topLink}>
            <UserInitialsAvatar className={styles.avatar} />
            <span>Me</span>
          </Link>
          <Link href="/" className={styles.topLink}>
            <span className={styles.icon}>→</span>
            <span>Sign Out</span>
          </Link>
        </div>
      </header>

      <FinleyConsole initialClientId={resolvedSearchParams.clientId} />
    </div>
  );
}
