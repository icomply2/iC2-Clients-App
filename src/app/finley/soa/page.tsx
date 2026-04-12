import { AppTopbar } from "@/components/app-topbar";
import { FinleySoaConsole } from "./finley-soa-console";
import finleyPageStyles from "../page.module.css";

type FinleySoaPageProps = {
  searchParams?: Promise<{
    clientId?: string;
    soaId?: string;
  }>;
};

export default async function FinleySoaPage({ searchParams }: FinleySoaPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};

  return (
    <div className={finleyPageStyles.page}>
      <AppTopbar finleyHref="/finley/soa" />
      <FinleySoaConsole initialClientId={resolvedSearchParams.clientId} initialSoaId={resolvedSearchParams.soaId} />
    </div>
  );
}
