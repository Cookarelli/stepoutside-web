import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Linking from "expo-linking";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { getProState } from "../../src/lib/pro";

type TrailSuggestion = {
  id: string;
  name: string;
  distanceMeters: number;
  lat: number;
  lng: number;
  source: "nearby" | "fallback";
};

type PermissionState = "unknown" | "granted" | "denied";

type OverpassWay = {
  id: number;
  tags?: {
    name?: string;
    highway?: string;
  };
  geometry?: { lat: number; lon: number }[];
};

type OverpassResponse = {
  elements?: OverpassWay[];
};

const BRAND = {
  forest: "#255E36",
  sunrise: "#F2B541",
  bone: "#F8F4EE",
  charcoal: "#0B0F0E",
} as const;

const MIN_M = 804.67; // 0.5 mi
const MAX_M = 1609.34; // 1.0 mi
const SAVED_WALKS_KEY = "@stepoutside/savedWalks";

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return R * c;
}

function wayLengthMeters(points: { lat: number; lon: number }[]): number {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineMeters(
      { lat: points[i - 1].lat, lng: points[i - 1].lon },
      { lat: points[i].lat, lng: points[i].lon }
    );
  }
  return total;
}

function centroid(points: { lat: number; lon: number }[]): { lat: number; lng: number } {
  if (!points || points.length === 0) return { lat: 0, lng: 0 };
  const sum = points.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lon }),
    { lat: 0, lng: 0 }
  );
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}

function metersToMiles(m: number): string {
  return (m / 1609.34).toFixed(2);
}

function estMinutes(m: number): number {
  // ~20 min/mi default easy pace
  const miles = m / 1609.34;
  return Math.max(8, Math.round(miles * 20));
}

async function openInMaps(item: TrailSuggestion) {
  const label = encodeURIComponent(item.name);
  const url = `http://maps.apple.com/?ll=${item.lat},${item.lng}&q=${label}`;
  await Linking.openURL(url);
}

function fallbackSuggestions(lat: number, lng: number): TrailSuggestion[] {
  return [
    {
      id: "fallback-1",
      name: "Neighborhood 10-Min Loop",
      distanceMeters: 900,
      lat,
      lng,
      source: "fallback",
    },
    {
      id: "fallback-2",
      name: "Fresh Air Out-and-Back",
      distanceMeters: 1200,
      lat,
      lng,
      source: "fallback",
    },
    {
      id: "fallback-3",
      name: "Streak Saver Walk",
      distanceMeters: 1600,
      lat,
      lng,
      source: "fallback",
    },
  ];
}

export default function StepsTab() {
  const router = useRouter();
  const [permission, setPermission] = useState<PermissionState>("unknown");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [suggestions, setSuggestions] = useState<TrailSuggestion[]>([]);
  const [savedWalks, setSavedWalks] = useState<TrailSuggestion[]>([]);
  const [showAllSaved, setShowAllSaved] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isPro, setIsPro] = useState(false);

  const hasResults = useMemo(() => suggestions.length > 0, [suggestions]);
  const savedIds = useMemo(() => new Set(savedWalks.map((w) => w.id)), [savedWalks]);
  const sortedSavedWalks = useMemo(() => {
    if (!userCoords) return savedWalks;
    return [...savedWalks].sort((a, b) => {
      const da = haversineMeters(userCoords, { lat: a.lat, lng: a.lng });
      const db = haversineMeters(userCoords, { lat: b.lat, lng: b.lng });
      return da - db;
    });
  }, [savedWalks, userCoords]);
  const visibleSavedWalks = useMemo(
    () => (showAllSaved ? sortedSavedWalks : sortedSavedWalks.slice(0, 3)),
    [showAllSaved, sortedSavedWalks]
  );
  const freeSaveLimitReached = useMemo(() => !isPro && savedWalks.length >= 3, [isPro, savedWalks.length]);

  const loadSavedWalks = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(SAVED_WALKS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as TrailSuggestion[];
      setSavedWalks(Array.isArray(parsed) ? parsed : []);
    } catch {
      // ignore local storage parse issues
    }
  }, []);

  const persistSavedWalks = useCallback(async (walks: TrailSuggestion[]) => {
    await AsyncStorage.setItem(SAVED_WALKS_KEY, JSON.stringify(walks));
  }, []);

  const toggleSaveWalk = useCallback(
    async (walk: TrailSuggestion) => {
      setSavedWalks((prev) => {
        const exists = prev.some((w) => w.id === walk.id);
        if (!exists && !isPro && prev.length >= 3) {
          return prev;
        }
        const next = exists ? prev.filter((w) => w.id !== walk.id) : [walk, ...prev];
        void persistSavedWalks(next);
        return next;
      });
    },
    [isPro, persistSavedWalks]
  );

  const removeSavedWalk = useCallback(
    async (id: string) => {
      setSavedWalks((prev) => {
        const next = prev.filter((w) => w.id !== id);
        void persistSavedWalks(next);
        return next;
      });
    },
    [persistSavedWalks]
  );

  const loadNearby = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      const granted = perm.status === "granted";
      setPermission(granted ? "granted" : "denied");

      if (!granted) {
        setSuggestions([]);
        setLoading(false);
        return;
      }

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      setUserCoords({ lat: latitude, lng: longitude });

      const query = `
[out:json][timeout:25];
(
  way["highway"~"path|footway|track"]["name"](around:3500,${latitude},${longitude});
);
out tags geom 120;
`;

      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: query,
      });

      if (!res.ok) throw new Error("Trail service unavailable");

      const json = (await res.json()) as OverpassResponse;
      const ways = json.elements ?? [];

      const mapped: TrailSuggestion[] = ways
        .map((w) => {
          const points = w.geometry ?? [];
          const distanceMeters = wayLengthMeters(points);
          const c = centroid(points);
          return {
            id: String(w.id),
            name: w.tags?.name?.trim() || "Local Trail",
            distanceMeters,
            lat: c.lat,
            lng: c.lng,
            source: "nearby" as const,
          };
        })
        .filter((t) => t.distanceMeters >= MIN_M && t.distanceMeters <= MAX_M && t.lat && t.lng)
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
        .filter((item, index, arr) => arr.findIndex((x) => x.name === item.name) === index)
        .slice(0, 6);

      if (mapped.length === 0) {
        setSuggestions(fallbackSuggestions(latitude, longitude));
      } else {
        setSuggestions(mapped);
      }
    } catch {
      setError("Couldn’t fetch nearby trails right now.");
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSavedWalks();
    void loadNearby();
  }, [loadNearby, loadSavedWalks]);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const pro = await getProState();
        setIsPro(pro.isPro);
      })();
    }, [])
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Suggested Walks</Text>
        <Text style={styles.sub}>Short nearby trails and walks (0.5–1.0 mi).</Text>

        <Pressable style={styles.refreshBtn} onPress={() => void loadNearby()}>
          <Text style={styles.refreshText}>Refresh Nearby</Text>
        </Pressable>

        {savedWalks.length > 0 ? (
          <View style={styles.savedWrap}>
            <View style={styles.savedHeaderRow}>
              <Text style={styles.savedTitle}>Saved Walks</Text>
              {savedWalks.length > 3 ? (
                <Pressable onPress={() => setShowAllSaved((v) => !v)}>
                  <Text style={styles.savedToggle}>{showAllSaved ? "Show Less" : "View All"}</Text>
                </Pressable>
              ) : null}
            </View>

            {visibleSavedWalks.map((item) => (
              <View key={`saved-${item.id}`} style={styles.savedRow}>
                <Pressable style={styles.savedMainTap} onPress={() => void openInMaps(item)}>
                  <Text style={styles.savedName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.savedMeta}>
                    {metersToMiles(item.distanceMeters)} mi
                    {userCoords ? ` • ${metersToMiles(haversineMeters(userCoords, { lat: item.lat, lng: item.lng }))} mi away` : ""}
                  </Text>
                </Pressable>

                <Pressable style={styles.removeBtn} onPress={() => void removeSavedWalk(item.id)}>
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {freeSaveLimitReached ? (
          <View style={styles.proNudge}>
            <Text style={styles.proNudgeText}>Free plan saves up to 3 walks. Upgrade to Pro for unlimited saved walks.</Text>
            <Pressable style={styles.proNudgeBtn} onPress={() => router.push("/pro")}>
              <Text style={styles.proNudgeBtnText}>Unlock Pro</Text>
            </Pressable>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={BRAND.forest} />
            <Text style={styles.stateText}>Finding walks near you…</Text>
          </View>
        ) : null}

        {!loading && permission === "denied" ? (
          <View style={styles.centerState}>
            <Text style={styles.stateText}>Location permission is needed to suggest walks in your area.</Text>
          </View>
        ) : null}

        {!loading && error ? (
          <View style={styles.centerState}>
            <Text style={styles.stateText}>{error}</Text>
          </View>
        ) : null}

        {!loading && !hasResults && !error && permission === "granted" ? (
          <View style={styles.centerState}>
            <Text style={styles.stateText}>No short trails found yet. Try refresh or move to a nearby park.</Text>
          </View>
        ) : null}

        {!loading
          ? suggestions.map((item) => (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  {item.source === "fallback" ? <Text style={styles.fallbackTag}>Quick pick</Text> : null}
                </View>

                <View style={styles.chips}>
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>{metersToMiles(item.distanceMeters)} mi</Text>
                  </View>
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>~{estMinutes(item.distanceMeters)} min</Text>
                  </View>
                </View>

                <View style={styles.actions}>
                  <Pressable style={styles.mapBtn} onPress={() => void openInMaps(item)}>
                    <Text style={styles.mapBtnText}>Open in Maps</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.saveBtn,
                      savedIds.has(item.id) ? styles.saveBtnActive : null,
                      freeSaveLimitReached && !savedIds.has(item.id) ? styles.saveBtnDisabled : null,
                    ]}
                    onPress={() => void toggleSaveWalk(item)}
                    disabled={freeSaveLimitReached && !savedIds.has(item.id)}
                  >
                    <Text
                      style={[
                        styles.saveBtnText,
                        savedIds.has(item.id) ? styles.saveBtnTextActive : null,
                        freeSaveLimitReached && !savedIds.has(item.id) ? styles.saveBtnTextDisabled : null,
                      ]}
                    >
                      {savedIds.has(item.id) ? "Saved" : "Save Walk"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))
          : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BRAND.bone,
  },
  container: {
    padding: 20,
    paddingBottom: 28,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: BRAND.charcoal,
  },
  sub: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(11,15,14,0.65)",
  },
  refreshBtn: {
    marginTop: 14,
    alignSelf: "flex-start",
    backgroundColor: BRAND.forest,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  refreshText: {
    color: "white",
    fontWeight: "900",
  },
  centerState: {
    marginTop: 20,
    borderRadius: 14,
    backgroundColor: "rgba(11,15,14,0.06)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.10)",
    padding: 14,
  },
  proNudge: {
    marginTop: 14,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "rgba(242,181,65,0.18)",
    borderWidth: 1,
    borderColor: "rgba(242,181,65,0.4)",
  },
  proNudgeText: {
    color: "rgba(11,15,14,0.78)",
    fontWeight: "800",
    lineHeight: 20,
  },
  proNudgeBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: BRAND.forest,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  proNudgeBtnText: {
    color: "white",
    fontWeight: "900",
  },
  savedWrap: {
    marginTop: 14,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "rgba(37,94,54,0.08)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.16)",
  },
  savedHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  savedTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: BRAND.forest,
  },
  savedToggle: {
    fontSize: 12,
    fontWeight: "900",
    color: BRAND.forest,
  },
  savedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 7,
    gap: 8,
  },
  savedMainTap: {
    flex: 1,
  },
  savedName: {
    color: BRAND.charcoal,
    fontWeight: "800",
    marginRight: 8,
  },
  savedMeta: {
    marginTop: 2,
    color: "rgba(11,15,14,0.7)",
    fontWeight: "700",
    fontSize: 12,
  },
  removeBtn: {
    backgroundColor: "rgba(200,51,51,0.12)",
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 8,
  },
  removeText: {
    color: "#C83333",
    fontWeight: "900",
    fontSize: 12,
  },
  stateText: {
    marginTop: 6,
    color: "rgba(11,15,14,0.72)",
    fontWeight: "700",
    lineHeight: 21,
  },
  card: {
    marginTop: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.10)",
    padding: 14,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
  },
  cardTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "900",
    color: BRAND.charcoal,
  },
  fallbackTag: {
    fontSize: 11,
    fontWeight: "900",
    color: BRAND.forest,
    backgroundColor: "rgba(37,94,54,0.14)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  chips: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  chip: {
    backgroundColor: "rgba(11,15,14,0.08)",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  chipText: {
    fontWeight: "800",
    color: "rgba(11,15,14,0.75)",
  },
  actions: {
    marginTop: 12,
    flexDirection: "row",
    gap: 8,
  },
  mapBtn: {
    alignSelf: "flex-start",
    backgroundColor: BRAND.sunrise,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  mapBtnText: {
    fontWeight: "900",
    color: BRAND.charcoal,
  },
  saveBtn: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(11,15,14,0.08)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  saveBtnActive: {
    backgroundColor: "rgba(37,94,54,0.18)",
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    fontWeight: "900",
    color: "rgba(11,15,14,0.72)",
  },
  saveBtnTextActive: {
    color: BRAND.forest,
  },
  saveBtnTextDisabled: {
    color: "rgba(11,15,14,0.45)",
  },
});
