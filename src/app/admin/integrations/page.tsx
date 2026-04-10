import { DesktopBrokerLogo } from "@/components/desktop-broker-logo";
import { Hub24Logo } from "@/components/hub24-logo";
import { ProductRexLogo } from "@/components/product-rex-logo";
import styles from "../admin.module.css";

const docmosisConfigured = Boolean(process.env.DOCMOSIS_API_URL && process.env.DOCMOSIS_ACCESS_KEY);

export default function AdminIntegrationsPage() {
  return (
    <div className={styles.integrationGrid}>
      <section className={styles.integrationCard}>
        <div className={styles.integrationBrand}>
          <ProductRexLogo className={styles.integrationLogo} />
        </div>

        <div className={styles.integrationDetails}>
          <div className={styles.contentCardHeader}>
            <div>
              <h2 className={styles.cardTitle}>ProductRex</h2>
              <p className={styles.cardText}>
                Per-user OAuth integration managed through the app profile. Administration keeps the operational view
                here so app admins can see how this integration is expected to be used and governed.
              </p>
            </div>

            <span className={styles.badge}>Profile managed</span>
          </div>

          <div className={styles.integrationMetrics}>
            <div className={styles.integrationMetric}>
              <span>Type</span>
              <strong>Third-party API</strong>
            </div>
            <div className={styles.integrationMetric}>
              <span>Scope</span>
              <strong>Per-user OAuth</strong>
            </div>
            <div className={styles.integrationMetric}>
              <span>Control point</span>
              <strong>Profile & Integrations</strong>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.integrationCard}>
        <div className={styles.integrationBrand}>
          <DesktopBrokerLogo className={styles.integrationLogo} />
        </div>

        <div className={styles.integrationDetails}>
          <div className={styles.contentCardHeader}>
            <div>
              <h2 className={styles.cardTitle}>Desktop Broker</h2>
              <p className={styles.cardText}>
                Placeholder integration for mortgage and lending workflows. This is ready to become the admin-owned
                setup page once connection details and scope rules are available.
              </p>
            </div>

            <span className={styles.badge}>Coming soon</span>
          </div>

          <div className={styles.integrationMetrics}>
            <div className={styles.integrationMetric}>
              <span>Type</span>
              <strong>Partner platform</strong>
            </div>
            <div className={styles.integrationMetric}>
              <span>Scope</span>
              <strong>Practice or licensee</strong>
            </div>
            <div className={styles.integrationMetric}>
              <span>Status</span>
              <strong>Not connected</strong>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.integrationCard}>
        <div className={styles.integrationBrand}>
          <Hub24Logo className={styles.integrationLogo} />
        </div>

        <div className={styles.integrationDetails}>
          <div className={styles.contentCardHeader}>
            <div>
              <h2 className={styles.cardTitle}>HUB24</h2>
              <p className={styles.cardText}>
                Placeholder integration for platform and portfolio data. This section is ready for future connection
                setup, credential management, and sync monitoring when the integration work starts.
              </p>
            </div>

            <span className={styles.badge}>Coming soon</span>
          </div>

          <div className={styles.integrationMetrics}>
            <div className={styles.integrationMetric}>
              <span>Type</span>
              <strong>Investment platform</strong>
            </div>
            <div className={styles.integrationMetric}>
              <span>Scope</span>
              <strong>Practice or licensee</strong>
            </div>
            <div className={styles.integrationMetric}>
              <span>Status</span>
              <strong>Not connected</strong>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.integrationCard}>
        <div className={styles.integrationBrand}>
          <div>
            <p className={styles.eyebrow}>Docmosis</p>
            <h3 className={styles.cardTitle}>Document generation</h3>
          </div>
        </div>

        <div className={styles.integrationDetails}>
          <div className={styles.contentCardHeader}>
            <div>
              <h2 className={styles.cardTitle}>Docmosis</h2>
              <p className={styles.cardText}>
                Central connection for merge template rendering across Fact Find, Engagement Letters, and invoices.
                Template ownership will also sit under the dedicated Templates area next.
              </p>
            </div>

            <span className={styles.badge}>{docmosisConfigured ? "Configured" : "Needs configuration"}</span>
          </div>

          <div className={styles.integrationMetrics}>
            <div className={styles.integrationMetric}>
              <span>API URL</span>
              <strong>{process.env.DOCMOSIS_API_URL || "Not configured"}</strong>
            </div>
            <div className={styles.integrationMetric}>
              <span>Fact Find template</span>
              <strong>{process.env.DOCMOSIS_FACT_FIND_TEMPLATE_NAME || "Not configured"}</strong>
            </div>
            <div className={styles.integrationMetric}>
              <span>Engagement template</span>
              <strong>{process.env.DOCMOSIS_ENGAGEMENT_TEMPLATE_NAME || "Not configured"}</strong>
            </div>
            <div className={styles.integrationMetric}>
              <span>Invoice template</span>
              <strong>{process.env.DOCMOSIS_INVOICE_TEMPLATE_NAME || "Not configured"}</strong>
            </div>
            <div className={styles.integrationMetric}>
              <span>Access key</span>
              <strong>{process.env.DOCMOSIS_ACCESS_KEY ? "Configured" : "Missing"}</strong>
            </div>
            <div className={styles.integrationMetric}>
              <span>Responsibility</span>
              <strong>Admin + Templates</strong>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
