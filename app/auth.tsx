import * as Google from "expo-auth-session/providers/google";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { OutdoorTheme } from "../constants/theme";
import { ENV } from "../env";
import { BrandHeaderMark } from "../src/components/BrandBadge";
import { CampfireGlyph } from "../src/components/OutdoorDecor";
import { LayeredEnvironment } from "../src/components/OutdoorUI";
import { logSignupStarted } from "../src/lib/analytics";
import {
  createEmailPasswordAccount,
  sendEmailPasswordReset,
  signInWithEmailPassword,
  signInWithGoogleIdTokenResult,
  type AuthUserSnapshot,
} from "../src/lib/auth";
import { getAuthenticatedEntryRoute } from "../src/lib/authFlow";
import { clearNewAccountNeedsWelcome, markNewAccountNeedsWelcome } from "../src/lib/onboarding";

WebBrowser.maybeCompleteAuthSession();

type AuthMode = "signup" | "signin";
type AuthAction = "email" | "google" | "reset" | null;

function getAuthErrorCode(error: unknown): string {
  if (typeof error !== "object" || error === null || !("code" in error)) return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

function formatAuthError(error: unknown, fallback: string): string {
  switch (getAuthErrorCode(error)) {
    case "auth/email-already-in-use":
      return "That email already has an account. Try Sign In instead.";
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
      return "That email already uses another sign-in method.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    default:
      break;
  }

  const message = error instanceof Error ? error.message : "";
  if (message.toLowerCase().includes("cancel")) return "Sign-in was canceled.";
  if (message.toLowerCase().includes("network")) return "Sign-in needs a connection right now.";
  return fallback;
}

function isGoogleAuthConfigured(): boolean {
  if (!ENV.AUTH.googleWebClientId) return false;
  if (Platform.OS === "ios") return Boolean(ENV.AUTH.googleIosClientId);
  if (Platform.OS === "android") return Boolean(ENV.AUTH.googleAndroidClientId);
  return true;
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function AuthScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [authAction, setAuthAction] = useState<AuthAction>(null);
  const googleEnabled = isGoogleAuthConfigured();
  const submitting = authAction !== null;

  const [googleRequest, googleResponse, promptGoogleAsync] = Google.useIdTokenAuthRequest({
    iosClientId: ENV.AUTH.googleIosClientId ?? undefined,
    androidClientId: ENV.AUTH.googleAndroidClientId ?? undefined,
    webClientId: ENV.AUTH.googleWebClientId ?? undefined,
    scopes: ["openid", "profile", "email"],
    selectAccount: true,
  });

  const title = mode === "signup" ? "Create Account" : "Sign In";
  const helper = useMemo(
    () =>
      mode === "signup"
        ? "Start with an account. Your public profile comes next."
        : "Welcome back. Sign in and we’ll take you to the right place.",
    [mode]
  );

  const routeAfterAuthenticated = useCallback(async (user: AuthUserSnapshot, isNewAccount: boolean) => {
    if (__DEV__) {
      console.info("[auth] authenticated", {
        uid: user.uid,
        providerIds: user.providerIds,
        isNewAccount,
      });
    }

    const nextRoute = isNewAccount ? "/profile-setup" : await getAuthenticatedEntryRoute();
    router.replace(nextRoute as never);
  }, [router]);

  useEffect(() => {
    if (!googleResponse) return;

    if (googleResponse.type === "cancel" || googleResponse.type === "dismiss") {
      setAuthAction(null);
      setStatus("Google sign-in was canceled.");
      return;
    }

    if (googleResponse.type !== "success") {
      setAuthAction(null);
      setStatus("Google sign-in didn’t finish cleanly.");
      return;
    }

    const response = googleResponse as {
      params?: Record<string, string | undefined>;
      authentication?: { accessToken?: string | null } | null;
    };
    const idToken = response.params?.id_token;

    if (!idToken) {
      setAuthAction(null);
      setStatus("Google didn’t return the sign-in token. Please try again.");
      return;
    }

    void (async () => {
      try {
        const result = await signInWithGoogleIdTokenResult(
          idToken,
          response.authentication?.accessToken ?? response.params?.access_token ?? null
        );
        if (result.isNewUser) {
          await markNewAccountNeedsWelcome();
        } else {
          await clearNewAccountNeedsWelcome();
        }
        await routeAfterAuthenticated(result.user, result.isNewUser);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error) {
        if (__DEV__) {
          console.warn("[auth] google sign-in failed", error);
        }
        setStatus(formatAuthError(error, "Google sign-in hit a snag."));
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setAuthAction(null);
      }
    })();
  }, [googleResponse, routeAfterAuthenticated]);

  const validateEmailPassword = (): { email: string; password: string } | null => {
    const nextEmail = email.trim();

    if (!nextEmail) {
      setStatus("Enter your email address first.");
      return null;
    }

    if (!isLikelyEmail(nextEmail)) {
      setStatus("Enter a valid email address.");
      return null;
    }

    if (password.length < 6) {
      setStatus("Password must be at least 6 characters.");
      return null;
    }

    return { email: nextEmail, password };
  };

  const onSubmitEmail = async () => {
    if (submitting) return;

    Keyboard.dismiss();
    const form = validateEmailPassword();
    if (!form) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setAuthAction("email");
    setStatus("");
    void Haptics.selectionAsync();

    try {
      if (mode === "signup") {
        void logSignupStarted();
        const user = await createEmailPasswordAccount(form.email, form.password);
        await markNewAccountNeedsWelcome();
        await routeAfterAuthenticated(user, true);
      } else {
        const user = await signInWithEmailPassword(form.email, form.password);
        await clearNewAccountNeedsWelcome();
        await routeAfterAuthenticated(user, false);
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      if (__DEV__) {
        console.warn(`[auth] ${mode} failed`, error);
      }
      setStatus(formatAuthError(error, mode === "signup" ? "Account creation hit a snag." : "Sign-in hit a snag."));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setAuthAction(null);
    }
  };

  const onPasswordReset = async () => {
    if (submitting) return;

    Keyboard.dismiss();
    const nextEmail = email.trim();

    if (!nextEmail || !isLikelyEmail(nextEmail)) {
      setStatus("Enter your email address, then tap Forgot password.");
      return;
    }

    setAuthAction("reset");
    setStatus("");

    try {
      await sendEmailPasswordReset(nextEmail);
      setStatus("Password reset email sent.");
    } catch (error) {
      if (__DEV__) {
        console.warn("[auth] password reset failed", error);
      }
      setStatus(formatAuthError(error, "Password reset couldn’t be sent."));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setAuthAction(null);
    }
  };

  const onGooglePress = async () => {
    if (submitting) return;

    Keyboard.dismiss();

    if (!googleRequest) {
      setStatus("Google sign-in is still getting ready.");
      return;
    }

    setAuthAction("google");
    setStatus("");

    try {
      await promptGoogleAsync();
    } catch (error) {
      if (__DEV__) {
        console.warn("[auth] google prompt failed", error);
      }
      setStatus(formatAuthError(error, "Google sign-in couldn’t open."));
      setAuthAction(null);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.screen}>
        <LayeredEnvironment />
        <SafeAreaView style={styles.safeArea}>
          <KeyboardAvoidingView
            style={styles.keyboardView}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <ScrollView
              contentContainerStyle={styles.container}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.brandBlock}>
                <BrandHeaderMark size={82} showTagline />
                <Text style={styles.eyebrow}>Step Outside</Text>
                <Text style={styles.title}>Welcome</Text>
                <Text style={styles.subtitle}>Create an account or sign in before setting up your profile.</Text>
              </View>

              <View style={styles.card}>
                <CampfireGlyph style={styles.cardFire} size={54} opacity={0.16} />
                <View style={styles.modeRow}>
                  <Pressable
                    onPress={() => {
                      if (!submitting) {
                        setMode("signup");
                        setStatus("");
                      }
                    }}
                    disabled={submitting}
                    style={[styles.modeButton, mode === "signup" ? styles.modeButtonActive : null]}
                  >
                    <Text style={[styles.modeButtonText, mode === "signup" ? styles.modeButtonTextActive : null]}>
                      Create Account
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (!submitting) {
                        setMode("signin");
                        setStatus("");
                      }
                    }}
                    disabled={submitting}
                    style={[styles.modeButton, mode === "signin" ? styles.modeButtonActive : null]}
                  >
                    <Text style={[styles.modeButtonText, mode === "signin" ? styles.modeButtonTextActive : null]}>
                      Sign In
                    </Text>
                  </Pressable>
                </View>

                <Text style={styles.cardTitle}>{title}</Text>
                <Text style={styles.cardHelper}>{helper}</Text>

                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  placeholder="Email"
                  placeholderTextColor="rgba(30,42,36,0.42)"
                  returnKeyType="next"
                  editable={!submitting}
                  style={styles.input}
                />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  textContentType={mode === "signup" ? "newPassword" : "password"}
                  placeholder="Password"
                  placeholderTextColor="rgba(30,42,36,0.42)"
                  returnKeyType="done"
                  onSubmitEditing={() => void onSubmitEmail()}
                  editable={!submitting}
                  style={styles.input}
                />

                <Pressable
                  onPress={() => void onSubmitEmail()}
                  disabled={submitting}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    submitting ? styles.disabled : null,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  {authAction === "email" ? (
                    <ActivityIndicator color="#FFF9EF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>{title}</Text>
                  )}
                </Pressable>

                <Pressable
                  onPress={() => void onPasswordReset()}
                  disabled={submitting}
                  style={({ pressed }) => [styles.textButton, submitting ? styles.disabled : null, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.textButtonText}>
                    {authAction === "reset" ? "Sending reset..." : "Forgot password?"}
                  </Text>
                </Pressable>

                {googleEnabled ? (
                  <Pressable
                    onPress={() => void onGooglePress()}
                    disabled={submitting}
                    style={({ pressed }) => [
                      styles.googleButton,
                      submitting ? styles.disabled : null,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    {authAction === "google" ? (
                      <ActivityIndicator color="#1E2A24" />
                    ) : (
                      <View style={styles.googleContent}>
                        <View style={styles.googleIcon}>
                          <Text style={styles.googleIconText}>G</Text>
                        </View>
                        <Text style={styles.googleText}>Continue with Google</Text>
                      </View>
                    )}
                  </Pressable>
                ) : null}

                {status ? (
                  <View style={styles.statusRow}>
                    <Ionicons name="information-circle-outline" size={16} color="#18442F" />
                    <Text style={styles.statusText}>{status}</Text>
                  </View>
                ) : null}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 22,
    gap: 18,
  },
  brandBlock: {
    alignItems: "center",
    gap: 7,
  },
  eyebrow: {
    color: OutdoorTheme.colors.goldText,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
    color: OutdoorTheme.colors.charcoal,
    fontSize: 36,
    lineHeight: 41,
    fontWeight: "700",
  },
  subtitle: {
    maxWidth: 320,
    color: "rgba(30,42,36,0.66)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  card: {
    borderRadius: OutdoorTheme.radii.xl,
    backgroundColor: OutdoorTheme.colors.paperTranslucent,
    borderWidth: 1,
    borderColor: OutdoorTheme.colors.line,
    padding: 16,
    gap: 12,
    overflow: "hidden",
    ...OutdoorTheme.shadows.card,
  },
  cardFire: {
    position: "absolute",
    right: 16,
    top: 66,
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
    borderRadius: OutdoorTheme.radii.lg,
    backgroundColor: "rgba(24,68,47,0.08)",
    padding: 4,
  },
  modeButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: OutdoorTheme.radii.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  modeButtonActive: {
    backgroundColor: OutdoorTheme.colors.forest,
  },
  modeButtonText: {
    color: OutdoorTheme.colors.forest,
    fontWeight: "900",
    fontSize: 13,
    textAlign: "center",
  },
  modeButtonTextActive: {
    color: OutdoorTheme.colors.paper,
  },
  cardTitle: {
    marginTop: 2,
    color: OutdoorTheme.colors.charcoal,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "900",
  },
  cardHelper: {
    color: "rgba(30,42,36,0.62)",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  input: {
    minHeight: 50,
    borderRadius: OutdoorTheme.radii.lg,
    borderWidth: 1,
    borderColor: "rgba(30,42,36,0.12)",
    backgroundColor: OutdoorTheme.colors.paper,
    color: OutdoorTheme.colors.charcoal,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: "700",
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: OutdoorTheme.radii.lg,
    backgroundColor: OutdoorTheme.colors.forest,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: OutdoorTheme.colors.paper,
    fontSize: 15,
    fontWeight: "900",
  },
  textButton: {
    alignSelf: "flex-start",
    paddingVertical: 5,
  },
  textButtonText: {
    color: "rgba(30,42,36,0.58)",
    fontSize: 13,
    fontWeight: "800",
  },
  googleButton: {
    minHeight: 50,
    borderRadius: OutdoorTheme.radii.lg,
    backgroundColor: OutdoorTheme.colors.paper,
    borderWidth: 1,
    borderColor: "rgba(30,42,36,0.13)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  googleContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  googleIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: OutdoorTheme.colors.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  googleIconText: {
    color: OutdoorTheme.colors.forest,
    fontWeight: "900",
    fontSize: 14,
  },
  googleText: {
    color: OutdoorTheme.colors.charcoal,
    fontWeight: "900",
  },
  statusRow: {
    flexDirection: "row",
    gap: 7,
    alignItems: "flex-start",
    borderRadius: OutdoorTheme.radii.md,
    backgroundColor: "rgba(24,68,47,0.08)",
    padding: 10,
  },
  statusText: {
    flex: 1,
    color: "rgba(30,42,36,0.72)",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.88,
  },
});
