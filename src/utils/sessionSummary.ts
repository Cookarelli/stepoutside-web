import type { OutsideSession } from "../lib/store";

type SessionFallback = {
  durationSec?: number;
  elapsedTimeSec?: number;
  movingTimeSec?: number;
  pausedTimeSec?: number;
  distanceM?: number;
  distanceMiles?: number;
};

export function formatDurationClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function formatDurationMinutesLabel(seconds: number): string {
  const minutes = Math.max(1, Math.round(Math.max(0, seconds) / 60));
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

export function formatDistanceMiles(distanceM: number, empty = "0.00 mi"): string {
  if (!Number.isFinite(distanceM) || distanceM <= 0) return empty;
  return `${(distanceM / 1609.344).toFixed(2)} mi`;
}

export function resolveSessionDistanceMeters(
  session?: Partial<OutsideSession> | null,
  fallback?: SessionFallback | null
): number {
  const directDistance =
    session?.distanceM ??
    fallback?.distanceM ??
    (typeof fallback?.distanceMiles === "number" ? fallback.distanceMiles * 1609.344 : undefined);
  return Number.isFinite(directDistance) ? Math.max(0, Number(directDistance)) : 0;
}

export function resolveSessionElapsedSeconds(
  session?: Partial<OutsideSession> | null,
  fallback?: SessionFallback | null
): number {
  const elapsed =
    session?.elapsedTimeSec ??
    session?.durationSec ??
    fallback?.elapsedTimeSec ??
    fallback?.durationSec;
  return Number.isFinite(elapsed) ? Math.max(0, Number(elapsed)) : 0;
}

export function resolveSessionMovingSeconds(
  session?: Partial<OutsideSession> | null,
  fallback?: SessionFallback | null
): number {
  const moving = session?.movingTimeSec ?? fallback?.movingTimeSec;
  return Number.isFinite(moving) ? Math.max(0, Number(moving)) : 0;
}

export function resolveSessionPausedSeconds(
  session?: Partial<OutsideSession> | null,
  fallback?: SessionFallback | null
): number {
  const paused = session?.pausedTimeSec ?? fallback?.pausedTimeSec;
  return Number.isFinite(paused) ? Math.max(0, Number(paused)) : 0;
}
