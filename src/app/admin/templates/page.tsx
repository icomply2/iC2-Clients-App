import styles from "../admin.module.css";

const templates = [
  {
    name: "Fact Find",
    scope: "Global",
    engine: "Docmosis",
    templateName: process.env.DOCMOSIS_FACT_FIND_TEMPLATE_NAME || "Not configured",
    status: process.env.DOCMOSIS_FACT_FIND_TEMPLATE_NAME ? "Configured" : "Missing",
  },
  {
    name: "Engagement Letter",
    scope: "Global",
    engine: "Docmosis",
    templateName: process.env.DOCMOSIS_ENGAGEMENT_TEMPLATE_NAME || "Not configured",
    status: process.env.DOCMOSIS_ENGAGEMENT_TEMPLATE_NAME ? "Configured" : "Missing",
  },
  {
    name: "Invoice",
    scope: "Global",
    engine: "Docmosis",
    templateName: process.env.DOCMOSIS_INVOICE_TEMPLATE_NAME || "Not configured",
    status: process.env.DOCMOSIS_INVOICE_TEMPLATE_NAME ? "Configured" : "Missing",
  },
  {
    name: "Record of Advice",
    scope: "Planned",
    engine: "Docmosis",
    templateName: "Awaiting template mapping",
    status: "Coming soon",
  },
  {
    name: "Statement of Advice",
    scope: "Planned",
    engine: "Docmosis",
    templateName: "Awaiting template mapping",
    status: "Coming soon",
  },
];

export default function AdminTemplatesPage() {
  return (
    <section className={styles.contentCard}>
      <div className={styles.contentCardHeader}>
        <div>
          <h2 className={styles.cardTitle}>Templates</h2>
          <p className={styles.cardText}>
            Template ownership sits alongside Integrations so administrators can manage Docmosis template mappings,
            document scope, and rollout readiness in one place.
          </p>
        </div>

        <span className={styles.badge}>{templates.length} templates</span>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Document type</th>
              <th>Engine</th>
              <th>Scope</th>
              <th>Template name</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr key={template.name}>
                <td>{template.name}</td>
                <td>{template.engine}</td>
                <td>{template.scope}</td>
                <td>{template.templateName}</td>
                <td>{template.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
