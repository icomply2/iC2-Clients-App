"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { UserInitialsAvatar } from "@/components/user-initials-avatar";
import finleyAvatar from "@/app/finley/finley-avatar.png";
import styles from "./app-topbar.module.css";

type AppTopbarProps = {
  finleyHref?: string;
};

export function AppTopbar({ finleyHref = "/finley" }: AppTopbarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const addNewHref = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("createClient", "1");
    params.delete("clientId");
    return `/clients?${params.toString()}`;
  }, [searchParams]);

  return (
    <header className={styles.topbar}>
      <div className={styles.topbarLeft}>
        <Link href="/clients" className={styles.homeButton} aria-label="Go to client search">
          <svg className={styles.homeIcon} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4.5 10.9 12 4.75l7.5 6.15v8.35a1 1 0 0 1-1 1h-4.25v-5.5h-4.5v5.5H5.5a1 1 0 0 1-1-1V10.9Z" />
          </svg>
        </Link>
        <span className={styles.pageName}>Finley</span>
      </div>

      <div className={styles.topbarRight}>
        <Link
          href={pathname === "/clients" ? addNewHref : "/clients?createClient=1"}
          className={styles.topLink}
          aria-label="Add new client"
        >
          <span className={styles.icon}>+</span>
          <span className={styles.topLabel}>Add New</span>
        </Link>
        <Link href={finleyHref} className={styles.topLink}>
          <Image src={finleyAvatar} alt="Finley avatar" className={styles.topbarAvatarImage} />
          <span className={styles.topLabel}>Finley</span>
        </Link>
        <Link href="/profile" className={styles.topLink}>
          <UserInitialsAvatar className={styles.avatar} />
          <span className={styles.topLabel}>Me</span>
        </Link>
        <Link href="/" className={styles.topLink}>
          <span className={styles.icon}>→</span>
          <span className={styles.topLabel}>Sign Out</span>
        </Link>
      </div>
    </header>
  );
}
