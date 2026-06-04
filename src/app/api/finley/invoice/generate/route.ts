import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiRequest } from "@/lib/api/client";
import { getClientProfile, getClientProfileId } from "@/lib/api/clients";
import { readAuthTokenFromCookies, readCurrentUserFromCookies } from "@/lib/auth";
import { loadAdminLicensees } from "@/lib/admin-data";
import type { ClientProfile, LicenseeDto } from "@/lib/api/types";
import {
  buildInvoiceOutputName,
  renderInvoiceDocx,
  type InvoiceDocxInput,
} from "@/lib/invoice-docx-export";
import { readUserProfileOverride } from "@/lib/user-profile-overrides-store";

async function loadProfile(clientId: string, token: string | null) {
  if (!token) {
    throw new Error("You need to sign in again before generating the invoice document.");
  }

  try {
    return (await getClientProfile(clientId, token)).data;
  } catch (error) {
    if (!(error instanceof ApiError) || error.statusCode !== 404) {
      throw error;
    }
  }

  const profileIdResult = await getClientProfileId(clientId, token);
  if (!profileIdResult.data) {
    throw new Error("Finley could not resolve the client profile needed for invoice generation.");
  }

  return (await getClientProfile(profileIdResult.data, token)).data;
}

async function loadLicenseeDetails(profile: ClientProfile, token: string | null): Promise<LicenseeDto | null> {
  if (!token) {
    return null;
  }

  const licenseeId = profile.adviser?.licensee?.id?.trim();
  const licenseeName = profile.adviser?.licensee?.name?.trim() || profile.licensee?.trim();

  if (!licenseeId && !licenseeName) {
    return null;
  }

  const licensees = await loadAdminLicensees(token).catch(() => []);
  const lowerName = licenseeName?.toLowerCase();

  return (
    licensees.find((licensee) => licensee.id?.trim() && licensee.id.trim() === licenseeId) ??
    licensees.find((licensee) => licensee.name?.trim().toLowerCase() === lowerName) ??
    null
  );
}

function mergeLicenseeDetails(invoice: InvoiceDocxInput, licensee: LicenseeDto | null): InvoiceDocxInput {
  if (!licensee) {
    return invoice;
  }

  return {
    ...invoice,
    licenseeName: invoice.licenseeName ?? licensee.name ?? null,
    licenseeAddress: invoice.licenseeAddress ?? licensee.licenseeAddress ?? null,
    licenseeSuburb: invoice.licenseeSuburb ?? licensee.suburb ?? null,
    licenseeState: invoice.licenseeState ?? licensee.licenseeState ?? null,
    licenseePostcode: invoice.licenseePostcode ?? licensee.licenseePostCode ?? null,
    licenseeBsb: invoice.licenseeBsb ?? licensee.bsb ?? null,
    licenseeAccount: invoice.licenseeAccount ?? licensee.account ?? null,
    licenseeLogo: invoice.licenseeLogo ?? licensee.licenseeLogo ?? null,
  };
}

function parseNumber(value?: string | number | null) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (!value) {
    return 0;
  }

  const normalized = value.replace(/[$,\s]/g, "");
  const parsed = Number.parseFloat(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function parseInteger(value?: string | number | null) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : 0;
  }

  if (!value) {
    return 0;
  }

  const parsed = Number.parseInt(value.replace(/[$,\s]/g, ""), 10);

  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveClientEntityId(profile: ClientProfile, invoice: InvoiceDocxInput) {
  return (
    parseInteger(invoice.clientEntityId) ||
    parseInteger(profile.client?.ic2AppId) ||
    parseInteger(profile.client?.entityId) ||
    parseInteger(profile.client?.id) ||
    0
  );
}

function formatApiError(error: ApiError, fallback: string) {
  const parts = [fallback];

  if (error.details) {
    try {
      const details = JSON.parse(error.details) as {
        message?: string | null;
        modelErrors?: { fieldName?: string | null; errorMessage?: string | null }[] | null;
        errors?: Record<string, string[] | string> | null;
      };

      if (details.message && details.message !== error.message) {
        parts.push(details.message);
      }

      for (const modelError of details.modelErrors ?? []) {
        const fieldName = modelError.fieldName?.trim();
        const errorMessage = modelError.errorMessage?.trim();

        if (fieldName || errorMessage) {
          parts.push([fieldName, errorMessage].filter(Boolean).join(": "));
        }
      }

      for (const [fieldName, messages] of Object.entries(details.errors ?? {})) {
        const text = Array.isArray(messages) ? messages.join("; ") : messages;

        if (text) {
          parts.push(`${fieldName}: ${text}`);
        }
      }
    } catch {
      // The raw API details are best-effort only; keep the concise fallback if parsing fails.
    }
  }

  return Array.from(new Set(parts.filter(Boolean))).join(" ");
}

function buildInvoiceSavePayload({
  clientId,
  profile,
  invoice,
  currentUser,
}: {
  clientId: string;
  profile: ClientProfile;
  invoice: InvoiceDocxInput;
  currentUser: Awaited<ReturnType<typeof readCurrentUserFromCookies>>;
}) {
  const referenceNumber = parseInteger(invoice.referenceNumber) || 1;
  const clientEntityId = resolveClientEntityId(profile, invoice);
  const items = (invoice.items ?? [])
    .filter((item) => item.description?.trim() || item.priceExGst?.trim() || item.quantity?.trim())
    .map((item) => {
      const quantity = parseNumber(item.quantity) || 1;
      const priceExGst = parseNumber(item.priceExGst);
      const totalGst = quantity * priceExGst * 0.1;

      return {
        description: item.description?.trim() || "Advice services",
        quantity,
        priceExGst,
        totalGst,
      };
    });

  if (!items.length) {
    items.push({
      description: "Advice services",
      quantity: 1,
      priceExGst: 0,
      totalGst: 0,
    });
  }

  const adviserName = invoice.adviserName?.trim() || profile.adviser?.name?.trim() || currentUser?.name || "";
  const adviserEmail = profile.adviser?.email?.trim() || currentUser?.email || "";
  const userAudit = currentUser?.name || currentUser?.email || "Finley";
  const now = new Date().toISOString();

  return {
    clientId,
    referenceNumber,
    clientName: invoice.clientName?.trim() || profile.client?.name?.trim() || "Client",
    clientEmail: invoice.clientEmail?.trim() || profile.client?.email?.trim() || "",
    licensee: invoice.licenseeName?.trim() || profile.adviser?.licensee?.name?.trim() || profile.licensee || "",
    practiceName: profile.adviser?.practice?.name?.trim() || profile.practice || "",
    adviser: {
      name: adviserName,
      email: adviserEmail,
    },
    adviserName,
    serviceType: invoice.serviceType?.trim() || "",
    clientEntityId,
    clientEntities: {
      id: String(clientEntityId || invoice.clientEntityId || profile.client?.id || clientId),
      name: invoice.clientName?.trim() || profile.client?.name?.trim() || "Client",
    },
    dueDate: invoice.dueDate?.trim() || new Date().toISOString().slice(0, 10),
    includeStripePaymentLink: Boolean(invoice.includeStripePaymentLink),
    printAsPdf: false,
    invoiceNumber: String(referenceNumber),
    invoiceDocument: "",
    serviceDate: new Date().toISOString().slice(0, 10),
    clientSourceFrom: "Finley",
    items,
    status: "Printed",
    creator: {
      name: currentUser?.name ?? "",
      email: currentUser?.email ?? "",
    },
    modifier: {
      name: currentUser?.name ?? "",
      email: currentUser?.email ?? "",
    },
    createdDate: now,
    modifiedDate: now,
    createdBy: userAudit,
    modifiedBy: userAudit,
  };
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | {
        clientId?: string | null;
        invoice?: InvoiceDocxInput | null;
      }
    | null;

  const clientId = body?.clientId?.trim();

  if (!clientId) {
    return NextResponse.json({ error: "Client id is required." }, { status: 400 });
  }

  try {
    const token = await readAuthTokenFromCookies();
    const currentUser = await readCurrentUserFromCookies();
    const profileOverride = await readUserProfileOverride(currentUser?.id);
    const profile = await loadProfile(clientId, token);
    const licenseeDetails = await loadLicenseeDetails(profile, token);
    const invoice = mergeLicenseeDetails(
      {
        ...(body?.invoice ?? {}),
        documentStyleProfile: profileOverride?.documentStyleProfile ?? null,
      },
      licenseeDetails,
    );
    const outputName = buildInvoiceOutputName(profile);
    const buffer = await renderInvoiceDocx(profile, invoice);
    await apiRequest("/api/Invoices", {
      method: "POST",
      token: token ?? undefined,
      body: JSON.stringify(buildInvoiceSavePayload({ clientId, profile, invoice, currentUser })),
    });

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${outputName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof ApiError
        ? formatApiError(error, `Unable to save the invoice (${error.statusCode}): ${error.message}`)
        : error instanceof Error
          ? error.message
          : "Unable to generate the invoice document right now.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
