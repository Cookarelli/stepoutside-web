import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const BRAND = {
  forest: "#255E36",
  bone: "#F8F4EE",
  charcoal: "#0B0F0E",
} as const;

type NavTarget = {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  key: "home" | "stats" | "reflection" | "share" | "premium";
};

const NAV_TARGETS: NavTarget[] = [
  { label: "Home", icon: "home", key: "home" },
  { label: "Stats", icon: "bar-chart", key: "stats" },
  { label: "Reflect", icon: "create", key: "reflection" },
  { label: "Share", icon: "share-social", key: "share" },
  { label: "Premium", icon: "leaf", key: "premium" },
];

type PostWalkTabNavProps = {
  current?: NavTarget["key"] | "summary";
  params?: {
    walkId?: string;
    startedAt?: string;
    endedAt?: string;
    durationSec?: string;
    distanceM?: string;
    source?: string;
    sunriseBonus?: string;
    sunsetBonus?: string;
    prompt?: string;
    reflectionText?: string;
    saveWarning?: string;
  };
};

export function PostWalkTabNav({ current = "summary", params }: PostWalkTabNavProps) {
  const router = useRouter();

  const sharedParams = {
    walkId: params?.walkId ?? "",
    startedAt: params?.startedAt ?? "",
    endedAt: params?.endedAt ?? "",
    durationSec: params?.durationSec ?? "",
    distanceM: params?.distanceM ?? "",
    source: params?.source ?? "timer",
    sunriseBonus: params?.sunriseBonus ?? "false",
    sunsetBonus: params?.sunsetBonus ?? "false",
    prompt: params?.prompt ?? "",
    reflectionText: params?.reflectionText ?? "",
    saveWarning: params?.saveWarning ?? "",
  };

  const onNavigate = (target: NavTarget["key"]) => {
    void Haptics.selectionAsync();

    switch (target) {
      case "home":
        router.replace("/(tabs)");
        break;
      case "stats":
        router.replace("/(tabs)/stats");
        break;
      case "reflection":
        router.push({
          pathname: "/reflection" as never,
          params: sharedParams,
        } as never);
        break;
      case "share":
        router.push({
          pathname: "/share" as never,
          params: sharedParams,
        } as never);
        break;
      case "premium":
        router.push("/pro");
        break;
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.navShell}>
        {NAV_TARGETS.map((target) => (
          <Pressable
            key={target.key}
            onPress={() => onNavigate(target.key)}
            style={({ pressed }) => [
              styles.item,
              current === target.key ? styles.itemActive : null,
              pressed ? styles.itemPressed : null,
            ]}
          >
            <Ionicons
              name={target.icon}
              size={20}
              color={current === target.key ? BRAND.bone : BRAND.forest}
            />
            <Text style={[styles.label, current === target.key ? styles.labelActive : null]}>
              {target.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    marginTop: 18,
    alignItems: "center",
  },
  navShell: {
    width: "100%",
    maxWidth: 560,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 24,
    backgroundColor: BRAND.bone,
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.10)",
  },
  item: {
    width: "31%",
    minHeight: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  itemActive: {
    backgroundColor: BRAND.forest,
  },
  itemPressed: {
    backgroundColor: "rgba(37,94,54,0.08)",
  },
  label: {
    color: BRAND.charcoal,
    fontSize: 11,
    fontWeight: "800",
  },
  labelActive: {
    color: BRAND.bone,
  },
});
