import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { RoutePreview } from "../src/components/RoutePreview";
import { getSessionById, type OutsideSession } from "../src/lib/store";

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtMinutes(durationSec: number): string {
  const minutes = Math.max(1, Math.round(durationSec / 60));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function fmtDistance(distanceM?: number): string {
  if (!distanceM || distanceM <= 0) return "Distance unavailable";
  return `${(distanceM / 1609.344).toFixed(2)} mi`;
}

function buildMapsUrl(session: OutsideSession): string | null {
  const routePoints = session.routePoints ?? [];
  const last = routePoints[routePoints.length - 1];
  if (!last) return null;

  const label = encodeURIComponent("Saved Step Outside route");
  return `http://maps.apple.com/?ll=${last.lat},${last.lng}&q=${label}`;
}

export default function SavedRouteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sessionId?: string }>();
  const sessionId = (params.sessionId ?? "").trim();
  const [session, setSession] = useState<OutsideSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void (async () => {
      if (!sessionId) {
        if (active) {
          setSession(null);
          setLoading(false);
        }
        return;
      }

      const next = await getSessionById(sessionId);
      if (active) {
        setSession(next);
        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [sessionId]);

  const mapsUrl = useMemo(() => (session ? buildMapsUrl(session) : null), [session]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>Saved route</Text>
        <Text style={styles.title}>Your walk, kept for later.</Text>

        {loading ? <Text style={styles.sub}>Loading route…</Text> : null}

        {!loading && !session ? <Text style={styles.sub}>We couldn’t find that saved route.</Text> : null}

        {!loading && session ? (
          <>
            <Text style={styles.sub}>
              {fmtMinutes(session.durationSec)} • {fmtDistance(session.distanceM)}
            </Text>

            <View style={styles.metaRow}>
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>{session.source === "gps" ? "GPS walk" : "Timer walk"}</Text>
              </View>
              {session.savedRouteAt ? (
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipText}>Saved {fmtDate(session.savedRouteAt)}</Text>
                </View>
              ) : null}
              {session.sunriseBonus ? (
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipText}>Sunrise bonus</Text>
                </View>
              ) : null}
              {session.sunsetBonus ? (
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipText}>Sunset bonus</Text>
                </View>
              ) : null}
            </View>

            {session.routePoints && session.routePoints.length > 1 ? (
              <View style={styles.previewWrap}>
                <RoutePreview
                  points={session.routePoints}
                  title="Saved route preview"
                  subtitle="This can become part of future community sharing"
                />
              </View>
            ) : null}

            <View style={styles.noteCard}>
              <Text style={styles.noteTitle}>Why this matters</Text>
              <Text style={styles.noteBody}>
                Saved routes are the foundation for future community sharing, curated Step Outside spots, and local reset ideas.
              </Text>
            </View>

            {mapsUrl ? (
              <Pressable
                onPress={() => {
                  void Haptics.selectionAsync();
                  void Linking.openURL(mapsUrl);
                }}
                style={({ pressed }) => [styles.primaryBtn, pressed ? { opacity: 0.94 } : null]}
              >
                <Text style={styles.primaryBtnText}>OPEN IN MAPS</Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={() => {
                void Haptics.selectionAsync();
                router.replace("/(tabs)/steps");
              }}
              style={({ pressed }) => [styles.secondaryBtn, pressed ? { opacity: 0.92 } : null]}
            >
              <Text style={styles.secondaryBtnText}>BACK TO STEPS</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F8F4EE",
  },
  container: {
    padding: 20,
    paddingBottom: 36,
  },
  eyebrow: {
    color: "#255E36",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 10,
    color: "#0B0F0E",
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900",
  },
  sub: {
    marginTop: 10,
    color: "rgba(11,15,14,0.68)",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
  },
  metaRow: {
    marginTop: 16,
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  metaChip: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(37,94,54,0.08)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.14)",
  },
  metaChipText: {
    color: "#255E36",
    fontSize: 12,
    fontWeight: "900",
  },
  previewWrap: {
    marginTop: 18,
  },
  noteCard: {
    marginTop: 18,
    borderRadius: 18,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.08)",
  },
  noteTitle: {
    color: "#0B0F0E",
    fontSize: 15,
    fontWeight: "900",
  },
  noteBody: {
    marginTop: 8,
    color: "rgba(11,15,14,0.66)",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
  },
  primaryBtn: {
    marginTop: 22,
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
