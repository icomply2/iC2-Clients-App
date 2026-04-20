import { NextRequest, NextResponse } from "next/server";

const DESKTOP_BROKER_API_BASE_URL = process.env.DESKTOP_BROKER_API_BASE_URL;
const DESKTOP_BROKER_USERNAME = process.env.DESKTOP_BROKER_USERNAME;
const DESKTOP_BROKER_PASSWORD = process.env.DESKTOP_BROKER_PASSWORD;

const DATE_PARAM_PAIRS: Array<[string, string]> = [
  ["fromDate", "toDate"],
  ["startDate", "endDate"],
  ["dateFrom", "dateTo"],
];

const MAX_DATE_RANGE_DAYS = 180;

function getConfigError() {
  if (!DESKTOP_BROKER_API_BASE_URL || !DESKTOP_BROKER_USERNAME || !DESKTOP_BROKER_PASSWORD) {
    return NextResponse.json(
      { message: "The Desktop Broker integration is not configured yet." },
      { status: 500 },
    );
  }

  return null;
}

function buildDesktopBrokerUrl(path: string, request: NextRequest) {
  const normalizedBaseUrl = DESKTOP_BROKER_API_BASE_URL!.endsWith("/")
    ? DESKTOP_BROKER_API_BASE_URL!
    : `${DESKTOP_BROKER_API_BASE_URL!}/`;
  const url = new URL(path.replace(/^\//, ""), normalizedBaseUrl);

  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  return url;
}

function validateDateRange(request: NextRequest) {
  for (const [fromKey, toKey] of DATE_PARAM_PAIRS) {
    const fromValue = request.nextUrl.searchParams.get(fromKey);
    const toValue = request.nextUrl.searchParams.get(toKey);

    if (!fromValue || !toValue) {
      continue;
    }

    const fromDate = new Date(fromValue);
    const toDate = new Date(toValue);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return NextResponse.json(
        { message: `Invalid date filter provided. ${fromKey} and ${toKey} must be valid dates.` },
        { status: 400 },
      );
    }

    const diffInDays = Math.abs(toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);

    if (diffInDays > MAX_DATE_RANGE_DAYS) {
      return NextResponse.json(
        { message: `Desktop Broker date filters are limited to ${MAX_DATE_RANGE_DAYS} day blocks.` },
        { status: 400 },
      );
    }
  }

  return null;
}

export async function proxyDesktopBrokerGet(path: string, request: NextRequest) {
  const configError = getConfigError();
  if (configError) {
    return configError;
  }

  const dateValidationError = validateDateRange(request);
  if (dateValidationError) {
    return dateValidationError;
  }

  try {
    const basicAuthToken = Buffer.from(`${DESKTOP_BROKER_USERNAME!}:${DESKTOP_BROKER_PASSWORD!}`).toString(
      "base64",
    );
    const response = await fetch(buildDesktopBrokerUrl(path, request), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${basicAuthToken}`,
      },
      cache: "no-store",
    });

    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "application/json";

    return new NextResponse(text, {
      status: response.status,
      headers: {
        "content-type": contentType,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? `Desktop Broker proxy failed: ${error.message}`
        : "Desktop Broker proxy failed.";

    return NextResponse.json({ message }, { status: 502 });
  }
}

export function getDesktopBrokerEnvironmentLabel() {
  if (!DESKTOP_BROKER_API_BASE_URL) {
    return "Not configured";
  }

  return DESKTOP_BROKER_API_BASE_URL.includes("services-st1")
    ? "Staging"
    : DESKTOP_BROKER_API_BASE_URL.includes("services.thirdpartyplatform.com.au")
      ? "Production"
      : "Custom";
}

export function isDesktopBrokerConfigured() {
  return Boolean(DESKTOP_BROKER_API_BASE_URL && DESKTOP_BROKER_USERNAME && DESKTOP_BROKER_PASSWORD);
}
