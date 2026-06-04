import { ApiError } from "@/lib/api/client";
import { getClientProfile } from "@/lib/api/clients";
import { readAuthTokenFromCookies } from "@/lib/auth";
import { OnboardingWorkflow } from "./onboarding-workflow";
import styles from "./page.module.css";

type ClientOnboardingProcessPageProps = {
  params: Promise<{ ClientProfileId: string }>;
};

async function loadProfile(clientProfileId: string) {
  const token = await readAuthTokenFromCookies();

  if (!token) {
    return {
      profile: null,
      message: "You must sign in to view your onboarding information.",
    };
  }

  try {
    const result = await getClientProfile(clientProfileId, token);

    return {
      profile: result.data,
      message: null,
    };
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Unable to load your profile (${error.statusCode}): ${error.message}`
        : error instanceof Error
          ? `Unable to load your profile: ${error.message}`
          : "Unable to load your profile right now.";

    return {
      profile: null,
      message,
    };
  }
}

export default async function ClientOnboardingProcessPage({ params }: ClientOnboardingProcessPageProps) {
  const { ClientProfileId } = await params;
  const { profile, message } = await loadProfile(ClientProfileId);

  if (!profile) {
    return (
      <main className={styles.page}>
        <section className={styles.panel}>
          <p className={styles.eyebrow}>Fact Find</p>
          <h1>Profile unavailable</h1>
          <p className={styles.notice}>{message}</p>
        </section>
      </main>
    );
  }

  return <OnboardingWorkflow profile={profile} />;
}
