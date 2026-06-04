import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiRequest } from "@/lib/api/client";
import { getClientProfile, getClientProfileId } from "@/lib/api/clients";
import type { ApiResult, ClientProfile } from "@/lib/api/types";
import { readAuthTokenFromCookies } from "@/lib/auth";

type InvoiceSearchResult = {
  items?: unknown[] | null;
  data?: unknown[] | null;
  continuationToken?: string | null;
  nextContinuationToken?: string | null;
};

type InvoiceSearchApiResult = ApiResult<InvoiceSearchResult | unknown[]>;

const MAX_SEARCH_PAGES = 8;
const SEARCH_PAGE_SIZE = 100;

async function loadProfile(clientId: string, token: string) {
  try {
    return (await getClientProfile(clientId, token)).data;
  } catch (error) {
    if (!(error instanceof ApiError) || error.statusCode !== 404) {
      throw error;
    }
  }

  const profileIdResult = await getClientProfileId(clientId, token);
  if (!profileIdResult.data) {
    throw new Error("Finley could not resolve the client profile needed for invoice numbering.");
  }

  return (await getClientProfile(profileIdResult.data, token)).data;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
}

function nestedString(record: Record<string, unknown>, path: string[]): string {
  let current: unknown = record;

  for (const part of path) {
    const next = asRecord(current)?.[part];
    if (next === undefined || next === null) {
      return "";
    }
    current = next;
  }

  return stringValue(current);
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function licenseeNamesForProfile(profile: ClientProfile | null | undefined) {
  return [
    profile?.adviser?.licensee?.id,
    profile?.adviser?.licensee?.name,
    profile?.licensee,
  ]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
}

function invoiceLicenseeValues(invoice: unknown) {
  const record = asRecord(invoice);

  if (!record) {
    return [];
  }

  return [
    record.licensee,
    record.licenseeName,
    record.licenseeId,
    nestedString(record, ["licensee", "id"]),
    nestedString(record, ["licensee", "name"]),
    nestedString(record, ["client", "licensee"]),
    nestedString(record, ["client", "licenseeName"]),
    nestedString(record, ["client", "clientAdviserLicenseeName"]),
    nestedString(record, ["practice", "licensee", "id"]),
    nestedString(record, ["practice", "licensee", "name"]),
  ]
    .map((value) => stringValue(value))
    .filter(Boolean);
}

function matchesLicensee(invoice: unknown, targetLicenseeValues: string[]) {
  if (!targetLicenseeValues.length) {
    return true;
  }

  const invoiceValues = invoiceLicenseeValues(invoice);

  if (!invoiceValues.length) {
    return true;
  }

  const normalizedTargets = new Set(targetLicenseeValues.map(normalize).filter(Boolean));
  return invoiceValues.some((value) => normalizedTargets.has(normalize(value)));
}

function invoiceRowsFromResponse(body: InvoiceSearchApiResult | null) {
  const data = body?.data;

  if (Array.isArray(data)) {
    return {
      rows: data,
      continuationToken: null,
    };
  }

  const result = asRecord(data);
  const items = result?.items;
  const nestedData = result?.data;

  return {
    rows: Array.isArray(items) ? items : Array.isArray(nestedData) ? nestedData : [],
    continuationToken: stringValue(result?.continuationToken) || stringValue(result?.nextContinuationToken) || null,
  };
}

function referenceNumberFromInvoice(invoice: unknown) {
  const record = asRecord(invoice);
  if (!record) {
    return "";
  }

  return stringValue(record.referenceNumber) || stringValue(record.invoiceReference) || stringValue(record.invoiceNumber);
}

function numericReference(referenceNumber: string) {
  const normalizedReference = referenceNumber.trim();
  if (!/^\d+$/.test(normalizedReference)) {
    return null;
  }

  const parsed = Number(normalizedReference);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

async function searchInvoices(token: string, targetLicenseeValues: string[]) {
  const references: number[] = [];
  let continuationToken: string | null = null;

  for (let page = 0; page < MAX_SEARCH_PAGES; page += 1) {
    const searchBody: Record<string, unknown> = {
      pageSize: SEARCH_PAGE_SIZE,
    };

    if (continuationToken) {
      searchBody.continuationToken = continuationToken;
    }

    const body = await apiRequest<InvoiceSearchApiResult>("/api/Invoices/Search", {
      method: "POST",
      token,
      body: JSON.stringify(searchBody),
    });
    const { rows, continuationToken: nextContinuationToken } = invoiceRowsFromResponse(body);

    for (const row of rows) {
      if (!matchesLicensee(row, targetLicenseeValues)) {
        continue;
      }

      const reference = numericReference(referenceNumberFromInvoice(row));
      if (reference !== null) {
        references.push(reference);
      }
    }

    if (!nextContinuationToken || nextContinuationToken === continuationToken) {
      break;
    }

    continuationToken = nextContinuationToken;
  }

  return references;
}

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId")?.trim() ?? "";

  if (!clientId) {
    return NextResponse.json({ error: "Client id is required." }, { status: 400 });
  }

  try {
    const token = await readAuthTokenFromCookies();

    if (!token) {
      return NextResponse.json({ error: "You need to sign in again before preparing an invoice." }, { status: 401 });
    }

    const profile = await loadProfile(clientId, token);
    const targetLicenseeValues = licenseeNamesForProfile(profile);
    const references = await searchInvoices(token, targetLicenseeValues);
    const lastReferenceNumber = references.length ? Math.max(...references) : 0;
    const nextReferenceNumber = String(lastReferenceNumber + 1);

    return NextResponse.json(
      {
        referenceNumber: nextReferenceNumber,
        lastReferenceNumber: lastReferenceNumber ? String(lastReferenceNumber) : null,
        licensee: targetLicenseeValues[1] ?? targetLicenseeValues[0] ?? null,
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Unable to load existing invoices (${error.statusCode}): ${error.message}`
        : error instanceof Error
          ? error.message
          : "Unable to load the next invoice reference right now.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
