import { DOCUMENT_TEMPLATES, type DocumentSectionKey } from "@/lib/documents/document-sections";
import styles from "../admin.module.css";

const sectionLabels: Record<DocumentSectionKey, string> = {
  factFind: "Fact Find",
  engagementLetter: "Engagement Letter",
  invoice: "Invoice",
  coverPage: "Cover Page",
  tableOfContents: "Table of Contents",
  letter: "Letter",
  executiveSummary: "Executive Summary",
  aboutThisAdvice: "About This Advice",
  scopeOfAdvice: "Scope of Advice",
  personalFinancialPosition: "Personal and Financial Position",
  riskProfile: "Risk Profile",
  strategyRecommendations: "Strategy Recommendations",
  productRecommendations: "Product Recommendations",
  investmentPortfolioRecommendations: "Investment Portfolio Recommendations",
  portfolioAllocation: "Portfolio Allocation",
  replacementAnalysis: "Replacement Analysis",
  insuranceNeedsAnalysis: "Insurance Needs Analysis",
  recommendedInsurancePolicies: "Recommended Insurance Policies",
  insuranceProductReplacement: "Insurance Product Replacement",
  projections: "Projections",
  feesAndDisclosures: "Fees and Disclosures",
  actionsRequired: "Actions Required by You",
  authorityToProceed: "Authority to Proceed",
  serviceAgreement: "Service Agreement",
  consentToDeductFees: "Consent to Deduct Fees",
  appendix: "Appendix",
};

const templates = Object.values(DOCUMENT_TEMPLATES);

function getStatusClass(status: (typeof templates)[number]["status"]) {
  if (status === "Active") {
    return `${styles.statusPill} ${styles.statusPillAdmin}`;
  }

  return styles.statusPill;
}

export default function AdminTemplatesPage() {
  return (
    <section className={styles.contentCard}>
      <div className={styles.contentCardHeader}>
        <div>
          <h2 className={styles.cardTitle}>Templates</h2>
          <p className={styles.cardText}>
            Templates are now managed as reusable Finley document structures. Standalone documents and larger advice
            documents can share the same sections, wording, tables, agreement blocks, and DOCX export logic.
          </p>
        </div>

        <span className={styles.badge}>{templates.length} templates</span>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Template</th>
              <th>Engine</th>
              <th>Scope</th>
              <th>Reusable sections</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr key={template.key}>
                <td>
                  <strong>{template.label}</strong>
                  <p className={styles.tableSubtext}>{template.description}</p>
                </td>
                <td>{template.engine}</td>
                <td>{template.scope}</td>
                <td>
                  <div className={styles.templateSectionList}>
                    {template.sections.map((section) => (
                      <span className={styles.templateSectionPill} key={`${template.key}-${section}`}>
                        {sectionLabels[section]}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <span className={getStatusClass(template.status)}>{template.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
