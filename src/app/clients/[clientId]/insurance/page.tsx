import { ClientWorkspace } from "../client-workspace";

export default async function InsurancePage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  return <ClientWorkspace clientId={clientId} section="insurance" />;
}
