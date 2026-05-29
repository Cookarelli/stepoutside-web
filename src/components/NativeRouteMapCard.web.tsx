import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { RoutePoint } from "../lib/store";
import { RoutePreview } from "./RoutePreview";

type NativeRouteMapCardProps = {
  points: RoutePoint[];
  title?: string;
  subtitle?: string;
};

export function NativeRouteMapCard({
  points,
  title = "Your route",
  subtitle = "Captured from this walk",
}: NativeRouteMapCardProps) {
  return (
    <View style={styles.wrapper}>
      <RoutePreview points={points} title={title} subtitle={subtitle} />
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>Map preview fallback</Text>
        <Text style={styles.noticeBody}>
          Web builds use the saved route preview instead of the native map provider.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    gap: 10,
  },
  notice: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.12)",
  },
  noticeTitle: {
    color: "#255E36",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  noticeBody: {
    marginTop: 6,
    color: "rgba(11,15,14,0.66)",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
});
