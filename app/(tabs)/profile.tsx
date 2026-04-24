import * as Google from "expo-auth-session/providers/google";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { resetOnboarding } from "../../src/lib/onboarding";
import {
  getNotificationPrefs,
  requestNotificationPermission,
  scheduleSmartReminders,
  sendTestNotification,
  setNotificationPrefs,
  type NotificationPrefs,
} from "../../src/lib/notifications";
import { getProState } from "../../src/lib/pro";
import { EMPTY_SUMMARY, getSummary, type SummaryStats } from "../../src/lib/store";

type AuthAction = "google" | "emailSignIn" | "emailSignUp" | "passwordReset" | "signOut" | null;

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
      onStatus("Google sign-in is still warming up.");
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

  const [isPro, setIsPro] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [authUser, setAuthUser] = useState<AuthUserSnapshot | null>(null);
  const [cachedAuthUser, setCachedAuthUser] = useState<AuthUserSnapshot | null>(null);
  const [summary, setSummary] = useState<SummaryStats>(EMPTY_SUMMARY);
  const [authLoading, setAuthLoading] = useState(true);
  const [authAction, setAuthAction] = useState<AuthAction>(null);
  const [authStatus, setAuthStatus] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  const googleEnabled = Boolean(
    ENV.AUTH.googleWebClientId && (Platform.OS !== "ios" || ENV.AUTH.googleIosClientId)
  );

  const visibleUser = authUser ?? cachedAuthUser;
  const providerLabel = useMemo(() => formatProviderLabel(visibleUser), [visibleUser]);
  const reminderCount = useMemo(() => enabledReminderCount(prefs), [prefs]);
  const profileHeadline = visibleUser
    ? firstNonEmpty(visibleUser.displayName, visibleUser.email, "Profile ready")
    : "Keep your progress close";
  const profileBody = visibleUser
    ? firstNonEmpty(
        visibleUser.email,
        "This account is attached to your Step Outside profile on this device."
      )
    : "Sign in to keep your Pro access and future cloud sync tied to you, not just this phone.";
  const profileSupport = visibleUser
    ? "Walk history is still stored locally while cloud sync comes online."
    : "Your current walks are still safe on this device even if you stay signed out.";

  const loadSettings = useCallback(async () => {
    const [pro, np, storedSummary] = await Promise.allSettled([
      getProState(),
      getNotificationPrefs(),
      getSummary(),
    ]);
    setIsPro(pro.status === "fulfilled" ? pro.value.isPro : false);
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

  return (
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
            <Text style={styles.profileStatValue}>{summary.currentStreakDays}d</Text>
          </View>
          <View style={styles.profileStatChip}>
            <Text style={styles.profileStatLabel}>Outside</Text>
            <Text style={styles.profileStatValue}>{formatMinutesLabel(summary.totalMinutes)}</Text>
          </View>
        </View>

        {authLoading && !visibleUser ? (
          <View style={styles.authLoadingRow}>
            <ActivityIndicator color="#255E36" />
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
              <Text style={styles.authSetupNote}>Google sign-in will appear as soon as the client IDs are added to Expo envs.</Text>
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

      <View style={styles.planCard}>
        <View style={styles.planTopRow}>
          <View>
            <Text style={styles.planEyebrow}>Plan</Text>
            <Text style={styles.planTitle}>{isPro ? "Pro Active" : "Free Plan"}</Text>
            <Text style={styles.planBody}>
              {isPro
                ? "Your Pro features are available on this device."
                : "Upgrade when you want the full route, reflection, and reminder experience."}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push("/pro")}
            style={({ pressed }) => [styles.btn, pressed ? { opacity: 0.9 } : null]}
          >
            <Text style={styles.btnText}>{isPro ? "Manage Pro" : "Unlock Pro"}</Text>
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
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 32,
    backgroundColor: "#F8F4EE",
    flexGrow: 1,
  },
  title: { fontSize: 28, fontWeight: "900", color: "#0B0F0E" },
  sub: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(11,15,14,0.65)",
    lineHeight: 20,
  },
  accountCard: {
    marginTop: 18,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.10)",
    padding: 16,
    gap: 14,
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
    backgroundColor: "#255E36",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },
  accountCopy: {
    flex: 1,
    gap: 4,
  },
  accountTitle: {
    color: "#0B0F0E",
    fontSize: 18,
    fontWeight: "900",
  },
  accountBody: {
    color: "rgba(11,15,14,0.76)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  accountMeta: {
    color: "rgba(11,15,14,0.5)",
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
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "rgba(37,94,54,0.08)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.10)",
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
    color: "#0B0F0E",
    fontSize: 18,
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.12)",
    backgroundColor: "rgba(255,255,255,0.78)",
    paddingHorizontal: 14,
    color: "#0B0F0E",
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
    borderRadius: 14,
    backgroundColor: "#255E36",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  emailPrimaryBtnText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  emailSecondaryBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: "rgba(37,94,54,0.11)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.16)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  emailSecondaryBtnText: {
    color: "#255E36",
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
    borderRadius: 16,
    backgroundColor: "#255E36",
    alignItems: "center",
    justifyContent: "center",
  },
  googleBtnText: {
    color: "#FFFFFF",
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
  planCard: {
    marginTop: 14,
    width: "100%",
    borderRadius: 18,
    backgroundColor: "rgba(37,94,54,0.08)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.12)",
    padding: 14,
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
    color: "#0B0F0E",
    fontWeight: "900",
    fontSize: 20,
  },
  planBody: {
    marginTop: 6,
    color: "rgba(11,15,14,0.62)",
    fontWeight: "700",
    lineHeight: 19,
  },
  btn: {
    backgroundColor: "#255E36",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  btnText: { color: "white", fontWeight: "900", letterSpacing: 0.4 },
  notificationsCard: {
    marginTop: 14,
    width: "100%",
    borderRadius: 18,
    backgroundColor: "rgba(11,15,14,0.06)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.12)",
    padding: 14,
  },
  notificationsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 8,
  },
  notificationsTitle: { fontWeight: "900", color: "#0B0F0E", marginBottom: 8, fontSize: 17 },
  notificationsBody: { color: "rgba(11,15,14,0.62)", fontWeight: "700", lineHeight: 19, maxWidth: 240 },
  reminderPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(37,94,54,0.12)",
  },
  reminderPillText: {
    color: "#255E36",
    fontWeight: "900",
    fontSize: 12,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 8 },
  rowCopy: { flex: 1 },
  rowLabel: { fontWeight: "700", color: "rgba(11,15,14,0.75)" },
  rowHint: { marginTop: 3, color: "rgba(11,15,14,0.55)", fontWeight: "600", fontSize: 12, lineHeight: 17 },
  testBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: "rgba(37,94,54,0.14)",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  testBtnText: { color: "#255E36", fontWeight: "900" },
  btnAlt: {
    marginTop: 12,
    backgroundColor: "rgba(11,15,14,0.08)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignSelf: "flex-start",
  },
  btnAltText: { color: "rgba(11,15,14,0.72)", fontWeight: "900", letterSpacing: 0.3 },
});
