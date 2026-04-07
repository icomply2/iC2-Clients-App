import { ClientWorkspace } from "../../client-workspace";

type FactFindPageProps = {
  params: Promise<{ clientId: string }>;
};

export default async function FactFindPage({ params }: FactFindPageProps) {
  const { clientId } = await params;

  return <ClientWorkspace clientId={clientId} section="wizards-fact-find" />;
}
