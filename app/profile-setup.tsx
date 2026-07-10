import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
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
import { CampfireGlyph } from "../src/components/OutdoorDecor";
import { LayeredEnvironment, PremiumHero } from "../src/components/OutdoorUI";
import { logProfileCompleted, logProfileUpdated } from "../src/lib/analytics";
import { signOutUser, waitForAuthUserSnapshot } from "../src/lib/auth";
import { getPostProfileSetupRoute } from "../src/lib/authFlow";
import {
  editableProfileFromSources,
  emptyEditableProfile,
  getCurrentUserProfile,
  saveCurrentUserProfile,
  validateUsername,
  type EditableUserProfile,
} from "../src/lib/userProfile";

type SetupAction = "save" | "signOut" | null;

export default function ProfileSetupScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<EditableUserProfile>(emptyEditableProfile());
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<SetupAction>(null);
  const [status, setStatus] = useState("");
  const submitting = action !== null;
  const usernameResult = useMemo(() => validateUsername(profile.username), [profile.username]);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const user = await waitForAuthUserSnapshot();
        if (!user) {
          router.replace("/auth" as never);
          return;
        }

        const currentProfile = await getCurrentUserProfile();
        if (active) {
          setProfile(editableProfileFromSources(currentProfile));
        }
      } catch (error) {
        if (__DEV__) {
          console.warn("[profile-setup] initial load failed", error);
        }
        if (active) {
          setProfile(emptyEditableProfile());
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [router]);

  const updateField = (field: keyof EditableUserProfile, value: string) => {
    setProfile((current) => ({ ...current, [field]: value }));
    setStatus("");
  };

  const onSave = async () => {
    if (submitting) return;

    Keyboard.dismiss();

    if (usernameResult.error) {
      setStatus(usernameResult.error);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setAction("save");
    setStatus("");
    void Haptics.selectionAsync();

    try {
      await saveCurrentUserProfile({
        ...profile,
        username: usernameResult.username,
      });
      void logProfileUpdated();
      void logProfileCompleted();
      const nextRoute = await getPostProfileSetupRoute();
      router.replace(nextRoute as never);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      if (__DEV__) {
        console.warn("[profile-setup] save failed", error);
      }
      setStatus(error instanceof Error ? error.message : "Profile couldn’t be saved. Please try again.");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setAction(null);
    }
  };

  const onUseDifferentAccount = async () => {
    if (submitting) return;

    Keyboard.dismiss();
    setAction("signOut");
    setStatus("");

    try {
      await signOutUser();
      router.replace("/auth" as never);
    } catch (error) {
      if (__DEV__) {
        console.warn("[profile-setup] sign out failed", error);
      }
      setStatus("Couldn’t switch accounts right now. Please try again.");
      setAction(null);
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
              <PremiumHero
                variant="forest"
                style={styles.hero}
                eyebrow="Step Outside"
                title="Set Up Profile"
                subtitle="Choose the trail name friends will use to find you."
              />

              <View style={styles.card}>
                <CampfireGlyph style={styles.cardFire} size={50} opacity={0.16} />
                <Text style={styles.cardTitle}>Just the essentials</Text>
                <Text style={styles.cardBody}>
                  Your account is ready. Add a username now; everything else can wait.
                </Text>

                {loading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color={OutdoorTheme.colors.forest} />
                    <Text style={styles.loadingText}>Checking profile...</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.label}>Username</Text>
                    <TextInput
                      value={profile.username}
                      onChangeText={(value) => updateField("username", value)}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="trailname"
                      placeholderTextColor="rgba(30,42,36,0.4)"
                      returnKeyType="next"
                      editable={!submitting}
                      style={styles.input}
                    />
                    <Text style={styles.helper}>3 to 20 letters, numbers, underscores, or periods.</Text>

                    <Text style={styles.label}>Display Name Optional</Text>
                    <TextInput
                      value={profile.displayName}
                      onChangeText={(value) => updateField("displayName", value)}
                      placeholder="Your name"
                      placeholderTextColor="rgba(30,42,36,0.4)"
                      returnKeyType="done"
                      onSubmitEditing={() => void onSave()}
                      editable={!submitting}
                      style={styles.input}
                    />

                    <Pressable
                      onPress={() => void onSave()}
                      disabled={submitting}
                      style={({ pressed }) => [
                        styles.primaryButton,
                        submitting ? styles.disabled : null,
                        pressed ? styles.pressed : null,
                      ]}
                    >
                      {action === "save" ? (
                        <ActivityIndicator color={OutdoorTheme.colors.paper} />
                      ) : (
                        <Text style={styles.primaryButtonText}>Save Profile</Text>
                      )}
                    </Pressable>

                    <Pressable
                      onPress={() => void onUseDifferentAccount()}
                      disabled={submitting}
                      style={({ pressed }) => [
                        styles.secondaryButton,
                        submitting ? styles.disabled : null,
                        pressed ? styles.pressed : null,
                      ]}
                    >
                      {action === "signOut" ? (
                        <ActivityIndicator color={OutdoorTheme.colors.forest} />
                      ) : (
                        <>
                          <Ionicons name="log-out-outline" size={17} color={OutdoorTheme.colors.forest} />
                          <Text style={styles.secondaryButtonText}>Use Different Account</Text>
                        </>
                      )}
                    </Pressable>
                  </>
                )}

                {status ? (
                  <View style={styles.statusRow}>
                    <Ionicons name="information-circle-outline" size={16} color={OutdoorTheme.colors.forest} />
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
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 28,
  },
  hero: {
    minHeight: 220,
    marginBottom: 16,
  },
  card: {
    borderRadius: OutdoorTheme.radii.xl,
    padding: 16,
    gap: 12,
    backgroundColor: OutdoorTheme.colors.paperTranslucent,
    borderWidth: 1,
    borderColor: OutdoorTheme.colors.line,
    overflow: "hidden",
    ...OutdoorTheme.shadows.card,
  },
  cardFire: {
    position: "absolute",
    right: 16,
    top: 16,
  },
  cardTitle: {
    color: OutdoorTheme.colors.charcoal,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "900",
  },
  cardBody: {
    maxWidth: 300,
    color: "rgba(30,42,36,0.64)",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  loadingRow: {
    minHeight: 118,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    color: "rgba(30,42,36,0.64)",
    fontWeight: "800",
  },
  label: {
    marginTop: 2,
    color: OutdoorTheme.colors.forest,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
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
  helper: {
    marginTop: -5,
    color: "rgba(30,42,36,0.52)",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  primaryButton: {
    marginTop: 4,
    minHeight: 52,
    borderRadius: OutdoorTheme.radii.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: OutdoorTheme.colors.forest,
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: OutdoorTheme.colors.paper,
    fontWeight: "900",
    fontSize: 15,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: OutdoorTheme.radii.lg,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
    backgroundColor: "rgba(24,68,47,0.09)",
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.12)",
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: OutdoorTheme.colors.forest,
    fontWeight: "900",
    fontSize: 13,
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
