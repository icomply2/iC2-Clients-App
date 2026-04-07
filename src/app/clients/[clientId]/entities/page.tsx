import { ClientWorkspace } from "../client-workspace";

type EntitiesPageProps = {
  params: Promise<{ clientId: string }>;
};

export default async function EntitiesPage({ params }: EntitiesPageProps) {
  const { clientId } = await params;

  return <ClientWorkspace clientId={clientId} section="entities" />;
}
