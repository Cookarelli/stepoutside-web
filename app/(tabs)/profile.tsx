import * as Google from "expo-auth-session/providers/google";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { ENV } from "../../env";
import { usePremiumAccess } from "../../hooks/use-premium-access";
import { accountDeletionRequiresRecentLogin, deleteCurrentAccount } from "../../src/lib/accountDeletion";
import { PREMIUM, alpha } from "../../src/lib/premiumTheme";
import {
  createEmailPasswordAccount,
  getCachedAuthUser,
  sendEmailPasswordReset,
  signInWithEmailPassword,
  signInWithGoogleIdToken,
  signOutUser,
  subscribeToAuth,
  type AuthUserSnapshot,
} from "../../src/lib/auth";
import { auth } from "../../src/lib/firebase";
import { resetOnboarding } from "../../src/lib/onboarding";
import {
  getNotificationPrefs,
  requestNotificationPermission,
  scheduleSmartReminders,
  sendTestNotification,
  setNotificationPrefs,
  type NotificationPrefs,
} from "../../src/lib/notifications";
import { EMPTY_SUMMARY, getSummary, type SummaryStats } from "../../src/lib/store";

type AuthAction = "google" | "emailSignIn" | "emailSignUp" | "passwordReset" | "signOut" | "deleteAccount" | null;

function firstNonEmpty(...values: (string | null | undefined)[]): string {
  for (const value of values) {
    if (value?.trim()) return value.trim();
  }
  return "";
}

function getInitials(user: AuthUserSnapshot | null): string {
  const label = firstNonEmpty(user?.displayName, user?.email, "SO");
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function formatProviderLabel(user: AuthUserSnapshot | null): string {
  const providerIds = user?.providerIds ?? [];
  if (providerIds.includes("google.com")) return "Google";
  if (providerIds.includes("password")) return "Email";
  if (user?.isAnonymous) return "Anonymous";
  return "Account";
}

function formatAuthError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("cancel")) return "Sign-in was canceled.";
  if (message.includes("network")) return "Sign-in needs a connection right now.";
  return fallback;
}

function formatMinutesLabel(minutes: number): string {
  if (minutes <= 0) return "0 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return hours >= 10 || Number.isInteger(hours) ? `${Math.round(hours)} hr` : `${hours.toFixed(1)} hr`;
}

function enabledReminderCount(prefs: NotificationPrefs | null): number {
  if (!prefs) return 0;
  return [prefs.sunriseQuotes, prefs.sunsetReminders, prefs.streakRiskReminders].filter(Boolean).length;
}

type GoogleSignInButtonProps = {
  disabled: boolean;
  onStart: () => void;
  onFinish: () => void;
  onStatus: (message: string) => void;
};

function GoogleSignInButton({ disabled, onStart, onFinish, onStatus }: GoogleSignInButtonProps) {
  const [googleRequest, googleResponse, promptGoogleAsync] = Google.useIdTokenAuthRequest({
    iosClientId: ENV.AUTH.googleIosClientId ?? undefined,
    androidClientId: ENV.AUTH.googleAndroidClientId ?? undefined,
    webClientId: ENV.AUTH.googleWebClientId ?? undefined,
    scopes: ["profile", "email"],
    selectAccount: true,
  });

  useEffect(() => {
    if (!googleResponse) return;

    if (googleResponse.type === "cancel" || googleResponse.type === "dismiss") {
      onFinish();
      onStatus("Google sign-in was canceled.");
      return;
    }

    if (googleResponse.type !== "success") {
      onFinish();
      onStatus("Google sign-in didn’t finish cleanly.");
      return;
    }

    const response = googleResponse as {
      params?: Record<string, string | undefined>;
      authentication?: { accessToken?: string | null } | null;
    };
    const idToken = response.params?.id_token;

    if (!idToken) {
      onFinish();
      onStatus("Google didn’t return an ID token.");
      return;
    }

    void (async () => {
      try {
        await signInWithGoogleIdToken(idToken, response.authentication?.accessToken ?? response.params?.access_token ?? null);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onStatus("Signed in with Google.");
      } catch (error) {
        onStatus(formatAuthError(error, "Google sign-in hit a snag."));
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        onFinish();
      }
    })();
  }, [googleResponse, onFinish, onStatus]);

  const onPress = async () => {
    if (!googleRequest) {
      onStatus("Google sign-in isn’t available right now. Use email sign-in below.");
      return;
    }

    onStatus("");
    onStart();
    void Haptics.selectionAsync();

    try {
      await promptGoogleAsync();
    } catch (error) {
      onFinish();
      onStatus(formatAuthError(error, "Google sign-in couldn’t open."));
    }
  };

  return (
    <Pressable
      onPress={() => void onPress()}
      disabled={disabled}
      style={({ pressed }) => [
        styles.googleBtn,
        disabled ? styles.authBtnDisabled : null,
        pressed ? { opacity: 0.95 } : null,
      ]}
    >
      <Text style={styles.googleBtnText}>Continue with Google</Text>
    </Pressable>
  );
}

export default function ProfileTab() {
  const router = useRouter();

  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [authUser, setAuthUser] = useState<AuthUserSnapshot | null>(null);
  const [cachedAuthUser, setCachedAuthUser] = useState<AuthUserSnapshot | null>(null);
  const [summary, setSummary] = useState<SummaryStats>(EMPTY_SUMMARY);
  const [authLoading, setAuthLoading] = useState(true);
  const [authAction, setAuthAction] = useState<AuthAction>(null);
  const [authStatus, setAuthStatus] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState("");
  const { isPremium } = usePremiumAccess();

  const googleEnabled = Boolean(
    ENV.AUTH.googleWebClientId && (Platform.OS !== "ios" || ENV.AUTH.googleIosClientId)
  );

  const visibleUser = authUser ?? cachedAuthUser;
  const providerLabel = useMemo(() => formatProviderLabel(visibleUser), [visibleUser]);
  const reminderCount = useMemo(() => enabledReminderCount(prefs), [prefs]);
  const currentStreak = summary.currentStreak ?? summary.currentStreakDays ?? 0;
  const longestStreak = summary.longestStreak ?? summary.bestStreakDays ?? 0;
  const activeDaysThisWeek = summary.activeDaysThisWeek ?? 0;
  const activeDaysThisMonth = summary.activeDaysThisMonth ?? 0;
  const weeklyGoal = summary.weeklyGoal ?? 4;
  const monthlyGoal = summary.monthlyGoal ?? 16;
  const weeklyConsistencyStreakCurrent = summary.weeklyConsistencyStreakCurrent ?? 0;
  const profileHeadline = visibleUser
    ? firstNonEmpty(visibleUser.displayName, visibleUser.email, "Profile ready")
    : "Keep your progress close";
  const profileBody = visibleUser
    ? firstNonEmpty(
        visibleUser.email,
        "This account is attached to your Step Outside profile on this device."
      )
    : "Sign in to connect your Premium access to your account instead of only this device.";
  const profileSupport = visibleUser
    ? "Walk history is available on this device and Premium access stays linked to your signed-in account."
    : "Your current walks are still safe on this device even if you stay signed out.";

  const loadSettings = useCallback(async () => {
    const [np, storedSummary] = await Promise.allSettled([getNotificationPrefs(), getSummary()]);
    setPrefs(
      np.status === "fulfilled"
        ? np.value
        : {
            sunriseQuotes: false,
            sunsetReminders: false,
            streakRiskReminders: false,
            quietHoursStart: 22,
            quietHoursEnd: 8,
          }
    );
    setSummary(storedSummary.status === "fulfilled" ? storedSummary.value : EMPTY_SUMMARY);
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      const cached = await getCachedAuthUser();
      if (active) {
        setCachedAuthUser(cached);
      }
    })();

    void loadSettings();

    const unsubscribe = subscribeToAuth((user) => {
      if (!active) return;
      setAuthUser(user);
      setCachedAuthUser(user);
      setAuthLoading(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [loadSettings]);

  useFocusEffect(
    useCallback(() => {
      void loadSettings();
    }, [loadSettings])
  );

  const onResetOnboarding = () => {
    Alert.alert("Replay welcome screens?", "This will show onboarding again on next app launch.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Replay",
        style: "default",
        onPress: async () => {
          await resetOnboarding();
          router.replace("/splash");
        },
      },
    ]);
  };

  const updatePrefs = async (next: NotificationPrefs) => {
    const wantsNotifications =
      next.sunriseQuotes || next.sunsetReminders || next.streakRiskReminders;

    if (wantsNotifications) {
      const ok = await requestNotificationPermission();
      if (!ok) {
        Alert.alert("Notifications are off", "Allow notifications to receive sunrise quotes and sunset nudges.");
        return;
      }
    }

    try {
      setPrefs(next);
      await setNotificationPrefs(next);
      await scheduleSmartReminders(next);
    } catch {
      Alert.alert("Couldn’t update reminders", "Please try again in a moment.");
    }
  };

  const validateEmailForm = (needsPassword: boolean) => {
    const email = authEmail.trim();
    const password = authPassword;

    if (!email) {
      setAuthStatus("Enter your email address first.");
      return null;
    }

    if (needsPassword && password.length < 6) {
      setAuthStatus("Password must be at least 6 characters.");
      return null;
    }

    return { email, password };
  };

  const onEmailSignIn = async () => {
    const form = validateEmailForm(true);
    if (!form) return;

    setAuthStatus("");
    setAuthAction("emailSignIn");
    void Haptics.selectionAsync();

    try {
      await signInWithEmailPassword(form.email, form.password);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAuthStatus("Signed in.");
    } catch (error) {
      setAuthStatus(formatAuthError(error, "Email sign-in hit a snag."));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setAuthAction(null);
    }
  };

  const onEmailSignUp = async () => {
    const form = validateEmailForm(true);
    if (!form) return;

    setAuthStatus("");
    setAuthAction("emailSignUp");
    void Haptics.selectionAsync();

    try {
      await createEmailPasswordAccount(form.email, form.password);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAuthStatus("Account created.");
    } catch (error) {
      setAuthStatus(formatAuthError(error, "Email sign-up hit a snag."));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setAuthAction(null);
    }
  };

  const onPasswordReset = async () => {
    const form = validateEmailForm(false);
    if (!form) return;

    setAuthStatus("");
    setAuthAction("passwordReset");
    void Haptics.selectionAsync();

    try {
      await sendEmailPasswordReset(form.email);
      setAuthStatus("Password reset email sent.");
    } catch (error) {
      setAuthStatus(formatAuthError(error, "Password reset couldn’t be sent."));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setAuthAction(null);
    }
  };

  const onSignOut = async () => {
    Alert.alert("Sign out?", "This will sign you out on this device but won’t remove your local walks.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          setAuthStatus("");
          setAuthAction("signOut");
          try {
            await signOutUser();
            setAuthStatus("Signed out.");
            void Haptics.selectionAsync();
          } catch {
            setAuthStatus("Couldn’t sign out right now.");
          } finally {
            setAuthAction(null);
          }
        },
      },
    ]);
  };

  const onOpenDeleteAccount = () => {
    if (!auth.currentUser) {
      Alert.alert("Sign in first", "Delete Account is available after you sign in.");
      return;
    }

    setDeleteStatus("");
    setDeleteModalVisible(true);
  };

  const onDeleteAccount = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setDeleteStatus("Sign in again before deleting your account.");
      return;
    }

    setAuthStatus("");
    setDeleteStatus("");
    setAuthAction("deleteAccount");

    try {
      const result = await deleteCurrentAccount(currentUser);
      if (result.cloudCleanupRequired) {
        console.warn("[account-delete] shared company cleanup still needed", {
          companyIds: result.cloudCleanupTargets,
        });
      }

      setDeleteModalVisible(false);
      setDeleteStatus("");
      setAuthStatus("Account deleted.");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)/profile");
      Alert.alert("Account deleted", "Your account and associated app data have been removed where legally permitted.");
    } catch (error) {
      if (accountDeletionRequiresRecentLogin(error)) {
        setDeleteStatus("For security, please sign in again before deleting your account.");
      } else {
        setDeleteStatus("We couldn’t delete your account right now. Please try again in a moment.");
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setAuthAction(null);
    }
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.sub}>Your account, reminders, and plan settings in one grounded place.</Text>

      <View style={styles.accountCard}>
        <View style={styles.accountHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(visibleUser)}</Text>
          </View>
          <View style={styles.accountCopy}>
            <Text style={styles.accountTitle}>{profileHeadline}</Text>
            <Text style={styles.accountBody}>{profileBody}</Text>
            <Text style={styles.accountMeta}>
              {visibleUser ? `${providerLabel} account connected` : "Profile backup is optional for now."}
            </Text>
            <Text style={styles.accountMeta}>{profileSupport}</Text>
          </View>
        </View>

        <View style={styles.profileStatsRow}>
          <View style={styles.profileStatChip}>
            <Text style={styles.profileStatLabel}>Walks</Text>
            <Text style={styles.profileStatValue}>{summary.totalSessions}</Text>
          </View>
          <View style={styles.profileStatChip}>
            <Text style={styles.profileStatLabel}>Streak</Text>
            <Text style={styles.profileStatValue}>{currentStreak}d</Text>
          </View>
          <View style={styles.profileStatChip}>
            <Text style={styles.profileStatLabel}>Outside</Text>
            <Text style={styles.profileStatValue}>{formatMinutesLabel(summary.totalMinutes)}</Text>
          </View>
        </View>

        {authLoading && !visibleUser ? (
          <View style={styles.authLoadingRow}>
            <ActivityIndicator color={PREMIUM.colors.forest} />
            <Text style={styles.authLoadingText}>Checking your account…</Text>
          </View>
        ) : null}

        {!visibleUser ? (
          <View style={styles.authActions}>
            <View style={styles.emailAuthForm}>
              <TextInput
                value={authEmail}
                onChangeText={setAuthEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                placeholder="Email"
                placeholderTextColor="rgba(11,15,14,0.42)"
                style={styles.authInput}
              />
              <TextInput
                value={authPassword}
                onChangeText={setAuthPassword}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                textContentType="password"
                placeholder="Password"
                placeholderTextColor="rgba(11,15,14,0.42)"
                style={styles.authInput}
              />
              <View style={styles.emailButtonRow}>
                <Pressable
                  onPress={() => void onEmailSignIn()}
                  disabled={authAction !== null}
                  style={({ pressed }) => [
                    styles.emailPrimaryBtn,
                    authAction !== null ? styles.authBtnDisabled : null,
                    pressed ? { opacity: 0.92 } : null,
                  ]}
                >
                  <Text style={styles.emailPrimaryBtnText}>
                    {authAction === "emailSignIn" ? "Signing in..." : "Sign in"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void onEmailSignUp()}
                  disabled={authAction !== null}
                  style={({ pressed }) => [
                    styles.emailSecondaryBtn,
                    authAction !== null ? styles.authBtnDisabled : null,
                    pressed ? { opacity: 0.92 } : null,
                  ]}
                >
                  <Text style={styles.emailSecondaryBtnText}>
                    {authAction === "emailSignUp" ? "Creating..." : "Create account"}
                  </Text>
                </Pressable>
              </View>
              <Pressable
                onPress={() => void onPasswordReset()}
                disabled={authAction !== null}
                style={({ pressed }) => [styles.resetPasswordBtn, pressed ? { opacity: 0.75 } : null]}
              >
                <Text style={styles.resetPasswordText}>
                  {authAction === "passwordReset" ? "Sending reset..." : "Forgot password?"}
                </Text>
              </Pressable>
            </View>

            {googleEnabled ? (
              <GoogleSignInButton
                disabled={authAction !== null}
                onStart={() => setAuthAction("google")}
                onFinish={() => setAuthAction(null)}
                onStatus={setAuthStatus}
              />
            ) : (
              <Text style={styles.authSetupNote}>Use email sign-in or create an account below.</Text>
            )}
          </View>
        ) : (
          <View style={styles.signedInRow}>
            <View style={styles.signedInPillWrap}>
              <Text style={styles.signedInPill}>{providerLabel}</Text>
              <Text style={styles.signedInHelper}>Profile active on this device</Text>
            </View>
            <Pressable
              onPress={() => void onSignOut()}
              disabled={authAction === "signOut"}
              style={({ pressed }) => [
                styles.signOutBtn,
                authAction === "signOut" ? styles.authBtnDisabled : null,
                pressed ? { opacity: 0.92 } : null,
              ]}
            >
              <Text style={styles.signOutBtnText}>
                {authAction === "signOut" ? "Signing out…" : "Sign out"}
              </Text>
            </Pressable>
          </View>
        )}

        {authStatus ? <Text style={styles.authStatus}>{authStatus}</Text> : null}
      </View>

      <View style={styles.settingsCard}>
        <Text style={styles.settingsEyebrow}>Settings / Account</Text>
        <Text style={styles.settingsTitle}>Delete Account</Text>
        <Text style={styles.settingsBody}>
          Deleting your account removes your user profile and associated app data where legally permitted. Shared team records may require server-side cleanup afterward.
        </Text>
        <Pressable
          onPress={onOpenDeleteAccount}
          disabled={!visibleUser || authAction !== null}
          style={({ pressed }) => [
            styles.deleteBtn,
            (!visibleUser || authAction !== null) ? styles.authBtnDisabled : null,
            pressed ? { opacity: 0.92 } : null,
          ]}
        >
          <Text style={styles.deleteBtnText}>Delete Account</Text>
        </Pressable>
        {!visibleUser ? <Text style={styles.deleteHint}>Sign in to access account deletion.</Text> : null}
      </View>

      <View style={styles.streakCard}>
        <Text style={styles.streakEyebrow}>Premium Streaks</Text>
        {isPremium ? (
          <>
            <View style={styles.streakRow}>
              <Text style={styles.streakLabel}>Current streak</Text>
              <Text style={styles.streakValue}>{currentStreak} days</Text>
            </View>
            <View style={styles.streakRow}>
              <Text style={styles.streakLabel}>Longest streak</Text>
              <Text style={styles.streakValue}>{longestStreak} days</Text>
            </View>
            <View style={styles.streakRow}>
              <Text style={styles.streakLabel}>Weekly goal progress</Text>
              <Text style={styles.streakValue}>{Math.min(activeDaysThisWeek, weeklyGoal)}/{weeklyGoal}</Text>
            </View>
            <View style={styles.streakRow}>
              <Text style={styles.streakLabel}>Active days this month</Text>
              <Text style={styles.streakValue}>{activeDaysThisMonth}/{monthlyGoal}</Text>
            </View>
            <View style={styles.streakRow}>
              <Text style={styles.streakLabel}>Weekly consistency</Text>
              <Text style={styles.streakValue}>{weeklyConsistencyStreakCurrent} weeks</Text>
            </View>
            <Text style={styles.streakBody}>
              {activeDaysThisWeek >= weeklyGoal
                ? "You hit this week's goal. Keep the habit feeling light."
                : `${Math.max(0, weeklyGoal - activeDaysThisWeek)} more active day${
                    Math.max(0, weeklyGoal - activeDaysThisWeek) === 1 ? "" : "s"
                  } to hit your weekly goal.`}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.streakTitle}>Basic streak active</Text>
            <Text style={styles.streakBody}>
              Your current streak is still visible. Premium adds weekly goal progress, longest streaks, active month totals, and comeback tracking.
            </Text>
            <View style={styles.streakPreviewRow}>
              <Text style={styles.streakPreviewLabel}>Weekly progress</Text>
              <Text style={styles.streakPreviewValue}>Locked</Text>
            </View>
            <View style={styles.streakPreviewRow}>
              <Text style={styles.streakPreviewLabel}>Longest streak</Text>
              <Text style={styles.streakPreviewValue}>Locked</Text>
            </View>
          </>
        )}
      </View>

      <View style={styles.planCard}>
        <View style={styles.planTopRow}>
          <View>
            <Text style={styles.planEyebrow}>Plan</Text>
            <Text style={styles.planTitle}>{isPremium ? "Premium Active" : "Free Plan"}</Text>
            <Text style={styles.planBody}>
              {isPremium
                ? "Your Step Outside Premium features are available on this device."
                : "Upgrade when you want saved route maps, bonus achievements, and deeper progress insights."}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push("/pro")}
            style={({ pressed }) => [styles.btn, pressed ? { opacity: 0.9 } : null]}
          >
            <Text style={styles.btnText}>{isPremium ? "Manage Premium" : "Unlock Premium"}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.notificationsCard}>
        <View style={styles.notificationsHeader}>
          <View>
            <Text style={styles.notificationsTitle}>Smart reminders</Text>
            <Text style={styles.notificationsBody}>Gentle sunrise lines, evening nudges, and streak-save reminders that help the habit stay alive.</Text>
          </View>
          <View style={styles.reminderPill}>
            <Text style={styles.reminderPillText}>
              {reminderCount === 0 ? "All off" : `${reminderCount} on`}
            </Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.rowCopy}>
            <Text style={styles.rowLabel}>Sunrise quotes</Text>
            <Text style={styles.rowHint}>A short line scheduled just after local sunrise.</Text>
          </View>
          <Switch
            value={prefs?.sunriseQuotes ?? false}
            onValueChange={(value) => {
              if (!prefs) return;
              void updatePrefs({ ...prefs, sunriseQuotes: value });
            }}
          />
        </View>

        <View style={styles.row}>
          <View style={styles.rowCopy}>
            <Text style={styles.rowLabel}>Sunset nudges</Text>
            <Text style={styles.rowHint}>A gentle Golden Hour reminder before the day closes.</Text>
          </View>
          <Switch
            value={prefs?.sunsetReminders ?? false}
            onValueChange={(value) => {
              if (!prefs) return;
              void updatePrefs({ ...prefs, sunsetReminders: value });
            }}
          />
        </View>

        <View style={styles.row}>
          <View style={styles.rowCopy}>
            <Text style={styles.rowLabel}>Streak-save reminders</Text>
            <Text style={styles.rowHint}>A backup nudge in the evening if the day is slipping away.</Text>
          </View>
          <Switch
            value={prefs?.streakRiskReminders ?? false}
            onValueChange={(value) => {
              if (!prefs) return;
              void updatePrefs({ ...prefs, streakRiskReminders: value });
            }}
          />
        </View>

        {__DEV__ ? (
          <Pressable style={styles.testBtn} onPress={() => void sendTestNotification()}>
            <Text style={styles.testBtnText}>Send test notification</Text>
          </Pressable>
        ) : null}
      </View>

        <Pressable onPress={onResetOnboarding} style={({ pressed }) => [styles.btnAlt, pressed ? { opacity: 0.9 } : null]}>
          <Text style={styles.btnAltText}>Replay Welcome Screens</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={deleteModalVisible} transparent animationType="fade" onRequestClose={() => setDeleteModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEyebrow}>Delete Account</Text>
            <Text style={styles.modalTitle}>Remove this Step Outside account?</Text>
            <Text style={styles.modalBody}>
              This permanently removes your signed-in profile and associated app data where legally permitted, including account-backed sessions, reflections, challenge progress, badges, and saved profile data.
            </Text>
            <Text style={styles.modalWarning}>
              This action cannot be undone. For security, some shared company records may be cleaned up later by a server-side helper.
            </Text>
            {deleteStatus ? <Text style={styles.modalStatus}>{deleteStatus}</Text> : null}

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  if (authAction === "deleteAccount") return;
                  setDeleteModalVisible(false);
                  setDeleteStatus("");
                }}
                style={({ pressed }) => [styles.modalCancelBtn, pressed ? { opacity: 0.9 } : null]}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void onDeleteAccount()}
                disabled={authAction === "deleteAccount"}
                style={({ pressed }) => [
                  styles.modalDeleteBtn,
                  authAction === "deleteAccount" ? styles.authBtnDisabled : null,
                  pressed ? { opacity: 0.92 } : null,
                ]}
              >
                <Text style={styles.modalDeleteText}>
                  {authAction === "deleteAccount" ? "Deleting…" : "Permanently Delete My Account"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: PREMIUM.spacing.screen,
    paddingBottom: 32,
    backgroundColor: PREMIUM.colors.cream,
    flexGrow: 1,
  },
  title: { fontSize: 34, lineHeight: 40, fontWeight: "700", color: PREMIUM.colors.text, fontFamily: PREMIUM.type.serifFamily },
  sub: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: "600",
    color: PREMIUM.colors.textMuted,
    lineHeight: 22,
  },
  accountCard: {
    marginTop: 18,
    borderRadius: PREMIUM.radius.xl,
    backgroundColor: alpha(PREMIUM.colors.creamSoft, 0.84),
    borderWidth: 1,
    borderColor: PREMIUM.colors.line,
    padding: 18,
    gap: 14,
    ...PREMIUM.shadow.soft,
  },
  accountHeader: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: PREMIUM.colors.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: PREMIUM.colors.offWhite,
    fontSize: 18,
    fontWeight: "900",
    fontFamily: PREMIUM.type.serifFamily,
  },
  accountCopy: {
    flex: 1,
    gap: 4,
  },
  accountTitle: {
    color: PREMIUM.colors.text,
    fontSize: 22,
    fontWeight: "700",
    fontFamily: PREMIUM.type.serifFamily,
  },
  accountBody: {
    color: alpha(PREMIUM.colors.text, 0.8),
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
  },
  accountMeta: {
    color: alpha(PREMIUM.colors.text, 0.54),
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  profileStatsRow: {
    flexDirection: "row",
    gap: 10,
  },
  profileStatChip: {
    flex: 1,
    borderRadius: PREMIUM.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: alpha(PREMIUM.colors.forestSoft, 0.10),
    borderWidth: 1,
    borderColor: PREMIUM.colors.line,
  },
  profileStatLabel: {
    color: "rgba(11,15,14,0.55)",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  profileStatValue: {
    marginTop: 6,
    color: PREMIUM.colors.text,
    fontSize: 20,
    fontWeight: "900",
  },
  authLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  authLoadingText: {
    color: "rgba(11,15,14,0.62)",
    fontWeight: "800",
  },
  authActions: {
    gap: 10,
  },
  emailAuthForm: {
    gap: 10,
  },
  authInput: {
    minHeight: 50,
    borderRadius: PREMIUM.radius.md,
    borderWidth: 1,
    borderColor: PREMIUM.colors.line,
    backgroundColor: alpha(PREMIUM.colors.offWhite, 0.72),
    paddingHorizontal: 14,
    color: PREMIUM.colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  emailButtonRow: {
    flexDirection: "row",
    gap: 10,
  },
  emailPrimaryBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: PREMIUM.radius.pill,
    backgroundColor: PREMIUM.colors.forest,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  emailPrimaryBtnText: {
    color: PREMIUM.colors.offWhite,
    fontWeight: "900",
  },
  emailSecondaryBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: PREMIUM.radius.pill,
    backgroundColor: alpha(PREMIUM.colors.forestSoft, 0.12),
    borderWidth: 1,
    borderColor: PREMIUM.colors.lineStrong,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  emailSecondaryBtnText: {
    color: PREMIUM.colors.forest,
    fontWeight: "900",
  },
  resetPasswordBtn: {
    alignSelf: "flex-start",
    paddingVertical: 6,
  },
  resetPasswordText: {
    color: "rgba(11,15,14,0.58)",
    fontSize: 13,
    fontWeight: "800",
  },
  googleBtn: {
    minHeight: 52,
    borderRadius: PREMIUM.radius.pill,
    backgroundColor: PREMIUM.colors.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  googleBtnText: {
    color: PREMIUM.colors.offWhite,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  authBtnDisabled: {
    opacity: 0.6,
  },
  authSetupNote: {
    color: "rgba(11,15,14,0.55)",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  setupNoteCard: {
    borderRadius: 14,
    backgroundColor: "rgba(11,15,14,0.05)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.08)",
    padding: 12,
    gap: 4,
  },
  setupNoteTitle: {
    color: "#0B0F0E",
    fontWeight: "900",
    fontSize: 13,
  },
  signedInRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  signedInPillWrap: {
    gap: 6,
    flexShrink: 1,
  },
  signedInPill: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(37,94,54,0.12)",
    color: "#255E36",
    fontWeight: "900",
  },
  signedInHelper: {
    color: "rgba(11,15,14,0.52)",
    fontSize: 12,
    fontWeight: "700",
  },
  signOutBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "rgba(11,15,14,0.08)",
  },
  signOutBtnText: {
    color: "#0B0F0E",
    fontWeight: "900",
  },
  authStatus: {
    color: "rgba(11,15,14,0.62)",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  streakCard: {
    marginTop: 14,
    width: "100%",
    borderRadius: PREMIUM.radius.xl,
    backgroundColor: alpha(PREMIUM.colors.gold, 0.14),
    borderWidth: 1,
    borderColor: alpha(PREMIUM.colors.goldDeep, 0.24),
    padding: 18,
  },
  streakEyebrow: {
    color: "#8A5D09",
    fontWeight: "900",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontSize: 11,
  },
  streakTitle: {
    marginTop: 6,
    color: PREMIUM.colors.text,
    fontWeight: "700",
    fontSize: 22,
    fontFamily: PREMIUM.type.serifFamily,
  },
  streakBody: {
    marginTop: 8,
    color: "rgba(11,15,14,0.66)",
    fontWeight: "700",
    lineHeight: 19,
  },
  streakRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  streakLabel: {
    color: "rgba(11,15,14,0.66)",
    fontWeight: "700",
  },
  streakValue: {
    color: "#0B0F0E",
    fontWeight: "900",
  },
  streakPreviewRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  streakPreviewLabel: {
    color: "rgba(11,15,14,0.66)",
    fontWeight: "700",
  },
  streakPreviewValue: {
    color: "#8A5D09",
    fontWeight: "900",
  },
  planCard: {
    marginTop: 14,
    width: "100%",
    borderRadius: PREMIUM.radius.xl,
    backgroundColor: alpha(PREMIUM.colors.forestSoft, 0.12),
    borderWidth: 1,
    borderColor: PREMIUM.colors.line,
    padding: 18,
    ...PREMIUM.shadow.soft,
  },
  planTopRow: {
    gap: 14,
  },
  planEyebrow: {
    color: "#255E36",
    fontWeight: "900",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontSize: 11,
  },
  planTitle: {
    marginTop: 4,
    color: PREMIUM.colors.text,
    fontWeight: "700",
    fontSize: 24,
    fontFamily: PREMIUM.type.serifFamily,
  },
  planBody: {
    marginTop: 6,
    color: "rgba(11,15,14,0.62)",
    fontWeight: "700",
    lineHeight: 19,
  },
  btn: {
    backgroundColor: PREMIUM.colors.forest,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: PREMIUM.radius.pill,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  btnText: { color: PREMIUM.colors.offWhite, fontWeight: "900", letterSpacing: 0.4 },
  notificationsCard: {
    marginTop: 14,
    width: "100%",
    backgroundColor: alpha(PREMIUM.colors.offWhite, 0.72),
    borderWidth: 1,
    borderColor: PREMIUM.colors.line,
    padding: 18,
    borderRadius: PREMIUM.radius.xl,
    ...PREMIUM.shadow.soft,
  },
  notificationsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 8,
  },
  notificationsTitle: { fontWeight: "700", color: PREMIUM.colors.text, marginBottom: 8, fontSize: 24, fontFamily: PREMIUM.type.serifFamily },
  notificationsBody: { color: PREMIUM.colors.textMuted, fontWeight: "700", lineHeight: 20, maxWidth: 240 },
  reminderPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: alpha(PREMIUM.colors.forest, 0.12),
  },
  reminderPillText: {
    color: PREMIUM.colors.forest,
    fontWeight: "900",
    fontSize: 12,
  },
  settingsCard: {
    marginTop: 14,
    width: "100%",
    borderRadius: PREMIUM.radius.xl,
    backgroundColor: alpha(PREMIUM.colors.danger, 0.05),
    borderWidth: 1,
    borderColor: alpha(PREMIUM.colors.danger, 0.18),
    padding: 18,
    gap: 8,
    ...PREMIUM.shadow.soft,
  },
  settingsEyebrow: {
    color: "#A32727",
    fontWeight: "900",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontSize: 11,
  },
  settingsTitle: {
    color: PREMIUM.colors.text,
    fontWeight: "700",
    fontSize: 24,
    fontFamily: PREMIUM.type.serifFamily,
  },
  settingsBody: {
    color: PREMIUM.colors.textMuted,
    fontWeight: "700",
    lineHeight: 20,
  },
  deleteBtn: {
    marginTop: 6,
    backgroundColor: "#B42318",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: PREMIUM.radius.pill,
    alignSelf: "flex-start",
  },
  deleteBtnText: {
    color: "#FFFFFF",
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  deleteHint: {
    color: PREMIUM.colors.textSoft,
    fontSize: 12,
    fontWeight: "700",
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 10 },
  rowCopy: { flex: 1 },
  rowLabel: { fontWeight: "700", color: PREMIUM.colors.text },
  rowHint: { marginTop: 3, color: PREMIUM.colors.textSoft, fontWeight: "600", fontSize: 12, lineHeight: 17 },
  testBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: alpha(PREMIUM.colors.forest, 0.14),
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: PREMIUM.radius.pill,
  },
  testBtnText: { color: PREMIUM.colors.forest, fontWeight: "900" },
  btnAlt: {
    marginTop: 12,
    backgroundColor: alpha(PREMIUM.colors.text, 0.08),
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: PREMIUM.radius.pill,
    alignSelf: "flex-start",
  },
  btnAltText: { color: PREMIUM.colors.textMuted, fontWeight: "900", letterSpacing: 0.3 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: alpha(PREMIUM.colors.text, 0.56),
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: PREMIUM.radius.hero,
    backgroundColor: PREMIUM.colors.cream,
    padding: 22,
    gap: 10,
    borderWidth: 1,
    borderColor: PREMIUM.colors.line,
    ...PREMIUM.shadow.hero,
  },
  modalEyebrow: {
    color: "#A32727",
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontSize: 11,
  },
  modalTitle: {
    color: PREMIUM.colors.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
    fontFamily: PREMIUM.type.serifFamily,
  },
  modalBody: {
    color: PREMIUM.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  modalWarning: {
    color: PREMIUM.colors.danger,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  modalStatus: {
    color: "#A32727",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  modalActions: {
    marginTop: 8,
    gap: 10,
  },
  modalCancelBtn: {
    minHeight: 48,
    borderRadius: PREMIUM.radius.pill,
    backgroundColor: alpha(PREMIUM.colors.text, 0.08),
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  modalCancelText: {
    color: PREMIUM.colors.text,
    fontWeight: "900",
  },
  modalDeleteBtn: {
    minHeight: 52,
    borderRadius: PREMIUM.radius.pill,
    backgroundColor: PREMIUM.colors.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  modalDeleteText: {
    color: "#FFFFFF",
    fontWeight: "900",
    textAlign: "center",
  },
});
