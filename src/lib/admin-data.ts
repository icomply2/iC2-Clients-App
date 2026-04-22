import "server-only";

import type { LicenseeDto, PracticeDto, UserSummary } from "@/lib/api/types";
import { readAuthTokenFromCookies } from "@/lib/auth";
import { isAppAdminValue } from "@/lib/app-admin";
import { resolveCurrentUserFromApi } from "@/lib/current-user";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export type AdminUserRecord = UserSummary & {
  practiceName: string;
  licenseeName: string;
  roleName: string;
  statusName: string;
  accessName: string;
  adminEnabled: boolean;
};

export type PracticeSummary = {
  id: string;
  name: string;
  licenseeName: string;
  licenseeId?: string | null;
  statusName: string;
  userCount: number;
  appAdminCount: number;
  adviserCount: number;
  record: PracticeDto;
};

export type LicenseeSummary = {
  id: string;
  name: string;
  practiceCount: number;
  userCount: number;
  appAdminCount: number;
  record: LicenseeDto;
};

export async function getAdminContext() {
  const token = await readAuthTokenFromCookies();
  const currentUser = token ? await resolveCurrentUserFromApi(token).catch(() => null) : null;
  const isAdmin = isAppAdminValue(currentUser?.appAdmin);

  return { token, currentUser, isAdmin };
}

export async function loadAdminUsers(token: string | null) {
  if (!API_BASE_URL || !token) {
    return [] as AdminUserRecord[];
  }

  const response = await fetch(new URL("/api/Users", API_BASE_URL), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as
    | {
        data?: UserSummary[] | null;
      }
    | null;

  if (!response.ok) {
    throw new Error("Unable to load users for Administration Centre.");
  }

  return (body?.data ?? []).map((user) => ({
    ...user,
    practiceName: user.practice?.name?.trim() || "Unassigned practice",
    licenseeName: user.licensee?.name?.trim() || "Unassigned licensee",
    roleName: user.userRole?.trim() || "No role",
    statusName: user.userStatus?.trim() || "Unknown",
    accessName: user.appAccess?.trim() || "Not configured",
    adminEnabled: isAppAdminValue(user.appAdmin),
  }));
}

export async function loadAdminLicensees(token: string | null) {
  if (!API_BASE_URL || !token) {
    return [] as LicenseeDto[];
  }

  const response = await fetch(new URL("/api/Licensees", API_BASE_URL), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as
    | {
        data?: LicenseeDto[] | null;
      }
    | null;

  if (!response.ok) {
    throw new Error("Unable to load licensees for Administration Centre.");
  }

  return body?.data ?? [];
}

export async function loadAdminPractices(token: string | null) {
  if (!API_BASE_URL || !token) {
    return [] as PracticeDto[];
  }

  const response = await fetch(new URL("/api/Licensees/Practice", API_BASE_URL), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as
    | {
        data?: PracticeDto[] | null;
      }
    | null;

  if (!response.ok) {
    throw new Error("Unable to load practices for Administration Centre.");
  }

  return body?.data ?? [];
}

export function summarizePractices(practices: PracticeDto[], users: AdminUserRecord[]) {
  const practiceMap = new Map<string, PracticeSummary>();

  for (const user of users) {
    const practiceName = user.practiceName;
    const key = user.practice?.id?.trim() || practiceName.toLowerCase();
    const next = practiceMap.get(key) ?? {
      id: key,
      name: practiceName,
      licenseeName: user.licenseeName,
      licenseeId: user.licensee?.id?.trim() || null,
      statusName: "Unknown",
      userCount: 0,
      appAdminCount: 0,
      adviserCount: 0,
      record: {
        id: user.practice?.id?.trim() || key,
        name: practiceName,
        status: null,
        licensee: user.licensee
          ? {
              id: user.licensee.id ?? null,
              name: user.licensee.name ?? null,
            }
          : null,
      },
    };

    next.userCount += 1;
    next.licenseeName = next.licenseeName || user.licenseeName;
    next.licenseeId = next.licenseeId || user.licensee?.id?.trim() || null;

    if (user.adminEnabled) {
      next.appAdminCount += 1;
    }

    if (user.roleName.toLowerCase().includes("adviser")) {
      next.adviserCount += 1;
    }

    practiceMap.set(key, next);
  }

  for (const practice of practices) {
    const key = practice.id?.trim() || practice.name?.trim()?.toLowerCase() || `practice-${practiceMap.size + 1}`;
    const existing = practiceMap.get(key);
    const userCount = existing?.userCount ?? 0;
    const appAdminCount = existing?.appAdminCount ?? 0;
    const adviserCount = existing?.adviserCount ?? 0;

    practiceMap.set(key, {
      id: practice.id?.trim() || key,
      name: practice.name?.trim() || existing?.name || "Untitled practice",
      licenseeName: practice.licensee?.name?.trim() || existing?.licenseeName || "Unassigned licensee",
      licenseeId: practice.licensee?.id?.trim() || existing?.licenseeId || null,
      statusName: practice.status?.trim() || existing?.statusName || "Unknown",
      userCount,
      appAdminCount,
      adviserCount,
      record: practice,
    });
  }

  return Array.from(practiceMap.values()).sort((left, right) => left.name.localeCompare(right.name));
}

export function summarizeLicensees(licensees: LicenseeDto[], practices: PracticeSummary[], users: AdminUserRecord[]) {
  const licenseeMap = new Map<string, LicenseeSummary>();
  const practiceKeysByLicensee = new Map<string, Set<string>>();

  for (const user of users) {
    const licenseeName = user.licenseeName;
    const key = user.licensee?.id?.trim() || licenseeName.toLowerCase();
    const next = licenseeMap.get(key) ?? {
      id: key,
      name: licenseeName,
      practiceCount: 0,
      userCount: 0,
      appAdminCount: 0,
      record: {
        id: user.licensee?.id?.trim() || key,
        name: licenseeName,
        customPrompt: false,
      },
    };

    next.userCount += 1;

    if (user.adminEnabled) {
      next.appAdminCount += 1;
    }

    const practiceSet = practiceKeysByLicensee.get(key) ?? new Set<string>();
    practiceSet.add(user.practice?.id?.trim() || user.practiceName.toLowerCase());
    practiceKeysByLicensee.set(key, practiceSet);
    next.practiceCount = practiceSet.size;

    licenseeMap.set(key, next);
  }

  for (const practice of practices) {
    const licenseeKey = practice.licenseeId?.trim() || practice.licenseeName.toLowerCase();
    const practiceSet = practiceKeysByLicensee.get(licenseeKey) ?? new Set<string>();
    practiceSet.add(practice.id);
    practiceKeysByLicensee.set(licenseeKey, practiceSet);

    const next = licenseeMap.get(licenseeKey) ?? {
      id: practice.licenseeId?.trim() || licenseeKey,
      name: practice.licenseeName,
      practiceCount: 0,
      userCount: 0,
      appAdminCount: 0,
      record: {
        id: practice.licenseeId?.trim() || licenseeKey,
        name: practice.licenseeName,
        customPrompt: false,
      },
    };

    next.practiceCount = practiceSet.size;
    licenseeMap.set(licenseeKey, next);
  }

  for (const licensee of licensees) {
    const key = licensee.id?.trim() || licensee.name?.trim()?.toLowerCase() || `licensee-${licenseeMap.size + 1}`;
    const existing = licenseeMap.get(key);

    licenseeMap.set(key, {
      id: licensee.id?.trim() || key,
      name: licensee.name?.trim() || existing?.name || "Untitled licensee",
      practiceCount: practiceKeysByLicensee.get(key)?.size ?? existing?.practiceCount ?? 0,
      userCount: existing?.userCount ?? 0,
      appAdminCount: existing?.appAdminCount ?? 0,
      record: licensee,
    });
  }

  return Array.from(licenseeMap.values()).sort((left, right) => left.name.localeCompare(right.name));
}
