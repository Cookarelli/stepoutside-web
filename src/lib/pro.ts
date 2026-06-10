import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesOffering, type PurchasesPackage } from "react-native-purchases";

import { ENV } from "../../env";
import { auth, waitForAuthReady } from "./firebase";

export type ProPlan = "monthly" | "yearly";

export type ProState = {
  isPro: boolean;
  plan: ProPlan | null;
  productId: string | null;
  updatedAt: number | null;
};

export type ProPaywallPackage = {
  plan: ProPlan;
  title: string;
  periodLabel: string;
  priceLabel: string;
  detail: string;
  badge: string | null;
  productId: string;
  rcPackage: PurchasesPackage | null;
};

export type ProPaywallCatalog = {
  billingReady: boolean;
  source: "live" | "fallback" | "empty" | "error";
  offeringId: string | null;
  packages: ProPaywallPackage[];
  missingPlans: ProPlan[];
  errorMessage: string | null;
};

export type PremiumStatus = {
  isPremium: boolean;
  customerInfo: CustomerInfo | null;
  error: Error | null;
  source: "revenuecat" | "cached" | "override" | "unavailable";
  overrideReason: string | null;
};

export const PRO_PRODUCT_IDS = {
  monthly: "step_outside_pro_monthly",
  yearly: "stepoutside_pro_yearly",
} as const;

const PAYWALL_PLANS: ProPlan[] = ["yearly", "monthly"];

const KEY_PRO_STATE = "@stepoutside/proState";
const ENTITLEMENT_ID = "pro";
// If no entitlement identifier is configured in RevenueCat, fall back to "premium".
export const PREMIUM_ENTITLEMENT_ID = ENTITLEMENT_ID || "premium";

const DEFAULT_PRO_STATE: ProState = {
  isPro: false,
  plan: null,
  productId: null,
  updatedAt: null,
};

let rcConfigured = false;
let rcListenerAttached = false;
let rcConfigurePromise: Promise<boolean> | null = null;

function derivePlan(productId: string | null): ProPlan | null {
  if (!productId) return null;
  if (productId === PRO_PRODUCT_IDS.monthly) return "monthly";
  if (productId === PRO_PRODUCT_IDS.yearly) return "yearly";
  return null;
}

function getPremiumOverrideState(): { state: ProState; reason: string } | null {
  // Developer-only screenshot/testing helper. Leave the env vars unset in production
  // so real Premium access always comes from RevenueCat entitlements.
  if (!ENV.DEV.enablePremiumTestOverride) return null;

  const plan = ENV.DEV.premiumOverridePlan ?? ENV.DEV.premiumOverridePlanDefault;

  const currentUser = auth.currentUser;
  const email = currentUser?.email?.trim().toLowerCase() ?? null;
  const uid = currentUser?.uid?.trim().toLowerCase() ?? null;
  const allowlistedEmail = email ? ENV.DEV.premiumOverrideEmails.includes(email) : false;
  const allowlistedUid = uid ? ENV.DEV.premiumOverrideUids.includes(uid) : false;
  const allowAnonymous = !currentUser && ENV.DEV.premiumOverrideAllowAnonymous;

  if (!allowlistedEmail && !allowlistedUid && !allowAnonymous) return null;

  return {
    state: {
      isPro: true,
      plan,
      productId: PRO_PRODUCT_IDS[plan],
      updatedAt: Date.now(),
    },
    reason: allowlistedEmail
      ? `Premium screenshot override enabled for ${email}`
      : allowlistedUid
        ? "Premium screenshot override enabled for allowlisted account"
        : "Premium screenshot override enabled for anonymous local testing",
  };
}

function withPremiumOverride(state: ProState): ProState {
  const override = getPremiumOverrideState();
  return override?.state ?? state;
}

function mapCustomerInfoToPro(info: CustomerInfo): ProState {
  const entitlement = info.entitlements.active[PREMIUM_ENTITLEMENT_ID];
  const productId = entitlement?.productIdentifier ?? null;
  return {
    isPro: Boolean(entitlement),
    plan: derivePlan(productId),
    productId,
    updatedAt: Date.now(),
  };
}

async function persist(next: ProState): Promise<ProState> {
  await AsyncStorage.setItem(KEY_PRO_STATE, JSON.stringify(next));
  return next;
}

function normalizeError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback);
}

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

function canUseLocalProScaffold(): boolean {
  return __DEV__ || isExpoGo();
}

function getRevenueCatApiKey(): string | null {
  if (Platform.OS === "ios") return ENV.REVENUECAT.appleApiKey;
  if (Platform.OS === "android") return ENV.REVENUECAT.googleApiKey;
  return null;
}

function attachCustomerInfoListener() {
  if (rcListenerAttached) return;

  Purchases.addCustomerInfoUpdateListener((info) => {
    void persist(mapCustomerInfoToPro(info));
  });
  rcListenerAttached = true;
}

async function logRevenueCatIdentity(context: string): Promise<void> {
  if (!__DEV__) return;

  try {
    const appUserID = await Purchases.getAppUserID();
    console.info(`[RevenueCat] ${context}`, { appUserID });
  } catch (error) {
    console.warn(`[RevenueCat] ${context} identity unavailable`, error);
  }
}

async function logRevenueCatOfferings(offerings: Awaited<ReturnType<typeof Purchases.getOfferings>>): Promise<void> {
  if (!__DEV__) return;

  try {
    const appUserID = await Purchases.getAppUserID();
    const currentOffering = offerings.current;
    const packages = currentOffering?.availablePackages ?? [];
    const allOfferings = Object.values(offerings.all ?? {});
    const productIdentifiers = packages.map((pkg) => pkg.product.identifier);
    const missingProductIds = Object.values(PRO_PRODUCT_IDS).filter((productId) => !productIdentifiers.includes(productId));
    const allOfferingPackageMap = allOfferings.map((offering) => ({
      identifier: offering.identifier,
      packageIdentifiers: offering.availablePackages.map((pkg) => pkg.identifier),
      productIdentifiers: offering.availablePackages.map((pkg) => pkg.product.identifier),
    }));

    console.info("[RevenueCat] offerings", {
      appUserID,
      currentOfferingIdentifier: currentOffering?.identifier ?? null,
      packageIdentifiers: packages.map((pkg) => pkg.identifier),
      productIdentifiers,
      priceStrings: packages.map((pkg) => pkg.product.priceString),
      allOfferings: allOfferingPackageMap,
    });

    if (missingProductIds.length > 0) {
      console.warn("[RevenueCat] offering is missing expected products", {
        missingProductIdentifiers: missingProductIds,
      });
    }
  } catch (error) {
    console.warn("[RevenueCat] offerings log unavailable", error);
  }
}

function getPackageFromOfferingByPlan(offering: PurchasesOffering | null, plan: ProPlan): PurchasesPackage | null {
  if (!offering) return null;

  const direct =
    plan === "monthly"
      ? offering.monthly
      : offering.annual;

  if (direct) return direct;

  const productId = PRO_PRODUCT_IDS[plan];
  return (
    offering.availablePackages.find((pkg) => {
      const identifier = pkg.identifier.toLowerCase();
      const productIdentifier = pkg.product.identifier.toLowerCase();
      if (productIdentifier === productId) return true;
      if (identifier === productId) return true;
      if (plan === "monthly") return identifier.includes("month") || productIdentifier.includes("month");
      return identifier.includes("year") || identifier.includes("annual") || productIdentifier.includes("year");
    }) ?? null
  );
}

function getPackageForPlanAcrossOfferings(
  offerings: Awaited<ReturnType<typeof Purchases.getOfferings>>,
  plan: ProPlan
): { rcPackage: PurchasesPackage | null; offeringId: string | null; fromCurrentOffering: boolean } {
  const current = getPackageFromOfferingByPlan(offerings.current, plan);
  if (current) {
    return {
      rcPackage: current,
      offeringId: offerings.current?.identifier ?? null,
      fromCurrentOffering: true,
    };
  }

  for (const offering of Object.values(offerings.all ?? {})) {
    const match = getPackageFromOfferingByPlan(offering, plan);
    if (match) {
      if (__DEV__) {
        console.warn("[RevenueCat] package found outside current offering", {
          requestedPlan: plan,
          currentOfferingId: offerings.current?.identifier ?? null,
          fallbackOfferingId: offering.identifier,
          productIdentifier: match.product.identifier,
        });
      }
      return {
        rcPackage: match,
        offeringId: offering.identifier,
        fromCurrentOffering: false,
      };
    }
  }

  return {
    rcPackage: null,
    offeringId: null,
    fromCurrentOffering: false,
  };
}

export async function initRevenueCat(): Promise<boolean> {
  if (rcConfigured) return true;
  if (rcConfigurePromise) return await rcConfigurePromise;
  if (isExpoGo()) return false;

  rcConfigurePromise = (async () => {
    await waitForAuthReady().catch((error) => {
      if (__DEV__) {
        console.warn("[RevenueCat] continuing before Firebase Auth restore completed", error);
      }
    });

    const apiKey = getRevenueCatApiKey();
    if (!apiKey) return false;

    try {
      await Purchases.setLogLevel(LOG_LEVEL.INFO);
      Purchases.configure({ apiKey, appUserID: auth.currentUser?.uid ?? undefined });
      attachCustomerInfoListener();
      rcConfigured = true;
      await logRevenueCatIdentity("configured");
      return true;
    } catch {
      return false;
    } finally {
      if (!rcConfigured) {
        rcConfigurePromise = null;
      }
    }
  })();

  return await rcConfigurePromise;
}

export async function syncRevenueCatIdentity(appUserID: string | null): Promise<ProState> {
  try {
    const ready = await initRevenueCat();
    if (!ready) return await getProState();

    const currentAppUserID = await Purchases.getAppUserID().catch(() => null);
    if (appUserID && currentAppUserID === appUserID) {
      const info = await Purchases.getCustomerInfo();
      const next = mapCustomerInfoToPro(info);
      await persist(next);
      return withPremiumOverride(next);
    }

    const info = appUserID ? (await Purchases.logIn(appUserID)).customerInfo : await Purchases.logOut();

    const next = mapCustomerInfoToPro(info);
    await persist(next);
    return withPremiumOverride(next);
  } catch {
    return await getProState();
  }
}

export async function getProState(): Promise<ProState> {
  const raw = await AsyncStorage.getItem(KEY_PRO_STATE);
  if (!raw) return withPremiumOverride(DEFAULT_PRO_STATE);
  try {
    const parsed = JSON.parse(raw) as ProState;
    return withPremiumOverride({
      isPro: Boolean(parsed?.isPro),
      plan: parsed?.plan ?? null,
      productId: parsed?.productId ?? null,
      updatedAt: parsed?.updatedAt ?? null,
    });
  } catch {
    return withPremiumOverride(DEFAULT_PRO_STATE);
  }
}

export async function refreshProState(): Promise<ProState> {
  try {
    const ready = await initRevenueCat();
    if (!ready) return await getProState();

    const info = await Purchases.getCustomerInfo();
    const next = mapCustomerInfoToPro(info);
    await persist(next);
    return withPremiumOverride(next);
  } catch {
    return await getProState();
  }
}

export async function getPremiumStatus(): Promise<PremiumStatus> {
  const override = getPremiumOverrideState();

  try {
    const ready = await initRevenueCat();
    if (!ready) {
      const cached = await getProState();
      return {
        isPremium: override?.state.isPro ?? cached.isPro,
        customerInfo: null,
        error: null,
        source: override ? "override" : "cached",
        overrideReason: override?.reason ?? null,
      };
    }

    const customerInfo = await Purchases.getCustomerInfo();
    const next = mapCustomerInfoToPro(customerInfo);
    await persist(next);

    return {
      isPremium: override?.state.isPro ?? next.isPro,
      customerInfo,
      error: null,
      source: override ? "override" : "revenuecat",
      overrideReason: override?.reason ?? null,
    };
  } catch (error) {
    const cached = await getProState();
    return {
      isPremium: override?.state.isPro ?? cached.isPro,
      customerInfo: null,
      error: normalizeError(error, "We couldn't confirm Premium access right now."),
      source: override ? "override" : "cached",
      overrideReason: override?.reason ?? null,
    };
  }
}

export async function setProState(next: ProState): Promise<void> {
  await persist(next);
}

export async function setProFromPlan(plan: ProPlan): Promise<ProState> {
  const productId = PRO_PRODUCT_IDS[plan];

  const next: ProState = {
    isPro: true,
    plan,
    productId,
    updatedAt: Date.now(),
  };
  await persist(next);
  return withPremiumOverride(next);
}

function buildLivePaywallPackage(
  plan: ProPlan,
  rcPackage: PurchasesPackage
): ProPaywallPackage {
  const { product } = rcPackage;

  if (plan === "monthly") {
    return {
      plan,
      title: "Step Outside Premium",
      periodLabel: "Monthly subscription",
      priceLabel: product.priceString || "See App Store price",
      detail: "Billed monthly through Apple.",
      badge: null,
      productId: product.identifier,
      rcPackage,
    };
  }

  const monthlyEquivalent = product.pricePerMonthString;

  return {
    plan,
    title: "Step Outside Premium",
    periodLabel: "Annual subscription",
    priceLabel: product.priceString || "See App Store price",
    detail: monthlyEquivalent ? `${monthlyEquivalent}/month billed annually.` : "Billed annually through Apple.",
    badge: "Best Value",
    productId: product.identifier,
    rcPackage,
  };
}

export async function getPaywallCatalog(): Promise<ProPaywallCatalog> {
  const ready = await initRevenueCat();
  if (!ready) {
    return {
      billingReady: false,
      source: "error",
      offeringId: null,
      packages: [],
      missingPlans: [...PAYWALL_PLANS],
      errorMessage: "Purchases aren't available right now. Please try again later.",
    };
  }

  try {
    const offerings = await Purchases.getOfferings();
    await logRevenueCatOfferings(offerings);
    const offering = offerings.current;
    if (!offering) {
      return {
        billingReady: true,
        source: "empty",
        offeringId: null,
        packages: [],
        missingPlans: [...PAYWALL_PLANS],
        errorMessage: "Subscription plans aren't available right now. Please try again in a moment.",
      };
    }

    const packages = PAYWALL_PLANS.flatMap((plan) => {
      const match = getPackageForPlanAcrossOfferings(offerings, plan);
      if (!match.rcPackage) {
        if (__DEV__ && plan === "monthly") {
          console.warn("[RevenueCat] Monthly plan missing from all offerings. Check the RevenueCat dashboard offering/package mapping.");
        }
        return [];
      }

      return [buildLivePaywallPackage(plan, match.rcPackage)];
    });

    if (packages.length === 0) {
      return {
        billingReady: true,
        source: "empty",
        offeringId: offering.identifier,
        packages: [],
        missingPlans: [...PAYWALL_PLANS],
        errorMessage: "Subscription plans aren't available right now. Please try again in a moment.",
      };
    }

    const missingPlans = PAYWALL_PLANS.filter((plan) => !packages.some((pkg) => pkg.plan === plan));

    return {
      billingReady: true,
      source: "live",
      offeringId: offering.identifier,
      packages,
      missingPlans,
      errorMessage:
        missingPlans.length > 0 ? `Some plans are unavailable right now: ${missingPlans.join(", ")}.` : null,
    };
  } catch {
    return {
      billingReady: true,
      source: "error",
      offeringId: null,
      packages: [],
      missingPlans: [...PAYWALL_PLANS],
      errorMessage: "We couldn't load subscription plans right now. Please try again in a moment.",
    };
  }
}

export async function purchaseProPlan(plan: ProPlan, rcPackage?: PurchasesPackage | null): Promise<ProState> {
  const ready = await initRevenueCat();

  // Fallback scaffold path (Expo Go / missing key / not yet configured)
  if (!ready) {
    if (!canUseLocalProScaffold()) {
      throw new Error("Purchases are unavailable on this build. Check RevenueCat configuration first.");
    }
    return await setProFromPlan(plan);
  }

  if (rcPackage) {
    const result = await Purchases.purchasePackage(rcPackage);
    return await persist(mapCustomerInfoToPro(result.customerInfo));
  }

  const offerings = await Purchases.getOfferings();
  const livePackage = getPackageForPlanAcrossOfferings(offerings, plan).rcPackage;
  if (livePackage) {
    const result = await Purchases.purchasePackage(livePackage);
    return await persist(mapCustomerInfoToPro(result.customerInfo));
  }

  const productId = PRO_PRODUCT_IDS[plan];
  const result = await Purchases.purchaseProduct(productId);
  return await persist(mapCustomerInfoToPro(result.customerInfo));
}

export async function clearProState(): Promise<void> {
  await persist(DEFAULT_PRO_STATE);
}

export async function restorePurchasesScaffold(): Promise<ProState> {
  const ready = await initRevenueCat();
  if (!ready) {
    if (!canUseLocalProScaffold()) {
      throw new Error("Restore is unavailable on this build. Check RevenueCat configuration first.");
    }
    return await getProState();
  }

  await Purchases.restorePurchases();
  return await refreshProState();
}
