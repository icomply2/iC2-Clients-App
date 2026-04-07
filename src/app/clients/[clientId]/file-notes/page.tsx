import { ClientWorkspace } from "../client-workspace";

export default async function ClientFileNotesPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  return <ClientWorkspace clientId={clientId} section="file-notes" />;
}
