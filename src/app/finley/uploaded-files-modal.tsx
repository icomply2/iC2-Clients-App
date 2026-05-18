"use client";

import styles from "./page.module.css";

type UploadedFileBadgeTone = "fact-find" | "product" | "insurance" | "active" | "default";

export type UploadedFilesModalFile = {
  id: string;
  name: string;
  badges?: Array<{
    label: string;
    tone?: UploadedFileBadgeTone;
  }>;
  actions?: Array<{
    label: string;
    onClick: () => void;
    disabled?: boolean;
  }>;
};

type UploadedFilesModalProps = {
  clientName: string;
  files: UploadedFilesModalFile[];
  onAddMore: () => void;
  onClose: () => void;
};

function badgeClassName(tone: UploadedFileBadgeTone = "default") {
  switch (tone) {
    case "fact-find":
      return `${styles.uploadFileBadge} ${styles.uploadFileBadgeFactFind}`.trim();
    case "product":
      return `${styles.uploadFileBadge} ${styles.uploadFileBadgeProduct}`.trim();
    case "insurance":
      return `${styles.uploadFileBadge} ${styles.uploadFileBadgeInsurance}`.trim();
    case "active":
      return `${styles.uploadFileBadge} ${styles.uploadFileBadgeActive}`.trim();
    default:
      return styles.uploadFileBadge;
  }
}

export function UploadedFilesModal({ clientName, files, onAddMore, onClose }: UploadedFilesModalProps) {
  return (
    <div className={styles.modalOverlay} role="presentation" onClick={onClose}>
      <div
        className={`${styles.modalCard} ${styles.uploadedFilesModal}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="finley-uploaded-files-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <h2 id="finley-uploaded-files-title" className={styles.modalTitle}>
            Uploaded Files
          </h2>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.uploadedFilesText}>
            These are the files currently loaded into Finley for {clientName}.
          </div>
          <div className={styles.uploadedFilesList}>
            {files.map((file) => (
              <div key={file.id} className={styles.uploadedFileItem}>
                <div className={styles.uploadedFileMain}>
                  <span className={styles.uploadedFileName}>{file.name}</span>
                  {file.badges?.length ? (
                    <span className={styles.uploadedFileBadgeRow}>
                      {file.badges.map((badge) => (
                        <span key={`${file.id}-${badge.label}`} className={badgeClassName(badge.tone)}>
                          {badge.label}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </div>
                {file.actions?.length ? (
                  <div className={styles.uploadedFileActions}>
                    {file.actions.map((action) => (
                      <button
                        key={`${file.id}-${action.label}`}
                        type="button"
                        className={styles.uploadedFileActionButton}
                        onClick={action.onClick}
                        disabled={action.disabled}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.modalActions}>
          <button type="button" className={styles.planCancelButton} onClick={onClose}>
            Close
          </button>
          <button type="button" className={styles.planApproveButton} onClick={onAddMore}>
            Add more files
          </button>
        </div>
      </div>
    </div>
  );
}
