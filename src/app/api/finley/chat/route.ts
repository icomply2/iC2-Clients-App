import { NextRequest, NextResponse } from "next/server";
import { handleFinleyChat } from "@/lib/finley";

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as
    | {
        message?: string;
        workflowAction?: "create_file_note" | null;
        activeClientId?: string;
        activeClientName?: string;
        threadId?: string;
        recentMessages?: Array<{
          role?: "assistant" | "user";
          content?: string;
        }>;
        uploadedFiles?: Array<{
          name?: string | null;
          tags?: string[] | null;
          extractedText?: string | null;
        }>;
      }
    | null;

  const message = payload?.message?.trim();

  if (!message) {
    return NextResponse.json({ message: "A chat message is required." }, { status: 400 });
  }

  const result = await handleFinleyChat({
    message,
    workflowAction: payload?.workflowAction ?? null,
    activeClientId: payload?.activeClientId ?? null,
    activeClientName: payload?.activeClientName ?? null,
    threadId: payload?.threadId ?? null,
    recentMessages: payload?.recentMessages ?? null,
    uploadedFiles: payload?.uploadedFiles ?? null,
  });

  return NextResponse.json(result);
}
