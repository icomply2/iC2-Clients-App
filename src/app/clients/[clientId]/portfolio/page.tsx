import { ClientWorkspace } from "../client-workspace";

type PortfolioPageProps = {
  params: Promise<{ clientId: string }>;
};

export default async function PortfolioPage({ params }: PortfolioPageProps) {
  const { clientId } = await params;

  return <ClientWorkspace clientId={clientId} section="portfolio" />;
}
