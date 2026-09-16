import { Platform } from "react-native";
import Purchases, { LOG_LEVEL, type PurchasesOffering, type PurchasesPackage } from "react-native-purchases";

/**
 * RevenueCat wiring.
 *
 * Entitlement identifiers must match the ones configured in the RevenueCat dashboard. They are
 * named after what the merchant actually gets rather than a tier, so the paywall copy and the
 * gate read the same way.
 */
export const ENTITLEMENTS = {
  /** Publishing a site and keeping it hosted — the ₹499/month website plan. */
  website: "website",
  /** Rendering reels and running consented call batches — included in reels and both plans. */
  reels: "reels",
} as const;

export type EntitlementId = (typeof ENTITLEMENTS)[keyof typeof ENTITLEMENTS];

/**
 * Keys come from the environment, never the repository. Expo inlines `EXPO_PUBLIC_*` at build
 * time. These are RevenueCat *public* SDK keys, which are safe on a device — the secret key is
 * server-side only and must never appear in this app.
 */
const API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  default: undefined,
});

let configured = false;

/**
 * Returns false when purchases are unavailable rather than throwing: the native module is absent
 * in Expo Go, and no key is set until the RevenueCat project exists. Callers treat false as
 * "billing is off" and leave paid actions visible but locked, so the rest of the app still works.
 */
export async function configurePurchases(appUserId?: string): Promise<boolean> {
  if (configured) return true;
  if (!API_KEY) return false;
  try {
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
    await Purchases.configure({ apiKey: API_KEY, appUserID: appUserId });
    configured = true;
    return true;
  } catch {
    return false;
  }
}

/** The entitlements this merchant currently holds. Empty when billing is unavailable. */
export async function activeEntitlements(): Promise<Set<string>> {
  if (!configured) return new Set();
  try {
    const info = await Purchases.getCustomerInfo();
    return new Set(Object.keys(info.entitlements.active));
  } catch {
    return new Set();
  }
}

/** The current offering, or null when none is configured or billing is unavailable. */
export async function currentOffering(): Promise<PurchasesOffering | null> {
  if (!configured) return null;
  try {
    return (await Purchases.getOfferings()).current ?? null;
  } catch {
    return null;
  }
}

export type PurchaseResult =
  | { status: "purchased"; entitlements: Set<string> }
  | { status: "cancelled" }
  | { status: "failed"; message: string };

export async function purchase(pack: PurchasesPackage): Promise<PurchaseResult> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pack);
    return { status: "purchased", entitlements: new Set(Object.keys(customerInfo.entitlements.active)) };
  } catch (caught) {
    const error = caught as { userCancelled?: boolean; message?: string };
    if (error.userCancelled) return { status: "cancelled" };
    return { status: "failed", message: error.message ?? "That purchase did not go through." };
  }
}

/** Restores a previous purchase on a new device. Required by the App Store review guidelines. */
export async function restore(): Promise<Set<string>> {
  if (!configured) return new Set();
  try {
    const info = await Purchases.restorePurchases();
    return new Set(Object.keys(info.entitlements.active));
  } catch {
    return new Set();
  }
}
