"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ClientSummary } from "@/lib/api/types";
import { mockClientSummaries } from "@/lib/client-mocks";
import {
  FINLEY_FILE_NOTE_SUBTYPE_OPTIONS,
  FINLEY_FILE_NOTE_TYPE_OPTIONS,
  type FinleyChatResponse,
} from "@/lib/finley-shared";
import styles from "./page.module.css";

type FinleyConsoleProps = {
  initialClientId?: string;
};

type Message = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

type PlanStepView = {
  toolName: string;
  description: string;
  inputsPreview?: Record<string, unknown>;
};

type FileNoteOverrides = {
  type: string;
  subType: string;
};

type FinleyClientSummary = ClientSummary & {
  isDraft?: boolean;
  primaryClientName?: string;
  partnerName?: string;
};

function formatPreviewValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const items = value.map((item) => formatPreviewValue(item)).filter(Boolean);
    return items.length ? items.join(", ") : null;
  }
  if (typeof value === "object") {
    return null;
  }
  return null;
}

function previewRows(inputsPreview?: Record<string, unknown>) {
  if (!inputsPreview) return [] as Array<{ label: string; value: string }>;

  const preferredOrder = [
    "target",
    "clientId",
    "subject",
    "requestedChange",
    "extractedFields",
    "email",
    "preferredPhone",
    "dateOfBirth",
    "street",
    "suburb",
    "state",
    "postCode",
    "maritalStatus",
    "residentStatus",
    "gender",
    "status",
    "clientCategory",
    "riskProfile",
    "adviceAgreementRequired",
    "agreementType",
    "nextAnniversaryDate",
    "profileId",
    "noteCount",
  ];

  const orderedEntries = [
    ...preferredOrder
      .filter((key) => key in inputsPreview)
      .map((key) => [key, inputsPreview[key]] as const),
    ...Object.entries(inputsPreview).filter(([key]) => !preferredOrder.includes(key)),
  ];

  return orderedEntries
    .map(([key, value]) => ({
      label: key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase()),
      value: formatPreviewValue(value),
    }))
    .filter((entry): entry is { label: string; value: string } => Boolean(entry.value));
}

function confirmationCopy(toolName: string, description: string) {
  if (toolName === "create_file_note") {
    return "Save this file note to the selected client record.";
  }

  if (toolName === "update_client_person_details") {
    return "Apply these client detail changes.";
  }

  if (toolName === "update_partner_person_details") {
    return "Apply these partner detail changes.";
  }

  return description;
}

export function FinleyConsole({ initialClientId }: FinleyConsoleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [serverClients, setServerClients] = useState<FinleyClientSummary[]>(mockClientSummaries);
  const [draftClients, setDraftClients] = useState<FinleyClientSummary[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [composerValue, setComposerValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [planSummary, setPlanSummary] = useState<string | null>(null);
  const [planSteps, setPlanSteps] = useState<PlanStepView[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [threadId] = useState(() => `thr_${crypto.randomUUID()}`);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isCreateClientOpen, setIsCreateClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newPartnerName, setNewPartnerName] = useState("");
  const [newClientAdviserName, setNewClientAdviserName] = useState("");
  const [newClientPracticeName, setNewClientPracticeName] = useState("");
  const [newClientError, setNewClientError] = useState<string | null>(null);
  const [fileNoteOverrides, setFileNoteOverrides] = useState<FileNoteOverrides | null>(null);

  const clients = useMemo(() => [...draftClients, ...serverClients], [draftClients, serverClients]);

  const activeClientId = searchParams.get("clientId") ?? initialClientId ?? "";

  const activeClient = useMemo(
    () => clients.find((client) => client.id === activeClientId) ?? null,
    [activeClientId, clients],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadClients() {
      setIsLoadingClients(true);

      try {
        const query = new URLSearchParams();
        if (clientSearch.trim()) {
          query.set("search", clientSearch.trim());
        }
        query.set("pageSize", "25");

        const response = await fetch(`/api/clients?${query.toString()}`, {
          method: "GET",
          cache: "no-store",
        });

        const body = (await response.json().catch(() => null)) as
          | {
              data?: {
                items?: Array<{
                  id?: string | null;
                  client?: { name?: string | null } | null;
                  partner?: { name?: string | null } | null;
                  adviser?: { name?: string | null } | null;
                  practice?: string | null;
                  licensee?: string | null;
                }>;
              };
            }
          | null;

        if (!response.ok) {
          throw new Error("Unable to load clients.");
        }

        const nextClients =
          body?.data?.items?.map((item) => ({
            id: item.id,
            name: [item.client?.name, item.partner?.name].filter(Boolean).join(" & "),
            clientAdviserName: item.adviser?.name,
            clientAdviserPracticeName: item.practice,
            clientAdviserLicenseeName: item.licensee,
          })) ?? [];

        if (!cancelled && nextClients.length) {
          setServerClients(nextClients);
        }
      } catch {
        if (!cancelled) {
          setServerClients(mockClientSummaries);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingClients(false);
        }
      }
    }

    void loadClients();

    return () => {
      cancelled = true;
    };
  }, [clientSearch]);

  function selectClient(clientId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("clientId", clientId);
    router.replace(`${pathname}?${params.toString()}`);
    resetConversation();
  }

  function clearActiveClient() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("clientId");
    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
    resetConversation();
  }

  function resetConversation() {
    setMessages([]);
    setPlanSummary(null);
    setPlanSteps([]);
    setWarnings([]);
    setPendingPlanId(null);
    setComposerValue("");
    setFileNoteOverrides(null);
  }

  function openCreateClient() {
    setNewClientName("");
    setNewPartnerName("");
    setNewClientAdviserName(activeClient?.clientAdviserName ?? "");
    setNewClientPracticeName(activeClient?.clientAdviserPracticeName ?? "");
    setNewClientError(null);
    setIsCreateClientOpen(true);
  }

  function closeCreateClient() {
    setIsCreateClientOpen(false);
    setNewClientError(null);
  }

  function handleCreateClient() {
    const primaryName = newClientName.trim();
    const partnerName = newPartnerName.trim();

    if (!primaryName) {
      setNewClientError("Enter the primary client name to start a new client record.");
      return;
    }

    const draftId = `draft-${crypto.randomUUID()}`;
    const draftClient: FinleyClientSummary = {
      id: draftId,
      isDraft: true,
      primaryClientName: primaryName,
      partnerName: partnerName || undefined,
      name: partnerName ? `${primaryName} & ${partnerName}` : primaryName,
      clientAdviserName: newClientAdviserName.trim() || activeClient?.clientAdviserName || "Unassigned Adviser",
      clientAdviserPracticeName:
        newClientPracticeName.trim() || activeClient?.clientAdviserPracticeName || "New client intake",
      clientAdviserLicenseeName: activeClient?.clientAdviserLicenseeName ?? null,
    };

    setDraftClients((current) => [draftClient, ...current.filter((client) => client.id !== draftId)]);
    closeCreateClient();

    const params = new URLSearchParams(searchParams.toString());
    params.set("clientId", draftId);
    router.replace(`${pathname}?${params.toString()}`);
    resetConversation();
  }

  async function handleSend(nextMessage?: string) {
    const message = (nextMessage ?? composerValue).trim();

    if (!message || !activeClient) {
      return;
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message,
    };

    setMessages((current) => [...current, userMessage]);
    setComposerValue("");
    setIsSending(true);

    try {
      const response = await fetch("/api/finley/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          activeClientId: activeClient.id,
          activeClientName: activeClient.name,
          threadId,
          recentMessages: [...messages.slice(-4), userMessage].map((entry) => ({
            role: entry.role,
            content: entry.content,
          })),
        }),
      });

      const body = (await response.json().catch(() => null)) as FinleyChatResponse | null;

      if (!response.ok || !body) {
        throw new Error("Unable to reach Finley right now.");
      }

      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: body.assistantMessage,
        },
      ]);
      setPlanSummary(body.plan?.summary ?? null);
      setPlanSteps(
        (body.plan?.steps ?? []).map((step) => ({
          toolName: step.toolName,
          description: step.description,
          inputsPreview: step.inputsPreview,
        })),
      );
      setWarnings(body.warnings ?? []);
      setPendingPlanId(body.suggestedActions.length ? body.suggestedActions[0]?.planId ?? null : null);
      const fileNoteStep = (body.plan?.steps ?? []).find((step) => step.toolName === "create_file_note");
      setFileNoteOverrides(
        fileNoteStep
          ? {
              type: typeof fileNoteStep.inputsPreview?.type === "string" ? fileNoteStep.inputsPreview.type : "Administration",
              subType:
                typeof fileNoteStep.inputsPreview?.subType === "string" ? fileNoteStep.inputsPreview.subType : "Task Update",
            }
          : null,
      );
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          content: error instanceof Error ? error.message : "Unable to reach Finley right now.",
        },
      ]);
      setPlanSummary(null);
      setPlanSteps([]);
      setWarnings([]);
      setPendingPlanId(null);
      setFileNoteOverrides(null);
    } finally {
      setIsSending(false);
    }
  }

  async function handlePlanAction(action: "approve_plan" | "cancel_plan") {
    if (!pendingPlanId) return;

    setIsSending(true);

    try {
      const response = await fetch(`/api/finley/plans/${encodeURIComponent(pendingPlanId)}/${action === "approve_plan" ? "approve" : "cancel"}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body:
          action === "approve_plan" && fileNoteOverrides
            ? JSON.stringify(fileNoteOverrides)
            : undefined,
      });

      const body = (await response.json().catch(() => null)) as FinleyChatResponse | null;

      if (!response.ok || !body) {
        const fallbackMessage =
          body && "assistantMessage" in body && typeof body.assistantMessage === "string"
            ? body.assistantMessage
            : "Unable to complete the requested plan action.";
        throw new Error(fallbackMessage);
      }

      setMessages((current) => [
        ...current,
        {
          id: `assistant-plan-${Date.now()}`,
          role: "assistant",
          content: body.assistantMessage,
        },
      ]);
      if (body.responseMode === "execution_result" || body.status === "completed" || body.status === "cancelled") {
        setPlanSummary(null);
        setPlanSteps([]);
        setWarnings([]);
        setPendingPlanId(null);
        setFileNoteOverrides(null);
      } else {
        setPlanSummary(body.plan?.summary ?? null);
        setPlanSteps(
          (body.plan?.steps ?? []).map((step) => ({
            toolName: step.toolName,
            description: step.description,
            inputsPreview: step.inputsPreview,
          })),
        );
        setWarnings(body.warnings ?? []);
        setPendingPlanId(body.suggestedActions.length ? body.suggestedActions[0]?.planId ?? null : null);
        const fileNoteStep = (body.plan?.steps ?? []).find((step) => step.toolName === "create_file_note");
        setFileNoteOverrides(
          fileNoteStep
            ? {
                type: typeof fileNoteStep.inputsPreview?.type === "string" ? fileNoteStep.inputsPreview.type : "Administration",
                subType:
                  typeof fileNoteStep.inputsPreview?.subType === "string" ? fileNoteStep.inputsPreview.subType : "Task Update",
              }
            : null,
        );
      }
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-plan-error-${Date.now()}`,
          role: "assistant",
          content: error instanceof Error ? error.message : "Unable to complete the requested plan action.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className={styles.workspace}>
      <aside className={styles.sidebar}>
        <section className={styles.sidebarCard}>
          <div className={styles.sidebarHeader}>
            <div className={styles.sidebarLabel}>Quick Actions</div>
            <button
              type="button"
              className={styles.primaryAction}
              onClick={openCreateClient}
            >
              + New Client
            </button>
          </div>
        </section>

        <section className={styles.sidebarCard}>
          <div className={styles.sidebarLabel}>Client Scope</div>
          <div className={styles.activeClientCard}>
            <div className={styles.activeClientEyebrow}>Active Client</div>
            {activeClient ? (
              <>
                <div className={styles.activeClientName}>{activeClient.name ?? "Unnamed Client"}</div>
                <div className={styles.activeClientMeta}>
                  <span>{activeClient.clientAdviserName ?? "Unassigned Adviser"}</span>
                  <span>{activeClient.clientAdviserPracticeName ?? "Unknown Practice"}</span>
                </div>
                {activeClient.partnerName ? (
                  <div className={styles.linkedPartnerNotice}>Linked partner: {activeClient.partnerName}</div>
                ) : null}
                {activeClient.id && !activeClient.isDraft ? (
                  <Link
                    href={`/clients/${encodeURIComponent(activeClient.id)}`}
                    className={styles.scopeLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open client profile
                  </Link>
                ) : null}
                {activeClient.isDraft ? <div className={styles.draftClientNotice}>Draft client ready in Finley</div> : null}
                <button type="button" className={styles.scopeSecondaryAction} onClick={clearActiveClient}>
                  Remove active client
                </button>
              </>
            ) : (
              <>
                <div className={styles.activeClientName}>No client selected</div>
                <div className={styles.activeClientMeta}>
                  <span>Select a client from the list below</span>
                  <span>or create a new client to begin.</span>
                </div>
              </>
            )}
          </div>
          <div className={styles.clientSearchWrap}>
            <input
              className={styles.clientSearch}
              type="search"
              placeholder="Search clients"
              value={clientSearch}
              onChange={(event) => setClientSearch(event.target.value)}
            />
          </div>
          <div className={styles.clientList}>
            {clients.map((client) => {
              const isActive = client.id === activeClient?.id;
              return (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => selectClient(client.id ?? "")}
                  className={`${styles.clientListItem} ${isActive ? styles.clientListItemActive : ""}`.trim()}
                >
                  <span className={styles.clientListName}>{client.name ?? "Unnamed Client"}</span>
                  <span className={styles.clientListMeta}>
                    {client.isDraft
                      ? client.partnerName
                        ? `Draft household with ${client.partnerName}`
                        : "Draft client"
                      : client.clientAdviserName ?? "No adviser"}
                  </span>
                </button>
              );
            })}
            {isLoadingClients ? <div className={styles.listNotice}>Loading clients...</div> : null}
          </div>
        </section>
      </aside>

      <section className={styles.console}>
        <div className={styles.chatSurface}>
          {!messages.length && !planSummary ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyPortraitFrame}>
                <div className={styles.emptyPortraitBackdrop} />
                <div className={styles.emptyPortraitCard}>
                  <div className={styles.emptyPortraitHead} />
                  <div className={styles.emptyPortraitBody} />
                  <div className={styles.emptyPortraitTablet} />
                  <div className={styles.emptyPortraitMark}>F</div>
                </div>
              </div>
              <div className={styles.emptyStateCopy}>
                <div className={styles.emptyStateTitle}>Start a new Finley chat</div>
                <div className={styles.emptyStateText}>
                  {activeClient
                    ? `Ask Finley to update client details, create a file note, or prepare ${
                        activeClient.partnerName ? "this household" : "the client"
                      } for the next review.`
                    : "Select a client from the left rail or create a new client to begin working in Finley."}
                </div>
              </div>
            </div>
          ) : null}

          {messages.length ? (
            <div className={styles.messageGroup}>
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={message.role === "assistant" ? styles.assistantBubble : styles.userBubble}
                >
                  {message.content}
                </div>
              ))}
            </div>
          ) : null}

          {planSummary ? (
            <div className={styles.planCard}>
              <div className={styles.planLabel}>Confirmation</div>
              <div className={styles.planSummary}>{planSummary}</div>
              <div className={styles.planSteps}>
                {planSteps
                  .filter((step) => step.toolName !== "get_client_summary")
                  .map((step, index) => (
                    <div key={`${step.toolName}-${index}`} className={styles.planStep}>
                      <span className={styles.planStepText}>{confirmationCopy(step.toolName, step.description)}</span>
                      {step.toolName === "create_file_note" && fileNoteOverrides ? (
                        <div className={styles.confirmationEditor}>
                          <label className={styles.confirmationField}>
                            <span className={styles.planPreviewLabel}>Type</span>
                            <select
                              className={styles.confirmationSelect}
                              value={fileNoteOverrides.type}
                              onChange={(event) => {
                                const nextType = event.target.value;
                                const nextSubType = FINLEY_FILE_NOTE_SUBTYPE_OPTIONS[nextType]?.[0] ?? "";
                                setFileNoteOverrides({
                                  type: nextType,
                                  subType: nextSubType,
                                });
                              }}
                            >
                              {FINLEY_FILE_NOTE_TYPE_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className={styles.confirmationField}>
                            <span className={styles.planPreviewLabel}>Subtype</span>
                            <select
                              className={styles.confirmationSelect}
                              value={fileNoteOverrides.subType}
                              onChange={(event) =>
                                setFileNoteOverrides((current) =>
                                  current
                                    ? {
                                        ...current,
                                        subType: event.target.value,
                                      }
                                    : current,
                                )
                              }
                            >
                              {(FINLEY_FILE_NOTE_SUBTYPE_OPTIONS[fileNoteOverrides.type] ?? []).map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      ) : null}
                      {previewRows(step.inputsPreview).length ? (
                        <div className={styles.planPreviewGrid}>
                          {previewRows(step.inputsPreview)
                            .filter(
                              (entry) =>
                                entry.label !== "Client Id" &&
                                entry.label !== "Profile Id" &&
                                (step.toolName !== "create_file_note" || (entry.label !== "Type" && entry.label !== "Sub Type")),
                            )
                            .map((entry) => (
                              <div key={`${step.toolName}-${entry.label}`} className={styles.planPreviewItem}>
                                <span className={styles.planPreviewLabel}>{entry.label}</span>
                                <span className={styles.planPreviewValue}>{entry.value}</span>
                              </div>
                            ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
              </div>
              {warnings.length ? (
                <div className={styles.planWarnings}>
                  {warnings.map((warning) => (
                    <div key={warning} className={styles.planWarning}>
                      {warning}
                    </div>
                  ))}
                </div>
              ) : null}
              {pendingPlanId ? (
                <div className={styles.planActions}>
                  <button type="button" className={styles.planApproveButton} onClick={() => void handlePlanAction("approve_plan")} disabled={isSending}>
                    Approve and run
                  </button>
                  <button type="button" className={styles.planCancelButton} onClick={() => void handlePlanAction("cancel_plan")} disabled={isSending}>
                    Cancel
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className={styles.composer}>
            <textarea
              className={styles.composerInput}
              placeholder={
                activeClient
                  ? `Ask Finley to work on ${activeClient.name ?? "this client"}...`
                  : "Select a client to start chatting with Finley..."
              }
              rows={2}
              value={composerValue}
              onChange={(event) => setComposerValue(event.target.value)}
              disabled={!activeClient}
            />
            <div className={styles.composerFooter}>
              <div className={styles.composerHint}>
                {activeClient
                  ? "Approval and execution appear here when Finley prepares a workflow."
                  : "Client context will appear here once you select a client."}
              </div>
              <button
                type="button"
                className={styles.sendButton}
                onClick={() => void handleSend()}
                disabled={isSending || !activeClient}
              >
                {isSending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {isCreateClientOpen ? (
        <div className={styles.modalOverlay} role="presentation" onClick={closeCreateClient}>
          <div
            className={styles.modalCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="finley-new-client-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.modalEyebrow}>New Client</div>
                <h2 id="finley-new-client-title" className={styles.modalTitle}>
                  Create a new client or household in Finley
                </h2>
              </div>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.modalSection}>
                <div className={styles.modalSectionTitle}>Primary client entity</div>
                <label className={styles.modalField}>
                  <span className={styles.modalLabel}>Primary client name</span>
                  <input
                    className={styles.modalInput}
                    value={newClientName}
                    onChange={(event) => setNewClientName(event.target.value)}
                    placeholder="Michael Weightman"
                  />
                </label>
              </div>

              <div className={styles.modalSection}>
                <div className={styles.modalSectionTitle}>Linked partner entity</div>
                <label className={styles.modalField}>
                  <span className={styles.modalLabel}>Partner name</span>
                  <input
                    className={styles.modalInput}
                    value={newPartnerName}
                    onChange={(event) => setNewPartnerName(event.target.value)}
                    placeholder="Kimberly Weightman"
                  />
                </label>
                <div className={styles.modalHint}>
                  Leave this blank if you only want to create a single client record.
                </div>
              </div>

              <label className={styles.modalField}>
                <span className={styles.modalLabel}>Adviser</span>
                <input
                  className={styles.modalInput}
                  value={newClientAdviserName}
                  onChange={(event) => setNewClientAdviserName(event.target.value)}
                  placeholder="Jonathan Mannion"
                />
              </label>

              <label className={styles.modalField}>
                <span className={styles.modalLabel}>Practice</span>
                <input
                  className={styles.modalInput}
                  value={newClientPracticeName}
                  onChange={(event) => setNewClientPracticeName(event.target.value)}
                  placeholder="Sandringham Wealth"
                />
              </label>

              {newClientError ? <div className={styles.modalError}>{newClientError}</div> : null}
            </div>

            <div className={styles.modalActions}>
              <button type="button" className={styles.planCancelButton} onClick={closeCreateClient}>
                Cancel
              </button>
              <button type="button" className={styles.planApproveButton} onClick={handleCreateClient}>
                {newPartnerName.trim() ? "Create and select household" : "Create and select client"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
