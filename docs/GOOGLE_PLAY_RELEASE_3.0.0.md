# Step Outside 3.0.0 — Google Play Release Draft

Status: Firebase and source preflight complete; direct-test APK authorized; no AAB or Google Play submission started

## Identity and versioning

- Expo/EAS project: `@cookarell/step-outside-v2`
- EAS project ID: `a406fe2d-b4e7-47cf-8ede-10db0667d753`
- Android application ID: `com.stevencook.stepoutside`
- Version name: `3.0.0`
- Current EAS Android version counter: `6`
- First internal APK test build: version code `7`
- Expected Play production AAB after APK approval: version code `8`

The internal APK consumes version code 7 because EAS remote versioning and auto-increment are used. The later production AAB consumes version code 8. Both are version name 3.0.0 and come from the same reviewed source revision.

## Draft “What’s new” text

> Outdoor Friends makes it easier to get outside together. Find friends, manage requests, follow recent outdoor activity, share streak momentum, join buddy challenges, and invite someone outside. This update also refreshes the home experience and improves reliability.

This is under Google Play’s 500-character release-notes limit.

## Required release sequence

1. Completed: reviewed/deployed Firestore rules and indexes, registered `com.stevencook.stepoutside` in Firebase project `stepoutside-32aae`, added the matching `google-services.json`, and preserved the unrelated `com.optimizelocal.stepoutside` app.
2. Completed: TypeScript, ESLint, Expo Doctor, production validation, buddy checks, authenticated Firebase rules tests, navigation checks, unit tests, and native bundle exports.
3. Commit the reviewed source revision, then build an installable production-environment APK from that exact commit:

   ```bash
   eas build --platform android --profile android-test
   ```

4. Install the APK on a physical Android device from the EAS build page. Test sign-up/sign-in, Outdoor Friends, username/email search, requests, acceptance from both accounts, challenges, activity, notifications, purchase state, location permission, walk recording, background/locked-screen behavior, and app restart/offline recovery.
5. Stop for explicit approval. Only after the APK and TestFlight build pass, build the Play-ready AAB from the same approved revision:

   ```bash
   eas build --platform android --profile production
   ```

6. Verify the returned build is project `step-outside-v2`, package `com.stevencook.stepoutside`, version `3.0.0`, expected version code `8`, and the approved Git commit.
7. Upload/submit to Google Play’s Internal testing track first. Add the draft change notes, choose the tester group, save, review, and start rollout to internal testing.
8. Complete Play Console pre-review checks: App content, Data safety, Content rating, Target audience, Ads declaration, privacy-policy URL, store listing, screenshots/icon/feature graphic, countries/regions, pricing, app access instructions, and any new permissions declarations.
9. Test the Play-delivered build through the Play Store. Promote the same release from Internal testing to Closed/Open testing or Production only after approval.
10. Submit the production rollout for Google review. Prefer a staged rollout rather than 100% on the first production release.

## Submission command

EAS Submit requires a Google Play service-account key configured for this EAS project. After the production AAB is approved, submit its exact EAS build ID rather than `--latest`:

```bash
eas submit --platform android --profile production --id <STEP_OUTSIDE_ANDROID_EAS_BUILD_ID>
```

Google requires the app’s first Play upload to be performed manually in Play Console before API-based submissions can work. If this package has not yet had a manual Play upload, use the Internal testing release flow in Play Console for the first AAB.
