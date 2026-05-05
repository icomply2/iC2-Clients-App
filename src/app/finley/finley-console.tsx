"use client";

import JSZip from "jszip";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CreateClientDialog, type CreatedClientResponse } from "@/components/create-client-dialog";
import type { ClientProfile, ClientSummary, FileNoteRecord, PersonRecord } from "@/lib/api/types";
import { mockClientSummaries } from "@/lib/client-mocks";
import {
  FINLEY_FILE_NOTE_SUBTYPE_OPTIONS,
  type FinleyDisplayCard,
  type FinleyEditorCard,
  type FinleyFactFindWorkflow,
  type FinleyTableEditorCard,
  type FinleyChatResponse,
} from "@/lib/finley-shared";
import { cacheFileNoteAttachments } from "@/lib/file-note-attachment-cache";
import { DEFAULT_SERVICE_AGREEMENT_SERVICES, groupServiceAgreementServices } from "@/lib/documents/document-sections";
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

type EngagementLetterDraftValue = {
  reasonsHtml: string;
  servicesHtml: string;
  advicePreparationFee: string;
  implementationFee: string;
};

type AgreementType = "ongoing" | "annual";

type AgreementDraftCardState = {
  title: string;
  description: string;
  agreementType: AgreementType;
  clientName: string;
  clientAddressLines?: string[];
  adviserName?: string | null;
  practiceName?: string | null;
  licenseeName?: string | null;
  services: string[];
};

type InvoicePlaceholderItem = {
  id: string;
  description: string;
  quantity: string;
  priceExGst: string;
};

type InvoiceRecipientOption = {
  value: string;
  label: string;
  email: string;
};

type InvoicePlaceholderCard = {
  title: string;
  description: string;
  note: string;
  referenceNumber: string;
  clientName: string;
  clientNameOptions: InvoiceRecipientOption[];
  clientEmail: string;
  adviserName: string;
  serviceType: string;
  clientEntityId: string;
  dueDate: string;
  includeStripePaymentLink: boolean;
  printAsPdf: boolean;
  items: InvoicePlaceholderItem[];
};

type CurrentUserScope = {
  name?: string | null;
  userRole?: string | null;
  practice?: {
    id?: string | null;
    name?: string | null;
  } | null;
  licensee?: {
    id?: string | null;
    name?: string | null;
  } | null;
};

type ConciergeDocumentTag =
  | "fact-find"
  | "meeting-transcript"
  | "insurance-quote"
  | "insurance-needs-analysis"
  | "productrex"
  | "strategy-paper"
  | "engagement-letter"
  | "record-of-advice"
  | "service-agreement"
  | "invoice"
  | "unknown";

type ConciergeUpload = {
  id: string;
  name: string;
  mimeType?: string | null;
  extractedText?: string | null;
  tags: ConciergeDocumentTag[];
};

type ConciergeSuggestedTask = {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  action:
    | "fact_find"
    | "file_note"
    | "engagement_letter"
    | "record_of_advice"
    | "create_invoice"
    | "ongoing_agreement"
    | "annual_agreement"
    | "service_agreement"
    | "summarise_documents";
};

function EngagementLetterRender({
  draft,
  clientName,
  adviserName,
  practiceName,
  licenseeName,
  onExport,
  isExporting,
  exportError,
}: {
  draft: EngagementLetterDraftValue;
  clientName: string;
  adviserName?: string | null;
  practiceName?: string | null;
  licenseeName?: string | null;
  onExport: () => void | Promise<void>;
  isExporting: boolean;
  exportError?: string | null;
}) {
  const advicePreparationFee = parseCurrencyAmount(draft.advicePreparationFee);
  const implementationFee = parseCurrencyAmount(draft.implementationFee);
  const totalFee = advicePreparationFee + implementationFee;
  const clientFirstName = firstName(clientName) || clientName;
  const servicesHtml = stripHtml(draft.servicesHtml)
    ? draft.servicesHtml
    : buildDefaultEngagementServicesHtml(clientName);
  const practice = practiceName?.trim() || "<<practice>>";
  const visibleExportError = exportError && !/docmosis/i.test(exportError) ? exportError : null;

  return (
    <div className={styles.engagementRender}>
      <div className={styles.engagementRenderToolbar}>
        <div>
          <div className={styles.planLabel}>Live render</div>
          <div className={styles.engagementRenderTitle}>Engagement Letter</div>
        </div>
        <button
          type="button"
          className={styles.engagementRenderButton}
          onClick={() => void onExport()}
          disabled={isExporting}
        >
          {isExporting ? "Generating..." : "Export Word"}
        </button>
      </div>

      {visibleExportError ? <div className={styles.planWarning}>{visibleExportError}</div> : null}

      <div className={styles.engagementPage}>
        <div className={styles.engagementDate}>{formatToday()}</div>
        <div className={styles.engagementAddressBlock}>
          <strong>{clientName}</strong>
          <span>&lt;&lt;client.address&gt;&gt;</span>
          <span>&lt;&lt;client.suburb&gt;&gt; &lt;&lt;client.state&gt;&gt; &lt;&lt;client.postcode&gt;&gt;</span>
        </div>

        <p>Dear {clientFirstName},</p>

        <h1>Engagement Letter</h1>

        <h2>Terms of Engagement</h2>
        <p>
          Further to our meeting and discussions, this document sets out to:
        </p>
        <ul className={styles.engagementList}>
          <li>Detail your service expectations and outcomes, specify the service deliverables.</li>
          <li>Provide a fee estimate.</li>
          <li>Explain our trading terms and method of billing, and inform you of your next steps.</li>
          <li>Provide general education information on the various financial concepts identified during our meeting.</li>
        </ul>
        <p>
          An important part of our business philosophy is clear communication. We believe that it is essential that both
          the client and the advisor have a clear understanding of their respective expectations and obligations in
          relation to the provision of our services.
        </p>
        <p>
          The world of finance, taxation and business advice has become more complex in recent years. Increasingly we
          find ourselves advising on and providing a far broader range of services than ever before. This document
          summarises the key elements of our future relationship so that we may ensure that your objectives are met and
          that potential misunderstandings are avoided.
        </p>

        <h2>Fee Estimate</h2>
        <table className={styles.engagementFeeTable}>
          <thead>
            <tr>
              <th>Fee type</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Advice preparation fee</td>
              <td>{formatCurrencyAmount(advicePreparationFee)}</td>
            </tr>
            <tr>
              <td>Implementation fee</td>
              <td>{formatCurrencyAmount(implementationFee)}</td>
            </tr>
            <tr className={styles.engagementFeeTotal}>
              <td>Total</td>
              <td>{formatCurrencyAmount(totalFee)}</td>
            </tr>
          </tbody>
        </table>

        <h2>Initial Advice Service</h2>
        <p>
          In order to achieve the outcomes and expectations for your particular circumstances, the services that we will
          deliver are summarised below.
        </p>

        <h3>Tasks to be completed by us:</h3>
        <div className={styles.engagementRichText} dangerouslySetInnerHTML={{ __html: servicesHtml }} />

        <p>
          Where the implementation of your financial plan incurs additional costs, these will be disclosed to you in your
          Statement of Advice. Where your decision leads to a clawback of commission, we reserve the right to charge a
          fee to recoup our costs.
        </p>
        <p>
          Should we discover that the advice you require is more complex than we had originally thought, we may need to
          increase this fee. In this event, we will consult with you first before you incur any additional cost.
        </p>

        <h2>Ongoing Advice Service</h2>
        <p>
          We may find as a result of our conversations with you that you would value ongoing advice. If this is the case,
          we will provide you with an Ongoing Adviser Service Agreement for your consideration at the time of advice
          presentation.
        </p>
        <p>
          If you feel this service will be valuable to you, we would be happy to provide you with a fee estimate prior to
          you engaging with our initial advice service.
        </p>

        <h2>Next Steps</h2>
        <p>
          Upon your completion of this engagement letter, we will contact you to begin the data collection process that
          will allow us to completely understand your current situation, lifestyle objectives and goals.
        </p>

        <h2>Agreement</h2>
        <p>
          We ask that you sign this letter to confirm your understanding of these arrangements and to confirm our
          engagement as your advisors. Could you please return a copy of this engagement letter to {practice}.
          Alternatively, if you wish to further clarify any of the matters contained in this agreement, please contact
          your adviser.
        </p>
        <p>
          By agreeing to this document, either by printing and signing, electronic signature or written confirmation, you
          are confirming your understanding of our business arrangements, and agreeing to pay the fee disclosed on the
          first page of this document.
        </p>
        <p>This offer of engagement is valid for 30 days from its issue.</p>
        <p>
          We take this opportunity to once again thank you for our appointment. We look forward to a mutually beneficial
          business partnership.
        </p>

        <div className={styles.engagementSignoff}>
          <p>Yours sincerely,</p>
          <strong>{adviserName?.trim() || "<<adviser.name>>"}</strong>
          <span>{practiceName?.trim() || "<<practice.name>>"}</span>
          <span>{licenseeName?.trim() || "<<licensee.name>>"}</span>
        </div>
      </div>
    </div>
  );
}

function AgreementRender({
  agreement,
  onExport,
  isExporting,
  exportError,
}: {
  agreement: AgreementDraftCardState;
  onExport: () => void | Promise<void>;
  isExporting: boolean;
  exportError?: string | null;
}) {
  const isAnnual = agreement.agreementType === "annual";
  const clientFirstName = firstName(agreement.clientName) || agreement.clientName;
  const services = agreement.services.length ? agreement.services : DEFAULT_SERVICE_AGREEMENT_SERVICES;
  const serviceGroups = groupServiceAgreementServices(services);
  const title = isAnnual ? "Annual Advice Agreement" : "Ongoing Service Agreement";

  return (
    <div className={styles.engagementRender}>
      <div className={styles.engagementRenderToolbar}>
        <div>
          <div className={styles.planLabel}>Live render</div>
          <div className={styles.engagementRenderTitle}>{title}</div>
        </div>
        <button
          type="button"
          className={styles.engagementRenderButton}
          onClick={() => void onExport()}
          disabled={isExporting}
        >
          {isExporting ? "Generating..." : "Export Word"}
        </button>
      </div>

      {exportError ? <div className={styles.planWarning}>{exportError}</div> : null}

      <div className={styles.engagementPage}>
        <div className={styles.engagementDate}>{formatToday()}</div>
        <div className={styles.engagementAddressBlock}>
          <strong>{agreement.clientName}</strong>
          {agreement.clientAddressLines?.length ? (
            agreement.clientAddressLines.map((line) => <span key={line}>{line}</span>)
          ) : (
            <>
              <span>&lt;&lt;address&gt;&gt;</span>
              <span>&lt;&lt;Suburb&gt;&gt; &lt;&lt;State&gt;&gt; &lt;&lt;Postcode&gt;&gt;</span>
            </>
          )}
        </div>

        <p>Dear {clientFirstName},</p>

        <h1>{title}</h1>
        {isAnnual ? (
          <>
            <p>
              As your Financial Adviser, it is our role to provide you with the advice you need to achieve your
              financial goals. The purpose of this letter is to establish an Annual Advice Agreement.
            </p>
            <p>
              The services you receive as part of your Annual Advice Agreement are important as they offer support to
              help you stay on track. The terms of the Annual Advice Agreement, including the services you are entitled
              to and the cost, are set out below.
            </p>
            <p>
              This arrangement will be between {agreement.clientName} and{" "}
              {agreement.practiceName?.trim() || "<<practice.name>>"}. The arrangement will commence on the date you
              sign this agreement.
            </p>
          </>
        ) : (
          <>
            <p>
              As your Financial Adviser, it is our role to provide you with the advice you need to achieve your
              financial goals. This Ongoing Service Agreement sets out the terms and conditions of our services.
            </p>
            <p>
              We cannot enter into an Ongoing Service Agreement without this agreement and the relevant fee consent
              being signed and dated by you. Your ongoing fee arrangement will need to be renewed annually.
            </p>
            <p>
              The commencement date of this arrangement is the date you sign this agreement. Upon signing this
              agreement, any existing service agreement between us is deemed to be automatically terminated and replaced
              by this agreement.
            </p>
          </>
        )}

        <h2>{isAnnual ? "My Annual Advice Service Includes" : "The Services You Are Entitled To Receive"}</h2>
        {serviceGroups.map((group, index) => (
          <div key={`${group.heading ?? "services"}-${index}`} className={styles.engagementRichText}>
            {group.heading ? <h3>{group.heading}</h3> : null}
            {group.items.length ? (
              <ul>
                {group.items.map((item, itemIndex) => (
                  <li key={`${itemIndex}-${item}`}>{item}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}

        <h2>Fees Payable</h2>
        <p>The fees payable for this agreement are set out below. All fees include GST where applicable.</p>
        <table className={styles.engagementFeeTable}>
          <thead>
            <tr>
              <th>Entity</th>
              <th>Product</th>
              <th>Fee amount</th>
              <th>Frequency</th>
              <th>Annual fee</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>To be confirmed</td>
              <td>To be confirmed</td>
              <td>$0.00</td>
              <td>Monthly</td>
              <td>$0.00</td>
            </tr>
            <tr className={styles.engagementFeeTotal}>
              <td colSpan={4}>Total annual advice fees</td>
              <td>$0.00</td>
            </tr>
          </tbody>
        </table>

        <h2>Consent To Deduct Fees From Your Account</h2>
        <p>
          By signing this consent, you authorise the agreed advice fees to be deducted from the nominated account for
          the services described in this agreement.
        </p>
        <p>This consent may be withdrawn by you at any time by notifying us in writing.</p>

        <h2>{isAnnual ? "Next Steps" : "Your Acknowledgement"}</h2>
        <p>
          {isAnnual
            ? "Please sign the acknowledgement below and accept the Annual Advice Agreement outlined in this letter."
            : "You agree to be bound by the terms and conditions of this agreement. You may terminate or vary the agreement at any time by notifying us in writing."}
        </p>

        <div className={styles.engagementSignoff}>
          <p>Signed: ______________________________</p>
          <strong>{agreement.clientName}</strong>
          <p>Date: ______________________________</p>
          <p>Adviser: {agreement.adviserName?.trim() || "<<adviser.name>>"}</p>
          <span>{agreement.practiceName?.trim() || "<<practice.name>>"}</span>
          <span>{agreement.licenseeName?.trim() || "<<licensee.name>>"}</span>
        </div>
      </div>
    </div>
  );
}

function invoiceItemAmounts(item: InvoicePlaceholderItem) {
  const quantity = parseCurrencyValue(item.quantity) ?? 0;
  const unitPrice = parseCurrencyValue(item.priceExGst) ?? 0;
  const subtotal = quantity * unitPrice;
  const gst = subtotal * 0.1;
  const total = subtotal + gst;

  return { quantity, unitPrice, gst, total };
}

function InvoiceWorkflowCard({
  invoice,
  practiceName,
  licenseeName,
  onChange,
  onExport,
  isExporting,
  exportError,
}: {
  invoice: InvoicePlaceholderCard;
  practiceName?: string | null;
  licenseeName?: string | null;
  onChange: (invoice: InvoicePlaceholderCard) => void;
  onExport: () => void | Promise<void>;
  isExporting: boolean;
  exportError?: string | null;
}) {
  const lineItems = invoice.items.filter((item) => item.description.trim() || item.quantity.trim() || item.priceExGst.trim());
  const total = lineItems.reduce((sum, item) => sum + invoiceItemAmounts(item).total, 0);
  const visibleExportError = exportError && !/docmosis/i.test(exportError) ? exportError : null;

  function updateInvoice(patch: Partial<InvoicePlaceholderCard>) {
    onChange({ ...invoice, ...patch });
  }

  function updateItem(itemId: string, patch: Partial<InvoicePlaceholderItem>) {
    updateInvoice({
      items: invoice.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    });
  }

  function addItem() {
    updateInvoice({
      items: [
        ...invoice.items,
        {
          id: `invoice-item-${crypto.randomUUID()}`,
          description: "",
          quantity: "1",
          priceExGst: "",
        },
      ],
    });
  }

  function removeItem(itemId: string) {
    const nextItems = invoice.items.filter((item) => item.id !== itemId);
    updateInvoice({
      items: nextItems.length
        ? nextItems
        : [
            {
              id: `invoice-item-${crypto.randomUUID()}`,
              description: "Advice services",
              quantity: "1",
              priceExGst: "",
            },
          ],
    });
  }

  return (
    <div className={styles.workflowCard}>
      <div className={styles.workflowHeader}>
        <div>
          <div className={styles.planLabel}>Invoice workflow</div>
          <div className={styles.planSummary}>{invoice.title}</div>
          <div className={styles.workflowDescription}>
            Review the invoice details, keep the structured data ready for Xero, and export the invoice document when it is ready.
          </div>
        </div>
        <div className={styles.workflowStepBadge}>Structured invoice</div>
      </div>

      {visibleExportError ? (
        <div className={styles.planWarnings}>
          <div className={styles.planWarning}>{visibleExportError}</div>
        </div>
      ) : null}

      <div className={styles.confirmationEditor}>
        <label className={styles.confirmationField}>
          <span className={styles.planPreviewLabel}>Invoice reference</span>
          <input
            className={styles.confirmationSelect}
            value={invoice.referenceNumber}
            onChange={(event) => updateInvoice({ referenceNumber: event.target.value })}
          />
        </label>
        <label className={styles.confirmationField}>
          <span className={styles.planPreviewLabel}>Bill to / Xero contact</span>
          <select
            className={styles.confirmationSelect}
            value={invoice.clientName}
            onChange={(event) => {
              const selected = invoice.clientNameOptions.find((option) => option.value === event.target.value);
              updateInvoice({
                clientName: event.target.value,
                clientEmail: selected?.email ?? invoice.clientEmail,
              });
            }}
          >
            {invoice.clientNameOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.confirmationField}>
          <span className={styles.planPreviewLabel}>Client email</span>
          <input
            className={styles.confirmationSelect}
            value={invoice.clientEmail}
            onChange={(event) => updateInvoice({ clientEmail: event.target.value })}
          />
        </label>
        <label className={styles.confirmationField}>
          <span className={styles.planPreviewLabel}>Due date</span>
          <input
            className={styles.confirmationSelect}
            type="date"
            value={invoice.dueDate}
            onChange={(event) => updateInvoice({ dueDate: event.target.value })}
          />
        </label>
        <label className={styles.confirmationField}>
          <span className={styles.planPreviewLabel}>Service type</span>
          <input
            className={styles.confirmationSelect}
            value={invoice.serviceType}
            onChange={(event) => updateInvoice({ serviceType: event.target.value })}
            placeholder="e.g. Initial advice, SOA, review"
          />
        </label>
        <label className={styles.confirmationField}>
          <span className={styles.planPreviewLabel}>Adviser</span>
          <input
            className={styles.confirmationSelect}
            value={invoice.adviserName}
            onChange={(event) => updateInvoice({ adviserName: event.target.value })}
          />
        </label>
      </div>

      <div className={styles.planStep}>
        <span className={styles.planStepText}>Revenue items</span>
        <div className={styles.invoiceLineItemsCard}>
          <div className={styles.invoiceLineItemsHeader}>
            <span>Description</span>
            <span>Qty</span>
            <span>Unit price</span>
            <span>GST</span>
            <span>Total</span>
            <span />
          </div>
          {invoice.items.map((item) => {
            const amounts = invoiceItemAmounts(item);
            return (
              <div key={item.id} className={styles.invoiceLineItemRow}>
                <input
                  className={styles.confirmationSelect}
                  value={item.description}
                  onChange={(event) => updateItem(item.id, { description: event.target.value })}
                  placeholder="Description"
                />
                <input
                  className={styles.confirmationSelect}
                  value={item.quantity}
                  inputMode="decimal"
                  onChange={(event) => updateItem(item.id, { quantity: event.target.value })}
                />
                <input
                  className={styles.confirmationSelect}
                  value={item.priceExGst}
                  inputMode="decimal"
                  onBlur={(event) => updateItem(item.id, { priceExGst: formatCurrencyValue(event.target.value) })}
                  onChange={(event) => updateItem(item.id, { priceExGst: event.target.value })}
                />
                <span className={styles.invoiceCalculatedAmount}>{formatCurrencyAmount(amounts.gst)}</span>
                <span className={styles.invoiceCalculatedAmount}>{formatCurrencyAmount(amounts.total)}</span>
                <button
                  type="button"
                  className={styles.invoiceDeleteItemButton}
                  onClick={() => removeItem(item.id)}
                  aria-label="Remove revenue item"
                  title="Remove revenue item"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                    <path d="M6 6l1 15h10l1-15" />
                  </svg>
                </button>
              </div>
            );
          })}
          <div className={styles.invoiceAddItemRow}>
            <button type="button" className={styles.invoiceAddItemButton} onClick={addItem}>
              Add revenue item
            </button>
          </div>
        </div>
      </div>

      <div className={styles.planPreviewGrid}>
        <div className={styles.planPreviewItem}>
          <span className={styles.planPreviewLabel}>Xero contact</span>
          <span className={styles.planPreviewValue}>{invoice.clientName || "-"}</span>
        </div>
        <div className={styles.planPreviewItem}>
          <span className={styles.planPreviewLabel}>Invoice reference</span>
          <span className={styles.planPreviewValue}>{invoice.referenceNumber || "-"}</span>
        </div>
        <div className={styles.planPreviewItem}>
          <span className={styles.planPreviewLabel}>Practice</span>
          <span className={styles.planPreviewValue}>{practiceName || licenseeName || "-"}</span>
        </div>
        <div className={styles.planPreviewItem}>
          <span className={styles.planPreviewLabel}>Total incl. GST</span>
          <span className={styles.planPreviewValue}>{formatCurrencyAmount(total)}</span>
        </div>
      </div>

      <div className={styles.workflowGuidance}>
        Next build: this same structured card can be posted to Xero using the contact, invoice reference, due date, and revenue item rows above.
      </div>

      <div className={styles.workflowActions}>
        <div />
        <div className={styles.workflowActionsRight}>
          <button
            type="button"
            className={styles.planCancelButton}
            onClick={() => onChange({ ...invoice, includeStripePaymentLink: !invoice.includeStripePaymentLink })}
          >
            {invoice.includeStripePaymentLink ? "Payment link on" : "Payment link off"}
          </button>
          <button
            type="button"
            className={styles.planApproveButton}
            onClick={() => void onExport()}
            disabled={isExporting}
          >
            {isExporting ? "Generating..." : "Export Word"}
          </button>
        </div>
      </div>
    </div>
  );
}

function normalizeText(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function isTextExtractableFile(file: File) {
  const lowerName = file.name.toLowerCase();
  return (
    file.type.startsWith("text/") ||
    [
      ".txt",
      ".md",
      ".markdown",
      ".csv",
      ".json",
      ".xml",
      ".html",
      ".htm",
      ".rtf",
      ".log",
    ].some((extension) => lowerName.endsWith(extension))
  );
}

async function extractUploadText(file: File) {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".docx")) {
    try {
      const buffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(buffer);
      const documentXml = await zip.file("word/document.xml")?.async("string");

      if (!documentXml) {
        return null;
      }

      const parser = new DOMParser();
      const xml = parser.parseFromString(documentXml, "application/xml");
      const paragraphNodes = Array.from(xml.getElementsByTagName("w:p"));
      const text = paragraphNodes
        .map((paragraph) =>
          Array.from(paragraph.getElementsByTagName("w:t"))
            .map((node) => node.textContent ?? "")
            .join(""),
        )
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n");

      return text ? text.slice(0, 12000) : null;
    } catch {
      return null;
    }
  }

  if (!isTextExtractableFile(file)) {
    return null;
  }

  try {
    const text = await file.text();
    const trimmed = text.trim();
    return trimmed ? trimmed.slice(0, 12000) : null;
  } catch {
    return null;
  }
}

function detectConciergeDocumentTags(fileName: string, extractedText?: string | null): ConciergeDocumentTag[] {
  const name = normalizeText(fileName);
  const text = normalizeText(extractedText ?? "");
  const tags = new Set<ConciergeDocumentTag>();

  if (
    name.includes("fact find") ||
    name.includes("fact-find") ||
    name.includes("factfind") ||
    name.includes("client data form") ||
    text.includes("fact find") ||
    (text.includes("personal details") && text.includes("assets") && text.includes("liabilities"))
  ) {
    tags.add("fact-find");
  }

  if (
    name.includes("transcript") ||
    name.includes("meeting notes") ||
    name.includes("meeting summary") ||
    text.includes("transcript") ||
    text.includes("meeting with")
  ) {
    tags.add("meeting-transcript");
  }

  if (name.includes("productrex") || text.includes("productrex")) {
    tags.add("productrex");
  }

  if (
    ((name.includes("insurance quote") || name.includes("quote")) &&
      (name.includes("insurance") || name.includes("metlife") || name.includes("hostplus"))) ||
    text.includes("quotation summary") ||
    text.includes("cover summary")
  ) {
    tags.add("insurance-quote");
  }

  if (name.includes("insurance needs") || text.includes("insurance needs analysis")) {
    tags.add("insurance-needs-analysis");
  }

  if (name.includes("strategy paper") || text.includes("strategy paper")) {
    tags.add("strategy-paper");
  }

  if (name.includes("engagement letter") || text.includes("engagement letter")) {
    tags.add("engagement-letter");
  }

  if (name.includes("record of advice") || name.includes("roa") || text.includes("record of advice")) {
    tags.add("record-of-advice");
  }

  if (name.includes("service agreement") || text.includes("service agreement")) {
    tags.add("service-agreement");
  }

  if (name.includes("invoice") || text.includes("tax invoice")) {
    tags.add("invoice");
  }

  return tags.size ? Array.from(tags) : ["unknown"];
}

function getConciergeTagLabel(tag: ConciergeDocumentTag) {
  switch (tag) {
    case "fact-find":
      return "Fact Find detected";
    case "meeting-transcript":
      return "Meeting transcript detected";
    case "insurance-quote":
      return "Insurance quote detected";
    case "insurance-needs-analysis":
      return "Insurance needs analysis detected";
    case "productrex":
      return "ProductRex detected";
    case "strategy-paper":
      return "Strategy paper detected";
    case "engagement-letter":
      return "Engagement letter detected";
    case "record-of-advice":
      return "Record of Advice detected";
    case "service-agreement":
      return "Service agreement detected";
    case "invoice":
      return "Invoice detected";
    default:
      return "Document uploaded";
  }
}

function filterClientSummariesByPractice(
  clients: FinleyClientSummary[],
  practiceName?: string | null,
) {
  const normalizedPractice = practiceName?.trim().toLowerCase();

  if (!normalizedPractice) {
    return clients;
  }

  return clients.filter(
    (client) => client.clientAdviserPracticeName?.trim().toLowerCase() === normalizedPractice,
  );
}

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

function normalizeFactFindWorkflow(workflow: FinleyFactFindWorkflow | null) {
  if (!workflow) return null;

  return {
    ...workflow,
    steps: workflow.steps.map((step) => ({
      ...step,
      editorCard: normalizeEditorCard(step.editorCard ?? null),
    })),
  };
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function firstName(value?: string | null) {
  return value?.trim().split(/\s+/)[0] ?? "";
}

function formatToday() {
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function parseCurrencyAmount(value?: string | null) {
  const numeric = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));

  return Number.isFinite(numeric) ? numeric : 0;
}

function formatCurrencyAmount(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function buildDefaultEngagementReasonsHtml(clientName: string, adviserName?: string | null) {
  const adviser = adviserName?.trim() || "your adviser";

  return [
    `<p>${clientName} is seeking advice to confirm current priorities and set a clear scope for the next stage of advice.</p>`,
    "<ul>",
    "<li>Review your current financial position and identify the key advice needs to be addressed.</li>",
    "<li>Clarify the advice services, deliverables, and next steps for this engagement.</li>",
    `<li>Document the basis on which ${adviser} will provide advice and implementation support.</li>`,
    "</ul>",
  ].join("");
}

function buildDefaultEngagementServicesHtml(clientName: string) {
  return [
    `<p>The following services are proposed for ${clientName} as part of this engagement:</p>`,
    "<ul>",
    "<li>Initial discovery and fact find review.</li>",
    "<li>Research and preparation of advice recommendations.</li>",
    "<li>Presentation of advice and discussion of recommended next steps.</li>",
    "<li>Implementation support for agreed recommendations, where instructed.</li>",
    "</ul>",
  ].join("");
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

function personAddressLines(person?: PersonRecord | null) {
  const street = formatPreviewValue(person?.street)
    || formatPreviewValue(person?.addressStreet)
    || formatPreviewValue(person?.address?.street)
    || formatPreviewValue(person?.address?.line1);
  const suburb = formatPreviewValue(person?.suburb)
    || formatPreviewValue(person?.addressSuburb)
    || formatPreviewValue(person?.address?.suburb)
    || formatPreviewValue(person?.address?.city);
  const state = formatPreviewValue(person?.state)
    || formatPreviewValue(person?.addressState)
    || formatPreviewValue(person?.address?.state)
    || formatPreviewValue(person?.address?.region);
  const postcode = formatPreviewValue(person?.postCode)
    || formatPreviewValue(person?.postcode)
    || formatPreviewValue(person?.addressPostCode)
    || formatPreviewValue(person?.address?.postCode)
    || formatPreviewValue(person?.address?.postcode)
    || formatPreviewValue(person?.address?.zipCode);
  const locality = [suburb, state, postcode].filter(Boolean).join(" ");

  return [street, locality].filter(Boolean) as string[];
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
  const [currentUserScope, setCurrentUserScope] = useState<CurrentUserScope | null>(null);
  const [displayCard, setDisplayCard] = useState<FinleyDisplayCard | null>(null);
  const [editorCard, setEditorCard] = useState<FinleyEditorCard | FinleyTableEditorCard | null>(null);
  const [factFindWorkflow, setFactFindWorkflow] = useState<FinleyFactFindWorkflow | null>(null);
  const [factFindStepIndex, setFactFindStepIndex] = useState(0);
  const [engagementLetterDraftCard, setEngagementLetterDraftCard] = useState<EngagementLetterDraftCardState | null>(null);
  const [agreementDraftCard, setAgreementDraftCard] = useState<AgreementDraftCardState | null>(null);
  const [documentPlaceholderCard, setDocumentPlaceholderCard] = useState<EngagementLetterPlaceholderCard | null>(null);
  const [invoicePlaceholderCard, setInvoicePlaceholderCard] = useState<InvoicePlaceholderCard | null>(null);
  const [isSavingFactFindStep, setIsSavingFactFindStep] = useState(false);
  const [isGeneratingFactFindDocx, setIsGeneratingFactFindDocx] = useState(false);
  const [factFindWorkflowError, setFactFindWorkflowError] = useState<string | null>(null);
  const [isGeneratingEngagementLetterDocx, setIsGeneratingEngagementLetterDocx] = useState(false);
  const [engagementLetterWorkflowError, setEngagementLetterWorkflowError] = useState<string | null>(null);
  const [isGeneratingAgreementDocx, setIsGeneratingAgreementDocx] = useState(false);
  const [agreementWorkflowError, setAgreementWorkflowError] = useState<string | null>(null);
  const [isGeneratingInvoiceDocx, setIsGeneratingInvoiceDocx] = useState(false);
  const [invoiceWorkflowError, setInvoiceWorkflowError] = useState<string | null>(null);
  const [activeAssistField, setActiveAssistField] = useState<"subject" | "content" | null>(null);
  const [fileNoteSubjectManuallyEdited, setFileNoteSubjectManuallyEdited] = useState(false);
  const [fileNoteAttachments, setFileNoteAttachments] = useState<NonNullable<FileNoteRecord["attachment"]>>([]);
  const [fileNoteAttachmentFiles, setFileNoteAttachmentFiles] = useState<File[]>([]);
  const [conciergeUploads, setConciergeUploads] = useState<ConciergeUpload[]>([]);
  const [isUploadingConciergeFiles, setIsUploadingConciergeFiles] = useState(false);
  const conciergeUploadInputRef = useRef<HTMLInputElement | null>(null);
  const fileNoteAttachmentInputRef = useRef<HTMLInputElement | null>(null);

  const clients = serverClients;

  const activeClientId = searchParams.get("clientId") ?? initialClientId ?? "";

  const activeClient = useMemo(
    () => clients.find((client) => client.id === activeClientId) ?? null,
    [activeClientId, clients],
  );
  const latestAssistantMessageId = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant")?.id ?? null,
    [messages],
  );
  const conciergeUploadTags = useMemo(
    () => new Set(conciergeUploads.flatMap((upload) => upload.tags)),
    [conciergeUploads],
  );
  const conciergeSuggestedTasks = useMemo<ConciergeSuggestedTask[]>(() => {
    const tasks: ConciergeSuggestedTask[] = [];

    if (conciergeUploadTags.has("fact-find")) {
      tasks.push({
        id: "update-fact-find-from-upload",
        title: "Update the fact find",
        description: "Finley found fact find data that can be reviewed and used to update this client profile.",
        actionLabel: "Review fact find",
        action: "fact_find",
      });
    }

    if (conciergeUploadTags.has("meeting-transcript")) {
      tasks.push({
        id: "create-file-note-from-transcript",
        title: "Create a meeting file note",
        description: "Finley can summarise the transcript into a compliant file note for the client record.",
        actionLabel: "Create file note",
        action: "file_note",
      });
    }

    if (conciergeUploadTags.has("fact-find") || conciergeUploadTags.has("strategy-paper")) {
      tasks.push({
        id: "prepare-engagement-letter-from-context",
        title: "Prepare an engagement letter",
        description: "Use the uploaded client context to start the engagement letter scope and fee discussion.",
        actionLabel: "Prepare letter",
        action: "engagement_letter",
      });
    }

    if (conciergeUploadTags.has("insurance-quote") || conciergeUploadTags.has("insurance-needs-analysis")) {
      tasks.push({
        id: "summarise-insurance-documents",
        title: "Review insurance documents",
        description: "Finley found insurance material and can summarise quotes, needs analysis, and missing confirmations.",
        actionLabel: "Summarise insurance",
        action: "summarise_documents",
      });
    }

    if (conciergeUploadTags.has("service-agreement")) {
      tasks.push({
        id: "prepare-service-agreement",
        title: "Prepare a service agreement",
        description: "Finley can use the uploaded agreement context to help prepare or review the service agreement.",
        actionLabel: "Ongoing agreement",
        action: "ongoing_agreement",
      });
    }

    if (conciergeUploadTags.has("invoice")) {
      tasks.push({
        id: "create-invoice-from-upload",
        title: "Create an invoice",
        description: "Finley found invoice context and can help prepare the invoice workflow.",
        actionLabel: "Create invoice",
        action: "create_invoice",
      });
    }

    if (conciergeUploads.length && !tasks.length) {
      tasks.push({
        id: "summarise-uploaded-documents",
        title: "Review uploaded documents",
        description: "Finley can summarise what was uploaded and suggest the next action for this client.",
        actionLabel: "Review documents",
        action: "summarise_documents",
      });
    }

    return tasks.slice(0, 5);
  }, [conciergeUploadTags, conciergeUploads.length]);
  const conciergeInsightText = useMemo(() => {
    if (!conciergeUploads.length) {
      return "";
    }

    if (conciergeUploadTags.has("fact-find")) {
      return `I found a fact find for ${activeClient?.name ?? "this client"}. The most useful next step is to review the client profile updates before preparing client-facing documents. After that, I can create a file note or prepare the engagement letter.`;
    }

    if (conciergeUploadTags.has("meeting-transcript")) {
      return `I found meeting notes or a transcript. I can turn this into a file note first, then help identify missing information or prepare the next client document.`;
    }

    if (conciergeUploadTags.has("insurance-quote") || conciergeUploadTags.has("insurance-needs-analysis")) {
      return `I found insurance material. I can summarise the needs analysis and quotes, then help confirm what still needs adviser review.`;
    }

    if (conciergeUploadTags.has("productrex")) {
      return `I found ProductRex material. This is more likely to support advice preparation, but I can still summarise the product and replacement context here.`;
    }

    return `I’ve added the uploaded document${conciergeUploads.length > 1 ? "s" : ""}. I can review the content and suggest what to do next.`;
  }, [activeClient?.name, conciergeUploadTags, conciergeUploads.length]);
  const primaryConciergeTask = conciergeSuggestedTasks[0] ?? null;
  const secondaryConciergeTasks = conciergeSuggestedTasks.slice(1, 4);
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
          setServerClients(filterClientSummariesByPractice(nextClients, currentUserScope?.practice?.name));
        }
      } catch {
        if (!cancelled) {
          setServerClients(filterClientSummariesByPractice(mockClientSummaries, currentUserScope?.practice?.name));
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
  }, [clientSearch, currentUserScope?.practice?.name]);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUserScope() {
      try {
        const response = await fetch("/api/users/me", {
          method: "GET",
          cache: "no-store",
        });

        const body = (await response.json().catch(() => null)) as { data?: CurrentUserScope | null } | null;

        if (!response.ok || !body?.data || cancelled) {
          return;
        }

        setCurrentUserScope(body.data);
      } catch {
        // Leave the new client defaults blank if the current user cannot be resolved.
      }
    }

    void loadCurrentUserScope();

    return () => {
      cancelled = true;
    };
  }, []);

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
    setAgreementDraftCard(null);
    setIsGeneratingAgreementDocx(false);
    setAgreementWorkflowError(null);
    setIsGeneratingInvoiceDocx(false);
    setInvoiceWorkflowError(null);
    setActiveAssistField(null);
    setFileNoteSubjectManuallyEdited(false);
    setFileNoteAttachments([]);
    setFileNoteAttachmentFiles([]);
    setConciergeUploads([]);
  }

  function clearLiveRenderOutputs() {
    setEngagementLetterDraftCard(null);
    setAgreementDraftCard(null);
    setDocumentPlaceholderCard(null);
    setInvoicePlaceholderCard(null);
    setEngagementLetterWorkflowError(null);
    setAgreementWorkflowError(null);
    setInvoiceWorkflowError(null);
  }

  function handleRefreshChat() {
    resetConversation();
  }

  async function loadClientProfileForPreview(clientId: string) {
    const response = await fetch(`/api/finley/soa/client-profile?clientId=${encodeURIComponent(clientId)}`, {
      method: "GET",
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as { profile?: ClientProfile | null } | null;

    if (!response.ok) {
      return null;
    }

    return body?.profile ?? null;
  }

  async function activateAgreementWorkflow(agreementType: AgreementType, messageMode: "replace" | "append" = "replace") {
    if (!activeClient) return;

    const isAnnual = agreementType === "annual";
    const title = isAnnual ? "Annual Advice Agreement" : "Ongoing Service Agreement";
    const clientName = activeClient.name ?? "this client";
    const adviserName = activeClient.clientAdviserName ?? currentUserScope?.name ?? "";
    const assistantMessage: Message = {
      id: `assistant-agreement-${agreementType}-${Date.now()}`,
      role: "assistant",
      content: `I’m ready to prepare an ${isAnnual ? "annual advice agreement" : "ongoing service agreement"} for ${clientName}. I’ll show the live agreement render in the output pane so you can review it before exporting to Word.`,
    };

    if (messageMode === "append") {
      setMessages((current) => [...current, assistantMessage]);
    } else {
      setMessages([assistantMessage]);
    }
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
    setAgreementWorkflowError(null);
    setInvoiceWorkflowError(null);
    setEngagementLetterDraftCard(null);
    setDocumentPlaceholderCard(null);
    setInvoicePlaceholderCard(null);
    const profile = activeClient.id ? await loadClientProfileForPreview(activeClient.id).catch(() => null) : null;
    const clientAddressLines = personAddressLines(profile?.client);

    setAgreementDraftCard({
      title: `Prepare ${title} for ${clientName}`,
      description: `Prepare a standalone ${title.toLowerCase()} with service terms, fee consent, and signature sections.`,
      agreementType,
      clientName,
      clientAddressLines,
      adviserName,
      practiceName: activeClient.clientAdviserPracticeName ?? currentUserScope?.practice?.name ?? "",
      licenseeName: activeClient.clientAdviserLicenseeName ?? "",
      services: DEFAULT_SERVICE_AGREEMENT_SERVICES,
    });
  }

  function detectAgreementRequest(message: string): AgreementType | null {
    const lower = message.toLowerCase();

    if (/\b(annual agreement|annual advice agreement|fixed term agreement|fixed-term agreement)\b/.test(lower)) {
      return "annual";
    }

    if (/\b(ongoing agreement|ongoing service agreement|service agreement)\b/.test(lower)) {
      return "ongoing";
    }

    return null;
  }

  function openCreateClient() {
    setIsCreateClientOpen(true);
  }

  async function handleStarterAction(
    action:
      | "fact_find"
      | "file_note"
      | "engagement_letter"
      | "record_of_advice"
      | "statement_of_advice"
      | "create_invoice"
      | "ongoing_agreement"
      | "annual_agreement",
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
        clearLiveRenderOutputs();
        setFactFindWorkflow(normalizeFactFindWorkflow(body.workflow));
        setFactFindStepIndex(0);
        setFactFindWorkflowError(null);
        setFileNoteSubjectManuallyEdited(false);
        setFileNoteAttachments([]);
        setFileNoteAttachmentFiles([]);
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

    if (action === "ongoing_agreement" || action === "annual_agreement") {
      void activateAgreementWorkflow(action === "annual_agreement" ? "annual" : "ongoing");
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
        const defaultDueDate = new Date(today);
        defaultDueDate.setDate(defaultDueDate.getDate() + 14);
        const dueDate = `${defaultDueDate.getFullYear()}-${String(defaultDueDate.getMonth() + 1).padStart(2, "0")}-${String(defaultDueDate.getDate()).padStart(2, "0")}`;
        let clientEmail = "";
        let adviserName = activeClient.clientAdviserName ?? "";
        let clientEntityId = activeClient.id ?? "";
        let clientName = activeClient.name ?? "";
        let clientNameOptions: InvoiceRecipientOption[] = clientName ? [{ value: clientName, label: clientName, email: "" }] : [];

        try {
          const response = await fetch(`/api/finley/invoice/prefill?clientId=${encodeURIComponent(activeClient.id ?? "")}`, {
            method: "GET",
            cache: "no-store",
          });
          const body = (await response.json().catch(() => null)) as
            | {
                clientName?: string | null;
                clientEmail?: string | null;
                adviserName?: string | null;
                clientEntityId?: string | null;
                clientNameOptions?: InvoiceRecipientOption[] | null;
                error?: string | null;
              }
            | null;

          if (response.ok && body) {
            clientName = body.clientName ?? clientName;
            clientEmail = body.clientEmail ?? "";
            adviserName = body.adviserName ?? adviserName;
            clientEntityId = body.clientEntityId ?? clientEntityId;
            clientNameOptions = Array.isArray(body.clientNameOptions) && body.clientNameOptions.length ? body.clientNameOptions : clientNameOptions;
          }
        } catch {
          // Fall back to the lightweight client summary values already on hand.
        }

        setMessages([
          {
            id: `assistant-invoice-placeholder-${Date.now()}`,
            role: "assistant",
            content: `I’m ready to help prepare an invoice for ${activeClient.name}. I’ll show the live invoice render in the output pane so you can review it before exporting to Word.`,
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
        setAgreementDraftCard(null);
        setDocumentPlaceholderCard(null);
        setInvoicePlaceholderCard({
          title: `Create an invoice for ${activeClient.name}`,
          description: "Prepare an invoice with client, service and line-item details.",
          note: "Live invoice render",
          referenceNumber: `${Math.floor(1000 + Math.random() * 9000)}`,
          clientName,
          clientNameOptions,
          clientEmail,
          adviserName,
          serviceType: "",
          clientEntityId,
          dueDate,
          includeStripePaymentLink: false,
          printAsPdf: false,
          items: [
            {
              id: `invoice-item-${crypto.randomUUID()}`,
              description: "Advice services",
              quantity: "1",
              priceExGst: "",
            },
          ],
        });
        return;
      }

      if (action === "engagement_letter") {
        const clientName = activeClient.name ?? "this client";
        const adviserName = activeClient.clientAdviserName ?? currentUserScope?.name ?? "";

        setMessages([
          {
            id: `assistant-engagement-letter-${Date.now()}`,
            role: "assistant",
            content: `I’m ready to help draft an engagement letter for ${clientName}. I’ll show the live letter render in the output pane so you can review it like a client-facing document.`,
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
        setAgreementWorkflowError(null);
        setInvoiceWorkflowError(null);
        setInvoicePlaceholderCard(null);
        setAgreementDraftCard(null);
        setDocumentPlaceholderCard(null);
        setEngagementLetterDraftCard({
          title: `Prepare an engagement letter for ${clientName}`,
          description:
            "Send your client an initial engagement letter to outline the services you will provide and disclose the costs of your advice.",
          badge: "Live Render",
          clientName,
          adviserName,
          value: {
            reasonsHtml: buildDefaultEngagementReasonsHtml(clientName, adviserName),
            servicesHtml: buildDefaultEngagementServicesHtml(clientName),
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
      setAgreementDraftCard(null);
      setDocumentPlaceholderCard(placeholder);
      setInvoicePlaceholderCard(null);
      return;
    }

    setPlanSummary(null);
    setPlanSteps([]);
    setWarnings([]);
    setPendingPlanId(null);
    setDisplayCard(null);
    setEditorCard(null);
    setFactFindWorkflow(null);
    setFactFindStepIndex(0);
    setFactFindWorkflowError(null);
    clearLiveRenderOutputs();
    setActiveAssistField(null);
    setFileNoteSubjectManuallyEdited(false);
    setFileNoteAttachments([]);
    setFileNoteAttachmentFiles([]);
    await handleSend("create a file note");
  }

  async function addConciergeUploads(files: FileList | null) {
    if (!files?.length || !activeClient) {
      return;
    }

    setIsUploadingConciergeFiles(true);

    try {
      const nextUploads = await Promise.all(
        Array.from(files).map(async (file) => {
          const extractedText = await extractUploadText(file);
          const tags = detectConciergeDocumentTags(file.name, extractedText);
          return {
            id: `upload-${crypto.randomUUID()}`,
            name: file.name,
            mimeType: file.type || null,
            extractedText,
            tags,
          } satisfies ConciergeUpload;
        }),
      );
      const detectedLabels = Array.from(
        new Set(
          nextUploads
            .flatMap((upload) => upload.tags)
            .filter((tag) => tag !== "unknown")
            .map(getConciergeTagLabel),
        ),
      );

      setConciergeUploads((current) => [...current, ...nextUploads]);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-upload-${Date.now()}`,
          role: "assistant",
          content: detectedLabels.length
            ? `I reviewed ${nextUploads.length} uploaded file${nextUploads.length > 1 ? "s" : ""} for ${activeClient.name}. Detected: ${detectedLabels.join(", ")}. I’ve suggested the next useful tasks below.`
            : `I added ${nextUploads.length} uploaded file${nextUploads.length > 1 ? "s" : ""} for ${activeClient.name}. I can review the documents and suggest what to do next.`,
        },
      ]);
    } finally {
      setIsUploadingConciergeFiles(false);
    }
  }

  async function handleConciergeSuggestedTask(task: ConciergeSuggestedTask) {
    if (task.action === "file_note" && conciergeUploadTags.has("meeting-transcript")) {
      await handleSend("create a file note from the uploaded meeting transcript");
      return;
    }

    if (task.action === "service_agreement") {
      await handleStarterAction("ongoing_agreement");
      return;
    }

    if (task.action === "summarise_documents") {
      const documentContext = conciergeUploads
        .map((upload) => `${upload.name}: ${upload.tags.map(getConciergeTagLabel).join(", ")}`)
        .join("; ");
      await handleSend(`review the uploaded documents and suggest the next adviser tasks. Uploaded documents: ${documentContext}`);
      return;
    }

    await handleStarterAction(task.action);
  }

  function closeCreateClient() {
    setIsCreateClientOpen(false);
  }

  function handleClientCreated(createdClient: CreatedClientResponse) {
    const createdProfileId = createdClient.id?.trim() || "";

    if (!createdProfileId) {
      return;
    }

    const primaryName = createdClient.client?.name?.trim() ?? "";
    const partnerName = createdClient.partner?.name?.trim() ?? "";
    const createdSummary: FinleyClientSummary = {
      id: createdProfileId,
      name: createdClient.name?.trim() || [primaryName, partnerName].filter(Boolean).join(" & ") || "Unnamed Client",
      primaryClientName: primaryName || undefined,
      partnerName: partnerName || undefined,
      clientAdviserName: createdClient.clientAdviserName ?? createdClient.adviser?.name ?? activeClient?.clientAdviserName ?? currentUserScope?.name ?? "",
      clientAdviserPracticeName:
        createdClient.clientAdviserPracticeName ??
        createdClient.practice ??
        activeClient?.clientAdviserPracticeName ??
        currentUserScope?.practice?.name ??
        "",
      clientAdviserLicenseeName:
        createdClient.clientAdviserLicenseeName ??
        createdClient.licensee ??
        activeClient?.clientAdviserLicenseeName ??
        currentUserScope?.licensee?.name ??
        null,
    };

    setServerClients((current) => [
      createdSummary,
      ...current.filter((client) => client.id !== createdProfileId),
    ]);

    const params = new URLSearchParams(searchParams.toString());
    params.set("clientId", createdProfileId);
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
            items: invoicePlaceholderCard.items.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              priceExGst: item.priceExGst,
              totalGst: formatCurrencyValue(String(invoiceItemAmounts(item).total)),
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
      const fileName = fileNameMatch?.[1] ?? "Invoice.docx";
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

  async function handleAgreementGenerateDocx() {
    if (!activeClientId || !agreementDraftCard) return;

    setIsGeneratingAgreementDocx(true);
    setAgreementWorkflowError(null);

    try {
      const response = await fetch("/api/finley/agreement/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId: activeClientId,
          agreement: {
            agreementType: agreementDraftCard.agreementType,
            adviserName: agreementDraftCard.adviserName,
            practiceName: agreementDraftCard.practiceName,
            licenseeName: agreementDraftCard.licenseeName,
            services: agreementDraftCard.services,
          },
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "Unable to generate the agreement right now.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const fileNameMatch = disposition.match(/filename="?([^"]+)"?/i);
      const fileName = fileNameMatch?.[1] ?? "Agreement.docx";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setAgreementWorkflowError(error instanceof Error ? error.message : "Unable to generate the agreement right now.");
    } finally {
      setIsGeneratingAgreementDocx(false);
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

      const requestedAgreementType = detectAgreementRequest(message);
      if (requestedAgreementType) {
        await activateAgreementWorkflow(requestedAgreementType, "append");
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
      const nextEditorCard = normalizeEditorCard(body.editorCard ?? null);
      if (body.displayCard || nextEditorCard) {
        clearLiveRenderOutputs();
      }
      setDisplayCard(body.displayCard ?? null);
      setEditorCard(nextEditorCard);
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
      setFileNoteAttachmentFiles([]);
    } finally {
      setIsSending(false);
    }
  }

  async function handlePlanAction(action: "approve_plan" | "cancel_plan") {
    if (!pendingPlanId) return;

    setIsSending(true);

    try {
      const approveUrl = `/api/finley/plans/${encodeURIComponent(pendingPlanId)}/${action === "approve_plan" ? "approve" : "cancel"}`;
      const isFileNoteApproval =
        action === "approve_plan"
        && editorCard
        && editorCard.kind === "collection_form"
        && editorCard.toolName === "create_file_note";
      const payload =
        action === "approve_plan"
          ? {
              ...(editorCard ? buildEditorPayload(editorCard) : {}),
              ...(isFileNoteApproval
                ? {
                    record: {
                      ...(((buildEditorPayload(editorCard) as { record?: Record<string, unknown> } | null)?.record ?? {}) as Record<string, unknown>),
                      attachment: fileNoteAttachments,
                    },
                  }
                : {}),
            }
          : undefined;
      const fileNoteRecordPayload =
        isFileNoteApproval
          ? (((payload as { record?: Record<string, unknown> } | undefined)?.record ?? null) as Record<string, unknown> | null)
          : null;

      const response = isFileNoteApproval && fileNoteAttachmentFiles.length
        ? await (async () => {
            const formData = new FormData();
            formData.append("payload", JSON.stringify(payload));
            for (const file of fileNoteAttachmentFiles) {
              formData.append("files", file);
            }
            return fetch(approveUrl, {
              method: "POST",
              body: formData,
            });
          })()
        : await fetch(approveUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: payload ? JSON.stringify(payload) : undefined,
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
      if (isFileNoteApproval && fileNoteRecordPayload && activeClientId) {
        cacheFileNoteAttachments({
          clientId: activeClientId,
          id: typeof fileNoteRecordPayload.id === "string" ? fileNoteRecordPayload.id : null,
          subject: typeof fileNoteRecordPayload.subject === "string" ? fileNoteRecordPayload.subject : "",
          content: typeof fileNoteRecordPayload.content === "string" ? fileNoteRecordPayload.content : "",
          serviceDate: typeof fileNoteRecordPayload.serviceDate === "string" ? fileNoteRecordPayload.serviceDate : "",
          type: typeof fileNoteRecordPayload.type === "string" ? fileNoteRecordPayload.type : "",
          subType: typeof fileNoteRecordPayload.subType === "string" ? fileNoteRecordPayload.subType : "",
          attachment: fileNoteAttachments,
        });
      }
      if (body.responseMode === "execution_result" || body.status === "completed" || body.status === "cancelled") {
        setPlanSummary(null);
        setPlanSteps([]);
        setWarnings([]);
        setPendingPlanId(null);
        setDisplayCard(body.displayCard ?? null);
        setEditorCard(null);
        setFileNoteSubjectManuallyEdited(false);
        setFileNoteAttachments([]);
        setFileNoteAttachmentFiles([]);
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
        setFileNoteAttachmentFiles([]);
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
      setFileNoteAttachmentFiles([]);
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

    const nextFiles = Array.from(files);
    const nextAttachments = nextFiles.map((file) => ({
      name: file.name,
      url: null,
    }));

    setFileNoteAttachments((current) => [...current, ...nextAttachments]);
    setFileNoteAttachmentFiles((current) => [...current, ...nextFiles]);
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
                    ? "Choose a workflow to begin, or upload documents and Finley can suggest some tasks to be completed."
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
                    <button
                      type="button"
                      className={styles.starterActionCard}
                      onClick={() => void handleStarterAction("ongoing_agreement")}
                      disabled={isSending}
                    >
                      <span className={styles.starterActionTitle}>Ongoing Agreement</span>
                    </button>
                    <button
                      type="button"
                      className={styles.starterActionCard}
                      onClick={() => void handleStarterAction("annual_agreement")}
                      disabled={isSending}
                    >
                      <span className={styles.starterActionTitle}>Annual Agreement</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {activeClient && conciergeUploads.length ? (
            <section className={styles.conciergeSuggestionPanel} aria-label="Suggested next steps">
              <div className={styles.conciergeSuggestionHeader}>
                <div>
                  <div className={styles.suggestionTitle}>Finley noticed something useful</div>
                  <div className={styles.conciergeSuggestionText}>{conciergeInsightText}</div>
                </div>
              </div>
              <div className={styles.conciergeUploadList}>
                {conciergeUploads.map((upload) => (
                  <div key={upload.id} className={styles.conciergeUploadItem}>
                    <span className={styles.conciergeUploadName}>{upload.name}</span>
                    <span className={styles.conciergeTagRow}>
                      {upload.tags.map((tag) => (
                        <span key={tag} className={styles.conciergeTagPill}>
                          {getConciergeTagLabel(tag)}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
              {primaryConciergeTask ? (
                <div className={styles.conciergeActionStack}>
                  <button
                    type="button"
                    className={styles.conciergePrimaryAction}
                    onClick={() => void handleConciergeSuggestedTask(primaryConciergeTask)}
                    disabled={isSending}
                  >
                    <span>
                      <strong>{primaryConciergeTask.title}</strong>
                      <span>{primaryConciergeTask.description}</span>
                    </span>
                    <span>{primaryConciergeTask.actionLabel}</span>
                  </button>
                  {secondaryConciergeTasks.length ? (
                    <div className={styles.conciergeSecondaryActions}>
                      {secondaryConciergeTasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          className={styles.conciergeSecondaryAction}
                          onClick={() => void handleConciergeSuggestedTask(task)}
                          disabled={isSending}
                        >
                          {task.actionLabel}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className={styles.conciergeCommonTasks}>
                <span>Other things I can help with:</span>
                <div>
                  <button
                    type="button"
                    className={styles.conciergeCommonTaskButton}
                    onClick={() => void handleStarterAction("file_note")}
                    disabled={isSending}
                  >
                    Create file note
                  </button>
                  <button
                    type="button"
                    className={styles.conciergeCommonTaskButton}
                    onClick={() => void handleStarterAction("engagement_letter")}
                    disabled={isSending}
                  >
                    Engagement letter
                  </button>
                  <button
                    type="button"
                    className={styles.conciergeCommonTaskButton}
                    onClick={() => void handleStarterAction("create_invoice")}
                    disabled={isSending}
                  >
                    Invoice
                  </button>
                  <button
                    type="button"
                    className={styles.conciergeCommonTaskButton}
                    onClick={() => void handleStarterAction("ongoing_agreement")}
                    disabled={isSending}
                  >
                    Ongoing agreement
                  </button>
                  <button
                    type="button"
                    className={styles.conciergeCommonTaskButton}
                    onClick={() => void handleStarterAction("annual_agreement")}
                    disabled={isSending}
                  >
                    Annual agreement
                  </button>
                  <button
                    type="button"
                    className={styles.conciergeCommonTaskButton}
                    onClick={() => void handleSend("check what information is missing for this client")}
                    disabled={isSending}
                  >
                    Check missing info
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {messages.length ? (
            <div className={styles.messageGroup}>
              {messages.map((message) => (
                <div key={message.id} className={message.role === "assistant" ? styles.assistantMessageStack : ""}>
                  <div className={message.role === "assistant" ? styles.assistantBubble : styles.userBubble}>
                    {message.content}
                  </div>
                  {message.role === "assistant" && message.id === latestAssistantMessageId && activeClient ? (
                    <div className={styles.workflowPillRow} aria-label="Suggested Finley workflows">
                      <button
                        type="button"
                        className={styles.workflowPill}
                        onClick={() => void handleStarterAction("fact_find")}
                        disabled={isSending}
                      >
                        Update fact find
                      </button>
                      <button
                        type="button"
                        className={styles.workflowPill}
                        onClick={() => void handleStarterAction("engagement_letter")}
                        disabled={isSending}
                      >
                        Engagement letter
                      </button>
                      <button
                        type="button"
                        className={styles.workflowPill}
                        onClick={() => void handleStarterAction("file_note")}
                        disabled={isSending}
                      >
                        File note
                      </button>
                      <button
                        type="button"
                        className={styles.workflowPill}
                        onClick={() => void handleStarterAction("create_invoice")}
                        disabled={isSending}
                      >
                        Invoice
                      </button>
                      <button
                        type="button"
                        className={styles.workflowPill}
                        onClick={() => void handleStarterAction("record_of_advice")}
                        disabled={isSending}
                      >
                        Record of Advice
                      </button>
                      <button
                        type="button"
                        className={styles.workflowPill}
                        onClick={() => void handleStarterAction("ongoing_agreement")}
                        disabled={isSending}
                      >
                        Ongoing agreement
                      </button>
                      <button
                        type="button"
                        className={styles.workflowPill}
                        onClick={() => void handleStarterAction("annual_agreement")}
                        disabled={isSending}
                      >
                        Annual agreement
                      </button>
                      <button
                        type="button"
                        className={styles.workflowPill}
                        onClick={() => void handleSend("check what information is missing for this client")}
                        disabled={isSending}
                      >
                        Check missing info
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          <div className={styles.composer}>
            <input
              ref={conciergeUploadInputRef}
              type="file"
              multiple
              className={styles.hiddenFileInput}
              accept=".doc,.docx,.pdf,.txt,.rtf,.md,.csv,.json"
              onChange={(event) => {
                void addConciergeUploads(event.target.files);
                event.currentTarget.value = "";
              }}
            />
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
                    : ""
                  : "Client context will appear here once you select a client."}
              </div>
              <div className={styles.composerActions}>
                <button
                  type="button"
                  className={styles.refreshButton}
                  onClick={() => conciergeUploadInputRef.current?.click()}
                  disabled={!activeClient || isUploadingConciergeFiles}
                >
                  {isUploadingConciergeFiles
                    ? "Uploading..."
                    : conciergeUploads.length
                      ? `Uploaded Files (${conciergeUploads.length})`
                      : "Upload files"}
                </button>
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

      <aside className={styles.outputPane} aria-label="Finley output">
        <div className={styles.outputSurface}>
          {!engagementLetterDraftCard && !agreementDraftCard && !invoicePlaceholderCard ? (
            <div className={styles.outputHeader}>
              <div>
                <div className={styles.sidebarLabel}>Output</div>
                <div className={styles.outputTitle}>Finley Workspace</div>
              </div>
            </div>
          ) : null}

          {!currentFactFindStep &&
          !engagementLetterDraftCard &&
          !agreementDraftCard &&
          !documentPlaceholderCard &&
          !invoicePlaceholderCard &&
          !displayCard &&
          !planSummary ? (
            <div className={styles.outputEmptyState}>
              <div className={styles.outputEmptyTitle}>No output yet</div>
              <div className={styles.outputEmptyText}>
                Start a workflow or ask Finley to prepare a document, update a record, create an invoice, or draft a file note.
              </div>
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
                  {factFindWorkflow && factFindStepIndex >= factFindWorkflow.steps.length - 1 ? (
                    <button
                      type="button"
                      className={styles.planApproveButton}
                      onClick={() => void handleFactFindGenerateDocx()}
                      disabled={isSavingFactFindStep || isGeneratingFactFindDocx}
                    >
                      {isGeneratingFactFindDocx ? "Generating..." : "Generate Fact Find"}
                    </button>
                  ) : null}
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
            <EngagementLetterRender
              draft={engagementLetterDraftCard.value}
              clientName={engagementLetterDraftCard.clientName}
              adviserName={engagementLetterDraftCard.adviserName}
              practiceName={activeClient?.clientAdviserPracticeName ?? currentUserScope?.practice?.name}
              licenseeName={activeClient?.clientAdviserLicenseeName}
              onExport={() => void handleEngagementLetterGenerateDocx()}
              isExporting={isGeneratingEngagementLetterDocx}
              exportError={engagementLetterWorkflowError}
            />
          ) : null}

          {agreementDraftCard ? (
            <AgreementRender
              agreement={agreementDraftCard}
              onExport={() => void handleAgreementGenerateDocx()}
              isExporting={isGeneratingAgreementDocx}
              exportError={agreementWorkflowError}
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
            <InvoiceWorkflowCard
              invoice={invoicePlaceholderCard}
              practiceName={activeClient?.clientAdviserPracticeName ?? currentUserScope?.practice?.name}
              licenseeName={activeClient?.clientAdviserLicenseeName}
              onChange={setInvoicePlaceholderCard}
              onExport={() => void handleInvoiceGenerateDocx()}
              isExporting={isGeneratingInvoiceDocx}
              exportError={invoiceWorkflowError}
            />
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
                                            (setFileNoteAttachments((current) =>
                                              current.filter((_, currentIndex) => currentIndex !== index),
                                            ),
                                            setFileNoteAttachmentFiles((current) =>
                                              current.filter((_, currentIndex) => currentIndex !== index),
                                            ))
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

        </div>
      </aside>

      <CreateClientDialog
        isOpen={isCreateClientOpen}
        currentUserScope={currentUserScope}
        defaultAdviserName={activeClient?.clientAdviserName}
        defaultPracticeName={activeClient?.clientAdviserPracticeName}
        defaultLicenseeName={activeClient?.clientAdviserLicenseeName}
        onClose={closeCreateClient}
        onCreated={handleClientCreated}
      />
    </main>
  );
}
