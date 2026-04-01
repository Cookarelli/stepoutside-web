import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesOffering, type PurchasesPackage } from "react-native-purchases";

import { ENV } from "../../env";

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
  source: "live" | "fallback";
  offeringId: string | null;
  packages: ProPaywallPackage[];
};

export const PRO_PRODUCT_IDS = {
  monthly: "stepoutside_pro_monthly",
  yearly: "stepoutside_pro_yearly",
  lifetime: "stepoutside_pro_lifetime_launch",
} as const;

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

export async function initRevenueCat(): Promise<boolean> {
  if (rcConfigured) return true;
  if (isExpoGo()) return false;

  const apiKey = getRevenueCatApiKey();
  if (!apiKey) return false;

  Purchases.setLogLevel(LOG_LEVEL.INFO);
  Purchases.configure({ apiKey });
  attachCustomerInfoListener();
  rcConfigured = true;
  return true;
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
  const ready = await initRevenueCat();
  if (!ready) return await getProState();

  const info = await Purchases.getCustomerInfo();
  const next = mapCustomerInfoToPro(info);
  return await persist(next);
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

function fallbackPaywallPackages(): ProPaywallPackage[] {
  return [
    {
      plan: "yearly",
      title: "Yearly",
      priceLabel: "$33",
      detail: "$2.75/month billed yearly",
      badge: "Best value",
      productId: PRO_PRODUCT_IDS.yearly,
      rcPackage: null,
    },
    {
      plan: "monthly",
      title: "Monthly",
      priceLabel: "$5.00",
      detail: "flexible month-to-month",
      badge: null,
      productId: PRO_PRODUCT_IDS.monthly,
      rcPackage: null,
    },
    {
      plan: "lifetime",
      title: "Lifetime",
      priceLabel: "$76",
      detail: "one-time launch purchase",
      badge: "Launch",
      productId: PRO_PRODUCT_IDS.lifetime,
      rcPackage: null,
    },
  ];
}

function buildLivePaywallPackage(
  plan: ProPlan,
  rcPackage: PurchasesPackage,
  monthlyReferencePricePerMonth: number | null
): ProPaywallPackage {
  const { product } = rcPackage;

  if (plan === "monthly") {
    return {
      plan,
      title: "Monthly",
      priceLabel: product.priceString,
      detail: "flexible month-to-month",
      badge: null,
      productId: product.identifier,
      rcPackage,
    };
  }

  if (plan === "yearly") {
    const monthlyEquivalent = product.pricePerMonthString;
    const savingsPct =
      monthlyReferencePricePerMonth && product.pricePerMonth
        ? Math.max(0, Math.round((1 - product.pricePerMonth / monthlyReferencePricePerMonth) * 100))
        : 0;

    return {
      plan,
      title: "Yearly",
      priceLabel: product.priceString,
      detail: monthlyEquivalent ? `${monthlyEquivalent}/month billed yearly` : "save with annual billing",
      badge: savingsPct > 0 ? `Save ${savingsPct}%` : "Best value",
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
      billingReady: canUseLocalProScaffold(),
      source: "fallback",
      offeringId: null,
      packages: fallbackPaywallPackages(),
    };
  }

  try {
    const offerings = await Purchases.getOfferings();
    const offering = offerings.current;
    if (!offering) {
      return {
        billingReady: true,
        source: "fallback",
        offeringId: null,
        packages: fallbackPaywallPackages(),
      };
    }

    const monthlyReference = offering.monthly?.product.pricePerMonth ?? offering.monthly?.product.price ?? null;
    const orderedPlans: ProPlan[] = ["yearly", "monthly", "lifetime"];
    const packages = orderedPlans.map((plan) => {
      const rcPackage = getPackageForPlan(offering, plan);
      if (!rcPackage) {
        return fallbackPaywallPackages().find((pkg) => pkg.plan === plan)!;
      }

      return buildLivePaywallPackage(plan, rcPackage, monthlyReference);
    });

    return {
      billingReady: true,
      source: "live",
      offeringId: offering.identifier,
      packages,
    };
  } catch {
    return {
      billingReady: true,
      source: "fallback",
      offeringId: null,
      packages: fallbackPaywallPackages(),
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
