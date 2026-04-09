import { ClientWorkspace } from "../../client-workspace";

type RecordOfAdvicePageProps = {
  params: Promise<{
    clientId: string;
  }>;
};

export default async function RecordOfAdvicePage({ params }: RecordOfAdvicePageProps) {
  const { clientId } = await params;

  return <ClientWorkspace clientId={clientId} section="wizards-record-of-advice" />;
}
