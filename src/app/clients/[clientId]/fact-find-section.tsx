"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClientProfile } from "@/lib/api/types";
import type { FinleyDisplayCard, FinleyEditorCard, FinleyFactFindWorkflow, FinleyTableEditorCard } from "@/lib/finley-shared";
import { updateClientDetails, updatePartnerDetails } from "@/lib/services/client-updates";
import styles from "./page.module.css";

type FactFindSectionProps = {
  clientId: string;
  profile: ClientProfile;
};

function buildClientName(profile: ClientProfile) {
  const names = [profile.client?.name, profile.partner?.name].filter(Boolean);
  return names.length ? names.join(" & ") : "this client";
}

function formatFieldValue(key: string, value: string) {
  if (!value.trim()) return value;

  if (
    ["amount", "currentValue", "balance", "payment", "repaymentAmount", "contributionAmount", "cost", "incomeAmount", "outstandingBalance"].includes(
      key,
    )
  ) {
    const numeric = Number(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(numeric)) {
      return new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(numeric);
    }
  }

  if (["interestRate", "indexation", "annualReturn"].includes(key)) {
    const numeric = Number(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(numeric)) {
      return `${new Intl.NumberFormat("en-AU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(numeric)}%`;
    }
  }

  const slashMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (slashMatch && ["dateOfBirth", "nextAnniversaryDate", "serviceDate", "acquisitionDate", "birthday"].includes(key)) {
    return `${slashMatch[3]}/${slashMatch[2]}/${slashMatch[1]}`;
  }

  return value;
}

function parseDateValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

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

  return trimmed;
}

function renderDisplayCard(displayCard: FinleyDisplayCard) {
  const hasActions = displayCard.rows.some((row) => row.editAction);
  const columns = hasActions ? [...displayCard.columns, "Action"] : displayCard.columns;

  return (
    <div className={styles.factFindDataCard}>
      <div className={styles.factFindDataTitle}>{displayCard.title}</div>
      <div className={styles.factFindDataTableWrap}>
        <div
          className={styles.factFindDataTableHeader}
          style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
        >
          {columns.map((column) => (
            <div key={column} className={styles.factFindDataTableHeaderCell}>
              {column}
            </div>
          ))}
        </div>
        {displayCard.rows.map((row) => (
          <div
            key={row.id}
            className={styles.factFindDataTableRow}
            style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
          >
            {row.cells.map((cell, cellIndex) => (
              <div key={`${row.id}-${cellIndex}`} className={styles.factFindDataTableCell}>
                {cell || "—"}
              </div>
            ))}
            {hasActions ? (
              <div className={`${styles.factFindDataTableCell} ${styles.factFindDataTableActionCell}`.trim()}>
                {row.editAction ? (
                  <span className={styles.factFindEditHint}>Edit in Finley</span>
                ) : (
                  <span className={styles.factFindDataTableActionPlaceholder}>—</span>
                )}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {displayCard.footer ? <div className={styles.factFindFooter}>{displayCard.footer}</div> : null}
    </div>
  );
}

function renderEditorCard(
  editorCard: FinleyEditorCard | FinleyTableEditorCard,
  onFieldChange: (fieldKey: string, value: string, rowId?: string) => void,
) {
  if (editorCard.kind === "collection_table") {
    return (
      <div className={styles.factFindEditorCard}>
        <div className={styles.factFindEditorTitle}>{editorCard.title}</div>
        <div className={styles.factFindBatchTableWrap}>
          <div
            className={styles.factFindBatchTableHeader}
            style={{ gridTemplateColumns: `repeat(${editorCard.columns.length}, minmax(0, 1fr))` }}
          >
            {editorCard.columns.map((column) => (
              <div key={column.key} className={styles.factFindDataTableHeaderCell}>
                {column.label}
              </div>
            ))}
          </div>
          {editorCard.rows.map((row) => (
            <div
              key={row.id}
              className={styles.factFindBatchTableRow}
              style={{ gridTemplateColumns: `repeat(${editorCard.columns.length}, minmax(0, 1fr))` }}
            >
              {editorCard.columns.map((column) =>
                column.input === "select" ? (
                  <select
                    key={`${row.id}-${column.key}`}
                    className={styles.factFindInput}
                    value={row.values[column.key] ?? ""}
                    onChange={(event) => onFieldChange(column.key, event.target.value, row.id)}
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
                    key={`${row.id}-${column.key}`}
                    className={styles.factFindInput}
                    value={formatFieldValue(column.key, row.values[column.key] ?? "")}
                    onChange={(event) => onFieldChange(column.key, event.target.value, row.id)}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.factFindEditorCard}>
      <div className={styles.factFindEditorTitle}>{editorCard.title}</div>
      <div className={styles.factFindEditorGrid}>
        {editorCard.fields.map((field) => (
          <label
            key={field.key}
            className={`${styles.factFindField} ${field.input === "textarea" ? styles.factFindFieldFull : ""}`.trim()}
          >
            <span className={styles.factFindFieldLabel}>{field.label}</span>
            {field.input === "select" ? (
              <select
                className={styles.factFindInput}
                value={field.value}
                onChange={(event) => onFieldChange(field.key, event.target.value)}
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
                className={`${styles.factFindInput} ${styles.factFindTextarea}`.trim()}
                rows={6}
                value={field.value}
                onChange={(event) => onFieldChange(field.key, event.target.value)}
              />
            ) : (
              <input
                className={styles.factFindInput}
                value={formatFieldValue(field.key, field.value)}
                onChange={(event) => onFieldChange(field.key, event.target.value)}
              />
            )}
          </label>
        ))}
      </div>
    </div>
  );
}

export function FactFindSection({ clientId, profile }: FactFindSectionProps) {
  const [workflow, setWorkflow] = useState<FinleyFactFindWorkflow | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingDocx, setIsGeneratingDocx] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [isSavingStep, setIsSavingStep] = useState(false);
  const clientName = useMemo(() => buildClientName(profile), [profile]);
  const currentStep = workflow?.steps?.[stepIndex] ?? null;

  useEffect(() => {
    let cancelled = false;

    async function loadWorkflow() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/finley/fact-find", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            activeClientId: clientId,
            activeClientName: clientName,
          }),
        });

        const body = (await response.json().catch(() => null)) as { workflow?: FinleyFactFindWorkflow | null } | null;
        if (!response.ok || !body?.workflow) {
          throw new Error("Unable to load the fact find workflow right now.");
        }

        if (!cancelled) {
          setWorkflow(body.workflow);
          setStepIndex(0);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load the fact find workflow right now.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadWorkflow();

    return () => {
      cancelled = true;
    };
  }, [clientId, clientName]);

  function updateStepField(fieldKey: string, value: string, rowId?: string) {
    setWorkflow((current) => {
      if (!current) return current;

      const nextSteps = current.steps.map((step, index) => {
        if (index !== stepIndex) return step;

        if (step.editorCard?.kind === "collection_table" && rowId) {
          return {
            ...step,
            editorCard: {
              ...step.editorCard,
              rows: step.editorCard.rows.map((row) =>
                row.id === rowId
                  ? {
                      ...row,
                      values: {
                        ...row.values,
                        [fieldKey]: value,
                      },
                    }
                  : row,
              ),
            },
          };
        }

        if (step.editorCard?.kind === "collection_form") {
          return {
            ...step,
            editorCard: {
              ...step.editorCard,
              fields: step.editorCard.fields.map((field) =>
                field.key === fieldKey
                  ? {
                      ...field,
                      value,
                    }
                  : field,
              ),
            },
          };
        }

        return step;
      });

      return {
        ...current,
        steps: nextSteps,
      };
    });
  }

  async function saveCurrentStepIfNeeded() {
    if (!currentStep?.editorCard || currentStep.editorCard.kind !== "collection_form") {
      return;
    }

    const isClientStep =
      currentStep.id === "household-details" || currentStep.id === "partner-details";

    if (!isClientStep) {
      return;
    }

    const values = Object.fromEntries(currentStep.editorCard.fields.map((field) => [field.key, field.value]));
    const target = values.target === "partner" ? "partner" : "client";
    const personId =
      target === "partner"
        ? profile.partner?.id?.trim() || ""
        : profile.client?.id?.trim() || "";
    const profileId = profile.id?.trim() || "";

    if (!profileId || !personId) {
      throw new Error("Finley could not determine which person record to save for this step.");
    }

    const changes = {
      ...(typeof values.name === "string" ? { name: values.name } : {}),
      ...(typeof values.email === "string" ? { email: values.email } : {}),
      ...(typeof values.preferredPhone === "string" ? { preferredPhone: values.preferredPhone } : {}),
      ...(typeof values.dateOfBirth === "string" ? { dateOfBirth: parseDateValue(values.dateOfBirth) } : {}),
      ...(typeof values.street === "string" ? { street: values.street } : {}),
      ...(typeof values.suburb === "string" ? { suburb: values.suburb } : {}),
      ...(typeof values.state === "string" ? { state: values.state } : {}),
      ...(typeof values.postCode === "string" ? { postCode: values.postCode } : {}),
      ...(typeof values.maritalStatus === "string" ? { maritalStatus: values.maritalStatus } : {}),
      ...(typeof values.residentStatus === "string" ? { residentStatus: values.residentStatus } : {}),
      ...(typeof values.gender === "string" ? { gender: values.gender } : {}),
      ...(typeof values.status === "string" ? { status: values.status } : {}),
      ...(typeof values.clientCategory === "string" ? { clientCategory: values.clientCategory } : {}),
      ...(typeof values.riskProfile === "string" ? { riskProfile: values.riskProfile } : {}),
      ...(typeof values.adviceAgreementRequired === "string" ? { adviceAgreementRequired: values.adviceAgreementRequired } : {}),
      ...(typeof values.agreementType === "string" ? { agreementType: values.agreementType } : {}),
      ...(typeof values.nextAnniversaryDate === "string"
        ? { nextAnniversaryDate: parseDateValue(values.nextAnniversaryDate) }
        : {}),
    };

      if (target === "partner") {
        await updatePartnerDetails({
          profileId,
          personId,
          person: profile.partner ?? null,
          changes,
        });
        return;
      }

      await updateClientDetails({
        profileId,
        personId,
        person: profile.client ?? null,
        changes,
      });
  }

  async function handleNext() {
    if (!workflow) return;

    setIsSavingStep(true);
    setGenerateError(null);

    try {
      await saveCurrentStepIfNeeded();
      setStepIndex((current) => Math.min(workflow.steps.length - 1, current + 1));
    } catch (saveError) {
      setGenerateError(
        saveError instanceof Error ? saveError.message : "Unable to save this fact find step right now.",
      );
    } finally {
      setIsSavingStep(false);
    }
  }

  async function handleGenerateDocx() {
    setIsGeneratingDocx(true);
    setGenerateError(null);

    try {
      await saveCurrentStepIfNeeded();

      const response = await fetch("/api/wizards/fact-find/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clientId }),
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
    } catch (generationError) {
      setGenerateError(
        generationError instanceof Error
          ? generationError.message
          : "Unable to generate the fact find document right now.",
      );
    } finally {
      setIsGeneratingDocx(false);
    }
  }

  return (
    <>
      <div className={styles.sectionHeader}>
        <h1 className={styles.title}>Fact Find</h1>
        <button
          type="button"
          className={styles.wizardPrimaryButton}
          onClick={() => void handleGenerateDocx()}
          disabled={isGeneratingDocx || isLoading || !!error}
        >
          {isGeneratingDocx ? "Generating..." : "Generate Fact Find Document"}
        </button>
      </div>

      {generateError ? (
        <div className={styles.actionNotice} role="alert">
          {generateError}
        </div>
      ) : null}

      <section className={styles.wizardsSection}>
        {isLoading ? (
          <div className={styles.emptyStateCard}>Loading the fact find workflow...</div>
        ) : error ? (
          <div className={styles.emptyStateCard}>{error}</div>
        ) : workflow && currentStep ? (
          <div className={styles.factFindWorkflowCard}>
            <div className={styles.factFindWorkflowHeader}>
              <div>
                <div className={styles.factFindEyebrow}>Update Fact Find</div>
                <h2 className={styles.factFindStepTitle}>{currentStep.title}</h2>
                <p className={styles.factFindStepDescription}>{currentStep.description}</p>
                {currentStep.guidance ? <div className={styles.factFindGuidance}>{currentStep.guidance}</div> : null}
              </div>
              <div className={styles.factFindStepBadge}>
                Step {stepIndex + 1} of {workflow.steps.length}
              </div>
            </div>

            <div className={styles.factFindStepper}>
              {workflow.steps.map((step, index) => (
                <button
                  key={step.id}
                  type="button"
                  className={`${styles.factFindStepPill} ${index === stepIndex ? styles.factFindStepPillActive : ""}`.trim()}
                  onClick={() => setStepIndex(index)}
                >
                  {step.title}
                </button>
              ))}
            </div>

            {currentStep.editorCard ? renderEditorCard(currentStep.editorCard, updateStepField) : null}
            {currentStep.displayCard ? renderDisplayCard(currentStep.displayCard) : null}

            <div className={styles.factFindWorkflowActions}>
              <button
                type="button"
                className={styles.wizardSecondaryButton}
                onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
                disabled={stepIndex === 0}
              >
                Back
              </button>
              <div className={styles.factFindWorkflowActionsRight}>
                <button
                  type="button"
                  className={styles.wizardSecondaryButton}
                  onClick={() => window.location.reload()}
                  disabled={isSavingStep || isGeneratingDocx}
                >
                  Refresh
                </button>
                <button
                  type="button"
                  className={styles.wizardSecondaryButton}
                  onClick={() => void handleGenerateDocx()}
                  disabled={isGeneratingDocx || isSavingStep}
                >
                  {isGeneratingDocx ? "Generating..." : "Generate .docx"}
                </button>
                <button
                  type="button"
                  className={styles.wizardPrimaryButton}
                  onClick={() => void handleNext()}
                  disabled={stepIndex >= workflow.steps.length - 1 || isSavingStep || isGeneratingDocx}
                >
                  {isSavingStep ? "Saving..." : "Next"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.emptyStateCard}>No fact find workflow is available for this client yet.</div>
        )}
      </section>
    </>
  );
}
