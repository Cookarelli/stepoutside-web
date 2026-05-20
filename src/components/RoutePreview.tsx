import React, { useEffect, useMemo, useRef } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";

import { ENV } from "../../env";
import type { DisplayRoutePoint, FilteredRoutePoint } from "../types/routes";

type RoutePreviewProps = {
  points: FilteredRoutePoint[];
  title?: string;
  subtitle?: string;
};

type PreviewPoint = {
  x: number;
  y: number;
  isStart?: boolean;
  isEnd?: boolean;
};

type PreviewSegment = {
  left: number;
  top: number;
  width: number;
  angle: number;
};

const PREVIEW_WIDTH = 280;
const PREVIEW_HEIGHT = 160;
const PREVIEW_PADDING = 16;
const MAP_HEIGHT = 210;
const MAX_MAP_POINTS = 120;

function samplePoints(points: FilteredRoutePoint[], maxPoints: number): FilteredRoutePoint[] {
  if (points.length <= maxPoints) return points;

  const lastIndex = points.length - 1;
  const sampled: FilteredRoutePoint[] = [];
  for (let index = 0; index < maxPoints; index += 1) {
    const sourceIndex = Math.round((index / (maxPoints - 1)) * lastIndex);
    sampled.push(points[sourceIndex] ?? points[lastIndex]);
  }
  return sampled;
}

function smoothRoutePoints(points: FilteredRoutePoint[], passes = 2): FilteredRoutePoint[] {
  if (points.length < 3) return points;

  let next = samplePoints(points, MAX_MAP_POINTS);

  for (let pass = 0; pass < passes; pass += 1) {
    const smoothed: FilteredRoutePoint[] = [next[0]];

    for (let index = 0; index < next.length - 1; index += 1) {
      const current = next[index];
      const following = next[index + 1];
      if (!current || !following) continue;

      smoothed.push({
        ...current,
        lat: current.lat * 0.75 + following.lat * 0.25,
        lng: current.lng * 0.75 + following.lng * 0.25,
      });
      smoothed.push({
        ...following,
        lat: current.lat * 0.25 + following.lat * 0.75,
        lng: current.lng * 0.25 + following.lng * 0.75,
      });
    }

    const last = next[next.length - 1];
    if (last) {
      smoothed.push(last);
    }

    next = smoothed;
  }

  return next;
}

function buildDisplayRoutePoints(points: FilteredRoutePoint[]): DisplayRoutePoint[] {
  // Map rendering is display-only. Do not use this for distance or pace calculations.
  // We intentionally smooth and sample a cloned route array here so saved routePoints remain untouched.
  return smoothRoutePoints(points).map((point) => ({
    latitude: point.lat,
    longitude: point.lng,
  }));
}

function buildPreviewPoints(points: FilteredRoutePoint[]): PreviewPoint[] {
  const sampled = samplePoints(points, 32);
  const lats = sampled.map((point) => point.lat);
  const lngs = sampled.map((point) => point.lng);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const latRange = Math.max(maxLat - minLat, 0.0002);
  const lngRange = Math.max(maxLng - minLng, 0.0002);

  return sampled.map((point, index) => {
    const x =
      PREVIEW_PADDING + ((point.lng - minLng) / lngRange) * (PREVIEW_WIDTH - PREVIEW_PADDING * 2);
    const y =
      PREVIEW_HEIGHT -
      PREVIEW_PADDING -
      ((point.lat - minLat) / latRange) * (PREVIEW_HEIGHT - PREVIEW_PADDING * 2);

    return {
      x,
      y,
      isStart: index === 0,
      isEnd: index === sampled.length - 1,
    };
  });
}

function smoothPreviewPoints(points: PreviewPoint[], passes = 2): PreviewPoint[] {
  if (points.length < 3) return points;

  let next = points;

  for (let pass = 0; pass < passes; pass += 1) {
    const smoothed: PreviewPoint[] = [next[0]];

    for (let index = 0; index < next.length - 1; index += 1) {
      const current = next[index];
      const following = next[index + 1];
      if (!current || !following) continue;

      smoothed.push({
        x: current.x * 0.75 + following.x * 0.25,
        y: current.y * 0.75 + following.y * 0.25,
      });
      smoothed.push({
        x: current.x * 0.25 + following.x * 0.75,
        y: current.y * 0.25 + following.y * 0.75,
      });
    }

    const last = next[next.length - 1];
    if (last) {
      smoothed.push({ ...last });
    }

    next = smoothed.map((point, index) => ({
      ...point,
      isStart: index === 0,
      isEnd: index === smoothed.length - 1,
    }));
  }

  return next;
}

function buildSegments(points: PreviewPoint[]): PreviewSegment[] {
  const segments: PreviewSegment[] = [];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (!previous || !current) continue;

    const dx = current.x - previous.x;
    const dy = current.y - previous.y;
    const width = Math.max(2, Math.sqrt(dx * dx + dy * dy));
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

    segments.push({
      left: previous.x + dx / 2 - width / 2,
      top: previous.y + dy / 2 - 1.75,
      width,
      angle,
    });
  }

  return segments;
}

function describeSignal(points: FilteredRoutePoint[]): string {
  const accuracies = points
    .map((point) => point.accuracy)
    .filter((accuracy): accuracy is number => typeof accuracy === "number" && Number.isFinite(accuracy));

  if (accuracies.length === 0) return "Route captured";

  const averageAccuracy = accuracies.reduce((sum, accuracy) => sum + accuracy, 0) / accuracies.length;

  if (averageAccuracy <= 12) return "Strong GPS";
  if (averageAccuracy <= 24) return "Good GPS";
  return "Conservative GPS";
}

function createMapStyle() {
  return [
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ saturation: -35 }, { lightness: 8 }] },
    { featureType: "road", elementType: "labels", stylers: [{ saturation: -60 }] },
    { featureType: "landscape", elementType: "geometry", stylers: [{ saturation: -15 }, { lightness: 8 }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#C9DCCB" }] },
    { featureType: "administrative", elementType: "labels", stylers: [{ visibility: "simplified" }] },
  ];
}

function NativeRouteMap({ points, useGoogleProvider }: { points: DisplayRoutePoint[]; useGoogleProvider: boolean }) {
  const mapRef = useRef<MapView | null>(null);
  const coordinates = points;
  const start = points[0];
  const end = points[points.length - 1];

  useEffect(() => {
    if (!mapRef.current || coordinates.length < 2) return;

    const timeout = setTimeout(() => {
      try {
        mapRef.current?.fitToCoordinates(coordinates, {
          edgePadding: {
            top: 28,
            right: 28,
            bottom: 28,
            left: 28,
          },
          animated: false,
        });
      } catch {
        // Keep the map usable even if fit bounds is unavailable in a given preview environment.
      }
    }, 0);

    return () => clearTimeout(timeout);
  }, [coordinates]);

  if (coordinates.length < 2) {
    return null;
  }

  return (
    <View style={styles.mapFrame}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={useGoogleProvider ? PROVIDER_GOOGLE : undefined}
        customMapStyle={createMapStyle()}
        mapType={Platform.OS === "android" ? "terrain" : "standard"}
        loadingEnabled
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        scrollEnabled={false}
        zoomEnabled={false}
        showsCompass={false}
        showsBuildings={false}
        showsIndoorLevelPicker={false}
      >
        {/* Map rendering is display-only. Do not use this for distance or pace calculations. */}
        <Polyline
          coordinates={coordinates}
          strokeColor="#255E36"
          strokeWidth={4}
          lineCap="round"
          lineJoin="round"
          geodesic
        />
        {start ? <Marker coordinate={start} pinColor="#F2B541" /> : null}
        {end ? <Marker coordinate={end} pinColor="#255E36" /> : null}
      </MapView>
    </View>
  );
}

function FallbackRoutePreview({ points }: { points: FilteredRoutePoint[] }) {
  const previewPoints = useMemo(() => {
    if (points.length < 2) return [];
    return smoothPreviewPoints(buildPreviewPoints(points));
  }, [points]);
  const segments = useMemo(() => buildSegments(previewPoints), [previewPoints]);

  if (previewPoints.length < 2) {
    return null;
  }

  return (
    <View style={styles.previewFrame}>
      {segments.map((segment, index) => (
        <View
          key={`segment-${index}`}
          style={[
            styles.segment,
            {
              left: segment.left,
              top: segment.top,
              width: segment.width,
              transform: [{ rotate: `${segment.angle}deg` }],
            },
          ]}
        />
      ))}
      {previewPoints
        .filter((point) => point.isStart || point.isEnd)
        .map((point, index) => (
          <View
            key={`${point.x}-${point.y}-${index}`}
            style={[
              styles.dot,
              point.isStart ? styles.startDot : null,
              point.isEnd ? styles.endDot : null,
              {
                left: point.x - (point.isStart || point.isEnd ? 4.5 : 2.5),
                top: point.y - (point.isStart || point.isEnd ? 4.5 : 2.5),
              },
            ]}
          />
        ))}
    </View>
  );
}

export function RoutePreview({ points, title = "Your route", subtitle = "Captured from this walk" }: RoutePreviewProps) {
  const signalLabel = useMemo(() => describeSignal(points), [points]);
  const displayRoutePoints = useMemo(() => buildDisplayRoutePoints(points), [points]);
  const useNativeMap = Platform.OS !== "web" && displayRoutePoints.length >= 2;
  const useGoogleMap = useNativeMap && Boolean(ENV.MAPS.googleMapsApiKey);

  if (points.length < 2) {
    return null;
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaChip}>
          <Text style={styles.metaChipText}>{signalLabel}</Text>
        </View>
        <View style={styles.metaChip}>
          <Text style={styles.metaChipText}>{points.length} points</Text>
        </View>
        {useNativeMap ? (
          <View style={styles.metaChip}>
            <Text style={styles.metaChipText}>{useGoogleMap ? "Google map view" : "Native map view"}</Text>
          </View>
        ) : null}
      </View>

      {useNativeMap ? (
        <NativeRouteMap points={displayRoutePoints} useGoogleProvider={useGoogleMap} />
      ) : (
        <FallbackRoutePreview points={points} />
      )}

      <Text style={styles.footnote}>
        {useNativeMap
          ? useGoogleMap
            ? "Map visuals are enhanced with Google Maps when a key is configured. GPS accuracy still comes from Step Outside tracking."
            : "Map rendering is display-only. Tracking distance and pace still come from Step Outside GPS filtering."
          : "A simple preview of the path you took."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
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
  metaRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  metaChip: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "rgba(37,94,54,0.08)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.14)",
  },
  metaChipText: {
    color: "#255E36",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.2,
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
  mapFrame: {
    width: "100%",
    height: MAP_HEIGHT,
    alignSelf: "center",
    borderRadius: 18,
    backgroundColor: "rgba(37,94,54,0.06)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.14)",
    overflow: "hidden",
  },
  previewFrame: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    alignSelf: "center",
    borderRadius: 18,
    backgroundColor: "rgba(37,94,54,0.06)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.14)",
    overflow: "hidden",
  },
  segment: {
    position: "absolute",
    height: 3.5,
    borderRadius: 999,
    backgroundColor: "rgba(37,94,54,0.3)",
  },
  dot: {
    position: "absolute",
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(37,94,54,0.36)",
  },
  startDot: {
    width: 9,
    height: 9,
    backgroundColor: "#F2B541",
  },
  endDot: {
    width: 9,
    height: 9,
    backgroundColor: "#255E36",
  },
  footnote: {
    marginTop: 10,
    color: "rgba(11,15,14,0.54)",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
});
