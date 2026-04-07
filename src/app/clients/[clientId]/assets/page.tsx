import { ClientWorkspace } from "../client-workspace";

type AssetsPageProps = {
  params: Promise<{ clientId: string }>;
};

export default async function AssetsPage({ params }: AssetsPageProps) {
  const { clientId } = await params;

  return <ClientWorkspace clientId={clientId} section="assets" />;
}
