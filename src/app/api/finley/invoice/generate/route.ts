import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/api/client";
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
        ? `Unable to load the live invoice data (${error.statusCode}): ${error.message}`
        : error instanceof Error
          ? error.message
          : "Unable to generate the invoice document right now.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
