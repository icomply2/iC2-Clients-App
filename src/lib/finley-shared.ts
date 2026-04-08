export type FinleyChatRequest = {
  message: string;
  activeClientId?: string | null;
  activeClientName?: string | null;
  threadId?: string | null;
  recentMessages?: Array<{
    role?: "assistant" | "user";
    content?: string | null;
  }> | null;
};

export const FINLEY_FILE_NOTE_TYPE_OPTIONS = [
  "Client Meeting",
  "Phone Call",
  "Email",
  "Review",
  "Advice",
  "Administration",
  "Other",
] as const;

export const FINLEY_FILE_NOTE_SUBTYPE_OPTIONS: Record<string, string[]> = {
  "Client Meeting": ["Initial Meeting", "Review Meeting", "Strategy Meeting", "Implementation Meeting"],
  "Phone Call": ["Inbound", "Outbound", "Follow Up"],
  Email: ["Client Email", "Adviser Email", "Provider Email"],
  Review: ["Annual Review", "Portfolio Review", "FDS Review"],
  Advice: ["SOA", "ROA", "Strategy Note"],
  Administration: ["Task Update", "Document Request", "Compliance"],
  Other: ["General"],
};

export type FinleyPlanAction = "approve_plan" | "cancel_plan";

export type FinleyChatResponse = {
  threadId: string;
  messageId: string;
  timestamp: string;
  status: "completed" | "awaiting_approval" | "needs_clarification" | "failed" | "cancelled";
  responseMode: "inform" | "plan" | "clarification" | "error" | "execution_result";
  assistantMessage: string;
  activeContext: {
    activeClientId?: string;
    activeClientName?: string;
    activeProfileId?: string;
    userId?: string | null;
    userRole?: string | null;
    clientScopeMode: "single_client" | "global";
  };
  plan: {
    planId: string;
    summary: string;
    requiresApproval: boolean;
    steps: Array<{
      stepId: string;
      toolName: string;
      kind: "read" | "write";
      status: "pending" | "approved" | "succeeded" | "failed" | "skipped";
      description: string;
      inputsPreview?: Record<string, unknown>;
    }>;
  } | null;
  results: Array<{
    stepId: string;
    toolName: string;
    status: "succeeded" | "failed";
    summary: string;
  }>;
  missingInformation: Array<{
    field: string;
    question: string;
  }>;
  warnings: string[];
  errors: Array<{
    code: string;
    message: string;
    retryable?: boolean;
  }>;
  suggestedActions: Array<{
    label: string;
    action: FinleyPlanAction;
    planId: string;
  }>;
  audit: {
    requestId: string;
    workflowId: string;
  };
};
