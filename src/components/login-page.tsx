"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import styles from "./login-page.module.css";

export function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [licenseeName, setLicenseeName] = useState("Default");
  const [practiceName, setPracticeName] = useState("Default");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const licenseeOptions = [
    "Default","Insight Investment Partners","Banyan Securities Pty Ltd","iComply2","Direct Advisers Pty Ltd","Flinders Financial Services","Illingworth David Financial Planning Pty Ltd","Edai","Globe FP","Contract Paraplanning Services","Aureus Financial","HP Advisory","SWM (Aust) Pty LTd","Carnbrea & Co. Limited","Dorset Wealth Management","AMP Financial Planning Pty Limited","Principle Financial Group Pty Ltd","Steadfast Life","Link Wealth Group","Altitude Wealth Management","The Complete Planner","Endure Wealth","Investors Direct Financial Planning","Vinarc","Alex Jamieson","Clear Sky Financial"
  ];

  const practiceOptions = [
    "Default","C A Hill Financial Services","Insight Investment Partners","Life Solutions","Lifestyle Connexion","MWS Wealth Professionals","Rubin Partners Financial Solutions","Banyan Securities Pty Ltd","Direct Advisers","iComply2","Adviser Central","Flinders Financial Services","Story Wealth Management Pty Ltd","Paragon Wealth Management","Mavuno Financial Planning","ID Accounting and Wealth Solutions","THL Finance Partners","One Wealth Advisory","Icomply Open group","IIP Asset Management","Amphora Private Wealth","Yarra Valley Financial","FutureFlow Financial Advice","Structured Financial Planning","Pivotal Private Wealth","Lots FP","2020 FP","SA State Wealth and Financial Services","Tenex Wealth","Sandringham Wealth","Luna Financial Services","Zenith Wealth","MK Financial Planning","CPS","Aureus Financial","Coral Horizon Wealth Management","HP Advisory","Keybiz Group","Life Financial Services","Prosperum Wealth","Brightday Melbourne","Brightday Brisbane","Brightday Advisers","Test Practice","Factor1 Consulting","Carnbrea & Co. Limited","Dorset Wealth Management","Wealth For Tradies","Sans Pareil Financial Services Pty Ltd","Invest Blue","Partners in Wealth","Figtree Financial","Plan Plus","Steadfast Life","Link Wealth Group","Spark Wealth Advisers","Altitude Wealth Management","The Complete Planner","Carey Financial"
  ];

  function switchMode(nextMode: "login" | "signup") {
    setMode(nextMode);
    setError(null);
    setSuccess(null);
    setNeedsTwoFactor(false);
    setTwoFactorCode("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      if (mode === "signup") {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
            fullName,
            licenseeName,
            practiceName,
          }),
        });

        const body = (await response.json().catch(() => null)) as { message?: string; data?: boolean } | null;

        if (!response.ok) {
          throw new Error(body?.message ?? "Sign up failed.");
        }

        setSuccess(body?.message ?? "Registration submitted. Please check your email to confirm your account.");
        switchMode("login");
        setPassword("");
        return;
      }

      if (needsTwoFactor) {
        const response = await fetch("/api/auth/verify-2fa", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, code: twoFactorCode }),
        });

        const body = (await response.json().catch(() => null)) as
          | { message?: string; data?: { jwtToken?: string | null } }
          | null;

        if (!response.ok) {
          throw new Error(body?.message ?? "Two-factor verification failed.");
        }

        router.push("/clients");
        return;
      }

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const body = (await response.json().catch(() => null)) as
        | { message?: string; data?: { requiresTwoFactorAuthentication?: boolean } }
        | null;

      if (!response.ok) {
        throw new Error(body?.message ?? "Login failed.");
      }

      if (body?.data?.requiresTwoFactorAuthentication) {
        setNeedsTwoFactor(true);
        setSuccess("Enter the verification code for this account.");
        return;
      }

      router.push("/clients");
    } catch (submissionError) {
      const message =
        submissionError instanceof Error ? submissionError.message : "Unable to sign in right now.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("Enter your email address first so we know where to send the reset link.");
      setSuccess(null);
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const query = new URLSearchParams({ email }).toString();
      const response = await fetch(`/api/auth/forgot-password?${query}`, {
        method: "GET",
      });

      const body = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(body?.message ?? "Password reset request failed.");
      }

      setSuccess(body?.message ?? "If the email exists, a password reset link has been sent.");
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Unable to start password reset.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.panel}>
        <div className={styles.logoWrap}>
          <Image
            src="/icon.png"
            alt="iC2 Clients logo"
            width={216}
            height={216}
            priority
          />
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          {mode === "signup" ? (
            <p className={styles.intro}>Create your account to get started with iC2 Clients.</p>
          ) : null}

          {mode === "signup" ? (
            <div className={styles.field}>
              <input
                className={styles.input}
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Full name"
                autoComplete="name"
                required
              />
            </div>
          ) : null}

          <div className={styles.field}>
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email address"
              autoComplete="email"
              required
            />
          </div>

          {!needsTwoFactor ? (
            <div className={styles.field}>
              <input
                className={styles.input}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                required
              />
            </div>
          ) : (
            <div className={styles.field}>
              <input
                className={styles.input}
                type="text"
                value={twoFactorCode}
                onChange={(event) => setTwoFactorCode(event.target.value)}
                placeholder="Verification code"
                autoComplete="one-time-code"
                required
              />
              <p className={styles.hint}>Two-factor verification is enabled for this account.</p>
            </div>
          )}

          {mode === "signup" ? (
            <>
              <div className={styles.field}>
                <select className={styles.input} value={licenseeName} onChange={(event) => setLicenseeName(event.target.value)} required>
                  {licenseeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <select className={styles.input} value={practiceName} onChange={(event) => setPracticeName(event.target.value)} required>
                  {practiceOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}

          {error ? <p className={`${styles.message} ${styles.error}`}>{error}</p> : null}
          {success ? <p className={`${styles.message} ${styles.success}`}>{success}</p> : null}

          <button className={styles.button} type="submit" disabled={busy}>
            {busy ? "Please wait..." : mode === "signup" ? "Sign up" : needsTwoFactor ? "Verify code" : "Log in"}
          </button>

          {!needsTwoFactor && mode === "login" ? (
            <>
              <div className={styles.divider}>or</div>
              <button className={styles.secondary} type="button" onClick={handleForgotPassword} disabled={busy}>
                Forgot password?
              </button>
            </>
          ) : null}

          {!needsTwoFactor ? (
            <button className={styles.linkButton} type="button" onClick={() => switchMode(mode === "signup" ? "login" : "signup")} disabled={busy}>
              {mode === "signup" ? "Already have an account? Log in" : "Need an account? Sign up"}
            </button>
          ) : null}
        </form>
      </div>
    </div>
  );
}
