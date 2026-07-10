import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { OutdoorTheme } from "../constants/theme";
import { LayeredEnvironment, PremiumHero } from "../src/components/OutdoorUI";
import { logProfileCompleted, logProfileUpdated } from "../src/lib/analytics";
import {
  editableProfileFromSources,
  emptyEditableProfile,
  getCurrentUserProfile,
  saveCurrentUserProfile,
  type EditableUserProfile,
} from "../src/lib/userProfile";

export default function EditProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<EditableUserProfile>(emptyEditableProfile());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const currentProfile = await getCurrentUserProfile();
        if (active) {
          setProfile(editableProfileFromSources(currentProfile));
        }
      } catch {
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
  }, []);

  const updateField = (field: keyof EditableUserProfile, value: string) => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const onSave = async () => {
    if (saving) return;

    Keyboard.dismiss();
    setSaving(true);
    try {
      await saveCurrentUserProfile(profile);
      void logProfileUpdated();
      if (profile.displayName.trim() && profile.username.trim()) {
        void logProfileCompleted();
      }
      router.back();
    } catch (error) {
      Alert.alert("Profile not saved", error instanceof Error ? error.message : "Please try again in a moment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <LayeredEnvironment />
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <PremiumHero
        style={styles.header}
        topSlot={(
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={22} color="#18442F" />
          </Pressable>
        )}
        eyebrow="Step Outside"
        title="Edit Profile"
        subtitle="Keep your public trail identity clear and current."
      />

      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color="#18442F" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.label}>Display Name</Text>
          <TextInput
            value={profile.displayName}
            onChangeText={(value) => updateField("displayName", value)}
            placeholder="Your name"
            placeholderTextColor="rgba(30,42,36,0.4)"
            style={styles.input}
          />

          <Text style={styles.label}>Username</Text>
          <TextInput
            value={profile.username}
            onChangeText={(value) => updateField("username", value)}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="username"
            placeholderTextColor="rgba(30,42,36,0.4)"
            style={styles.input}
          />

          <Text style={styles.label}>Location</Text>
          <TextInput
            value={profile.location}
            onChangeText={(value) => updateField("location", value)}
            placeholder="City, state"
            placeholderTextColor="rgba(30,42,36,0.4)"
            style={styles.input}
          />

          <Text style={styles.label}>Favorite Activity</Text>
          <TextInput
            value={profile.favoriteActivity}
            onChangeText={(value) => updateField("favoriteActivity", value)}
            placeholder="Walks, hikes, resets"
            placeholderTextColor="rgba(30,42,36,0.4)"
            style={styles.input}
          />

          <Text style={styles.label}>Outdoor Goal</Text>
          <TextInput
            value={profile.outdoorGoal}
            onChangeText={(value) => updateField("outdoorGoal", value)}
            placeholder="What are you building?"
            placeholderTextColor="rgba(30,42,36,0.4)"
            style={[styles.input, styles.textArea]}
            multiline
          />

          <Pressable
            onPress={() => void onSave()}
            disabled={saving}
            style={({ pressed }) => [styles.saveButton, saving ? styles.disabled : null, pressed ? styles.pressed : null]}
          >
            <Text style={styles.saveButtonText}>{saving ? "Saving..." : "Save Profile"}</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    backgroundColor: "transparent",
    padding: 18,
    paddingBottom: 36,
  },
  header: {
    marginBottom: 18,
    minHeight: 270,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: OutdoorTheme.colors.forestTint,
    borderWidth: 1,
    borderColor: OutdoorTheme.colors.line,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    color: OutdoorTheme.colors.goldText,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 2,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
    fontSize: 34,
    lineHeight: 39,
    fontWeight: "700",
    color: OutdoorTheme.colors.charcoal,
  },
  loadingCard: {
    borderRadius: OutdoorTheme.radii.xl,
    padding: 18,
    alignItems: "center",
    backgroundColor: OutdoorTheme.colors.paperTranslucent,
    borderWidth: 1,
    borderColor: OutdoorTheme.colors.lineSoft,
    ...OutdoorTheme.shadows.soft,
  },
  loadingText: {
    marginTop: 10,
    color: "rgba(30,42,36,0.62)",
    fontWeight: "800",
  },
  card: {
    borderRadius: OutdoorTheme.radii.xl,
    padding: 16,
    backgroundColor: OutdoorTheme.colors.paperTranslucent,
    borderWidth: 1,
    borderColor: OutdoorTheme.colors.line,
    ...OutdoorTheme.shadows.soft,
  },
  label: {
    marginTop: 12,
    marginBottom: 7,
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
    paddingHorizontal: 13,
    fontSize: 15,
    fontWeight: "700",
  },
  textArea: {
    minHeight: 96,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  saveButton: {
    marginTop: 18,
    minHeight: 52,
    borderRadius: OutdoorTheme.radii.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: OutdoorTheme.colors.forest,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.88,
  },
});
