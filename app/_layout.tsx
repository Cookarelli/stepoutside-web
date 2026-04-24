import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { AppErrorBoundary } from "../src/components/AppErrorBoundary";

export default function RootLayout() {
  return (
    <AppErrorBoundary>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="splash" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="start" />
        <Stack.Screen name="walk" />
        <Stack.Screen name="complete" />
        <Stack.Screen name="reflection" />
        <Stack.Screen name="share" />
        <Stack.Screen name="saved-route" />
        <Stack.Screen name="pro" />
      </Stack>
    </AppErrorBoundary>
  );
}
