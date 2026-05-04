import type { ApiAddress, ClientProfile, UserSummary } from "@/lib/api/types";
import type { DocumentStyleProfile } from "@/lib/documents/document-style-profile";

export type UserProfileOverride = {
  name?: string | null;
  email?: string | null;
  dateOfBirth?: string | null;
  address?: ApiAddress | null;
  acn?: string | null;
  abn?: string | null;
  asicNumber?: string | null;
  occupation?: string | null;
  adviserExperience?: string | null;
  businessName?: string | null;
  profilePhoto?: string | null;
  practiceLetterHead?: string | null;
  practiceLogo?: string | null;
  phoneNumber?: string | null;
  officeNumber?: string | null;
  website?: string | null;
  xplanSite?: string | null;
  practiceName?: string | null;
  licenseeName?: string | null;
  complianceManagerName?: string | null;
  documentStyleProfile?: Partial<DocumentStyleProfile> | null;
};

function preferOverride<T>(overrideValue: T | null | undefined, sourceValue: T | null | undefined) {
  if (typeof overrideValue === "string") {
    return overrideValue.trim() ? overrideValue : sourceValue;
  }

  return overrideValue ?? sourceValue;
}

export function mergeUserSummaryOverride(user: UserSummary, override?: UserProfileOverride | null): UserSummary {
  if (!override) {
    return user;
  }

  return {
    ...user,
    name: preferOverride(override.name, user.name),
    email: preferOverride(override.email, user.email),
    dateOfBirth: preferOverride(override.dateOfBirth, user.dateOfBirth),
    address: override.address ?? user.address,
    acn: preferOverride(override.acn, user.acn),
    abn: preferOverride(override.abn, user.abn),
    asicNumber: preferOverride(override.asicNumber, user.asicNumber),
    occupation: preferOverride(override.occupation, user.occupation),
    adviserExperience: preferOverride(override.adviserExperience, user.adviserExperience),
    businessName: preferOverride(override.businessName, user.businessName),
    profilePhoto: preferOverride(override.profilePhoto, user.profilePhoto),
    practiceLetterHead: preferOverride(override.practiceLetterHead, user.practiceLetterHead),
    practiceLogo: preferOverride(override.practiceLogo, user.practiceLogo),
    phoneNumber: preferOverride(override.phoneNumber, user.phoneNumber),
    officeNumber: preferOverride(override.officeNumber, user.officeNumber),
    website: preferOverride(override.website, user.website),
    xplanSite: preferOverride(override.xplanSite, user.xplanSite),
    practice: override.practiceName?.trim()
      ? { id: user.practice?.id ?? null, name: override.practiceName }
      : user.practice,
    licensee: override.licenseeName?.trim()
      ? { id: user.licensee?.id ?? null, name: override.licenseeName }
      : user.licensee,
    complianceManager: override.complianceManagerName?.trim()
      ? {
          id: user.complianceManager?.id ?? null,
          name: override.complianceManagerName,
          email: user.complianceManager?.email ?? null,
        }
      : user.complianceManager,
  };
}

export function mergeClientProfileAdviserOverride(profile: ClientProfile, override?: UserProfileOverride | null): ClientProfile {
  if (!override) {
    return profile;
  }

  return {
    ...profile,
    adviser: {
      ...profile.adviser,
      name: preferOverride(override.name, profile.adviser?.name),
      email: preferOverride(override.email, profile.adviser?.email),
      address: override.address ?? profile.adviser?.address ?? null,
      abn: preferOverride(override.abn, profile.adviser?.abn),
      acn: preferOverride(override.acn, profile.adviser?.acn),
      asicNumber: preferOverride(override.asicNumber, profile.adviser?.asicNumber),
      businessName: preferOverride(override.businessName, profile.adviser?.businessName),
      phoneNumber: preferOverride(override.phoneNumber, profile.adviser?.phoneNumber),
      officeNumber: preferOverride(override.officeNumber, profile.adviser?.officeNumber),
      profilePhoto: preferOverride(override.profilePhoto, profile.adviser?.profilePhoto),
      practiceLogo: preferOverride(override.practiceLogo, profile.adviser?.practiceLogo),
      practice: override.practiceName?.trim()
        ? { id: profile.adviser?.practice?.id ?? null, name: override.practiceName }
        : profile.adviser?.practice ?? null,
      licensee: override.licenseeName?.trim()
        ? { id: profile.adviser?.licensee?.id ?? null, name: override.licenseeName }
        : profile.adviser?.licensee ?? null,
    },
  };
}
