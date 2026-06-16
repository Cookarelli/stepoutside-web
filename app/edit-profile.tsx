import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

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

    setSaving(true);
    try {
      await saveCurrentUserProfile(profile);
      router.back();
    } catch (error) {
      Alert.alert("Profile not saved", error instanceof Error ? error.message : "Please try again in a moment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color="#255E36" />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Step Outside</Text>
          <Text style={styles.title}>Edit Profile</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color="#255E36" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.label}>Display Name</Text>
          <TextInput
            value={profile.displayName}
            onChangeText={(value) => updateField("displayName", value)}
            placeholder="Your name"
            placeholderTextColor="rgba(11,15,14,0.4)"
            style={styles.input}
          />

          <Text style={styles.label}>Username</Text>
          <TextInput
            value={profile.username}
            onChangeText={(value) => updateField("username", value)}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="username"
            placeholderTextColor="rgba(11,15,14,0.4)"
            style={styles.input}
          />

          <Text style={styles.label}>Location</Text>
          <TextInput
            value={profile.location}
            onChangeText={(value) => updateField("location", value)}
            placeholder="City, state"
            placeholderTextColor="rgba(11,15,14,0.4)"
            style={styles.input}
          />

          <Text style={styles.label}>Favorite Activity</Text>
          <TextInput
            value={profile.favoriteActivity}
            onChangeText={(value) => updateField("favoriteActivity", value)}
            placeholder="Walks, hikes, resets"
            placeholderTextColor="rgba(11,15,14,0.4)"
            style={styles.input}
          />

          <Text style={styles.label}>Outdoor Goal</Text>
          <TextInput
            value={profile.outdoorGoal}
            onChangeText={(value) => updateField("outdoorGoal", value)}
            placeholder="What are you building?"
            placeholderTextColor="rgba(11,15,14,0.4)"
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
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#F8F4EE",
    padding: 18,
    paddingBottom: 36,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(37,94,54,0.1)",
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    color: "#8A5D09",
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
    color: "#0B0F0E",
  },
  loadingCard: {
    borderRadius: 8,
    padding: 18,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.1)",
  },
  loadingText: {
    marginTop: 10,
    color: "rgba(11,15,14,0.62)",
    fontWeight: "800",
  },
  card: {
    borderRadius: 8,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.76)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.12)",
  },
  label: {
    marginTop: 12,
    marginBottom: 7,
    color: "#255E36",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  input: {
    minHeight: 50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.12)",
    backgroundColor: "#FFFFFF",
    color: "#0B0F0E",
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
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#255E36",
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
