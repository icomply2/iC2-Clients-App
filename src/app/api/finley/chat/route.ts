import { NextRequest, NextResponse } from "next/server";
import { handleFinleyChat } from "@/lib/finley";

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as
    | {
        message?: string;
        activeClientId?: string;
        activeClientName?: string;
        threadId?: string;
        recentMessages?: Array<{
          role?: "assistant" | "user";
          content?: string;
        }>;
      }
    | null;

  const message = payload?.message?.trim();

  if (!message) {
    return NextResponse.json({ message: "A chat message is required." }, { status: 400 });
  }

  const result = await handleFinleyChat({
    message,
    activeClientId: payload?.activeClientId ?? null,
    activeClientName: payload?.activeClientName ?? null,
    threadId: payload?.threadId ?? null,
    recentMessages: payload?.recentMessages ?? null,
  });

  return NextResponse.json(result);
}
