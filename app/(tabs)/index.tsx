import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import * as Location from "expo-location";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { getDailySpark, type DailySpark } from "../../src/lib/dailySpark";
import { getProState } from "../../src/lib/pro";
import {
  cacheRouteSuggestions,
  getRouteSuggestionsByZip,
  getRouteSuggestionsNearCoords,
  normalizeZip,
  type RouteSuggestion,
} from "../../src/lib/routeCatalog";
import { dayKeyLocal, EMPTY_SUMMARY, getSummary, type SummaryStats } from "../../src/lib/store";

const BRAND = {
  forest: "#255E36",
  sunrise: "#F2B541",
  bone: "#F8F4EE",
  charcoal: "#0B0F0E",
  mist: "#E8E0D4",
} as const;

const MICROCOPY = [
  "Start simple.",
  "Just step outside.",
  "Less noise. More clarity.",
  "A quiet reset still counts.",
  "Take the edge off the day.",
  "Ten honest minutes is enough.",
] as const;

const ZIP_CODE_KEY = "@stepoutside/routeZipCode";
const GOLDEN_HOUR_WINDOW_MIN = 45;

type WeatherSnapshot = {
  sunrise?: string;
  sunset?: string;
  nowTempF?: number;
  nowLabel?: string;
};

type FeaturedReset = {
  route: RouteSuggestion | null;
  sourceLine: string;
};

function hashDate(date: Date): number {
  return date.getFullYear() * 372 + (date.getMonth() + 1) * 31 + date.getDate();
}

function pickMicrocopy(date: Date): string {
  return MICROCOPY[hashDate(date) % MICROCOPY.length] ?? MICROCOPY[0];
}

function getGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function weatherCodeLabel(code: number): string {
  if (code === 0) return "Clear";
  if ([1, 2, 3].includes(code)) return "Cloudy";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Storm";
  return "Mixed";
}

function cToF(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0 min";
  if (minutes < 60) return `${minutes} min`;

  const hours = minutes / 60;
  if (hours >= 10 || Number.isInteger(hours)) return `${Math.round(hours)} hr`;
  return `${hours.toFixed(1)} hr`;
}

function formatTimeUntil(minutes: number): string {
  if (minutes <= 0) return "now";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours} hr` : `${hours} hr ${remainder} min`;
}

function minutesFromNow(iso?: string, now: Date = new Date()): number | null {
  if (!iso) return null;
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.round((timestamp - now.getTime()) / 60000);
}

function buildStatusLine(todayMinutes: number, weather: WeatherSnapshot | null, now: Date = new Date()): string {
  const sunriseDelta = minutesFromNow(weather?.sunrise, now);
  const sunsetDelta = minutesFromNow(weather?.sunset, now);

  const goldenHourActive =
    (sunriseDelta !== null && Math.abs(sunriseDelta) <= GOLDEN_HOUR_WINDOW_MIN) ||
    (sunsetDelta !== null && Math.abs(sunsetDelta) <= GOLDEN_HOUR_WINDOW_MIN);

  if (goldenHourActive) return "Golden Hour active";
  if (todayMinutes > 0) return "You already showed up today";
  if (sunriseDelta !== null && sunriseDelta > 0 && sunriseDelta <= 120) {
    return `Sunrise in ${formatTimeUntil(sunriseDelta)}`;
  }
  if (sunsetDelta !== null && sunsetDelta > 0 && sunsetDelta <= 180) {
    return `Sunset in ${formatTimeUntil(sunsetDelta)}`;
  }

  const hour = now.getHours();
  if (hour < 12) return "Morning direction starts small";
  if (hour < 17) return "A midday reset still counts";
  return "Evening reset is still available";
}

function routeKindLabel(route: RouteSuggestion): string {
  if (route.isIndoor) return "Indoor reset";
  if (route.kind === "park_loop") return "Park loop";
  if (route.kind === "trail") return "Trail reset";
  return "Quick walk";
}

function routeSummary(route: RouteSuggestion): string {
  const base = `~${route.estMinutes} min`;
  const type = routeKindLabel(route);
  const tag = route.tags[0]?.replace(/-/g, " ");
  return tag ? `${base} • ${type} • ${tag}` : `${base} • ${type}`;
}

async function openInMaps(route: RouteSuggestion): Promise<void> {
  const label = encodeURIComponent(route.name);
  const url = `http://maps.apple.com/?ll=${route.lat},${route.lng}&q=${label}`;
  await Linking.openURL(url);
}

async function fetchWeatherSnapshot(coords: { lat: number; lng: number }): Promise<WeatherSnapshot | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lng}` +
      "&hourly=temperature_2m,weathercode&daily=sunrise,sunset&forecast_days=1&timezone=auto";

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    const hourly = data?.hourly;
    const times: string[] = hourly?.time ?? [];
    const tempsC: number[] = hourly?.temperature_2m ?? [];
    const weatherCodes: number[] = hourly?.weathercode ?? [];

    const nowHour = new Date().getHours();
    const index = times.findIndex((time) => new Date(time).getHours() === nowHour);
    const currentIndex = index >= 0 ? index : 0;

    return {
      sunrise: data?.daily?.sunrise?.[0] as string | undefined,
      sunset: data?.daily?.sunset?.[0] as string | undefined,
      nowTempF:
        typeof tempsC[currentIndex] === "number" ? cToF(tempsC[currentIndex]) : undefined,
      nowLabel:
        typeof weatherCodes[currentIndex] === "number"
          ? weatherCodeLabel(weatherCodes[currentIndex])
          : undefined,
    };
  } catch {
    return null;
  }
}

async function loadFeaturedResetFromZip(): Promise<FeaturedReset> {
  const savedZip = normalizeZip((await AsyncStorage.getItem(ZIP_CODE_KEY)) ?? "");
  if (savedZip.length !== 5) {
    return {
      route: null,
      sourceLine: "Turn on location or add a ZIP in Suggestions to see nearby reset ideas.",
    };
  }

  try {
    const routes = await getRouteSuggestionsByZip(savedZip);
    if (routes.length > 0) {
      void cacheRouteSuggestions(routes);
    }
    return {
      route: routes[0] ?? null,
      sourceLine:
        routes.length > 0
          ? `Pulled from your saved ZIP ${savedZip}.`
          : "No nearby reset is seeded for your saved ZIP yet.",
    };
  } catch {
    return {
      route: null,
      sourceLine: "Couldn’t load reset suggestions from your saved ZIP right now.",
    };
  }
}

export default function HomeTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [summary, setSummary] = useState<SummaryStats>(EMPTY_SUMMARY);
  const [dailySpark, setDailySpark] = useState<DailySpark | null>(null);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [featuredReset, setFeaturedReset] = useState<FeaturedReset>({
    route: null,
    sourceLine: "Looking for a nearby reset…",
  });
  const [isPro, setIsPro] = useState(false);
  const [loadingContext, setLoadingContext] = useState(true);

  const now = new Date();
  const todayKey = dayKeyLocal(now);
  const todayMinutes = summary.daysCompleted?.[todayKey] ?? 0;

  const greeting = getGreeting(now);
  const dayLabel = formatDayLabel(now);
  const microcopy = pickMicrocopy(now);
  const statusLine = buildStatusLine(todayMinutes, weather, now);

  const loadHome = useCallback(async () => {
    setLoadingContext(true);

    const [summaryResult, proResult] = await Promise.allSettled([getSummary(), getProState()]);

    setSummary(summaryResult.status === "fulfilled" ? summaryResult.value : EMPTY_SUMMARY);
    setDailySpark(getDailySpark(new Date()));
    setIsPro(proResult.status === "fulfilled" ? proResult.value.isPro : false);

    let nextWeather: WeatherSnapshot | null = null;
    let nextReset: FeaturedReset | null = null;

    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status === "granted") {
        const lastKnown = await Location.getLastKnownPositionAsync();
        const position =
          lastKnown ??
          (await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }));

        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        const [weatherResult, routeResult] = await Promise.allSettled([
          fetchWeatherSnapshot(coords),
          getRouteSuggestionsNearCoords(coords),
        ]);

        nextWeather = weatherResult.status === "fulfilled" ? weatherResult.value : null;

        const nearbyRoutes = routeResult.status === "fulfilled" ? routeResult.value : [];
        if (nearbyRoutes.length > 0) {
          void cacheRouteSuggestions(nearbyRoutes);
          nextReset = {
            route: nearbyRoutes[0] ?? null,
            sourceLine: "Close enough to make today easy.",
          };
        }
      }
    } catch {
      nextWeather = null;
    }

    if (!nextReset) {
      nextReset = await loadFeaturedResetFromZip();
    }

    setWeather(nextWeather);
    setFeaturedReset(nextReset);
    setLoadingContext(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadHome();
    }, [loadHome])
  );

  return (
    <SafeAreaView
      style={[styles.safe, { paddingTop: Math.max(insets.top, 10) }]}
      edges={["top", "left", "right"]}
    >
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroGlowOne} />
          <View style={styles.heroGlowTwo} />

          <View style={styles.heroTopRow}>
            <View style={styles.heroEyebrowPill}>
              <Text style={styles.heroEyebrowText}>{dayLabel}</Text>
            </View>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{statusLine}</Text>
            </View>
          </View>

          <View style={styles.heroBrandBlock}>
            <Text style={styles.greeting}>{greeting}</Text>
          </View>
          <Text style={styles.microcopy}>{microcopy}</Text>
          <Text style={styles.heroSupportLine}>A calm ritual for clearing your head and keeping momentum close.</Text>

          <Pressable
            onPress={() => router.push("/walk")}
            style={({ pressed }) => [
              styles.primaryCta,
              pressed ? { opacity: 0.96, transform: [{ scale: 0.99 }] } : null,
            ]}
          >
            <Text style={styles.primaryCtaText}>START WALK</Text>
          </Pressable>

          <View style={styles.heroMetricsRow}>
            <View style={styles.heroMetricChip}>
              <Text style={styles.heroMetricLabel}>Today</Text>
              <Text style={styles.heroMetricValue}>
                {todayMinutes > 0 ? formatMinutes(todayMinutes) : "Not started"}
              </Text>
            </View>

            <View style={styles.heroMetricChip}>
              <Text style={styles.heroMetricLabel}>Weather</Text>
              <Text style={styles.heroMetricValue}>
                {weather?.nowTempF ? `${weather.nowTempF}°F • ${weather.nowLabel ?? "Now"}` : "Set by the day"}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.momentumPanel}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitleOnGreen}>Consistency</Text>
            <Pressable onPress={() => router.push("/(tabs)/stats")}>
              <Text style={styles.sectionLinkOnGreen}>View stats</Text>
            </Pressable>
          </View>

          <View style={styles.progressGrid}>
            <View style={styles.statCardOnGreen}>
              <Text style={styles.statLabelOnGreen}>Streak</Text>
              <Text style={styles.statValueOnGreen}>{summary.currentStreakDays}</Text>
              <Text style={styles.statMetaOnGreen}>
                day{summary.currentStreakDays === 1 ? "" : "s"}
              </Text>
            </View>

            <View style={styles.statCardOnGreen}>
              <Text style={styles.statLabelOnGreen}>Outside</Text>
              <Text style={styles.statValueOnGreen}>{formatMinutes(summary.totalMinutes)}</Text>
              <Text style={styles.statMetaOnGreen}>total</Text>
            </View>

            <View style={styles.statCardOnGreen}>
              <Text style={styles.statLabelOnGreen}>Sunrise</Text>
              <Text style={styles.statValueOnGreen}>{summary.sunriseBonusCount}</Text>
              <Text style={styles.statMetaOnGreen}>golden starts</Text>
            </View>

            <View style={styles.statCardOnGreen}>
              <Text style={styles.statLabelOnGreen}>Sunset</Text>
              <Text style={styles.statValueOnGreen}>{summary.sunsetBonusCount}</Text>
              <Text style={styles.statMetaOnGreen}>golden resets</Text>
            </View>
          </View>
        </View>

        {dailySpark ? (
          <View style={styles.sparkCard}>
            <Text style={styles.cardEyebrow}>Daily Spark</Text>
            <Text style={styles.sparkQuote}>“{dailySpark.quote}”</Text>
            <Text style={styles.sparkMission}>{dailySpark.mission}</Text>
            <Text style={styles.sparkReward}>{dailySpark.reward}</Text>
          </View>
        ) : null}

        <View style={styles.resetCard}>
          <Text style={styles.cardEyebrow}>Nearby Reset</Text>

          {loadingContext && !featuredReset.route ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={BRAND.forest} />
              <Text style={styles.loadingText}>Looking for something close by…</Text>
            </View>
          ) : featuredReset.route ? (
            <>
              <Text style={styles.resetTitle}>{featuredReset.route.name}</Text>
              <Text style={styles.resetMeta}>{routeSummary(featuredReset.route)}</Text>
              <Text style={styles.resetNote}>{featuredReset.sourceLine}</Text>

              <View style={styles.resetActions}>
                <Pressable
                  style={styles.resetPrimaryBtn}
                  onPress={() => void openInMaps(featuredReset.route as RouteSuggestion)}
                >
                  <Text style={styles.resetPrimaryBtnText}>OPEN IN MAPS</Text>
                </Pressable>

                <Pressable
                  style={styles.resetSecondaryBtn}
                  onPress={() => router.push("/(tabs)/steps")}
                >
                  <Text style={styles.resetSecondaryBtnText}>SEE ALL RESETS</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.resetTitle}>No nearby reset loaded yet</Text>
              <Text style={styles.resetNote}>{featuredReset.sourceLine}</Text>
              <Pressable
                style={styles.resetSecondaryBtnSolo}
                onPress={() => router.push("/(tabs)/steps")}
              >
                <Text style={styles.resetSecondaryBtnText}>BROWSE RESETS</Text>
              </Pressable>
            </>
          )}
        </View>

        {!isPro ? (
          <View style={styles.proCard}>
            <Text style={styles.cardEyebrow}>Step Outside Pro</Text>
            <Text style={styles.proTitle}>Keep your reset close.</Text>
            <Text style={styles.proBody}>
              Unlock the full version for a steadier rhythm, smarter route support, and a more
              intentional daily practice.
            </Text>

            <Pressable
              style={styles.proButton}
              onPress={() => router.push("/pro")}
            >
              <Text style={styles.proButtonText}>EXPLORE PRO</Text>
            </Pressable>
          </View>
        ) : null}
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
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 14,
  },
  heroCard: {
    position: "relative",
    borderRadius: 28,
    padding: 22,
    backgroundColor: BRAND.forest,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    overflow: "hidden",
  },
  heroGlowOne: {
    position: "absolute",
    top: -42,
    right: -24,
    width: 156,
    height: 156,
    borderRadius: 999,
    backgroundColor: "rgba(242,181,65,0.16)",
  },
  heroGlowTwo: {
    position: "absolute",
    bottom: -54,
    left: -34,
    width: 138,
    height: 138,
    borderRadius: 999,
    backgroundColor: "rgba(248,244,238,0.08)",
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  heroBrandBlock: {
    marginTop: 32,
    alignSelf: "flex-start",
  },
  heroEyebrowPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(248,244,238,0.12)",
    borderWidth: 1,
    borderColor: "rgba(248,244,238,0.12)",
  },
  heroEyebrowText: {
    color: "rgba(248,244,238,0.78)",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  statusPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(248,244,238,0.14)",
    borderWidth: 1,
    borderColor: "rgba(248,244,238,0.14)",
  },
  statusPillText: {
    color: "#F8F4EE",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  greeting: {
    color: "rgba(248,244,238,0.82)",
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  microcopy: {
    marginTop: 8,
    color: "#FFFFFF",
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "900",
    maxWidth: 320,
  },
  heroSupportLine: {
    marginTop: 10,
    color: "rgba(248,244,238,0.68)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    maxWidth: 320,
  },
  primaryCta: {
    marginTop: 24,
    minHeight: 66,
    borderRadius: 20,
    backgroundColor: BRAND.sunrise,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryCtaText: {
    color: BRAND.charcoal,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  heroSupport: {
    marginTop: 14,
    color: "rgba(248,244,238,0.84)",
    fontSize: 14,
    fontWeight: "700",
  },
  weatherSupport: {
    marginTop: 6,
    color: "rgba(248,244,238,0.64)",
    fontSize: 12,
    fontWeight: "700",
  },
  heroMetricsRow: {
    marginTop: 16,
    flexDirection: "row",
    gap: 10,
  },
  heroMetricChip: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "rgba(248,244,238,0.1)",
    borderWidth: 1,
    borderColor: "rgba(248,244,238,0.12)",
  },
  heroMetricLabel: {
    color: "rgba(248,244,238,0.62)",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  heroMetricValue: {
    marginTop: 6,
    color: "#FFFFFF",
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  momentumPanel: {
    borderRadius: 28,
    padding: 18,
    backgroundColor: "rgba(37,94,54,0.94)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.98)",
  },
  sectionTitle: {
    color: BRAND.charcoal,
    fontSize: 18,
    fontWeight: "900",
  },
  sectionTitleOnGreen: {
    color: "#F8F4EE",
    fontSize: 18,
    fontWeight: "900",
  },
  sectionLink: {
    color: BRAND.forest,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  sectionLinkOnGreen: {
    color: BRAND.sunrise,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  progressGrid: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    width: "47%",
    borderRadius: 22,
    paddingVertical: 18,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.56)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.08)",
  },
  statCardOnGreen: {
    width: "47%",
    borderRadius: 22,
    paddingVertical: 18,
    paddingHorizontal: 16,
    backgroundColor: "rgba(248,244,238,0.12)",
    borderWidth: 1,
    borderColor: "rgba(248,244,238,0.16)",
  },
  statLabel: {
    color: "rgba(11,15,14,0.56)",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  statLabelOnGreen: {
    color: "rgba(248,244,238,0.72)",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  statValue: {
    marginTop: 8,
    color: BRAND.charcoal,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "900",
  },
  statValueOnGreen: {
    marginTop: 8,
    color: "#FFFFFF",
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "900",
  },
  statMeta: {
    marginTop: 4,
    color: "rgba(11,15,14,0.58)",
    fontSize: 12,
    fontWeight: "700",
  },
  statMetaOnGreen: {
    marginTop: 4,
    color: "rgba(248,244,238,0.72)",
    fontSize: 12,
    fontWeight: "700",
  },
  sparkCard: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: "rgba(255,255,255,0.48)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.08)",
  },
  cardEyebrow: {
    color: BRAND.forest,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  sparkQuote: {
    marginTop: 10,
    color: BRAND.charcoal,
    fontSize: 24,
    lineHeight: 31,
    fontWeight: "900",
  },
  sparkMission: {
    marginTop: 12,
    color: "rgba(11,15,14,0.8)",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
  },
  sparkReward: {
    marginTop: 10,
    color: "rgba(11,15,14,0.6)",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  resetCard: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: "rgba(37,94,54,0.08)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.16)",
  },
  loadingRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    color: "rgba(11,15,14,0.7)",
    fontSize: 14,
    fontWeight: "700",
  },
  resetTitle: {
    marginTop: 10,
    color: BRAND.charcoal,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
  },
  resetMeta: {
    marginTop: 8,
    color: "rgba(11,15,14,0.68)",
    fontSize: 14,
    fontWeight: "800",
  },
  resetNote: {
    marginTop: 8,
    color: "rgba(11,15,14,0.72)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  resetActions: {
    marginTop: 16,
    flexDirection: "row",
    gap: 10,
  },
  resetPrimaryBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: BRAND.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  resetPrimaryBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  resetSecondaryBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.58)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  resetSecondaryBtnSolo: {
    marginTop: 16,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.58)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  resetSecondaryBtnText: {
    color: BRAND.charcoal,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  proCard: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: "rgba(242,181,65,0.18)",
    borderWidth: 1,
    borderColor: "rgba(242,181,65,0.34)",
  },
  proTitle: {
    marginTop: 10,
    color: BRAND.charcoal,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
  },
  proBody: {
    marginTop: 10,
    color: "rgba(11,15,14,0.76)",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
  },
  proButton: {
    marginTop: 16,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: BRAND.charcoal,
    alignItems: "center",
    justifyContent: "center",
  },
  proButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
});
