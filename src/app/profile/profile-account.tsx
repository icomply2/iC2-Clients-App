"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DesktopBrokerLogo } from "@/components/desktop-broker-logo";
import { Hub24Logo } from "@/components/hub24-logo";
import { ProductRexLogo } from "@/components/product-rex-logo";
import { UserInitialsAvatar } from "@/components/user-initials-avatar";
import styles from "./page.module.css";

type AccountProfileProps = {
  name: string;
  email: string;
  role: string;
  status: string;
  appAccess: string;
  rexConnected: boolean;
  rexExpiresAt: string | null;
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
  name,
  email,
  role,
  status,
  appAccess,
  rexConnected,
  rexExpiresAt,
  integrationStatus,
  integrationMessage,
}: AccountProfileProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("account");
  const [fullName, setFullName] = useState(name);
  const [emailAddress, setEmailAddress] = useState(email);
  const [preferredPhone, setPreferredPhone] = useState("");
  const [jobTitle, setJobTitle] = useState(role);
  const [defaultLandingPage, setDefaultLandingPage] = useState("/clients");
  const [defaultPageSize, setDefaultPageSize] = useState("10");
  const [compactLists, setCompactLists] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [rexBusy, setRexBusy] = useState(false);
  const [rexMessage, setRexMessage] = useState<string | null>(null);
  const [rexUser, setRexUser] = useState<ProductRexUserSummary | null>(null);

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

  function handleSave() {
    setMessage("Profile editing is ready in the UI. We can connect the save action once the user update endpoint is available.");
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
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <button type="button" className={styles.gridButton} aria-label="App menu">
            {Array.from({ length: 9 }).map((_, index) => (
              <span key={index} className={styles.gridDot} />
            ))}
          </button>
          <Link href="/admin" className={styles.inviteButton}>
            + Invite New User
          </Link>
          <span className={styles.pageName}>My Account</span>
        </div>

        <div className={styles.topbarRight}>
          <Link href="/finley" className={styles.topLink}>
            <span className={styles.icon}>F</span>
            <span>Finley</span>
          </Link>
          <Link href="/profile" className={styles.topLink}>
            <UserInitialsAvatar className={styles.avatar} />
            <span>Me</span>
          </Link>
          <Link href="/" className={styles.topLink}>
            <span className={styles.icon}>→</span>
            <span>Sign Out</span>
          </Link>
        </div>
      </header>

      <main className={styles.content}>
        <div className={styles.profileHero}>
          <div>
            <h1 className={styles.title}>Manage your account</h1>
          </div>
        </div>

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
        </div>

        <section className={styles.panel}>
          {activeTab === "account" ? (
            <div className={styles.panelGrid}>
              <div className={styles.field}>
                <span>Full name</span>
                <input value={fullName} onChange={(event) => setFullName(event.target.value)} />
              </div>
              <div className={styles.field}>
                <span>Email</span>
                <input value={emailAddress} onChange={(event) => setEmailAddress(event.target.value)} />
              </div>
              <div className={styles.field}>
                <span>Preferred phone</span>
                <input value={preferredPhone} onChange={(event) => setPreferredPhone(event.target.value)} placeholder="Preferred phone" />
              </div>
              <div className={styles.field}>
                <span>Role</span>
                <input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} />
              </div>
              <div className={styles.field}>
                <span>Account status</span>
                <input value={status} readOnly />
              </div>
              <div className={styles.field}>
                <span>App access</span>
                <input value={appAccess} readOnly />
              </div>
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
                        Mortgage and lending integration placeholder for adviser workflows, scenario support, and future document automation.
                      </p>
                    </div>
                    <span className={styles.statusPillMuted}>Coming soon</span>
                  </div>

                  <div className={styles.integrationGrid}>
                    <div className={styles.integrationMetric}>
                      <span>Integration type</span>
                      <strong>Lending platform</strong>
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
                      <span>Desktop Broker account</span>
                      <strong>Not connected yet</strong>
                    </div>
                    <div className={styles.integrationMetric}>
                      <span>Broker email</span>
                      <strong>Not available</strong>
                    </div>
                    <div className={styles.integrationMetric}>
                      <span>Integration status</span>
                      <strong>Placeholder only</strong>
                    </div>
                  </div>

                  <div className={styles.integrationActions}>
                    <button type="button" className={styles.primaryButton} disabled>
                      Connect Desktop Broker
                    </button>
                    <span className={styles.statusPillMuted}>
                      Placeholder card only for now. Authentication and API wiring will be added in a later build.
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
              <button type="button" className={styles.primaryButton} onClick={handleSave}>
                Save changes
              </button>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
