import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type LatLng = { lat: number; lng: number };

function haversineMeters(a: LatLng, b: LatLng): number {
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

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Walk() {
  const router = useRouter();

  const [permission, setPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const [running, setRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [distanceM, setDistanceM] = useState(0);

  const startedAtRef = useRef<number | null>(null);
  const tickRef = useRef<NodeJS.Timeout | null>(null);

  const lastPointRef = useRef<LatLng | null>(null);
  const subRef = useRef<Location.LocationSubscription | null>(null);

  const pace = useMemo(() => {
    if (distanceM < 5 || elapsedSec < 5) return "";
    const km = distanceM / 1000;
    const min = elapsedSec / 60;
    const minPerKm = min / km;
    const mm = Math.floor(minPerKm);
    const ss = Math.round((minPerKm - mm) * 60);
    return `${mm}:${String(ss).padStart(2, "0")} / km`;
  }, [distanceM, elapsedSec]);

  const requestPerms = async () => {
    const res = await Location.requestForegroundPermissionsAsync();
    setPermission(res.status === "granted" ? "granted" : "denied");
    return res.status === "granted";
  };

  const start = async () => {
    void Haptics.selectionAsync();

    const ok = permission === "granted" ? true : await requestPerms();
    if (!ok) return;

    startedAtRef.current = Date.now();
    setElapsedSec(0);
    setDistanceM(0);
    lastPointRef.current = null;

    setRunning(true);

    // timer
    tickRef.current && clearInterval(tickRef.current);
    tickRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);

    // gps subscription
    subRef.current?.remove();
    subRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 2000,
        distanceInterval: 5,
      },
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const last = lastPointRef.current;
        if (last) {
          const d = haversineMeters(last, p);
          // ignore crazy jumps (GPS spikes)
          if (d < 60) setDistanceM((m) => m + d);
        }
        lastPointRef.current = p;
      }
    );

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const pause = async () => {
    void Haptics.selectionAsync();
    setRunning(false);
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    // keep GPS on pause? for V2 we stop GPS to save battery
    subRef.current?.remove();
    subRef.current = null;
  };

  const resume = async () => {
    void Haptics.selectionAsync();
    // resume timer
    setRunning(true);
    tickRef.current && clearInterval(tickRef.current);
    tickRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);

    // resume GPS
    subRef.current?.remove();
    subRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 2000,
        distanceInterval: 5,
      },
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const last = lastPointRef.current;
        if (last) {
          const d = haversineMeters(last, p);
          if (d < 60) setDistanceM((m) => m + d);
        }
        lastPointRef.current = p;
      }
    );
  };

  const end = async () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    subRef.current?.remove();
    subRef.current = null;

    const startedAt = startedAtRef.current ?? Date.now();
    const endedAt = Date.now();

    // For now, do NOT write to Firestore.
    // We’ll save locally next (AsyncStorage store.ts).

    router.push({
      pathname: "/modal",
      params: {
        startedAt: String(startedAt),
        endedAt: String(endedAt),
        durationSec: String(elapsedSec),
        distanceM: String(Math.round(distanceM)),
        source: "gps",
      },
    });
  };

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      subRef.current?.remove();
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Walk</Text>
      <Text style={styles.sub}>Elapsed</Text>
      <Text style={styles.big}>{fmtTime(elapsedSec)}</Text>

      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.metricK}>Distance</Text>
          <Text style={styles.metricV}>{(distanceM / 1000).toFixed(2)} km</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricK}>Pace</Text>
          <Text style={styles.metricV}>{pace || "—"}</Text>
        </View>
      </View>

      {permission === "denied" ? (
        <Text style={styles.warn}>Location permission denied. Enable it in Settings.</Text>
      ) : null}

      {!running ? (
        <Pressable style={styles.btnPrimary} onPress={elapsedSec === 0 ? start : resume}>
          <Text style={styles.btnPrimaryText}>{elapsedSec === 0 ? "START" : "RESUME"}</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.btnSecondary} onPress={pause}>
          <Text style={styles.btnSecondaryText}>PAUSE</Text>
        </Pressable>
      )}

      <Pressable
        style={[styles.btnEnd, elapsedSec < 10 ? { opacity: 0.5 } : null]}
        onPress={end}
        disabled={elapsedSec < 10}
      >
        <Text style={styles.btnEndText}>END</Text>
      </Pressable>

      <Pressable style={styles.back} onPress={() => router.back()}>
        <Text style={styles.backText}>Back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0F0E",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  title: { fontSize: 26, fontWeight: "900", color: "rgba(255,255,255,0.92)" },
  sub: { marginTop: 10, fontSize: 13, fontWeight: "800", color: "rgba(255,255,255,0.65)" },
  big: { marginTop: 8, fontSize: 56, fontWeight: "900", color: "rgba(255,255,255,0.92)" },

  metrics: { flexDirection: "row", gap: 14, marginTop: 18 },
  metric: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    minWidth: 140,
    alignItems: "center",
  },
  metricK: { fontSize: 12, fontWeight: "800", color: "rgba(255,255,255,0.65)" },
  metricV: { marginTop: 6, fontSize: 16, fontWeight: "900", color: "rgba(255,255,255,0.92)" },

  warn: { marginTop: 14, color: "#F2B541", fontWeight: "800" },

  btnPrimary: {
    marginTop: 22,
    backgroundColor: "#255E36",
    paddingVertical: 14,
    paddingHorizontal: 26,
    borderRadius: 16,
    minWidth: 220,
    alignItems: "center",
  },
  btnPrimaryText: { color: "white", fontWeight: "900", letterSpacing: 1 },

  btnSecondary: {
    marginTop: 22,
    backgroundColor: "rgba(255,255,255,0.10)",
    paddingVertical: 14,
    paddingHorizontal: 26,
    borderRadius: 16,
    minWidth: 220,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  btnSecondaryText: { color: "white", fontWeight: "900", letterSpacing: 1 },

  btnEnd: {
    marginTop: 12,
    backgroundColor: "#F2B541",
    paddingVertical: 14,
    paddingHorizontal: 26,
    borderRadius: 16,
    minWidth: 220,
    alignItems: "center",
  },
  btnEndText: { color: "#0B0F0E", fontWeight: "900", letterSpacing: 1 },

  back: { marginTop: 18, paddingVertical: 8, paddingHorizontal: 12 },
  backText: { color: "rgba(255,255,255,0.65)", fontWeight: "800" },
});