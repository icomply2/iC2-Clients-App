"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./engagement-letter-draft-card.module.css";

export type EngagementLetterDraftValue = {
  reasonsHtml: string;
  servicesHtml: string;
  advicePreparationFee: string;
  implementationFee: string;
};

type EngagementLetterDraftCardProps = {
  title: string;
  description: string;
  badge?: string;
  clientName: string;
  adviserName?: string | null;
  value: EngagementLetterDraftValue;
  onChange: (nextValue: EngagementLetterDraftValue) => void;
  onPrint?: () => void | Promise<void>;
  isPrinting?: boolean;
  printError?: string | null;
};

type RichFieldKey = "reasonsHtml" | "servicesHtml";

const EMPTY_DRAFT: EngagementLetterDraftValue = {
  reasonsHtml: "",
  servicesHtml: "",
  advicePreparationFee: "",
  implementationFee: "",
};

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function formatCurrencyInput(value: string) {
  const numeric = Number(value.replace(/[^0-9.-]/g, "").trim());
  if (!Number.isFinite(numeric)) return value;

  return new Intl.NumberFormat("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

function buildReasonsHtml(clientName: string, adviserName?: string | null) {
  const adviser = adviserName?.trim() || "their adviser";
  return [
    `<p>${clientName} is seeking advice to confirm current priorities and set a clear scope for the next stage of advice.</p>`,
    "<ul>",
    "<li>Review the client’s current financial position and identify key advice needs.</li>",
    "<li>Clarify the preferred services, deliverables, and next steps for the engagement.</li>",
    `<li>Document the basis on which ${adviser} will provide advice and implementation support.</li>`,
    "</ul>",
  ].join("");
}

function buildServicesHtml(clientName: string) {
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

export function EngagementLetterDraftCard({
  title,
  description,
  badge,
  clientName,
  adviserName,
  value,
  onChange,
  onPrint,
  isPrinting = false,
  printError = null,
}: EngagementLetterDraftCardProps) {
  const editorRefs = useRef<Record<RichFieldKey, HTMLDivElement | null>>({
    reasonsHtml: null,
    servicesHtml: null,
  });
  const [activeField, setActiveField] = useState<RichFieldKey>("reasonsHtml");
  const draft = value ?? EMPTY_DRAFT;

  useEffect(() => {
    (["reasonsHtml", "servicesHtml"] as RichFieldKey[]).forEach((fieldKey) => {
      const editor = editorRefs.current[fieldKey];
      const nextHtml = draft[fieldKey] || "";
      if (editor && editor.innerHTML !== nextHtml) {
        editor.innerHTML = nextHtml;
      }
    });
  }, [draft]);

  const footerNote = useMemo(
    () => "Draft the engagement content here, then print the merged document once it is ready for adviser review.",
    [],
  );

  function updateField(fieldKey: keyof EngagementLetterDraftValue, nextValue: string) {
    onChange({
      ...draft,
      [fieldKey]: nextValue,
    });
  }

  function syncEditor(fieldKey: RichFieldKey) {
    const editor = editorRefs.current[fieldKey];
    if (!editor) return;
    updateField(fieldKey, editor.innerHTML);
  }

  function runEditorCommand(command: string, commandValue?: string) {
    const editor = editorRefs.current[activeField];
    if (!editor) return;

    editor.focus();
    document.execCommand(command, false, commandValue);
    syncEditor(activeField);
  }

  function handleGenerate(fieldKey: RichFieldKey) {
    const nextHtml =
      fieldKey === "reasonsHtml"
        ? buildReasonsHtml(clientName, adviserName)
        : buildServicesHtml(clientName);

    updateField(fieldKey, nextHtml);
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Engagement Letter</div>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.description}>{description}</p>
        </div>
        <div className={styles.badge}>{badge ?? "Drafting Card"}</div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>Key reasons for seeking advice</span>
          <button type="button" className={styles.generateButton} onClick={() => handleGenerate("reasonsHtml")}>
            Generate with Finley
          </button>
        </div>
        <div className={styles.editorWrap}>
          <div className={styles.toolbar}>
            <button type="button" className={styles.toolbarButton} onClick={() => runEditorCommand("bold")}>
              B
            </button>
            <button type="button" className={styles.toolbarButton} onClick={() => runEditorCommand("italic")}>
              I
            </button>
            <button type="button" className={styles.toolbarButton} onClick={() => runEditorCommand("underline")}>
              U
            </button>
            <button type="button" className={styles.toolbarButton} onClick={() => runEditorCommand("formatBlock", "H2")}>
              H2
            </button>
            <button type="button" className={styles.toolbarButton} onClick={() => runEditorCommand("insertUnorderedList")}>
              • List
            </button>
            <button type="button" className={styles.toolbarButton} onClick={() => runEditorCommand("insertOrderedList")}>
              1. List
            </button>
          </div>
          <div
            ref={(node) => {
              editorRefs.current.reasonsHtml = node;
            }}
            className={`${styles.editor} ${!stripHtml(draft.reasonsHtml) ? styles.editorEmpty : ""}`.trim()}
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Draft the client’s reasons for seeking advice..."
            onFocus={() => setActiveField("reasonsHtml")}
            onInput={() => syncEditor("reasonsHtml")}
          />
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>Services to be completed</span>
          <button type="button" className={styles.generateButton} onClick={() => handleGenerate("servicesHtml")}>
            Generate with Finley
          </button>
        </div>
        <div className={styles.editorWrap}>
          <div className={styles.toolbar}>
            <button type="button" className={styles.toolbarButton} onClick={() => runEditorCommand("bold")}>
              B
            </button>
            <button type="button" className={styles.toolbarButton} onClick={() => runEditorCommand("italic")}>
              I
            </button>
            <button type="button" className={styles.toolbarButton} onClick={() => runEditorCommand("underline")}>
              U
            </button>
            <button type="button" className={styles.toolbarButton} onClick={() => runEditorCommand("formatBlock", "H2")}>
              H2
            </button>
            <button type="button" className={styles.toolbarButton} onClick={() => runEditorCommand("insertUnorderedList")}>
              • List
            </button>
            <button type="button" className={styles.toolbarButton} onClick={() => runEditorCommand("insertOrderedList")}>
              1. List
            </button>
          </div>
          <div
            ref={(node) => {
              editorRefs.current.servicesHtml = node;
            }}
            className={`${styles.editor} ${!stripHtml(draft.servicesHtml) ? styles.editorEmpty : ""}`.trim()}
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Describe the services to be completed..."
            onFocus={() => setActiveField("servicesHtml")}
            onInput={() => syncEditor("servicesHtml")}
          />
        </div>
      </div>

      <div className={styles.fieldGrid}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Advice Preparation Fee</span>
          <input
            className={styles.input}
            value={draft.advicePreparationFee}
            inputMode="decimal"
            onChange={(event) => updateField("advicePreparationFee", event.target.value)}
            onBlur={(event) => updateField("advicePreparationFee", formatCurrencyInput(event.target.value))}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Implementation Fee</span>
          <input
            className={styles.input}
            value={draft.implementationFee}
            inputMode="decimal"
            onChange={(event) => updateField("implementationFee", event.target.value)}
            onBlur={(event) => updateField("implementationFee", formatCurrencyInput(event.target.value))}
          />
        </label>
      </div>

      <div className={styles.footer}>
        <div>
          <div className={styles.footerNote}>{footerNote}</div>
          {printError ? <div className={styles.printError}>{printError}</div> : null}
        </div>
        <button type="button" className={styles.printButton} onClick={() => void onPrint?.()} disabled={!onPrint || isPrinting}>
          {isPrinting ? "Generating..." : "Print"}
        </button>
      </div>
    </div>
  );
}
