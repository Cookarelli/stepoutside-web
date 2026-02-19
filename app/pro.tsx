import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  clearProState,
  getProState,
  initRevenueCat,
  purchaseProPlan,
  restorePurchasesScaffold,
  type ProPlan,
  type ProState,
} from "../src/lib/pro";

const BRAND = {
  forest: "#255E36",
  sunrise: "#F2B541",
  bone: "#F8F4EE",
  charcoal: "#0B0F0E",
  red: "#C83333",
} as const;

export default function ProScreen() {
  const router = useRouter();
  const [proState, setProStateLocal] = useState<ProState | null>(null);

  const load = async () => {
    const s = await getProState();
    setProStateLocal(s);
  };

  useEffect(() => {
    void (async () => {
      await initRevenueCat();
      await load();
    })();
  }, []);

  const activatePlan = async (plan: ProPlan) => {
    await purchaseProPlan(plan);
    await load();
    Alert.alert("Purchase flow complete", "If billing is configured, this was a real purchase. Otherwise scaffold mode was used.");
  };

  const restore = async () => {
    await restorePurchasesScaffold();
    await load();
    Alert.alert("Restore complete", "If you had Pro entitlements, they would appear here once billing is wired.");
  };

  const clear = async () => {
    await clearProState();
    await load();
  };

  const isPro = proState?.isPro ?? false;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>StepOutside Pro</Text>
        <Text style={styles.sub}>7-day trial + premium insights, planning, and streak protection.</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Current status</Text>
          <Text style={styles.cardBody}>{isPro ? `Pro active (${proState?.plan ?? "plan"})` : "Free plan"}</Text>
        </View>

        <Pressable style={styles.primary} onPress={() => void activatePlan("yearly")}>
          <Text style={styles.primaryText}>Start Yearly — $49.99</Text>
        </Pressable>

        <Pressable style={styles.primaryAlt} onPress={() => void activatePlan("monthly")}>
          <Text style={styles.primaryAltText}>Start Monthly — $4.99</Text>
        </Pressable>

        <Pressable style={styles.secondary} onPress={() => void activatePlan("lifetime")}>
          <Text style={styles.secondaryText}>Lifetime Launch — $89</Text>
        </Pressable>

        <View style={styles.row}>
          <Pressable style={styles.linkBtn} onPress={() => void restore()}>
            <Text style={styles.linkText}>Restore purchases</Text>
          </Pressable>
          <Pressable style={styles.linkBtn} onPress={() => void clear()}>
            <Text style={[styles.linkText, { color: BRAND.red }]}>Clear Pro (test)</Text>
          </Pressable>
        </View>

        <Pressable style={styles.done} onPress={() => router.back()}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BRAND.bone },
  container: { flex: 1, backgroundColor: BRAND.bone, padding: 20 },
  title: { fontSize: 30, fontWeight: "900", color: BRAND.charcoal },
  sub: { marginTop: 8, color: "rgba(11,15,14,0.66)", fontWeight: "700" },
  card: {
    marginTop: 18,
    borderRadius: 16,
    padding: 14,
    backgroundColor: "rgba(11,15,14,0.06)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.12)",
  },
  cardTitle: { fontWeight: "900", color: BRAND.charcoal },
  cardBody: { marginTop: 4, fontWeight: "700", color: "rgba(11,15,14,0.72)" },
  primary: {
    marginTop: 16,
    backgroundColor: BRAND.forest,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  primaryText: { color: "white", fontWeight: "900" },
  primaryAlt: {
    marginTop: 10,
    backgroundColor: "rgba(37,94,54,0.14)",
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  primaryAltText: { color: BRAND.forest, fontWeight: "900" },
  secondary: {
    marginTop: 10,
    backgroundColor: BRAND.sunrise,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  secondaryText: { color: BRAND.charcoal, fontWeight: "900" },
  row: { marginTop: 16, flexDirection: "row", gap: 16 },
  linkBtn: { paddingVertical: 8, paddingHorizontal: 4 },
  linkText: { fontWeight: "900", color: BRAND.forest },
  done: {
    marginTop: 20,
    alignSelf: "flex-start",
    backgroundColor: "rgba(11,15,14,0.08)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  doneText: { fontWeight: "900", color: "rgba(11,15,14,0.72)" },
});
