import { useRouter } from "expo-router";
import React from "react";

import { OnboardingJournalPage } from "../../src/components/OnboardingJournalPage";

export default function Welcome3() {
  const router = useRouter();

  return (
    <OnboardingJournalPage
      step={3}
      tone="together"
      eyebrow="Together or quiet"
      title="Some journeys are better together."
      body={"Invite friends.\n\nWalk with family.\n\nBuild momentum with coworkers.\n\nOr simply enjoy the quiet."}
      reflection={"However you choose to move...\nyou're never walking alone."}
      primaryLabel="Let's Go"
      onBackPress={() => router.back()}
      onPrimaryPress={() => router.push("/(onboarding)/welcome-4" as never)}
    />
  );
}
