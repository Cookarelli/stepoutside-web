# StepOutside V4 Roadmap (Effort vs Impact)

**Objective:** Maximize revenue + retention with the fastest shippable features.

**Assumptions:**
- V3 already includes onboarding, core walk tracking, suggested walks, and Pro scaffold/paywall flow.
- Team priority is shipping quickly with clean UX and low engineering risk.

---

## Scoring Framework

- **Impact:** 1–5 (user value + retention + monetization upside)
- **Effort:** 1–5 (engineering + QA + store policy complexity)
- **Speed Score:** `Impact / Effort`

Higher speed score = better near-term win.

---

## Candidate Features (Ranked)

| Feature | Impact | Effort | Speed Score | Why it matters |
|---|---:|---:|---:|---|
| 1) Smart streak + weather notifications | 5 | 2 | **2.5** | Big behavior lift, drives daily opens, clear Pro upsell path |
| 2) Pro limits + unlock moments (soft gates) | 5 | 2 | **2.5** | Fast monetization lift by nudging free users at high-intent moments |
| 3) Weekly coaching summary card | 4 | 2 | **2.0** | Retention loop + premium feel with low implementation complexity |
| 4) Saved routes “collections” + recency pinning | 3 | 2 | **1.5** | Better return use, lightweight feature depth |
| 5) Health sync (Apple Health first) | 4 | 4 | **1.0** | High trust/value, but more integration/QA complexity |
| 6) Social accountability (friends/circles lite) | 5 | 5 | **1.0** | Strong retention upside, but significant complexity + moderation concerns |

---

## Fastest Revenue + Retention Wins (Recommended V4 Scope)

## P0 (Ship first)

### A) Smart Notifications (Weather + Streak Risk)
**Goal:** Increase daily active use and streak continuity.

**What to ship:**
- Daily “best walk window” push (if forecast supports)
- Streak risk alert (e.g., no walk logged by evening)
- Quiet hours + max notifications/day controls

**Why now:**
- Immediate retention impact
- Makes weather feature sticky
- Natural Pro upsell (“smart reminders”)

**Effort:** Low-Med

---

### B) Pro Limit System + Upgrade Moments
**Goal:** Convert active users without aggressive paywalling.

**What to ship:**
- Free plan limits:
  - Saved walks capped (already scaffolded to 3)
  - Advanced insights locked
  - Premium reminder schedules locked
- Contextual nudge copy at action points (not random popups)

**Why now:**
- Fastest monetization lift
- Minimal extra architecture needed

**Effort:** Low

---

### C) Weekly Coaching Summary
**Goal:** Build habit reflection loop.

**What to ship:**
- Sunday (or weekly) summary card:
  - days active, minutes, streak trend
  - “one recommendation” for next week
- In-app summary + optional push

**Why now:**
- Strong retention behavior
- Low technical risk using existing stats

**Effort:** Low

---

## P1 (Next after P0)

### D) Route Collections + Smart Re-suggest
- Save walks into “Quick 10”, “Weekend”, etc.
- Re-rank suggestions by user save/open behavior

### E) Apple Health Integration
- Import steps/active minutes context
- Better confidence and credibility for fitness users

---

## Not in V4 (defer)

- Full social/feed/challenges with public profiles
- Complex route generation engine with turn-by-turn logic
- Multi-device backend sync unless absolutely required

Reason: high complexity and support burden relative to near-term ROI.

---

## Proposed V4 Milestones (2–3 week execution)

## Week 1: Monetization + Notifications
- Finalize Pro entitlement wiring (RevenueCat live)
- Add smart reminder scheduler and preference controls
- Add Pro upsell moments in Steps/Stats/Home
- QA on iOS purchase + restore + entitlement state

## Week 2: Coaching + Retention Layer
- Build weekly summary card + simple recommendation engine
- Add optional weekly push summary
- Add event tracking for conversion + retention funnel

## Week 3 (optional): Quality + polish
- Tune reminder timing heuristics
- Copy polish for upsell and coaching
- A/B test one paywall variant (copy/order)

---

## Instrumentation (must-have)

Track these events before V4 launch:
- `paywall_viewed`
- `paywall_cta_tapped`
- `trial_started`
- `purchase_success`
- `restore_success`
- `walk_window_viewed`
- `walk_suggestion_opened`
- `saved_walk_added`
- `saved_walk_removed`
- `streak_risk_notification_sent`
- `notification_opened`

Core metrics:
- D1/D7 retention
- Free → trial conversion
- Trial → paid conversion
- Weekly active days per user
- Avg sessions/week

---

## Revenue + Retention Hypothesis

If V4 P0 ships cleanly:
- **Retention:** +10–25% D7 lift likely (notifications + coaching + weather timing)
- **Monetization:** +15–35% upgrade intent lift (contextual Pro gates + value moments)

---

## Immediate Next Steps (Actionable)

1. Finish RevenueCat live config (entitlements, offerings, products).
2. Build notification preferences model (quiet hours, enable toggles).
3. Implement streak-risk + best-window notification scheduler.
4. Add weekly coaching summary card.
5. Release as **V4 beta**, monitor events for 3–5 days, then full rollout.

---

## TL;DR
For fastest revenue + retention, V4 should prioritize:
1) **Smart reminders**
2) **Contextual Pro gating**
3) **Weekly coaching summaries**

These are high-impact, low-effort, and align tightly with StepOutside’s core habit loop.
