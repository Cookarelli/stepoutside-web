import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PURCHASES_ERROR_CODE, type PurchasesError } from "react-native-purchases";

import {
  clearProState,
  getProState,
  getPaywallCatalog,
  purchaseProPlan,
  refreshProState,
  restorePurchasesScaffold,
  type ProPaywallPackage,
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
  const [packages, setPackages] = useState<ProPaywallPackage[]>([]);
  const [billingReady, setBillingReady] = useState(false);
  const [catalogSource, setCatalogSource] = useState<"live" | "fallback">("fallback");
  const [offeringId, setOfferingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const catalog = await getPaywallCatalog();
      const state = await refreshProState();

      setPackages(catalog.packages);
      setBillingReady(catalog.billingReady);
      setCatalogSource(catalog.source);
      setOfferingId(catalog.offeringId);
      setProStateLocal(state);
    } catch {
      const state = await getProState();
      setPackages([]);
      setBillingReady(false);
      setCatalogSource("fallback");
      setOfferingId(null);
      setProStateLocal(state);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const isRevenueCatError = (error: unknown): error is PurchasesError => {
    return typeof error === "object" && error !== null && "code" in error && "message" in error;
  };

  const activatePlan = async (pkg: ProPaywallPackage) => {
    setBusyAction(pkg.plan);
    try {
      const next = await purchaseProPlan(pkg.plan, pkg.rcPackage);
      setProStateLocal(next);
      Alert.alert(
        next.isPro ? "Pro unlocked" : "Purchase complete",
        billingReady
          ? "Your Step Outside Pro status is now synced with RevenueCat."
          : "Preview mode used local Pro unlock. Test purchases in an iOS dev build or TestFlight."
      );
    } catch (error) {
      if (
        isRevenueCatError(error) &&
        (error.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR || error.userCancelled)
      ) {
        return;
      }

      if (isRevenueCatError(error) && error.code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) {
        Alert.alert("Purchase pending", "Apple is still processing this purchase. We’ll unlock Pro as soon as it clears.");
        return;
      }

      Alert.alert("Purchase couldn’t start", isRevenueCatError(error) ? error.message : "Please try again in a moment.");
    } finally {
      setBusyAction(null);
    }
  };

  const restore = async () => {
    setBusyAction("restore");
    try {
      const next = await restorePurchasesScaffold();
      setProStateLocal(next);
      Alert.alert(
        next.isPro ? "Purchases restored" : "No Pro purchases found",
        billingReady
          ? next.isPro
            ? "Your previous Pro access is active again."
            : "This Apple account doesn’t currently have an active Step Outside Pro entitlement."
          : "Restore is live on native builds. In preview mode this screen only shows your saved local Pro state."
      );
    } catch (error) {
      Alert.alert("Restore failed", isRevenueCatError(error) ? error.message : "Please try again in a moment.");
    } finally {
      setBusyAction(null);
    }
  };

  const clear = async () => {
    setBusyAction("clear");
    await clearProState();
    setProStateLocal({
      isPro: false,
      plan: null,
      productId: null,
      updatedAt: Date.now(),
    });
    setBusyAction(null);
  };

  const isPro = proState?.isPro ?? false;
  const statusNote =
    catalogSource === "live" && offeringId
      ? `Live pricing loaded from RevenueCat offering "${offeringId}".`
      : billingReady
        ? "Purchases are available, but live pricing could not be loaded right now."
        : "Purchases are only active in a native dev build or TestFlight with RevenueCat configured.";

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Step Outside Pro</Text>
        <Text style={styles.sub}>Golden Hour insights, unlimited saved walks, and a steadier daily rhythm.</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Current status</Text>
          <Text style={styles.cardBody}>{isPro ? `Pro active (${proState?.plan ?? "plan"})` : "Free plan"}</Text>
          <Text style={styles.cardCaption}>{statusNote}</Text>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={BRAND.forest} />
            <Text style={styles.loadingText}>Loading plans…</Text>
          </View>
        ) : (
          packages.map((pkg, index) => {
            const featured = index === 0;
            const active = proState?.productId === pkg.productId || proState?.plan === pkg.plan;
            return (
              <Pressable
                key={pkg.plan}
                style={[
                  featured ? styles.primary : index === 1 ? styles.primaryAlt : styles.secondary,
                  active ? styles.activePlan : null,
                ]}
                onPress={() => void activatePlan(pkg)}
                disabled={busyAction !== null}
              >
                <View style={styles.planHeader}>
                  <Text style={featured ? styles.primaryText : index === 1 ? styles.primaryAltText : styles.secondaryText}>
                    {pkg.title} {pkg.badge ? `· ${pkg.badge}` : ""}
                  </Text>
                  <Text style={featured ? styles.primaryText : index === 1 ? styles.primaryAltText : styles.secondaryText}>
                    {pkg.priceLabel}
                  </Text>
                </View>
                <Text style={featured ? styles.primarySubtext : index === 1 ? styles.primaryAltSubtext : styles.secondarySubtext}>
                  {busyAction === pkg.plan ? "Working…" : active ? "Current plan" : pkg.detail}
                </Text>
              </Pressable>
            );
          })
        )}

        <View style={styles.row}>
          <Pressable style={styles.linkBtn} onPress={() => void restore()} disabled={busyAction !== null}>
            <Text style={styles.linkText}>{busyAction === "restore" ? "Restoring…" : "Restore purchases"}</Text>
          </Pressable>
          {__DEV__ ? (
            <Pressable style={styles.linkBtn} onPress={() => void clear()} disabled={busyAction !== null}>
              <Text style={[styles.linkText, { color: BRAND.red }]}>
                {busyAction === "clear" ? "Clearing…" : "Clear Pro (test)"}
              </Text>
            </Pressable>
          ) : null}
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
  cardCaption: { marginTop: 8, fontWeight: "700", fontSize: 12, lineHeight: 18, color: "rgba(11,15,14,0.58)" },
  loadingWrap: {
    marginTop: 16,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
    backgroundColor: "rgba(11,15,14,0.04)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.08)",
  },
  loadingText: { marginTop: 8, color: "rgba(11,15,14,0.62)", fontWeight: "700" },
  primary: {
    marginTop: 16,
    backgroundColor: BRAND.forest,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  primaryText: { color: "white", fontWeight: "900" },
  primarySubtext: { marginTop: 4, color: "rgba(255,255,255,0.8)", fontWeight: "700" },
  primaryAlt: {
    marginTop: 10,
    backgroundColor: "rgba(37,94,54,0.14)",
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  primaryAltText: { color: BRAND.forest, fontWeight: "900" },
  primaryAltSubtext: { marginTop: 4, color: "rgba(37,94,54,0.86)", fontWeight: "700" },
  secondary: {
    marginTop: 10,
    backgroundColor: BRAND.sunrise,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  secondaryText: { color: BRAND.charcoal, fontWeight: "900" },
  secondarySubtext: { marginTop: 4, color: "rgba(11,15,14,0.72)", fontWeight: "700" },
  activePlan: {
    borderWidth: 2,
    borderColor: "rgba(11,15,14,0.22)",
  },
  planHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
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
