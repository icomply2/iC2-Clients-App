import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/api/client";
import { getClientProfile, getClientProfileId } from "@/lib/api/clients";
import { readAuthTokenFromCookies } from "@/lib/auth";
import {
  buildInvoiceDocmosisModel,
  buildInvoiceOutputName,
  DOCMOSIS_INVOICE_TEMPLATE_NAME,
  renderDocmosisDocx,
  type InvoiceDocmosisInput,
} from "@/lib/services/docmosis";

async function loadProfile(clientId: string) {
  const token = await readAuthTokenFromCookies();

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

function inferContentType(fileName: string) {
  return fileName.toLowerCase().endsWith(".pdf")
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | {
        clientId?: string | null;
        invoice?: InvoiceDocmosisInput & { printAsPdf?: boolean | null };
      }
    | null;

  const clientId = body?.clientId?.trim();

  if (!clientId) {
    return NextResponse.json({ error: "Client id is required." }, { status: 400 });
  }

  try {
    const profile = await loadProfile(clientId);
    const invoice = body?.invoice ?? {};
    const outputName = buildInvoiceOutputName(profile, Boolean(invoice.printAsPdf));
    const model = buildInvoiceDocmosisModel(profile, invoice);
    const buffer = await renderDocmosisDocx({
      templateName: DOCMOSIS_INVOICE_TEMPLATE_NAME,
      outputName,
      data: model,
    });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": inferContentType(outputName),
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
