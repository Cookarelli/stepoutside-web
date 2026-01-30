import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="start" />
      <Stack.Screen name="walk" />
      <Stack.Screen name="complete" />
      <Stack.Screen name="stats" />
      <Stack.Screen name="modal" options={{ presentation: "modal" }} />

      {/* Keep (tabs) routable but NOT the default flow */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}