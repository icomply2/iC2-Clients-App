import { ClientWorkspace } from "../client-workspace";

export default async function ExpensesPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  return <ClientWorkspace clientId={clientId} section="expenses" />;
}
