import DefaultTemplateManager from "@/app/admin/templates/default-template-manager";
import { FINLEY_MANAGED_TEMPLATES } from "@/lib/finley-template-catalog";
import {
  getFinleyDocumentSpecificTemplateFields,
  getFinleyGlobalTemplateFields,
  type FinleyTemplateFieldDefinition,
} from "@/lib/finley-template-validation";
import styles from "../admin.module.css";

const TEMPLATE_GUIDE_SECTIONS: Array<{ label: string; fields: FinleyTemplateFieldDefinition[] }> = [
  { label: "Global", fields: getFinleyGlobalTemplateFields() },
  { label: "Engagement Letter", fields: getFinleyDocumentSpecificTemplateFields("engagement-letter") },
  { label: "Ongoing + Annual Agreements", fields: getFinleyDocumentSpecificTemplateFields("ongoing-agreement") },
];

export default function AdminTemplatesPage() {
  return (
    <section className={styles.contentCard}>
      <div className={styles.contentCardHeader}>
        <div>
          <h2 className={styles.cardTitle}>Templates</h2>
        </div>

        <span className={styles.badge}>{FINLEY_MANAGED_TEMPLATES.length} templates</span>
      </div>

      <DefaultTemplateManager />

      <div className={styles.templateGuideGrid}>
        <div className={styles.templateGuideCard}>
          <h3>Authoring rules</h3>
          <ul className={styles.templateRuleList}>
            <li>Use only placeholders listed in the Finley catalogue.</li>
            <li>All placeholders are optional; include only the fields you want in the document.</li>
            <li>Place generated blocks, tables, and signature blocks on their own paragraph.</li>
            <li>Finley applies the active document style profile for practice branding.</li>
            <li>Licensee override management will live in a separate licensee template management area.</li>
          </ul>
        </div>
        <div className={styles.templateGuideCard}>
          <h3>V1 rollout</h3>
          <p>
            Engagement Letter, Ongoing Agreement, and Annual Agreement are upload-enabled now. Record of Advice is shown
            here so it can move onto the same template path next.
          </p>
        </div>
      </div>

      <section className={styles.contentCard}>
        <div className={styles.contentCardHeader}>
          <div>
            <h2 className={styles.cardTitle}>Finley Template Guide</h2>
            <p className={styles.cardText}>
              Finley templates use a controlled subset of Docmosis-style placeholders. The template controls wording and
              structure; the active document style profile controls practice branding.
            </p>
          </div>
          <span className={styles.badge}>Placeholder catalogue</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Scope</th>
                <th>Field</th>
                <th>Use</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {TEMPLATE_GUIDE_SECTIONS.flatMap((section) =>
                section.fields.map((field) => (
                  <tr key={`${section.label}-${field.field}`}>
                    <td>{section.label}</td>
                    <td>
                      <strong>{field.kind === "html" ? `<<html:${field.field}>>` : `<<${field.field}>>`}</strong>
                    </td>
                    <td>{field.label}</td>
                    <td>{field.kind}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
