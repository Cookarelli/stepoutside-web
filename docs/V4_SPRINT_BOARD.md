# V4 Sprint Board (Now / Next / Later)

## NOW (This Week)

### 1) RevenueCat Live Wiring (P0)
**Outcome:** Real purchase + restore + entitlement control in production.

- [ ] Confirm products in RevenueCat:
  - [ ] `stepoutside_pro_monthly`
  - [ ] `stepoutside_pro_yearly`
  - [ ] `stepoutside_pro_lifetime_launch`
- [ ] Confirm entitlement ID is `pro`
- [ ] Confirm offerings/packages are active and mapped
- [ ] Add Apple public SDK key in `.env`
- [ ] Build and install iOS dev build (not Expo Go)
- [ ] Test purchase success flow
- [ ] Test restore flow
- [ ] Test “Clear Pro” test path and re-upgrade

**Definition of done:** Pro status persists correctly across app relaunch + tabs.

---

### 2) Smart Reminder Foundation (P0)
**Outcome:** Core notification engine ready.

- [ ] Add notification permission prompt flow
- [ ] Add preferences model:
  - [ ] weather reminders toggle
  - [ ] streak-risk toggle
  - [ ] quiet hours start/end
- [ ] Add local scheduler utility (daily refresh)
- [ ] Hook weather window logic into reminder candidate generation

**Definition of done:** User can enable reminders and receives correctly timed test notification.

---

### 3) Pro Upgrade Moments (P0)
**Outcome:** Better conversion without spam.

- [ ] Steps tab: keep 3 saved walk free cap + Pro nudge (already scaffolded)
- [ ] Stats tab: lock advanced insights with Unlock Pro CTA (already scaffolded)
- [ ] Home: optional subtle Pro card for “Smart weather reminders”
- [ ] Confirm all CTAs route to `/pro`

**Definition of done:** At least 3 contextual upgrade touchpoints are working and tasteful.

---

## NEXT (Week 2)

### 4) Weekly Coaching Summary (P0/P1)
**Outcome:** Habit reinforcement loop.

- [ ] Add “This Week” card
  - [ ] active days
  - [ ] total minutes
  - [ ] streak trend vs prior week
- [ ] Add one recommendation sentence (simple rules engine)
- [ ] Optional weekly push summary

**Definition of done:** Weekly summary appears reliably with meaningful recommendation copy.

---

### 5) Metrics + Event Instrumentation (P0)
**Outcome:** You can measure what drives retention + revenue.

- [ ] Implement event hooks:
  - [ ] `paywall_viewed`
  - [ ] `paywall_cta_tapped`
  - [ ] `purchase_success`
  - [ ] `restore_success`
  - [ ] `walk_window_viewed`
  - [ ] `saved_walk_added`
  - [ ] `saved_walk_removed`
- [ ] Define dashboard cut (daily)

**Definition of done:** Conversion funnel and usage loop are measurable.

---

## LATER (Week 3+)

### 6) Route Collections + Re-suggest
- [ ] Collections: Quick 10 / Weekend / Nearby
- [ ] Re-rank by user behavior (saved/opened)

### 7) Apple Health Integration (iOS-first)
- [ ] Health permission flow
- [ ] Import daily steps/active minutes context

### 8) A/B Paywall Copy Test
- [ ] Variant A: value-first copy
- [ ] Variant B: outcome-first copy
- [ ] Compare trial starts + conversion

---

## Daily Execution Rhythm (15-minute operator loop)

- [ ] Check build health + crash reports
- [ ] Check purchase/restore success logs
- [ ] Check D1/D7 retention trend
- [ ] Check top drop-off in paywall flow
- [ ] Pick 1 improvement for next commit

---

## Fast Priority Order (if time gets tight)

1. RevenueCat live + restore stability
2. Smart reminder foundation
3. Weekly coaching summary
4. Instrumentation
5. Everything else

---

## Release Gates for V4 Beta

- [ ] iOS purchase/restore tested on device
- [ ] No broken free-path UX
- [ ] Notification timing reasonable (no spam)
- [ ] Pro gating copy clear and non-annoying
- [ ] Event logging validated

---

## Owner Notes

- Keep UX simple. Avoid adding feature branches that increase cognitive load.
- Prioritize behavior loops (show up today) over complexity.
- If unsure: choose the option that increases daily consistency with least friction.
