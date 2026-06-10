import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePremiumAccess } from "../../hooks/use-premium-access";
import { accountDeletionRequiresRecentLogin, deleteCurrentAccount } from "../../src/lib/accountDeletion";
import { PREMIUM, alpha } from "../../src/lib/premiumTheme";
import {
  createEmailPasswordAccount,
  sendEmailPasswordReset,
  signInWithEmailPassword,
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
  setNotificationPrefs,
  type NotificationPrefs,
} from "../../src/lib/notifications";
import { EMPTY_SUMMARY, getSessions, getSummary, type SummaryStats } from "../../src/lib/store";
import {
  EMPTY_LOCAL_USER_PROFILE,
  deleteCurrentUserProfilePhotoObject,
  getLocalUserProfile,
  saveCurrentUserProfilePhotoURL,
  saveLocalUserProfile,
  uploadCurrentUserProfilePhoto,
  validateUsername,
  type LocalUserProfile,
  type PreferredActivity,
} from "../../src/lib/userProfile";

type AuthAction = "emailSignIn" | "emailSignUp" | "passwordReset" | "signOut" | "deleteAccount" | null;
type ImagePickerModule = typeof import("expo-image-picker");

function firstNonEmpty(...values: (string | null | undefined)[]): string {
  for (const value of values) {
    if (value?.trim()) return value.trim();
  }
  return "";
}

function getInitials(label: string): string {
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function emailNameFallback(email: string | null | undefined): string {
  const prefix = email?.split("@")[0]?.trim();
  return prefix || "Outside walker";
}

function formatDistanceMiles(distanceM: number): string {
  if (!Number.isFinite(distanceM) || distanceM <= 0) return "0.0 mi";
  return `${(distanceM / 1609.344).toFixed(distanceM >= 16093.44 ? 0 : 1)} mi`;
}

const PREFERRED_ACTIVITIES: { value: PreferredActivity; label: string }[] = [
  { value: "walking", label: "Walking" },
  { value: "hiking", label: "Hiking" },
  { value: "trail-walks", label: "Trail walks" },
  { value: "recovery-walks", label: "Recovery walks" },
];

function formatProviderLabel(user: AuthUserSnapshot | null): string {
  const providerIds = user?.providerIds ?? [];
  if (providerIds.includes("password")) return "Email";
  if (user?.isAnonymous) return "Anonymous";
  return "Account";
}

function formatAuthError(error: unknown, fallback: string): string {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "";
  const devDetail = __DEV__ && (code || message) ? ` (${[code, message].filter(Boolean).join(": ")})` : "";
  const withDevDetail = (copy: string) => `${copy}${devDetail}`;

  if (code === "auth/invalid-email") return withDevDetail("Enter a valid email address.");
  if (code === "auth/user-disabled") return withDevDetail("This account has been disabled. Contact support for help.");
  if (code === "auth/user-not-found") return withDevDetail("No account exists for that email yet. Create an account first.");
  if (code === "auth/wrong-password") return withDevDetail("That password doesn’t match this email.");
  if (code === "auth/invalid-credential") return withDevDetail("That email or password doesn’t match an account.");
  if (code === "auth/email-already-in-use") return withDevDetail("An account already exists for that email. Sign in instead.");
  if (code === "auth/network-request-failed") return withDevDetail("Sign-in needs a connection right now.");
  if (code === "auth/too-many-requests") return withDevDetail("Too many attempts. Wait a bit, then try again or reset your password.");
  if (code === "auth/operation-not-allowed") return withDevDetail("Email/password sign-in is not enabled for this Firebase project.");
  if (code === "auth/requires-recent-login") return withDevDetail("For security, sign in again and retry.");
  if (code === "auth/invalid-api-key" || code.includes("api-key")) {
    return withDevDetail("Firebase sign-in is not configured with a valid API key.");
  }
  if (code === "auth/app-not-authorized") {
    return withDevDetail("This app is not authorized for the configured Firebase project.");
  }
  if (message.includes("cancel")) return withDevDetail("Sign-in was canceled.");
  if (message.includes("network")) return withDevDetail("Sign-in needs a connection right now.");
  return withDevDetail(fallback);
}

function logAuthError(context: string, error: unknown): void {
  if (!__DEV__) return;
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : null;
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[auth] ${context}`, { code, message, error });
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

export default function ProfileTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profileScrollRef = useRef<ScrollView | null>(null);

  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [authUser, setAuthUser] = useState<AuthUserSnapshot | null>(null);
  const [summary, setSummary] = useState<SummaryStats>(EMPTY_SUMMARY);
  const [authLoading, setAuthLoading] = useState(true);
  const [authAction, setAuthAction] = useState<AuthAction>(null);
  const [authStatus, setAuthStatus] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [localProfile, setLocalProfile] = useState<LocalUserProfile>(EMPTY_LOCAL_USER_PROFILE);
  const [profileDraft, setProfileDraft] = useState<LocalUserProfile>(EMPTY_LOCAL_USER_PROFILE);
  const [totalDistanceM, setTotalDistanceM] = useState(0);
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [profileStatus, setProfileStatus] = useState("");
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState("");
  const { isPremium } = usePremiumAccess();

  const visibleUser = authLoading ? null : authUser;
  const providerLabel = useMemo(() => formatProviderLabel(visibleUser), [visibleUser]);
  const reminderCount = useMemo(() => enabledReminderCount(prefs), [prefs]);
  const currentStreak = summary.currentStreak ?? summary.currentStreakDays ?? 0;
  const longestStreak = summary.longestStreak ?? summary.bestStreakDays ?? 0;
  const activeDaysThisWeek = summary.activeDaysThisWeek ?? 0;
  const activeDaysThisMonth = summary.activeDaysThisMonth ?? 0;
  const weeklyGoal = summary.weeklyGoal ?? 4;
  const monthlyGoal = summary.monthlyGoal ?? 16;
  const weeklyConsistencyStreakCurrent = summary.weeklyConsistencyStreakCurrent ?? 0;
  const profileIdentityKey = visibleUser?.uid ?? "device";
  const profileHeadline = firstNonEmpty(
    localProfile.displayName,
    visibleUser?.displayName,
    localProfile.username,
    "Outside walker"
  );
  const profileHandle = localProfile.username ? `@${localProfile.username}` : "";
  const profileAccountLine = visibleUser ? `${providerLabel} account` : "Sign in to claim a public username";
  const preferredActivityLabel =
    localProfile.favoriteActivity ||
    (PREFERRED_ACTIVITIES.find((option) => option.value === localProfile.preferredActivity)?.label ?? "");
  const profileDetails = [
    localProfile.location,
    localProfile.outdoorGoal,
    preferredActivityLabel,
  ].filter(Boolean);
  const draftUsernameValidation = useMemo(
    () => validateUsername(profileDraft.username),
    [profileDraft.username]
  );
  const canSaveProfile = !profileSaving && (!visibleUser || !draftUsernameValidation.error);
  const showAuthActionBar = !authLoading && !visibleUser;

  const scrollAuthControlsIntoView = useCallback(() => {
    if (visibleUser) return;

    setTimeout(() => {
      profileScrollRef.current?.scrollTo({ y: 210, animated: true });
    }, 120);
  }, [visibleUser]);

  const loadSettings = useCallback(async () => {
    const [np, storedSummary, storedSessions] = await Promise.allSettled([
      getNotificationPrefs(),
      getSummary(),
      getSessions(),
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
    setTotalDistanceM(
      storedSessions.status === "fulfilled"
        ? storedSessions.value.reduce(
            (sum, session) =>
              sum +
              (typeof session.distanceM === "number" && Number.isFinite(session.distanceM)
                ? Math.max(0, session.distanceM)
                : 0),
            0
          )
        : 0
    );
  }, []);

  useEffect(() => {
    let active = true;

    void loadSettings();

    const unsubscribe = subscribeToAuth((user) => {
      if (!active) return;
      setAuthUser(user);
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

  useEffect(() => {
    let active = true;
    void getLocalUserProfile(profileIdentityKey).then((profile) => {
      if (active) setLocalProfile(profile);
    });
    return () => {
      active = false;
    };
  }, [profileIdentityKey]);

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
      logAuthError("email sign-in failed", error);
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
      logAuthError("email sign-up failed", error);
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
      logAuthError("password reset failed", error);
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

  const onOpenEditProfile = () => {
    setProfileStatus("");
    setProfileDraft({
      ...localProfile,
      displayName: firstNonEmpty(localProfile.displayName, visibleUser?.displayName),
      username: localProfile.username,
      favoriteActivity: localProfile.favoriteActivity || preferredActivityLabel,
      outdoorGoal: localProfile.outdoorGoal || localProfile.walkingGoal,
      dreamPlaces: localProfile.dreamPlaces || localProfile.bio,
      photoURL: localProfile.photoURL || visibleUser?.photoURL || "",
    });
    setEditProfileVisible(true);
    void Haptics.selectionAsync();
  };

  const onChooseProfilePhoto = async () => {
    if (photoBusy) return;

    if (!auth.currentUser) {
      Alert.alert("Sign in first", "Create or sign into your account before adding a public profile photo.");
      return;
    }

    setPhotoBusy(true);
    setProfileStatus("");

    try {
      let ImagePicker: ImagePickerModule;
      try {
        ImagePicker = await import("expo-image-picker");
      } catch (error) {
        console.warn("[profile] image picker module unavailable", error);
        throw new Error("Photo picking needs a fresh dev build with expo-image-picker installed.");
      }

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Photo access needed", "Allow photo library access to choose a profile picture.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.82,
      });

      if (result.canceled) return;

      const selectedUri = result.assets[0]?.uri;
      if (!selectedUri) {
        throw new Error("No photo was selected.");
      }

      const photoURL = await uploadCurrentUserProfilePhoto(selectedUri);
      const saved = await saveCurrentUserProfilePhotoURL(profileIdentityKey, photoURL);
      setLocalProfile(saved);
      setProfileDraft((current) => ({ ...current, photoURL: saved.photoURL }));
      setProfileStatus("Profile photo updated.");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setProfileStatus(error instanceof Error ? error.message : "Couldn’t upload that photo. Please try another one.");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setPhotoBusy(false);
    }
  };

  const onRemoveProfilePhoto = async () => {
    if (photoBusy) return;

    setPhotoBusy(true);
    setProfileStatus("");

    try {
      if (auth.currentUser && profileDraft.photoURL) {
        await deleteCurrentUserProfilePhotoObject();
      }
      const saved = await saveCurrentUserProfilePhotoURL(profileIdentityKey, "");
      setLocalProfile(saved);
      setProfileDraft((current) => ({ ...current, photoURL: "" }));
      setProfileStatus("Profile photo removed.");
      void Haptics.selectionAsync();
    } catch (error) {
      setProfileStatus(error instanceof Error ? error.message : "Couldn’t remove the profile photo right now.");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setPhotoBusy(false);
    }
  };

  const onSaveProfile = async () => {
    if (!canSaveProfile) {
      setProfileStatus(draftUsernameValidation.error ?? "Check your profile fields before saving.");
      return;
    }

    setProfileSaving(true);
    setProfileStatus("");
    Keyboard.dismiss();

    try {
      const saved = await saveLocalUserProfile(profileIdentityKey, profileDraft);
      setLocalProfile(saved);

      setEditProfileVisible(false);
      setProfileStatus(visibleUser ? "Profile saved." : "Profile saved on this device.");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setProfileStatus(error instanceof Error ? error.message : "Couldn’t save your profile right now.");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setProfileSaving(false);
    }
  };

  return (
    <>
      <KeyboardAvoidingView
        style={styles.keyboardRoot}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
      <ScrollView
        ref={profileScrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        contentContainerStyle={[styles.container, showAuthActionBar ? styles.containerWithAuthActionBar : null]}
      >
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.sub}>Your walking rhythm, favorite places, and account in one grounded place.</Text>

      <View style={styles.accountCard}>
        <View style={styles.profileTopRow}>
          <View style={styles.accountHeader}>
            <View style={styles.avatar}>
              {localProfile.photoURL ? (
                <Image
                  key={localProfile.photoURL}
                  source={{ uri: localProfile.photoURL }}
                  style={styles.avatarImage}
                  contentFit="cover"
                  cachePolicy="none"
                />
              ) : (
                <Text style={styles.avatarText}>{getInitials(profileHeadline)}</Text>
              )}
            </View>
            <View style={styles.accountCopy}>
              <Text style={styles.accountTitle} numberOfLines={2}>{profileHeadline}</Text>
              {profileHandle ? <Text style={styles.accountHandle} numberOfLines={1}>{profileHandle}</Text> : null}
              <Text style={styles.accountEmail} numberOfLines={1}>{profileAccountLine}</Text>
            </View>
          </View>
          <Pressable
            onPress={onOpenEditProfile}
            style={({ pressed }) => [styles.editProfileBtn, pressed ? { opacity: 0.82 } : null]}
          >
            <Text style={styles.editProfileBtnText}>Edit Profile</Text>
          </Pressable>
        </View>

        {localProfile.dreamPlaces ? <Text style={styles.profileBio}>{localProfile.dreamPlaces}</Text> : null}
        {profileDetails.length > 0 ? (
          <View style={styles.profileDetailRow}>
            {profileDetails.map((detail) => (
              <View key={detail} style={styles.profileDetailChip}>
                <Text style={styles.profileDetailText}>{detail}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.profilePrompt}>Add a public username, home trail, activity, or outdoor goal to make this space yours.</Text>
        )}

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
          <View style={styles.profileStatChip}>
            <Text style={styles.profileStatLabel}>Miles</Text>
            <Text style={styles.profileStatValue}>{formatDistanceMiles(totalDistanceM)}</Text>
          </View>
        </View>

        {authLoading && !visibleUser ? (
          <View style={styles.authLoadingRow}>
            <ActivityIndicator color={PREMIUM.colors.forest} />
            <Text style={styles.authLoadingText}>Checking your account…</Text>
          </View>
        ) : null}

        {authLoading ? null : !visibleUser ? (
          <View style={styles.authActions}>
            <View style={styles.emailAuthForm}>
              <TextInput
                value={authEmail}
                onChangeText={setAuthEmail}
                onFocus={scrollAuthControlsIntoView}
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
                onFocus={scrollAuthControlsIntoView}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                textContentType="password"
                placeholder="Password"
                placeholderTextColor="rgba(11,15,14,0.42)"
                style={styles.authInput}
              />
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

            <Text style={styles.authSetupNote}>Use your email and password to continue.</Text>
          </View>
        ) : (
          <View style={styles.signedInRow}>
            <View style={styles.signedInPillWrap}>
              <Text style={styles.signedInPill}>{providerLabel}</Text>
              <Text style={styles.signedInHelper}>Signed in and synced</Text>
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
        {profileStatus ? <Text style={styles.authStatus}>{profileStatus}</Text> : null}
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

      </View>

        <Pressable onPress={onResetOnboarding} style={({ pressed }) => [styles.btnAlt, pressed ? { opacity: 0.9 } : null]}>
          <Text style={styles.btnAltText}>Replay Welcome Screens</Text>
        </Pressable>

        <View style={styles.settingsCard}>
          <Text style={styles.settingsEyebrow}>Settings</Text>
          <Text style={styles.settingsTitle}>Delete Account</Text>
          <Text style={styles.settingsBody}>
            Permanently remove your signed-in profile and associated account data. Local walking data is also cleared.
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
      </ScrollView>
      {showAuthActionBar ? (
        <View style={[styles.authActionBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
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
      ) : null}
      </KeyboardAvoidingView>

      <Modal
        visible={editProfileVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditProfileVisible(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <KeyboardAvoidingView
            style={styles.editModalBackdrop}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <View style={styles.editModalCard}>
              <View style={styles.editModalHeader}>
                <View style={styles.editModalHeaderCopy}>
                  <Text style={styles.editModalEyebrow}>Walking profile</Text>
                  <Text style={styles.editModalTitle}>Make this space yours</Text>
                </View>
                <Pressable
                  onPress={() => setEditProfileVisible(false)}
                  style={({ pressed }) => [styles.editModalClose, pressed ? { opacity: 0.72 } : null]}
                >
                  <Text style={styles.editModalCloseText}>Close</Text>
                </Pressable>
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.editForm}
              >
                <Text style={styles.fieldLabel}>Display name</Text>
                <TextInput
                  value={profileDraft.displayName}
                  onChangeText={(displayName) => setProfileDraft((current) => ({ ...current, displayName }))}
                  placeholder={emailNameFallback(visibleUser?.email)}
                  placeholderTextColor={alpha(PREMIUM.colors.ink, 0.4)}
                  autoCapitalize="words"
                  maxLength={48}
                  returnKeyType="next"
                  style={styles.profileInput}
                />

                <Text style={styles.fieldLabel}>Profile photo</Text>
                <View style={styles.photoEditorRow}>
                  <View style={styles.editAvatar}>
                    {profileDraft.photoURL ? (
                      <Image
                        key={profileDraft.photoURL}
                        source={{ uri: profileDraft.photoURL }}
                        style={styles.editAvatarImage}
                        contentFit="cover"
                        cachePolicy="none"
                      />
                    ) : (
                      <Text style={styles.editAvatarText}>{getInitials(firstNonEmpty(profileDraft.displayName, profileHeadline))}</Text>
                    )}
                  </View>
                  <View style={styles.photoEditorActions}>
                    <Pressable
                      onPress={() => void onChooseProfilePhoto()}
                      disabled={photoBusy}
                      style={({ pressed }) => [
                        styles.photoPrimaryBtn,
                        photoBusy ? styles.authBtnDisabled : null,
                        pressed ? { opacity: 0.88 } : null,
                      ]}
                    >
                      <Text style={styles.photoPrimaryBtnText}>
                        {photoBusy ? "Working..." : profileDraft.photoURL ? "Change Photo" : "Add Photo"}
                      </Text>
                    </Pressable>
                    {profileDraft.photoURL ? (
                      <Pressable
                        onPress={() => void onRemoveProfilePhoto()}
                        disabled={photoBusy}
                        style={({ pressed }) => [
                          styles.photoRemoveBtn,
                          photoBusy ? styles.authBtnDisabled : null,
                          pressed ? { opacity: 0.82 } : null,
                        ]}
                      >
                        <Text style={styles.photoRemoveBtnText}>Remove</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
                {!visibleUser ? (
                  <Text style={styles.fieldHint}>Sign in with email to upload and reserve a public profile photo.</Text>
                ) : null}

                <Text style={styles.fieldLabel}>Username</Text>
                <TextInput
                  value={profileDraft.username}
                  onChangeText={(username) =>
                    setProfileDraft((current) => ({ ...current, username: username.toLowerCase() }))
                  }
                  placeholder="trail.friend"
                  placeholderTextColor={alpha(PREMIUM.colors.ink, 0.4)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={20}
                  returnKeyType="next"
                  style={[
                    styles.profileInput,
                    visibleUser && draftUsernameValidation.error ? styles.profileInputError : null,
                  ]}
                />
                <Text style={[styles.fieldHint, visibleUser && draftUsernameValidation.error ? styles.fieldError : null]}>
                  {visibleUser
                    ? draftUsernameValidation.error ?? "Optional. Public usernames use 3-20 lowercase letters, numbers, underscores, or periods."
                    : "Sign in with email to reserve a unique public username."}
                </Text>

                <Text style={styles.fieldLabel}>Location, home trail, or favorite park</Text>
                <TextInput
                  value={profileDraft.location}
                  onChangeText={(location) => setProfileDraft((current) => ({ ...current, location }))}
                  placeholder="Rock Cut State Park"
                  placeholderTextColor={alpha(PREMIUM.colors.ink, 0.4)}
                  maxLength={80}
                  style={styles.profileInput}
                />

                <Text style={styles.fieldLabel}>Favorite activity</Text>
                <TextInput
                  value={profileDraft.favoriteActivity}
                  onChangeText={(favoriteActivity) =>
                    setProfileDraft((current) => ({ ...current, favoriteActivity, preferredActivity: null }))
                  }
                  placeholder="Hiking, walking, birding..."
                  placeholderTextColor={alpha(PREMIUM.colors.ink, 0.4)}
                  maxLength={64}
                  style={styles.profileInput}
                />
                <View style={styles.activityOptions}>
                  {PREFERRED_ACTIVITIES.map((option) => {
                    const active =
                      profileDraft.preferredActivity === option.value ||
                      profileDraft.favoriteActivity.trim().toLowerCase() === option.label.toLowerCase();
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() =>
                          setProfileDraft((current) => ({
                            ...current,
                            preferredActivity: active ? null : option.value,
                            favoriteActivity: active ? "" : option.label,
                          }))
                        }
                        style={({ pressed }) => [
                          styles.activityOption,
                          active ? styles.activityOptionActive : null,
                          pressed ? { opacity: 0.82 } : null,
                        ]}
                      >
                        <Text style={[styles.activityOptionText, active ? styles.activityOptionTextActive : null]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.fieldLabel}>Outdoor goal</Text>
                <TextInput
                  value={profileDraft.outdoorGoal}
                  onChangeText={(outdoorGoal) =>
                    setProfileDraft((current) => ({ ...current, outdoorGoal, walkingGoal: outdoorGoal }))
                  }
                  placeholder="Walk outside 4 days a week"
                  placeholderTextColor={alpha(PREMIUM.colors.ink, 0.4)}
                  maxLength={180}
                  style={styles.profileInput}
                />

                <Text style={styles.fieldLabel}>Dream places / bucket list</Text>
                <TextInput
                  value={profileDraft.dreamPlaces}
                  onChangeText={(dreamPlaces) =>
                    setProfileDraft((current) => ({ ...current, dreamPlaces, bio: dreamPlaces }))
                  }
                  placeholder="Glacier, Acadia, the lake trail at sunrise..."
                  placeholderTextColor={alpha(PREMIUM.colors.ink, 0.4)}
                  multiline
                  maxLength={220}
                  textAlignVertical="top"
                  style={[styles.profileInput, styles.profileBioInput]}
                />

                <Pressable
                  onPress={() => void onSaveProfile()}
                  disabled={!canSaveProfile}
                  style={({ pressed }) => [
                    styles.saveProfileBtn,
                    !canSaveProfile ? styles.authBtnDisabled : null,
                    pressed ? { opacity: 0.92 } : null,
                  ]}
                >
                  <Text style={styles.saveProfileBtnText}>{profileSaving ? "Saving..." : "Save Profile"}</Text>
                </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

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
  keyboardRoot: {
    flex: 1,
    backgroundColor: PREMIUM.colors.cream,
  },
  container: {
    padding: PREMIUM.spacing.screen,
    paddingBottom: 168,
    backgroundColor: PREMIUM.colors.cream,
    flexGrow: 1,
  },
  containerWithAuthActionBar: {
    paddingBottom: 220,
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
    backgroundColor: alpha(PREMIUM.colors.offWhite, 0.82),
    borderWidth: 1,
    borderColor: PREMIUM.colors.line,
    padding: 18,
    gap: 14,
    ...PREMIUM.shadow.card,
  },
  profileTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  accountHeader: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    flex: 1,
    minWidth: 210,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: PREMIUM.colors.forest,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: alpha(PREMIUM.colors.gold, 0.72),
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarText: {
    color: PREMIUM.colors.offWhite,
    fontSize: 22,
    fontWeight: "900",
    fontFamily: PREMIUM.type.serifFamily,
  },
  accountCopy: {
    flex: 1,
    gap: 4,
  },
  accountTitle: {
    color: PREMIUM.colors.text,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "700",
    fontFamily: PREMIUM.type.serifFamily,
  },
  accountHandle: {
    color: PREMIUM.colors.forest,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
  },
  accountEmail: {
    color: PREMIUM.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  editProfileBtn: {
    minHeight: 42,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: PREMIUM.radius.pill,
    backgroundColor: alpha(PREMIUM.colors.gold, 0.22),
    borderWidth: 1,
    borderColor: alpha(PREMIUM.colors.goldDeep, 0.34),
    alignItems: "center",
    justifyContent: "center",
  },
  editProfileBtnText: {
    color: PREMIUM.colors.forestDeep,
    fontSize: 13,
    fontWeight: "900",
  },
  profileBio: {
    color: PREMIUM.colors.text,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "700",
    fontFamily: PREMIUM.type.serifFamily,
  },
  profilePrompt: {
    color: PREMIUM.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  profileDetailRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  profileDetailChip: {
    borderRadius: PREMIUM.radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: alpha(PREMIUM.colors.forest, 0.08),
    borderWidth: 1,
    borderColor: PREMIUM.colors.line,
  },
  profileDetailText: {
    color: PREMIUM.colors.forestDeep,
    fontSize: 12,
    fontWeight: "800",
  },
  profileStatsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  profileStatChip: {
    width: "48%",
    flexGrow: 1,
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
  authActionBar: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 12,
    paddingHorizontal: PREMIUM.spacing.screen,
    backgroundColor: PREMIUM.colors.cream,
    borderTopWidth: 1,
    borderTopColor: PREMIUM.colors.line,
    ...PREMIUM.shadow.soft,
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
    color: PREMIUM.colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 10 },
  rowCopy: { flex: 1 },
  rowLabel: { fontWeight: "700", color: PREMIUM.colors.text },
  rowHint: { marginTop: 3, color: PREMIUM.colors.textMuted, fontWeight: "600", fontSize: 12, lineHeight: 17 },
  btnAlt: {
    marginTop: 12,
    backgroundColor: alpha(PREMIUM.colors.text, 0.08),
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: PREMIUM.radius.pill,
    alignSelf: "flex-start",
  },
  btnAltText: { color: PREMIUM.colors.textMuted, fontWeight: "900", letterSpacing: 0.3 },
  editModalBackdrop: {
    flex: 1,
    backgroundColor: alpha(PREMIUM.colors.text, 0.58),
    justifyContent: "flex-end",
  },
  editModalCard: {
    width: "100%",
    maxHeight: "92%",
    borderTopLeftRadius: PREMIUM.radius.hero,
    borderTopRightRadius: PREMIUM.radius.hero,
    backgroundColor: PREMIUM.colors.cream,
    borderWidth: 1,
    borderColor: PREMIUM.colors.line,
    paddingTop: 20,
    paddingHorizontal: 20,
    ...PREMIUM.shadow.hero,
  },
  editModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 12,
  },
  editModalHeaderCopy: {
    flex: 1,
  },
  editModalEyebrow: {
    color: PREMIUM.colors.forest,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontSize: 11,
  },
  editModalTitle: {
    marginTop: 5,
    color: PREMIUM.colors.text,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: "700",
    fontFamily: PREMIUM.type.serifFamily,
  },
  editModalClose: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: PREMIUM.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: alpha(PREMIUM.colors.text, 0.08),
  },
  editModalCloseText: {
    color: PREMIUM.colors.text,
    fontSize: 12,
    fontWeight: "900",
  },
  editForm: {
    paddingBottom: 36,
  },
  fieldLabel: {
    marginTop: 12,
    marginBottom: 7,
    color: PREMIUM.colors.forestDeep,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  profileInput: {
    minHeight: 50,
    borderRadius: PREMIUM.radius.md,
    borderWidth: 1,
    borderColor: PREMIUM.colors.lineStrong,
    backgroundColor: alpha(PREMIUM.colors.offWhite, 0.84),
    paddingHorizontal: 14,
    color: PREMIUM.colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  profileInputError: {
    borderColor: "#B42318",
    backgroundColor: "rgba(180,35,24,0.06)",
  },
  profileBioInput: {
    minHeight: 92,
    paddingTop: 13,
    paddingBottom: 13,
  },
  fieldHint: {
    marginTop: 7,
    color: PREMIUM.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  fieldError: {
    color: "#B42318",
  },
  photoEditorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: PREMIUM.radius.lg,
    borderWidth: 1,
    borderColor: PREMIUM.colors.line,
    backgroundColor: alpha(PREMIUM.colors.offWhite, 0.62),
    padding: 12,
  },
  editAvatar: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: PREMIUM.colors.forest,
    borderWidth: 3,
    borderColor: alpha(PREMIUM.colors.gold, 0.7),
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  editAvatarImage: {
    width: "100%",
    height: "100%",
  },
  editAvatarText: {
    color: PREMIUM.colors.offWhite,
    fontSize: 24,
    fontWeight: "900",
    fontFamily: PREMIUM.type.serifFamily,
  },
  photoEditorActions: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  photoPrimaryBtn: {
    minHeight: 42,
    borderRadius: PREMIUM.radius.pill,
    backgroundColor: PREMIUM.colors.forest,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  photoPrimaryBtnText: {
    color: PREMIUM.colors.offWhite,
    fontWeight: "900",
  },
  photoRemoveBtn: {
    minHeight: 42,
    borderRadius: PREMIUM.radius.pill,
    backgroundColor: alpha(PREMIUM.colors.danger, 0.08),
    borderWidth: 1,
    borderColor: alpha(PREMIUM.colors.danger, 0.24),
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  photoRemoveBtnText: {
    color: "#A32727",
    fontWeight: "900",
  },
  activityOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  activityOption: {
    minHeight: 42,
    justifyContent: "center",
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: PREMIUM.radius.pill,
    borderWidth: 1,
    borderColor: PREMIUM.colors.lineStrong,
    backgroundColor: alpha(PREMIUM.colors.offWhite, 0.68),
  },
  activityOptionActive: {
    backgroundColor: PREMIUM.colors.forest,
    borderColor: PREMIUM.colors.forestDeep,
  },
  activityOptionText: {
    color: PREMIUM.colors.forestDeep,
    fontSize: 13,
    fontWeight: "900",
  },
  activityOptionTextActive: {
    color: PREMIUM.colors.offWhite,
  },
  saveProfileBtn: {
    minHeight: 54,
    marginTop: 20,
    borderRadius: PREMIUM.radius.pill,
    backgroundColor: PREMIUM.colors.forest,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  saveProfileBtnText: {
    color: PREMIUM.colors.offWhite,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
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
