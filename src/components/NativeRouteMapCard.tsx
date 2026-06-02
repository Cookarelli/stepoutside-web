import React, { useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet, Text, UIManager, View } from "react-native";

import { ENV } from "../../env";
import type { RoutePoint } from "../lib/store";
import { RoutePreview } from "./RoutePreview";

type NativeRouteMapCardProps = {
  points: RoutePoint[];
  title?: string;
  subtitle?: string;
};

type NativeMapsModule = typeof import("react-native-maps");
type MapProviderMode = "apple" | "google";

let cachedNativeMapsModule: NativeMapsModule | null = null;
let nativeMapsLoadAttempted = false;

function getNativeMapsModule(): NativeMapsModule | null {
  if (nativeMapsLoadAttempted) {
    return cachedNativeMapsModule;
  }

  nativeMapsLoadAttempted = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedNativeMapsModule = require("react-native-maps") as NativeMapsModule;
  } catch (error) {
    console.warn("[maps] react-native-maps module unavailable", error);
    cachedNativeMapsModule = null;
  }

  return cachedNativeMapsModule;
}

function isManagerAvailable(managerName: string): boolean {
  try {
    return Boolean(UIManager.getViewManagerConfig?.(managerName));
  } catch {
    return false;
  }
}

function getProviderMode(): MapProviderMode {
  if (Platform.OS === "ios" && ENV.MAPS.preferGoogleProviderOnIos) {
    return "google";
  }
  return Platform.OS === "android" ? "google" : "apple";
}

function buildFallbackReason(providerMode: MapProviderMode, nativeAvailable: boolean): string {
  if (!ENV.MAPS.nativeRouteMapsEnabled) {
    return "Native route maps are disabled, so Step Outside is showing the saved route preview instead.";
  }

  if (!nativeAvailable) {
    return "This build does not include native map support yet, so Step Outside is showing the saved route preview instead.";
  }

  if (providerMode === "google") {
    return "Google Maps is unavailable in this build or environment, so Step Outside is showing the saved route preview instead.";
  }

  return "The native map could not load, so Step Outside is showing the saved route preview instead.";
}

function buildRegion(points: RoutePoint[]) {
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const latitude = (minLat + maxLat) / 2;
  const longitude = (minLng + maxLng) / 2;
  const latitudeDelta = Math.max(0.0025, (maxLat - minLat) * 1.8);
  const longitudeDelta = Math.max(0.0025, (maxLng - minLng) * 1.8);

  return {
    latitude,
    longitude,
    latitudeDelta,
    longitudeDelta,
  };
}

function splitPolylineSegments(points: RoutePoint[]) {
  const segments: { latitude: number; longitude: number }[][] = [];
  let current: { latitude: number; longitude: number }[] = [];

  for (const point of points) {
    if (point.segmentStart && current.length > 0) {
      if (current.length > 1) segments.push(current);
      current = [{ latitude: point.lat, longitude: point.lng }];
      continue;
    }

    current.push({ latitude: point.lat, longitude: point.lng });
  }

  if (current.length > 1) {
    segments.push(current);
  }

  return segments;
}

export function NativeRouteMapCard({
  points,
  title = "Your route",
  subtitle = "Captured from this walk",
}: NativeRouteMapCardProps) {
  const [timedOut, setTimedOut] = useState(false);
  const [ready, setReady] = useState(false);

  const nativeMaps = useMemo(() => getNativeMapsModule(), []);
  const providerMode = useMemo(() => getProviderMode(), []);
  const nativeManagerAvailable = useMemo(() => {
    if (!ENV.MAPS.nativeRouteMapsEnabled) return false;
    if (!nativeMaps) return false;
    if (Platform.OS === "web") return false;

    return providerMode === "google" ? isManagerAvailable("AIRGoogleMap") || isManagerAvailable("AIRMap") : isManagerAvailable("AIRMap");
  }, [nativeMaps, providerMode]);

  const shouldUseNativeMap = ENV.MAPS.nativeRouteMapsEnabled && Boolean(nativeMaps) && nativeManagerAvailable && points.length > 1;
  const region = useMemo(() => buildRegion(points), [points]);

  useEffect(() => {
    if (!shouldUseNativeMap) {
      setReady(false);
      setTimedOut(false);
      return;
    }

    setTimedOut(false);
    setReady(false);

    const timeoutId = setTimeout(() => {
      setTimedOut(true);
      console.warn("[maps] native route map timed out before ready", {
        providerMode,
        pointCount: points.length,
      });
    }, 4500);

    return () => clearTimeout(timeoutId);
  }, [points.length, providerMode, shouldUseNativeMap]);

  useEffect(() => {
    if (!shouldUseNativeMap) {
      console.warn("[maps] using fallback route preview", {
        providerMode,
        nativeRouteMapsEnabled: ENV.MAPS.nativeRouteMapsEnabled,
        nativeMapsModuleLoaded: Boolean(nativeMaps),
        nativeManagerAvailable,
      });
    }
  }, [nativeManagerAvailable, nativeMaps, providerMode, shouldUseNativeMap]);

  if (!shouldUseNativeMap || timedOut) {
    return (
      <View style={styles.wrapper}>
        <RoutePreview points={points} title={title} subtitle={subtitle} />
        <View style={styles.fallbackNotice}>
          <Text style={styles.fallbackTitle}>Map preview fallback</Text>
          <Text style={styles.fallbackBody}>{buildFallbackReason(providerMode, Boolean(nativeMaps) && nativeManagerAvailable)}</Text>
        </View>
      </View>
    );
  }

  const { default: MapView, Polyline, Marker, PROVIDER_GOOGLE } = nativeMaps!;
  const provider = providerMode === "google" ? PROVIDER_GOOGLE : undefined;
  const startPoint = points[0];
  const endPoint = points[points.length - 1];
  const polylineSegments = splitPolylineSegments(points);

  return (
    <View style={styles.nativeCard}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <MapView
        style={styles.map}
        initialRegion={region}
        provider={provider}
        onMapReady={() => {
          setReady(true);
          setTimedOut(false);
        }}
        onMapLoaded={() => {
          setReady(true);
          setTimedOut(false);
        }}
        scrollEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        zoomControlEnabled={false}
        zoomEnabled={false}
        moveOnMarkerPress={false}
      >
        {polylineSegments.map((segment, index) => (
          <Polyline
            key={`segment-${index}`}
            coordinates={segment}
            strokeColor="#255E36"
            strokeWidth={4}
          />
        ))}
        {startPoint ? (
          <Marker
            coordinate={{ latitude: startPoint.lat, longitude: startPoint.lng }}
            pinColor="#F2B541"
          />
        ) : null}
        {endPoint ? (
          <Marker coordinate={{ latitude: endPoint.lat, longitude: endPoint.lng }} pinColor="#255E36" />
        ) : null}
      </MapView>
      <Text style={styles.providerHint}>
        {ready
          ? providerMode === "google"
            ? "Google Maps provider"
            : "Apple Maps provider"
          : "Loading native route map…"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    gap: 10,
  },
  fallbackNotice: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.12)",
  },
  fallbackTitle: {
    color: "#255E36",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  fallbackBody: {
    marginTop: 6,
    color: "rgba(11,15,14,0.66)",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  nativeCard: {
    width: "100%",
    borderRadius: 22,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.08)",
  },
  header: {
    marginBottom: 12,
  },
  title: {
    color: "#0B0F0E",
    fontSize: 16,
    fontWeight: "900",
  },
  subtitle: {
    marginTop: 4,
    color: "rgba(11,15,14,0.58)",
    fontSize: 12,
    fontWeight: "700",
  },
  map: {
    width: "100%",
    height: 220,
    borderRadius: 18,
  },
  providerHint: {
    marginTop: 10,
    color: "rgba(11,15,14,0.54)",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
});
