import {
  FILE_NOTE_SUBTYPE_OPTIONS,
  FILE_NOTE_TYPE_OPTIONS,
} from "@/lib/api/contracts/file-notes";

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

export const FINLEY_FILE_NOTE_TYPE_OPTIONS = FILE_NOTE_TYPE_OPTIONS;

export const FINLEY_FILE_NOTE_SUBTYPE_OPTIONS = FILE_NOTE_SUBTYPE_OPTIONS;

export type FinleyPlanAction = "approve_plan" | "cancel_plan";

export type FinleyCardOption = {
  label: string;
  value: string;
};

export type FinleyDisplayCard = {
  kind: "collection_summary";
  title: string;
  columns: string[];
  rows: Array<{
    id: string;
    cells: string[];
    editAction?: {
      kind: "assets" | "liabilities" | "income" | "expenses" | "superannuation" | "retirement-income" | "insurance" | "entities" | "dependants";
      recordId: string;
      label?: string;
    } | null;
  }>;
  footer?: string | null;
};

export type FinleyEditorCard = {
  kind: "collection_form";
  title: string;
  toolName: string;
  fields: Array<{
    key: string;
    label: string;
    input: "text" | "select" | "textarea";
    value: string;
    options?: FinleyCardOption[];
  }>;
};

export type FinleyTableEditorCard = {
  kind: "collection_table";
  title: string;
  toolName: string;
  columns: Array<{
    key: string;
    label: string;
    input: "text" | "select";
    options?: FinleyCardOption[];
  }>;
  rows: Array<{
    id: string;
    values: Record<string, string>;
  }>;
};

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
  displayCard?: FinleyDisplayCard | null;
  editorCard?: FinleyEditorCard | FinleyTableEditorCard | null;
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

export type FinleyFactFindStep = {
  id: string;
  title: string;
  description: string;
  guidance?: string | null;
  displayCard?: FinleyDisplayCard | null;
  editorCard?: FinleyEditorCard | FinleyTableEditorCard | null;
};

export type FinleyFactFindWorkflow = {
  clientId?: string;
  clientName?: string;
  steps: FinleyFactFindStep[];
};
