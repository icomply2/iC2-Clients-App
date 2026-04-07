import { ClientWorkspace } from "./client-workspace";

type ClientWorkspacePageProps = {
  params: Promise<{ clientId: string }>;
};

export default async function ClientWorkspacePage({ params }: ClientWorkspacePageProps) {
  const { clientId } = await params;

  return <ClientWorkspace clientId={clientId} section="details" />;
}
