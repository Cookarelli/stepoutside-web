# Step Outside iOS Production Build-Source Audit

Audit date: July 14, 2026 (America/Chicago)
Status: preflight complete; iOS builds 38 and 39 failed before submission; corrected replacement build 40 pending

## Executive conclusion

The July 10 artifact `1.0.0 (4)` was built from the wrong app for a Step Outside release. EAS records identify build `24336bd3-929f-4fdd-8394-ffa2c1730fd1` as a production build of `@cookarell/52-hike-challenge`, created from Git commit `24fc94db5aa8a58290513a742d9cf9242f97e4ae` (`Prepare iOS App Store submission`). Its local source is `client-production/52-hike-challenge-app`, whose configuration is exactly version `1.0.0`, build `4`, slug `52-hike-challenge`, EAS project `e42e36e7-8c0b-4e61-b663-d73ad4e8f696`, and bundle `com.cookarell.fiftytwohikechallenge`.

The intended app is the separate EAS project `@cookarell/step-outside-v2`, project ID `a406fe2d-b4e7-47cf-8ede-10db0667d753`, bundle `com.cookarell.stepoutside`, and App Store Connect app ID `6758236701`. Apple’s public lookup identifies that app ID as **Step Outside** and the same bundle. App ID `6790204736` returns no public App Store record. That supports the wrong-listing/wrong-product diagnosis but does not, by itself, reveal the internal TestFlight processing or invalid-link reason.

The buddy code did not disappear in a Step Outside commit. It was never present in the 52 Hike codebase that produced the July 10 binary. The correct Step Outside history added friend discovery, requests, and lists on June 15, and Step Outside Buddies V1 on June 17. Project Campfire retained and QA’d the buddy area (`53fd71b`, July 2). There is therefore no deletion commit to identify.

## Source identity printout

- Initial shell working directory: `/Users/stevencook/dev`
- Audited working directory: `/Users/stevencook/dev/client-production/step-outside-v2`
- Git repository root: `/Users/stevencook/dev/client-production/step-outside-v2`
- Branch: `step-outside-v3.0`
- Commit: `c32f6429b4bb606381acd06317471dd4db07199f`
- Remote fetch/push: `https://github.com/Cookarelli/stepoutside-web.git`
- EAS account/owner: `cookarell` (`cookarelli@gmail.com`)
- EAS build profile: `production`
- EAS profile resolution: store distribution, production environment, remote credentials, auto-increment enabled

### Last 10 commits

1. `c32f6429b4bb606381acd06317471dd4db07199f` — 2026-07-13 — Build Step Outside V3 home experience
2. `52f0aaa2c4e30c6b5e31470a39b94b99312c4ddd` — 2026-07-12 — Merge remote-tracking branch `origin/main` into `step-outside-v3.0`
3. `1ea873c88721650933f0d22eaa909e1323027095` — 2026-07-09 — Prepare Step Outside iOS release 2.2.1
4. `5cd870744def8234d56ae61f973e64e50a7f79ab` — 2026-07-03 — Redesign Step Outside homepage with premium outdoor brand style
5. `eb680ee68a6b37e64d864258729bc172a16ca545` — 2026-07-03 — Update Step Outside website positioning and feature sections
6. `84f506fa2f0e651d625a2feb9d97c245cdd1476a` — 2026-06-17 — Add friend challenge invitations
7. `5793d50a695f3b506bdf0c94f26911df56c1f0a8` — 2026-06-17 — Implement Step Outside Buddies V1
8. `16d3350c3930a0fe7d709222a018717e5bd5837b` — 2026-06-17 — Add premium leaderboard screen
9. `e62b9b48f9e02b1b75a6f27a74c6e991e2869468` — 2026-06-17 — Redesign Home screen
10. `2b83ae1b60f1070a4f8af1afc7cb1dfc730bc1d4` — 2026-06-17 — Fix RevenueCat product identifier mismatch

### Uncommitted audit changes

- `app.config.ts`
- `app/(tabs)/profile.tsx`
- `app/challenges.tsx`
- `app/friend-requests.tsx`
- `app/friends-search.tsx`
- `app/friends.tsx`
- `eas.json`
- `firestore.rules`
- `package.json`
- `package-lock.json`
- `src/lib/friendSystem.ts`
- `src/lib/firebase.ts`
- `.firebaserc` (new; pins the existing Firebase project)
- `google-services.json` (new; public Android Firebase client configuration)
- `scripts/verify-release.mjs` (new)
- `tests/firestore-friends.rules.test.mjs` (new)
- `types/firebase-auth-react-native.d.ts` (new)
- `docs/GOOGLE_PLAY_RELEASE_3.0.0.md` (new)
- `docs/PRODUCTION_BUILD_SOURCE_AUDIT_2026-07-14.md` (this report, new)

## Expo, EAS, and iOS configuration

| Field | Final audited value |
|---|---|
| App name | Step Outside |
| Expo owner | `cookarell` |
| Expo slug | `step-outside-v2` |
| Expo/EAS project ID | `a406fe2d-b4e7-47cf-8ede-10db0667d753` |
| iOS bundle ID | `com.cookarell.stepoutside` |
| App Store Connect app ID | `6758236701` |
| App version | `3.0.0` |
| EAS remote iOS counter before replacement build | `39` |
| Failed native build | `3.0.0 (38)` — EAS build `da02bf5a-e498-4994-8314-1a45bd7b9657` |
| Failed native build | `3.0.0 (39)` — EAS build `e91ef3fb-2168-4c53-ae91-b7202b2e1021` |
| Explicit replacement build number | `40` |
| Expected next EAS auto-incremented build | `40` |
| Production Firebase project | `stepoutside-32aae` |
| Production profile | `production` / store / production environment |

The first controlled native attempt consumed build 38 but failed during Xcode compilation because `react-native-maps` was emitted as a framework while React headers were non-modular. The static-library exception fixed that target; build 39 advanced to the React Native Firebase bridge and exposed the same Xcode 26 module-header issue in `RNFBApp`. Neither build was submitted to Apple. Expo's supported `forceStaticLinking` setting now covers `react-native-maps`, `RNFBApp`, and `RNFBAnalytics`, while the underlying Firebase iOS SDK retains the static-framework setup it requires. The remote counter is therefore 39 and the replacement is `3.0.0 (40)`. The local `buildNumber: "40"` is an explicit audit guard and resolved-config indicator.

Configuration-file inspection:

- `app.json`: absent in the intended repository
- `app.config.js`: absent
- `app.config.ts`: authoritative Expo config
- `eas.json`: remote version source; explicit production store/environment/auto-increment; submit app ID `6758236701`
- `package.json`: app/package version `3.0.0`
- `runtimeVersion`: absent
- `updates`: absent
- `expo-updates`: not installed; the app is not configured for EAS Update/OTA delivery

Production configuration corrections:

- Preserved the existing Step Outside Expo project and Apple bundle—no new Expo project, bundle, or App Store listing was created.
- Added explicit replacement local build `40` and release identity checks after failed native builds consumed counters 38 and 39.
- Forced `react-native-maps` and the RN Firebase bridge pods to remain static libraries under the Firebase SDK's static-framework configuration; local prebuild confirms the generated Podfile properties contain these settings.
- Made production store distribution and production environment explicit in `eas.json`.
- Restored platform-specific `GOOGLE_MAPS_IOS_API_KEY` / `GOOGLE_MAPS_ANDROID_API_KEY` handling, with the local public key as fallback.
- Added the previously missing public Google iOS and web OAuth client IDs to the existing EAS production environment.
- Confirmed `GoogleService-Info.plist` is for `com.cookarell.stepoutside` and Firebase project `stepoutside-32aae`.
- Registered the existing Android package `com.stevencook.stepoutside` in Firebase project `stepoutside-32aae` without modifying the unrelated `com.optimizelocal.stepoutside` app.
- Added the matching `google-services.json`; Expo resolves it only for Android and its client list contains the required Step Outside package.

## Repository classification

The intended working copy is a **Step Outside V3 code branch in the `step-outside-v2` repository/project**:

- folder/package/Expo slug: `step-outside-v2`
- branch: `step-outside-v3.0`
- current commit: V3 home experience

It is not either recovery worktree and is not the 52 Hike app. The separate Project Campfire work exists on local branch/worktree `step-outside-v3` at `22ea3fd`; that branch is not an ancestor of the currently audited `step-outside-v3.0` head. The current branch nevertheless contains the production friends implementation from main and now contains the restored first-class Outdoor Friends profile experience.

The July 10 build came from:

- Git root: `/Users/stevencook/dev/client-production`
- app directory: `/Users/stevencook/dev/client-production/52-hike-challenge-app`
- branch: `main`
- commit: `24fc94db5aa8a58290513a742d9cf9242f97e4ae`
- remote: `https://github.com/Cookarelli/client-production.git`

## Why `1.0.0 (4)` was generated

The 52 Hike app used `appVersionSource: "local"`, version `1.0.0`, and production `autoIncrement: true`. Its committed build number was `1`; EAS produced store build `3` on July 9 and store build `4` on July 10, and updated the local `app.json` build number to `4`. This exactly matches the reported submission. Step Outside’s own EAS history contains no `1.0.0 (4)` build.

## Buddy/friend audit

Existing functional surfaces found:

- `app/friends.tsx` — accepted friends, activity, removal, and challenge invitations
- `app/friends-search.tsx` — username/exact-email search and request sending
- `app/friend-requests.tsx` — incoming/outgoing requests and accept/decline
- `app/challenges.tsx` — incoming/sent friend challenges and responses
- `app/leaderboard.tsx` / `app/stats.tsx` — friends leaderboard views
- `src/lib/friendSystem.ts` — discovery, requests, friendships, friend activity
- `src/lib/friendChallenges.ts` — one-to-one challenges
- `firestore.rules` / `firestore.indexes.json` — authorization and required request/friendship indexes
- `app/(tabs)/index.tsx` — friends-active-today, recent friend updates, challenges, and an encouragement placeholder

Before this audit, the current profile did import no friend data. It rendered only basic Friends, Find Friends, Requests, Leaderboard, and Challenges navigation tiles. The routes were stable and registered in `app/_layout.tsx`. No social screen used a Premium gate; only the leaderboard originated in a premium-named historical commit, but its current route is not premium-restricted. There is no buddy feature flag. Basic friendship, search, requests, friend viewing, and challenges remain available to authenticated free users.

No implemented encouragement write/read collection was found; only the V3 home placeholder “No encouragement has been shared yet.” This audit did not invent an encouragement backend.

### Restored profile experience

The profile now has a prominent **Outdoor Friends** card with:

- total friends
- pending incoming friend requests
- active accepted challenges
- Add or Find Friends
- View All Friends
- recent friend activity summaries
- shared active-streak messaging when both users have streaks
- Active Buddy Challenges navigation
- Invite a Friend Outside using the native share sheet
- friends leaderboard access
- signed-out guidance and an attractive first-friend empty state
- visible error text when social data is unavailable

The section appears before the Premium card and contains no `isPremium` check.

## Firebase confirmation and changes

- All client list/read operations require an authenticated UID and query requests/friendships by that UID.
- Friendship documents contain both UIDs; participant-scoped reads make the accepted friendship visible to both users.
- Client transactions reject self-friending, an existing friendship, duplicate same-direction requests, and reverse pending requests.
- Rules now require deterministic request IDs (`senderUid_recipientUid`), closing the previous path that allowed duplicate requests under arbitrary document IDs.
- Rules enforce deterministic two-user friendship IDs and require an accepted request in the same atomic transaction.
- Friend activity is writable only by its UID and readable only by that user or an accepted friend.
- Friend challenges require an accepted friendship; self-challenges and non-friend challenges are denied.
- Missing-permission errors are converted to visible user-facing text and logged with a `[friend-system]` prefix across friends, search, requests, challenges, and Profile.
- Username lookup remains an exact public-directory document get.
- Email lookup now uses an exact-email document get in `emailDirectory`; directory and discovery collection enumeration are denied. Users can only create/update the directory document matching their authenticated token email.
- Native Firebase Auth now uses the React Native AsyncStorage persistence adapter, so a cold restart restores the authenticated Firebase session rather than relying only on the app's lightweight cached profile snapshot.

The revised local rules passed authenticated Firestore emulator integration tests for duplicate/self/reverse requests, atomic acceptance, two-sided friendship reads, third-party denial, activity access, friend-only challenges, exact-email lookup, and directory/discovery enumeration denial.

The authenticated rules suite passed again immediately before deployment. The reviewed `firestore.rules` and `firestore.indexes.json` were then deployed to `stepoutside-32aae` with `--only firestore:rules,firestore:indexes`; compilation, index deployment, and rules release succeeded. No other Firebase resource was deployed.

## Validation completed

| Check | Result |
|---|---|
| TypeScript (`npm run typecheck`) | Pass |
| Expo ESLint (`npm run app:lint`) | Pass |
| Website validation (`npm run lint`) | Pass, 13 HTML files |
| Expo Doctor (`npx expo-doctor`) | Pass, 18/18 |
| Navigation verification | Pass |
| Production identity/environment validation | Pass |
| Static buddy smoke test | Pass |
| Firestore rules compile in emulator | Pass |
| Authenticated Firestore friendship rules integration | Pass, 3/3 |
| Existing V3 unit tests (`npm test`) | Pass, 5/5 |
| Local iOS Metro/Hermes export | Pass, 1,509 modules |
| Local Android Metro/Hermes export | Pass, 1,507 modules |
| iOS prebuild / CocoaPods resolution after native fixes | Pass; maps and RNFB bridge pods explicitly excluded from `USE_FRAMEWORKS` |
| `git diff --check` | Pass |

No EAS build, EAS submission, Google Play mutation, or Apple mutation had been performed at this checkpoint. Remote prerequisite work was limited to adding the missing public Google OAuth client IDs to the existing Step Outside EAS production environment, registering the exact Android package in the existing Firebase project, and deploying the reviewed Firestore rules/indexes.

## Review gate and exact future commands

The Firebase deployment and preflight checks below were completed before the controlled test-release build:

```bash
npm run typecheck
npm run app:lint
npx expo-doctor
npm run verify:navigation
npm run validate:production
npm run test:buddy
npx firebase-tools@14.27.0 emulators:exec --only firestore --project stepoutside-32aae "npm run test:firestore-rules"
```

The authorized replacement TestFlight-only build command is:

```bash
eas build --platform ios --profile production
```

That replacement build should be Step Outside `3.0.0 (40)`. Record the returned Step Outside EAS build ID, verify its project, bundle, version, and build number, then submit that exact ID rather than `--latest`:

```bash
eas submit --platform ios --profile production --id <STEP_OUTSIDE_EAS_BUILD_ID>
```

Do not use Apple app ID `6790204736` for this workflow. The submit profile is pinned to Step Outside App Store Connect ID `6758236701`.
