import { ClientWorkspace } from "../client-workspace";

type DependentsPageProps = {
  params: Promise<{ clientId: string }>;
};

export default async function DependentsPage({ params }: DependentsPageProps) {
  const { clientId } = await params;

  return <ClientWorkspace clientId={clientId} section="dependents" />;
}
