import { getUsers } from "@/lib/api/users";
import { isAppAdminValue } from "@/lib/app-admin";
import { readAuthTokenFromCookies, readCurrentUserFromCookies } from "@/lib/auth";
import {
  getDesktopBrokerEnvironmentLabel,
  isDesktopBrokerConfigured,
} from "@/app/api/integrations/desktop-broker/_shared";
import { readRexConnectionStateFromCookies } from "@/lib/rex-token";
import { ProfileAccount } from "./profile-account";

type ProfilePageProps = {
  searchParams?: Promise<{
    integration?: string;
    status?: string;
    message?: string;
  }>;
};

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const currentUser = await readCurrentUserFromCookies();
  const token = await readAuthTokenFromCookies();
  const rexConnection = await readRexConnectionStateFromCookies();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  let name = currentUser?.name ?? "Signed-in user";
  let email = currentUser?.email ?? "";
  let role = "Not available yet";
  let status = "Unknown";
  let appAccess = "Not available yet";
  let appAdminValue = "";
  let isAppAdmin = false;
  let userId = currentUser?.id ?? "";
  let practiceName = "";
  const practiceAbn = "";
  let licenseeName = "";
  let complianceManagerName = "";

  if (token) {
    try {
      const usersResult = await getUsers(token);
      const matchedUser =
        usersResult.data?.find((user) => {
          const idMatches = currentUser?.id && user.id && currentUser.id === user.id;
          const emailMatches =
            currentUser?.email &&
            user.email &&
            currentUser.email.toLowerCase() === user.email.toLowerCase();

          return idMatches || emailMatches;
        }) ?? null;

      if (matchedUser) {
        userId = matchedUser.id ?? userId;
        name = matchedUser.name ?? name;
        email = matchedUser.email ?? email;
        role = matchedUser.userRole ?? role;
        status = matchedUser.userStatus ?? status;
        appAccess = matchedUser.appAccess ?? appAccess;
        appAdminValue = matchedUser.appAdmin == null ? "" : String(matchedUser.appAdmin);
        isAppAdmin = isAppAdminValue(matchedUser.appAdmin);
        practiceName = matchedUser.practice?.name ?? practiceName;
        licenseeName = matchedUser.licensee?.name ?? licenseeName;
        complianceManagerName = matchedUser.complianceManager?.name ?? complianceManagerName;
      }
    } catch {
      // Fall back to the signed-in session details if the user list call is unavailable.
    }
  }

  return (
    <ProfileAccount
      userId={userId}
      name={name}
      email={email}
      role={role}
      status={status}
      appAccess={appAccess}
      appAdminValue={appAdminValue}
      isAppAdmin={isAppAdmin}
      practiceName={practiceName}
      practiceAbn={practiceAbn}
      licenseeName={licenseeName}
      complianceManagerName={complianceManagerName}
      rexConnected={rexConnection.connected}
      rexExpiresAt={rexConnection.expiresAt}
      desktopBrokerConfigured={isDesktopBrokerConfigured()}
      desktopBrokerEnvironment={getDesktopBrokerEnvironmentLabel()}
      integrationStatus={resolvedSearchParams?.integration === "productrex" ? resolvedSearchParams.status ?? null : null}
      integrationMessage={
        resolvedSearchParams?.integration === "productrex" ? resolvedSearchParams.message ?? null : null
      }
    />
  );
}
