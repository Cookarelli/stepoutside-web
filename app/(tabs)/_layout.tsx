import { Tabs } from "expo-router";
import React from "react";
import { Ionicons } from "@expo/vector-icons";

import { PREMIUM, alpha } from "../../src/lib/premiumTheme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: PREMIUM.colors.forest,
        tabBarInactiveTintColor: alpha(PREMIUM.colors.text, 0.48),
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "700",
          marginBottom: 2,
        },
        tabBarStyle: {
          backgroundColor: PREMIUM.colors.creamSoft,
          borderTopColor: PREMIUM.colors.line,
          height: 88,
          paddingTop: 8,
          paddingBottom: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Challenges",
          tabBarIcon: ({ color, size }) => <Ionicons name="trophy-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="steps"
        options={{
          title: "Steps",
          tabBarIcon: ({ color, size }) => <Ionicons name="footsteps-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: "Stats",
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
