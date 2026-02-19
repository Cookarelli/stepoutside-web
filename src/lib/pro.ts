import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import Purchases, { LOG_LEVEL, type CustomerInfo } from "react-native-purchases";

import { ENV } from "../../env";

export type ProPlan = "monthly" | "yearly" | "lifetime";

export type ProState = {
  isPro: boolean;
  plan: ProPlan | null;
  productId: string | null;
  updatedAt: number | null;
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

function getRevenueCatApiKey(): string | null {
  if (Platform.OS === "ios") return ENV.REVENUECAT.appleApiKey;
  if (Platform.OS === "android") return ENV.REVENUECAT.googleApiKey;
  return null;
}

export async function initRevenueCat(): Promise<boolean> {
  if (rcConfigured) return true;
  if (isExpoGo()) return false;

  const apiKey = getRevenueCatApiKey();
  if (!apiKey) return false;

  Purchases.setLogLevel(LOG_LEVEL.INFO);
  Purchases.configure({ apiKey });
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

export async function purchaseProPlan(plan: ProPlan): Promise<ProState> {
  const ready = await initRevenueCat();

  // Fallback scaffold path (Expo Go / missing key / not yet configured)
  if (!ready) {
    return await setProFromPlan(plan);
  }

  const productId = PRO_PRODUCT_IDS[plan];
  await Purchases.purchaseProduct(productId);
  return await refreshProState();
}

export async function clearProState(): Promise<void> {
  await persist(DEFAULT_PRO_STATE);
}

export async function restorePurchasesScaffold(): Promise<ProState> {
  const ready = await initRevenueCat();
  if (!ready) return await getProState();

  await Purchases.restorePurchases();
  return await refreshProState();
}
