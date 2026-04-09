import Link from "next/link";
import { AppTopbar } from "@/components/app-topbar";
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

function decodeJwtPayload(token: string) {
  const parts = token.split(".");

  if (parts.length < 2) {
    return null;
  }

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = Buffer.from(padded, "base64").toString("utf8");

    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readStringClaim(payload: Record<string, unknown>, claimNames: string[]) {
  for (const claimName of claimNames) {
    const value = payload[claimName];

    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}

async function resolveCurrentUserPracticeName(token: string) {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!apiBaseUrl) {
    return null;
  }

  const payload = decodeJwtPayload(token);
  const currentUserId = payload
    ? readStringClaim(payload, [
        "nameid",
        "sub",
        "uid",
        "userId",
        "id",
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier",
      ])
    : null;
  const currentEmail = payload
    ? readStringClaim(payload, [
        "email",
        "unique_name",
        "upn",
        "preferred_username",
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
      ])
    : null;

  const response = await fetch(new URL("/api/Users", apiBaseUrl), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as
    | {
        data?: Array<{
          id?: string | null;
          email?: string | null;
          practice?: { name?: string | null } | null;
        }> | null;
      }
    | null;

  if (!response.ok) {
    return null;
  }

  const matchedUser =
    body?.data?.find((user) => currentUserId && user.id && user.id === currentUserId) ??
    body?.data?.find(
      (user) =>
        currentEmail &&
        user.email &&
        currentEmail.trim().toLowerCase() === user.email.trim().toLowerCase(),
    ) ??
    null;

  return matchedUser?.practice?.name?.trim() ?? null;
}

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
        forbidden: false,
      };
    }

    const currentUserPracticeName = await resolveCurrentUserPracticeName(token);

    try {
      const directProfileResult = await getClientProfile(clientId, token);

      if (
        currentUserPracticeName &&
        directProfileResult.data?.practice?.trim().toLowerCase() !== currentUserPracticeName.trim().toLowerCase()
      ) {
        return {
          profile: mockClientProfile,
          sourceMessage: "You can only view clients from your own practice.",
          useMockFallback: false,
          forbidden: true,
        };
      }

      return {
        profile: directProfileResult.data ?? mockClientProfile,
        sourceMessage: "Loaded live client profile data from the API.",
        useMockFallback: false,
        forbidden: false,
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
        forbidden: false,
      };
    }

    const profileResult = await getClientProfile(resolvedProfileId, token);

    if (
      currentUserPracticeName &&
      profileResult.data?.practice?.trim().toLowerCase() !== currentUserPracticeName.trim().toLowerCase()
    ) {
      return {
        profile: mockClientProfile,
        sourceMessage: "You can only view clients from your own practice.",
        useMockFallback: false,
        forbidden: true,
      };
    }

    return {
      profile: profileResult.data ?? mockClientProfile,
      sourceMessage: "Loaded live client profile data from the API.",
      useMockFallback: false,
      forbidden: false,
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
      forbidden: false,
    };
  }
}

export async function ClientWorkspace({ clientId, section }: ClientWorkspaceProps) {
  const { profile, sourceMessage, useMockFallback, forbidden } = await loadClientProfile(clientId);

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
          <AppTopbar finleyHref={`/finley?clientId=${encodeURIComponent(clientId)}`} />

          <main className={styles.content}>
            <p className={styles.dataNotice}>{sourceMessage}</p>
            {forbidden ? (
              <div className={styles.emptyStateCard}>This client is outside your practice scope.</div>
            ) : section === "details" ? (
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
