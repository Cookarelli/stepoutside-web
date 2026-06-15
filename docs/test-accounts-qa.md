# Step Outside Test Accounts QA

Use normal Firebase email/password accounts for development and QA. Do not commit real passwords, shared test passwords, or personal credentials to this repo.

## Safe Account Setup

1. Create two QA email addresses that are safe to use in Firebase Auth.
2. Store passwords in a local password manager or another approved secret store.
3. In a development build, open the Profile tab while signed out.
4. Use the email/password fields and Create account to create Account A.
5. Open Edit Profile and save a unique username for Account A.
6. Sign out from Profile.
7. Repeat the same steps for Account B with a different email and username.

The app creates a normal Firestore `users/{uid}` document during email/password sign-up and publishes `userDiscovery/{uid}` after a username is saved. Test accounts should use the same Firestore shape as production accounts.

## Two-Account Validation

Run this flow before QA-ing new social work:

1. Account A logs in.
2. Account A logs out.
3. Account B creates an account or logs in.
4. Account B saves a unique username.
5. Account B logs out.
6. Account A logs back in.
7. Account A searches for Account B by username.
8. Account A sends a friend request.
9. Account A logs out.
10. Account B logs in.
11. Account B accepts the incoming request.
12. Account B sees Account A in Friends.
13. Account B logs out.
14. Account A logs in and sees Account B in Friends.

Email search can also be tested after both accounts have saved usernames. The search uses normalized auth email values and excludes the signed-in user.

## Guardrails

- Never expose test credentials in production UI.
- Never hardcode passwords or QA account secrets in source files, docs, rules, or config.
- Use unique usernames per Firebase project. Reserved usernames such as `admin`, `support`, and `premium` are blocked.
- If a username is changed, the old username reservation should be removed only for the same authenticated user.
- Friend requests should not duplicate existing pending requests or accepted friendships.
