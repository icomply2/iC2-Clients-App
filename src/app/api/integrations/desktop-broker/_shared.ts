import { NextRequest, NextResponse } from "next/server";

function getDesktopBrokerConfig() {
  return {
    apiBaseUrl: process.env.DESKTOP_BROKER_API_BASE_URL,
    username: process.env.DESKTOP_BROKER_USERNAME,
    password: process.env.DESKTOP_BROKER_PASSWORD,
  };
}

const DATE_PARAM_PAIRS: Array<[string, string]> = [
  ["fromDate", "toDate"],
  ["startDate", "endDate"],
  ["dateFrom", "dateTo"],
];

const MAX_DATE_RANGE_DAYS = 180;

function getConfigError() {
  const { apiBaseUrl, username, password } = getDesktopBrokerConfig();

  if (!apiBaseUrl || !username || !password) {
    return NextResponse.json(
      { message: "The Desktop Broker integration is not configured yet." },
      { status: 500 },
    );
  }

  return null;
}

function buildDesktopBrokerUrl(path: string, request: NextRequest) {
  const { apiBaseUrl } = getDesktopBrokerConfig();
  const normalizedBaseUrl = apiBaseUrl!.endsWith("/") ? apiBaseUrl! : `${apiBaseUrl!}/`;
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
    const { username, password } = getDesktopBrokerConfig();
    const basicAuthToken = Buffer.from(`${username!}:${password!}`).toString("base64");
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

    if (!response.ok) {
      const normalizedMessage = text.trim() || `Desktop Broker request failed (${response.status}).`;

      return NextResponse.json(
        {
          message: normalizedMessage,
          upstreamStatus: response.status,
        },
        { status: response.status },
      );
    }

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
  const { apiBaseUrl } = getDesktopBrokerConfig();

  if (!apiBaseUrl) {
    return "Not configured";
  }

  return apiBaseUrl.includes("services-st1")
    ? "Staging"
    : apiBaseUrl.includes("services.thirdpartyplatform.com.au")
      ? "Production"
      : "Custom";
}

export function isDesktopBrokerConfigured() {
  const { apiBaseUrl, username, password } = getDesktopBrokerConfig();
  return Boolean(apiBaseUrl && username && password);
}
