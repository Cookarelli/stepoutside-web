import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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

import { PostWalkTabNav } from "../src/components/PostWalkTabNav";
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
  const scrollRef = useRef<ScrollView | null>(null);
  const inputFocusedRef = useRef(false);
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
  const [saveWarning, setSaveWarning] = useState("");
  const [savedText, setSavedText] = useState("");

  const scrollReflectionIntoView = useCallback((delay = 80) => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, delay);
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(showEvent, () => {
      if (inputFocusedRef.current) {
        scrollReflectionIntoView(120);
      }
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      inputFocusedRef.current = false;
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [scrollReflectionIntoView]);

  const goToShare = (overrides?: { reflectionText?: string; saveWarning?: string }) => {
    router.push({
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

  const onSaveReflection = async () => {
    const trimmed = text.trim();
    if (!trimmed || saving) return;

    setSaving(true);
    setStatusText("");
    setSaveWarning("");

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
      setSavedText(result.record.text);
      setSaveWarning(result.warning ?? "");
      setStatusText(result.warning ?? "Reflection saved.");
    } catch {
      setSavedText(trimmed);
      setSaveWarning("Reflection wasn’t saved to storage this time.");
      setStatusText("Couldn’t save that reflection, but you can still keep moving.");
    } finally {
      setSaving(false);
    }
  };

  const onShare = () => {
    void Haptics.selectionAsync();
    goToShare({
      reflectionText: text.trim() || savedText,
      saveWarning,
    });
  };

  const navParams = useMemo(
    () => ({
      walkId,
      startedAt: params.startedAt ?? "",
      endedAt: params.endedAt ?? "",
      durationSec: String(durationSec),
      distanceM: String(distanceM),
      source: params.source ?? "timer",
      sunriseBonus: String(sunriseBonus),
      sunsetBonus: String(sunsetBonus),
      prompt,
      reflectionText: text.trim() || savedText,
      saveWarning,
    }),
    [distanceM, durationSec, params.endedAt, params.source, params.startedAt, prompt, saveWarning, savedText, sunriseBonus, sunsetBonus, text, walkId]
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          style={styles.keyboardWrap}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            contentInsetAdjustmentBehavior="automatic"
            onScrollBeginDrag={Keyboard.dismiss}
            showsVerticalScrollIndicator={false}
          >
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
                scrollEnabled
                onFocus={() => {
                  inputFocusedRef.current = true;
                  scrollReflectionIntoView();
                }}
                onBlur={() => {
                  inputFocusedRef.current = false;
                }}
                onContentSizeChange={() => {
                  if (inputFocusedRef.current) {
                    scrollReflectionIntoView(20);
                  }
                }}
              />

              <Text style={styles.helper}>Keep it simple. This is for you, not for a performance.</Text>
              {statusText ? <Text style={styles.status}>{statusText}</Text> : null}
            </View>

            <View style={styles.footerActions}>
              <Pressable
                onPress={() => void onSaveReflection()}
                disabled={saving || text.trim().length === 0}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  saving || text.trim().length === 0 ? styles.btnDisabled : null,
                  pressed ? { opacity: 0.94 } : null,
                ]}
              >
                <Text style={styles.primaryBtnText}>{saving ? "SAVING…" : "SAVE REFLECTION"}</Text>
              </Pressable>

              <View style={styles.secondaryRow}>
                <Pressable
                  onPress={onShare}
                  style={({ pressed }) => [styles.secondaryBtn, pressed ? { opacity: 0.9 } : null]}
                >
                  <Text style={styles.secondaryBtnText}>SHARE WALK</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    void Haptics.selectionAsync();
                    router.replace("/(tabs)");
                  }}
                  style={({ pressed }) => [styles.secondaryBtn, pressed ? { opacity: 0.9 } : null]}
                >
                  <Text style={styles.secondaryBtnText}>BACK HOME</Text>
                </Pressable>
              </View>

              <PostWalkTabNav current="reflection" params={navParams} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8F4EE" },
  keyboardWrap: { flex: 1 },
  container: {
    flexGrow: 1,
    padding: 20,
    justifyContent: "flex-start",
    paddingBottom: 28,
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
    minHeight: 190,
    maxHeight: 260,
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
  footerActions: {
    marginTop: 18,
    gap: 10,
  },
  primaryBtn: {
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
    flex: 1,
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
  secondaryRow: {
    flexDirection: "row",
    gap: 10,
  },
});
