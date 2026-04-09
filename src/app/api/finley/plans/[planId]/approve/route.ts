import { NextRequest, NextResponse } from "next/server";
import { approveStoredPlan } from "@/lib/finley";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  const { planId } = await params;
  const contentType = request.headers.get("content-type") ?? "";
  const payload: {
    type?: string;
    subType?: string;
    record?: Record<string, unknown>;
    records?: Array<Record<string, unknown>>;
    files?: File[];
  } | null = contentType.includes("multipart/form-data")
    ? await (async () => {
    const formData = await request.formData().catch(() => null);
    const rawPayload = formData?.get("payload");
    const parsedPayload =
      typeof rawPayload === "string"
        ? ((JSON.parse(rawPayload) as {
            type?: string;
            subType?: string;
            record?: Record<string, unknown>;
            records?: Array<Record<string, unknown>>;
          }) ?? null)
        : null;

    return parsedPayload
      ? {
          ...parsedPayload,
          files: (formData?.getAll("files").filter((entry): entry is File => entry instanceof File) ?? []),
        }
      : null;
  })()
    : ((await request.json().catch(() => null)) as
      | {
          type?: string;
          subType?: string;
          record?: Record<string, unknown>;
          records?: Array<Record<string, unknown>>;
        }
      | null);

  const result = await approveStoredPlan(planId, payload, {
    origin: request.nextUrl.origin,
    cookieHeader: request.headers.get("cookie"),
  });

  if (!result) {
    return NextResponse.json({ message: "Plan not found." }, { status: 404 });
  }

  return NextResponse.json(result);
}
