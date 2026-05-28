"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FinleyTemplateValidationResult } from "@/lib/finley-template-validation";
import styles from "../admin.module.css";

type TemplateRow = {
  documentType: string;
  label: string;
  displayName: string;
  description: string;
  engine: string;
  scope: string;
  source: string;
  fileName: string;
  lastModified: string | null;
  status: "Active" | "Planned";
  uploadEnabled: boolean;
  validation: FinleyTemplateValidationResult | null;
};

type TemplateResponse = {
  templates: TemplateRow[];
};

type ActionResponse = {
  message?: string;
  template?: TemplateRow;
  validation?: FinleyTemplateValidationResult;
};

function DownloadIcon() {
  return (
    <svg aria-hidden="true" className={styles.toolbarIcon} viewBox="0 0 24 24">
      <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 19h14" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg aria-hidden="true" className={styles.toolbarIcon} viewBox="0 0 24 24">
      <path d="M6 7h12m-10 0 .8 13h6.4L16 7M9 7V4h6v3" />
    </svg>
  );
}

function RenameIcon() {
  return (
    <svg aria-hidden="true" className={styles.toolbarIcon} viewBox="0 0 24 24">
      <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Zm11-13 3 3" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg aria-hidden="true" className={styles.toolbarIcon} viewBox="0 0 24 24">
      <path d="M12 21V10m0 0 4 4m-4-4-4 4M5 5h14" />
    </svg>
  );
}

function formatDate(value: string | null) {
  if (!value) {
    return "Generated";
  }

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function validationSummary(validation: FinleyTemplateValidationResult | null) {
  if (!validation) {
    return "Generated default has not been uploaded through validation.";
  }

  if (validation.valid) {
    return `${validation.supportedFields.length} supported fields, ${validation.warnings.length} warnings.`;
  }

  const issues = [
    validation.unknownFields.length ? `${validation.unknownFields.length} unknown fields` : null,
    validation.unsupportedConstructs.length ? `${validation.unsupportedConstructs.length} unsupported constructs` : null,
  ].filter(Boolean);

  return issues.length ? issues.join(", ") : "Template validation failed.";
}

async function parseActionResponse(response: Response) {
  const payload = await response.json().catch(() => ({})) as ActionResponse;

  if (!response.ok) {
    throw new Error(payload.message || "Template action failed.");
  }

  return payload;
}

export default function DefaultTemplateManager() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>("engagement-letter");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.documentType === selectedId) ?? templates[0] ?? null,
    [selectedId, templates],
  );

  async function loadTemplates() {
    const response = await fetch("/api/admin/templates/defaults", { cache: "no-store" });
    const payload = await response.json() as TemplateResponse;
    setTemplates(payload.templates);
  }

  useEffect(() => {
    void loadTemplates().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : "Could not load templates.");
    });
  }, []);

  function updateTemplate(updatedTemplate?: TemplateRow) {
    if (!updatedTemplate) return;
    setTemplates((current) =>
      current.map((template) =>
        template.documentType === updatedTemplate.documentType ? updatedTemplate : template,
      ),
    );
  }

  async function runAction(action: () => Promise<ActionResponse>) {
    setIsWorking(true);
    setError(null);
    setMessage(null);

    try {
      const payload = await action();
      updateTemplate(payload.template);
      setMessage(payload.message ?? "Template updated.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Template action failed.");
    } finally {
      setIsWorking(false);
    }
  }

  function handleDownload() {
    if (!selectedTemplate?.uploadEnabled) {
      setError("This template is not download-enabled in V1.");
      return;
    }

    window.location.href = `/api/admin/templates/defaults/${selectedTemplate.documentType}/download`;
  }

  function handleUploadClick() {
    if (!selectedTemplate?.uploadEnabled) {
      setError(`${selectedTemplate?.displayName ?? "This template"} is not upload-enabled in V1.`);
      return;
    }

    fileInputRef.current?.click();
  }

  async function handleUpload(file: File | undefined) {
    if (!file || !selectedTemplate) return;

    await runAction(async () => {
      const formData = new FormData();
      formData.append("documentType", selectedTemplate.documentType);
      formData.append("file", file);

      const response = await fetch("/api/admin/templates/defaults", {
        method: "POST",
        body: formData,
      });

      return parseActionResponse(response);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleRename() {
    if (!selectedTemplate) return;

    if (!selectedTemplate.uploadEnabled) {
      setError(`${selectedTemplate.displayName} is not rename-enabled in V1.`);
      return;
    }

    const nextName = window.prompt("Rename template", selectedTemplate.displayName)?.trim();

    if (!nextName) return;

    await runAction(async () => {
      const response = await fetch("/api/admin/templates/defaults", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: selectedTemplate.documentType,
          displayName: nextName,
        }),
      });

      return parseActionResponse(response);
    });
  }

  async function handleReset() {
    if (!selectedTemplate) return;

    if (!selectedTemplate.uploadEnabled) {
      setError(`${selectedTemplate.displayName} is not reset-enabled in V1.`);
      return;
    }

    const confirmed = window.confirm(`Reset ${selectedTemplate.displayName} to the generated Finley default?`);

    if (!confirmed) return;

    await runAction(async () => {
      const response = await fetch(
        `/api/admin/templates/defaults?documentType=${encodeURIComponent(selectedTemplate.documentType)}`,
        { method: "DELETE" },
      );

      return parseActionResponse(response);
    });
  }

  const actionDisabled = isWorking || !selectedTemplate;
  const selectedActionDisabled = actionDisabled || !selectedTemplate?.uploadEnabled;

  return (
    <section className={styles.templateManager}>
      <div className={styles.templateToolbar}>
        <div className={styles.templateToolbarGroup} aria-label="Template actions">
          <button
            className={styles.toolbarButton}
            disabled={selectedActionDisabled}
            onClick={handleDownload}
            aria-label="Download selected template"
            title="Download selected template"
            type="button"
          >
            <DownloadIcon />
          </button>
          <button
            className={styles.toolbarButton}
            disabled={selectedActionDisabled}
            onClick={handleReset}
            aria-label="Reset selected template"
            title="Reset selected template"
            type="button"
          >
            <DeleteIcon />
          </button>
          <button
            className={styles.toolbarButton}
            disabled={selectedActionDisabled}
            onClick={handleRename}
            aria-label="Rename selected template"
            title="Rename selected template"
            type="button"
          >
            <RenameIcon />
          </button>
          <button
            className={`${styles.toolbarButton} ${styles.toolbarButtonPrimary}`}
            disabled={selectedActionDisabled}
            onClick={handleUploadClick}
            aria-label="Upload replacement template"
            title="Upload replacement template"
            type="button"
          >
            <UploadIcon />
          </button>
          <input
            ref={fileInputRef}
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className={styles.hiddenFileInput}
            onChange={(event) => void handleUpload(event.target.files?.[0])}
            type="file"
          />
        </div>
      </div>

      {message ? <p className={styles.successText}>{message}</p> : null}
      {error ? <p className={styles.errorText}>{error}</p> : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.templateSelectColumn}>Select</th>
              <th>Template</th>
              <th>Engine</th>
              <th>Source</th>
              <th>Last modified</th>
              <th>Status</th>
              <th>Validation</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr
                className={template.documentType === selectedId ? styles.selectedTemplateRow : undefined}
                key={template.documentType}
              >
                <td className={styles.templateSelectColumn}>
                  <input
                    aria-label={`Select ${template.displayName}`}
                    checked={template.documentType === selectedId}
                    onChange={() => {
                      setSelectedId(template.documentType);
                      setError(null);
                      setMessage(null);
                    }}
                    type="radio"
                  />
                </td>
                <td>
                  <strong>{template.displayName}</strong>
                  <p className={styles.tableSubtext}>{template.description}</p>
                  <p className={styles.templateFileName}>{template.fileName}</p>
                </td>
                <td>{template.engine}</td>
                <td>{template.source}</td>
                <td>{formatDate(template.lastModified)}</td>
                <td>
                  <span className={template.status === "Active" ? `${styles.statusPill} ${styles.statusPillAdmin}` : styles.statusPill}>
                    {template.status}
                  </span>
                </td>
                <td>{validationSummary(template.validation)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
