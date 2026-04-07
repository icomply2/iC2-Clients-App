import { ClientWorkspace } from "../../client-workspace";

type EngagementLetterPageProps = {
  params: Promise<{
    clientId: string;
  }>;
};

export default async function EngagementLetterPage({ params }: EngagementLetterPageProps) {
  const { clientId } = await params;

  return <ClientWorkspace clientId={clientId} section="wizards-engagement-letter" />;
}
