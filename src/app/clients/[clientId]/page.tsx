import { ClientWorkspace } from "./client-workspace";
import type { SectionKey } from "./client-workspace";

type ClientWorkspacePageProps = {
  params: Promise<{ clientId: string }>;
  searchParams?: Promise<{ section?: string }>;
};

const supportedSections = new Set<SectionKey>([
  "details",
  "identity-check",
  "entities",
  "dependents",
  "file-notes",
  "wizards",
  "wizards-fact-find",
  "wizards-engagement-letter",
  "wizards-record-of-advice",
  "wizards-statement-of-advice",
  "assets",
  "liabilities",
  "income",
  "expenses",
  "superannuation",
  "retirement-income",
  "insurance",
  "portfolio",
]);

function resolveSection(value?: string): SectionKey {
  return value && supportedSections.has(value as SectionKey) ? (value as SectionKey) : "details";
}

export default async function ClientWorkspacePage({ params, searchParams }: ClientWorkspacePageProps) {
  const { clientId } = await params;
  const section = resolveSection((await searchParams)?.section);

  return <ClientWorkspace clientId={clientId} section={section} />;
}
