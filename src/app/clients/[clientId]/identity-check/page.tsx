import { ClientWorkspace } from "../client-workspace";

type IdentityCheckPageProps = {
  params: Promise<{ clientId: string }>;
};

export default async function IdentityCheckPage({ params }: IdentityCheckPageProps) {
  const { clientId } = await params;

  return <ClientWorkspace clientId={clientId} section="identity-check" />;
}
