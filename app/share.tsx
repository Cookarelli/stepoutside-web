import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Image, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { RoutePreview } from "../src/components/RoutePreview";
import { getSessionById, saveSessionRouteForLater, type OutsideSession } from "../src/lib/store";

function toBool(value: string | undefined): boolean {
  return value === "true";
}

function toNumber(value: string | undefined): number {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmtMinutes(durationSec: number): string {
  const minutes = Math.max(1, Math.round(durationSec / 60));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function fmtDistance(distanceM: number): string {
  if (distanceM <= 0) return "";
  return `${(distanceM / 1609.344).toFixed(2)} miles`;
}

export default function ShareScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    walkId?: string;
    durationSec?: string;
    distanceM?: string;
    sunriseBonus?: string;
    sunsetBonus?: string;
    reflectionText?: string;
    saveWarning?: string;
  }>();

  const walkId = (params.walkId ?? "").trim();
  const durationSec = toNumber(params.durationSec);
  const distanceM = toNumber(params.distanceM);
  const sunriseBonus = toBool(params.sunriseBonus);
  const sunsetBonus = toBool(params.sunsetBonus);
  const reflectionText = (params.reflectionText ?? "").trim();
  const saveWarning = (params.saveWarning ?? "").trim();
  const [sharing, setSharing] = useState(false);
  const [savingRoute, setSavingRoute] = useState(false);
  const [saveRouteMessage, setSaveRouteMessage] = useState("");
  const [session, setSession] = useState<OutsideSession | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      if (!walkId) {
        if (active) setSession(null);
        return;
      }

      const nextSession = await getSessionById(walkId);
      if (active) {
        setSession(nextSession);
      }
    })();

    return () => {
      active = false;
    };
  }, [walkId]);

  const summaryLine = useMemo(() => {
    const distancePart = fmtDistance(distanceM);
    return distancePart
      ? `${fmtMinutes(durationSec)} outside • ${distancePart}`
      : `${fmtMinutes(durationSec)} outside`;
  }, [distanceM, durationSec]);

  const shareMessage = useMemo(() => {
    const lines = [`I just took ${summaryLine} with Step Outside.`];
    if (sunriseBonus) lines.push("Caught a sunrise Golden Hour reset.");
    if (sunsetBonus) lines.push("Caught a sunset Golden Hour reset.");
    if ((session?.routePoints?.length ?? 0) > 1) lines.push("Saved the route from this walk.");
    if (reflectionText) lines.push(`Reflection: "${reflectionText}"`);
    return lines.join("\n");
  }, [reflectionText, session?.routePoints?.length, summaryLine, sunriseBonus, sunsetBonus]);

  const onShare = async () => {
    setSharing(true);
    try {
      await Share.share({ message: shareMessage });
      void Haptics.selectionAsync();
    } finally {
      setSharing(false);
    }
  };

  const onSaveRoute = async () => {
    if (!walkId || !session?.routePoints || session.routePoints.length < 2 || savingRoute) return;

    setSavingRoute(true);
    try {
      const nextSession = await saveSessionRouteForLater(walkId);
      if (nextSession) {
        setSession(nextSession);
        setSaveRouteMessage("Saved for future sharing and route ideas.");
        void Haptics.selectionAsync();
      }
    } finally {
      setSavingRoute(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.container}>
        <Image source={require("../assets/images/icon.png")} style={styles.logo} />
        <Text style={styles.eyebrow}>Walk complete</Text>
        <Text style={styles.title}>Let it land.</Text>
        <Text style={styles.summary}>{summaryLine}</Text>

        <View style={styles.chipsRow}>
          {sunriseBonus ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>Sunrise bonus</Text>
            </View>
          ) : null}
          {sunsetBonus ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>Sunset bonus</Text>
            </View>
          ) : null}
        </View>

        {reflectionText ? (
          <View style={styles.reflectionCard}>
            <Text style={styles.reflectionLabel}>What you carried forward</Text>
            <Text style={styles.reflectionText}>{reflectionText}</Text>
          </View>
        ) : (
          <Text style={styles.subtle}>You can share this walk or just keep the reset for yourself.</Text>
        )}

        {saveWarning ? <Text style={styles.warning}>{saveWarning}</Text> : null}

        {session?.routePoints && session.routePoints.length > 1 ? (
          <View style={styles.routeWrap}>
            <RoutePreview points={session.routePoints} title="Walk route" subtitle="Captured from this reset" />
          </View>
        ) : null}

        {session?.routePoints && session.routePoints.length > 1 ? (
          <>
            <Pressable
              onPress={() => void onSaveRoute()}
              disabled={savingRoute || Boolean(session.savedRouteAt)}
              style={({ pressed }) => [
                styles.saveRouteBtn,
                Boolean(session.savedRouteAt) ? styles.saveRouteBtnSaved : null,
                pressed ? { opacity: 0.94 } : null,
              ]}
            >
              <Text
                style={[
                  styles.saveRouteBtnText,
                  Boolean(session.savedRouteAt) ? styles.saveRouteBtnTextSaved : null,
                ]}
              >
                {Boolean(session.savedRouteAt)
                  ? "SAVED FOR LATER"
                  : savingRoute
                    ? "SAVING ROUTE…"
                    : "SAVE THIS WALK"}
              </Text>
            </Pressable>
            <Text style={styles.saveRouteHint}>
              {saveRouteMessage ||
                (Boolean(session.savedRouteAt)
                  ? "This route is saved locally and ready for future community sharing."
                  : "Keep this route now so we can build future sharing and curated Step Outside spots from it.")}
            </Text>
          </>
        ) : null}

        <Pressable
          onPress={() => void onShare()}
          disabled={sharing}
          style={({ pressed }) => [styles.primaryBtn, pressed ? { opacity: 0.94 } : null]}
        >
          <Text style={styles.primaryBtnText}>{sharing ? "OPENING SHARE…" : "SHARE"}</Text>
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

        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            router.push("/stats");
          }}
          style={({ pressed }) => [styles.tertiaryBtn, pressed ? { opacity: 0.9 } : null]}
        >
          <Text style={styles.tertiaryBtnText}>VIEW STATS</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8F4EE" },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  logo: { width: 84, height: 84, borderRadius: 22, marginBottom: 16 },
  eyebrow: {
    color: "#255E36",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  title: {
    marginTop: 10,
    color: "#0B0F0E",
    fontSize: 32,
    lineHeight: 37,
    fontWeight: "900",
  },
  summary: {
    marginTop: 10,
    color: "rgba(11,15,14,0.76)",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  chipsRow: {
    marginTop: 16,
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(37,94,54,0.08)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.16)",
  },
  chipText: {
    color: "#255E36",
    fontSize: 12,
    fontWeight: "900",
  },
  reflectionCard: {
    marginTop: 18,
    width: "100%",
    maxWidth: 540,
    borderRadius: 20,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.6)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.08)",
  },
  reflectionLabel: {
    color: "rgba(11,15,14,0.54)",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  reflectionText: {
    marginTop: 8,
    color: "#0B0F0E",
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "700",
  },
  subtle: {
    marginTop: 18,
    color: "rgba(11,15,14,0.62)",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
    textAlign: "center",
    maxWidth: 320,
  },
  warning: {
    marginTop: 12,
    color: "rgba(11,15,14,0.62)",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    textAlign: "center",
  },
  routeWrap: {
    marginTop: 18,
    width: "100%",
    maxWidth: 540,
  },
  saveRouteBtn: {
    marginTop: 14,
    minWidth: 240,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: "rgba(37,94,54,0.08)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  saveRouteBtnSaved: {
    backgroundColor: "rgba(242,181,65,0.16)",
    borderColor: "rgba(242,181,65,0.36)",
  },
  saveRouteBtnText: {
    color: "#255E36",
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  saveRouteBtnTextSaved: {
    color: "#8A5D09",
  },
  saveRouteHint: {
    marginTop: 10,
    color: "rgba(11,15,14,0.58)",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    textAlign: "center",
    maxWidth: 320,
  },
  primaryBtn: {
    marginTop: 22,
    minWidth: 240,
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
  secondaryBtn: {
    marginTop: 10,
    minWidth: 240,
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
  tertiaryBtn: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tertiaryBtnText: {
    color: "rgba(11,15,14,0.68)",
    fontWeight: "900",
    letterSpacing: 0.4,
  },
});
