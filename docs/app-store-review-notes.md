# Step Outside Premium App Store Review Notes

## What Premium includes

Step Outside Premium currently unlocks:

- Full GPS route saving for Premium walks and hikes
- Sunrise Bonus and Sunset Bonus achievements
- Advanced streak insights
- Monthly progress insights

## What free users can do

Free users can still use the core app experience:

- Complete onboarding or skip it
- Start and finish basic walks and hikes
- Track distance and duration
- View basic history and activity summaries
- View basic streak progress
- Open the Premium paywall without purchasing

Free users see clear locked previews for Premium-only features, including saved GPS route maps, monthly insights, and advanced streak details.

## Test instructions for Apple reviewer

1. Install and open `Step Outside`.
2. Complete onboarding or tap `Skip`.
3. On the Home and Stats screens, verify that free users can still browse the app and view core activity information.
4. Open the `Profile` tab to create or sign in to an account using email/password or Google.
5. Open the `Premium` paywall from the Home, Stats, or Profile screen.
6. Verify the paywall shows the subscription title, subscription durations, live price text, renewal disclosure, Privacy Policy link, Terms of Use link, Restore Purchases button, and Manage Subscription button.
7. Start a walk from the main flow and allow location access when prompted.
8. End the walk and review the saved activity details.
9. For Premium accounts, saved GPS route maps and Premium bonus/streak insights are visible where available.
10. For free accounts, Premium-only areas show locked preview messaging instead of broken or empty screens.

## Brand-new account coverage

- A brand-new user can skip onboarding and use the free core walking flow without creating an account.
- A brand-new user can also create an email/password account from the `Profile` tab.

## Existing account coverage

- Existing users can sign in from the `Profile` tab with email/password or Google.
- RevenueCat customer identity is refreshed when the auth state changes so Premium access stays consistent after sign-in and sign-out.

## Empty-state behavior

- If subscription offerings fail to load, the paywall shows a retryable error state.
- If RevenueCat returns no active packages, the paywall shows an empty-plans state and does not fabricate products.
- If a user has no saved route data, monthly activity, or Premium-only bonus data, the app shows explanatory empty states instead of crashing.

## Demo account

If Apple requests a reviewer account, provide credentials here before resubmission:

- Email: `[reviewer-account@example.com]`
- Password: `[replace-before-submit]`

If no reviewer account is provided, the app can still be tested as a new free user.

## Exact subscription disclosure text shown in app

The app currently shows this renewal disclosure on the Premium paywall:

> Renews automatically unless canceled at least 24 hours before the end of the current period.

The paywall also includes:

- Privacy Policy: `https://stepoutside.app/privacy-policy`
- Terms of Use: `https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`
- Restore Purchases button
- Manage Subscription button

## Exact App Review resubmission note

Use this in the App Review Notes field for the resubmission:

> Step Outside Premium is available from the in-app paywall. The paywall now clearly displays the subscription title, subscription duration, live App Store price, renewal disclosure, Privacy Policy link, Terms of Use link, Restore Purchases button, and Manage Subscription button. Free users can still complete onboarding, start and finish walks or hikes, track basic distance and duration, and view basic history and streak progress without purchasing. Premium currently unlocks saved GPS route maps, sunrise and sunset bonus achievements, advanced streak insights, and monthly progress insights. Locked Premium areas show clear upgrade messaging and do not block the core app experience.
