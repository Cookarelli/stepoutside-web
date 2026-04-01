import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { pickReflectionPrompt, saveReflection } from "../src/lib/reflections";

function toBool(value: string | undefined): boolean {
  return value === "true";
}

function toNumber(value: string | undefined): number {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function ReflectionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    walkId?: string;
    startedAt?: string;
    endedAt?: string;
    durationSec?: string;
    distanceM?: string;
    source?: string;
    sunriseBonus?: string;
    sunsetBonus?: string;
  }>();

  const walkId = params.walkId ?? "";
  const durationSec = toNumber(params.durationSec);
  const distanceM = toNumber(params.distanceM);
  const sunriseBonus = toBool(params.sunriseBonus);
  const sunsetBonus = toBool(params.sunsetBonus);
  const prompt = useMemo(() => pickReflectionPrompt(walkId || Date.now()), [walkId]);

  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusText, setStatusText] = useState("");

  const goToShare = (overrides?: { reflectionText?: string; saveWarning?: string }) => {
    router.replace({
      pathname: "/share" as never,
      params: {
        walkId,
        startedAt: params.startedAt ?? "",
        endedAt: params.endedAt ?? "",
        durationSec: String(durationSec),
        distanceM: String(distanceM),
        source: params.source ?? "timer",
        sunriseBonus: String(sunriseBonus),
        sunsetBonus: String(sunsetBonus),
        prompt,
        reflectionText: overrides?.reflectionText ?? "",
        saveWarning: overrides?.saveWarning ?? "",
      },
    } as never);
  };

  const onContinue = async () => {
    const trimmed = text.trim();
    if (!trimmed || saving) return;

    setSaving(true);
    setStatusText("");

    try {
      const result = await saveReflection({
        walkId,
        prompt,
        text: trimmed,
        durationSec,
        distanceM,
        sunriseBonus,
        sunsetBonus,
      });

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      goToShare({
        reflectionText: result.record.text,
        saveWarning: result.warning,
      });
    } catch {
      setStatusText("Couldn’t save that reflection, but you can still keep moving.");
      void Haptics.selectionAsync();
      goToShare({
        reflectionText: trimmed,
        saveWarning: "Reflection wasn’t saved to storage this time.",
      });
    } finally {
      setSaving(false);
    }
  };

  const onSkip = () => {
    void Haptics.selectionAsync();
    goToShare();
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.eyebrow}>After your walk</Text>
          <Text style={styles.title}>Pause for a second</Text>
          <Text style={styles.prompt}>{prompt}</Text>

          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            textAlignVertical="top"
            placeholder="A few words is enough."
            placeholderTextColor="rgba(11,15,14,0.35)"
            style={styles.input}
            maxLength={500}
          />

          <Text style={styles.helper}>Keep it simple. This is for you, not for a performance.</Text>
          {statusText ? <Text style={styles.status}>{statusText}</Text> : null}

          <Pressable
            onPress={() => void onContinue()}
            disabled={saving || text.trim().length === 0}
            style={({ pressed }) => [
              styles.primaryBtn,
              saving || text.trim().length === 0 ? styles.btnDisabled : null,
              pressed ? { opacity: 0.94 } : null,
            ]}
          >
            <Text style={styles.primaryBtnText}>{saving ? "SAVING…" : "CONTINUE"}</Text>
          </Pressable>

          <Pressable
            onPress={onSkip}
            style={({ pressed }) => [styles.secondaryBtn, pressed ? { opacity: 0.9 } : null]}
          >
            <Text style={styles.secondaryBtnText}>SKIP</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8F4EE" },
  container: {
    flexGrow: 1,
    padding: 20,
    justifyContent: "center",
  },
  card: {
    borderRadius: 28,
    padding: 22,
    backgroundColor: "rgba(255,255,255,0.62)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.08)",
  },
  eyebrow: {
    color: "#255E36",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  title: {
    marginTop: 10,
    color: "#0B0F0E",
    fontSize: 30,
    lineHeight: 35,
    fontWeight: "900",
  },
  prompt: {
    marginTop: 14,
    color: "rgba(11,15,14,0.82)",
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "800",
  },
  input: {
    marginTop: 18,
    minHeight: 180,
    borderRadius: 18,
    backgroundColor: "rgba(248,244,238,0.92)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.1)",
    padding: 16,
    color: "#0B0F0E",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  },
  helper: {
    marginTop: 10,
    color: "rgba(11,15,14,0.54)",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  status: {
    marginTop: 12,
    color: "rgba(11,15,14,0.62)",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  primaryBtn: {
    marginTop: 20,
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: "#255E36",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontWeight: "900",
    letterSpacing: 1,
  },
  btnDisabled: {
    opacity: 0.55,
  },
  secondaryBtn: {
    marginTop: 10,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: "rgba(11,15,14,0.06)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    color: "#0B0F0E",
    fontWeight: "900",
    letterSpacing: 0.8,
  },
});
