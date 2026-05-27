import DefaultTemplateManager from "@/app/admin/templates/default-template-manager";
import { FINLEY_MANAGED_TEMPLATES } from "@/lib/finley-template-catalog";
import { ENGAGEMENT_LETTER_TEMPLATE_FIELDS } from "@/lib/finley-template-validation";
import styles from "../admin.module.css";

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
            <li>Place generated blocks, tables, and signature blocks on their own paragraph.</li>
            <li>Finley applies the active document style profile for practice branding.</li>
            <li>Licensee override management will live in a separate licensee template management area.</li>
          </ul>
        </div>
        <div className={styles.templateGuideCard}>
          <h3>V1 rollout</h3>
          <p>
            Engagement Letter is upload-enabled now. Ongoing Agreement, Annual Agreement, and Record of Advice are shown
            here so they can move onto the same template path next.
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
                <th>Field</th>
                <th>Use</th>
                <th>Type</th>
                <th>Required</th>
              </tr>
            </thead>
            <tbody>
              {ENGAGEMENT_LETTER_TEMPLATE_FIELDS.map((field) => (
                <tr key={field.field}>
                  <td>
                    <strong>{field.kind === "html" ? `<<html:${field.field}>>` : `<<${field.field}>>`}</strong>
                  </td>
                  <td>{field.label}</td>
                  <td>{field.kind}</td>
                  <td>{field.required ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
