import { useRouter } from "expo-router";
import React from "react";

import { OnboardingJournalPage } from "../../src/components/OnboardingJournalPage";
import { getPostWelcomeRoute } from "../../src/lib/authFlow";
import { completeOnboarding } from "../../src/lib/onboarding";

export default function Welcome4() {
  const router = useRouter();

  const finish = async () => {
    await completeOnboarding();
    const nextRoute = await getPostWelcomeRoute();
    router.replace(nextRoute as never);
  };

  return (
    <OnboardingJournalPage
      step={4}
      tone="campfire"
      eyebrow="Start where you are"
      title="Every Step Matters."
      body={"This isn't about being perfect.\n\nIt's about showing up today.\n\nAnd tomorrow.\n\nOne walk.\n\nOne breath.\n\nOne step at a time."}
      reflection="The trail keeps going. Your fire is already lit."
      primaryLabel="Start My Journey"
      onBackPress={() => router.back()}
      onPrimaryPress={finish}
    />
  );
}
