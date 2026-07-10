import * as Google from "expo-auth-session/providers/google";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { OutdoorTheme } from "../../constants/theme";
import { ENV } from "../../env";
import { usePremiumAccess } from "../../hooks/use-premium-access";
import { CampfireGlyph } from "../../src/components/OutdoorDecor";
import { OutdoorIcon } from "../../src/components/OutdoorIcons";
import { BrandCard, LayeredEnvironment, PremiumHero, SectionHeader, StatCard } from "../../src/components/OutdoorUI";
import { logRestorePurchasesTapped, logSignupStarted, logSubscriptionRestored } from "../../src/lib/analytics";
import {
  createEmailPasswordAccount,
  getCachedAuthUser,
  sendEmailPasswordReset,
  signInWithEmailPassword,
  signInWithGoogleIdTokenResult,
  signOutUser,
  subscribeToAuth,
  type AuthUserSnapshot,
} from "../../src/lib/auth";
import { getAuthenticatedEntryRoute } from "../../src/lib/authFlow";
import { clearNewAccountNeedsWelcome, markNewAccountNeedsWelcome, resetOnboarding } from "../../src/lib/onboarding";
import {
  getNotificationPrefs,
  requestNotificationPermission,
  scheduleSmartReminders,
  sendTestNotification,
  setNotificationPrefs,
  type NotificationPrefs,
} from "../../src/lib/notifications";
import { formatProMembershipLabel, restorePurchasesScaffold } from "../../src/lib/pro";
import { EMPTY_SUMMARY, getSessions, getSummary, type SummaryStats } from "../../src/lib/store";
import { getCurrentUserProfile, type UserProfile } from "../../src/lib/userProfile";

WebBrowser.maybeCompleteAuthSession();

type AuthAction =
  | "google"
  | "emailSignIn"
  | "emailSignUp"
  | "passwordReset"
  | "restorePurchases"
  | "signOut"
  | null;

function firstNonEmpty(...values: (string | null | undefined)[]): string {
  for (const value of values) {
    if (value?.trim()) return value.trim();
  }
  return "";
}

function getInitials(profile: UserProfile | null, user: AuthUserSnapshot | null): string {
  const label = firstNonEmpty(profile?.displayName, profile?.username, user?.displayName, user?.email, "SO");
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

function getAuthErrorCode(error: unknown): string {
  if (typeof error !== "object" || error === null || !("code" in error)) return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

function formatAuthError(error: unknown, fallback: string): string {
  switch (getAuthErrorCode(error)) {
    case "auth/email-already-in-use":
      return "That email already has an account. Try signing in instead.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Email or password is incorrect.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a bit and try again.";
    case "auth/network-request-failed":
      return "Check your connection and try again.";
    case "auth/account-exists-with-different-credential":
      return "That email already uses another sign-in method. Try email sign-in first.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    default:
      break;
  }

  const message = error instanceof Error ? error.message : "";
  if (message.includes("cancel")) return "Sign-in was canceled.";
  if (message.includes("network")) return "Sign-in needs a connection right now.";
  return fallback;
}

function isGoogleAuthConfigured(): boolean {
  if (!ENV.AUTH.googleWebClientId) return false;
  if (Platform.OS === "ios") return Boolean(ENV.AUTH.googleIosClientId);
  if (Platform.OS === "android") return Boolean(ENV.AUTH.googleAndroidClientId);
  return true;
}

function formatMinutesLabel(minutes: number): string {
  if (minutes <= 0) return "0 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return hours >= 10 || Number.isInteger(hours) ? `${Math.round(hours)} hr` : `${hours.toFixed(1)} hr`;
}

function formatMilesLabel(miles: number): string {
  if (miles <= 0) return "0.0";
  if (miles < 10) return miles.toFixed(1);
  return String(Math.round(miles));
}

function enabledReminderCount(prefs: NotificationPrefs | null): number {
  if (!prefs) return 0;
  return [prefs.sunriseQuotes, prefs.sunsetReminders, prefs.streakRiskReminders].filter(Boolean).length;
}

type GoogleSignInButtonProps = {
  disabled: boolean;
  isLoading: boolean;
  onStart: () => void;
  onFinish: () => void;
  onAuthenticated: (user: AuthUserSnapshot, isNewAccount?: boolean) => Promise<void>;
  onStatus: (message: string) => void;
};

function GoogleSignInButton({
  disabled,
  isLoading,
  onStart,
  onFinish,
  onAuthenticated,
  onStatus,
}: GoogleSignInButtonProps) {
  const [googleRequest, googleResponse, promptGoogleAsync] = Google.useIdTokenAuthRequest({
    iosClientId: ENV.AUTH.googleIosClientId ?? undefined,
    androidClientId: ENV.AUTH.googleAndroidClientId ?? undefined,
    webClientId: ENV.AUTH.googleWebClientId ?? undefined,
    scopes: ["openid", "profile", "email"],
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
      onStatus("Google didn’t return the sign-in token. Please try again.");
      onFinish();
      return;
    }

    void (async () => {
      try {
        const result = await signInWithGoogleIdTokenResult(
          idToken,
          response.authentication?.accessToken ?? response.params?.access_token ?? null
        );
        await onAuthenticated(result.user, result.isNewUser);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onStatus("Signed in with Google.");
      } catch (error) {
        onStatus(formatAuthError(error, "Google sign-in hit a snag."));
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        onFinish();
      }
    })();
  }, [googleResponse, onAuthenticated, onFinish, onStatus]);

  const onPress = async () => {
    if (disabled || isLoading) return;

    if (!googleRequest) {
      onStatus("Google sign-in is still getting ready.");
      return;
    }

    onStatus("");
    onStart();
    void Haptics.selectionAsync();

    try {
      await promptGoogleAsync();
    } catch (error) {
      onStatus(formatAuthError(error, "Google sign-in couldn’t open."));
      onFinish();
    }
  };

  return (
    <Pressable
      onPress={() => void onPress()}
      disabled={disabled || isLoading}
      style={({ pressed }) => [
        styles.googleBtn,
        disabled || isLoading ? styles.authBtnDisabled : null,
        pressed ? { opacity: 0.95 } : null,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator color="#1E2A24" />
      ) : (
        <View style={styles.googleBtnContent}>
          <View style={styles.googleIcon}>
            <Text style={styles.googleIconText}>G</Text>
          </View>
          <Text style={styles.googleBtnText}>Continue with Google</Text>
        </View>
      )}
    </Pressable>
  );
}

export default function ProfileTab() {
  const router = useRouter();

  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [authUser, setAuthUser] = useState<AuthUserSnapshot | null>(null);
  const [cachedAuthUser, setCachedAuthUser] = useState<AuthUserSnapshot | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [summary, setSummary] = useState<SummaryStats>(EMPTY_SUMMARY);
  const [totalMiles, setTotalMiles] = useState(0);
  const [authLoading, setAuthLoading] = useState(true);
  const [authAction, setAuthAction] = useState<AuthAction>(null);
  const [authStatus, setAuthStatus] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const { isPremium, plan, membershipLabel, refreshPremiumStatus } = usePremiumAccess();

  const googleEnabled = isGoogleAuthConfigured();

  const visibleUser = authLoading ? authUser ?? cachedAuthUser : authUser;
  const providerLabel = useMemo(() => formatProviderLabel(visibleUser), [visibleUser]);
  const reminderCount = useMemo(() => enabledReminderCount(prefs), [prefs]);
  const currentStreak = summary.currentStreak ?? summary.currentStreakDays ?? 0;
  const profilePhotoURL = firstNonEmpty(profile?.photoURL, visibleUser?.photoURL);
  const profileHeadline = visibleUser
    ? firstNonEmpty(profile?.displayName, visibleUser.displayName, profile?.username, "Profile ready")
    : "Keep your progress close";
  const usernameLabel = visibleUser
    ? profile?.username
      ? `@${profile.username}`
      : "Choose a username"
    : "Create or sign in first";
  const emailStatus = visibleUser
    ? firstNonEmpty(visibleUser.email, `${providerLabel} account connected`)
    : "No account connected";
  const profileBody = visibleUser
    ? firstNonEmpty(
        profile?.outdoorGoal,
        profile?.favoriteActivity,
        "Your outdoor rhythm, friends, and Premium access live here."
      )
    : "Create an account or sign in first. After that, you can add a display name, username, and photo.";
  const founderActive = isPremium && (plan === "lifetime" || membershipLabel === "Founder Lifetime");

  const loadSettings = useCallback(async () => {
    const [np, storedSummary, storedSessions, storedProfile] = await Promise.allSettled([
      getNotificationPrefs(),
      getSummary(),
      getSessions(),
      getCurrentUserProfile(),
    ]);
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
    setTotalMiles(
      storedSessions.status === "fulfilled"
        ? storedSessions.value.reduce((total, session) => total + Math.max(0, session.distanceM ?? 0), 0) / 1609.344
        : 0
    );
    setProfile(storedProfile.status === "fulfilled" ? storedProfile.value : null);
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
      if (user) {
        void loadSettings();
      } else {
        setSummary(EMPTY_SUMMARY);
        setTotalMiles(0);
        setProfile(null);
        setAuthPassword("");
      }
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

  const onAuthenticated = useCallback(
    async (user: AuthUserSnapshot, isNewAccount = false) => {
      setAuthUser(user);
      setCachedAuthUser(user);
      await loadSettings();
      setAuthPassword("");
      const nextRoute = isNewAccount ? "/profile-setup" : await getAuthenticatedEntryRoute();
      router.replace(nextRoute as never);
    },
    [loadSettings, router]
  );

  const onEmailSignIn = async () => {
    if (authAction !== null) return;

    Keyboard.dismiss();
    const form = validateEmailForm(true);
    if (!form) return;

    setAuthStatus("");
    setAuthAction("emailSignIn");
    void Haptics.selectionAsync();

    try {
      const user = await signInWithEmailPassword(form.email, form.password);
      await clearNewAccountNeedsWelcome();
      await onAuthenticated(user, false);
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
    if (authAction !== null) return;

    Keyboard.dismiss();
    const form = validateEmailForm(true);
    if (!form) return;

    setAuthStatus("");
    setAuthAction("emailSignUp");
    void logSignupStarted();
    void Haptics.selectionAsync();

    try {
      const user = await createEmailPasswordAccount(form.email, form.password);
      await markNewAccountNeedsWelcome();
      await onAuthenticated(user, true);
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
    if (authAction !== null) return;

    Keyboard.dismiss();
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
    if (authAction !== null) return;

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
            setAuthUser(null);
            setCachedAuthUser(null);
            setAuthEmail("");
            setAuthPassword("");
            setAuthStatus("Signed out.");
            void Haptics.selectionAsync();
            router.replace("/auth" as never);
          } catch (error) {
            setAuthStatus(formatAuthError(error, "Couldn’t sign out right now."));
          } finally {
            setAuthAction(null);
          }
        },
      },
    ]);
  };

  const onRestorePurchases = async () => {
    if (authAction !== null) return;

    setAuthStatus("");
    setAuthAction("restorePurchases");
    void logRestorePurchasesTapped("profile");
    try {
      const next = await restorePurchasesScaffold();
      await refreshPremiumStatus();
      if (next.isPro) {
        void logSubscriptionRestored();
      }
      Alert.alert(
        next.isPro ? "Purchases restored" : "No Premium purchases found",
        next.isPro
          ? `${formatProMembershipLabel(next)} is active on this device.`
          : "This Apple account does not currently have an active Step Outside Premium entitlement."
      );
    } catch {
      Alert.alert("Restore failed", "Please try again in a moment.");
    } finally {
      setAuthAction(null);
    }
  };

  const openSignedInRoute = (
    pathname: "/friends" | "/friends-search" | "/friend-requests" | "/challenges" | "/leaderboard"
  ) => {
    if (!visibleUser) {
      Alert.alert("Sign in first", "Create an account or sign in to use Step Outside social features.");
      return;
    }

    router.push(pathname as never);
  };

  const onEditProfile = () => {
    if (!visibleUser) {
      Alert.alert("Sign in first", "Create an account or sign in before editing your public profile.");
      return;
    }

    router.push("/edit-profile" as never);
  };

  return (
    <View style={styles.screen}>
      <LayeredEnvironment />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <PremiumHero
        variant="forest"
        style={styles.hero}
        eyebrow="Step Outside"
        title="Profile"
        subtitle="Your walks, people, and Premium access in one quiet place."
      />

      <BrandCard withPines style={styles.userCard}>
        <View style={styles.userTopRow}>
          <View style={styles.avatar}>
            {profilePhotoURL ? (
              <Image source={{ uri: profilePhotoURL }} style={styles.avatarImage} resizeMode="cover" />
            ) : (
              <Text style={styles.avatarText}>{getInitials(profile, visibleUser)}</Text>
            )}
          </View>

          <View style={styles.userIdentity}>
            <Text style={styles.userName} numberOfLines={2}>
              {profileHeadline}
            </Text>
            <Text style={styles.username} numberOfLines={1}>
              {usernameLabel}
            </Text>
            <View style={styles.statusPill}>
              <Ionicons name={visibleUser ? "checkmark-circle" : "person-circle-outline"} size={15} color="#18442F" />
              <Text style={styles.statusPillText} numberOfLines={1}>
                {emailStatus}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.userBody}>{profileBody}</Text>

        {authLoading && !visibleUser ? (
          <View style={styles.authLoadingRow}>
            <ActivityIndicator color="#18442F" />
            <Text style={styles.authLoadingText}>Checking your account...</Text>
          </View>
        ) : null}

        {!visibleUser ? (
          <View style={styles.authPanel}>
            <View style={styles.authIntro}>
              <Text style={styles.authIntroTitle}>Start with your account</Text>
              <Text style={styles.authIntroText}>
                Use email and password below, then edit your public profile after you are signed in.
              </Text>
            </View>
            <TextInput
              value={authEmail}
              onChangeText={setAuthEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="Email"
              placeholderTextColor="rgba(30,42,36,0.42)"
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
              placeholderTextColor="rgba(30,42,36,0.42)"
              style={styles.authInput}
            />
            <View style={styles.authButtonGrid}>
              <Pressable
                onPress={() => void onEmailSignIn()}
                disabled={authAction !== null}
                style={({ pressed }) => [
                  styles.primaryButton,
                  authAction !== null ? styles.disabled : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {authAction === "emailSignIn" ? "Signing in..." : "Sign in"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void onEmailSignUp()}
                disabled={authAction !== null}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  authAction !== null ? styles.disabled : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={styles.secondaryButtonText}>
                  {authAction === "emailSignUp" ? "Creating..." : "Create account"}
                </Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => void onPasswordReset()}
              disabled={authAction !== null}
              style={({ pressed }) => [styles.textButton, pressed ? styles.pressed : null]}
            >
              <Text style={styles.textButtonText}>
                {authAction === "passwordReset" ? "Sending reset..." : "Forgot password?"}
              </Text>
            </Pressable>

            {googleEnabled ? (
              <GoogleSignInButton
                disabled={authAction !== null}
                isLoading={authAction === "google"}
                onStart={() => setAuthAction("google")}
                onFinish={() => setAuthAction(null)}
                onAuthenticated={async (user, isNewAccount = false) => {
                  if (isNewAccount) {
                    await markNewAccountNeedsWelcome();
                  } else {
                    await clearNewAccountNeedsWelcome();
                  }
                  await onAuthenticated(user, isNewAccount);
                }}
                onStatus={setAuthStatus}
              />
            ) : (
              <Text style={styles.authSetupNote}>
                Google sign-in will appear after the iOS and web OAuth client IDs are added to the Expo env.
              </Text>
            )}
          </View>
        ) : null}

        {authStatus ? <Text style={styles.authStatus}>{authStatus}</Text> : null}
      </BrandCard>

      <View style={styles.section}>
        <SectionHeader title="Stats" style={styles.profileSectionHeader} />
        <View style={styles.statsGrid}>
          <StatCard label="Walks" value={summary.totalSessions} style={styles.statCard} />
          <StatCard label="Streak" value={`${currentStreak}d`} style={styles.statCard} />
          <StatCard label="Outside Time" value={formatMinutesLabel(summary.totalMinutes)} style={styles.statCard} />
          <StatCard label="Miles" value={formatMilesLabel(totalMiles)} style={styles.statCard} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Friends</Text>
        <View style={styles.actionGrid}>
          <Pressable
            onPress={() => openSignedInRoute("/friends")}
            style={({ pressed }) => [styles.actionTile, pressed ? styles.pressed : null]}
          >
            <OutdoorIcon name="tree" size={23} color="#18442F" />
            <Text style={styles.actionTitle}>Friends</Text>
            <Text style={styles.actionHint}>Your circle</Text>
          </Pressable>
          <Pressable
            onPress={() => openSignedInRoute("/friends-search")}
            style={({ pressed }) => [styles.actionTile, pressed ? styles.pressed : null]}
          >
            <OutdoorIcon name="binoculars" size={23} color="#18442F" />
            <Text style={styles.actionTitle}>Find Friends</Text>
            <Text style={styles.actionHint}>Search by username</Text>
          </Pressable>
          <Pressable
            onPress={() => openSignedInRoute("/friend-requests")}
            style={({ pressed }) => [styles.actionTileWide, pressed ? styles.pressed : null]}
          >
            <OutdoorIcon name="map" size={23} color="#18442F" />
            <View style={styles.actionCopy}>
              <Text style={styles.actionTitle}>Requests</Text>
              <Text style={styles.actionHint}>Incoming and outgoing invites</Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => openSignedInRoute("/leaderboard")}
            style={({ pressed }) => [styles.actionTileWide, pressed ? styles.pressed : null]}
          >
            <OutdoorIcon name="mountain" size={23} color="#18442F" />
            <View style={styles.actionCopy}>
              <Text style={styles.actionTitle}>Leaderboard</Text>
              <Text style={styles.actionHint}>Friends, global, weekly, monthly</Text>
            </View>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Challenges</Text>
        <Pressable
          onPress={() => openSignedInRoute("/challenges")}
          style={({ pressed }) => [styles.challengeTile, pressed ? styles.pressed : null]}
        >
          <View style={styles.challengeIcon}>
            <OutdoorIcon name="trail" size={23} color="#18442F" />
          </View>
          <View style={styles.actionCopy}>
            <Text style={styles.actionTitle}>Friend Challenges</Text>
            <Text style={styles.actionHint}>Incoming invites and weekly challenges you sent</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="rgba(30,42,36,0.42)" />
        </Pressable>
      </View>

      <View style={styles.premiumCard}>
        <CampfireGlyph style={styles.premiumFire} size={50} opacity={0.2} />
        <View style={styles.premiumHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>Premium</Text>
            <Text style={styles.premiumTitle}>{membershipLabel}</Text>
          </View>
          {founderActive ? (
            <View style={styles.founderBadge}>
              <Text style={styles.founderBadgeText}>Founder</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.premiumBody}>
          {isPremium
            ? "Saved route maps, deeper stats, and solar bonus achievements are active."
            : "Unlock saved route maps, deeper progress insights, and sunrise or sunset achievements."}
        </Text>
        <View style={styles.benefitsGrid}>
          <Text style={styles.benefit}>Saved GPS route maps</Text>
          <Text style={styles.benefit}>Advanced streaks</Text>
          <Text style={styles.benefit}>Monthly progress</Text>
          <Text style={styles.benefit}>Solar bonuses</Text>
        </View>
        <Pressable
          onPress={() => router.push("/pro")}
          style={({ pressed }) => [styles.premiumButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.premiumButtonText}>{isPremium ? "Manage Premium" : "Unlock Premium"}</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Settings</Text>
        <View style={styles.settingsList}>
          {visibleUser ? (
            <Pressable onPress={onEditProfile} style={({ pressed }) => [styles.settingsRow, pressed ? styles.pressed : null]}>
              <View style={styles.settingsIcon}>
                <OutdoorIcon name="park-badge" size={21} color="#18442F" />
              </View>
              <View style={styles.settingsCopy}>
                <Text style={styles.settingsTitle}>Edit Profile</Text>
                <Text style={styles.settingsHint}>Photo, display name, and username</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(30,42,36,0.38)" />
            </Pressable>
          ) : null}

          <View style={styles.notificationsBlock}>
            <View style={styles.notificationsHeader}>
              <View>
                <Text style={styles.settingsTitle}>Notifications</Text>
                <Text style={styles.settingsHint}>{reminderCount === 0 ? "All reminders off" : `${reminderCount} reminders on`}</Text>
              </View>
              <OutdoorIcon name="fire" size={21} color={OutdoorTheme.colors.gold} accentColor={OutdoorTheme.colors.campfire} />
            </View>

            <View style={styles.toggleRow}>
              <View style={styles.toggleCopy}>
                <Text style={styles.toggleLabel}>Sunrise quotes</Text>
                <Text style={styles.toggleHint}>A short line after local sunrise.</Text>
              </View>
              <Switch
                value={prefs?.sunriseQuotes ?? false}
                onValueChange={(value) => {
                  if (!prefs) return;
                  void updatePrefs({ ...prefs, sunriseQuotes: value });
                }}
              />
            </View>

            <View style={styles.toggleRow}>
              <View style={styles.toggleCopy}>
                <Text style={styles.toggleLabel}>Sunset nudges</Text>
                <Text style={styles.toggleHint}>A gentle reminder before day closes.</Text>
              </View>
              <Switch
                value={prefs?.sunsetReminders ?? false}
                onValueChange={(value) => {
                  if (!prefs) return;
                  void updatePrefs({ ...prefs, sunsetReminders: value });
                }}
              />
            </View>

            <View style={styles.toggleRow}>
              <View style={styles.toggleCopy}>
                <Text style={styles.toggleLabel}>Streak-save reminders</Text>
                <Text style={styles.toggleHint}>A backup nudge when momentum needs help.</Text>
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
              <Pressable style={styles.smallGoldButton} onPress={() => void sendTestNotification()}>
                <Text style={styles.smallGoldButtonText}>Send test notification</Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable
            onPress={() => void onRestorePurchases()}
            disabled={authAction !== null}
            style={({ pressed }) => [styles.settingsRow, authAction !== null ? styles.disabled : null, pressed ? styles.pressed : null]}
          >
            <View style={styles.settingsIcon}>
              <OutdoorIcon name="compass" size={21} color="#18442F" />
            </View>
            <View style={styles.settingsCopy}>
              <Text style={styles.settingsTitle}>
                {authAction === "restorePurchases" ? "Restoring..." : "Restore Purchases"}
              </Text>
              <Text style={styles.settingsHint}>Refresh Premium from RevenueCat</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(30,42,36,0.38)" />
          </Pressable>

          <Pressable onPress={onResetOnboarding} style={({ pressed }) => [styles.settingsRow, pressed ? styles.pressed : null]}>
            <View style={styles.settingsIcon}>
              <OutdoorIcon name="fire" size={21} color="#18442F" />
            </View>
            <View style={styles.settingsCopy}>
              <Text style={styles.settingsTitle}>Replay Welcome Screens</Text>
              <Text style={styles.settingsHint}>See onboarding again next launch</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(30,42,36,0.38)" />
          </Pressable>

          {visibleUser ? (
            <Pressable
              onPress={() => void onSignOut()}
              disabled={authAction === "signOut"}
              style={({ pressed }) => [styles.signOutRow, authAction === "signOut" ? styles.disabled : null, pressed ? styles.pressed : null]}
            >
              <View style={styles.signOutIcon}>
                <Ionicons name="log-out-outline" size={20} color="#8A2E21" />
              </View>
              <View style={styles.settingsCopy}>
                <Text style={styles.signOutTitle}>{authAction === "signOut" ? "Signing out..." : "Sign Out"}</Text>
                <Text style={styles.settingsHint}>Leave this account on this device</Text>
              </View>
            </Pressable>
          ) : null}
        </View>
      </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 36,
    backgroundColor: "transparent",
    flexGrow: 1,
  },
  hero: {
    marginBottom: 18,
    minHeight: 250,
  },
  eyebrow: {
    color: OutdoorTheme.colors.gold,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 4,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
    fontSize: 42,
    lineHeight: 48,
    fontWeight: "700",
    color: "#1E2A24",
  },
  sub: {
    marginTop: 8,
    maxWidth: 360,
    fontSize: 15,
    fontWeight: "700",
    color: "rgba(30,42,36,0.62)",
    lineHeight: 22,
  },
  userCard: {
    borderRadius: OutdoorTheme.radii.xl,
    backgroundColor: OutdoorTheme.colors.paperTranslucent,
    borderWidth: 1,
    borderColor: OutdoorTheme.colors.line,
    padding: 16,
    gap: 16,
    ...OutdoorTheme.shadows.card,
  },
  userTopRow: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#18442F",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(198,155,66,0.75)",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
  },
  userIdentity: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
    color: "#1E2A24",
    fontSize: 26,
    lineHeight: 30,
    fontWeight: "700",
  },
  username: {
    marginTop: 4,
    color: "#18442F",
    fontSize: 14,
    fontWeight: "900",
  },
  statusPill: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "100%",
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: "rgba(24,68,47,0.08)",
  },
  statusPillText: {
    color: "rgba(30,42,36,0.72)",
    fontSize: 12,
    fontWeight: "800",
    flexShrink: 1,
  },
  userBody: {
    color: "rgba(30,42,36,0.68)",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
  },
  authLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  authLoadingText: {
    color: "rgba(30,42,36,0.62)",
    fontWeight: "800",
  },
  authPanel: {
    gap: 12,
  },
  authIntro: {
    borderRadius: OutdoorTheme.radii.md,
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.1)",
    backgroundColor: "rgba(24,68,47,0.06)",
    padding: 12,
    gap: 4,
  },
  authIntroTitle: {
    color: "#1E2A24",
    fontSize: 14,
    fontWeight: "900",
  },
  authIntroText: {
    color: "rgba(30,42,36,0.62)",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  authInput: {
    minHeight: 50,
    borderRadius: OutdoorTheme.radii.md,
    borderWidth: 1,
    borderColor: "rgba(30,42,36,0.12)",
    backgroundColor: "rgba(255,249,239,0.78)",
    paddingHorizontal: 14,
    color: "#1E2A24",
    fontSize: 15,
    fontWeight: "700",
  },
  authButtonGrid: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  primaryButton: {
    flex: 1,
    minWidth: 136,
    minHeight: 50,
    borderRadius: OutdoorTheme.radii.md,
    backgroundColor: "#18442F",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  secondaryButton: {
    flex: 1,
    minWidth: 136,
    minHeight: 50,
    borderRadius: OutdoorTheme.radii.md,
    backgroundColor: "rgba(24,68,47,0.11)",
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.16)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: "#18442F",
    fontWeight: "900",
  },
  textButton: {
    alignSelf: "flex-start",
    paddingVertical: 6,
  },
  textButtonText: {
    color: "rgba(30,42,36,0.58)",
    fontSize: 13,
    fontWeight: "800",
  },
  googleBtn: {
    minHeight: 52,
    borderRadius: OutdoorTheme.radii.md,
    backgroundColor: OutdoorTheme.colors.paper,
    borderWidth: 1,
    borderColor: "rgba(30,42,36,0.13)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  googleBtnContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  googleIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F7F4EC",
    alignItems: "center",
    justifyContent: "center",
  },
  googleIconText: {
    color: "#18442F",
    fontWeight: "900",
    fontSize: 14,
  },
  googleBtnText: {
    color: "#1E2A24",
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  authBtnDisabled: {
    opacity: 0.6,
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.88,
  },
  authSetupNote: {
    color: "rgba(30,42,36,0.55)",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  setupNoteCard: {
    borderRadius: 14,
    backgroundColor: "rgba(30,42,36,0.05)",
    borderWidth: 1,
    borderColor: "rgba(30,42,36,0.08)",
    padding: 12,
    gap: 4,
  },
  setupNoteTitle: {
    color: "#1E2A24",
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
    backgroundColor: "rgba(24,68,47,0.12)",
    color: "#18442F",
    fontWeight: "900",
  },
  signedInHelper: {
    color: "rgba(30,42,36,0.52)",
    fontSize: 12,
    fontWeight: "700",
  },
  signOutBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "rgba(30,42,36,0.08)",
  },
  signOutBtnText: {
    color: "#1E2A24",
    fontWeight: "900",
  },
  authStatus: {
    color: "rgba(30,42,36,0.62)",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  section: {
    marginTop: 22,
  },
  sectionTitle: {
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "700",
    color: "#1E2A24",
    marginBottom: 12,
  },
  profileSectionHeader: {
    marginBottom: 12,
  },
  sectionEyebrow: {
    color: OutdoorTheme.colors.goldText,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    flexGrow: 1,
    flexBasis: "47%",
    minHeight: 92,
    borderRadius: OutdoorTheme.radii.lg,
    padding: 14,
    justifyContent: "space-between",
    backgroundColor: "rgba(24,68,47,0.08)",
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.11)",
  },
  statLabel: {
    color: "rgba(30,42,36,0.52)",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  statValue: {
    color: "#1E2A24",
    fontSize: 24,
    fontWeight: "900",
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  actionTile: {
    flexGrow: 1,
    flexBasis: "47%",
    minHeight: 118,
    borderRadius: OutdoorTheme.radii.lg,
    padding: 14,
    backgroundColor: OutdoorTheme.colors.paperTranslucent,
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.1)",
    justifyContent: "space-between",
  },
  actionTileWide: {
    flexBasis: "100%",
    minHeight: 72,
    borderRadius: OutdoorTheme.radii.lg,
    padding: 14,
    backgroundColor: OutdoorTheme.colors.paperTranslucent,
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.1)",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  challengeTile: {
    minHeight: 78,
    borderRadius: OutdoorTheme.radii.lg,
    padding: 14,
    backgroundColor: OutdoorTheme.colors.paperTranslucent,
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.1)",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  challengeIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(198,155,66,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionCopy: {
    flex: 1,
  },
  actionTitle: {
    marginTop: 8,
    color: "#1E2A24",
    fontSize: 15,
    fontWeight: "900",
  },
  actionHint: {
    marginTop: 3,
    color: "rgba(30,42,36,0.54)",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  premiumCard: {
    marginTop: 22,
    borderRadius: OutdoorTheme.radii.xl,
    padding: 16,
    backgroundColor: OutdoorTheme.colors.goldTint,
    borderWidth: 1,
    borderColor: "rgba(198,155,66,0.26)",
    overflow: "hidden",
    ...OutdoorTheme.shadows.soft,
  },
  premiumFire: {
    position: "absolute",
    right: 18,
    top: 18,
  },
  premiumHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  premiumTitle: {
    marginTop: 5,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "700",
    color: "#1E2A24",
  },
  founderBadge: {
    borderRadius: 999,
    backgroundColor: "#18442F",
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  founderBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  premiumBody: {
    marginTop: 12,
    color: "rgba(30,42,36,0.68)",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 21,
  },
  benefitsGrid: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  benefit: {
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "rgba(255,249,239,0.54)",
    color: "rgba(30,42,36,0.72)",
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 12,
    fontWeight: "900",
  },
  premiumButton: {
    marginTop: 14,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: OutdoorTheme.radii.md,
    backgroundColor: "#18442F",
    paddingHorizontal: 16,
  },
  premiumButtonText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  settingsList: {
    borderRadius: OutdoorTheme.radii.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(30,42,36,0.1)",
    backgroundColor: OutdoorTheme.colors.paperTranslucent,
    ...OutdoorTheme.shadows.soft,
  },
  settingsRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(30,42,36,0.08)",
  },
  settingsIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(24,68,47,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  settingsCopy: {
    flex: 1,
    minWidth: 0,
  },
  settingsTitle: {
    color: "#1E2A24",
    fontSize: 15,
    fontWeight: "900",
  },
  settingsHint: {
    marginTop: 3,
    color: "rgba(30,42,36,0.52)",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  notificationsBlock: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(30,42,36,0.08)",
    gap: 8,
  },
  notificationsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 2,
  },
  toggleRow: {
    minHeight: 58,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
  },
  toggleCopy: {
    flex: 1,
    minWidth: 0,
  },
  toggleLabel: {
    color: "rgba(30,42,36,0.78)",
    fontSize: 14,
    fontWeight: "900",
  },
  toggleHint: {
    marginTop: 3,
    color: "rgba(30,42,36,0.52)",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  smallGoldButton: {
    marginTop: 4,
    alignSelf: "flex-start",
    borderRadius: OutdoorTheme.radii.sm,
    backgroundColor: "rgba(198,155,66,0.22)",
    paddingVertical: 9,
    paddingHorizontal: 11,
  },
  smallGoldButtonText: {
    color: OutdoorTheme.colors.goldText,
    fontSize: 12,
    fontWeight: "900",
  },
  signOutRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  signOutIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(138,46,33,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  signOutTitle: {
    color: "#8A2E21",
    fontSize: 15,
    fontWeight: "900",
  },
});
