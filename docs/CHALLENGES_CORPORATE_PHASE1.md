# Step Outside Challenges + Corporate Phase 1

This document starts the implementation track for the post-TestFlight expansion into challenges, badges, and company wellness.

## What is scaffolded now

- Static challenge catalog
- Static badge catalog
- Local-first challenge progress evaluation from existing sessions
- Local-first badge unlock evaluation from existing sessions
- Challenges tab shell with:
  - `For You`
  - `Badges`
  - `Team`

## Why this sequence

Step Outside already has strong session, streak, and bonus primitives. The safest V1 move is to build the challenge domain on top of those facts before introducing server-enforced corporate behavior.

## Firestore rollout recommendation

### Catalogs

Ship badge and challenge catalogs locally first.

Later, if admin-managed or sponsored content is needed, mirror them into:

- `challengeTemplates/{templateId}`
- `badgeCatalog/{badgeId}`
- `rewardCatalog/{rewardId}`

### User progress

Add when remote sync work begins:

- `users/{uid}/challengeProgress/{instanceId}`
- `users/{uid}/badges/{badgeId}`
- `users/{uid}/rewardClaims/{claimId}`

### Corporate MVP

- `companies/{companyId}`
- `companies/{companyId}/teams/{teamId}`
- `companies/{companyId}/members/{uid}`
- `companies/{companyId}/inviteCodes/{inviteCodeId}`
- `companies/{companyId}/challengeInstances/{instanceId}`
- `companies/{companyId}/leaderboards/{leaderboardId}`

## Recommended next implementation slices

### Slice 1

- Persist local challenge progress snapshots alongside summary refresh
- Add post-walk unlock event plumbing
- Add badge earn toast / animation placeholder

### Slice 2

- Add Firestore read/write for challenge progress
- Add badge remote persistence
- Add monthly challenge windows and company challenge instances

### Slice 3

- Add company join flow via invite code
- Add default team assignment
- Add first team leaderboard
- Add admin challenge enable flow

### Current admin utilities

- Signed-in company admins can now create:
  - fresh invite codes
  - starter company challenge instances
- In development builds, signed-in users without a company can bootstrap a sample company seed from the Team tab:
  - company
  - default team
  - admin membership
  - starter invite code
  - starter challenge

### Live Firestore paths now used by corporate MVP

- `companies/{companyId}`
- `companies/{companyId}/teams/{teamId}`
- `companies/{companyId}/members/{uid}`
- `companies/{companyId}/inviteCodes/{inviteCodeId}`
- `companies/{companyId}/challengeInstances/{instanceId}`
- `companies/{companyId}/challengeProgress/{instanceId__uid}`
- `users/{uid}/memberships/{companyId}`

## Guardrails

- Keep `sessions` authoritative
- Keep `pro` as the only premium entitlement
- Do not create separate truth stores for streaks, badges, and sessions
- Avoid hardcoding company-specific logic in UI components
