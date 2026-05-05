import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { resolveCurrentUserFromApi } from "@/lib/current-user";
import { normalizeDocumentStyleProfile } from "@/lib/documents/document-style-profile";
import { writeUserProfileOverride } from "@/lib/user-profile-overrides-store";
import type { UserProfileOverride } from "@/lib/user-profile-overrides-shared";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

type ProfileUpdateBody = {
  profile?: UserProfileOverride | null;
  userUpdate?: {
    appAccess?: string | null;
    userRole?: string | null;
    userStatus?: string | null;
    appAdmin?: boolean | null;
  } | null;
};

function cleanString(value?: string | null) {
  return value?.trim() || null;
}

function cleanProfile(profile?: UserProfileOverride | null): UserProfileOverride {
  return {
    name: cleanString(profile?.name),
    email: cleanString(profile?.email),
    dateOfBirth: cleanString(profile?.dateOfBirth),
    address: profile?.address
      ? {
          street: cleanString(profile.address.street),
          suburb: cleanString(profile.address.suburb),
          state: cleanString(profile.address.state),
          postCode: cleanString(profile.address.postCode),
          country: cleanString(profile.address.country),
        }
      : null,
    acn: cleanString(profile?.acn),
    abn: cleanString(profile?.abn),
    asicNumber: cleanString(profile?.asicNumber),
    occupation: cleanString(profile?.occupation),
    adviserExperience: cleanString(profile?.adviserExperience),
    businessName: cleanString(profile?.businessName),
    profilePhoto: cleanString(profile?.profilePhoto),
    practiceLetterHead: cleanString(profile?.practiceLetterHead),
    practiceLogo: cleanString(profile?.practiceLogo),
    phoneNumber: cleanString(profile?.phoneNumber),
    officeNumber: cleanString(profile?.officeNumber),
    website: cleanString(profile?.website),
    xplanSite: cleanString(profile?.xplanSite),
    practiceName: cleanString(profile?.practiceName),
    licenseeName: cleanString(profile?.licenseeName),
    complianceManagerName: cleanString(profile?.complianceManagerName),
    documentStyleProfile: normalizeDocumentStyleProfile(profile?.documentStyleProfile),
  };
}

export async function PATCH(request: NextRequest) {
  if (!API_BASE_URL) {
    return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ message: "Not signed in." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as ProfileUpdateBody | null;

  if (!body) {
    return NextResponse.json({ message: "Request body is required." }, { status: 400 });
  }

  const currentUser = await resolveCurrentUserFromApi(token);

  if (!currentUser?.id) {
    return NextResponse.json({ message: "Unable to resolve the signed-in user." }, { status: 404 });
  }

  const warnings: string[] = [];
  const supportedUserUpdate = {
    ...(body.userUpdate?.appAccess ? { appAccess: body.userUpdate.appAccess } : {}),
    ...(body.userUpdate?.userRole ? { userRole: body.userUpdate.userRole } : {}),
    ...(body.userUpdate?.userStatus ? { userStatus: body.userUpdate.userStatus } : {}),
    ...(typeof body.userUpdate?.appAdmin === "boolean" ? { appAdmin: body.userUpdate.appAdmin } : {}),
  };

  if (Object.keys(supportedUserUpdate).length) {
    const response = await fetch(new URL(`/api/Users/${encodeURIComponent(currentUser.id)}`, API_BASE_URL), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(supportedUserUpdate),
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      warnings.push(text || "The backend user update endpoint did not accept the account access update.");
    }
  }

  await writeUserProfileOverride(currentUser.id, cleanProfile(body.profile));

  return NextResponse.json(
    {
      status: true,
      message: warnings.length
        ? "Profile details were saved locally. Some backend account fields could not be updated."
        : "Profile details saved.",
      warnings,
    },
    { status: 200 },
  );
}
