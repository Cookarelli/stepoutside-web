import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { RoutePoint } from "../lib/store";

type RoutePreviewProps = {
  points: RoutePoint[];
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

function samplePoints(points: RoutePoint[], maxPoints: number): RoutePoint[] {
  if (points.length <= maxPoints) return points;

  const lastIndex = points.length - 1;
  const sampled: RoutePoint[] = [];
  for (let index = 0; index < maxPoints; index += 1) {
    const sourceIndex = Math.round((index / (maxPoints - 1)) * lastIndex);
    sampled.push(points[sourceIndex] ?? points[lastIndex]);
  }
  return sampled;
}

function buildPreviewPoints(points: RoutePoint[]): PreviewPoint[] {
  const sampled = samplePoints(points, 48);
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
      top: previous.y + dy / 2 - 1.25,
      width,
      angle,
    });
  }

  return segments;
}

function describeSignal(points: RoutePoint[]): string {
  const accuracies = points
    .map((point) => point.accuracy)
    .filter((accuracy): accuracy is number => typeof accuracy === "number" && Number.isFinite(accuracy));

  if (accuracies.length === 0) return "Route captured";

  const averageAccuracy = accuracies.reduce((sum, accuracy) => sum + accuracy, 0) / accuracies.length;

  if (averageAccuracy <= 12) return "Strong GPS";
  if (averageAccuracy <= 24) return "Good GPS";
  return "Conservative GPS";
}

export function RoutePreview({ points, title = "Your route", subtitle = "Captured from this walk" }: RoutePreviewProps) {
  const previewPoints = useMemo(() => {
    if (points.length < 2) return [];
    return buildPreviewPoints(points);
  }, [points]);
  const segments = useMemo(() => buildSegments(previewPoints), [previewPoints]);
  const signalLabel = useMemo(() => describeSignal(points), [points]);

  if (previewPoints.length < 2) {
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
      </View>

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
        {previewPoints.map((point, index) => (
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

      <Text style={styles.footnote}>A simple preview of the path you took.</Text>
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
    height: 2.5,
    borderRadius: 999,
    backgroundColor: "rgba(37,94,54,0.26)",
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
