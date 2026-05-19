# Step Outside Premium V1 Implementation Plan

## Scope

Audit date: May 19, 2026

This document captures what already exists in the Step Outside Expo app versus what still needs to be added for the first Premium launch.

Premium Launch Features:

1. GPS route saving
2. Sunrise/sunset bonuses
3. Advanced streaks
4. Monthly stats
5. Guided audio walks
6. Premium badges/challenges

## Current architecture snapshot

### RevenueCat and subscription status

Current subscription system is already wired and usable.

- RevenueCat initializes on app startup in `app/_layout.tsx`
- RevenueCat client logic lives in `src/lib/pro.ts`
- Paywall UI lives in `app/pro.tsx`
- Auth changes sync RevenueCat identity in `src/lib/auth.ts`
- Current entitlement identifier is `pro`
- Current product IDs are:
  - `stepoutside_pro_monthly`
  - `stepoutside_pro_yearly`
  - `stepoutside_pro_lifetime_launch`

Recommendation:

- Keep the RevenueCat entitlement identifier as `pro` for V1 to avoid migration risk
- Keep marketing copy as `Premium` in the UI
- Do not rely on the lifetime product for V1 launch behavior

### Local data and storage

Most walk, streak, and stats data is still local-first.

- Walk sessions are stored in AsyncStorage via `src/lib/store.ts`
- Active in-progress walks are stored in AsyncStorage via `src/lib/activeWalk.ts`
- Summary/streak stats are derived from locally stored sessions in `src/lib/store.ts`
- Saved route sessions are local only right now
- Reflections can save remotely to Firestore, but sessions do not yet

### Firebase / Firestore

Firebase is configured in `src/lib/firebase.ts`.

Current Firestore usage:

- `users/{uid}/reflections/{reflectionId}` is actively written by `src/lib/reflections.ts`

Current Firestore rules already allow:

- `users/{uid}`
- `users/{uid}/sessions/{sessionId}`
- `users/{uid}/reflections/{reflectionId}`
- read-only `routes/{routeId}`

Important note:

- `users/{uid}/sessions/{sessionId}` exists in rules, but the app does not currently write walk sessions there

## Existing files involved

### Subscriptions / Premium access

- `app/_layout.tsx`
- `app/pro.tsx`
- `src/lib/pro.ts`
- `src/lib/auth.ts`
- `env.ts`
- `app/(tabs)/profile.tsx`
- `app/(tabs)/index.tsx`
- `app/(tabs)/steps.tsx`
- `app/stats.tsx`

### Walk tracking / GPS / route saving

- `app/walk.tsx`
- `app/complete.tsx`
- `app/saved-route.tsx`
- `src/lib/activeWalk.ts`
- `src/lib/store.ts`
- `src/components/RoutePreview.tsx`

### Stats / streaks / bonuses

- `src/lib/store.ts`
- `app/stats.tsx`
- `app/(tabs)/index.tsx`
- `app/(tabs)/profile.tsx`

### Reflections / Firebase

- `app/reflection.tsx`
- `src/lib/reflections.ts`
- `src/lib/firebase.ts`
- `firestore.rules`

## Feature audit

## 1. GPS route saving

Status: Partially exists

What currently exists:

- The walk screen captures GPS points using `Location.watchPositionAsync` in `app/walk.tsx`
- Route points and distance are accumulated during active tracking
- Completed walks persist `routePoints`, `distanceM`, and `source` into local session storage in `src/lib/store.ts`
- Users can view saved route previews in `app/saved-route.tsx`
- Users can mark route sessions for later and browse saved route sessions locally
- Free plan currently limits saved walks in `app/(tabs)/steps.tsx`

What is missing for Premium V1:

- No remote sync of route sessions to Firestore
- No durable user-owned cross-device saved route library
- No explicit premium gating around GPS route persistence itself
- No upload model for route metadata beyond the local session shape
- No retry/sync queue for offline-to-cloud route persistence

V1 recommendation:

- Treat GPS route saving as a Premium capability at the session library layer, not by breaking basic walk tracking
- Keep raw tracking stable for all users
- Gate premium benefits around saved route history, cloud sync, and longer retention

## 2. Sunrise / sunset bonuses

Status: Mostly exists locally

What currently exists:

- Bonus windows are computed at walk completion in `app/complete.tsx`
- Sessions store `sunriseBonus` and `sunsetBonus`
- Summary aggregation tracks:
  - `sunriseBonusCount`
  - `sunsetBonusCount`
  - `goldenHourStreakCurrent`
  - `goldenHourStreakBest`
  - `dualResetDaysCount`
- Home and Stats already surface Golden Hour language and metrics

What is missing for Premium V1:

- No Firestore sync for bonus-bearing sessions
- No canonical server-backed history for bonus counts
- No premium-specific reward layer tied to bonuses
- No monthly Golden Hour breakdown

V1 recommendation:

- Keep the current bonus calculation logic
- Reuse it when writing remote sessions
- Expose premium-only trend views and reward/badge hooks on top of the existing bonus fields

## 3. Advanced streaks

Status: Partially exists

What currently exists:

- `currentStreakDays` and `bestStreakDays`
- Golden Hour streak current/best
- Dual reset day tracking
- Daily completion map in `daysCompleted`
- Premium gating in `app/stats.tsx` already hides some deeper Golden Hour metrics unless `isPro`

What is missing for Premium V1:

- No weekly/monthly streak breakdowns
- No streak freeze / streak milestone system
- No challenge-driven streak goals
- No remote sync for streak state
- No dedicated advanced streak data model beyond derived local summary

V1 recommendation:

- Keep streaks derived from sessions instead of storing separate authoritative streak counters
- Add cached monthly/advanced aggregates for performance, but sessions should remain the source of truth

## 4. Monthly stats

Status: Missing

What currently exists:

- All-time totals
- Last 7 days section
- Recent sessions
- Derived 30-day active day count
- Average session length

What is missing for Premium V1:

- No month selector
- No per-month summary docs
- No current-month vs previous-month comparisons
- No monthly streak, distance, or Golden Hour rollups
- No premium monthly stats screen or section

V1 recommendation:

- Add a monthly aggregate layer keyed by `YYYY-MM`
- Start with current month and previous month only for V1
- Build UI after remote session sync is in place

## 5. Guided audio walks

Status: Missing

What currently exists:

- No audio player
- No audio catalog
- No downloaded or streamed audio assets
- No guided walk metadata model
- No progress tracking for guided sessions

What is missing for Premium V1:

- Content model for guided walks
- Audio playback service and screen UI
- Asset hosting strategy
- Premium access gating
- Completion tracking and analytics

V1 recommendation:

- This is the largest net-new feature in the list
- Keep V1 minimal:
  - 3 to 5 guided audio walks
  - streaming first
  - no offline downloads initially
  - simple completion tracking only

## 6. Premium badges / challenges

Status: Missing

What currently exists:

- No badge data model
- No challenge engine
- No badge unlock UI
- No Firestore collections for earned badges or active challenges
- No milestone logic beyond streak and bonus summaries

What is missing for Premium V1:

- Badge catalog
- Challenge catalog
- Unlock criteria evaluation
- Earned badge persistence
- Active/completed challenge persistence
- UI surfaces in stats/profile/home

V1 recommendation:

- Start with simple deterministic unlocks driven entirely from session history
- Avoid time-limited live ops for V1
- Ship a static badge set and 3 to 5 evergreen challenges first

## Summary by feature

### Ready or close

- RevenueCat paywall and entitlement handling
- Local GPS route capture
- Local sunrise/sunset bonus computation
- Local base streak logic

### Partial

- Premium-gated advanced stats
- Saved route library
- Firebase foundation for future sync

### Missing

- Remote session sync
- Monthly stats
- Guided audio walks
- Badges/challenges system

## Recommended data model changes

## Local session model changes

Current `OutsideSession` in `src/lib/store.ts` should expand for Premium V1.

Recommended additions:

- `userId?: string`
- `endedDayKey?: string`
- `endedMonthKey?: string`
- `avgPaceSecPerMile?: number`
- `routeSavedToCloudAt?: number`
- `premiumFeaturesApplied?: string[]`
- `guidedAudioWalkId?: string | null`
- `guidedAudioCompleted?: boolean`
- `badgeIdsEarned?: string[]`
- `challengeIdsCompleted?: string[]`
- `syncState?: "local-only" | "pending" | "synced" | "error"`

## Monthly aggregate model

Add a new monthly aggregate shape, for example:

- `monthKey: string` like `2026-05`
- `totalMinutes`
- `totalSessions`
- `totalDistanceM`
- `activeDays`
- `currentStreakAtMonthEnd`
- `bestStreakWithinMonth`
- `sunriseBonusCount`
- `sunsetBonusCount`
- `goldenHourSessions`
- `guidedAudioSessions`
- `badgesEarnedCount`

## Badge model

Recommended badge shape:

- `id`
- `title`
- `description`
- `icon`
- `category`
- `unlockRule`
- `earnedAt`
- `sourceSessionId?: string`

## Challenge model

Recommended challenge shape:

- `id`
- `title`
- `description`
- `type`
- `goal`
- `progress`
- `startsAt?: number`
- `endsAt?: number`
- `status: "active" | "completed" | "expired"`
- `completedAt?: number`

## Guided audio walk model

Recommended guided audio walk shape:

- `id`
- `title`
- `description`
- `durationMin`
- `audioUrl`
- `coverImageUrl`
- `theme`
- `difficulty`
- `isPremium`
- `sortOrder`

## Firestore collections and fields needed

## Existing Firestore collections

- `users/{uid}/reflections/{reflectionId}` already exists and is used
- `users/{uid}/sessions/{sessionId}` is allowed in rules but not yet used by the app

## Recommended Firestore additions for Premium V1

### 1. Session sync

`users/{uid}/sessions/{sessionId}`

Recommended fields:

- `id`
- `startedAt`
- `endedAt`
- `endedDayKey`
- `endedMonthKey`
- `durationSec`
- `distanceM`
- `source`
- `routePoints`
- `savedRouteAt`
- `sunriseBonus`
- `sunsetBonus`
- `avgPaceSecPerMile`
- `guidedAudioWalkId`
- `badgeIdsEarned`
- `challengeIdsCompleted`
- `createdAt`
- `updatedAt`

### 2. Monthly stats cache

`users/{uid}/monthlyStats/{monthKey}`

Recommended fields:

- `monthKey`
- `totalMinutes`
- `totalSessions`
- `totalDistanceM`
- `activeDays`
- `bestStreakWithinMonth`
- `sunriseBonusCount`
- `sunsetBonusCount`
- `goldenHourSessions`
- `guidedAudioSessions`
- `badgeIdsEarned`
- `updatedAt`

### 3. Earned badges

`users/{uid}/badges/{badgeId}`

Recommended fields:

- `id`
- `title`
- `description`
- `category`
- `earnedAt`
- `sourceSessionId`

### 4. User challenge progress

`users/{uid}/challenges/{challengeId}`

Recommended fields:

- `id`
- `title`
- `type`
- `goal`
- `progress`
- `status`
- `startedAt`
- `completedAt`
- `updatedAt`

### 5. Audio progress

`users/{uid}/audioProgress/{audioWalkId}`

Recommended fields:

- `audioWalkId`
- `lastPositionSec`
- `completed`
- `completedAt`
- `updatedAt`

### 6. App-managed premium content catalogs

One of:

- `premiumContent/audioWalks/{audioWalkId}`
- `premiumContent/badges/{badgeId}`
- `premiumContent/challenges/{challengeId}`

or ship these as versioned local JSON first if we want less backend risk for V1.

Recommendation:

- Keep badge and challenge catalogs local/static for V1
- Only persist earned state remotely
- Use Firestore for user progress, not for all content definitions unless content needs live editing

## RevenueCat entitlement

Current entitlement:

- `pro`

Recommended V1 entitlement strategy:

- Keep `pro` as the single entitlement for all Premium V1 features
- Keep UI naming as `Premium`
- Do not create separate entitlements for route saving, audio, or badges in V1

## What needs to be added

### Must-have before Premium V1 is complete

1. Remote session sync to Firestore
2. Premium-aware session retention/saved route behavior
3. Monthly stats data model and UI
4. Badge/challenge system
5. Guided audio walk player and content model

### Already usable and should be reused

1. RevenueCat purchase and restore flow
2. Premium status lookup with `getProState()`
3. GPS route capture in active walks
4. Local session summary/streak aggregation
5. Sunrise/sunset bonus computation

## Exact order of implementation

## Phase 1: Stabilize premium foundations

1. Freeze the billing contract around the existing `pro` entitlement
2. Add a single premium-access helper layer so all premium gates read from one place
3. Decide whether route capture remains free while route library/history becomes premium

## Phase 2: Session sync and source-of-truth cleanup

1. Add Firestore write path for `users/{uid}/sessions/{sessionId}`
2. Add read path with local fallback
3. Add sync-state handling for offline writes
4. Update Firestore rules only if new collections are introduced

## Phase 3: GPS route saving as a true premium feature

1. Keep local route capture as-is
2. Sync saved sessions with route points to Firestore
3. Add premium gating around unlimited saved routes and cross-device access
4. Keep free-plan limit logic only as a product rule, not a storage hack

## Phase 4: Monthly stats

1. Introduce `monthlyStats` model
2. Generate monthly aggregates from synced sessions
3. Add current-month and previous-month UI in `app/stats.tsx`
4. Gate monthly view as Premium

## Phase 5: Advanced streaks

1. Expand aggregate layer for monthly streak insights
2. Add milestone-driven streak callouts
3. Keep streak computation derived from sessions
4. Avoid duplicating streak truth in multiple places

## Phase 6: Badges and challenges

1. Define static badge catalog
2. Define static evergreen challenge catalog
3. Add unlock evaluation after session completion
4. Persist earned badges and challenge progress
5. Surface progress in Stats, Profile, and Home

## Phase 7: Guided audio walks

1. Add guided audio content model
2. Add player screen and playback state
3. Track completion/progress
4. Gate access with the existing `pro` entitlement

## Phase 8: QA and launch hardening

1. Validate subscription transitions from free to Premium
2. Validate offline walk completion then later cloud sync
3. Validate long GPS sessions and large route point payloads
4. Validate monthly stats on real seeded data
5. Validate badge/challenge unlock determinism
6. Validate audio interruptions, backgrounding, and resume

## Suggested V1 cut if timeline gets tight

If we need the leanest shippable Premium V1:

Ship first:

1. GPS route saving with cloud sync
2. Sunrise/sunset bonuses
3. Advanced streak metrics
4. Monthly stats

Delay if needed:

1. Guided audio walks
2. Premium badges/challenges

This app already has enough premium foundation to ship a credible V1 without audio and badges on day one. The biggest architectural gap is not billing. It is the lack of remote session sync and a durable premium data layer behind the existing local walk/streak experience.
