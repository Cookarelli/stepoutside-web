# Step Outside App Store Review Resubmission Checklist

Use this checklist before resubmitting `Step Outside` after the Guideline 3.1.2(c) rejection.

## 1. App Store Connect metadata updates

Update **App Store Description** to include these exact lines:

```text
Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Privacy Policy: https://stepoutside.app/privacy
```

Update **App Review Notes** to include this exact note:

```text
The subscription paywall now displays the subscription title, monthly duration, price, renewal disclosure, Privacy Policy link, Terms of Use link, and Restore Purchases button.
```

## 2. Subscription promotional image check

In **Monetization > Subscriptions / In-App Purchases**:

- Remove the current App Store promotional image if you are not actively promoting the IAP.
- If keeping a promotional image, replace it with a unique non-screenshot image that represents Step Outside Premium and does not duplicate other IAP images or look like an app screenshot.

## 3. Live policy URL findings

Checked on **May 18, 2026**:

- `https://stepoutside.app/privacy` currently responds with a `307` redirect to `https://www.stepoutside.app/privacy`
- `https://www.stepoutside.app/privacy` currently returns `404 Not Found`
- `https://stepoutside.app/privacy-policy` currently resolves successfully and returns `200`
- `https://stepoutside.app/terms` currently resolves successfully and returns `200`
- Apple Standard EULA link is live:
  - `https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`

## 4. Repo findings

Local policy-related files and references found in this repo:

- `PRIVACY.md`
- `docs/TERMS.md`
- `app/pro.tsx`
- `app/(tabs)/explore.tsx`

Notes:

- This Expo app repo contains local policy documents, but it does **not** contain a public website route implementation for `https://stepoutside.app/privacy`.
- A Terms page does exist live at `https://stepoutside.app/terms`.
- If you are not publishing a custom Terms page in App Store Connect, using Apple’s standard EULA link is the safest option.

## 5. Recommended action before resubmitting

Complete one of these before clicking **Submit for Review**:

1. Publish a working live page at `https://stepoutside.app/privacy`
2. Or change the privacy URL used in App Store Connect and the app to the currently working live URL:
   - `https://stepoutside.app/privacy-policy`

## 6. Final resubmission pass

Before resubmitting:

- Confirm the paywall shows `Step Outside Premium`
- Confirm the paywall shows a visible subscription duration
- Confirm the paywall shows a visible price
- Confirm the paywall shows the renewal disclosure
- Confirm `Privacy Policy` opens successfully
- Confirm `Terms of Use` opens successfully
- Confirm `Restore Purchases` is visible
- Confirm no broken subscription promotional image remains attached
- Confirm App Store Description includes the required Terms and Privacy lines
- Confirm App Review Notes include the subscription compliance note above
