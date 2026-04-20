"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppTopbar } from "@/components/app-topbar";
import { DesktopBrokerLogo } from "@/components/desktop-broker-logo";
import { Hub24Logo } from "@/components/hub24-logo";
import { ProductRexLogo } from "@/components/product-rex-logo";
import { updateAdminUser } from "@/lib/api/admin";
import styles from "./page.module.css";

type AccountProfileProps = {
  userId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  appAccess: string;
  appAdminValue: string;
  isAppAdmin: boolean;
  rexConnected: boolean;
  rexExpiresAt: string | null;
  desktopBrokerConfigured: boolean;
  desktopBrokerEnvironment: string;
  integrationStatus: string | null;
  integrationMessage: string | null;
};

type TabKey = "account" | "security" | "preferences" | "integrations";

type ProductRexUserSummary = {
  email?: string;
  name?: string;
  id?: number;
  active_rp_name?: string;
};

export function ProfileAccount({
  userId,
  name,
  email,
  role,
  status,
  appAccess,
  appAdminValue,
  isAppAdmin,
  rexConnected,
  rexExpiresAt,
  desktopBrokerConfigured,
  desktopBrokerEnvironment,
  integrationStatus,
  integrationMessage,
}: AccountProfileProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("account");
  const [fullName, setFullName] = useState(name);
  const [emailAddress, setEmailAddress] = useState(email);
  const [preferredPhone, setPreferredPhone] = useState("");
  const [jobTitle, setJobTitle] = useState(role);
  const [accountStatus, setAccountStatus] = useState(status);
  const [accountAccess, setAccountAccess] = useState(appAccess);
  const [appAdminSelection, setAppAdminSelection] = useState(appAdminValue);
  const [defaultLandingPage, setDefaultLandingPage] = useState("/clients");
  const [defaultPageSize, setDefaultPageSize] = useState("10");
  const [compactLists, setCompactLists] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [rexBusy, setRexBusy] = useState(false);
  const [rexMessage, setRexMessage] = useState<string | null>(null);
  const [rexUser, setRexUser] = useState<ProductRexUserSummary | null>(null);

  const roleOptions = [
    "Adviser",
    "Compliance Manager",
    "Practice Admin",
    "Paraplanner",
    "Support Staff",
    "Licensee Admin",
  ];
  const statusOptions = ["Active", "Pending", "Suspended", "Inactive"];
  const appAccessOptions = ["Full Access", "Standard Access", "Read Only", "No Access"];
  const appAdminOptions = ["No", "App Admin", "ic2 App Admin"];

  useEffect(() => {
    if (integrationStatus === "connected") {
      setActiveTab("integrations");
      setRexMessage("ProductRex connected successfully.");
      return;
    }

    if (integrationStatus === "disconnected") {
      setActiveTab("integrations");
      setRexMessage("ProductRex has been disconnected.");
      setRexUser(null);
      return;
    }

    if (integrationStatus === "error") {
      setActiveTab("integrations");
      setRexMessage(
        integrationMessage
          ? `ProductRex connection failed: ${integrationMessage.replace(/-/g, " ")}.`
          : "ProductRex connection failed.",
      );
    }
  }, [integrationMessage, integrationStatus]);

  useEffect(() => {
    if (activeTab !== "integrations" || !rexConnected) {
      return;
    }

    let cancelled = false;

    async function loadProductRexUser() {
      setRexBusy(true);

      try {
        const response = await fetch("/api/integrations/rex-token/user", {
          method: "GET",
          cache: "no-store",
        });

        const body = (await response.json().catch(() => null)) as
          | {
              results?: ProductRexUserSummary[];
              data?: {
                results?: ProductRexUserSummary[];
              };
              message?: string;
            }
          | null;

        if (!response.ok) {
          throw new Error(body?.message ?? "Unable to load the ProductRex account.");
        }

        const userRecord = body?.results?.[0] ?? body?.data?.results?.[0] ?? null;

        if (!cancelled) {
          setRexUser(userRecord);
        }
      } catch (loadError) {
        if (!cancelled) {
          setRexMessage(
            loadError instanceof Error ? loadError.message : "Unable to load the ProductRex account.",
          );
        }
      } finally {
        if (!cancelled) {
          setRexBusy(false);
        }
      }
    }

    void loadProductRexUser();

    return () => {
      cancelled = true;
    };
  }, [activeTab, rexConnected]);

  async function handlePasswordReset() {
    if (!emailAddress) {
      setMessage("No email address is available for this account yet.");
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const query = new URLSearchParams({ email: emailAddress }).toString();
      const response = await fetch(`/api/auth/forgot-password?${query}`, {
        method: "GET",
      });

      const body = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(body?.message ?? "Password reset request failed.");
      }

      setMessage(body?.message ?? "A password reset email has been requested for this account.");
    } catch (requestError) {
      const nextMessage =
        requestError instanceof Error ? requestError.message : "Unable to request a password reset right now.";
      setMessage(nextMessage);
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    if (!userId) {
      setMessage("Unable to save this account because the user id could not be resolved.");
      return;
    }

    setSaveBusy(true);
    setMessage(null);

    try {
      const payload = {
        ...(accountAccess ? { appAccess: accountAccess } : {}),
        ...(jobTitle ? { userRole: jobTitle } : {}),
        ...(accountStatus ? { userStatus: accountStatus } : {}),
      };

      await updateAdminUser(userId, payload);

      setMessage(
        "Account changes saved. Role, account status, and app access are now connected to the live user endpoint.",
      );
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Unable to save user changes right now.");
    } finally {
      setSaveBusy(false);
    }
  }

  async function handleDisconnectProductRex() {
    setRexBusy(true);
    setRexMessage(null);

    try {
      const response = await fetch("/api/integrations/rex-token/disconnect", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Unable to disconnect ProductRex right now.");
      }

      window.location.assign("/profile?integration=productrex&status=disconnected");
    } catch (disconnectError) {
      setRexMessage(
        disconnectError instanceof Error
          ? disconnectError.message
          : "Unable to disconnect ProductRex right now.",
      );
    } finally {
      setRexBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <AppTopbar finleyHref="/finley" />

      <main className={styles.content}>
        <section className={styles.headerBar}>
          <span className={styles.headerTitle}>Manage your account</span>
        </section>

        <div className={styles.subnav}>
          <button
            type="button"
            className={`${styles.subnavButton} ${activeTab === "account" ? styles.subnavButtonActive : ""}`}
            onClick={() => setActiveTab("account")}
          >
            Account Details
          </button>
          <button
            type="button"
            className={`${styles.subnavButton} ${activeTab === "security" ? styles.subnavButtonActive : ""}`}
            onClick={() => setActiveTab("security")}
          >
            Security
          </button>
          <button
            type="button"
            className={`${styles.subnavButton} ${activeTab === "preferences" ? styles.subnavButtonActive : ""}`}
            onClick={() => setActiveTab("preferences")}
          >
            Preferences
          </button>
          <button
            type="button"
            className={`${styles.subnavButton} ${activeTab === "integrations" ? styles.subnavButtonActive : ""}`}
            onClick={() => setActiveTab("integrations")}
          >
            Integrations
          </button>
          {isAppAdmin ? (
            <Link href="/admin" className={styles.subnavButton}>
              Administration
            </Link>
          ) : null}
        </div>

        <section className={styles.panel}>
          {activeTab === "account" ? (
            <div className={styles.panelGrid}>
              <div className={styles.field}>
                <span>Full name</span>
                <input value={fullName} onChange={(event) => setFullName(event.target.value)} readOnly />
              </div>
              <div className={styles.field}>
                <span>Email</span>
                <input value={emailAddress} onChange={(event) => setEmailAddress(event.target.value)} readOnly />
              </div>
              <div className={styles.field}>
                <span>Preferred phone</span>
                <input value={preferredPhone} onChange={(event) => setPreferredPhone(event.target.value)} placeholder="Preferred phone" readOnly />
              </div>
              <div className={styles.field}>
                <span>Role</span>
                <select value={jobTitle} onChange={(event) => setJobTitle(event.target.value)}>
                  {!roleOptions.includes(jobTitle) && jobTitle ? <option value={jobTitle}>{jobTitle}</option> : null}
                  {roleOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <span>Account status</span>
                <select value={accountStatus} onChange={(event) => setAccountStatus(event.target.value)}>
                  {!statusOptions.includes(accountStatus) && accountStatus ? <option value={accountStatus}>{accountStatus}</option> : null}
                  {statusOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <span>App access</span>
                <select value={accountAccess} onChange={(event) => setAccountAccess(event.target.value)}>
                  {!appAccessOptions.includes(accountAccess) && accountAccess ? (
                    <option value={accountAccess}>{accountAccess}</option>
                  ) : null}
                  {appAccessOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <span>App admin value</span>
                <select value={appAdminSelection} onChange={(event) => setAppAdminSelection(event.target.value)} disabled>
                  {!appAdminOptions.includes(appAdminSelection) && appAdminSelection ? (
                    <option value={appAdminSelection}>{appAdminSelection}</option>
                  ) : null}
                  {appAdminOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <p className={styles.cardText}>
                The live user endpoint currently saves role, account status, and app access. Name, email, phone, and app admin remain backend-managed for now.
              </p>
            </div>
          ) : null}

          {activeTab === "security" ? (
            <div className={styles.securityGrid}>
              <div className={styles.securityCard}>
                <h3 className={styles.cardTitle}>Password</h3>
                <p className={styles.cardText}>Send a password reset email to your current account address.</p>
                <button type="button" className={styles.primaryButton} onClick={handlePasswordReset} disabled={busy}>
                  {busy ? "Sending..." : "Reset password"}
                </button>
              </div>
              <div className={styles.securityCard}>
                <h3 className={styles.cardTitle}>Two-factor authentication</h3>
                <p className={styles.cardText}>This is currently managed during sign in based on the backend account settings.</p>
                <span className={styles.statusPill}>Managed in sign in</span>
              </div>
              <div className={styles.securityCard}>
                <h3 className={styles.cardTitle}>Account verification</h3>
                <p className={styles.cardText}>Email confirmation and activation are still controlled by the backend auth workflow.</p>
                <span className={styles.statusPillMuted}>Backend managed</span>
              </div>
            </div>
          ) : null}

          {activeTab === "preferences" ? (
            <div className={styles.panelGrid}>
              <div className={styles.field}>
                <span>Default landing page</span>
                <select value={defaultLandingPage} onChange={(event) => setDefaultLandingPage(event.target.value)}>
                  <option value="/clients">Clients</option>
                  <option value="/dashboard">Dashboard</option>
                  <option value="/profile">My Account</option>
                </select>
              </div>
              <div className={styles.field}>
                <span>Default page size</span>
                <select value={defaultPageSize} onChange={(event) => setDefaultPageSize(event.target.value)}>
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                </select>
              </div>
              <label className={styles.checkboxRow}>
                <input type="checkbox" checked={compactLists} onChange={(event) => setCompactLists(event.target.checked)} />
                <span>Use compact list spacing where available</span>
              </label>
            </div>
          ) : null}

          {activeTab === "integrations" ? (
            <div className={styles.integrationLayout}>
              <div className={styles.integrationCard}>
                <div className={styles.integrationBrand}>
                  <ProductRexLogo className={styles.integrationLogo} />
                </div>
                <div className={styles.integrationDetails}>
                  <div className={styles.integrationHeader}>
                    <div>
                      <h3 className={styles.cardTitle}>ProductRex</h3>
                      <p className={styles.cardText}>
                        External product and platform integration routed through Azure API Management.
                      </p>
                    </div>
                    <span className={rexConnected ? styles.statusPill : styles.statusPillMuted}>
                      {rexConnected ? "Connected" : "Not connected"}
                    </span>
                  </div>

                  <div className={styles.integrationGrid}>
                    <div className={styles.integrationMetric}>
                      <span>Integration type</span>
                      <strong>Third-party API</strong>
                    </div>
                    <div className={styles.integrationMetric}>
                      <span>Gateway</span>
                      <strong>Azure APIM</strong>
                    </div>
                    <div className={styles.integrationMetric}>
                      <span>Connection</span>
                      <strong>{rexConnected ? "Authenticated" : "Awaiting sign in"}</strong>
                    </div>
                    <div className={styles.integrationMetric}>
                      <span>Connected account</span>
                      <strong>{rexUser?.name ?? "Not connected yet"}</strong>
                    </div>
                    <div className={styles.integrationMetric}>
                      <span>ProductRex email</span>
                      <strong>{rexUser?.email ?? "Not connected yet"}</strong>
                    </div>
                    <div className={styles.integrationMetric}>
                      <span>Token expiry</span>
                      <strong>{rexExpiresAt ? new Date(rexExpiresAt).toLocaleString() : "Not available"}</strong>
                    </div>
                  </div>

                  <div className={styles.integrationActions}>
                    <Link href="/api/integrations/rex-token/connect" className={styles.primaryButton}>
                      {rexConnected ? "Reconnect ProductRex" : "Connect ProductRex"}
                    </Link>
                    {rexConnected ? (
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={handleDisconnectProductRex}
                        disabled={rexBusy}
                      >
                        {rexBusy ? "Disconnecting..." : "Disconnect"}
                      </button>
                    ) : null}
                    <span className={styles.statusPillMuted}>
                      {rexBusy ? "Checking ProductRex..." : "OAuth session is stored securely in server cookies"}
                    </span>
                  </div>
                  {rexMessage ? <p className={styles.success}>{rexMessage}</p> : null}
                </div>
              </div>

              <div className={styles.integrationCard}>
                <div className={styles.integrationBrand}>
                  <DesktopBrokerLogo className={styles.integrationLogo} />
                </div>
                <div className={styles.integrationDetails}>
                  <div className={styles.integrationHeader}>
                    <div>
                      <h3 className={styles.cardTitle}>Desktop Broker</h3>
                      <p className={styles.cardText}>
                        Trading and portfolio integration for contract notes, holdings, and holding transactions through a secure server-side proxy.
                      </p>
                    </div>
                    <span className={desktopBrokerConfigured ? styles.statusPill : styles.statusPillMuted}>
                      {desktopBrokerConfigured ? "Configured" : "Not configured"}
                    </span>
                  </div>

                  <div className={styles.integrationGrid}>
                    <div className={styles.integrationMetric}>
                      <span>Integration type</span>
                      <strong>Third-party API</strong>
                    </div>
                    <div className={styles.integrationMetric}>
                      <span>Environment</span>
                      <strong>{desktopBrokerEnvironment}</strong>
                    </div>
                    <div className={styles.integrationMetric}>
                      <span>Authentication</span>
                      <strong>Server-side basic auth</strong>
                    </div>
                    <div className={styles.integrationMetric}>
                      <span>Enabled endpoints</span>
                      <strong>3 ready</strong>
                    </div>
                    <div className={styles.integrationMetric}>
                      <span>Staging test accounts</span>
                      <strong>105143, 105538</strong>
                    </div>
                    <div className={styles.integrationMetric}>
                      <span>Date filters</span>
                      <strong>180 day max block</strong>
                    </div>
                  </div>

                  <div className={styles.integrationListBlock}>
                    <span className={styles.integrationListTitle}>Available proxy routes</span>
                    <ul className={styles.integrationList}>
                      <li>/api/integrations/desktop-broker/contractnotes</li>
                      <li>/api/integrations/desktop-broker/holdings</li>
                      <li>/api/integrations/desktop-broker/holdingtransactions</li>
                    </ul>
                  </div>

                  <div className={styles.integrationActions}>
                    <button type="button" className={styles.primaryButton} disabled={!desktopBrokerConfigured}>
                      {desktopBrokerConfigured ? "Integration Ready" : "Configure Desktop Broker"}
                    </button>
                    <button type="button" className={styles.secondaryButton}>
                      Client Mapping
                    </button>
                    <span className={styles.statusPillMuted}>
                      {desktopBrokerConfigured
                        ? "Credentials stay on the server. We can now use these routes in portfolio and transaction workflows."
                        : "Add Desktop Broker env vars to enable the staging proxy routes."}
                    </span>
                  </div>
                </div>
              </div>

              <div className={styles.integrationCard}>
                <div className={styles.integrationBrand}>
                  <Hub24Logo className={styles.integrationLogo} />
                </div>
                <div className={styles.integrationDetails}>
                  <div className={styles.integrationHeader}>
                    <div>
                      <h3 className={styles.cardTitle}>HUB24</h3>
                      <p className={styles.cardText}>
                        Platform integration placeholder for adviser portfolio data, investment workflows, and future automation across client records.
                      </p>
                    </div>
                    <span className={styles.statusPillMuted}>Coming soon</span>
                  </div>

                  <div className={styles.integrationGrid}>
                    <div className={styles.integrationMetric}>
                      <span>Integration type</span>
                      <strong>Investment platform</strong>
                    </div>
                    <div className={styles.integrationMetric}>
                      <span>Gateway</span>
                      <strong>To be configured</strong>
                    </div>
                    <div className={styles.integrationMetric}>
                      <span>Connection</span>
                      <strong>Not connected</strong>
                    </div>
                    <div className={styles.integrationMetric}>
                      <span>Platform account</span>
                      <strong>Not connected yet</strong>
                    </div>
                    <div className={styles.integrationMetric}>
                      <span>Account email</span>
                      <strong>Not available</strong>
                    </div>
                    <div className={styles.integrationMetric}>
                      <span>Integration status</span>
                      <strong>Placeholder only</strong>
                    </div>
                  </div>

                  <div className={styles.integrationActions}>
                    <button type="button" className={styles.primaryButton} disabled>
                      Connect HUB24
                    </button>
                    <span className={styles.statusPillMuted}>
                      Placeholder card only for now. Authentication and portfolio sync will be added in a later build.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className={styles.panelFooter}>
            <div className={styles.feedback}>
              {message ? <p className={styles.success}>{message}</p> : null}
            </div>
            {activeTab !== "security" && activeTab !== "integrations" ? (
              <button type="button" className={styles.primaryButton} onClick={handleSave} disabled={saveBusy}>
                {saveBusy ? "Saving..." : "Save changes"}
              </button>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
