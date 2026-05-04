import { getUsers } from "@/lib/api/users";
import { isAppAdminValue } from "@/lib/app-admin";
import { readAuthTokenFromCookies, readCurrentUserFromCookies } from "@/lib/auth";
import {
  getDesktopBrokerEnvironmentLabel,
  isDesktopBrokerConfigured,
} from "@/app/api/integrations/desktop-broker/_shared";
import { readRexConnectionStateFromCookies } from "@/lib/rex-token";
import { readUserProfileOverride } from "@/lib/user-profile-overrides-store";
import { mergeUserSummaryOverride } from "@/lib/user-profile-overrides-shared";
import {
  DEFAULT_DOCUMENT_STYLE_PROFILE,
  normalizeDocumentStyleProfile,
} from "@/lib/documents/document-style-profile";
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
  let dateOfBirth = "";
  let phoneNumber = "";
  let officeNumber = "";
  let occupation = "";
  let adviserExperience = "";
  let businessName = "";
  let acn = "";
  let abn = "";
  let asicNumber = "";
  let website = "";
  let xplanSite = "";
  let street = "";
  let suburb = "";
  let state = "";
  let postCode = "";
  let country = "";
  let profilePhoto = "";
  let practiceLogo = "";
  let practiceLetterHead = "";
  let documentStyleProfile = DEFAULT_DOCUMENT_STYLE_PROFILE;

  if (token) {
    try {
      const usersResult = await getUsers(token);
      const apiMatchedUser =
        usersResult.data?.find((user) => {
          const idMatches = currentUser?.id && user.id && currentUser.id === user.id;
          const emailMatches =
            currentUser?.email &&
            user.email &&
            currentUser.email.toLowerCase() === user.email.toLowerCase();

          return idMatches || emailMatches;
        }) ?? null;
      const profileOverride = apiMatchedUser?.id ? await readUserProfileOverride(apiMatchedUser.id) : null;
      const matchedUser = apiMatchedUser?.id
        ? mergeUserSummaryOverride(apiMatchedUser, profileOverride)
        : apiMatchedUser;

      if (matchedUser) {
        documentStyleProfile = normalizeDocumentStyleProfile(profileOverride?.documentStyleProfile);
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
        dateOfBirth = matchedUser.dateOfBirth ?? dateOfBirth;
        phoneNumber = matchedUser.phoneNumber ?? phoneNumber;
        officeNumber = matchedUser.officeNumber ?? officeNumber;
        occupation = matchedUser.occupation ?? occupation;
        adviserExperience = matchedUser.adviserExperience ?? adviserExperience;
        businessName = matchedUser.businessName ?? businessName;
        acn = matchedUser.acn ?? acn;
        abn = matchedUser.abn ?? abn;
        asicNumber = matchedUser.asicNumber ?? asicNumber;
        website = matchedUser.website ?? website;
        xplanSite = matchedUser.xplanSite ?? xplanSite;
        street = matchedUser.address?.street ?? street;
        suburb = matchedUser.address?.suburb ?? matchedUser.address?.city ?? suburb;
        state = matchedUser.address?.state ?? matchedUser.address?.region ?? state;
        postCode = matchedUser.address?.postCode ?? matchedUser.address?.postalCode ?? postCode;
        country = matchedUser.address?.country ?? country;
        profilePhoto = matchedUser.profilePhoto ?? profilePhoto;
        practiceLogo = matchedUser.practiceLogo ?? practiceLogo;
        practiceLetterHead = matchedUser.practiceLetterHead ?? practiceLetterHead;
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
      dateOfBirth={dateOfBirth}
      phoneNumber={phoneNumber}
      officeNumber={officeNumber}
      occupation={occupation}
      adviserExperience={adviserExperience}
      businessName={businessName}
      acn={acn}
      abn={abn}
      asicNumber={asicNumber}
      website={website}
      xplanSite={xplanSite}
      street={street}
      suburb={suburb}
      state={state}
      postCode={postCode}
      country={country}
      profilePhoto={profilePhoto}
      practiceLogo={practiceLogo}
      practiceLetterHead={practiceLetterHead}
      documentStyleProfile={documentStyleProfile}
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
