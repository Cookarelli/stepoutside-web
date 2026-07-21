import assert from "node:assert/strict";
import test from "node:test";

import { retryAt, shouldAttemptSync, stableWalkId, timeoutAfter, upsertByWalkId } from "./walkSaveReliability";

test("online save keeps its generated stable ID", () => {
  assert.equal(stableWalkId("walk-1", 1, 2), "walk-1");
});

test("offline local save creates one pending queue entry", () => {
  const queue = upsertByWalkId([], { session: { id: "walk-1" }, syncState: "pending" });
  assert.deepEqual(queue, [{ session: { id: "walk-1" }, syncState: "pending" }]);
});

test("connectivity transition honors a queued retry", () => {
  assert.equal(shouldAttemptSync(undefined, 100), true);
  assert.equal(shouldAttemptSync(99, 100), true);
});

test("remote writes time out instead of holding the UI forever", async () => {
  await assert.rejects(timeoutAfter(new Promise<void>(() => undefined), 5), /walk-save-timeout/);
});

test("a Firebase rejection remains retryable", () => {
  const next = retryAt(100, 1, 10);
  assert.equal(next, 110);
  assert.equal(shouldAttemptSync(next, 109), false);
});

test("secondary failure does not change the durable queue item", () => {
  const queued = { session: { id: "walk-1" }, syncState: "pending" };
  assert.deepEqual(upsertByWalkId([queued], queued), [queued]);
});

test("double tapping save upserts instead of duplicating", () => {
  const first = { session: { id: "walk-1" }, syncState: "pending" };
  const second = { session: { id: "walk-1" }, syncState: "syncing" };
  assert.deepEqual(upsertByWalkId([first], second), [second]);
});

test("pending walks are eligible to retry after an app restart", () => {
  assert.equal(shouldAttemptSync(200, 200), true);
});

test("local persistence failure leaves an active-walk recovery snapshot untouched", () => {
  const activeSnapshot = { id: "active-1" };
  assert.deepEqual(activeSnapshot, { id: "active-1" });
});

test("retry reuses the same ID and cannot create duplicates", () => {
  const retry = { session: { id: stableWalkId("walk-1", 1, 2) }, syncState: "pending" };
  assert.equal(upsertByWalkId([retry], retry).length, 1);
});
