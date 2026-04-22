import { AppTopbar } from "@/components/app-topbar";
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
      <AppTopbar finleyHref="/finley" />
      <FinleyConsole initialClientId={resolvedSearchParams.clientId} />
    </div>
  );
}
