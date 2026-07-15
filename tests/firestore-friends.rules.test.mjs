import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  setDoc,
} from "firebase/firestore";

const projectId = "step-outside-friends-rules-test";
let testEnv;

const user = (uid, email) => testEnv.authenticatedContext(uid, { email }).firestore();

async function createProfile(db, uid, username, email) {
  const now = Date.now();
  await assertSucceeds(setDoc(doc(db, "usernames", username), { uid, username, createdAt: now, updatedAt: now }));
  await assertSucceeds(setDoc(doc(db, "userDiscovery", uid), {
    uid,
    username,
    usernameLower: username,
    displayName: username,
    photoURL: "",
    createdAt: now,
    updatedAt: now,
  }));
  await assertSucceeds(setDoc(doc(db, "emailDirectory", email), {
    uid,
    emailLower: email,
    createdAt: now,
    updatedAt: now,
  }));
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

after(async () => {
  await testEnv.cleanup();
});

test("friendship lifecycle is UID-scoped, deterministic, and visible to both friends", async () => {
  const alice = user("alice", "alice@example.com");
  const bob = user("bob", "bob@example.com");
  const charlie = user("charlie", "charlie@example.com");
  await createProfile(alice, "alice", "alice.outside", "alice@example.com");
  await createProfile(bob, "bob", "bob.outside", "bob@example.com");
  await createProfile(charlie, "charlie", "charlie.outside", "charlie@example.com");

  const request = {
    id: "alice_bob",
    senderUid: "alice",
    recipientUid: "bob",
    status: "pending",
    createdAt: Date.now(),
  };
  await assertSucceeds(setDoc(doc(alice, "friendRequests", request.id), request));
  await assertFails(setDoc(doc(alice, "friendRequests", "duplicate-id"), { ...request, id: "duplicate-id" }));
  await assertFails(setDoc(doc(alice, "friendRequests", "alice_alice"), {
    ...request,
    id: "alice_alice",
    recipientUid: "alice",
  }));
  await assertFails(setDoc(doc(bob, "friendRequests", "bob_alice"), {
    ...request,
    id: "bob_alice",
    senderUid: "bob",
    recipientUid: "alice",
  }));

  await assertSucceeds(runTransaction(bob, async (transaction) => {
    const requestRef = doc(bob, "friendRequests", "alice_bob");
    const friendshipRef = doc(bob, "friendships", "alice_bob");
    const snapshot = await transaction.get(requestRef);
    assert.equal(snapshot.data()?.status, "pending");
    transaction.set(friendshipRef, { id: "alice_bob", users: ["alice", "bob"], createdAt: Date.now() });
    transaction.update(requestRef, { status: "accepted" });
  }));

  await assertSucceeds(getDoc(doc(alice, "friendships", "alice_bob")));
  await assertSucceeds(getDoc(doc(bob, "friendships", "alice_bob")));
  await assertFails(getDoc(doc(charlie, "friendships", "alice_bob")));
});

test("friend activity and challenges are restricted to friendship participants", async () => {
  const alice = user("alice", "alice@example.com");
  const bob = user("bob", "bob@example.com");
  const charlie = user("charlie", "charlie@example.com");
  const activity = {
    uid: "alice",
    username: "alice.outside",
    displayName: "Alice",
    photoURL: "",
    walkCount: 3,
    totalDistanceM: 5000,
    currentStreak: 2,
    updatedAt: Date.now(),
  };
  await assertSucceeds(setDoc(doc(alice, "friendActivity", "alice"), activity));
  await assertSucceeds(getDoc(doc(bob, "friendActivity", "alice")));
  await assertFails(getDoc(doc(charlie, "friendActivity", "alice")));

  const challenge = {
    senderUid: "alice",
    receiverUid: "bob",
    type: "walk_count",
    target: 3,
    startDate: Date.now(),
    endDate: Date.now() + 604800000,
    status: "pending",
    createdAt: Date.now(),
  };
  await assertSucceeds(setDoc(doc(alice, "friendChallenges", "challenge-alice-bob"), challenge));
  await assertFails(setDoc(doc(charlie, "friendChallenges", "challenge-charlie-bob"), {
    ...challenge,
    senderUid: "charlie",
  }));
  await assertFails(setDoc(doc(alice, "friendChallenges", "challenge-self"), {
    ...challenge,
    receiverUid: "alice",
  }));
});

test("exact email search works without allowing directory or discovery enumeration", async () => {
  const alice = user("alice", "alice@example.com");
  const emailEntry = await assertSucceeds(getDoc(doc(alice, "emailDirectory", "bob@example.com")));
  assert.equal(emailEntry.data()?.uid, "bob");
  await assertSucceeds(getDoc(doc(alice, "userDiscovery", "bob")));
  await assertFails(getDocs(collection(alice, "emailDirectory")));
  await assertFails(getDocs(collection(alice, "userDiscovery")));
});
