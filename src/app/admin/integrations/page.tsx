import { DesktopBrokerLogo } from "@/components/desktop-broker-logo";
import { Hub24Logo } from "@/components/hub24-logo";
import { ProductRexLogo } from "@/components/product-rex-logo";
import { XeroLogo } from "@/components/xero-logo";
import styles from "../admin.module.css";

const xeroConfigured = Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET);

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
          <XeroLogo className={styles.integrationLogo} />
        </div>

        <div className={styles.integrationDetails}>
          <div className={styles.contentCardHeader}>
            <div>
              <h2 className={styles.cardTitle}>Xero</h2>
              <p className={styles.cardText}>
                Accounting integration for creating invoices, syncing revenue line items, and supporting payment
                reconciliation once adviser invoice workflows are approved.
              </p>
            </div>

            <span className={styles.badge}>{xeroConfigured ? "Configured" : "Needs configuration"}</span>
          </div>

          <div className={styles.integrationMetrics}>
            <div className={styles.integrationMetric}>
              <span>Type</span>
              <strong>Accounting platform</strong>
            </div>
            <div className={styles.integrationMetric}>
              <span>Scope</span>
              <strong>Practice or licensee</strong>
            </div>
            <div className={styles.integrationMetric}>
              <span>Auth method</span>
              <strong>OAuth 2.0</strong>
            </div>
            <div className={styles.integrationMetric}>
              <span>Client ID</span>
              <strong>{process.env.XERO_CLIENT_ID ? "Configured" : "Not configured"}</strong>
            </div>
            <div className={styles.integrationMetric}>
              <span>Client secret</span>
              <strong>{process.env.XERO_CLIENT_SECRET ? "Configured" : "Missing"}</strong>
            </div>
            <div className={styles.integrationMetric}>
              <span>Responsibility</span>
              <strong>Admin + Invoices</strong>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
