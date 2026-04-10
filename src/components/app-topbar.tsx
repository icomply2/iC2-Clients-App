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
          <span className={styles.homeIcon}>⌂</span>
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
          <span>Add New</span>
        </Link>
        <Link href={finleyHref} className={styles.topLink}>
          <Image src={finleyAvatar} alt="Finley avatar" className={styles.topbarAvatarImage} />
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
  );
}
