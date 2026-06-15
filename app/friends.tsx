import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getFriendsList, type FriendListItem } from "../src/lib/friendSystem";

const BRAND = {
  forest: "#255E36",
  cream: "#F8F4EE",
  charcoal: "#0B0F0E",
  gold: "#B98216",
} as const;

function initialsFor(item: FriendListItem): string {
  const label = item.profile.displayName || item.profile.username || "SO";
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

export default function FriendsScreen() {
  const router = useRouter();
  const [friends, setFriends] = useState<FriendListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [status, setStatus] = useState("");

  const loadFriends = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setStatus("");

    try {
      const nextFriends = await getFriendsList();
      setFriends(nextFriends);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Friends could not be loaded.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadFriends("initial");
    }, [loadFriends])
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}>
          <Ionicons name="chevron-back" size={22} color={BRAND.charcoal} />
        </Pressable>
        <Text style={styles.headerTitle}>Friends</Text>
        <Pressable
          onPress={() => router.push("/friends-search" as never)}
          style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}
        >
          <Ionicons name="person-add" size={20} color={BRAND.charcoal} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadFriends("refresh")}
            tintColor={BRAND.forest}
          />
        }
      >
        {status ? <Text style={styles.statusText}>{status}</Text> : null}

        {isLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={BRAND.forest} />
            <Text style={styles.loadingText}>Loading friends...</Text>
          </View>
        ) : null}

        {!isLoading && friends.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="people" size={24} color={BRAND.forest} />
            <Text style={styles.emptyTitle}>No friends yet</Text>
            <Text style={styles.emptyBody}>Find friends from your Profile tab to start building your Step Outside circle.</Text>
          </View>
        ) : null}

        {friends.map((friend) => (
          <View key={friend.friendship.id} style={styles.friendCard}>
            <View style={styles.friendTopRow}>
              <View style={styles.avatar}>
                {friend.profile.photoURL ? (
                  <Image source={{ uri: friend.profile.photoURL }} style={styles.avatarImage} contentFit="cover" />
                ) : (
                  <Text style={styles.avatarText}>{initialsFor(friend)}</Text>
                )}
              </View>
              <View style={styles.friendCopy}>
                <Text style={styles.friendName}>{friend.profile.displayName}</Text>
                <Text style={styles.friendUsername}>@{friend.profile.username}</Text>
              </View>
            </View>

            <View style={styles.placeholderRow}>
              <View style={styles.placeholderButton}>
                <Ionicons name="trophy" size={16} color={BRAND.gold} />
                <Text style={styles.placeholderText}>Challenge Friend</Text>
                <Text style={styles.placeholderBadge}>Premium</Text>
              </View>
              <View style={styles.placeholderButton}>
                <Ionicons name="map" size={16} color={BRAND.forest} />
                <Text style={styles.placeholderText}>View Shared Walks</Text>
                <Text style={styles.placeholderBadge}>Future</Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BRAND.cream,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.08)",
  },
  headerTitle: {
    color: BRAND.charcoal,
    fontSize: 18,
    fontWeight: "900",
  },
  container: {
    padding: 20,
    paddingBottom: 34,
    gap: 14,
  },
  statusText: {
    color: "rgba(11,15,14,0.66)",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  loadingCard: {
    minHeight: 86,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.10)",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    color: "rgba(11,15,14,0.62)",
    fontWeight: "800",
  },
  emptyCard: {
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.78)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.10)",
    padding: 18,
    gap: 8,
  },
  emptyTitle: {
    color: BRAND.charcoal,
    fontSize: 18,
    fontWeight: "900",
  },
  emptyBody: {
    color: "rgba(11,15,14,0.62)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
  },
  friendCard: {
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.82)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.12)",
    padding: 14,
    gap: 14,
  },
  friendTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: BRAND.forest,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },
  friendCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  friendName: {
    color: BRAND.charcoal,
    fontSize: 16,
    fontWeight: "900",
  },
  friendUsername: {
    color: BRAND.forest,
    fontSize: 13,
    fontWeight: "900",
  },
  placeholderRow: {
    gap: 8,
  },
  placeholderButton: {
    minHeight: 44,
    borderRadius: 15,
    backgroundColor: "rgba(11,15,14,0.05)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.08)",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    opacity: 0.82,
  },
  placeholderText: {
    flex: 1,
    color: "rgba(11,15,14,0.70)",
    fontWeight: "900",
  },
  placeholderBadge: {
    color: "rgba(11,15,14,0.48)",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  pressed: {
    opacity: 0.9,
  },
});
