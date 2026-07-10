import { useRouter } from "expo-router";
import React from "react";

import { OnboardingJournalPage } from "../../src/components/OnboardingJournalPage";
import { getPostWelcomeRoute } from "../../src/lib/authFlow";
import { completeOnboarding } from "../../src/lib/onboarding";

export default function Welcome1() {
  const router = useRouter();

  const skip = async () => {
    await completeOnboarding();
    const nextRoute = await getPostWelcomeRoute();
    router.replace(nextRoute as never);
  };

  return (
    <OnboardingJournalPage
      step={1}
      tone="dawn"
      eyebrow="Step Outside"
      title="The world moves fast."
      body={"The best version of you is usually waiting outside.\n\nStep Outside isn't another fitness app."}
      reflection="It's a daily reminder to slow down, breathe, and reconnect."
      primaryLabel="Begin the Journey"
      onPrimaryPress={() => router.push("/(onboarding)/welcome-2")}
      onSkipPress={skip}
    />
  );
}
