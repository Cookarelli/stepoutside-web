import type { RoutePoint } from "./store";

export type SolarBonusType = "sunrise" | "sunset" | null;

export type SolarBonusResult = {
  isSunriseBonus: boolean;
  isSunsetBonus: boolean;
  bonusType: SolarBonusType;
  bonusLabel: string | null;
  bonusPoints: number | null;
};

type EvaluateSolarBonusInput = {
  startedAt: number;
  startPoint: RoutePoint | null;
  isPremium: boolean;
};

const BONUS_WINDOW_MS = 45 * 60 * 1000;

const EMPTY_RESULT: SolarBonusResult = {
  isSunriseBonus: false,
  isSunsetBonus: false,
  bonusType: null,
  bonusLabel: null,
  bonusPoints: null,
};

function createBonusResult(type: SolarBonusType, isPremium: boolean): SolarBonusResult {
  if (type === "sunrise") {
    return {
      isSunriseBonus: isPremium,
      isSunsetBonus: false,
      bonusType: "sunrise",
      bonusLabel: "Sunrise Bonus",
      bonusPoints: null,
    };
  }

  if (type === "sunset") {
    return {
      isSunriseBonus: false,
      isSunsetBonus: isPremium,
      bonusType: "sunset",
      bonusLabel: "Sunset Bonus",
      bonusPoints: null,
    };
  }

  return EMPTY_RESULT;
}

function matchesWindow(referenceIso: string | undefined, targetMs: number): boolean {
  if (!referenceIso) return false;
  const referenceMs = new Date(referenceIso).getTime();
  if (!Number.isFinite(referenceMs)) return false;
  return Math.abs(targetMs - referenceMs) <= BONUS_WINDOW_MS;
}

export async function evaluateSolarBonus({
  startedAt,
  startPoint,
  isPremium,
}: EvaluateSolarBonusInput): Promise<SolarBonusResult> {
  if (!Number.isFinite(startedAt) || !startPoint) return EMPTY_RESULT;

  try {
    const day = new Date(startedAt).toISOString().slice(0, 10);
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${startPoint.lat}&longitude=${startPoint.lng}&daily=sunrise,sunset&timezone=auto&start_date=${day}&end_date=${day}`
    );

    if (!response.ok) {
      if (__DEV__) {
        console.warn("[solarBonus] sunrise/sunset lookup failed", { status: response.status, day });
      }
      return EMPTY_RESULT;
    }

    const data = await response.json();
    const sunriseIso = data?.daily?.sunrise?.[0] as string | undefined;
    const sunsetIso = data?.daily?.sunset?.[0] as string | undefined;

    const bonusType = matchesWindow(sunriseIso, startedAt)
      ? "sunrise"
      : matchesWindow(sunsetIso, startedAt)
        ? "sunset"
        : null;

    if (__DEV__ && bonusType) {
      console.info("[solarBonus] matched bonus window", {
        bonusType,
        isPremium,
        day,
      });
    }

    return createBonusResult(bonusType, isPremium);
  } catch (error) {
    if (__DEV__) {
      console.warn("[solarBonus] lookup unavailable", {
        day: new Date(startedAt).toISOString().slice(0, 10),
        error: error instanceof Error ? error.message : "unknown",
      });
    }
    return EMPTY_RESULT;
  }
}
