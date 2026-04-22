import { ClientWorkspace } from "../../client-workspace";

type StatementOfAdvicePageProps = {
  params: Promise<{
    clientId: string;
  }>;
};

export default async function StatementOfAdvicePage({ params }: StatementOfAdvicePageProps) {
  const { clientId } = await params;

  return <ClientWorkspace clientId={clientId} section="wizards-statement-of-advice" />;
}
