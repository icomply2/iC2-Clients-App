import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import type { AdviserSummary, UserSummary } from "@/lib/api/types";
import { mockClientSummaries } from "@/lib/client-mocks";
import { getApiBaseUrl, isMockAuthEnabled } from "@/lib/server-runtime";

function normalizeText(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function matchesScope(record: { practiceName?: string | null; licenseeName?: string | null }, practiceName?: string | null, licenseeName?: string | null) {
  const scopedPractice = normalizeText(practiceName);
  const scopedLicensee = normalizeText(licenseeName);
  const recordPractice = normalizeText(record.practiceName);
  const recordLicensee = normalizeText(record.licenseeName);

  return (!scopedPractice || recordPractice === scopedPractice) && (!scopedLicensee || recordLicensee === scopedLicensee);
}

function userToAdviserSummary(user: UserSummary): AdviserSummary | null {
  if (normalizeText(user.userRole) !== "adviser" || !user.name?.trim()) {
    return null;
  }

  return {
    id: user.id ?? null,
    entityId: user.entityId ?? null,
    name: user.name ?? null,
    email: user.email ?? null,
    userRole: user.userRole ?? null,
    practiceName: user.practice?.name ?? null,
    licenseeName: user.licensee?.name ?? null,
    licenseeId: user.licensee?.id ?? null,
  };
}

async function fetchJson<T>(url: URL, token?: string | null) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as { data?: T | null; message?: string | null } | null;
  if (!response.ok) {
    throw new Error(body?.message ?? `Request failed with status ${response.status}.`);
  }

  return body?.data ?? null;
}

function dedupeAdvisers(advisers: AdviserSummary[]) {
  const merged: AdviserSummary[] = [];

  for (const adviser of advisers.filter((item) => item.name?.trim())) {
    const matchIndex = merged.findIndex((existing) => {
      const sameEmail = normalizeText(existing.email) && normalizeText(existing.email) === normalizeText(adviser.email);
      const sameName = normalizeText(existing.name) === normalizeText(adviser.name);
      const samePractice = normalizeText(existing.practiceName) === normalizeText(adviser.practiceName);
      const sameLicensee = normalizeText(existing.licenseeName) === normalizeText(adviser.licenseeName);

      return Boolean(sameEmail) || (sameName && samePractice && sameLicensee);
    });

    if (matchIndex === -1) {
      merged.push(adviser);
      continue;
    }

    const existing = merged[matchIndex];
    merged[matchIndex] = {
      ...existing,
      id: existing.id ?? adviser.id ?? null,
      entityId: existing.entityId ?? adviser.entityId ?? null,
      name: existing.name ?? adviser.name ?? null,
      email: existing.email ?? adviser.email ?? null,
      userRole: existing.userRole ?? adviser.userRole ?? null,
      practiceName: existing.practiceName ?? adviser.practiceName ?? null,
      licenseeName: existing.licenseeName ?? adviser.licenseeName ?? null,
      licenseeId: existing.licenseeId ?? adviser.licenseeId ?? null,
    };
  }

  return merged.sort((left, right) => (left.name ?? "").localeCompare(right.name ?? ""));
}

export async function GET(request: NextRequest) {
  const apiBaseUrl = getApiBaseUrl();
  const practiceName = request.nextUrl.searchParams.get("practiceName");
  const licenseeName = request.nextUrl.searchParams.get("licenseeName");
  const id = request.nextUrl.searchParams.get("id");

  if (isMockAuthEnabled()) {
    const advisers = Array.from(
      new Map<string, AdviserSummary>(
        mockClientSummaries
          .filter((client) => {
            const matchesPractice =
              !practiceName ||
              (client.clientAdviserPracticeName ?? "").trim().toLowerCase() === practiceName.trim().toLowerCase();
            const matchesLicensee =
              !licenseeName ||
              (client.clientAdviserLicenseeName ?? "").trim().toLowerCase() === licenseeName.trim().toLowerCase();

            return matchesPractice && matchesLicensee;
          })
          .map((client, index) => [
            `${client.clientAdviserName ?? ""}|${client.clientAdviserPracticeName ?? ""}|${client.clientAdviserLicenseeName ?? ""}`,
            {
              id: `mock-adviser-${index + 1}`,
              name: client.clientAdviserName ?? null,
              practiceName: client.clientAdviserPracticeName ?? null,
              licenseeName: client.clientAdviserLicenseeName ?? null,
              licenseeId: null,
              email: null,
            },
          ]),
      ).values(),
    ).filter((adviser) => !id || adviser.id === id);

    return NextResponse.json({ data: advisers }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }

  if (!apiBaseUrl) {
    return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  }

  const upstreamUrl = new URL("/api/Advisers", apiBaseUrl);

  if (practiceName) {
    upstreamUrl.searchParams.set("practiceName", practiceName);
  }

  if (licenseeName) {
    upstreamUrl.searchParams.set("licenseeName", licenseeName);
  }

  if (id) {
    upstreamUrl.searchParams.set("id", id);
  }

  try {
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    const usersUrl = new URL("/api/Users", apiBaseUrl);

    const [adviserRecordsResult, userRecordsResult] = await Promise.allSettled([
      fetchJson<AdviserSummary[]>(upstreamUrl, token),
      fetchJson<UserSummary[]>(usersUrl, token),
    ]);

    const adviserRecords =
      adviserRecordsResult.status === "fulfilled"
        ? (adviserRecordsResult.value ?? []).filter((adviser) => matchesScope(adviser, practiceName, licenseeName))
        : [];
    const userAdviserRecords =
      userRecordsResult.status === "fulfilled"
        ? (userRecordsResult.value ?? [])
            .map(userToAdviserSummary)
            .filter((adviser): adviser is AdviserSummary => Boolean(adviser))
            .filter((adviser) => matchesScope(adviser, practiceName, licenseeName))
        : [];

    if (!adviserRecords.length && !userAdviserRecords.length && adviserRecordsResult.status === "rejected" && userRecordsResult.status === "rejected") {
      throw adviserRecordsResult.reason;
    }

    const advisers = dedupeAdvisers([...userAdviserRecords, ...adviserRecords]).filter((adviser) => !id || adviser.id === id || adviser.entityId === id);

    return NextResponse.json({ data: advisers }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message =
      error instanceof Error ? `Adviser proxy request failed: ${error.message}` : "Adviser proxy request failed.";

    return NextResponse.json({ message }, { status: 502 });
  }
}
