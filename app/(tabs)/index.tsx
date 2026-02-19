import * as Location from "expo-location";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { dayKeyLocal, getSummary } from "../../src/lib/store";

const BRAND = {
  forest: "#255E36",
  sunrise: "#F2B541",
  bone: "#F8F4EE",
  charcoal: "#0B0F0E",
} as const;

type WalkWindow = {
  label: string;
  reason: string;
};

type WeatherCard = {
  nowTempF: number;
  nowLabel: string;
  windows: WalkWindow[];
  sunrise?: string;
  sunset?: string;
};

function cToF(c: number): number {
  return (c * 9) / 5 + 32;
}

function hourLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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

function scoreHour(tempC: number, precipProb: number, precipMm: number, windKmh: number): number {
  const tempF = cToF(tempC);
  let score = 100;

  // temperature sweet spot ~52-74F
  if (tempF < 40 || tempF > 90) score -= 60;
  else if (tempF < 48 || tempF > 82) score -= 30;
  else if (tempF < 52 || tempF > 74) score -= 12;

  // precipitation avoidance
  score -= precipProb * 0.5;
  if (precipMm > 0.1) score -= 30;
  if (precipMm > 1) score -= 25;

  // wind
  if (windKmh > 30) score -= 18;
  else if (windKmh > 20) score -= 8;

  return score;
}

function bestWindows(times: string[], scores: number[]): WalkWindow[] {
  const windows: WalkWindow[] = [];
  let i = 0;
  while (i < times.length) {
    if (scores[i] < 65) {
      i += 1;
      continue;
    }
    let j = i;
    while (j + 1 < times.length && scores[j + 1] >= 65) j += 1;

    if (j - i + 1 >= 2) {
      const avg = Math.round(scores.slice(i, j + 1).reduce((a, b) => a + b, 0) / (j - i + 1));
      windows.push({
        label: `${hourLabel(times[i])}–${hourLabel(times[j])}`,
        reason: avg >= 82 ? "great conditions" : "good conditions",
      });
    }

    i = j + 1;
  }

  return windows.slice(0, 2);
}

export default function HomeTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [todayMinutes, setTodayMinutes] = useState(0);
  const [todayDistanceMi, setTodayDistanceMi] = useState(0);
  const [streakDays, setStreakDays] = useState(0);
  const [weather, setWeather] = useState<WeatherCard | null>(null);
  const [weatherMsg, setWeatherMsg] = useState("Loading walk weather…");

  const todayKey = useMemo(() => dayKeyLocal(new Date()), []);

  const loadWeather = useCallback(async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        setWeather(null);
        setWeatherMsg("Allow location to get best walk times.");
        return;
      }

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;

      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m,precipitation_probability,precipitation,weathercode,windspeed_10m&daily=sunrise,sunset&temperature_unit=celsius&forecast_days=1&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("weather fetch failed");
      const data = await res.json();

      const hourly = data?.hourly;
      const times: string[] = hourly?.time ?? [];
      const tempC: number[] = hourly?.temperature_2m ?? [];
      const precipProb: number[] = hourly?.precipitation_probability ?? [];
      const precipMm: number[] = hourly?.precipitation ?? [];
      const weatherCodes: number[] = hourly?.weathercode ?? [];
      const wind: number[] = hourly?.windspeed_10m ?? [];

      if (!times.length) throw new Error("missing hourly");

      const now = new Date();
      const currentHourIndex = times.findIndex((t) => new Date(t).getHours() === now.getHours());
      const idx = currentHourIndex >= 0 ? currentHourIndex : 0;

      const nowTempF = Math.round(cToF(tempC[idx] ?? tempC[0] ?? 0));
      const nowLabel = weatherCodeLabel(weatherCodes[idx] ?? 0);
      const sunriseIso = data?.daily?.sunrise?.[0] as string | undefined;
      const sunsetIso = data?.daily?.sunset?.[0] as string | undefined;

      const start = Math.max(idx, 0);
      const end = Math.min(times.length, start + 14); // next ~14 hours
      const lookTimes = times.slice(start, end);
      const scores = lookTimes.map((_, i) =>
        scoreHour(tempC[start + i] ?? 0, precipProb[start + i] ?? 0, precipMm[start + i] ?? 0, wind[start + i] ?? 0)
      );

      const windows = bestWindows(lookTimes, scores);

      if (windows.length === 0) {
        setWeather({
          nowTempF,
          nowLabel,
          sunrise: sunriseIso,
          sunset: sunsetIso,
          windows: [{ label: "No ideal window soon", reason: "check later today" }],
        });
      } else {
        setWeather({ nowTempF, nowLabel, sunrise: sunriseIso, sunset: sunsetIso, windows });
      }

      setWeatherMsg("");
    } catch {
      setWeather(null);
      setWeatherMsg("Couldn’t load weather right now.");
    }
  }, []);

  const load = useCallback(async () => {
    const summary = await getSummary();
    const mins = summary.daysCompleted?.[todayKey] ?? 0;

    setTodayDistanceMi(0);
    setTodayMinutes(mins);
    setStreakDays(summary.currentStreakDays ?? 0);

    await loadWeather();
  }, [todayKey, loadWeather]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <SafeAreaView style={[styles.safe, { paddingTop: Math.max(insets.top, 12) }]} edges={["top", "left", "right"]}>
      <View style={styles.container}>
        <View style={styles.contentWrap}>
          <View style={styles.header}>
            <View style={styles.logoFrame}>
              <Image source={require("../../assets/images/icon.png")} style={styles.logo} />
            </View>
          </View>

        <Pressable
          onPress={() => router.push("/start")}
          style={({ pressed }) => [styles.primary, pressed ? { opacity: 0.92, transform: [{ scale: 0.99 }] } : null]}
        >
          <Text style={styles.primaryText}>START</Text>
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Today</Text>

          <View style={styles.grid}>
            <View style={styles.tile}>
              <Text style={styles.tileLabel}>Minutes</Text>
              <Text style={styles.tileValue}>{todayMinutes}</Text>
            </View>
            <View style={styles.tile}>
              <Text style={styles.tileLabel}>Distance</Text>
              <Text style={styles.tileValue}>{todayDistanceMi.toFixed(1)} mi</Text>
            </View>
            <View style={styles.tile}>
              <Text style={styles.tileLabel}>Streak</Text>
              <Text style={styles.tileValue}>{streakDays} d</Text>
            </View>
          </View>

          <Pressable
            onPress={() => router.push("/(tabs)/stats")}
            style={({ pressed }) => [styles.secondary, pressed ? { opacity: 0.92 } : null]}
          >
            <Text style={styles.secondaryText}>VIEW STATS</Text>
          </Pressable>
        </View>

        <View style={styles.weatherCard}>
          <Text style={styles.weatherTitle}>Today’s Walk Window</Text>
          {weather ? (
            <>
              <Text style={styles.weatherNow}>Now: {weather.nowTempF}°F • {weather.nowLabel}</Text>
              {weather.sunrise ? <Text style={styles.weatherLine}>☀️ Sunrise bonus window: {hourLabel(weather.sunrise)} ± 45m</Text> : null}
              {weather.sunset ? <Text style={styles.weatherLine}>🌅 Sunset bonus window: {hourLabel(weather.sunset)} ± 45m</Text> : null}
              {weather.windows.map((w) => (
                <Text key={w.label} style={styles.weatherLine}>• {w.label} ({w.reason})</Text>
              ))}
            </>
          ) : (
            <Text style={styles.weatherLine}>{weatherMsg}</Text>
          )}
        </View>

          <Text style={styles.sub}>10 minutes is enough.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BRAND.bone,
  },
  container: {
    flex: 1,
    backgroundColor: BRAND.bone,
    paddingHorizontal: 20,
    paddingBottom: 18,
    alignItems: "center",
  },
  contentWrap: {
    width: "100%",
    maxWidth: 620,
  },
  header: { flexDirection: "row", alignItems: "flex-start", marginTop: 8 },
  logoFrame: {
    width: 102,
    height: 102,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: BRAND.bone,
  },
  logo: {
    width: 106,
    height: 102,
    transform: [{ translateX: -2 }],
  },

  primary: {
    marginTop: 14,
    alignSelf: "center",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: BRAND.sunrise,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  primaryText: { color: BRAND.charcoal, fontSize: 22, fontWeight: "900", letterSpacing: 1.6 },

  card: {
    marginTop: 14,
    borderRadius: 22,
    padding: 16,
    backgroundColor: "rgba(11,15,14,0.06)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.12)",
  },
  cardTitle: { fontSize: 18, fontWeight: "900", color: BRAND.charcoal },

  grid: { marginTop: 14, flexDirection: "row", justifyContent: "space-between" },
  tile: {
    width: "31%",
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.60)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.10)",
    alignItems: "center",
  },
  tileLabel: { fontSize: 12, fontWeight: "800", color: "rgba(11,15,14,0.65)" },
  tileValue: { marginTop: 8, fontSize: 20, fontWeight: "900", color: BRAND.charcoal },

  secondary: {
    marginTop: 16,
    alignSelf: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: BRAND.forest,
  },
  secondaryText: { color: "white", fontWeight: "900", letterSpacing: 1.0 },

  weatherCard: {
    marginTop: 8,
    borderRadius: 16,
    padding: 14,
    backgroundColor: "rgba(37,94,54,0.08)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.16)",
  },
  weatherTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: BRAND.forest,
  },
  weatherNow: {
    marginTop: 6,
    color: "rgba(11,15,14,0.82)",
    fontWeight: "800",
    fontSize: 13,
  },
  weatherLine: {
    marginTop: 4,
    color: "rgba(11,15,14,0.72)",
    fontWeight: "700",
    fontSize: 12,
  },

  sub: { marginTop: 8, textAlign: "center", color: "rgba(11,15,14,0.6)", fontWeight: "700" },
});
