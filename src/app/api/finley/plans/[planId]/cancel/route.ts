import { NextRequest, NextResponse } from "next/server";
import { cancelStoredPlan, getStoredPlan } from "@/lib/finley";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  const { planId } = await params;
  const plan = cancelStoredPlan(planId);

  if (!plan) {
    return NextResponse.json({ message: "Plan not found." }, { status: 404 });
  }

  const latest = getStoredPlan(planId);

  return NextResponse.json({
    threadId: latest?.threadId ?? `thr_${crypto.randomUUID()}`,
    messageId: `msg_${crypto.randomUUID()}`,
    timestamp: new Date().toISOString(),
    status: "cancelled",
    responseMode: "inform",
    assistantMessage: "The pending plan has been cancelled.",
    activeContext: {
      activeClientId: latest?.clientId,
      activeClientName: latest?.clientName,
      activeProfileId: latest?.profileId,
      userId: latest?.userId ?? null,
      userRole: latest?.userRole ?? null,
      clientScopeMode: latest?.clientId ? "single_client" : "global",
    },
    plan: {
      planId,
      summary: latest?.summary ?? "Cancelled plan",
      requiresApproval: true,
      steps: latest
        ? [
            {
              stepId: latest.stepId,
              toolName: latest.toolName,
              kind: "write",
              status: "skipped",
              description: latest.description,
              inputsPreview: latest.inputsPreview,
            },
          ]
        : [],
    },
    results: [],
    missingInformation: [],
    warnings: [],
    errors: [],
    suggestedActions: [],
    audit: {
      requestId: `req_${crypto.randomUUID()}`,
      workflowId: `wf_${crypto.randomUUID()}`,
    },
  });
}
