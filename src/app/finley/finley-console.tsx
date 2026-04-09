"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ClientSummary, FileNoteRecord } from "@/lib/api/types";
import { mockClientSummaries } from "@/lib/client-mocks";
import { EngagementLetterDraftCard, type EngagementLetterDraftValue } from "@/components/engagement-letter-draft-card";
import {
  FINLEY_FILE_NOTE_SUBTYPE_OPTIONS,
  type FinleyDisplayCard,
  type FinleyEditorCard,
  type FinleyFactFindWorkflow,
  type FinleyTableEditorCard,
  type FinleyChatResponse,
} from "@/lib/finley-shared";
import finleyAvatar from "./finley-avatar.png";
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

type EngagementLetterPlaceholderCard = {
  title: string;
  description: string;
  sections: string[];
  note: string;
  badge?: string;
};

type EngagementLetterDraftCardState = {
  title: string;
  description: string;
  badge?: string;
  clientName: string;
  adviserName?: string | null;
  value: EngagementLetterDraftValue;
};

type InvoicePlaceholderItem = {
  id: string;
  description: string;
  quantity: string;
  priceExGst: string;
  totalGst: string;
};

type InvoicePlaceholderCard = {
  title: string;
  description: string;
  note: string;
  referenceNumber: string;
  clientName: string;
  clientEmail: string;
  adviserName: string;
  serviceType: string;
  clientEntityId: string;
  dueDate: string;
  includeStripePaymentLink: boolean;
  printAsPdf: boolean;
  items: InvoicePlaceholderItem[];
};

const CURRENCY_FIELD_KEYS = new Set([
  "amount",
  "currentValue",
  "balance",
  "payment",
  "repaymentAmount",
  "contributionAmount",
  "cost",
  "incomeAmount",
  "outstandingBalance",
]);

const PERCENT_FIELD_KEYS = new Set(["interestRate", "indexation", "annualReturn"]);
const DATE_FIELD_KEYS = new Set([
  "dateOfBirth",
  "nextAnniversaryDate",
  "serviceDate",
  "acquisitionDate",
  "birthday",
]);

function isCurrencyFieldKey(key: string) {
  return CURRENCY_FIELD_KEYS.has(key);
}

function isPercentFieldKey(key: string) {
  return PERCENT_FIELD_KEYS.has(key);
}

function isDateFieldKey(key: string) {
  return DATE_FIELD_KEYS.has(key);
}

function parseCurrencyValue(value: string) {
  const sanitized = value.replace(/[^0-9.-]/g, "").trim();
  if (!sanitized || sanitized === "-" || sanitized === "." || sanitized === "-.") {
    return null;
  }

  const numeric = Number(sanitized);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatCurrencyValue(value: string) {
  const numeric = parseCurrencyValue(value);
  if (numeric == null) return value.trim();

  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

function parsePercentValue(value: string) {
  const sanitized = value.replace(/[^0-9.-]/g, "").trim();
  if (!sanitized || sanitized === "-" || sanitized === "." || sanitized === "-.") {
    return null;
  }

  const numeric = Number(sanitized);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatPercentValue(value: string) {
  const numeric = parsePercentValue(value);
  if (numeric == null) return value.trim();

  return `${new Intl.NumberFormat("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric)}%`;
}

function parseDateValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return trimmed;
  }

  const slashMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, "0");
    const month = slashMatch[2].padStart(2, "0");
    const year = slashMatch[3];
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function formatDateValue(value: string) {
  const iso = parseDateValue(value);
  if (!iso) return value.trim();

  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function formatCurrencyInputValue(value: string) {
  const numeric = parseCurrencyValue(value);
  if (numeric == null) return "";

  return new Intl.NumberFormat("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

function calculateInvoiceTotalGst(quantity: string, priceExGst: string) {
  const qty = parseCurrencyValue(quantity) ?? 0;
  const unitPrice = parseCurrencyValue(priceExGst) ?? 0;
  const subtotal = qty * unitPrice;
  const totalWithGst = subtotal * 1.1;

  return totalWithGst > 0 ? formatCurrencyInputValue(String(totalWithGst)) : "";
}

function normalizeEditorCard(editorCard: FinleyEditorCard | FinleyTableEditorCard | null) {
  if (!editorCard) return null;

  if (editorCard.kind === "collection_table") {
    return {
      ...editorCard,
      rows: editorCard.rows.map((row) => ({
        ...row,
        values: Object.fromEntries(
          Object.entries(row.values).map(([key, value]) => [
            key,
            isCurrencyFieldKey(key)
              ? formatCurrencyValue(value)
              : isPercentFieldKey(key)
                ? formatPercentValue(value)
                : isDateFieldKey(key)
                  ? formatDateValue(value)
                  : value,
          ]),
        ),
      })),
    };
  }

  return {
    ...editorCard,
    fields: editorCard.fields.map((field) =>
      isCurrencyFieldKey(field.key)
        ? {
            ...field,
            value: formatCurrencyValue(field.value),
          }
        : isPercentFieldKey(field.key)
          ? {
              ...field,
              value: formatPercentValue(field.value),
            }
          : isDateFieldKey(field.key)
            ? {
                ...field,
                value: formatDateValue(field.value),
              }
        : field,
    ),
  };
}

function buildEditorPayload(editorCard: FinleyEditorCard | FinleyTableEditorCard | null) {
  if (!editorCard) return null;

  if (editorCard.kind === "collection_table") {
    return {
      records: editorCard.rows.map((row) =>
        Object.fromEntries(
          Object.entries(row.values).map(([key, value]) => [
            key,
            isCurrencyFieldKey(key)
              ? (parseCurrencyValue(value)?.toFixed(2) ?? "")
              : isPercentFieldKey(key)
                ? (parsePercentValue(value)?.toFixed(2) ?? "")
                : isDateFieldKey(key)
                  ? (parseDateValue(value) ?? "")
                  : value,
          ]),
        ),
      ),
    };
  }

  return {
    record: Object.fromEntries(
      editorCard.fields.map((field) => [
        field.key,
        isCurrencyFieldKey(field.key)
          ? (parseCurrencyValue(field.value)?.toFixed(2) ?? "")
          : isPercentFieldKey(field.key)
            ? (parsePercentValue(field.value)?.toFixed(2) ?? "")
            : isDateFieldKey(field.key)
              ? (parseDateValue(field.value) ?? "")
              : field.value,
      ]),
    ),
  };
}

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
    "section",
    "owner",
    "target",
    "clientId",
    "subject",
    "requestedChange",
    "extractedFields",
    "type",
    "assetType",
    "loanType",
    "superFund",
    "description",
    "amount",
    "currentValue",
    "balance",
    "payment",
    "repaymentAmount",
    "contributionAmount",
    "interestRate",
    "taxType",
    "frequency",
    "incomeFrequency",
    "indexation",
    "securityAsset",
    "linkedLiability",
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
      value:
        typeof value === "string" && isCurrencyFieldKey(key)
          ? formatCurrencyValue(value)
          : typeof value === "string" && isPercentFieldKey(key)
            ? formatPercentValue(value)
            : typeof value === "string" && isDateFieldKey(key)
              ? formatDateValue(value)
          : formatPreviewValue(value),
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

  if (toolName.startsWith("add_")) {
    return "Create this new record on the selected client profile.";
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
  const [displayCard, setDisplayCard] = useState<FinleyDisplayCard | null>(null);
  const [editorCard, setEditorCard] = useState<FinleyEditorCard | FinleyTableEditorCard | null>(null);
  const [factFindWorkflow, setFactFindWorkflow] = useState<FinleyFactFindWorkflow | null>(null);
  const [factFindStepIndex, setFactFindStepIndex] = useState(0);
  const [engagementLetterDraftCard, setEngagementLetterDraftCard] = useState<EngagementLetterDraftCardState | null>(null);
  const [documentPlaceholderCard, setDocumentPlaceholderCard] = useState<EngagementLetterPlaceholderCard | null>(null);
  const [invoicePlaceholderCard, setInvoicePlaceholderCard] = useState<InvoicePlaceholderCard | null>(null);
  const [isSavingFactFindStep, setIsSavingFactFindStep] = useState(false);
  const [isGeneratingFactFindDocx, setIsGeneratingFactFindDocx] = useState(false);
  const [factFindWorkflowError, setFactFindWorkflowError] = useState<string | null>(null);
  const [isGeneratingEngagementLetterDocx, setIsGeneratingEngagementLetterDocx] = useState(false);
  const [engagementLetterWorkflowError, setEngagementLetterWorkflowError] = useState<string | null>(null);
  const [isGeneratingInvoiceDocx, setIsGeneratingInvoiceDocx] = useState(false);
  const [invoiceWorkflowError, setInvoiceWorkflowError] = useState<string | null>(null);
  const [activeAssistField, setActiveAssistField] = useState<"subject" | "content" | null>(null);
  const [fileNoteSubjectManuallyEdited, setFileNoteSubjectManuallyEdited] = useState(false);
  const [fileNoteAttachments, setFileNoteAttachments] = useState<NonNullable<FileNoteRecord["attachment"]>>([]);
  const fileNoteAttachmentInputRef = useRef<HTMLInputElement | null>(null);

  const clients = useMemo(() => [...draftClients, ...serverClients], [draftClients, serverClients]);

  const activeClientId = searchParams.get("clientId") ?? initialClientId ?? "";

  const activeClient = useMemo(
    () => clients.find((client) => client.id === activeClientId) ?? null,
    [activeClientId, clients],
  );
  const currentFactFindStep = useMemo(
    () =>
      factFindWorkflow && factFindWorkflow.steps.length
        ? factFindWorkflow.steps[Math.min(factFindStepIndex, factFindWorkflow.steps.length - 1)] ?? null
        : null,
    [factFindStepIndex, factFindWorkflow],
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
    setDisplayCard(null);
    setEditorCard(null);
    setFactFindWorkflow(null);
    setFactFindStepIndex(0);
    setEngagementLetterDraftCard(null);
    setDocumentPlaceholderCard(null);
    setInvoicePlaceholderCard(null);
    setIsSavingFactFindStep(false);
    setIsGeneratingFactFindDocx(false);
    setFactFindWorkflowError(null);
    setIsGeneratingEngagementLetterDocx(false);
    setEngagementLetterWorkflowError(null);
    setIsGeneratingInvoiceDocx(false);
    setInvoiceWorkflowError(null);
    setActiveAssistField(null);
    setFileNoteSubjectManuallyEdited(false);
    setFileNoteAttachments([]);
  }

  function handleRefreshChat() {
    resetConversation();
  }

  function openCreateClient() {
    setNewClientName("");
    setNewPartnerName("");
    setNewClientAdviserName(activeClient?.clientAdviserName ?? "");
    setNewClientPracticeName(activeClient?.clientAdviserPracticeName ?? "");
    setNewClientError(null);
    setIsCreateClientOpen(true);
  }

  async function handleStarterAction(
    action:
      | "fact_find"
      | "file_note"
      | "engagement_letter"
      | "record_of_advice"
      | "statement_of_advice"
      | "create_invoice",
  ) {
    if (!activeClient || isSending) return;

    if (action === "fact_find") {
      setIsSending(true);

      try {
        const response = await fetch("/api/finley/fact-find", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            activeClientId: activeClient.id,
            activeClientName: activeClient.name,
          }),
        });

        const body = (await response.json().catch(() => null)) as { workflow?: FinleyFactFindWorkflow | null } | null;

        if (!response.ok || !body?.workflow) {
          throw new Error("Unable to start the fact find workflow right now.");
        }

        setMessages([]);
        setPlanSummary(null);
        setPlanSteps([]);
        setWarnings([]);
        setPendingPlanId(null);
        setDisplayCard(null);
        setEditorCard(null);
        setFactFindWorkflow(body.workflow);
        setFactFindStepIndex(0);
        setFactFindWorkflowError(null);
        setFileNoteSubjectManuallyEdited(false);
        setFileNoteAttachments([]);
      } catch (error) {
        setMessages((current) => [
          ...current,
          {
            id: `assistant-fact-find-error-${Date.now()}`,
            role: "assistant",
            content: error instanceof Error ? error.message : "Unable to start the fact find workflow right now.",
          },
        ]);
      } finally {
        setIsSending(false);
      }
      return;
    }

    if (
      action === "engagement_letter"
      || action === "record_of_advice"
      || action === "statement_of_advice"
      || action === "create_invoice"
    ) {
      if (action === "create_invoice") {
        const today = new Date();
        const dueDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

        setMessages([
          {
            id: `assistant-invoice-placeholder-${Date.now()}`,
            role: "assistant",
            content: `I’m ready to help prepare an invoice for ${activeClient.name}. This placeholder card captures the invoice inputs while we finish the backend and generation flow.`,
          },
        ]);
        setPlanSummary(null);
        setPlanSteps([]);
        setWarnings([]);
        setPendingPlanId(null);
        setDisplayCard(null);
        setEditorCard(null);
        setFactFindWorkflow(null);
        setFactFindStepIndex(0);
        setFactFindWorkflowError(null);
        setInvoiceWorkflowError(null);
        setEngagementLetterDraftCard(null);
        setDocumentPlaceholderCard(null);
        setInvoicePlaceholderCard({
          title: `Create an invoice for ${activeClient.name}`,
          description: "Capture invoice details, line items, and payment settings before the issuing flow is connected.",
          note: "Placeholder only for now. The next build will connect this card to calculations, PDF output, and invoice generation.",
          referenceNumber: `${Math.floor(1000 + Math.random() * 9000)}`,
          clientName: activeClient.name ?? "",
          clientEmail: "",
          adviserName: activeClient.clientAdviserName ?? "",
          serviceType: "",
          clientEntityId: activeClient.id ?? "",
          dueDate,
          includeStripePaymentLink: false,
          printAsPdf: false,
          items: [],
        });
        return;
      }

      if (action === "engagement_letter") {
        setMessages([
          {
            id: `assistant-engagement-letter-${Date.now()}`,
            role: "assistant",
            content: `I’m ready to help draft an engagement letter for ${activeClient.name}. Use the card below to draft the rich text sections and let Finley generate the long-form content.`,
          },
        ]);
        setPlanSummary(null);
        setPlanSteps([]);
        setWarnings([]);
        setPendingPlanId(null);
        setDisplayCard(null);
        setEditorCard(null);
        setFactFindWorkflow(null);
        setFactFindStepIndex(0);
        setFactFindWorkflowError(null);
        setEngagementLetterWorkflowError(null);
        setInvoiceWorkflowError(null);
        setInvoicePlaceholderCard(null);
        setDocumentPlaceholderCard(null);
        setEngagementLetterDraftCard({
          title: `Prepare an engagement letter for ${activeClient.name}`,
          description:
            "Send your client an initial engagement letter to outline the services you will provide and disclose the costs of your advice.",
          badge: "Drafting Card",
          clientName: activeClient.name ?? "this client",
          adviserName: activeClient.clientAdviserName ?? "",
          value: {
            reasonsHtml: "",
            servicesHtml: "",
            advicePreparationFee: "",
            implementationFee: "",
          },
        });
        return;
      }

      const placeholder =
        action === "record_of_advice"
          ? {
              title: `Prepare a Record of Advice for ${activeClient.name}`,
              description:
                "This workflow will guide the adviser through changed circumstances, recommendation updates, and supporting rationale before generating the final Record of Advice.",
              sections: [
                "Client and review context",
                "Changed circumstances and relevant updates",
                "Recommendation summary and rationale",
                "Implementation notes and disclosures",
              ],
              note: "Placeholder only for now. The next build will connect this card to Finley drafting and document generation.",
              badge: "ROA Placeholder",
            }
          : action === "statement_of_advice"
            ? {
                title: `Prepare a Statement of Advice for ${activeClient.name}`,
                description:
                  "This workflow will guide the adviser through full advice preparation, narrative drafting, recommendations, and disclosures before generating the final Statement of Advice.",
                sections: [
                  "Client circumstances and objectives",
                  "Strategy recommendations and product scope",
                  "Risks, research, and disclosures",
                  "Implementation, fees, and next steps",
                ],
                note: "Placeholder only for now. The next build will connect this card to Finley drafting and document generation.",
                badge: "SOA Placeholder",
              }
            : {
                title: `Prepare an engagement letter for ${activeClient.name}`,
                description:
                  "This workflow will guide the adviser through scope, fees, disclosures, and acknowledgements before generating the final engagement letter.",
                sections: [
                  "Client and adviser details",
                  "Scope of advice and services",
                  "Fee and payment terms",
                  "Authority, acknowledgements, and signatures",
                ],
                note: "Placeholder only for now. The next build will connect this card to Finley drafting and document generation.",
                badge: "Placeholder",
              };

      setMessages([
        {
          id: `assistant-document-placeholder-${Date.now()}`,
          role: "assistant",
          content: `I’m ready to help prepare ${placeholder.title.replace(`Prepare `, "").toLowerCase()} for ${activeClient.name}. This placeholder card shows the planned workflow while we finish the generation and API steps.`,
        },
      ]);
      setPlanSummary(null);
      setPlanSteps([]);
      setWarnings([]);
      setPendingPlanId(null);
      setDisplayCard(null);
      setEditorCard(null);
      setFactFindWorkflow(null);
      setFactFindStepIndex(0);
      setFactFindWorkflowError(null);
      setInvoiceWorkflowError(null);
      setEngagementLetterDraftCard(null);
      setDocumentPlaceholderCard(placeholder);
      setInvoicePlaceholderCard(null);
      return;
    }

    await handleSend("create a file note");
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

  async function saveCurrentFactFindStepIfNeeded() {
    if (!activeClientId || !currentFactFindStep?.editorCard || currentFactFindStep.editorCard.kind !== "collection_form") {
      return;
    }

    if (currentFactFindStep.id !== "household-details" && currentFactFindStep.id !== "partner-details") {
      return;
    }

    const payload = buildEditorPayload(currentFactFindStep.editorCard);
    const response = await fetch("/api/finley/fact-find/save-step", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientId: activeClientId,
        stepId: currentFactFindStep.id,
        ...(payload ?? {}),
      }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error || "Unable to save this fact find step right now.");
    }
  }

  async function handleFactFindNext() {
    if (!factFindWorkflow) return;

    setIsSavingFactFindStep(true);
    setFactFindWorkflowError(null);

    try {
      await saveCurrentFactFindStepIfNeeded();
      setFactFindStepIndex((current) => Math.min(factFindWorkflow.steps.length - 1, current + 1));
    } catch (error) {
      setFactFindWorkflowError(
        error instanceof Error ? error.message : "Unable to save this fact find step right now.",
      );
    } finally {
      setIsSavingFactFindStep(false);
    }
  }

  async function handleFactFindGenerateDocx() {
    if (!activeClientId) return;

    setIsGeneratingFactFindDocx(true);
    setFactFindWorkflowError(null);

    try {
      await saveCurrentFactFindStepIfNeeded();

      const response = await fetch("/api/wizards/fact-find/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clientId: activeClientId }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "Unable to generate the fact find document right now.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const fileNameMatch = disposition.match(/filename="?([^"]+)"?/i);
      const fileName = fileNameMatch?.[1] ?? "FactFind.docx";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setFactFindWorkflowError(
        error instanceof Error ? error.message : "Unable to generate the fact find document right now.",
      );
    } finally {
      setIsGeneratingFactFindDocx(false);
    }
  }

  async function handleInvoiceGenerateDocx() {
    if (!activeClientId || !invoicePlaceholderCard) return;

    setIsGeneratingInvoiceDocx(true);
    setInvoiceWorkflowError(null);

    try {
      const response = await fetch("/api/finley/invoice/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId: activeClientId,
          invoice: {
            referenceNumber: invoicePlaceholderCard.referenceNumber,
            clientName: invoicePlaceholderCard.clientName,
            clientEmail: invoicePlaceholderCard.clientEmail,
            adviserName: invoicePlaceholderCard.adviserName,
            serviceType: invoicePlaceholderCard.serviceType,
            clientEntityId: invoicePlaceholderCard.clientEntityId,
            dueDate: invoicePlaceholderCard.dueDate,
            includeStripePaymentLink: invoicePlaceholderCard.includeStripePaymentLink,
            printAsPdf: invoicePlaceholderCard.printAsPdf,
            items: invoicePlaceholderCard.items.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              priceExGst: item.priceExGst,
              totalGst: item.totalGst,
            })),
          },
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "Unable to generate the invoice document right now.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const fileNameMatch = disposition.match(/filename="?([^"]+)"?/i);
      const fileName = fileNameMatch?.[1] ?? (invoicePlaceholderCard.printAsPdf ? "Invoice.pdf" : "Invoice.docx");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setInvoiceWorkflowError(
        error instanceof Error ? error.message : "Unable to generate the invoice document right now.",
      );
    } finally {
      setIsGeneratingInvoiceDocx(false);
    }
  }

  async function handleEngagementLetterGenerateDocx() {
    if (!activeClientId || !engagementLetterDraftCard) return;

    setIsGeneratingEngagementLetterDocx(true);
    setEngagementLetterWorkflowError(null);

    try {
      const response = await fetch("/api/wizards/engagement-letter/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId: activeClientId,
          draft: engagementLetterDraftCard.value,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "Unable to generate the engagement letter right now.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const fileNameMatch = disposition.match(/filename="?([^"]+)"?/i);
      const fileName = fileNameMatch?.[1] ?? "Engagement.docx";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setEngagementLetterWorkflowError(
        error instanceof Error ? error.message : "Unable to generate the engagement letter right now.",
      );
    } finally {
      setIsGeneratingEngagementLetterDocx(false);
    }
  }

  async function handleSend(nextMessage?: string) {
    const message = (nextMessage ?? composerValue).trim();

    if (!message || !activeClient) {
      return;
    }

    const isFileNoteAssistRequest =
      editorCard?.kind === "collection_form" &&
      editorCard.toolName === "create_file_note" &&
      !!activeAssistField &&
      /^finley:\s*/i.test(message);

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message,
    };

    setMessages((current) => [...current, userMessage]);
    setComposerValue("");
    setIsSending(true);

    try {
      if (isFileNoteAssistRequest) {
        const fieldMap = Object.fromEntries(editorCard.fields.map((field) => [field.key, field.value]));
        const response = await fetch("/api/finley/assist-field", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fieldKey: activeAssistField,
            message,
            activeClientName: activeClient.name,
            currentSubject: typeof fieldMap.subject === "string" ? fieldMap.subject : "",
            currentContent: typeof fieldMap.content === "string" ? fieldMap.content : "",
            type: typeof fieldMap.type === "string" ? fieldMap.type : "",
            subType: typeof fieldMap.subType === "string" ? fieldMap.subType : "",
          }),
        });

        const body = (await response.json().catch(() => null)) as
          | {
              assistantMessage?: string;
              updates?: Record<string, string>;
            }
          | null;

        if (!response.ok || !body?.updates) {
          throw new Error("Unable to draft that file note field right now.");
        }

        setEditorCard((current) =>
          current && current.kind === "collection_form" && current.toolName === "create_file_note"
            ? {
                ...current,
                fields: current.fields.map((field) =>
                  field.key in body.updates! &&
                  (field.key !== "subject" || !fileNoteSubjectManuallyEdited || !field.value.trim())
                    ? {
                        ...field,
                        value:
                          field.key === "serviceDate"
                            ? formatDateValue(body.updates![field.key] ?? field.value)
                            : body.updates![field.key] ?? field.value,
                      }
                    : field,
                ),
              }
            : current,
        );
        setMessages((current) => [
          ...current,
          {
            id: `assistant-file-note-assist-${Date.now()}`,
            role: "assistant",
            content: body.assistantMessage ?? "I updated the selected file note field.",
          },
        ]);
        return;
      }

      setFactFindWorkflow(null);
      setFactFindStepIndex(0);
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
      setDisplayCard(body.displayCard ?? null);
      setEditorCard(normalizeEditorCard(body.editorCard ?? null));
      setFileNoteSubjectManuallyEdited(false);
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
      setDisplayCard(null);
      setEditorCard(null);
      setActiveAssistField(null);
      setFileNoteSubjectManuallyEdited(false);
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
            action === "approve_plan"
              ? JSON.stringify({
                ...(editorCard ? buildEditorPayload(editorCard) : {}),
                ...(editorCard && editorCard.kind === "collection_form" && editorCard.toolName === "create_file_note"
                  ? {
                      record: {
                        ...(((buildEditorPayload(editorCard) as { record?: Record<string, unknown> } | null)?.record ?? {}) as Record<string, unknown>),
                        attachment: fileNoteAttachments,
                      },
                    }
                  : {}),
              })
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
        setDisplayCard(body.displayCard ?? null);
        setEditorCard(null);
        setFileNoteSubjectManuallyEdited(false);
        setFileNoteAttachments([]);
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
        setDisplayCard(body.displayCard ?? null);
        setEditorCard(normalizeEditorCard(body.editorCard ?? null));
        setFileNoteSubjectManuallyEdited(false);
        setFileNoteAttachments([]);
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
      setDisplayCard(null);
    } finally {
      setIsSending(false);
    }
  }

  async function handleDisplayCardEdit(
    kind: "assets" | "liabilities" | "income" | "expenses" | "superannuation" | "retirement-income" | "insurance" | "entities" | "dependants",
    recordId: string,
  ) {
    if (!activeClientId || !activeClient) return;

    setIsSending(true);

    try {
      const response = await fetch("/api/finley/prepare-edit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          activeClientId,
          activeClientName: activeClient.name ?? null,
          threadId,
          kind,
          recordId,
        }),
      });

      const body = (await response.json().catch(() => null)) as FinleyChatResponse | null;

      if (!response.ok || !body) {
        throw new Error("Unable to prepare that record for editing right now.");
      }

      setMessages((current) => [
        ...current,
        {
          id: `assistant-edit-${Date.now()}`,
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
      setDisplayCard(body.displayCard ?? null);
      setEditorCard(normalizeEditorCard(body.editorCard ?? null));
      setFileNoteSubjectManuallyEdited(false);
      setFileNoteAttachments([]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-edit-error-${Date.now()}`,
          role: "assistant",
          content: error instanceof Error ? error.message : "Unable to prepare that record for editing right now.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  async function handleInlineFileNoteAssist(fieldKey: "subject" | "content", prompt: string) {
    if (!activeClient || !prompt.trim()) return;

    setIsSending(true);

    try {
      const currentCard =
        editorCard && editorCard.kind === "collection_form" && editorCard.toolName === "create_file_note"
          ? editorCard
          : null;

      if (!currentCard) return;

      const fieldMap = Object.fromEntries(currentCard.fields.map((field) => [field.key, field.value]));
      const response = await fetch("/api/finley/assist-field", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fieldKey,
          message: prompt,
          activeClientName: activeClient.name,
          currentSubject: typeof fieldMap.subject === "string" ? fieldMap.subject : "",
          currentContent: typeof fieldMap.content === "string" ? fieldMap.content : "",
          type: typeof fieldMap.type === "string" ? fieldMap.type : "",
          subType: typeof fieldMap.subType === "string" ? fieldMap.subType : "",
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | {
            assistantMessage?: string;
            updates?: Record<string, string>;
          }
        | null;

      if (!response.ok || !body?.updates) {
        throw new Error("Unable to draft that file note field right now.");
      }

      setEditorCard((current) =>
        current && current.kind === "collection_form" && current.toolName === "create_file_note"
          ? {
              ...current,
              fields: current.fields.map((field) =>
                field.key in body.updates! &&
                (field.key !== "subject" || !fileNoteSubjectManuallyEdited || !field.value.trim())
                  ? {
                      ...field,
                      value:
                        field.key === "serviceDate"
                          ? formatDateValue(body.updates![field.key] ?? field.value)
                          : body.updates![field.key] ?? field.value,
                    }
                  : field,
              ),
            }
          : current,
      );
      setMessages((current) => [
        ...current,
        {
          id: `assistant-inline-file-note-assist-${Date.now()}`,
          role: "assistant",
          content: body.assistantMessage ?? "I updated the selected file note field.",
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-inline-file-note-assist-error-${Date.now()}`,
          role: "assistant",
          content: error instanceof Error ? error.message : "Unable to draft that file note field right now.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function handleFileNoteAttachmentsSelected(files: FileList | null) {
    if (!files?.length) return;

    const nextAttachments = Array.from(files).map((file) => ({
      name: file.name,
      url: null,
    }));

    setFileNoteAttachments((current) => [...current, ...nextAttachments]);
  }

  function updateFactFindField(stepId: string, key: string, value: string) {
    setFactFindWorkflow((current) =>
      current
        ? {
            ...current,
            steps: current.steps.map((step) =>
              step.id === stepId && step.editorCard?.kind === "collection_form"
                ? {
                    ...step,
                    editorCard: {
                      ...step.editorCard,
                      fields: step.editorCard.fields.map((field) =>
                        field.key === key
                          ? {
                              ...field,
                              value: isCurrencyFieldKey(field.key)
                                ? formatCurrencyValue(value)
                                : isPercentFieldKey(field.key)
                                  ? formatPercentValue(value)
                                  : isDateFieldKey(field.key)
                                    ? formatDateValue(value)
                                    : value,
                            }
                          : field,
                      ),
                    },
                  }
                : step,
            ),
          }
        : current,
    );
  }

  function updateFactFindTableCell(stepId: string, rowId: string, key: string, value: string) {
    setFactFindWorkflow((current) =>
      current
        ? {
            ...current,
            steps: current.steps.map((step) =>
              step.id === stepId && step.editorCard?.kind === "collection_table"
                ? {
                    ...step,
                    editorCard: {
                      ...step.editorCard,
                      rows: step.editorCard.rows.map((row) =>
                        row.id === rowId
                          ? {
                              ...row,
                              values: {
                                ...row.values,
                                [key]: isCurrencyFieldKey(key)
                                  ? formatCurrencyValue(value)
                                  : isPercentFieldKey(key)
                                    ? formatPercentValue(value)
                                    : isDateFieldKey(key)
                                      ? formatDateValue(value)
                                      : value,
                              },
                            }
                          : row,
                      ),
                    },
                  }
                : step,
            ),
          }
        : current,
    );
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
                <Image
                  src={finleyAvatar}
                  alt="Finley avatar"
                  className={styles.emptyPortraitImage}
                  priority
                />
              </div>
              <div className={styles.emptyStateCopy}>
                <div className={styles.emptyStateTitle}>Start a new Finley chat</div>
                <div className={styles.emptyStateText}>
                  {activeClient
                    ? `Choose a workflow to begin, or ask Finley directly to update client details, create a file note, or prepare ${
                        activeClient.partnerName ? "this household" : "the client"
                      } for the next review.`
                    : "Select a client from the left rail or create a new client to begin working in Finley."}
                </div>
                {activeClient ? (
                  <div className={styles.starterActions}>
                    <button
                      type="button"
                      className={styles.starterActionCard}
                      onClick={() => void handleStarterAction("fact_find")}
                      disabled={isSending}
                    >
                      <span className={styles.starterActionTitle}>Update Fact Find</span>
                    </button>
                    <button
                      type="button"
                      className={styles.starterActionCard}
                      onClick={() => void handleStarterAction("engagement_letter")}
                      disabled={isSending}
                    >
                      <span className={styles.starterActionTitle}>Prepare Engagement Letter</span>
                    </button>
                    <button
                      type="button"
                      className={styles.starterActionCard}
                      onClick={() => void handleStarterAction("record_of_advice")}
                      disabled={isSending}
                    >
                      <span className={styles.starterActionTitle}>Prepare Record of Advice</span>
                    </button>
                    <button
                      type="button"
                      className={styles.starterActionCard}
                      onClick={() => void handleStarterAction("statement_of_advice")}
                      disabled={isSending}
                    >
                      <span className={styles.starterActionTitle}>Prepare Statement of Advice</span>
                    </button>
                    <button
                      type="button"
                      className={styles.starterActionCard}
                      onClick={() => void handleStarterAction("create_invoice")}
                      disabled={isSending}
                    >
                      <span className={styles.starterActionTitle}>Create Invoice</span>
                    </button>
                    <button
                      type="button"
                      className={styles.starterActionCard}
                      onClick={() => void handleStarterAction("file_note")}
                      disabled={isSending}
                    >
                      <span className={styles.starterActionTitle}>Create File Note</span>
                    </button>
                  </div>
                ) : null}
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

          {currentFactFindStep ? (
            <div className={styles.workflowCard}>
              <div className={styles.planLabel}>Update Fact Find</div>
              <div className={styles.workflowHeader}>
                <div>
                  <div className={styles.planSummary}>{currentFactFindStep.title}</div>
                  <div className={styles.workflowDescription}>{currentFactFindStep.description}</div>
                  {currentFactFindStep.guidance ? (
                    <div className={styles.workflowGuidance}>{currentFactFindStep.guidance}</div>
                  ) : null}
                </div>
                <div className={styles.workflowStepBadge}>
                  Step {factFindStepIndex + 1} of {factFindWorkflow?.steps.length ?? 1}
                </div>
              </div>

              <div className={styles.workflowStepper}>
                {factFindWorkflow?.steps.map((step, index) => (
                  <button
                    key={step.id}
                    type="button"
                    className={`${styles.workflowStepPill} ${index === factFindStepIndex ? styles.workflowStepPillActive : ""}`.trim()}
                    onClick={() => setFactFindStepIndex(index)}
                  >
                    {step.title}
                  </button>
                ))}
              </div>

              {currentFactFindStep.displayCard ? (
                <div className={styles.dataCard}>
                  <div className={styles.planLabel}>Client Data</div>
                  <div className={styles.planSummary}>{currentFactFindStep.displayCard.title}</div>
                  <div className={styles.dataTableWrap}>
                    <div className={styles.dataTableHeader}>
                      {currentFactFindStep.displayCard.columns.map((column) => (
                        <span key={column} className={styles.dataTableHeaderCell}>
                          {column}
                        </span>
                      ))}
                      {currentFactFindStep.displayCard.rows.some((row) => row.editAction) ? (
                        <span className={styles.dataTableHeaderCell}>Action</span>
                      ) : null}
                    </div>
                    {currentFactFindStep.displayCard.rows.map((row) => (
                      <div key={row.id} className={styles.dataTableRow}>
                        {row.cells.map((cell, index) => (
                          <span key={`${row.id}-${index}`} className={styles.dataTableCell}>
                            {cell || "-"}
                          </span>
                        ))}
                        {currentFactFindStep.displayCard!.rows.some((entry) => entry.editAction) ? (
                          <span className={`${styles.dataTableCell} ${styles.dataTableActionCell}`.trim()}>
                            {row.editAction ? (
                              <button
                                type="button"
                                className={styles.dataTableEditButton}
                                onClick={() => void handleDisplayCardEdit(row.editAction!.kind, row.editAction!.recordId)}
                                disabled={isSending}
                              >
                                {row.editAction.label ?? "Edit"}
                              </button>
                            ) : (
                              <span className={styles.dataTableActionPlaceholder}>-</span>
                            )}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {currentFactFindStep.editorCard ? (
                <div className={styles.planStep}>
                  <span className={styles.planStepText}>Review this section before moving to the next step.</span>
                  <div className={styles.confirmationEditor}>
                    {currentFactFindStep.editorCard.kind === "collection_table" ? (
                      (() => {
                        const tableCard = currentFactFindStep.editorCard;
                        return (
                          <div className={`${styles.confirmationField} ${styles.confirmationFieldFull}`.trim()}>
                            <span className={styles.planPreviewLabel}>Rows</span>
                            <div className={styles.batchTableWrap}>
                              <div
                                className={styles.batchTableHeader}
                                style={{ gridTemplateColumns: `repeat(${tableCard.columns.length}, minmax(0, 1fr))` }}
                              >
                                {tableCard.columns.map((column) => (
                                  <span key={column.key} className={styles.dataTableHeaderCell}>
                                    {column.label}
                                  </span>
                                ))}
                              </div>
                              {tableCard.rows.map((row) => (
                                <div
                                  key={row.id}
                                  className={styles.batchTableRow}
                                  style={{ gridTemplateColumns: `repeat(${tableCard.columns.length}, minmax(0, 1fr))` }}
                                >
                                  {tableCard.columns.map((column) => (
                                    <span key={`${row.id}-${column.key}`} className={styles.batchTableCell}>
                                      {column.input === "select" ? (
                                        <select
                                          className={styles.confirmationSelect}
                                          value={row.values[column.key] ?? ""}
                                          onChange={(event) =>
                                            updateFactFindTableCell(currentFactFindStep.id, row.id, column.key, event.target.value)
                                          }
                                        >
                                          <option value="">Select...</option>
                                          {(column.options ?? []).map((option) => (
                                            <option key={option.value} value={option.value}>
                                              {option.label}
                                            </option>
                                          ))}
                                        </select>
                                      ) : (
                                        <input
                                          className={styles.confirmationSelect}
                                          value={row.values[column.key] ?? ""}
                                          onChange={(event) =>
                                            updateFactFindTableCell(currentFactFindStep.id, row.id, column.key, event.target.value)
                                          }
                                        />
                                      )}
                                    </span>
                                  ))}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      currentFactFindStep.editorCard.fields.map((field) => (
                        <label
                          key={field.key}
                          className={`${styles.confirmationField} ${field.input === "textarea" ? styles.confirmationFieldFull : ""}`.trim()}
                        >
                          <span className={styles.planPreviewLabel}>{field.label}</span>
                          {field.input === "select" ? (
                            <select
                              className={styles.confirmationSelect}
                              value={field.value}
                              onChange={(event) => updateFactFindField(currentFactFindStep.id, field.key, event.target.value)}
                            >
                              <option value="">Select...</option>
                              {(field.options ?? []).map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          ) : field.input === "textarea" ? (
                            <textarea
                              className={styles.confirmationSelect}
                              rows={6}
                              value={field.value}
                              onChange={(event) => updateFactFindField(currentFactFindStep.id, field.key, event.target.value)}
                            />
                          ) : (
                            <input
                              className={styles.confirmationSelect}
                              value={field.value}
                              onChange={(event) => updateFactFindField(currentFactFindStep.id, field.key, event.target.value)}
                            />
                          )}
                        </label>
                      ))
                    )}
                  </div>
                </div>
              ) : null}

              {factFindWorkflowError ? (
                <div className={styles.planWarnings}>
                  <div className={styles.planWarning}>{factFindWorkflowError}</div>
                </div>
              ) : null}

              <div className={styles.workflowActions}>
                <button
                  type="button"
                  className={styles.planCancelButton}
                  onClick={() => setFactFindStepIndex((current) => Math.max(0, current - 1))}
                  disabled={factFindStepIndex === 0 || isSavingFactFindStep || isGeneratingFactFindDocx}
                >
                  Back
                </button>
                <div className={styles.workflowActionsRight}>
                  <button
                    type="button"
                    className={styles.planCancelButton}
                    onClick={() => void handleFactFindGenerateDocx()}
                    disabled={isSavingFactFindStep || isGeneratingFactFindDocx}
                  >
                    {isGeneratingFactFindDocx ? "Generating..." : "Generate .docx"}
                  </button>
                  <button
                    type="button"
                    className={styles.planCancelButton}
                    onClick={() => {
                      setFactFindWorkflow(null);
                      setFactFindStepIndex(0);
                      setFactFindWorkflowError(null);
                    }}
                    disabled={isSavingFactFindStep || isGeneratingFactFindDocx}
                  >
                    Close workflow
                  </button>
                  <button
                    type="button"
                    className={styles.planApproveButton}
                    onClick={() => void handleFactFindNext()}
                    disabled={
                      !factFindWorkflow
                      || factFindStepIndex >= factFindWorkflow.steps.length - 1
                      || isSavingFactFindStep
                      || isGeneratingFactFindDocx
                    }
                  >
                    {isSavingFactFindStep ? "Saving..." : "Next"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {engagementLetterDraftCard ? (
            <EngagementLetterDraftCard
              title={engagementLetterDraftCard.title}
              description={engagementLetterDraftCard.description}
              badge={engagementLetterDraftCard.badge}
              clientName={engagementLetterDraftCard.clientName}
              adviserName={engagementLetterDraftCard.adviserName}
              value={engagementLetterDraftCard.value}
              onChange={(nextValue) =>
                setEngagementLetterDraftCard((current) => (current ? { ...current, value: nextValue } : current))
              }
              onPrint={() => void handleEngagementLetterGenerateDocx()}
              isPrinting={isGeneratingEngagementLetterDocx}
              printError={engagementLetterWorkflowError}
            />
          ) : null}

          {documentPlaceholderCard ? (
            <div className={styles.workflowCard}>
              <div className={styles.planLabel}>Advice Document</div>
              <div className={styles.workflowHeader}>
                <div>
                  <div className={styles.planSummary}>{documentPlaceholderCard.title}</div>
                  <div className={styles.workflowDescription}>{documentPlaceholderCard.description}</div>
                  <div className={styles.workflowGuidance}>{documentPlaceholderCard.note}</div>
                </div>
                <div className={styles.workflowStepBadge}>{documentPlaceholderCard.badge ?? "Placeholder"}</div>
              </div>

              <div className={styles.planStep}>
                <span className={styles.planStepText}>Planned sections for the wizard</span>
                <div className={styles.engagementLetterList}>
                  {documentPlaceholderCard.sections.map((section) => (
                    <div key={section} className={styles.engagementLetterListItem}>
                      {section}
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.workflowActions}>
                <div />
                <div className={styles.workflowActionsRight}>
                  <button
                    type="button"
                    className={styles.planCancelButton}
                    onClick={() => setDocumentPlaceholderCard(null)}
                  >
                    Close card
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {invoicePlaceholderCard ? (
            <div className={styles.workflowCard}>
              <div className={styles.planLabel}>Invoice</div>
              <div className={styles.workflowHeader}>
                <div>
                  <div className={styles.planSummary}>{invoicePlaceholderCard.title}</div>
                  <div className={styles.workflowDescription}>{invoicePlaceholderCard.description}</div>
                  <div className={styles.workflowGuidance}>{invoicePlaceholderCard.note}</div>
                </div>
                <div className={styles.workflowStepBadge}>Invoice Placeholder</div>
              </div>

              {invoiceWorkflowError ? <div className={styles.planWarning}>{invoiceWorkflowError}</div> : null}

              <div className={styles.invoiceCardForm}>
                <label className={`${styles.confirmationField} ${styles.confirmationFieldFull}`.trim()}>
                  <span className={styles.planPreviewLabel}>Reference Number</span>
                  <input
                    className={styles.confirmationSelect}
                    value={invoicePlaceholderCard.referenceNumber}
                    onChange={(event) =>
                      setInvoicePlaceholderCard((current) =>
                        current ? { ...current, referenceNumber: event.target.value } : current,
                      )
                    }
                  />
                </label>

                <label className={`${styles.confirmationField} ${styles.confirmationFieldFull}`.trim()}>
                  <span className={styles.planPreviewLabel}>Client Name</span>
                  <input
                    className={styles.confirmationSelect}
                    value={invoicePlaceholderCard.clientName}
                    onChange={(event) =>
                      setInvoicePlaceholderCard((current) =>
                        current ? { ...current, clientName: event.target.value } : current,
                      )
                    }
                  />
                </label>

                <label className={`${styles.confirmationField} ${styles.confirmationFieldFull}`.trim()}>
                  <span className={styles.planPreviewLabel}>Client Email</span>
                  <input
                    className={styles.confirmationSelect}
                    value={invoicePlaceholderCard.clientEmail}
                    onChange={(event) =>
                      setInvoicePlaceholderCard((current) =>
                        current ? { ...current, clientEmail: event.target.value } : current,
                      )
                    }
                  />
                </label>

                <label className={`${styles.confirmationField} ${styles.confirmationFieldFull}`.trim()}>
                  <span className={styles.planPreviewLabel}>Adviser Name</span>
                  <input
                    className={styles.confirmationSelect}
                    value={invoicePlaceholderCard.adviserName}
                    onChange={(event) =>
                      setInvoicePlaceholderCard((current) =>
                        current ? { ...current, adviserName: event.target.value } : current,
                      )
                    }
                  />
                </label>

                <label className={`${styles.confirmationField} ${styles.confirmationFieldFull}`.trim()}>
                  <span className={styles.planPreviewLabel}>Service Type</span>
                  <select
                    className={styles.confirmationSelect}
                    value={invoicePlaceholderCard.serviceType}
                    onChange={(event) =>
                      setInvoicePlaceholderCard((current) =>
                        current ? { ...current, serviceType: event.target.value } : current,
                      )
                    }
                  >
                    <option value="">Choose a service</option>
                    <option value="Statement of Advice">Statement of Advice</option>
                    <option value="Record of Advice">Record of Advice</option>
                    <option value="Annual Review">Annual Review</option>
                    <option value="Implementation">Implementation</option>
                    <option value="Fee for Service">Fee for Service</option>
                  </select>
                </label>

                <label className={styles.confirmationField}>
                  <span className={styles.planPreviewLabel}>Client Entity ID</span>
                  <input
                    className={styles.confirmationSelect}
                    value={invoicePlaceholderCard.clientEntityId}
                    onChange={(event) =>
                      setInvoicePlaceholderCard((current) =>
                        current ? { ...current, clientEntityId: event.target.value } : current,
                      )
                    }
                  />
                </label>

                <label className={styles.confirmationField}>
                  <span className={styles.planPreviewLabel}>Due Date</span>
                  <input
                    className={styles.confirmationSelect}
                    type="date"
                    value={invoicePlaceholderCard.dueDate}
                    onChange={(event) =>
                      setInvoicePlaceholderCard((current) =>
                        current ? { ...current, dueDate: event.target.value } : current,
                      )
                    }
                  />
                </label>

                <label className={`${styles.confirmationField} ${styles.confirmationFieldFull} ${styles.invoiceCheckboxField}`.trim()}>
                  <span className={styles.invoiceCheckboxRow}>
                    <input
                      type="checkbox"
                      checked={invoicePlaceholderCard.includeStripePaymentLink}
                      onChange={(event) =>
                        setInvoicePlaceholderCard((current) =>
                          current ? { ...current, includeStripePaymentLink: event.target.checked } : current,
                        )
                      }
                    />
                    <span>Include stripe payment link (stripe fees apply)</span>
                  </span>
                </label>
              </div>

              <div className={styles.invoiceLineItemsCard}>
                <div className={styles.invoiceLineItemsHeader}>
                  <span>Description</span>
                  <span>Quantity</span>
                  <span>Price (ex GST)</span>
                  <span>Total (GST)</span>
                  <span />
                </div>
                {invoicePlaceholderCard.items.length ? (
                  invoicePlaceholderCard.items.map((item) => (
                    <div key={item.id} className={styles.invoiceLineItemRow}>
                      <input
                        className={styles.confirmationSelect}
                        value={item.description}
                        onChange={(event) =>
                          setInvoicePlaceholderCard((current) =>
                            current
                              ? {
                                  ...current,
                                  items: current.items.map((entry) =>
                                    entry.id === item.id ? { ...entry, description: event.target.value } : entry,
                                  ),
                                }
                              : current,
                          )
                        }
                      />
                      <input
                        className={styles.confirmationSelect}
                        value={item.quantity}
                        inputMode="decimal"
                        onChange={(event) =>
                          setInvoicePlaceholderCard((current) =>
                            current
                              ? {
                                  ...current,
                                  items: current.items.map((entry) =>
                                    entry.id === item.id
                                      ? {
                                          ...entry,
                                          quantity: event.target.value,
                                          totalGst: calculateInvoiceTotalGst(event.target.value, entry.priceExGst),
                                        }
                                      : entry,
                                  ),
                                }
                              : current,
                          )
                        }
                      />
                      <input
                        className={styles.confirmationSelect}
                        value={item.priceExGst}
                        inputMode="decimal"
                        onChange={(event) =>
                          setInvoicePlaceholderCard((current) =>
                            current
                              ? {
                                  ...current,
                                  items: current.items.map((entry) =>
                                    entry.id === item.id
                                      ? {
                                          ...entry,
                                          priceExGst: event.target.value,
                                          totalGst: calculateInvoiceTotalGst(entry.quantity, event.target.value),
                                        }
                                      : entry,
                                  ),
                                }
                              : current,
                          )
                        }
                        onBlur={(event) =>
                          setInvoicePlaceholderCard((current) =>
                            current
                              ? {
                                  ...current,
                                  items: current.items.map((entry) =>
                                    entry.id === item.id
                                      ? {
                                          ...entry,
                                          priceExGst: formatCurrencyInputValue(event.target.value),
                                          totalGst: calculateInvoiceTotalGst(entry.quantity, event.target.value),
                                        }
                                      : entry,
                                  ),
                                }
                              : current,
                          )
                        }
                      />
                      <input
                        className={styles.confirmationSelect}
                        value={item.totalGst}
                        inputMode="decimal"
                        readOnly
                      />
                      <button
                        type="button"
                        className={styles.attachmentRemoveButton}
                        onClick={() =>
                          setInvoicePlaceholderCard((current) =>
                            current
                              ? {
                                  ...current,
                                  items: current.items.filter((entry) => entry.id !== item.id),
                                }
                              : current,
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))
                ) : null}
                <div className={styles.invoiceAddItemRow}>
                  <button
                    type="button"
                    className={styles.invoiceAddItemButton}
                    onClick={() =>
                      setInvoicePlaceholderCard((current) =>
                        current
                          ? {
                              ...current,
                              items: [
                                ...current.items,
                                {
                                  id: `invoice-item-${crypto.randomUUID()}`,
                                  description: "",
                                  quantity: "1",
                                  priceExGst: "",
                                  totalGst: "",
                                },
                              ],
                            }
                          : current,
                      )
                    }
                  >
                    + Add item
                  </button>
                </div>
              </div>

              <div className={styles.workflowActions}>
                <div />
                <div className={styles.workflowActionsRight}>
                  <label className={styles.invoicePrintToggle}>
                    <input
                      type="checkbox"
                      checked={invoicePlaceholderCard.printAsPdf}
                      onChange={(event) =>
                        setInvoicePlaceholderCard((current) =>
                          current ? { ...current, printAsPdf: event.target.checked } : current,
                        )
                      }
                    />
                    <span>Print as PDF</span>
                  </label>
                  <button
                    type="button"
                    className={styles.planApproveButton}
                    onClick={() => void handleInvoiceGenerateDocx()}
                    disabled={isGeneratingInvoiceDocx}
                  >
                    {isGeneratingInvoiceDocx ? "Generating..." : "Print"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {displayCard ? (
            <div className={styles.dataCard}>
              <div className={styles.planLabel}>Client Data</div>
              <div className={styles.planSummary}>{displayCard.title}</div>
              <div className={styles.dataTableWrap}>
                <div className={styles.dataTableHeader}>
                  {displayCard.columns.map((column) => (
                    <span key={column} className={styles.dataTableHeaderCell}>
                      {column}
                    </span>
                  ))}
                  {displayCard.rows.some((row) => row.editAction) ? (
                    <span className={styles.dataTableHeaderCell}>Action</span>
                  ) : null}
                </div>
                {displayCard.rows.map((row) => (
                  <div key={row.id} className={styles.dataTableRow}>
                    {row.cells.map((cell, index) => (
                      <span key={`${row.id}-${index}`} className={styles.dataTableCell}>
                        {cell || "-"}
                      </span>
                    ))}
                    {displayCard.rows.some((entry) => entry.editAction) ? (
                      <span className={`${styles.dataTableCell} ${styles.dataTableActionCell}`.trim()}>
                        {row.editAction ? (
                          <button
                            type="button"
                            className={styles.dataTableEditButton}
                            onClick={() => void handleDisplayCardEdit(row.editAction!.kind, row.editAction!.recordId)}
                            disabled={isSending}
                          >
                            {row.editAction.label ?? "Edit"}
                          </button>
                        ) : (
                          <span className={styles.dataTableActionPlaceholder}>-</span>
                        )}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
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
                      {editorCard && step.toolName === editorCard.toolName ? (
                        <div className={styles.confirmationEditor}>
                          {editorCard.kind === "collection_table" ? (
                            <div className={`${styles.confirmationField} ${styles.confirmationFieldFull}`.trim()}>
                              <span className={styles.planPreviewLabel}>Rows</span>
                              <div className={styles.batchTableWrap}>
                                <div
                                  className={styles.batchTableHeader}
                                  style={{ gridTemplateColumns: `repeat(${editorCard.columns.length + 1}, minmax(0, 1fr))` }}
                                >
                                  {editorCard.columns.map((column) => (
                                    <span key={column.key} className={styles.dataTableHeaderCell}>
                                      {column.label}
                                    </span>
                                  ))}
                                  <span className={styles.dataTableHeaderCell}>Action</span>
                                </div>
                                {editorCard.rows.map((row, rowIndex) => (
                                  <div
                                    key={row.id}
                                    className={styles.batchTableRow}
                                    style={{ gridTemplateColumns: `repeat(${editorCard.columns.length + 1}, minmax(0, 1fr))` }}
                                  >
                                    {editorCard.columns.map((column) => (
                                      <span key={`${row.id}-${column.key}`} className={styles.batchTableCell}>
                                        {column.input === "select" ? (
                                          <select
                                            className={styles.confirmationSelect}
                                            value={row.values[column.key] ?? ""}
                                            onChange={(event) =>
                                              setEditorCard((current) =>
                                                current && current.kind === "collection_table"
                                                  ? {
                                                      ...current,
                                                      rows: current.rows.map((entry, index) =>
                                                        index === rowIndex
                                                          ? {
                                                              ...entry,
                                                              values: {
                                                                ...entry.values,
                                                                [column.key]: event.target.value,
                                                              },
                                                            }
                                                          : entry,
                                                      ),
                                                    }
                                                  : current,
                                              )
                                            }
                                          >
                                            <option value="">Select...</option>
                                            {(column.options ?? []).map((option) => (
                                              <option key={option.value} value={option.value}>
                                                {option.label}
                                              </option>
                                            ))}
                                          </select>
                                        ) : (
                                          <input
                                            className={styles.confirmationSelect}
                                            value={row.values[column.key] ?? ""}
                                            inputMode={
                                              isCurrencyFieldKey(column.key)
                                                ? "decimal"
                                                : isDateFieldKey(column.key)
                                                  ? "numeric"
                                                  : undefined
                                            }
                                            onChange={(event) =>
                                              setEditorCard((current) =>
                                                current && current.kind === "collection_table"
                                                  ? {
                                                      ...current,
                                                      rows: current.rows.map((entry, index) =>
                                                        index === rowIndex
                                                          ? {
                                                              ...entry,
                                                              values: {
                                                                ...entry.values,
                                                                [column.key]: isCurrencyFieldKey(column.key)
                                                                  ? formatCurrencyValue(event.target.value)
                                                                  : isDateFieldKey(column.key)
                                                                    ? formatDateValue(event.target.value)
                                                                    : event.target.value,
                                                              },
                                                            }
                                                          : entry,
                                                      ),
                                                    }
                                                  : current,
                                              )
                                            }
                                          />
                                        )}
                                      </span>
                                    ))}
                                    <span className={`${styles.batchTableCell} ${styles.dataTableActionCell}`.trim()}>
                                      <button
                                        type="button"
                                        className={styles.planCancelButton}
                                        onClick={() =>
                                          setEditorCard((current) =>
                                            current && current.kind === "collection_table"
                                              ? {
                                                  ...current,
                                                  rows: current.rows.filter((entry) => entry.id !== row.id),
                                                }
                                              : current,
                                          )
                                        }
                                      >
                                        Remove
                                      </button>
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : editorCard.fields.map((field) => (
                            <label
                              key={field.key}
                              className={`${styles.confirmationField} ${field.input === "textarea" ? styles.confirmationFieldFull : ""}`.trim()}
                            >
                              <span className={styles.fieldHeader}>
                                <span className={styles.planPreviewLabel}>{field.label}</span>
                                {editorCard.toolName === "create_file_note" && field.key === "content" ? (
                                  <button
                                    type="button"
                                    className={styles.inlineAssistButton}
                                    onClick={() =>
                                      void handleInlineFileNoteAssist(
                                        "content",
                                        field.value,
                                      )
                                    }
                                    disabled={isSending || !field.value.trim()}
                                  >
                                    Generate with Finley
                                  </button>
                                ) : null}
                              </span>
                              {field.input === "select" ? (
                                <select
                                  className={styles.confirmationSelect}
                                  value={field.value}
                                  onFocus={() =>
                                    setActiveAssistField(
                                      editorCard.toolName === "create_file_note" &&
                                        (field.key === "subject" || field.key === "content")
                                        ? field.key
                                        : null,
                                    )
                                  }
                                  onChange={(event) =>
                                    setEditorCard((current) =>
                                      current
                                        && current.kind === "collection_form"
                                        ? {
                                            ...current,
                                            fields: current.fields.map((entry) => {
                                              if (entry.key === field.key) {
                                                if (field.key === "subject") {
                                                  setFileNoteSubjectManuallyEdited(true);
                                                }
                                                return { ...entry, value: event.target.value };
                                              }

                                              if (
                                                current.toolName === "create_file_note" &&
                                                field.key === "type" &&
                                                entry.key === "subType"
                                              ) {
                                                const nextSubTypes = FINLEY_FILE_NOTE_SUBTYPE_OPTIONS[event.target.value] ?? [];
                                                return {
                                                  ...entry,
                                                  value: nextSubTypes[0] ?? "",
                                                  options: nextSubTypes.map((option) => ({ label: option, value: option })),
                                                };
                                              }

                                              return entry;
                                            }),
                                          }
                                        : current,
                                    )
                                  }
                                >
                                  <option value="">Select...</option>
                                  {(field.options ?? []).map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              ) : field.input === "textarea" ? (
                                <textarea
                                  className={styles.confirmationSelect}
                                  rows={6}
                                  value={field.value}
                                  onFocus={() =>
                                    setActiveAssistField(
                                      editorCard.toolName === "create_file_note" &&
                                        (field.key === "subject" || field.key === "content")
                                        ? field.key
                                        : null,
                                    )
                                  }
                                  onBlur={(event) => {
                                    if (editorCard.toolName === "create_file_note" && field.key === "content") {
                                      void handleInlineFileNoteAssist("content", event.target.value);
                                    }
                                  }}
                                  onChange={(event) =>
                                    setEditorCard((current) =>
                                      current
                                        && current.kind === "collection_form"
                                        ? {
                                            ...current,
                                            fields: current.fields.map((entry) =>
                                              entry.key === field.key
                                                ? {
                                                    ...entry,
                                                    value: event.target.value,
                                                  }
                                                : entry,
                                            ),
                                          }
                                        : current,
                                    )
                                  }
                                />
                              ) : (
                                <input
                                  className={styles.confirmationSelect}
                                  value={field.value}
                                  inputMode={
                                    isCurrencyFieldKey(field.key) || isPercentFieldKey(field.key)
                                      ? "decimal"
                                      : isDateFieldKey(field.key)
                                        ? "numeric"
                                        : undefined
                                  }
                                  onFocus={() =>
                                    setActiveAssistField(
                                      editorCard.toolName === "create_file_note" &&
                                        (field.key === "subject" || field.key === "content")
                                        ? field.key
                                        : null,
                                    )
                                  }
                                  onBlur={(event) => {
                                    if (editorCard.toolName === "create_file_note" && field.key === "subject") {
                                      void handleInlineFileNoteAssist("subject", event.target.value);
                                    }
                                  }}
                                  onChange={(event) =>
                                    (field.key === "subject" && setFileNoteSubjectManuallyEdited(true),
                                    setEditorCard((current) =>
                                      current
                                        && current.kind === "collection_form"
                                        ? {
                                            ...current,
                                            fields: current.fields.map((entry) =>
                                              entry.key === field.key
                                                ? {
                                                    ...entry,
                                                    value: isCurrencyFieldKey(field.key)
                                                      ? formatCurrencyValue(event.target.value)
                                                      : isPercentFieldKey(field.key)
                                                        ? formatPercentValue(event.target.value)
                                                        : isDateFieldKey(field.key)
                                                          ? formatDateValue(event.target.value)
                                                          : event.target.value,
                                                  }
                                                : entry,
                                            ),
                                          }
                                        : current,
                                    ))
                                  }
                                />
                              )}
                            </label>
                          ))}
                          {editorCard.kind === "collection_form" && editorCard.toolName === "create_file_note" ? (
                            <div className={`${styles.confirmationField} ${styles.confirmationFieldFull}`.trim()}>
                              <span className={styles.planPreviewLabel}>Attachments</span>
                              <div className={styles.uploadPlaceholder}>
                                <div className={styles.uploadPlaceholderTitle}>Add attachments</div>
                                <div className={styles.uploadPlaceholderText}>
                                  Choose files to attach to this note. The card will keep the selected file names ready for the API save.
                                </div>
                                <input
                                  ref={fileNoteAttachmentInputRef}
                                  type="file"
                                  multiple
                                  className={styles.hiddenFileInput}
                                  onChange={(event) => {
                                    handleFileNoteAttachmentsSelected(event.target.files);
                                    event.currentTarget.value = "";
                                  }}
                                />
                                <button
                                  type="button"
                                  className={styles.uploadPlaceholderButton}
                                  onClick={() => fileNoteAttachmentInputRef.current?.click()}
                                >
                                  Choose files
                                </button>
                                {fileNoteAttachments.length ? (
                                  <div className={styles.attachmentList}>
                                    {fileNoteAttachments.map((attachment, index) => (
                                      <div key={`${attachment.name ?? "attachment"}-${index}`} className={styles.attachmentItem}>
                                        <span className={styles.attachmentName}>{attachment.name ?? "Unnamed attachment"}</span>
                                        <button
                                          type="button"
                                          className={styles.attachmentRemoveButton}
                                          onClick={() =>
                                            setFileNoteAttachments((current) =>
                                              current.filter((_, currentIndex) => currentIndex !== index),
                                            )
                                          }
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                          {editorCard.kind === "collection_table" ? (
                            <div className={`${styles.confirmationField} ${styles.confirmationFieldFull}`.trim()}>
                              <button
                                type="button"
                                className={styles.planCancelButton}
                                onClick={() =>
                                  setEditorCard((current) =>
                                    current && current.kind === "collection_table"
                                      ? {
                                          ...current,
                                          rows: [
                                            ...current.rows,
                                            {
                                              id: `row-${crypto.randomUUID()}`,
                                              values: Object.fromEntries(current.columns.map((column) => [column.key, ""])),
                                            },
                                          ],
                                        }
                                      : current,
                                  )
                                }
                              >
                                Add row
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {previewRows(step.inputsPreview).length ? (
                        <div className={styles.planPreviewGrid}>
                          {previewRows(step.inputsPreview)
                            .filter(
                              (entry) =>
                                entry.label !== "Client Id" &&
                                entry.label !== "Profile Id" &&
                                (step.toolName !== "create_file_note" || (entry.label !== "Type" && entry.label !== "Sub Type")) &&
                                (!editorCard || editorCard.kind !== "collection_form" || !editorCard.fields.some((field) => field.label === entry.label)),
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
                  ? activeAssistField
                    ? `Use "Finley:" to draft the file note ${activeAssistField === "content" ? "body" : activeAssistField}...`
                    : `Ask Finley to work on ${activeClient.name ?? "this client"}...`
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
                  ? activeAssistField
                    ? `Selected field: ${activeAssistField === "content" ? "File note body" : "File note subject"}. Start your message with "Finley:" to draft into that field.`
                    : "Approval and execution appear here when Finley prepares a workflow."
                  : "Client context will appear here once you select a client."}
              </div>
              <div className={styles.composerActions}>
                <button
                  type="button"
                  className={styles.refreshButton}
                  onClick={handleRefreshChat}
                  disabled={isSending || (!messages.length && !planSummary && !displayCard && !editorCard && !factFindWorkflow)}
                >
                  Refresh chat
                </button>
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
