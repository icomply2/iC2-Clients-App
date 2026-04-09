import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL, readBearerToken, requireCurrentUser } from "../../_shared";

function readStringValue(value: FormDataEntryValue | null | undefined) {
  return typeof value === "string" ? value : "";
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ fileNoteId: string }> },
) {
  if (!API_BASE_URL) {
    return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  }

  const token = await readBearerToken(request);

  if (!token) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const currentUserResult = await requireCurrentUser(token);

  if (currentUserResult.error) {
    return NextResponse.json({ message: currentUserResult.error.message }, { status: currentUserResult.error.status });
  }

  const incomingForm = await request.formData().catch(() => null);
  const { fileNoteId } = await params;

  try {
    const upstreamForm = new FormData();

    if (incomingForm) {
      for (const [key, value] of incomingForm.entries()) {
        if (key === "modifier.id" || key === "modifier.email" || key === "modifier.name" || key === "modifiedDate") {
          continue;
        }
        upstreamForm.append(key, value);
      }
    }

    upstreamForm.set("modifier.id", readStringValue(incomingForm?.get("modifier.id")) || (currentUserResult.currentUser.id ?? ""));
    upstreamForm.set("modifier.email", readStringValue(incomingForm?.get("modifier.email")) || (currentUserResult.currentUser.email ?? ""));
    upstreamForm.set("modifier.name", readStringValue(incomingForm?.get("modifier.name")) || (currentUserResult.currentUser.name ?? ""));
    upstreamForm.set("modifiedDate", readStringValue(incomingForm?.get("modifiedDate")) || new Date().toISOString());

    const response = await fetch(
      new URL(`/api/ClientProfiles/FileNoteV2/${encodeURIComponent(fileNoteId)}`, API_BASE_URL),
      {
        method: "PUT",
        headers: {
          Accept: "application/json, text/plain",
          Authorization: `Bearer ${token}`,
        },
        body: upstreamForm,
        cache: "no-store",
      },
    );

    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? `File note update proxy failed: ${error.message}` : "File note update proxy failed.",
      },
      { status: 502 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ fileNoteId: string }> },
) {
  if (!API_BASE_URL) {
    return NextResponse.json({ message: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  }

  const token = await readBearerToken(request);

  if (!token) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const { fileNoteId } = await params;

  try {
    const response = await fetch(
      new URL(`/api/ClientProfiles/FileNote/${encodeURIComponent(fileNoteId)}`, API_BASE_URL),
      {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );

    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? `File note delete proxy failed: ${error.message}` : "File note delete proxy failed.",
      },
      { status: 502 },
    );
  }
}
