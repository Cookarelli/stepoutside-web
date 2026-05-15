import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesOffering, type PurchasesPackage } from "react-native-purchases";

import { ENV } from "../../env";
import { auth } from "./firebase";

export type ProPlan = "monthly" | "yearly" | "lifetime";

export type ProState = {
  isPro: boolean;
  plan: ProPlan | null;
  productId: string | null;
  updatedAt: number | null;
};

export type ProPaywallPackage = {
  plan: ProPlan;
  title: string;
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
  errorMessage: string | null;
};

export const PRO_PRODUCT_IDS = {
  monthly: "stepoutside_pro_monthly",
  yearly: "stepoutside_pro_yearly",
  lifetime: "stepoutside_pro_lifetime_launch",
} as const;

const PAYWALL_PLANS: ProPlan[] = ["yearly", "monthly"];

const KEY_PRO_STATE = "@stepoutside/proState";
const ENTITLEMENT_ID = "pro";

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
  if (productId === PRO_PRODUCT_IDS.lifetime) return "lifetime";
  return null;
}

function mapCustomerInfoToPro(info: CustomerInfo): ProState {
  const entitlement = info.entitlements.active[ENTITLEMENT_ID];
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
    const productIdentifiers = packages.map((pkg) => pkg.product.identifier);
    const missingProductIds = Object.values(PRO_PRODUCT_IDS).filter((productId) => !productIdentifiers.includes(productId));

    console.info("[RevenueCat] offerings", {
      appUserID,
      currentOfferingIdentifier: currentOffering?.identifier ?? null,
      packageIdentifiers: packages.map((pkg) => pkg.identifier),
      productIdentifiers,
      priceStrings: packages.map((pkg) => pkg.product.priceString),
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

export async function initRevenueCat(): Promise<boolean> {
  if (rcConfigured) return true;
  if (rcConfigurePromise) return await rcConfigurePromise;
  if (isExpoGo()) return false;

  rcConfigurePromise = (async () => {
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

    const info = appUserID
      ? (await Purchases.logIn(appUserID)).customerInfo
      : await Purchases.logOut();

    return await persist(mapCustomerInfoToPro(info));
  } catch {
    return await getProState();
  }
}

export async function getProState(): Promise<ProState> {
  const raw = await AsyncStorage.getItem(KEY_PRO_STATE);
  if (!raw) return DEFAULT_PRO_STATE;
  try {
    const parsed = JSON.parse(raw) as ProState;
    return {
      isPro: Boolean(parsed?.isPro),
      plan: parsed?.plan ?? null,
      productId: parsed?.productId ?? null,
      updatedAt: parsed?.updatedAt ?? null,
    };
  } catch {
    return DEFAULT_PRO_STATE;
  }
}

export async function refreshProState(): Promise<ProState> {
  try {
    const ready = await initRevenueCat();
    if (!ready) return await getProState();

    const info = await Purchases.getCustomerInfo();
    const next = mapCustomerInfoToPro(info);
    return await persist(next);
  } catch {
    return await getProState();
  }
}

export async function setProState(next: ProState): Promise<void> {
  await persist(next);
}

export async function setProFromPlan(plan: ProPlan): Promise<ProState> {
  const productId =
    plan === "monthly"
      ? PRO_PRODUCT_IDS.monthly
      : plan === "yearly"
        ? PRO_PRODUCT_IDS.yearly
        : PRO_PRODUCT_IDS.lifetime;

  const next: ProState = {
    isPro: true,
    plan,
    productId,
    updatedAt: Date.now(),
  };
  return await persist(next);
}

function getPackageForPlan(offering: PurchasesOffering | null, plan: ProPlan): PurchasesPackage | null {
  if (!offering) return null;

  const direct =
    plan === "monthly"
      ? offering.monthly
      : plan === "yearly"
        ? offering.annual
        : offering.lifetime;

  if (direct) return direct;

  const productId = PRO_PRODUCT_IDS[plan];
  return (
    offering.availablePackages.find((pkg) => pkg.product.identifier === productId || pkg.identifier === productId) ?? null
  );
}

function buildLivePaywallPackage(
  plan: ProPlan,
  rcPackage: PurchasesPackage
): ProPaywallPackage {
  const { product } = rcPackage;

  if (plan === "monthly") {
    return {
      plan,
      title: "Step Outside Pro Monthly",
      priceLabel: product.priceString,
      detail: "Billed monthly",
      badge: null,
      productId: product.identifier,
      rcPackage,
    };
  }

  if (plan === "yearly") {
    const monthlyEquivalent = product.pricePerMonthString;

    return {
      plan,
      title: "Step Outside Pro Annual",
      priceLabel: product.priceString,
      detail: monthlyEquivalent ? `${monthlyEquivalent}/month billed annually` : "Billed annually",
      badge: "Best Value",
      productId: product.identifier,
      rcPackage,
    };
  }

  return {
    plan,
    title: "Lifetime",
    priceLabel: product.priceString,
    detail: "one-time purchase",
    badge: "Launch",
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
      errorMessage: "Purchases are not available in this build yet. Verify the RevenueCat API key and native purchase setup.",
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
        errorMessage: "No active RevenueCat offering is available for this build yet.",
      };
    }

    const packages = PAYWALL_PLANS.flatMap((plan) => {
      const rcPackage = getPackageForPlan(offering, plan);
      if (!rcPackage) {
        return [];
      }

      return [buildLivePaywallPackage(plan, rcPackage)];
    });

    if (packages.length === 0) {
      return {
        billingReady: true,
        source: "empty",
        offeringId: offering.identifier,
        packages: [],
        errorMessage: `RevenueCat offering "${offering.identifier}" is active, but it does not contain any purchasable packages for this app.`,
      };
    }

    const missingPlans = PAYWALL_PLANS.filter((plan) => !packages.some((pkg) => pkg.plan === plan));

    return {
      billingReady: true,
      source: "live",
      offeringId: offering.identifier,
      packages,
      errorMessage:
        missingPlans.length > 0 ? `Some plans are unavailable right now: ${missingPlans.join(", ")}.` : null,
    };
  } catch {
    return {
      billingReady: true,
      source: "error",
      offeringId: null,
      packages: [],
      errorMessage: "We couldn't load live subscription plans from RevenueCat. Please try again in a moment.",
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
  const livePackage = getPackageForPlan(offerings.current, plan);
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
