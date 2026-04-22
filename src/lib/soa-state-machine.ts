import type { AdviceCaseV1 } from "@/lib/soa-types";

export type SoaWorkflowState =
  | "idle"
  | "client_selected"
  | "files_uploaded"
  | "intake_in_progress"
  | "workflow_ready"
  | "workflow_started"
  | "section_review";

export type SoaWorkflowEvent =
  | "client_selected"
  | "client_cleared"
  | "files_uploaded"
  | "files_removed"
  | "adviser_message_added"
  | "intake_assessment_completed"
  | "workflow_started"
  | "section_opened"
  | "workflow_reset";

export type SoaWorkflowContext = {
  hasSelectedClient: boolean;
  uploadedFileCount: number;
  hasMeaningfulAdviserMessage: boolean;
  hasIntakeAssessment: boolean;
  workflowStarted: boolean;
  hasActiveSectionReview: boolean;
  adviceCase?: AdviceCaseV1 | null;
};

export type SoaTransitionResult = {
  allowed: boolean;
  from: SoaWorkflowState;
  to: SoaWorkflowState;
  reason?: string;
};

const TRANSITIONS: Record<SoaWorkflowState, Partial<Record<SoaWorkflowEvent, SoaWorkflowState>>> = {
  idle: {
    client_selected: "client_selected",
  },
  client_selected: {
    client_cleared: "idle",
    files_uploaded: "files_uploaded",
    workflow_reset: "client_selected",
  },
  files_uploaded: {
    client_cleared: "idle",
    files_removed: "client_selected",
    adviser_message_added: "intake_in_progress",
    workflow_reset: "client_selected",
  },
  intake_in_progress: {
    client_cleared: "idle",
    files_removed: "client_selected",
    intake_assessment_completed: "workflow_ready",
    workflow_reset: "client_selected",
  },
  workflow_ready: {
    client_cleared: "idle",
    files_removed: "client_selected",
    workflow_started: "workflow_started",
    workflow_reset: "client_selected",
  },
  workflow_started: {
    client_cleared: "idle",
    files_removed: "client_selected",
    section_opened: "section_review",
    workflow_reset: "client_selected",
  },
  section_review: {
    client_cleared: "idle",
    files_removed: "client_selected",
    section_opened: "section_review",
    workflow_reset: "client_selected",
  },
};

export function isMeaningfulAdviserMessage(content: string) {
  return content.trim().length >= 20;
}

export function hasMinimumWorkflowStartRequirements(context: SoaWorkflowContext) {
  return (
    context.hasSelectedClient &&
    context.uploadedFileCount > 0 &&
    context.hasMeaningfulAdviserMessage &&
    context.hasIntakeAssessment
  );
}

export function deriveSoaWorkflowState(context: SoaWorkflowContext): SoaWorkflowState {
  if (!context.hasSelectedClient) {
    return "idle";
  }

  if (context.workflowStarted) {
    return context.hasActiveSectionReview ? "section_review" : "workflow_started";
  }

  if (hasMinimumWorkflowStartRequirements(context)) {
    return "workflow_ready";
  }

  if (context.uploadedFileCount > 0 && context.hasMeaningfulAdviserMessage) {
    return "intake_in_progress";
  }

  if (context.uploadedFileCount > 0) {
    return "files_uploaded";
  }

  return "client_selected";
}

export function getAllowedSoaWorkflowEvents(state: SoaWorkflowState) {
  return Object.keys(TRANSITIONS[state]) as SoaWorkflowEvent[];
}

export function canTransitionSoaWorkflow(
  from: SoaWorkflowState,
  event: SoaWorkflowEvent,
  context?: SoaWorkflowContext,
): SoaTransitionResult {
  const target = TRANSITIONS[from][event];

  if (!target) {
    return {
      allowed: false,
      from,
      to: from,
      reason: `Event "${event}" is not allowed from state "${from}".`,
    };
  }

  if (event === "workflow_started" && context && !hasMinimumWorkflowStartRequirements(context)) {
    return {
      allowed: false,
      from,
      to: from,
      reason: "Workflow cannot start until files exist, an adviser message has been provided, and intake understanding is complete.",
    };
  }

  return {
    allowed: true,
    from,
    to: target,
  };
}

export function transitionSoaWorkflow(
  from: SoaWorkflowState,
  event: SoaWorkflowEvent,
  context?: SoaWorkflowContext,
): SoaTransitionResult {
  return canTransitionSoaWorkflow(from, event, context);
}
