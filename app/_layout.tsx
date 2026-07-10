import { useEffect } from "react";
import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { AppErrorBoundary } from "../src/components/AppErrorBoundary";
import { initializeAnalytics, logAppOpen, logScreenViewForPath } from "../src/lib/analytics";
import { initRevenueCat } from "../src/lib/pro";

export default function RootLayout() {
  const pathname = usePathname();

  useEffect(() => {
    void initRevenueCat();
    void initializeAnalytics();
    void logAppOpen();
  }, []);

  useEffect(() => {
    void logScreenViewForPath(pathname);
  }, [pathname]);

  return (
    <AppErrorBoundary>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="splash" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="profile-setup" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="start" />
        <Stack.Screen name="walk" />
        <Stack.Screen name="complete" />
        <Stack.Screen name="reflection" />
        <Stack.Screen name="share" />
        <Stack.Screen name="saved-route" />
        <Stack.Screen name="edit-profile" />
        <Stack.Screen name="friends" />
        <Stack.Screen name="friends-search" />
        <Stack.Screen name="friend-requests" />
        <Stack.Screen name="challenges" />
        <Stack.Screen name="leaderboard" />
        <Stack.Screen name="pro" />
      </Stack>
    </AppErrorBoundary>
  );
}
