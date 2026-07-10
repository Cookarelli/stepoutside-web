import { Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";

import { OutdoorTheme } from "../../constants/theme";
import { OutdoorIcon, type OutdoorIconName } from "../../src/components/OutdoorIcons";

function BrandedTabIcon({
  color,
  focused,
  name,
}: {
  color: string;
  focused: boolean;
  name: OutdoorIconName;
}) {
  return (
    <View style={styles.iconWrap}>
      <OutdoorIcon
        name={name}
        size={24}
        color={color}
        accentColor={focused ? OutdoorTheme.colors.gold : OutdoorTheme.colors.sage}
        mutedColor={focused ? OutdoorTheme.colors.moss : OutdoorTheme.colors.sage}
        strokeWidth={2}
      />
      <View style={[styles.activeMark, focused ? styles.activeMarkVisible : null]} />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: OutdoorTheme.colors.forest,
        tabBarInactiveTintColor: OutdoorTheme.colors.sage,
        tabBarLabelPosition: "below-icon",
        tabBarHideOnKeyboard: true,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
        tabBarIconStyle: styles.tabIcon,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <BrandedTabIcon color={color} focused={focused} name="park-badge" />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: "Stats",
          tabBarIcon: ({ color, focused }) => (
            <BrandedTabIcon color={color} focused={focused} name="compass" />
          ),
        }}
      />
      <Tabs.Screen
        name="steps"
        options={{
          title: "Walk",
          tabBarIcon: ({ color, focused }) => (
            <BrandedTabIcon color={color} focused={focused} name="bootprint" />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <BrandedTabIcon color={color} focused={focused} name="backpack" />
          ),
        }}
      />
      <Tabs.Screen name="explore" options={{ href: null }} />
      <Tabs.Screen name="share" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: Platform.select({ ios: 84, android: 72, default: 74 }),
    paddingTop: 8,
    paddingBottom: Platform.select({ ios: 24, android: 10, default: 12 }),
    paddingHorizontal: 10,
    backgroundColor: OutdoorTheme.colors.paper,
    borderTopWidth: 1,
    borderTopColor: OutdoorTheme.colors.lineSoft,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: OutdoorTheme.colors.pine,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -8 },
    elevation: 10,
  },
  tabItem: {
    minHeight: 54,
    borderRadius: OutdoorTheme.radii.lg,
    paddingVertical: 2,
  },
  tabIcon: {
    marginTop: 0,
  },
  tabLabel: {
    marginTop: 1,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
    letterSpacing: 0,
  },
  iconWrap: {
    width: 42,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  activeMark: {
    position: "absolute",
    bottom: 0,
    width: 18,
    height: 3,
    borderRadius: OutdoorTheme.radii.pill,
    backgroundColor: OutdoorTheme.colors.gold,
    opacity: 0,
  },
  activeMarkVisible: {
    opacity: 1,
  },
});
