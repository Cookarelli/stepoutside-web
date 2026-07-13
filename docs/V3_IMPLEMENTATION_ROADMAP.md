# Step Outside V3.0 Implementation Roadmap

Roadmap date: 2026-07-12  
Source documents: `docs/V3_PRODUCT_VISION.md` and `docs/V3_TECHNICAL_AUDIT.md`  
Target branch: `step-outside-v3.0`

## Roadmap intent

Step Outside V3.0 will evolve the existing individual outdoor habit app into a community-driven outdoor wellness platform. The migration is additive: current users must retain their accounts, activities, streaks, routes, reflections, friendships, Premium access, and individual navigation throughout the rollout.

The product hierarchy remains:

1. Community
2. Connection
3. Nature
4. Movement
5. Health

Community becomes more visible without making participation mandatory. The personal activity loop remains complete for users who have no friends, group, team, or employer in Step Outside.

## Delivery guardrails

- Do not rewrite the Expo application or replace Firebase/RevenueCat during V3 delivery.
- Do not change production bundle identifiers, Expo project ID, URL scheme, Firebase project, RevenueCat entitlement/product identifiers, or EAS build-number ownership as part of feature work.
- Do not rewrite existing `users/{uid}`, session, friendship, V1 challenge, or leaderboard documents in place.
- Add versioned collections and fields; backfill with idempotent tools; retain read compatibility until rollout is proven.
- Commit completed activities locally before optional social/cloud work. Community failures must never block an individual walk from saving.
- Never copy raw GPS routes, reflection text, email addresses, or precise location into group, leaderboard, employer, or analytics data.
- Every community surface must support an empty/solo state and an opt-out path.
- Every major surface ships behind a remotely controlled feature flag and kill switch.
- Use bounded lists and purposeful summaries. V3 will not introduce infinite scrolling or attention-maximizing engagement loops.
- Advance phases only after the preceding phase's acceptance gate passes on signed iOS and Android builds.

## Shared measurement principles

DAU and retention should be derived from privacy-safe app/session activity, not from repeated engagement prompts. Analytics properties must use enumerations, counts, booleans, and coarse buckets rather than email, username, reflection text, route coordinates, company name, or raw Firebase document IDs.

The baseline KPI framework is:

- **DAU/WAU/MAU:** unique users with an app session or completed outdoor activity.
- **Retention:** D1, D7, D30 return after first authenticated session and after first completed activity.
- **Core value:** activity starts, valid completions, completion-save success, weekly active outdoor days.
- **Social participation:** friend connection, group membership, challenge enrollment/completion, encouragement given/received.
- **Community value:** percentage of active users who see shared progress and subsequently complete an outdoor activity, without increasing excessive in-app time.
- **Corporate pilot value:** eligible employees joined, weekly active participants, aggregate activity participation, and challenge completion—not individual route or reflection surveillance.

## Phase dependency map

`Phase 1 Stability → Phase 2 Social Home → Phase 3 Groups/Teams → Phase 4 Trusted Rankings/Challenges → Phase 5 Corporate Pilot → Phase 6 Campfire Community`

Phase 2 may display existing friends, V1 challenge invitations, and existing leaderboard data. Team and organization modules remain hidden or show an honest “not joined” state until Phase 3 provides real membership records. Phase 5 must reuse Phase 3 group/membership primitives and Phase 4 scoring; it must not create a parallel corporate application.

---

## PHASE 1 — Stability and Foundation

**Estimated relative complexity: XL**

### Goal

Create a production-safe V3 baseline by fixing verified authentication, navigation, data-isolation, permission, reminder, activity, streak, entitlement, and observability issues. Preserve every current user and record while establishing test, feature-flag, and trusted-backend foundations for later phases.

### User stories

- As a returning user, I remain signed in after a cold launch and reach the correct profile, onboarding, active-walk, or home route.
- As a user with multiple accounts on one device, I never see another account's activities, drafts, saved routes, onboarding state, or Premium fallback state.
- As a walker, my activity saves locally even when Firebase, RevenueCat, weather, or leaderboard services are slow or unavailable.
- As a walker, my streak remains correct before I have walked today and across midnight, timezone, and daylight-saving boundaries.
- As a walker, the app accurately explains foreground-only tracking and safely restores a paused or interrupted walk.
- As a user, location and notification permissions are requested in context and denial leaves a usable timer-only experience.
- As a user, reminders reflect whether I actually need a nudge and do not erase unrelated scheduled notifications.
- As a user, authenticated deep links cannot bypass account, ownership, or parameter checks.
- As a Premium customer, purchase/restore state remains tied to my RevenueCat identity on iOS and Android.
- As a privacy-conscious user, my email and raw location history are not exposed through social discovery or analytics.

### Database changes

- Add additive `schemaVersion` fields to new/updated user, session-summary, discovery, and social documents; do not require immediate backfill for legacy reads.
- Remove `emailLower` from broadly readable `userDiscovery/{uid}` documents through a staged client/rule/data migration.
- If exact email discovery remains a product requirement, introduce a server-only lookup mechanism such as `privateEmailLookup/{normalizedHash}` with no client list/read access, explicit consent, and throttled callable access.
- Add the two missing `friendChallenges` composite indexes for sender/created date and receiver/created date.
- Add versioned Firebase Storage rules for `profilePhotos/{uid}/avatar.jpg`; do not enable new photo UI yet.
- Introduce an idempotent local sync/outbox model for noncritical session cloud sync, friend activity summary refresh, and ranking refresh. Keep existing per-user session keys intact.
- Scope cached Premium state by authenticated UID/RevenueCat app user ID while retaining a safe migration path from `@stepoutside/proState`.
- Add no group, organization, or V3 challenge production data in this phase beyond disabled development fixtures/emulator data.

### Security-rule changes

- Version and deploy owner-only Storage rules; deny all unmatched paths.
- Remove authenticated-list access to user email data.
- Add strict field lists, immutable ownership, type/length bounds, timestamp sanity, and route-point size bounds to session, reflection, discovery, friend summary, and leaderboard-compatible writes without rejecting valid legacy documents.
- Add route/rule tests for owner and cross-user access to profiles, sessions, reflections, active social documents, and Storage objects.
- Keep current V1 friendship/challenge access semantics compatible while adding declared indexes.
- Prepare a deny-by-default server-only namespace for future aggregate documents.
- Do not use Premium status as a group/security role.

### Screens and components

- Add a central authenticated route-group guard and typed route-parameter validators.
- Preserve the current Home, Stats, Steps, Profile, Walk, Complete, Reflection, Share, Friends, Challenges, Leaderboard, and Pro screens visually unless a stability fix requires a small change.
- Correct foreground/background tracking copy and restoration states in Walk.
- Correct streak presentation everywhere through one shared streak service.
- Add contextual permission education and denied/retry states for location and notifications.
- Correct platform-specific Maps and subscription-management links/copy.
- Consolidate Auth/Profile authentication orchestration behind a shared tested module without redesigning either screen.
- Add a nonblocking sync-status/error mechanism that never prevents completion.
- Add production crash reporting while retaining the existing friendly error boundary.
- Add a feature-flag provider with safe defaults and a local developer override.

### Analytics events

Retain existing event names where dashboards depend on them and add a version/property rather than silently renaming. Add:

- `app_session_started` — source, authenticated boolean, app version, platform.
- `auth_state_resolved` — signed-in boolean, provider category, duration bucket, outcome.
- `auth_persistence_checked` — outcome and platform.
- `onboarding_started`, `onboarding_step_viewed`, `onboarding_completed`, `onboarding_skipped`.
- `activity_start_attempted`, `activity_started`, `activity_paused`, `activity_resumed`, `activity_stop_attempted`.
- `activity_local_save_completed`, `activity_cloud_sync_completed` — outcome, source, duration/distance buckets, never coordinates.
- `activity_recovery_attempted` — outcome and prior phase.
- `streak_viewed` — streak bucket, not raw history.
- `permission_prompt_viewed`, `permission_result` — permission type, result, platform.
- `reminder_preference_changed`, `reminder_scheduled`, `reminder_opened` — reminder type and outcome.
- `deep_link_opened` — allowlisted route category and validation outcome, no raw URL/token.
- `premium_identity_synced`, `premium_state_loaded` — source (`live`/`cache`), outcome, plan category.
- `friends_list_viewed`, `friend_search_completed`, `friend_request_sent`, `friend_request_responded` — outcome and relationship state only.
- `challenge_list_viewed`, `challenge_invite_sent`, `challenge_invite_responded` — V1 challenge type/status and outcome, no raw challenge ID.
- `leaderboard_viewed` — current V1 scope/period, rank bucket, load outcome.
- `sync_queue_result`, `app_error_recovered`, and crash-free session reporting through the crash provider.

These events establish DAU, activity retention, save reliability, auth health, and permission funnels before social redesign changes behavior.

### Test requirements

- Unit tests for streak behavior today/yesterday, midnight, DST, timezone changes, Golden Hour streaks, and summary migration.
- Unit tests for every user-scoped AsyncStorage key, Premium-cache migration, onboarding flags, and sign-out/sign-in transitions.
- Integration tests for email/Google auth, cold launch, profile gating, password reset, and RevenueCat identity changes.
- Walk state-machine tests for start, timer-only, GPS, pause, resume, leave, restore, process kill, too-short activity, duplicate completion, offline completion, and retry.
- Firestore Emulator tests for every current collection with owner, friend, participant, stranger, unauthenticated, malformed, and oversized cases.
- Storage Emulator tests for owner upload/read/delete and cross-user denial.
- Deep-link tests for unauthenticated routes, malformed activity IDs, invalid invites, and ownership failures.
- Notification tests for permission denial, quiet hours, completed-today suppression, schedule refresh, and unrelated-notification preservation.
- Signed iOS TestFlight and Android internal-build smoke tests for Auth, Firebase Analytics, RevenueCat purchase/restore, maps, notifications, and location.
- CI must run Expo lint, TypeScript, unit tests, Firebase rule tests, Expo Doctor, and build configuration validation.

### Acceptance criteria

- Existing production users upgrade without losing Auth identity, sessions, summary, routes, reflections, friends, or Premium entitlement.
- Cross-account device tests show no leakage of activity, drafts, saved suggestions, onboarding state, or cached Premium status.
- Valid activities complete locally within a defined UI latency budget even with all remote services blocked.
- Streak results match the approved definition across the complete date/time test matrix.
- The app no longer claims background GPS behavior that it does not implement.
- Current Firestore and Storage access has automated negative tests and a reproducible deployment manifest.
- Discovery documents no longer expose normalized emails to general authenticated reads.
- All deep-linked protected routes resolve through Auth/ownership/parameter guards.
- Crash reporting identifies app version/release without collecting reflection or route content.
- DAU, D1/D7/D30, activity completion, challenge baseline, and social baseline dashboards can be populated from privacy-safe events.
- Signed iOS and Android release-candidate smoke suites pass before Phase 2 is enabled.

### Dependencies

- Product decisions for streak grace semantics, foreground-only tracking copy, email discovery, route retention after Premium expiry, data deletion, analytics consent, and notification behavior.
- Access to Firebase rules/index deployment, Storage configuration, RevenueCat dashboards, EAS environments, Apple/Google OAuth credentials, and analytics/crash dashboards.
- A selected feature-flag service and crash-reporting provider.
- A stable Git/release workflow separating mobile and website validation responsibilities.

### Risks

- Tightening rules can reject legacy client payloads if compatibility tests are incomplete.
- Auth persistence changes can create duplicate initialization or sign-out regressions.
- Moving remote work behind a queue can produce stale social summaries unless retry/idempotency is correct.
- Analytics expansion can create privacy or dashboard noise if event governance is weak.
- Platform credentials may differ from repository assumptions and require signed-build investigation.

---

## PHASE 2 — Social Home Experience

**Estimated relative complexity: L**

### Goal

Evolve Home into a concise personal-plus-community launch point while preserving immediate access to starting an activity, personal streaks, individual stats, route suggestions, and Premium value. Surface meaningful shared progress without creating a feed.

### User stories

- As an individual user, I still see my streak, progress, and Start Walk action first, even if I have no social connections.
- As a connected user, I can see how many friends were active today without seeing their private routes.
- As a challenge participant, I can see my current challenge invitations/status and open the relevant screen.
- As a group/team member, I can see my primary membership once Phase 3 data exists.
- As a leaderboard participant, I can see my current position with the scope and period clearly labeled.
- As a user, I receive one bounded set of positive encouragement/recent activity signals and then a clear prompt to go outside.
- As a user who opts out of social visibility, Home remains complete and does not pressure me to join.

### Database changes

- Add an owner-readable `homeSnapshots/{uid}` or `users/{uid}/privateViews/home` document maintained by trusted code.
- Snapshot fields may include personal summary reference/version, friends-active-today count, bounded recent encouragement/activity summary, current V1/V3 challenge summary, primary membership summary, and ranking summary.
- Store only derived fields needed for Home; do not store raw routes, precise locations, reflection text, emails, or an unbounded activity list.
- Include `generatedAt`, `schemaVersion`, and source freshness markers.
- Until Phase 3, group/team membership fields are empty; the UI must not fabricate membership.
- Keep current Home reads as a fallback while the snapshot path is monitored.

### Security-rule changes

- Only the authenticated owner may read `homeSnapshots/{uid}`.
- Clients cannot write snapshot counts, ranking, membership, or friend activity fields.
- Trusted backend code writes snapshots after verifying relationships and visibility preferences.
- Rules must prevent one user's home snapshot from embedding another user's private details beyond approved display summary fields.

### Screens and components

- Create `PersonalProgressHero` with Start Walk, current streak, weekly progress, and individual fallback states.
- Create `CommunityAtAGlance` with a fixed maximum number of modules/cards, not a scrolling feed.
- Create cards for Friends Active Today, Current Challenges, Primary Group/Team, Leaderboard Position, and Recent Encouragement.
- Add clear empty states: “Your individual progress is ready,” “Invite a friend,” or “No current challenge,” without blocking the main CTA.
- Retain current daily spark/positive copy and nearby reset entry.
- Keep the existing Home behind a kill switch; roll out the social Home through an experiment/feature flag.
- Add bounded skeleton, stale-data, offline, privacy-hidden, and error states.
- Team/organization cards remain hidden or honest empty states until Phase 3 membership data exists.

### Analytics events

- `home_version_viewed` — old/new variant and social eligibility.
- `home_module_impression` — module enum, state (`populated`/`empty`/`hidden`/`stale`).
- `home_module_opened` — module enum and destination category.
- `home_start_activity_tapped` — home variant and social-module exposure boolean.
- `friends_active_summary_viewed` — count bucket only.
- `current_challenge_summary_viewed` — invitation/active state and challenge type, no challenge ID.
- `membership_summary_viewed` — group type and role category only once Phase 3 is active.
- `leaderboard_position_viewed` — scope, period, rank bucket, opt-in state.
- `encouragement_summary_viewed` and `encouragement_cta_tapped`.
- `home_snapshot_load_result` — outcome, freshness bucket, latency bucket.

### Test requirements

- Component tests for every module's populated, empty, hidden, loading, stale, offline, and error state.
- Navigation tests verifying every card resolves to a guarded canonical route.
- Snapshot security tests proving owner-only access and trusted-only writes.
- Regression tests proving Start Walk, personal streak, Stats, Steps, Profile, and Premium links remain accessible.
- Snapshot contract tests against V1 friends/challenges/leaderboards and future empty V3 fields.
- Performance tests on low-end Android and older supported iPhone hardware for cold Home and tab return.
- Experiment tests ensuring kill-switch rollback restores the current Home without data migration.
- Accessibility tests for card order, labels, dynamic text, and reduced motion.

### Acceptance criteria

- Individual-only users retain a complete Home with no broken or misleading social modules.
- Start Walk remains visible without scrolling and its conversion does not materially regress against baseline.
- Home contains a fixed, bounded number of community summaries and no infinite list.
- Friend activity is shown only as allowed derived data; no route/location leakage occurs.
- Existing users can switch back to the current Home instantly through the remote kill switch.
- Snapshot load failure falls back to personal progress rather than blocking the screen.
- DAU, activity-start conversion, social-module participation, and session-duration guardrail metrics are available by Home variant.

### Dependencies

- Phase 1 Auth persistence, route guards, analytics governance, crash reporting, feature flags, trusted backend skeleton, and social privacy cleanup.
- Approved Home information hierarchy and maximum module count.
- Agreed freshness SLA for friend/challenge/rank summaries.
- Phase 3 membership contracts for activating team/organization modules later.

### Risks

- Moving social content too high can reduce the clarity of the core Start Walk action.
- Snapshot data can become stale or expensive if regenerated too often.
- Existing client-authored leaderboard data should be labeled as provisional until Phase 4 trusted scoring is active.
- “Friends active today” can reveal behavior users did not expect unless visibility defaults are explicit.
- Home complexity can increase app-open latency and screen time; both need guardrail monitoring.

---

## PHASE 3 — Groups and Teams

**Estimated relative complexity: XL**

### Goal

Introduce one reusable, privacy-first group system for personal friend groups, families, communities, and workplace teams. Create durable invitations, roles, membership visibility, and bounded group summaries without splitting the product into consumer and corporate architectures.

### User stories

- As a user, I can create a private friend or family group and invite people I know.
- As a community organizer, I can create an invite-only community group with clear membership rules.
- As a workplace participant, I can join a workplace team without exposing personal routes or reflections.
- As an invitee, I can understand the group, inviter, visibility, and data-sharing terms before joining.
- As a group owner, I can assign an admin, remove a member, transfer ownership, and close the group safely.
- As a member, I can leave a group and control whether my name, activity summary, and leaderboard eligibility are visible.
- As a member, I can view a bounded group activity summary and member list appropriate to my role.
- As an individual-only user, I can ignore groups without losing any existing app capability.

### Database changes

- Add `groups/{groupId}` with `schemaVersion`, type (`friends`, `family`, `community`, `workplace_team`), name, owner UID, visibility, timezone, status, created/updated server timestamps, and privacy-policy version.
- Add `groupMemberships/{groupId_uid}` with UID, group ID, role (`owner`, `admin`, `member`), status (`invited`, `active`, `left`, `removed`), visibility preferences, joined/invited timestamps, and version.
- Add `groupInvites/{inviteId}` with opaque token hash, group, inviter, optional intended UID, status, expiry, max uses, and server timestamps. Do not put raw invite tokens in Firestore documents readable by clients.
- Add trusted `groupSummaries/{groupId_period}` or a group subcollection containing aggregate active-member count, activity count, minutes/distance buckets, consistency, and freshness.
- Add `blocks/{ownerUid_blockedUid}` and `reports/{reportId}` before enabling community-group invitations.
- Add `groupAuditEvents/{eventId}` for owner/admin membership and role changes where operational history is needed.
- Add indexes for memberships by UID/status, memberships by group/status/role, invites by group/status/expiry, and summaries by group/period.
- Do not migrate V1 friendships into groups automatically. Offer explicit optional creation from a friend circle later.

### Security-rule changes

- Define helpers for active membership, group owner, group admin, blocked relationship, and visibility.
- Owners/admins can manage allowed group metadata and membership actions; only owners can transfer ownership or close a group.
- Members can read only groups they actively belong to unless a deliberately public preview is introduced later.
- Members can update only their own visibility/preferences and leave status; they cannot promote themselves.
- Invite redemption, role changes, removal, ownership transfer, and summary generation occur through trusted server transactions.
- Workplace/team membership must not grant access to private `users/{uid}`, sessions, routes, or reflections.
- Group summaries contain derived aggregate fields only; raw user activities remain owner-only.
- Blocked users cannot invite, discover, or interact with each other through group paths.
- Add emulator tests for every group type, role, status transition, block, and cross-group access attempt.

### Screens and components

- Add a first-class but feature-flagged Community destination or Community entry from Home/Profile during initial rollout.
- Create Group List with individual empty state and clear group-type labels.
- Create Group Detail with bounded summary, members, current challenge placeholder, privacy status, and management entry.
- Create Group Creation flow with type, name, visibility, timezone, expectations, and confirmation.
- Create Invite flow for link/code creation, share, preview, accept, decline, expiry, and invalid/revoked states.
- Create Membership/Role management for owner/admin/member with safeguards and ownership transfer.
- Create Group Privacy controls for display name, activity-summary participation, leaderboard opt-in, encouragement, and employer visibility.
- Add group/team membership card activation to Social Home.
- Reuse existing profile/friend identity components where safe; do not expose email search or route details.

### Analytics events

- `community_surface_viewed` — entry source and membership count bucket.
- `group_creation_started`, `group_created` — group type and visibility, no name.
- `group_invite_created`, `group_invite_opened`, `group_invite_accepted`, `group_invite_declined`, `group_invite_failed` — group type and failure category.
- `group_viewed` — group type, role, member-count bucket, summary freshness.
- `group_member_role_changed` — actor role/target role categories, no UID.
- `group_member_removed`, `group_left`, `group_closed`.
- `group_privacy_updated` — setting category and enabled boolean.
- `group_summary_viewed` — period and aggregate participation bucket.
- `block_created`, `report_submitted` — reason category only.

### Test requirements

- Unit tests for group type, membership state machine, invite expiry/use limits, role transitions, ownership transfer, visibility resolution, and block behavior.
- Firestore Emulator tests for every role and cross-group/cross-user denial.
- Trusted-function integration tests for create, invite, redeem, revoke, leave, remove, promote, transfer, close, and idempotent retries.
- Deep-link tests for valid, expired, revoked, reused, tampered, blocked, signed-out, and wrong-account invitations.
- Migration/compatibility tests proving V1 friends, requests, challenges, sessions, and leaderboards remain unchanged.
- UI tests for individual empty states, maximum group limits, accessibility, offline/stale summaries, and role-specific controls.
- Load tests for large-but-supported group membership and summary generation.
- Privacy review verifying employer/community roles cannot read private profile/session/reflection paths.

### Acceptance criteria

- Users can create and join each supported group type through an explicit invitation and consent flow.
- Every active group has exactly one owner; ownership cannot be orphaned during leave/removal.
- Role and membership transitions are server-authoritative, idempotent, audited where required, and rule-tested.
- Group members see only the visibility-approved identity and derived summary information.
- Raw GPS routes, reflections, emails, and private activity documents never appear in group records.
- Block/report controls exist before community groups leave internal testing.
- Users with zero groups retain the complete individual experience and no persistent upsell pressure.
- Phase 2 membership modules activate from real records and remain hidden/empty otherwise.
- Consumer-group pilot metrics and support outcomes meet the release threshold before Phase 4 competitive features expand.

### Dependencies

- Phase 1 trusted backend, route guards, data isolation, Storage/rule tests, feature flags, and account deletion/retention decisions.
- Phase 2 Social Home module contracts.
- Legal/product definitions for group privacy, minors/family use, workplace consent, moderation, group limits, and data retention.
- Transactional email/link delivery or a secure share-code strategy.
- Support/admin tooling for invite and membership recovery.

### Risks

- Membership rules are easy to over-broaden and could expose cross-group data.
- Family groups may imply minors/guardian requirements that exceed the initial product's legal scope.
- Public community discovery creates moderation and abuse risk; initial launch should remain invite-only.
- Organization and consumer terminology can fragment the model if group types gain special-case code.
- Large groups can make member reads and summary regeneration expensive without explicit limits.

---

## PHASE 4 — Leaderboards and Challenges

**Estimated relative complexity: XL**

### Goal

Replace client-trusted competition with fair, server-authoritative, opt-in challenges and leaderboards across friends, groups, companies, departments, and teams. Reward consistency and shared progress without shame, surveillance, or unsafe competition.

### User stories

- As a user, I can compare progress with friends only after opting into visibility.
- As a group member, I can view a group leaderboard using clearly explained scoring.
- As an employee, I can join company or department/team rankings without sharing routes or reflections.
- As a challenge creator with permission, I can choose weekly, monthly, or bounded custom dates and an approved goal type.
- As a participant, I can see eligibility, scoring, privacy, progress, and end date before joining.
- As a participant, I can track my contribution and the group's shared progress.
- As a lower-volume participant, I can still contribute through consistency, participation, or personal-improvement scoring.
- As a user, suspicious or invalid activities do not distort rankings, and I can report a concern.
- As a user who opts out, my activities remain personal and I do not appear in shared rankings.

### Database changes

- Add `challengesV3/{challengeId}` with creator/scope, group or organization reference, approved metric, target, scoring version, timezone, start/end server timestamps, enrollment window, visibility, status, and version.
- Add `challengeParticipants/{challengeId_uid}` with opt-in state, team/department reference where applicable, privacy snapshot, progress, completion, eligibility, and timestamps.
- Add immutable/idempotent `activityContributions/{challengeId_activityId_uid}` derived by trusted code from owner activities. Store only minimum metrics, eligibility result, scoring version, and coarse validation flags—never raw routes.
- Add `rankingSnapshots/{scopeId_period_metric}` plus paged ranking rows or subcollections generated by trusted aggregation.
- Add `scoringPolicies/{version}` for auditable caps, normalization, minimum duration, valid activity sources/types, tie-breaking, and suspicious-activity treatment.
- Add `challengeAuditEvents` for lifecycle/scoring corrections where needed.
- Retain V1 `friendChallenges` and `leaderboardEntries` read compatibility; label them legacy and stop expanding their schema.
- Add indexes for challenge scope/status/date, participant UID/status, contributions by challenge/participant, and snapshot scope/period.

### Security-rule changes

- Clients may create requests through callable/trusted operations but cannot write contribution totals, ranks, completion, winners, or lifecycle timestamps.
- Only eligible scope admins can create/manage group/company/team challenges.
- Participants can read a challenge only when visibility/membership permits and can update only allowed opt-in/privacy fields through trusted transitions.
- Ranking reads require active membership and participant visibility for private scopes.
- Opted-out users are absent from ranking rows and named participation reports.
- Enforce server-only writes to scoring policies, contributions, ranking snapshots, and final results.
- Validate that an activity contribution belongs to the same UID and eligible time window without exposing the owner activity document to other members.
- Add rule tests for cross-scope access, opt-out, former members, removed members, blocked users, and administrators.

### Screens and components

- Upgrade Friends Leaderboard to trusted snapshots while preserving the current screen during migration.
- Add reusable Leaderboard Scope selector: Friends, Group, Company, Department/Team.
- Add ranking explanation, opt-in state, privacy indicator, rank bucket/personal card, shared-progress modes, and bounded pagination.
- Add Challenge List with invitations, active, completed, and archived sections.
- Add Challenge Detail with rules, dates, privacy, participants, personal contribution, team progress, and results.
- Add Challenge Creation for authorized group/org roles using approved templates and custom bounded periods.
- Add Challenge Join/Leave and visibility consent flow.
- Add fair-scoring education and suspicious-activity/report flow.
- Connect current-challenge and ranking cards on Social Home to canonical details.
- Avoid celebratory patterns that shame lower ranks; emphasize contribution, consistency, and collective milestones.

### Analytics events

- `leaderboard_viewed` — scope, period, metric, opt-in state, rank bucket.
- `leaderboard_scope_changed`, `leaderboard_period_changed`, `leaderboard_load_result`.
- `leaderboard_opt_in_changed` — scope category and state.
- `challenge_creation_started`, `challenge_created` — scope, metric, period type, scoring version.
- `challenge_viewed`, `challenge_joined`, `challenge_declined`, `challenge_left` — scope/metric, no raw ID.
- `challenge_progress_viewed` — progress bucket and individual/team mode.
- `challenge_contribution_processed` — eligibility/outcome category and metric bucket, server-side.
- `challenge_completed` — completion/result category and contribution bucket.
- `scoring_rules_viewed`, `activity_flagged`, `challenge_report_submitted`.
- `social_activity_started_after_prompt` — originating module category, measured without route/location content.

### Test requirements

- Unit/property tests for every scoring policy, cap, tie-breaker, timezone boundary, period type, opt-out rule, and activity eligibility case.
- Idempotency tests proving duplicate sync/retry cannot duplicate contributions.
- Server integration tests for activity ingestion, challenge lifecycle, scheduled start/expiry/finalization, recomputation, and correction.
- Security tests for each leaderboard scope, membership role, opt-out state, former member, and cross-company attempt.
- Anti-cheating tests for impossible duration/distance/pace, clock manipulation, duplicate activities, edited payloads, and replayed requests.
- Migration tests comparing legacy friends leaderboard display with trusted snapshots during dual-read rollout.
- Scale tests for supported company/group sizes and simultaneous challenge finalization.
- UI/accessibility tests for rank display, no-data, tie, hidden user, stale snapshot, and scoring explanation.
- Product safety tests verifying lower ranks are not shamed and collective/consistency modes work.

### Acceptance criteria

- All new shared ranks and challenge progress are server-generated from idempotent eligible contributions.
- Clients cannot author their own aggregate score or final result.
- Friends, group, company, and team scopes enforce membership and opt-in visibility.
- Weekly, monthly, and bounded custom periods behave consistently in the scope timezone.
- Scoring policy is visible, versioned, test-covered, and supports inclusive participation modes.
- Opt-out removes a user from named ranking views without deleting personal activities.
- V1 challenge/ranking history remains readable until a separately approved retirement plan.
- Anti-cheating safeguards flag/exclude invalid activity without blocking legitimate personal activity saving.
- Home and Community links use canonical challenge/leaderboard routes and bounded data.

### Dependencies

- Phase 1 reliable activity IDs/sync, analytics, trusted backend, feature flags, and route guards.
- Phase 3 groups, memberships, roles, privacy, blocks/reports, and summaries.
- Product-approved scoring policies, supported activity types, challenge limits, timezone rules, and dispute handling.
- Scheduled backend jobs and operational tooling for recomputation/support.
- Legal/privacy approval for workplace ranking visibility.

### Risks

- Competitive mechanics can undermine wellness positioning or discourage lower-activity users.
- Client GPS/activity data remains imperfect; safeguards must avoid punishing legitimate users.
- Aggregation/recomputation can create cost spikes at period boundaries.
- Dual legacy/trusted leaderboards can confuse users if labels and rollout are unclear.
- Company rankings can create employment/privacy concerns without explicit opt-in and aggregate alternatives.

---

## PHASE 5 — Corporate Wellness Pilot

**Estimated relative complexity: L, assuming Phases 3–4 are complete; otherwise XL**

### Goal

Pilot privacy-safe corporate wellness using the same group, membership, challenge, and ranking architecture already proven with consumer groups. Provide basic administration and aggregate participation reporting without exposing employee routes, reflections, precise locations, or private health profiles.

### User stories

- As an authorized pilot administrator, I can create an organization and configure basic privacy/participation settings.
- As an administrator, I can create departments or teams and generate expiring invitation codes.
- As an employee, I can review what will be shared, join voluntarily, select a team, and opt into challenges/rankings.
- As an employee, I can leave the organization or opt out of named visibility while keeping my personal Step Outside history.
- As an administrator, I can create corporate challenges from approved templates.
- As an employee, I can view company and team progress and leaderboards according to consent settings.
- As an administrator, I can see aggregate participation trends without viewing individual routes, reflections, or precise activity times.
- As the product team, we can measure pilot activation, participation, retention, and support issues safely.

### Database changes

- Add `organizations/{organizationId}` with display metadata, owner/admin references, status, timezone, policy/consent version, reporting thresholds, and server timestamps.
- Link workplace groups to `organizationId`; represent departments/teams through the existing group model with explicit organization scope rather than a separate scoring engine.
- Add `organizationMemberships/{organizationId_uid}` when organization-wide membership differs from team membership; store role (`owner`, `admin`, `participant`), status, consent version, and timestamps.
- Add `organizationInvites/{inviteId}` with hashed expiring code/token, allowed use count/domain policy, inviter, optional team assignment, status, and audit fields.
- Add `organizationReports/{organizationId_period}` containing privacy-thresholded aggregates: eligible count, joined count, active participant count, participation rate, activity/challenge aggregate buckets, and freshness.
- Add `organizationAuditEvents` for admin, invite, team assignment, consent, and reporting actions.
- Reuse Phase 4 challenges, participants, contributions, and ranking snapshots with organization/team scope.
- Do not add employee route, reflection, diagnosis, biometric, or precise-location fields.

### Security-rule changes

- Organization creation and administrative mutations use trusted server operations.
- Organization admins can read organization metadata, memberships needed for administration, audit records appropriate to their role, and thresholded reports.
- Admins cannot read employee `users/{uid}/sessions`, routes, reflections, personal friend graph, or private Premium state.
- Aggregate reports suppress small cohorts below an approved privacy threshold.
- Employees control challenge/ranking opt-in and named visibility; employment membership alone does not imply consent.
- Invite codes are verified server-side, rate-limited, expiring, revocable, and never stored in readable plaintext.
- Team/department managers receive only the minimum permissions explicitly approved for the pilot.
- Add emulator tests for cross-organization denial, small-cohort suppression, former employee access, admin demotion, and consent withdrawal.

### Screens and components

- Add Organization Creation for approved pilot admins only.
- Add Employee Join flow: code entry/deep link, organization preview, privacy disclosure, consent, optional team selection, and confirmation.
- Add Organization/Team switcher within Community, not as a replacement for personal Home.
- Add Company and Team Leaderboard scopes using Phase 4 components.
- Add Corporate Challenge templates and creation controls for admins.
- Add a basic administrator dashboard for organization setup, teams, invites, challenge status, participation summary, and report period.
- Add privacy-safe Participation Report view with thresholds and explanatory definitions.
- Add membership/consent/leave controls for employees.
- Prefer a responsive authenticated web/admin surface only if mobile administration is insufficient; share backend contracts rather than forking data logic.

### Analytics events

- `organization_creation_started`, `organization_created` — pilot cohort key, not organization name.
- `organization_invite_created`, `organization_code_redeemed`, `organization_join_failed` — failure category and team-assignment boolean.
- `organization_privacy_viewed`, `organization_consent_updated` — policy version and state.
- `organization_joined`, `organization_left`, `organization_team_selected`.
- `admin_dashboard_viewed`, `admin_team_created`, `admin_challenge_created`.
- `participation_report_viewed` — period, cohort-size bucket, suppression state.
- `corporate_leaderboard_viewed`, `corporate_challenge_joined`, `corporate_challenge_completed`.
- Pilot funnel events: invited → previewed → consented → joined → first activity → first challenge → week-4 retained.
- Server-side `pilot_aggregate_generated` and `pilot_aggregate_suppressed` events.

### Test requirements

- Organization/membership/invite/consent state-machine tests.
- Security tests for employee, team manager, organization admin, former member, outsider, and cross-organization access.
- Privacy-threshold tests including small cohorts, team splits, filtering, and consent withdrawal.
- Invite-code tests for expiry, revocation, brute-force throttling, maximum uses, wrong organization/team, and replay.
- End-to-end pilot flows from admin creation through employee join, activity contribution, challenge, leaderboard, report, opt-out, and leave.
- Report correctness tests against known aggregate fixtures without exposing individual records.
- Accessibility and responsive tests for admin/report screens.
- Operational tests for organization suspension, admin recovery, data export/deletion, and pilot shutdown.
- Legal/privacy review and pilot-specific threat model before external onboarding.

### Acceptance criteria

- Authorized admins can create/configure an organization, teams, invites, and challenges without direct database access.
- Employees receive clear consent and visibility choices before any workplace contribution.
- Company/team leaderboards and challenges reuse trusted Phase 4 scoring and opt-in rules.
- Admin reporting is aggregate-only, thresholded, and cannot reveal raw routes, reflections, precise timestamps, or hidden participants.
- Employees can opt out or leave without losing personal activities, streaks, friends, Premium access, or individual app functionality.
- Pilot activation, weekly participation, challenge completion, retention, report usage, support volume, and crash-free sessions are measurable.
- Pilot organizations can be disabled through flags without affecting consumer groups or individual users.

### Dependencies

- Completed and production-proven Phase 3 membership/privacy/role primitives.
- Completed Phase 4 server-authoritative challenge, contribution, ranking, opt-in, and anti-cheating systems.
- Corporate privacy terms, data-processing agreements, consent language, aggregate thresholds, retention policy, support process, and pilot success criteria.
- Approved pilot organizations and administrator identity-verification process.
- Operational/admin tooling and a support escalation path.

### Risks

- Corporate customers may request employee-level data that conflicts with product principles and privacy commitments.
- Small teams can make aggregate reporting re-identifiable without suppression.
- Invitation codes can be shared outside the intended organization.
- Employer-sponsored competition can feel coercive; opt-in and non-ranked participation must remain real choices.
- Admin scope can expand into a parallel product unless common group/challenge primitives remain mandatory.

---

## PHASE 6 — Campfire Community Experience

**Estimated relative complexity: L**

### Goal

Create a bounded, positive community ritual around daily reflection, outdoor discovery, photos, gratitude, and encouragement. The Campfire should help people feel connected and then return them to real life; it must not become an infinite social feed.

### User stories

- As a user, I can answer one daily outdoor reflection, gratitude, or discovery prompt.
- As a user, I can optionally share one outdoor photo with an approved group/circle after reviewing visibility.
- As a member, I can view a bounded set of recent Campfire entries from people who chose to share with my group.
- As a member, I can send a small set of positive encouragements without comments, arguments, follower counts, or popularity ranking.
- As a user, I can hide, report, or block content/people and control whether I participate.
- As a user, the Campfire has a natural end state and encourages me to put the phone away or step outside.
- As an individual user, I can keep reflections private and use the daily prompt without joining any community.

### Database changes

- Add `campfireEntries/{entryId}` with owner UID, optional group ID, prompt ID/version, content type (`reflection`, `gratitude`, `discovery`, `photo`), short bounded text, media reference, visibility, created server timestamp, expiry/archive state, and moderation state.
- Add `dailyPrompts/{promptId}` with prompt type, copy, active date/timezone strategy, version, and status.
- Add `encouragements/{entryId_senderUid_type}` with one idempotent reaction from an approved positive enum, sender, recipient, group, and server timestamp.
- Add `campfireDailyViews/{groupId_day}` or a trusted bounded query/view contract that returns a fixed maximum set without engagement ranking.
- Store media under `communityMedia/{ownerUid}/{entryId}` with processed derivatives; strip EXIF/location metadata before publication.
- Reuse Phase 3 blocks/reports and add moderation actions/audit records where required.
- Define retention and deletion behavior for text, media, encouragement, reports, and group departure.

### Security-rule changes

- Private reflections remain owner-only and separate from shared Campfire entries.
- Users may create only their own entry with bounded text/media fields and an active-group visibility they are entitled to use.
- Group entries are readable only by active members permitted by visibility and block rules.
- Media upload requires owner path, accepted type/size, and a pending state; only processed/approved media becomes readable to the intended audience.
- Encouragement types are allowlisted, idempotent, rate-limited, and available only to eligible active group members.
- No arbitrary comments, reshares, follower graphs, public popularity counts, or client-authored moderation state.
- Report/block enforcement applies before reads are returned.
- Trusted moderation can hide/remove content without exposing reporter identity.

### Screens and components

- Add Daily Prompt card usable privately from Home or Campfire.
- Add Create Entry flow with private-by-default visibility, group selector, short text, optional photo, preview, and explicit share confirmation.
- Add photo picker/camera integration only after Storage/media processing rules are proven.
- Add Campfire view with a fixed daily limit, chronological or intentionally rotated presentation, and a visible end state such as “That’s today’s campfire.”
- Add positive encouragement controls from a small approved set such as “Inspired,” “Thanks for sharing,” or “Let’s get outside.”
- Add report, block, hide, delete-own-entry, and visibility controls.
- Add a clear “Step outside” exit CTA and avoid pull-to-refresh loops, autoplay, streaks for posting, public like counts, and infinite loading.
- Keep private reflection after an activity intact; sharing is a separate explicit action.

### Analytics events

- `daily_prompt_viewed`, `daily_prompt_completed` — prompt type/version and private/shared outcome.
- `campfire_opened` — source, membership count bucket, available-entry bucket.
- `campfire_entry_started`, `campfire_entry_created`, `campfire_entry_deleted` — content type and visibility category, never text/media content.
- `campfire_photo_selected`, `campfire_media_processed` — outcome and coarse size/type bucket.
- `encouragement_sent`, `encouragement_received_opened` — approved type category.
- `campfire_end_reached` — entry-count bucket and elapsed-time bucket.
- `campfire_step_outside_tapped`.
- `campfire_content_hidden`, `campfire_report_submitted`, `campfire_block_created` — reason category only.
- Guardrail metrics: median Campfire session duration, repeated opens per day, report/block rate, and activity starts after Campfire.

### Test requirements

- Rule tests for private, group, blocked, former-member, hidden, removed, and reported content.
- Media tests for type/size rejection, EXIF removal, processing failure, thumbnail/original access, deletion, and orphan cleanup.
- Content-length and prompt-version validation tests.
- Encouragement tests for enum restriction, idempotency, rate limits, self-reaction policy, and blocked users.
- Bounded-query tests proving no infinite pagination and deterministic daily limits.
- End-to-end tests for private prompt, shared reflection, photo share, encouragement, report, block, delete, and group departure.
- Moderation queue/response tests before external rollout.
- Accessibility tests for media alt text/caption behavior, screen reader ordering, and reduced motion.
- Product tests confirming no public counts, comments, follow graph, posting streak, autoplay, or endless scroll is introduced.

### Acceptance criteria

- Users can complete the daily prompt privately without community membership.
- Shared entries require explicit audience selection and never include EXIF coordinates or raw activity routes.
- Campfire displays a fixed bounded set with a clear end state and no infinite scrolling.
- Interactions are limited to approved positive encouragement plus safety controls.
- Blocking/reporting is effective immediately in reads and moderation operations are auditable.
- Private reflections are never shared automatically.
- Campfire usage does not materially increase excessive screen time and shows a positive relationship with outdoor activity starts/completions.
- The entire Campfire surface can be disabled without affecting Home, activity tracking, groups, challenges, or corporate pilots.

### Dependencies

- Phase 1 secured Storage, crash reporting, analytics governance, feature flags, route guards, and deletion/retention behavior.
- Phase 3 memberships, privacy controls, blocks, reports, and moderation roles.
- Production-ready media processing/moderation service and operational review process.
- Approved prompt library, content policy, encouragement vocabulary, community guidelines, and retention rules.
- Legal review for photo/content sharing and any age eligibility requirements.

### Risks

- Photo sharing creates moderation, copyright, safety, and sensitive-location risks.
- A bounded community ritual can drift into an addictive feed if ranking, counts, or refresh mechanics are added later.
- Positive-only reactions can still be abused without rate limits and blocking.
- Daily prompts can feel like another obligation if tied to posting streaks or notifications.
- Media storage and moderation costs can grow quickly without limits and retention policies.

---

## V3 release gates and safest rollout path

1. **Stabilize first:** complete Phase 1 and prove cold launch, data isolation, activity completion, streak accuracy, purchases, rules, and crash visibility on signed iOS and Android builds.
2. **Observe before redesign:** collect a stable DAU/retention/activity/social baseline before enabling Social Home.
3. **Roll out Social Home reversibly:** internal → invited beta → small percentage → broader release, with Start Walk conversion, crash-free sessions, latency, and screen-time guardrails.
4. **Prove consumer groups before corporate:** release invite-only friend/family groups, then community groups, before accepting workplace pilot data.
5. **Trust the server for competition:** do not launch group/company rankings or results while clients can author aggregates.
6. **Require explicit consent:** group, challenge, leaderboard, corporate, photo, and encouragement participation are opt-in and independently reversible.
7. **Preserve the solo path:** every phase must pass regression tests for a user with no social connections, no group, no challenge, and no employer.
8. **Keep rollback simple:** new collections are additive, old readers remain compatible, feature flags hide new navigation, and no rollback deletes user data.

The safest path is deliberately incremental: protect the current individual habit loop, make existing social value visible in a bounded Home, establish private groups and roles, replace client-trusted competition with server-authoritative shared progress, pilot workplace wellness on the same primitives, and only then add a bounded Campfire ritual. At no point should users have to join a community to track an activity, maintain a streak, view personal progress, or retain Premium benefits.
