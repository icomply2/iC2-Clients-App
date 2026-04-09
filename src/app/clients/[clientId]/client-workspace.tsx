import Link from "next/link";
import { UserInitialsAvatar } from "@/components/user-initials-avatar";
import { ApiError } from "@/lib/api/client";
import { getClientProfile, getClientProfileId } from "@/lib/api/clients";
import { readAuthTokenFromCookies } from "@/lib/auth";
import { mockClientProfile } from "@/lib/client-mocks";
import { FinancialRecordsSection } from "./financial-records-section";
import { ClientDetailsSection } from "./client-details-section";
import { DependentSection } from "./dependent-section";
import { AssetsSection } from "./assets-section";
import { EntitiesSection } from "./entities-section";
import { EngagementLetterSection } from "./engagement-letter-section";
import { FileNotesSection } from "./file-notes-section";
import { FactFindSection } from "./fact-find-section";
import { IdentityCheckSection } from "./identity-check-section";
import { InsuranceSection } from "./insurance-section";
import { PortfolioSection } from "./portfolio-section";
import { RecordOfAdviceSection } from "./record-of-advice-section";
import { StatementOfAdviceSection } from "./statement-of-advice-section";
import { WorkspaceSidebar } from "./workspace-sidebar";
import { WizardsSection } from "./wizards-section";
import styles from "./page.module.css";

type SectionKey =
  | "details"
  | "identity-check"
  | "entities"
  | "dependents"
  | "file-notes"
  | "wizards"
  | "wizards-fact-find"
  | "wizards-engagement-letter"
  | "wizards-record-of-advice"
  | "wizards-statement-of-advice"
  | "assets"
  | "liabilities"
  | "income"
  | "expenses"
  | "superannuation"
  | "retirement-income"
  | "insurance"
  | "portfolio";

type ClientWorkspaceProps = {
  clientId: string;
  section: SectionKey;
};

async function loadClientProfile(clientId: string) {
  if (!process.env.NEXT_PUBLIC_API_BASE_URL) {
    return {
      profile: mockClientProfile,
      sourceMessage: "Showing sample client profile data.",
      useMockFallback: true,
    };
  }

  try {
    const token = await readAuthTokenFromCookies();

    if (!token) {
      return {
        profile: mockClientProfile,
        sourceMessage: "Not signed in yet. Showing sample client profile data.",
        useMockFallback: true,
      };
    }

    try {
      const directProfileResult = await getClientProfile(clientId, token);

      return {
        profile: directProfileResult.data ?? mockClientProfile,
        sourceMessage: "Loaded live client profile data from the API.",
        useMockFallback: false,
      };
    } catch (directError) {
      if (!(directError instanceof ApiError) || directError.statusCode !== 404) {
        throw directError;
      }
    }

    const profileIdResult = await getClientProfileId(clientId, token);
    const resolvedProfileId = profileIdResult.data;

    if (!resolvedProfileId) {
      return {
        profile: mockClientProfile,
        sourceMessage: "Profile lookup returned no match. Showing sample data.",
        useMockFallback: true,
      };
    }

    const profileResult = await getClientProfile(resolvedProfileId, token);

    return {
      profile: profileResult.data ?? mockClientProfile,
      sourceMessage: "Loaded live client profile data from the API.",
      useMockFallback: false,
    };
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Live client profile failed (${error.statusCode}): ${error.message}. Showing sample data.`
        : error instanceof Error
          ? `Live client profile failed: ${error.message}. Showing sample data.`
          : "Unable to load the live client profile yet. Showing sample data.";

    return {
      profile: mockClientProfile,
      sourceMessage: message,
      useMockFallback: true,
    };
  }
}

export async function ClientWorkspace({ clientId, section }: ClientWorkspaceProps) {
  const { profile, sourceMessage, useMockFallback } = await loadClientProfile(clientId);

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarTop}>
            <Link href="/clients" className={styles.backLink}>
              «
            </Link>
          </div>
          <WorkspaceSidebar clientId={clientId} section={section} />
        </aside>

        <div className={styles.main}>
          <header className={styles.topbar}>
            <div className={styles.topbarLeft}>
              <button type="button" className={styles.gridButton} aria-label="App menu">
                {Array.from({ length: 9 }).map((_, index) => (
                  <span key={index} className={styles.gridDot} />
                ))}
              </button>
              <Link href="/admin" className={styles.inviteButton}>
                + Invite New User
              </Link>
              <span className={styles.pageName}>Clients</span>
            </div>

            <div className={styles.topbarRight}>
              <Link href={`/finley?clientId=${encodeURIComponent(clientId)}`} className={styles.topLink}>
                <span className={styles.icon}>F</span>
                <span>Finley</span>
              </Link>
              <Link href="/profile" className={styles.topLink}>
                <UserInitialsAvatar className={styles.avatar} />
                <span>Me</span>
              </Link>
              <Link href="/" className={styles.topLink}>
                <span className={styles.icon}>→</span>
                <span>Sign Out</span>
              </Link>
            </div>
          </header>

          <main className={styles.content}>
            <p className={styles.dataNotice}>{sourceMessage}</p>
            {section === "details" ? (
              <ClientDetailsSection profile={profile} useMockFallback={useMockFallback} />
            ) : section === "identity-check" ? (
              <IdentityCheckSection />
            ) : section === "file-notes" ? (
              <FileNotesSection profile={profile} useMockFallback={useMockFallback} />
            ) : section === "wizards" ? (
              <WizardsSection clientId={clientId} profile={profile} useMockFallback={useMockFallback} />
            ) : section === "wizards-fact-find" ? (
              <FactFindSection clientId={clientId} profile={profile} />
            ) : section === "wizards-engagement-letter" ? (
              <EngagementLetterSection clientId={clientId} profile={profile} />
            ) : section === "wizards-record-of-advice" ? (
              <RecordOfAdviceSection clientId={clientId} />
            ) : section === "wizards-statement-of-advice" ? (
              <StatementOfAdviceSection clientId={clientId} />
            ) : section === "dependents" ? (
              <DependentSection profile={profile} useMockFallback={useMockFallback} />
            ) : section === "assets" ? (
              <AssetsSection profile={profile} useMockFallback={useMockFallback} />
            ) : section === "insurance" ? (
              <InsuranceSection profile={profile} useMockFallback={useMockFallback} />
            ) : section === "portfolio" ? (
              <PortfolioSection />
            ) : section === "liabilities" ||
              section === "income" ||
              section === "expenses" ||
              section === "superannuation" ||
              section === "retirement-income" ? (
              <FinancialRecordsSection profile={profile} kind={section} useMockFallback={useMockFallback} />
            ) : (
              <EntitiesSection profile={profile} useMockFallback={useMockFallback} />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
