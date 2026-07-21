/** Small, platform-independent rules used by the durable completed-walk queue. */
export type SyncState = "pending" | "syncing" | "synced" | "failed";

export function stableWalkId(id: string | null | undefined, startedAt: number, endedAt: number): string {
  return id?.trim() || `${startedAt}-${endedAt}`;
}

export function upsertByWalkId<T extends { session: { id: string } }>(queue: T[], next: T): T[] {
  const index = queue.findIndex((item) => item.session.id === next.session.id);
  if (index < 0) return [...queue, next];
  return queue.map((item, itemIndex) => (itemIndex === index ? next : item));
}

export function retryAt(now: number, retryCount: number, baseDelayMs = 30_000): number {
  return now + Math.min(baseDelayMs * Math.max(1, retryCount), 15 * 60_000);
}

export function shouldAttemptSync(nextRetryAt: number | undefined, now: number): boolean {
  return !nextRetryAt || nextRetryAt <= now;
}

export async function timeoutAfter<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("walk-save-timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
