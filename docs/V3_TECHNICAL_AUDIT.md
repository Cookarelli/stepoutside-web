# Step Outside V3.0 Product and Technical Audit

Audit date: 2026-07-12  
Branch: `step-outside-v3.0`  
Starting production commit: `1ea873c88721650933f0d22eaa909e1323027095`  
Audited application version: `3.0.0` on the V3 branch (`2.2.1` on the starting production commit)

## Audit method and priority definitions

This audit is based on the checked-in application code, Expo configuration, Firebase client code, Firestore rules and indexes, RevenueCat integration, local persistence code, and generated platform configuration available in the working copy. It does not assume that a Firebase index, Storage rule, entitlement, product, or environment value exists merely because the client expects one. Where deployed state cannot be proven from the repository, the audit says so explicitly.

Every recommended change is assigned one priority:

- **P0 — Required for app stability:** protect current users, data, access, privacy, purchase state, or core activity correctness before expanding the product.
- **P1 — Required for V3 launch:** required for the community, group, team, challenge, and leaderboard direction to launch safely.
- **P2 — Important after launch:** valuable hardening, scale, maintainability, or experience work that can follow a safe V3 launch.
- **P3 — Future enhancement:** longer-term platform expansion that should not delay the initial V3 launch.

## 1. Current architecture

### Runtime and application shape

Step Outside is an Expo SDK 54 / React Native 0.81.5 application using React 19.1, TypeScript strict mode, the React Native new architecture, Hermes, and Expo Router 6. The checked-in `ios/` and `android/` directories are ignored and not tracked, so `app.config.ts` and EAS configuration are the source-controlled native configuration inputs.

The primary layers are:

1. **Route layer:** file-based screens in `app/`, with a root `Stack`, onboarding stack, and bottom tabs.
2. **Screen-local state:** most screens contain their own loading, error, and mutation state. Several screens are over 1,000 lines and combine UI, orchestration, formatting, and network work.
3. **Shared UI:** reusable outdoor-themed primitives and illustrations in `src/components/`.
4. **Domain/client services:** authentication, activity storage, profiles, friends, challenges, leaderboards, notifications, analytics, RevenueCat, reflections, routes, and solar bonuses in `src/lib/`.
5. **Local persistence:** AsyncStorage, partly user-scoped and partly device-global.
6. **Cloud persistence:** Firebase Auth, Firestore, Firebase Storage, and native Firebase Analytics.
7. **Purchases:** RevenueCat through `react-native-purchases` 9.10.1.
8. **External services:** Open-Meteo for sun/weather data, Zippopotam for ZIP centroids, Overpass/OpenStreetMap for gym discovery, Apple Maps URLs for external navigation, Google Maps keys for native map rendering, and Google OAuth.

There is no checked-in Cloud Functions/backend service, no server-authoritative challenge engine, no RevenueCat webhook consumer, no push notification service, no Firebase App Check initialization, no crash-reporting SDK, and no remote feature-flag system.

### Startup and navigation gate

`/` redirects to `/splash`. The splash screen waits 2.5 seconds, refreshes local notifications, then calls the authentication entry resolver. The resolver requires:

1. A Firebase-authenticated user.
2. A complete Firestore profile with a valid username.
3. Any requested onboarding replay/new-account welcome flow.
4. Restoration of an active walk when one exists.

This gate runs at normal app startup only. There is no route middleware or per-route guard, so a custom-scheme deep link can enter another route without first passing through the splash gate. Firestore rules still enforce remote ownership, but screens can receive unauthenticated or malformed route state.

### Current primary navigation

The visible tab bar is:

- Home
- Stats
- Walk (the `steps` route, which is actually route discovery and saved routes)
- Profile

`explore` and `share` are registered as hidden tabs. Social features are secondary routes launched from Profile rather than first-class navigation.

### Current user roles and states

| State or role | Actual implementation | Authority |
| --- | --- | --- |
| Unauthenticated visitor | Routed to Auth on normal startup; can read public `routes` and `usernames` under current rules | Firebase Auth absence |
| Authenticated free user | Own profile, sessions, reflections, friends, challenges, rankings, and free feature limits | Firebase Auth UID plus client UI |
| Premium user | RevenueCat entitlement `pro`; plans are monthly, yearly, or lifetime | RevenueCat customer info, with local fallback cache |
| Founder | A display label for the lifetime plan, not a separate permission role | Client-derived Premium plan |
| Friend/request participant | Relationship state: none, pending sent, pending received, or friends | Firestore documents and rules |
| Challenge sender/receiver | Participant fields on one-to-one challenge documents | Firestore documents and rules |
| Team, group, company, community admin, coach, or moderator | Not implemented | None |
| Platform administrator | No application role or custom-claim model exists | None |

Premium is a product tier, not a Firebase authorization role. No Firestore rule checks Premium status.

### Analytics and crash handling

Native Firebase Analytics is initialized at the root on iOS and Android and is disabled by implementation on web. The client records app open, first session, selected screen views, sign-up/login, walk start/completion, challenge view/join, buddy search/add, paywall/subscription/restore, profile update/completion, route save, and error-boundary events. Analytics string parameters are length-limited and redact email-like text and coordinate pairs.

The screen-name mapper does not cover splash, onboarding, reflection, friend requests, leaderboard, Steps, Explore, or the modal route, so navigation analytics are incomplete. There is no analytics consent control in app code. There is also no Crashlytics, Sentry, or equivalent crash SDK. The React error boundary logs a sanitized analytics event and presents Retry, but it cannot provide native crash, ANR, breadcrumb, release-health, or source-mapped exception reporting.

### iOS, Android, and web compatibility baseline

| Area | iOS | Android | Web |
| --- | --- | --- | --- |
| App identity | `com.cookarell.stepoutside` | `com.stevencook.stepoutside` | Static Expo web output |
| Build numbering | EAS remote build number `37`; unchanged by this audit | EAS remote version code `6`; `app.config.ts` still contains ignored local code `3` | Not applicable |
| Firebase native services | Checked-in `GoogleService-Info.plist` is conditionally used | `google-services.json` is absent, so app config cannot attach it from the repository | Firebase JS configuration uses environment values |
| Google sign-in | iOS and web client IDs are consumed | Client code supports an Android ID, but the audited configuration does not provide one, so Google auth is disabled | Web client ID is consumed |
| RevenueCat | Apple key configured; paywall language matches Apple | Production EAS exposes a Google key, but local Google key is empty and UI/links remain Apple-specific | RevenueCat initialization returns unavailable |
| Location/maps | Foreground location; native map can use configured Google provider; external URLs use Apple Maps | Foreground location; Google provider can use configured key; external URLs still use Apple Maps | Location paths have fallbacks; route map uses non-native preview behavior |
| Notifications | Local Expo notifications; provisional authorization accepted | Local Expo notifications and default Android channel | Notification module intentionally returns unavailable |
| Analytics | Native Firebase Analytics | Requires a valid native Firebase app configuration; repository lacks Android service JSON | Intentionally disabled |

Expo Doctor passes the source configuration, but that does not prove store-build OAuth, Firebase native initialization, purchases, notification delivery, or physical-device location behavior. Those require signed internal/TestFlight builds.

## 2. Current screen map

### Route inventory

| Route | Purpose and actual behavior | Entry/exit notes |
| --- | --- | --- |
| `/_layout` | Root error boundary, RevenueCat initialization, Firebase Analytics initialization, app-open and mapped screen-view logging | Registers the root stack; no route guards |
| `/` | Redirect-only route | Always redirects to `/splash` |
| `/splash` | Animated launch, local reminder refresh, authentication/profile/onboarding/active-walk resolution | Normal entry gate; 2.5-second forced delay |
| `/auth` | Email sign-up/sign-in, password reset, Google sign-in | New users go to profile setup; returning users use the entry resolver |
| `/profile-setup` | Requires Firebase user; collects required username and optional display name | Saves profile, discovery record, and Auth display fields, then onboarding/home |
| `/(onboarding)/welcome-1` | Individual wellness positioning | Continue, or skip and mark onboarding complete |
| `/(onboarding)/welcome-2` | Streak/campfire habit framing | Continue, back, or skip |
| `/(onboarding)/welcome-3` | Friends, family, coworkers, or solo positioning | Continue or back; no skip control passed here |
| `/(onboarding)/welcome-4` | Completion and “every step matters” message | Marks onboarding complete and resolves home/active walk |
| `/(tabs)/index` | Home: greeting, daily spark, start-walk CTA, weather/sun context, basic summary, streak campsite, Premium streak preview, nearby suggested reset, Premium promotion | Reads summary and external location/route context on focus |
| `/(tabs)/stats` | Re-export of `/stats` inside the tab shell | Duplicates the root stats implementation route |
| `/stats` | History, totals, 7-day activity, embedded leaderboard, monthly insights, Premium streak/Golden Hour sections, session list | Also registered as a root stack route; back behavior depends on entry |
| `/(tabs)/steps` | Nearby/ZIP reset suggestions, saved suggested walks, saved GPS route history, free three-suggestion limit | Tab label is “Walk,” although the actual tracker is `/walk` |
| `/(tabs)/profile` | Account/profile summary, embedded sign-in controls, stats, social links, Premium status/restore, reminder toggles, onboarding replay, sign out | Duplicates much of `/auth` Google/email logic |
| `/(tabs)/explore` | Privacy and Terms text/links | Hidden tab and no verified in-app navigation entry; text says sessions/reflections are local-first even though both can sync to Firestore |
| `/start` | Lightweight “start walk” interstitial and active-walk redirect | No current inbound navigation was found; `/walk` is launched directly from Home/Stats |
| `/walk` | Foreground GPS/timer tracking, pause/resume/stop, GPS filtering, active snapshot recovery | Persists active state; leaving unmounts GPS even when UI says the walk can keep running |
| `/complete` | Resolves completed draft, Premium state and solar bonus, saves session, updates summary/social ranking, then offers reflection/home | Remote side effects are awaited during completion |
| `/reflection` | Picks prompt, saves reflection to Firestore with local fallback, or skips | Replaces route with hidden tab share summary |
| `/(tabs)/share` | Post-walk summary in tab shell, native share sheet, route-save action | Used by reflection flow |
| `/share` | Same post-walk summary without tab shell | Root alias; no current in-app entry was found |
| `/saved-route` | Loads a session by ID, displays route/metrics/bonuses, opens last point in Apple Maps | No direct Premium check on this route |
| `/edit-profile` | Edits display name, username, location, favorite activity, and outdoor goal | Does not expose `dreamPlaces` or photo editing even though the model contains both |
| `/friends` | Friends list with profile/activity summary, removal, and one-to-one challenge invitation | N+1 reads for friend profiles/activity |
| `/friends-search` | Exact username search, with email fallback when input contains `@`; sends friend requests | UI copy says username only although code also searches email |
| `/friend-requests` | Incoming accept/decline and outgoing pending requests | Accepted/declined requests remain permanently because deletion is denied |
| `/challenges` | Incoming and sent weekly challenge invitations; recipient can accept/decline | No challenge progress, completion, result, or expiry processing |
| `/leaderboard` | Paged global or friends leaderboard for weekly/monthly/all-time minutes | Refreshes the current user's client-computed ranking on load |
| `/pro` | Live RevenueCat catalog, purchase, restore, status, policy links, dev-only local clear | Text and management links are Apple-specific even on Android |
| `/modal` | Generic empty-state/template route | Not explicitly registered in the root stack and no current inbound navigation was found |

### Main activity flow

`Home → /walk → /complete → /reflection (optional) → /(tabs)/share → tabs`

The completed-walk draft is the handoff safety mechanism between tracking and completion. The completion screen prevents sessions shorter than ten seconds and uses the walk ID to make local insertion idempotent.

### Main social flow

`Profile → Find Friends → request → Friend Requests → Friends → challenge invitation → Challenges`

The flow stops at invitation acceptance. An accepted challenge does not subscribe to activity changes or compute contributions/progress.

## 3. Existing data model

### Firestore collections and rules

| Path | Actual data and access | Audit result |
| --- | --- | --- |
| `routes/{routeId}` | Curated route documents | Public read; all client writes denied |
| `usernames/{username}` | UID ownership reservation plus timestamps | Public read; authenticated owner can create/update/delete their reservation |
| `userDiscovery/{uid}` | UID, username, `emailLower`, display name, photo URL, timestamps | Any authenticated user can read/list every document; owner writes validated shape |
| `users/{uid}` | Auth/profile fields: UID, email/emailLower, display name, username, location, preferences, photo URL, timestamps | Owner-only read/write/delete; updates do not restrict the complete field set |
| `users/{uid}/sessions/{sessionId}` | Activity metadata, optional GPS route points, owner IDs, summary flags | Owner-only; owner UID fields are optional but must match path if present; no field, size, timestamp, duration, or activity validation |
| `users/{uid}/reflections/{reflectionId}` | Prompt, text, walk metadata, AI placeholder status | Owner-only arbitrary read/write; no schema/length validation |
| `friendRequests/{senderUid_recipientUid}` | Sender, recipient, pending/accepted/declined, created timestamp | Participants read; sender creates/resends; recipient accepts/declines; delete denied |
| `friendships/{sortedUidPair}` | Two UIDs and created timestamp | Participants read/delete; create requires an accepted request in the same atomic state |
| `friendActivity/{uid}` | Public-to-friends summary: username, name, photo, walk count, total distance, streak | Owner writes; owner or current friend reads |
| `friendChallenges/{autoId}` | Sender/receiver, type, target, date window, status, created timestamp | Participants read; friend sender creates; receiver can only change pending to accepted/declined; delete denied |
| `leaderboardEntries/{uid}` | Weekly/monthly/all-time minutes, sessions, distance, streak and period keys | Any authenticated user reads; owner writes all of their own metrics directly |

Firestore denies unmatched paths by default. There is no group, team, company, membership, invitation, moderation, contribution, audit-log, push-token, or notification collection.

### Declared composite indexes

The repository declares:

- Incoming friend requests by recipient/status/created date.
- Outgoing friend requests by sender/status/created date.
- Friendships by array membership/created date.
- Weekly leaderboard by week key/minutes.
- Monthly leaderboard by month key/minutes.

The code queries friend challenges by `receiverUid + createdAt` and `senderUid + createdAt`, but neither composite index is declared in `firestore.indexes.json`. The deployed console could contain manually created indexes, but the repository cannot reproduce them.

### Activity model

`OutsideSession` stores:

- ID, start/end timestamps, elapsed/moving/paused seconds.
- Source: `timer` or `gps`.
- Activity type: `walk` or `hike`.
- Optional distance, elevation, pace, route points, saved/share timestamps.
- Sunrise/sunset bonus flags and metadata.

All newly completed sessions are hard-coded as `activityType: "walk"`; there is no hike selection UI. The `hike` model and monthly hike count therefore exist without a current creation path.

Sessions are stored both as a complete per-user JSON array in AsyncStorage and as one Firestore document per session. `getSessions()` reads the entire local array and the entire Firestore subcollection, merges them, rewrites the full local array, and sorts it.

### Derived summary and streak model

`SummaryStats` contains total minutes/sessions, daily current/best streaks, active days, fixed weekly/monthly goals, weekly consistency, comeback count, a streak-freeze count, solar counts, Golden Hour streaks, dual-reset days, and minutes by local day key.

The summary is derived from all sessions and cached locally. Weekly and monthly goals are constants (`4` and `16`), not editable user data. `streakFreezeCount` is always recomputed as `0`; no freeze earning or use model exists.

### Friend, challenge, and leaderboard models

- Friend identity and discovery are denormalized into several documents.
- Friend activity exposes only count, total distance, and current streak.
- Challenges support `walk_distance`, `walk_count`, or `outside_minutes` and statuses `pending`, `accepted`, `declined`, `completed`, `expired`.
- Only `pending`, `accepted`, and `declined` are reachable through current code/rules.
- Leaderboards score minutes, while also displaying session count, distance, and streak.
- All leaderboard aggregation is computed on the client from the current user's locally/cloud-loaded sessions and written by that same client.

### Reflections

Reflections are written to `users/{uid}/reflections`. If Firestore fails, they are stored in a user-scoped local array. The UI has no reflection history/read screen, and cloud reflections are never queried by the app.

### Local storage keys

| Key | Scope and purpose | Isolation result |
| --- | --- | --- |
| `stepoutside:v2:user:{uid}:sessions` | Full local activity array | User-scoped |
| `stepoutside:v2:user:{uid}:summary` | Cached derived summary | User-scoped |
| `stepoutside:v2:sessions`, `stepoutside:v2:summary` | Legacy unscoped activity data | Deleted during current cleanup; not migrated to a user |
| `stepoutside:v2:user-data-scope-cleanup:v1` | Device cleanup marker | Device-global |
| `@stepoutside/user:{uid}:activeWalk` | Active walk recovery | User-scoped |
| `@stepoutside/user:{uid}:completedWalkDraft` | Tracker-to-completion handoff | User-scoped |
| `@stepoutside/activeWalk`, `@stepoutside/completedWalkDraft` | Legacy handoff state | Migrated to current authenticated user when found |
| `stepoutside:v2:user:{uid}:reflections` | Offline reflection fallback | User-scoped |
| `stepoutside:v2:reflections` | Legacy reflections | Deleted, not migrated |
| `stepoutside:v2:auth-cache` | Lightweight Auth user snapshot for UI | Device-global, cleared on sign out |
| `@stepoutside/onboardingCompleted[:uid]` | Onboarding completion | Both user-scoped and device-global values are written/read |
| `@stepoutside/newAccountNeedsWelcome[:uid]` | New-account welcome flag | Normally user-scoped; cleanup also touches legacy global key |
| `@stepoutside:replayWelcomeRequested[:uid]` | Replay request | Normally user-scoped; cleanup also touches legacy global key |
| `@stepoutside/proState` | Cached RevenueCat entitlement/plan | Device-global and not user-scoped |
| `@stepoutside/notificationPrefs` | Reminder preferences and quiet hours | Device-global |
| `@stepoutside/user:{uid}:savedWalks` | Saved suggested routes | User-scoped |
| `@stepoutside/savedWalks` | Legacy suggested routes | Deleted, not migrated |
| `@stepoutside/routeZipCode` | Saved ZIP | Device-global |
| `@stepoutside/recentSuggestions` | Cached route suggestions, including coordinates | Device-global |
| `stepoutside:v2:lastReflectionPromptIndex` | Prompt rotation | Device-global |
| `stepoutside:v2:analytics:first-session-logged` | First-session analytics marker | Device-global |

### Subscription gates

| Feature/gate | Actual enforcement |
| --- | --- |
| Home advanced streak panel | `usePremiumAccess()` swaps the advanced panel for a locked preview |
| Monthly progress, Premium streaks, and Golden Hour Stats sections | `PremiumFeatureGate` controls rendering in Stats |
| Saved suggested walks | Free users are limited to three user-scoped saved suggestions in the Steps screen |
| GPS route retention | `addCompletedSession()` strips route points unless the current `getPremiumStatus()` result is Premium |
| Sunrise/sunset achievements | Solar window is evaluated for all eligible GPS starts, but achievement flags are awarded only when Premium |
| Route save button | Appears only when the saved session still contains route points; `saveSessionRouteForLater()` itself does not check Premium |
| Saved route detail | No entitlement check; a known session ID can display retained route points after downgrade or via direct deep link |
| Premium paywall | Live RevenueCat offerings and customer state on native builds; local unlock scaffold is allowed in development/Expo Go |
| Firestore | No rule enforces Premium. A client can write route points to its owner-only session documents directly |

The current design is therefore an application-level product gate, not a security boundary. That is acceptable for owner-only personal display features only if entitlement cache and downgrade behavior are explicit and tested. It is not sufficient for server-visible group or corporate benefits.

## 4. Features that already support the V3 vision

The following are real, working foundations rather than roadmap placeholders:

- **Individual outdoor habit loop:** authenticated users can start, pause, restore, stop, complete, reflect on, and share a walk.
- **GPS quality controls:** point filtering, horizontal-distance calculation, pace, movement detection, elevation metadata, and route recovery already exist.
- **Cross-device activity baseline:** sessions sync to owner-only Firestore subcollections and merge back into local storage.
- **Profiles and discoverability:** username reservation, public discovery records, profile setup/editing, Auth display synchronization, and exact search exist.
- **Friend graph:** requests, acceptance/decline, friendships, removal, lists, and friend-visible activity summaries are enforced with participant-aware rules.
- **Social motivation:** one-to-one weekly challenge invitations already establish challenge types, targets, date windows, and participant privacy.
- **Leaderboards:** friends/global scopes and weekly/monthly/all-time periods exist, including pagination and a pinned current-user rank.
- **Streak and wellness framing:** daily streaks, campfire progression, active-day goals, comeback and solar concepts support a wellness product rather than only workout logging.
- **Local reminders:** sunrise, sunset, quiet hours, and a daily streak reminder are implemented with local notifications.
- **Premium commerce:** RevenueCat initialization, authenticated identity changes, offerings, live prices, purchase, restore, and a customer-info listener exist.
- **Privacy-oriented Firestore ownership:** user profiles, sessions, and reflections are owner-only; friend activity and challenges have relationship/participant rules.
- **Incremental evolution:** session parsing and summary versioning already tolerate several legacy fields, which is useful for additive V3 migrations.

## 5. Features that are incomplete or broken

| Priority | Verified finding | Impact and safest correction |
| --- | --- | --- |
| **P0** | Daily and Golden Hour `computeStreaks()` start at today and immediately return zero if today has no activity. The leaderboard implementation has the same today-only behavior and an explicit yesterday branch that still returns zero. | A user's active streak disappears at midnight before they have a chance to walk. Define and test the intended grace rule (normally today or yesterday), then use one shared streak implementation everywhere. |
| **P0** | The walk screen tells users they can “leave running,” but screen cleanup stops the GPS subscription and timer. Only elapsed clock recovery continues; distance and route do not track while away. No background-location task or permission exists. | Change the copy/behavior to foreground-only until a separately reviewed background-tracking design exists. Do not request background location merely to preserve the current message. |
| **P0** | Firebase Auth is initialized without React Native persistence; the code itself says native persistence still needs validation. | Verify cold-launch persistence on TestFlight and Android internal builds, then adopt the supported RN persistence adapter/package path before building V3 account-dependent flows. |
| **P0** | RevenueCat fallback cache `@stepoutside/proState` is global. When RevenueCat is unavailable, one account can inherit another account's cached Premium UI state on the same device. | Scope cached state by RevenueCat app user ID/Auth UID, clear or reconcile it atomically on identity changes, and treat stale cache as display-only. |
| **P0** | `userDiscovery` exposes `emailLower` to every authenticated reader/list query. | Stop returning email in broadly readable discovery documents. Use a server-mediated exact lookup or privacy-preserving email hash/index with rate limits and consent. |
| **P0** | No `storage.rules` file or Storage deployment entry exists, while profile-photo upload/delete functions target `profilePhotos/{uid}/avatar.jpg`. Deployed Storage access cannot be reproduced or audited from this repository. | Export/version owner-only Storage rules and test them before enabling photo upload UI. Confirm current deployed rules immediately. |
| **P0** | Completion awaits Premium lookup, solar lookup, local save, leaderboard write, friend summary write, and session Firestore sync. Firestore calls are sequentially awaited after local persistence. | Keep the local session transaction as the completion boundary; queue/retry noncritical cloud/social sync without blocking the completion UI. Preserve idempotency. |
| **P1** | Challenge acceptance is the end of the implementation. There is no progress, participant contribution, completion, winner/result, expiration job, or challenge detail screen. | Build a server-authoritative challenge lifecycle on additive V3 collections; do not stretch the invitation document into a group progress engine. |
| **P1** | Challenge sender/receiver queries require composite indexes not declared in the repository. | Add and emulator-test both indexes, then confirm deployed state. |
| **P1** | Leaderboard metrics and timestamps are fully client-writable. A modified client can publish arbitrary minutes, distance, sessions, and streaks. | Move public/group aggregation to trusted server code fed by owner activity events, with bounded validation and idempotent recomputation. |
| **P1** | Challenge targets/dates and leaderboard periods use client `Date.now()` and local timezone values. | Establish server timestamps and an explicit challenge/group timezone policy. |
| **P1** | The “streak-save reminder” is scheduled every evening regardless of whether the user already completed an activity. | Base reminder eligibility on today's persisted activity and reschedule after completion. |
| **P1** | Solar notifications cover only three forecast days and are refreshed only when preferences change or the splash screen opens. All app-scheduled notifications are canceled before every refresh. | Add a bounded refresh strategy and identifiers/categories so one reminder family does not erase unrelated future notifications. |
| **P1** | `friendChallenges` defines `completed` and `expired`, but current rules make both transitions impossible. | Add trusted lifecycle transitions through server code; keep clients limited to invitation response and permitted admin actions. |
| **P1** | Android Google OAuth is coded but the audited environment/config does not provide `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`; Android therefore disables Google sign-in. | Configure and test the Android OAuth client before promising auth parity. |
| **P1** | Paywall copy, billing detail, subscription management link, and restore messages refer specifically to Apple on all platforms. | Use platform-correct store language/management URLs and validate RevenueCat products on both stores. |
| **P1** | Saved routes can be opened directly without checking current Premium state. Existing route points also remain after entitlement loss. | Decide and document the retention policy, then enforce it consistently at navigation/UI level without deleting customer data. |
| **P1** | All completed sessions are hard-coded as walks; hikes are displayed in analytics but cannot be created. | Add an additive activity-type selector only after the current walk schema and migration tests are locked. |
| **P1** | There is no account deletion flow in the app, even though profiles, usernames, discovery records, sessions, reflections, friend data, rankings, RevenueCat identity, and photos can exist. | Add a coordinated deletion workflow with reauthentication, relationship cleanup, Storage cleanup, and clear retention behavior. |
| **P1** | The hidden privacy screen says sessions and reflections are stored on-device, but both can be stored in Firestore. | Align in-app disclosure and published policy with actual data flows before adding team visibility. |
| **P1** | Custom-scheme routes have no central auth or parameter guard. | Add route-group guards and validate all route params/ownership before rendering sensitive screens. |
| **P2** | `streakFreezeCount` is always zero but the Premium UI presents streak freeze as a feature. | Hide the claim until a real, tested model exists, or implement it after launch with explicit rules. |
| **P2** | Cloud reflections can be written but are never read; local fallback reflections have no history UI. | Add a single source-of-truth read model and migration before promoting journals as a V3 feature. |
| **P2** | Profile fields `dreamPlaces` and `photoURL` exist, but current edit/setup screens cannot manage them; upload helpers are unused. | Remove dead claims from UI or add the controls after Storage rules are secured. |
| **P2** | `/start`, `/share`, `/modal`, and hidden `/explore` are orphaned or duplicated routes. | Remove or intentionally route to them only after analytics confirms they are not used by external links. |
| **P2** | The visible “Walk” tab is route discovery/saved routes, while actual tracking is a separate route. | Revisit labeling/navigation as part of the V3 community information architecture, behind a feature flag. |
| **P3** | Corporate messaging exists on the website, but the app has no organization/team roles, data, screens, or administration. | Build corporate wellness from shared group primitives after consumer groups are stable; do not fork a second app architecture. |

## 6. Missing permissions or Firestore rules

### Platform permissions and links

Current source configuration requests foreground coarse/fine location and configures local notifications. Foreground location is sufficient for the code that is actually implemented. It is not sufficient for the UI's implied background GPS behavior.

| Priority | Required action | Reason |
| --- | --- | --- |
| **P0** | Keep tracking explicitly foreground-only, or remove “leave running” promises, until production tests prove the intended behavior. | No background task, background location permission, or background mode is implemented. |
| **P1** | If background tracking becomes a V3 requirement, create a separate privacy, battery, platform-policy, and permission project before adding permissions. | Background location materially changes product risk and App Store/Play review requirements. |
| **P1** | Add authenticated route guards and route-param validation for custom-scheme entry. | `stepoutsidev2://` and `exp+step-outside-v2://` can target file routes; no universal/app link allowlist exists. |
| **P1** | Configure universal links/App Links only for explicit invite and challenge routes, with signed/opaque invite tokens. | Current configuration has custom schemes only and no verified-domain association. |
| **P1** | Replace Apple Maps-only URLs with platform-aware map URLs. | Saved and suggested routes generate `http://maps.apple.com` on Android as well as iOS. |
| **P2** | Add accessible names, states, focus order, dynamic-type testing, and screen-reader tests across all interactive controls. | Only 11 accessibility/test identifier usages were found across approximately 12,800 screen lines. |

### Firestore and Storage rule gaps

| Priority | Required action | Reason |
| --- | --- | --- |
| **P0** | Version and test Firebase Storage rules for `profilePhotos/{uid}/avatar.jpg`; deny all unmatched objects. | Storage access is currently unprovable from source. |
| **P0** | Remove email from generally readable discovery records and rate-limit lookup through trusted code. | Current authenticated read access permits enumeration/scraping. |
| **P1** | Add Firestore Emulator rule tests for every collection and negative cross-user case. | No rule test suite exists; the only automated test covers a time utility. |
| **P1** | Add declared challenge indexes for sender/receiver plus created date. | Queries cannot be reproduced from the checked-in index manifest. |
| **P1** | Add strict schemas, immutable ownership fields, reasonable numeric/time bounds, and route-point size limits for sessions/reflections/social summaries. | Owner-only access prevents cross-user writes but does not prevent malformed or oversized documents. |
| **P1** | Make leaderboard and challenge-result writes server-only. | Public competition cannot trust client-authored totals. |
| **P1** | Add group, membership, invitation, challenge participant, and contribution rules with explicit roles and visibility. | No V3 community authorization model exists. |
| **P1** | Add deletion/retention rules and backend cleanup for accounts and group membership. | Current friend requests/challenges are undeletable and account cleanup is absent. |
| **P2** | Enable and enforce Firebase App Check after monitoring rollout impact. | No App Check initialization is present; it should complement, not replace, rules. |

## 7. Technical debt

| Priority | Debt | Recommended action |
| --- | --- | --- |
| **P0** | Local `main` and `origin/main` have divergent app/website histories. | Define repository ownership and stable-branch reconciliation before V3 teams add commits. |
| **P0** | Core streak, entitlement-cache, auth-persistence, and activity-background behavior lack regression tests. | Add focused unit/integration tests before feature work. |
| **P1** | The single package mixes a website and mobile app; `lint` validates HTML while `app:lint` runs Expo lint. | Separate scripts/workspaces or name every validation target unambiguously in CI. |
| **P1** | Large screens combine rendering and orchestration (`walk` 1,600+ lines, Profile/Home 1,400–1,500+ lines, Steps 1,100+ lines). | Extract domain hooks/use-cases incrementally without changing route behavior. |
| **P1** | Auth UI and Google OAuth response handling are duplicated in Auth and Profile. | Use one authentication module/component after current sign-in flows are covered by tests. |
| **P1** | Stats and share each have root and tab route aliases, and screen analytics is path-by-path. | Establish canonical routes and intentional aliases before adding more community routes. |
| **P1** | There is no schema version field on Firestore documents and no migration runner. | Add additive document versions and idempotent migration/backfill tools. |
| **P1** | Network dependencies have inconsistent timeouts/retries; completion can wait on remote calls. | Standardize bounded clients, offline status, retry queues, and cancellation. |
| **P2** | Many errors are swallowed into empty arrays or generic UI, making data loss and backend failures indistinguishable. | Add structured error types and observable retry/diagnostic states. |
| **P2** | Fifty-seven console statements remain; some log IDs and activity diagnostics in development. | Introduce a redacting logger with environment levels and remove noisy production paths. |
| **P2** | The route catalog uses seeded client data plus public unauthenticated services and duplicates distance helpers. | Move shared geospatial helpers to one module and cache/version catalog data deliberately. |
| **P2** | Existing V4 documents conflict with the newly declared V3 direction and terminology. | Reconcile product docs after this audit is accepted; do not let roadmap labels drive implementation. |
| **P3** | No monorepo/domain package boundaries exist for future admin or corporate surfaces. | Extract shared contracts only when a second surface actually needs them. |

## 8. Security concerns

### Confirmed strengths

- Session, reflection, and profile Firestore paths are owner-only.
- Friendship creation requires an accepted request.
- Friend activity is readable only by owner/current friends.
- Challenge documents are participant-only.
- Usernames are reserved transactionally.
- Analytics sanitization redacts email-like strings and coordinate pairs and limits string length.
- Firebase configuration uses public client values; no server secret is expected in the bundle.

### Risks and recommendations

| Priority | Concern | Required mitigation |
| --- | --- | --- |
| **P0** | Authenticated discovery documents reveal normalized email addresses. | Remove the field from readable documents and migrate existing data. |
| **P0** | Storage rules are absent from source while upload/delete code exists. | Confirm deployed rules, then version owner-only rules and tests. |
| **P0** | Global Premium cache can cross account boundaries when the network/SDK is unavailable. | Scope and reconcile cache per identity. |
| **P1** | Self-authored leaderboard data permits cheating and undermines workplace/community trust. | Use trusted aggregation and immutable contribution events. |
| **P1** | No App Check, rate limiting, abuse reporting, blocking, moderation, or safety model exists. | Add these before public group discovery or large communities. |
| **P1** | Profile/discovery display fields have no strict length bounds in rules. | Add server/rule bounds and client normalization. |
| **P1** | Session/reflection documents accept unbounded fields and client timestamps. | Validate schema/size and use server timestamps for shared semantics. |
| **P1** | Account deletion and data retention are not implemented. | Build a server-coordinated deletion flow and document retained purchase records. |
| **P1** | Route points are sensitive location history stored in AsyncStorage and Firestore. | Keep them owner-only, add retention/export/delete controls, minimize shared derivatives, and never copy raw routes into group documents. |
| **P1** | Social searches and requests have no throttling or block list. | Add server-mediated limits, blocks, and abuse controls before V3 expansion. |
| **P1** | Deep links can bypass the normal startup gate. | Guard route groups and validate invite/session identifiers. |
| **P2** | Public usernames reveal UID mappings without App Check or rate controls. | Decide whether public username lookup is intentional and mediate enumeration-sensitive flows. |

## 9. Performance concerns

| Priority | Concern | Evidence and recommendation |
| --- | --- | --- |
| **P0** | Completion responsiveness depends on multiple network operations. | Commit locally first and move social/cloud synchronization to an idempotent queue. |
| **P1** | Activity reads are unbounded. | `getSessions()` reads the entire Firestore subcollection and rewrites the entire AsyncStorage JSON array. Add pagination/incremental sync and a compact summary cursor without changing existing documents. |
| **P1** | Route points live inside session documents with no cap. | Long activities grow local JSON and Firestore documents. Store a bounded simplified route or separate route artifact while preserving existing route data. |
| **P1** | Friends and challenges use N+1 document reads. | Friend lists fetch each discovery/activity document; challenges fetch each counterpart; friend leaderboards fetch each ranking. Introduce batched/denormalized read models maintained by trusted code. |
| **P1** | Home/Stats/Profile each reload and recompute overlapping session/summary data on focus. | Add a shared observable activity repository/cache with explicit refresh semantics. |
| **P2** | Saved route cards can render multiple native maps at once. | Use static/lightweight previews in lists and render the interactive map only on detail. |
| **P2** | Large screen components and extensive SVG decoration increase render cost. | Profile on low-end Android devices, memoize stable sections, and reduce offscreen work based on measurements. |
| **P2** | External route/weather providers have inconsistent caching and retry behavior. | Add short bounded timeouts, cache age metadata, and provider-specific failure telemetry. |
| **P2** | Global leaderboard pinned rank performs an extra count query. | Cache/rate-limit refreshes and prefer server-generated rank snapshots at scale. |

## 10. Recommended V3 architecture

The safest V3 architecture is an additive evolution of the current Expo/Firebase/RevenueCat application.

### Preserve the current foundation

- **P0:** Keep the existing Expo Router app, bundle identifiers, Auth users, Firestore user/session paths, RevenueCat entitlement, and AsyncStorage migration logic.
- **P0:** Treat current session documents as immutable compatibility records; add fields/versioning rather than rewriting history.
- **P0:** Establish regression tests for authentication, activity recovery/completion, streaks, Premium identity changes, and cross-user isolation before refactoring.

### Introduce domain boundaries

- **P1:** Create domain modules for identity, activity, community, challenges, rankings, subscriptions, and notifications. Each should expose typed use-cases and repositories rather than importing Firebase directly from screens.
- **P1:** Add runtime validation at cloud/client boundaries and explicit schema versions.
- **P1:** Add one app-session/auth provider and route-group guards so identity changes reset user-scoped caches consistently.
- **P2:** Add a query/cache layer appropriate to React Native after domain APIs are stable; do not replace persistence wholesale during V3 launch work.

### Add trusted backend operations

- **P1:** Add Firebase Functions or another trusted service for challenge lifecycle, contribution aggregation, ranking computation, membership invitations, account deletion, abuse throttling, and RevenueCat webhook processing where server-side entitlement is needed.
- **P1:** Use idempotency keys and immutable activity/contribution references; never trust a client-submitted aggregate.
- **P1:** Use server timestamps for group/challenge semantics while retaining local timestamps for personal display.
- **P2:** Add scheduled challenge expiry, notification fan-out, and maintenance jobs after the core lifecycle is tested.

### Add additive community collections

Recommended V3 primitives:

| Priority | Collection/model | Purpose |
| --- | --- | --- |
| **P1** | `groups/{groupId}` | Family, informal group, workplace team, or community identity; type, visibility, owner, timezone, lifecycle |
| **P1** | `groupMemberships/{groupId_uid}` | UID, group ID, role (`owner`, `admin`, `member`), status, joined/invited timestamps; queryable per user and group |
| **P1** | `groupInvites/{inviteId}` | Opaque invite, inviter, intended recipient/domain where appropriate, expiry, status |
| **P1** | `challengesV3/{challengeId}` | Group/creator, goal definition, eligibility, period, timezone, status, visibility, scoring version |
| **P1** | `challengeParticipants/{challengeId_uid}` | Enrollment, team, progress snapshot, completion/result state |
| **P1** | `activityContributions/{challengeId_activityId_uid}` | Idempotent, server-validated contribution derived from an owner activity |
| **P1** | `rankingSnapshots/{scope_period}` or subcollections | Server-generated, paged ranking rows without raw route/location data |
| **P1** | `blocks/{owner_blockedUid}` and `reports/{reportId}` | User safety and moderation |
| **P2** | `devices/{uid}/pushTokens/{tokenId}` | Push routing, platform, consent, last seen |
| **P2** | `auditEvents/{eventId}` | Administrative/member lifecycle audit where required |

Do not copy raw GPS route points into community models. Contributions should contain the minimum derived metrics needed for the challenge.

### Authorization model

- **P1:** Firestore access must derive from authenticated UID plus membership documents.
- **P1:** Group roles are per-group membership roles; platform administration should use trusted custom claims, never a client profile field.
- **P1:** Premium remains a RevenueCat entitlement and should not be treated as group authority.
- **P1:** Public, private, invite-only, and workplace-domain visibility must be explicit and test-covered.
- **P1:** Corporate managers should see only the aggregate/participant data promised by policy, never private reflections or raw routes.

### Reliability and observability

- **P0:** Add production crash reporting with source maps and release identifiers; retain the user-friendly error boundary.
- **P0:** Add structured telemetry for activity save/recovery, Auth persistence, RevenueCat identity, and sync failures without location/reflection content.
- **P1:** Add CI for type-check, Expo lint, Expo Doctor, unit tests, Firestore/Storage emulator tests, and platform build smoke tests.
- **P1:** Add remote feature flags for community navigation, groups, and new challenge paths, with a kill switch.
- **P2:** Add performance traces for cold start, completion latency, session sync, friend lists, and rankings.

## 11. Recommended development phases

### Phase 0 — Stabilize and freeze the production baseline

- **P0:** Reconcile stable Git history and define mobile versus website ownership/build commands.
- **P0:** Test/fix Auth cold-launch persistence on physical iOS and Android builds.
- **P0:** Fix shared streak semantics and add regression tests around midnight, yesterday, timezone changes, and DST.
- **P0:** Make tracking messaging accurately foreground-only and test pause/leave/restore/kill flows.
- **P0:** Scope RevenueCat cache by identity and test sign-in/sign-out/offline transitions.
- **P0:** confirm/version Storage rules and remove broadly readable discovery email data.
- **P0:** decouple local completion from optional remote sync and add failure/retry telemetry.
- **P0:** add crash reporting and a release smoke-test checklist.

Exit criterion: production-equivalent iOS and Android builds preserve authentication, activities, streaks, purchases, and per-user isolation through cold launch, offline use, sign out/in, and upgrade.

### Phase 1 — Establish V3 platform contracts

- **P1:** Add typed domain repositories, schema versions, route guards, feature flags, and emulator security tests.
- **P1:** Define privacy/visibility, group types, membership roles, timezones, scoring, retention, blocking, reporting, and account deletion.
- **P1:** Add trusted backend aggregation and RevenueCat webhook/entitlement verification where shared features require it.
- **P1:** Add group/membership/invite collections and indexes without changing existing friend/session paths.

Exit criterion: disabled-by-default V3 primitives can be deployed safely alongside V2 data and removed without affecting current screens.

### Phase 2 — Private consumer groups and real challenges

- **P1:** Launch invite-only friend/family groups behind a flag.
- **P1:** Add challenge details, enrollment, progress, completion, expiry, and inclusive team scoring.
- **P1:** Add group-scoped ranking snapshots and member privacy controls.
- **P1:** Add notification deep links using opaque invite/challenge tokens and safe route guards.

Exit criterion: a small invited cohort can use groups/challenges while individual-only users see no regression.

### Phase 3 — Promote community in navigation

- **P1:** Introduce a first-class Community destination only after Phase 2 telemetry and support outcomes are stable.
- **P1:** Preserve direct access to Home, individual tracking, Stats, and Profile.
- **P2:** Consolidate duplicate/orphan routes and extract large screens incrementally.
- **P2:** Add reflection history, additional activity types, better reminder intelligence, and accessibility completion.

Exit criterion: community participation is prominent but optional, with stable individual retention and activity completion metrics.

### Phase 4 — Workplace and community administration

- **P2:** Pilot workplace groups using the same membership/challenge primitives, with aggregate-only reporting and explicit consent.
- **P2:** Add organization administration, audit events, domain invites, and support tooling.
- **P3:** Add broader community discovery, cross-organization events, sponsorships, and advanced wellness reporting only after moderation and privacy operations are proven.

## 12. Features that should not be changed until production stability is confirmed

| Priority | Freeze area | Why |
| --- | --- | --- |
| **P0** | Bundle IDs, Expo project ID, URL scheme, Firebase project, RevenueCat entitlement/product IDs, EAS remote build-number ownership | Changing identity/configuration can strand accounts, purchases, links, or store updates |
| **P0** | Existing Auth UID model and `users/{uid}` ownership | All isolation and social identity depends on it |
| **P0** | Existing per-user session paths and AsyncStorage keys | They contain current user history and migration state |
| **P0** | Completed-walk ID/idempotency and draft handoff | They prevent duplicate/lost activities during navigation failure |
| **P0** | GPS filtering, distance, pace, pause, and recovery algorithms | Core activity integrity must be regression-tested before behavioral changes |
| **P0** | RevenueCat entitlement `pro`, purchase/restore flows, and existing customer identity mapping | Current paid access must survive V3 |
| **P0** | Username reservation and existing friendship/request documents | Current social graph must not be rewritten in place |
| **P0** | Existing Firestore owner-only session/reflection/profile rules | New rules should be additive and emulator-tested before deployment |
| **P1** | Current tab layout for all users | Change only behind a feature flag after Community is functionally complete |
| **P1** | Existing challenge documents | Keep as V1 invitation history; create a versioned V3 model instead of destructive migration |
| **P1** | Existing leaderboard entries | Continue read compatibility while server-authoritative V3 snapshots are backfilled |
| **P1** | Current route-point retention | Establish entitlement/privacy/deletion policy before moving or pruning customer routes |

## Safest path to V3.0

The safest path is to stabilize the current application first, then add V3 community capabilities beside—not inside or on top of—the fragile client-authored social aggregates. Preserve Auth UIDs, activity history, local keys, Firestore owner paths, RevenueCat identity, and production identifiers. Fix the verified P0 correctness and privacy issues, add crash/rule/regression coverage, and make cloud synchronization nonblocking. Then introduce versioned group, membership, challenge, contribution, and ranking models behind feature flags with server-authoritative aggregation and explicit privacy roles. Pilot invite-only consumer groups before changing primary navigation or adding workplace administration. This keeps the individual app complete throughout the migration and gives every V3 capability a reversible rollout path.
