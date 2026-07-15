import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const mode = process.argv[2] ?? "all";
const read = (path) => readFileSync(resolve(root, path), "utf8");

function verifyNavigation() {
  const layout = read("app/_layout.tsx");
  const routes = ["friends", "friends-search", "friend-requests", "challenges"];
  for (const route of routes) {
    assert.ok(existsSync(resolve(root, `app/${route}.tsx`)), `Missing route file: app/${route}.tsx`);
    assert.match(layout, new RegExp(`Stack\\.Screen name=["']${route}["']`), `Route not registered: ${route}`);
  }

  const profile = read("app/(tabs)/profile.tsx");
  for (const route of routes) {
    assert.ok(profile.includes(`\"/${route}\"`), `Profile does not navigate to /${route}`);
  }
  console.log("Navigation verification passed: Outdoor Friends routes exist, are registered, and are linked from Profile.");
}

function verifyProduction() {
  const rawConfig = execFileSync("npx", ["expo", "config", "--json"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  const config = JSON.parse(rawConfig);
  const eas = JSON.parse(read("eas.json"));

  assert.equal(config.name, "Step Outside");
  assert.equal(config.slug, "step-outside-v2");
  assert.equal(config.owner, "cookarell");
  assert.equal(config.extra?.eas?.projectId, "a406fe2d-b4e7-47cf-8ede-10db0667d753");
  assert.equal(config.ios?.bundleIdentifier, "com.cookarell.stepoutside");
  assert.equal(config.ios?.buildNumber, "39");
  assert.equal(config.android?.package, "com.stevencook.stepoutside");
  assert.equal(config.android?.versionCode, 7);
  assert.equal(config.version, "3.0.0");
  const buildProperties = config.plugins?.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-build-properties"
  );
  assert.ok(Array.isArray(buildProperties), "expo-build-properties plugin missing");
  assert.ok(
    buildProperties[1]?.ios?.forceStaticLinking?.includes("react-native-maps"),
    "react-native-maps must be statically linked when RN Firebase enables useFrameworks"
  );
  assert.equal(eas.cli?.appVersionSource, "remote");
  assert.equal(eas.build?.production?.distribution, "store");
  assert.equal(eas.build?.production?.environment, "production");
  assert.equal(eas.build?.production?.autoIncrement, true);
  assert.equal(eas.build?.["android-test"]?.distribution, "internal");
  assert.equal(eas.build?.["android-test"]?.environment, "production");
  assert.equal(eas.build?.["android-test"]?.autoIncrement, true);
  assert.equal(eas.build?.["android-test"]?.android?.buildType, "apk");
  assert.equal(eas.submit?.production?.ios?.ascAppId, "6758236701");

  const googleServiceInfo = read("GoogleService-Info.plist");
  assert.ok(googleServiceInfo.includes("com.cookarell.stepoutside"), "GoogleService-Info.plist bundle ID mismatch");
  const googleServices = JSON.parse(read("google-services.json"));
  const androidFirebaseClients = googleServices.client?.map(
    (entry) => entry.client_info?.android_client_info?.package_name
  );
  assert.equal(googleServices.project_info?.project_id, "stepoutside-32aae");
  assert.ok(
    androidFirebaseClients?.includes("com.stevencook.stepoutside"),
    "google-services.json is missing the Step Outside Android package"
  );
  console.log("Production validation passed: Step Outside project, iOS/Android identifiers, version 3.0.0, iOS build 39, and Android test code 7.");
}

function verifyBuddySystem() {
  const profile = read("app/(tabs)/profile.tsx");
  const firebase = read("src/lib/firebase.ts");
  const friendSystem = read("src/lib/friendSystem.ts");
  const rules = read("firestore.rules");
  const socialStart = profile.indexOf("Outdoor Friends");
  const premiumStart = profile.indexOf("styles.premiumCard", socialStart);
  const socialBlock = profile.slice(socialStart, premiumStart);

  assert.ok(socialStart >= 0, "Profile is missing the Outdoor Friends section");
  for (const label of [
    "Add or Find Friends",
    "View All Friends",
    "Active Buddy Challenges",
    "Recent outdoor activity",
    "Invite a Friend Outside",
    "Shared momentum",
    "Find your first outdoor buddy",
  ]) {
    assert.ok(profile.includes(label), `Profile is missing: ${label}`);
  }
  assert.ok(!socialBlock.includes("isPremium"), "Outdoor Friends must not be premium-gated");

  assert.ok(firebase.includes("getReactNativePersistence"), "Firebase Auth persistence adapter missing");
  assert.ok(firebase.includes("persistence: getReactNativePersistence(AsyncStorage)"), "Firebase Auth is not persisted with AsyncStorage");

  assert.ok(friendSystem.includes("recipientUid === currentUid"), "Client self-friend guard missing");
  assert.ok(friendSystem.includes("Friend request already sent."), "Duplicate outgoing request guard missing");
  assert.ok(friendSystem.includes("This user already sent you a friend request."), "Reverse request guard missing");
  assert.ok(friendSystem.includes("transaction.set(friendshipRef, friendship)"), "Accepted friendship transaction missing");
  assert.ok(friendSystem.includes("emailDirectory"), "Exact-email directory lookup missing");
  assert.ok(friendSystem.includes("Firestore permission denied"), "Visible/logged permission error handling missing");

  assert.ok(rules.includes('request.resource.data.recipientUid != request.auth.uid'), "Rules self-friend guard missing");
  assert.ok(rules.includes('requestId == request.resource.data.senderUid + "_" + request.resource.data.recipientUid'), "Rules deterministic request ID guard missing");
  assert.ok(rules.includes("request.auth.uid in data.users"), "Friendship reads are not participant-scoped");
  assert.ok(rules.includes("allow list: if false;"), "Email directory/discovery list protection missing");
  assert.ok(rules.includes("hasAcceptedFriendRequestAfter"), "Friendship acceptance proof missing");

  console.log("Buddy smoke test passed: profile UX, free access, routes, client invariants, email lookup, and Firestore rule guards are present.");
}

if (mode === "navigation" || mode === "all") verifyNavigation();
if (mode === "production" || mode === "all") verifyProduction();
if (mode === "buddy" || mode === "all") verifyBuddySystem();
if (!["navigation", "production", "buddy", "all"].includes(mode)) {
  throw new Error(`Unknown verification mode: ${mode}`);
}
