import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
  type ProPaywallCatalog,
  type ProState,
} from "../src/lib/pro";

const BRAND = {
  forest: "#255E36",
  sunrise: "#F2B541",
  bone: "#F8F4EE",
  charcoal: "#0B0F0E",
  red: "#C83333",
  mist: "#E7EEE6",
  sand: "#EFE7DA",
} as const;

const PRIVACY_URL = "https://stepoutside.app/privacy-policy";
const TERMS_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
const MANAGE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";
const RENEWAL_DISCLOSURE =
  "Renews automatically unless canceled at least 24 hours before the end of the current period.";
const PRO_DESCRIPTION =
  "Unlock saved GPS route maps, advanced streaks, monthly progress insights, and sunrise and sunset bonus achievements.";

export default function ProScreen() {
  const router = useRouter();
  const [proState, setProStateLocal] = useState<ProState | null>(null);
  const [packages, setPackages] = useState<ProPaywallPackage[]>([]);
  const [billingReady, setBillingReady] = useState(false);
  const [catalogSource, setCatalogSource] = useState<ProPaywallCatalog["source"]>("fallback");
  const [offeringId, setOfferingId] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
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
      setCatalogError(catalog.errorMessage);
      setProStateLocal(state);
    } catch {
      const state = await getProState();
      setPackages([]);
      setBillingReady(false);
      setCatalogSource("error");
      setOfferingId(null);
      setCatalogError("We couldn't load subscription plans right now. Please try again in a moment.");
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
        next.isPro ? "Premium unlocked" : "Purchase complete",
        billingReady
          ? "Your Step Outside Premium status is now synced with RevenueCat."
          : "Preview mode used local Premium unlock. Test purchases in an iOS dev build or TestFlight."
      );
    } catch (error) {
      if (
        isRevenueCatError(error) &&
        (error.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR || error.userCancelled)
      ) {
        return;
      }

      if (isRevenueCatError(error) && error.code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) {
        Alert.alert("Purchase pending", "Apple is still processing this purchase. We’ll unlock Premium as soon as it clears.");
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
        next.isPro ? "Purchases restored" : "No Premium purchases found",
        billingReady
          ? next.isPro
            ? "Your previous Premium access is active again."
            : "This Apple account doesn’t currently have an active Step Outside Premium entitlement."
          : "Restore is live on native builds. In preview mode this screen only shows your saved local Premium state."
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
  const activePlanLabel =
    proState?.plan === "yearly"
      ? "Annual subscription"
      : proState?.plan === "monthly"
        ? "Monthly subscription"
        : proState?.plan ?? "plan";
  const statusNote = (() => {
    if (catalogSource === "live") {
      return "Plans and pricing are loaded live from the App Store through RevenueCat.";
    }

    if (catalogSource === "empty") {
      return "No active subscription plans are available right now.";
    }

    if (catalogSource === "error") {
      return "We couldn't load live subscription plans right now.";
    }

    if (billingReady) {
      return "Purchases are available, but pricing is still loading.";
    }

    return "Purchases are only active in a native dev build or TestFlight with RevenueCat configured.";
  })();

  const openExternal = async (url: string, label: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Link unavailable", `We couldn't open the ${label} right now.`);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>Step Outside Premium</Text>
            <Text style={styles.title}>Premium tools for a steadier outdoor rhythm.</Text>
            <Text style={styles.sub}>{PRO_DESCRIPTION}</Text>
            <Text style={styles.heroSupport}>
              Monthly and annual subscriptions are billed through Apple using live App Store pricing.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Current status</Text>
            <Text style={styles.cardBody}>{isPro ? `Premium active (${activePlanLabel})` : "Free plan"}</Text>
            <Text style={styles.cardCaption}>{statusNote}</Text>
            {__DEV__ && catalogSource === "live" && offeringId ? <Text style={styles.offeringNote}>Offering: {offeringId}</Text> : null}
          </View>

          {catalogError ? (
            <View style={styles.alertCard}>
              <Text style={styles.alertTitle}>Plans unavailable</Text>
              <Text style={styles.alertBody}>{catalogError}</Text>
              <Pressable style={styles.retryBtn} onPress={() => void load()} disabled={loading || busyAction !== null}>
                <Text style={styles.retryText}>{loading ? "Reloading…" : "Try again"}</Text>
              </Pressable>
            </View>
          ) : null}

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={BRAND.forest} />
              <Text style={styles.loadingText}>Loading plans…</Text>
            </View>
          ) : packages.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Plans not available right now</Text>
              <Text style={styles.emptyBody}>
                {billingReady
                  ? "RevenueCat returned no active packages for this paywall yet. Please try again in a moment."
                  : "Purchases are unavailable in this build right now."}
              </Text>
              <Pressable style={styles.retryBtn} onPress={() => void load()} disabled={busyAction !== null}>
                <Text style={styles.retryText}>Reload plans</Text>
              </Pressable>
            </View>
          ) : (
            packages.map((pkg) => {
              const featured = pkg.plan === "yearly";
              const active = proState?.productId === pkg.productId || proState?.plan === pkg.plan;
              return (
                <Pressable
                  key={pkg.plan}
                  style={[
                    featured ? styles.featuredPlan : styles.planCard,
                    active ? styles.activePlan : null,
                    busyAction !== null ? styles.planDisabled : null,
                  ]}
                  onPress={() => void activatePlan(pkg)}
                  disabled={busyAction !== null}
                >
                  <View style={styles.planTopRow}>
                    <View style={styles.planTitleWrap}>
                      <Text style={featured ? styles.featuredTitle : styles.planTitle}>{pkg.title}</Text>
                      <Text style={featured ? styles.featuredPeriod : styles.planPeriod}>{pkg.periodLabel}</Text>
                      {pkg.badge ? (
                        <View style={featured ? styles.featuredBadge : styles.planBadge}>
                          <Text style={featured ? styles.featuredBadgeText : styles.planBadgeText}>{pkg.badge}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={featured ? styles.featuredPrice : styles.planPrice}>{pkg.priceLabel}</Text>
                  </View>
                  <Text style={featured ? styles.featuredDetail : styles.planDetail}>{pkg.detail}</Text>
                  <Text style={featured ? styles.featuredFootnote : styles.planFootnote}>
                    {busyAction === pkg.plan ? "Starting purchase…" : active ? "Current plan" : "Tap to continue with Apple"}
                  </Text>
                </Pressable>
              );
            })
          )}

          <View style={styles.disclosureCard}>
            <Text style={styles.disclosureTitle}>Subscription details</Text>
            <Text style={styles.disclosureBody}>
              Step Outside Premium is available as a monthly subscription or annual subscription.
            </Text>
            <Text style={styles.disclosureBody}>{RENEWAL_DISCLOSURE}</Text>
            <Text style={styles.disclosureBody}>
              Manage or cancel anytime in your Apple ID subscription settings. Restore Purchases is available below.
            </Text>
          </View>

          <Pressable style={styles.restoreBtn} onPress={() => void restore()} disabled={busyAction !== null}>
            <Text style={styles.restoreText}>{busyAction === "restore" ? "Restoring…" : "Restore purchases"}</Text>
          </Pressable>

          <Pressable style={styles.manageBtn} onPress={() => void openExternal(MANAGE_SUBSCRIPTIONS_URL, "Manage Subscription")} disabled={busyAction !== null}>
            <Text style={styles.manageText}>Manage Subscription</Text>
          </Pressable>

          <View style={styles.linksRow}>
            <Pressable style={styles.policyBtn} onPress={() => void openExternal(PRIVACY_URL, "Privacy Policy")}>
              <Text style={styles.policyText}>Privacy Policy</Text>
            </Pressable>
            <Pressable style={styles.policyBtn} onPress={() => void openExternal(TERMS_URL, "Terms of Use")}>
              <Text style={styles.policyText}>Terms of Use</Text>
            </Pressable>
            {__DEV__ ? (
              <Pressable style={styles.policyBtn} onPress={() => void clear()} disabled={busyAction !== null}>
                <Text style={[styles.policyText, { color: BRAND.red }]}>
                  {busyAction === "clear" ? "Clearing…" : "Clear Pro (test)"}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable style={styles.done} onPress={() => router.back()}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BRAND.bone },
  content: { flexGrow: 1, paddingVertical: 10 },
  container: { flex: 1, backgroundColor: BRAND.bone, padding: 20 },
  hero: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: BRAND.mist,
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.1)",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: BRAND.forest,
  },
  title: { marginTop: 8, fontSize: 30, lineHeight: 34, fontWeight: "900", color: BRAND.charcoal },
  sub: { marginTop: 10, color: "rgba(11,15,14,0.72)", fontWeight: "700", lineHeight: 22 },
  heroSupport: { marginTop: 10, color: "rgba(11,15,14,0.56)", fontWeight: "700", lineHeight: 20, fontSize: 13 },
  card: {
    marginTop: 18,
    borderRadius: 16,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.12)",
  },
  cardTitle: { fontWeight: "900", color: BRAND.charcoal },
  cardBody: { marginTop: 4, fontWeight: "700", color: "rgba(11,15,14,0.72)" },
  cardCaption: { marginTop: 8, fontWeight: "700", fontSize: 12, lineHeight: 18, color: "rgba(11,15,14,0.58)" },
  offeringNote: { marginTop: 8, color: "rgba(11,15,14,0.42)", fontSize: 11, fontWeight: "700" },
  alertCard: {
    marginTop: 14,
    borderRadius: 16,
    padding: 14,
    backgroundColor: "rgba(200,51,51,0.06)",
    borderWidth: 1,
    borderColor: "rgba(200,51,51,0.18)",
  },
  alertTitle: { fontWeight: "900", color: BRAND.red },
  alertBody: { marginTop: 6, color: "rgba(11,15,14,0.72)", fontWeight: "700", lineHeight: 20 },
  retryBtn: {
    marginTop: 12,
    alignSelf: "flex-start",
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "rgba(37,94,54,0.12)",
  },
  retryText: { color: BRAND.forest, fontWeight: "900" },
  loadingWrap: {
    marginTop: 16,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: "center",
    backgroundColor: "rgba(11,15,14,0.04)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.08)",
  },
  loadingText: { marginTop: 8, color: "rgba(11,15,14,0.62)", fontWeight: "700" },
  emptyCard: {
    marginTop: 16,
    borderRadius: 18,
    padding: 18,
    backgroundColor: "rgba(11,15,14,0.04)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.08)",
  },
  emptyTitle: { color: BRAND.charcoal, fontWeight: "900", fontSize: 17 },
  emptyBody: { marginTop: 8, color: "rgba(11,15,14,0.64)", fontWeight: "700", lineHeight: 21 },
  featuredPlan: {
    marginTop: 16,
    backgroundColor: BRAND.forest,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 18,
    shadowColor: "#1F4A2C",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  planCard: {
    marginTop: 10,
    backgroundColor: BRAND.sand,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.08)",
  },
  planDisabled: { opacity: 0.75 },
  featuredTitle: { color: "white", fontWeight: "900", fontSize: 17, lineHeight: 22, flexShrink: 1 },
  planTitle: { color: BRAND.charcoal, fontWeight: "900", fontSize: 17, lineHeight: 22, flexShrink: 1 },
  featuredPeriod: { color: "rgba(255,255,255,0.84)", fontWeight: "800", fontSize: 13 },
  planPeriod: { color: "rgba(11,15,14,0.72)", fontWeight: "800", fontSize: 13 },
  featuredPrice: { color: "white", fontWeight: "900", fontSize: 18, marginLeft: 12 },
  planPrice: { color: BRAND.charcoal, fontWeight: "900", fontSize: 18, marginLeft: 12 },
  featuredDetail: { marginTop: 10, color: "rgba(255,255,255,0.84)", fontWeight: "700" },
  planDetail: { marginTop: 10, color: "rgba(11,15,14,0.66)", fontWeight: "700" },
  featuredFootnote: { marginTop: 10, color: "rgba(255,255,255,0.72)", fontWeight: "800", fontSize: 12 },
  planFootnote: { marginTop: 10, color: "rgba(11,15,14,0.54)", fontWeight: "800", fontSize: 12 },
  planTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  planTitleWrap: { flex: 1, gap: 8 },
  featuredBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 999,
  },
  planBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(37,94,54,0.12)",
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 999,
  },
  featuredBadgeText: { color: "white", fontWeight: "900", fontSize: 11, letterSpacing: 0.3 },
  planBadgeText: { color: BRAND.forest, fontWeight: "900", fontSize: 11, letterSpacing: 0.3 },
  activePlan: {
    borderWidth: 2,
    borderColor: "rgba(11,15,14,0.16)",
  },
  disclosureCard: {
    marginTop: 16,
    borderRadius: 16,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.12)",
    gap: 8,
  },
  disclosureTitle: { color: BRAND.charcoal, fontWeight: "900" },
  disclosureBody: { color: "rgba(11,15,14,0.7)", fontWeight: "700", lineHeight: 20 },
  restoreBtn: {
    marginTop: 18,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "rgba(37,94,54,0.1)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.14)",
    paddingVertical: 13,
  },
  restoreText: { fontWeight: "900", color: BRAND.forest },
  manageBtn: {
    marginTop: 10,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "rgba(11,15,14,0.05)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.09)",
    paddingVertical: 12,
  },
  manageText: { fontWeight: "900", color: BRAND.charcoal },
  linksRow: { marginTop: 14, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  policyBtn: {
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 2,
    justifyContent: "center",
  },
  policyText: { fontWeight: "800", color: BRAND.forest, textDecorationLine: "underline" },
  done: {
    marginTop: 20,
    alignSelf: "flex-start",
    backgroundColor: "rgba(11,15,14,0.08)",
    borderRadius: 12,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  doneText: { fontWeight: "900", color: "rgba(11,15,14,0.72)" },
});
