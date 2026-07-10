import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { OutdoorTheme } from "../constants/theme";
import { OutdoorIcon } from "../src/components/OutdoorIcons";
import { EmptyStateCard, LayeredEnvironment, PremiumHero } from "../src/components/OutdoorUI";
import {
  DEFAULT_FRIEND_CHALLENGE_OPTIONS,
  sendFriendChallengeInvitation,
  type FriendChallengeOption,
} from "../src/lib/friendChallenges";
import { getFriendsList, removeFriend, type FriendListItem } from "../src/lib/friendSystem";

const BRAND = {
  forest: OutdoorTheme.colors.forest,
  cream: OutdoorTheme.colors.cream,
  charcoal: OutdoorTheme.colors.charcoal,
  gold: OutdoorTheme.colors.gold,
} as const;

function initialsFor(item: FriendListItem): string {
  const label = item.profile.displayName || item.profile.username || "SO";
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function formatMiles(totalDistanceM: number): string {
  const miles = totalDistanceM / 1609.344;
  if (miles >= 10) return `${Math.round(miles)}`;
  return miles > 0 ? miles.toFixed(1) : "0";
}

export default function FriendsScreen() {
  const router = useRouter();
  const [friends, setFriends] = useState<FriendListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [status, setStatus] = useState("");
  const [removingFriendshipId, setRemovingFriendshipId] = useState<string | null>(null);
  const [challengingFriendUid, setChallengingFriendUid] = useState<string | null>(null);

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

  const onRemoveFriend = async (friend: FriendListItem) => {
    setRemovingFriendshipId(friend.friendship.id);
    setStatus("");

    try {
      await removeFriend(friend.friendship.id);
      setFriends((items) => items.filter((item) => item.friendship.id !== friend.friendship.id));
      setStatus(`${friend.profile.displayName || friend.profile.username} was removed from your friends.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Friend could not be removed.");
    } finally {
      setRemovingFriendshipId(null);
    }
  };

  const confirmRemoveFriend = (friend: FriendListItem) => {
    Alert.alert(
      "Remove friend?",
      `${friend.profile.displayName || friend.profile.username} will no longer be able to view your friend activity.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => void onRemoveFriend(friend),
        },
      ]
    );
  };

  const onSendChallenge = async (friend: FriendListItem, option: FriendChallengeOption) => {
    setChallengingFriendUid(friend.profile.uid);
    setStatus("");

    try {
      await sendFriendChallengeInvitation(friend.profile.uid, option);
      setStatus(`${option.title} challenge sent to ${friend.profile.displayName || friend.profile.username}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Challenge invitation could not be sent.");
    } finally {
      setChallengingFriendUid(null);
    }
  };

  const chooseChallenge = (friend: FriendListItem) => {
    Alert.alert(
      "Challenge Friend",
      `Send ${friend.profile.displayName || friend.profile.username} a weekly challenge.`,
      [
        ...DEFAULT_FRIEND_CHALLENGE_OPTIONS.map((option) => ({
          text: option.title,
          onPress: () => void onSendChallenge(friend, option),
        })),
        { text: "Cancel", style: "cancel" as const },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <LayeredEnvironment />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}>
          <Ionicons name="chevron-back" size={22} color={BRAND.charcoal} />
        </Pressable>
        <Text style={styles.headerTitle}>Friends</Text>
        <Pressable
          onPress={() => router.push("/friends-search" as never)}
          style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}
        >
          <OutdoorIcon name="binoculars" size={21} color={BRAND.charcoal} />
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
        <PremiumHero
          style={styles.hero}
          eyebrow="Your circle"
          title="Friends"
          subtitle="Keep your outdoor momentum close with the people who make showing up easier."
        />

        {status ? <Text style={styles.statusText}>{status}</Text> : null}

        {isLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={BRAND.forest} />
            <Text style={styles.loadingText}>Loading friends...</Text>
          </View>
        ) : null}

        {!isLoading && friends.length === 0 ? (
          <EmptyStateCard
            title="No friends yet"
            body="A quiet trail is open. Search by username when you are ready to build your Step Outside circle."
            actionLabel="Find Friends"
            onActionPress={() => router.push("/friends-search" as never)}
            illustration="trail"
            icon={<OutdoorIcon name="binoculars" size={20} color={BRAND.forest} accentColor={BRAND.gold} />}
          />
        ) : null}

        {friends.map((friend) => {
          const activity = friend.activity;
          const isRemoving = removingFriendshipId === friend.friendship.id;
          const isChallenging = challengingFriendUid === friend.profile.uid;
          return (
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
                  <Text style={styles.friendName} numberOfLines={1}>
                    {friend.profile.displayName}
                  </Text>
                  <Text style={styles.friendUsername} numberOfLines={1}>
                    @{friend.profile.username}
                  </Text>
                </View>
                <Pressable
                  onPress={() => confirmRemoveFriend(friend)}
                  disabled={isRemoving}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${friend.profile.displayName || friend.profile.username}`}
                  style={({ pressed }) => [
                    styles.removeButton,
                    isRemoving ? styles.disabled : null,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  {isRemoving ? (
                    <ActivityIndicator color={BRAND.forest} />
                  ) : (
                    <Ionicons name="close" size={18} color={BRAND.forest} />
                  )}
                </Pressable>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statPill}>
                  <Text style={styles.statValue}>{activity?.walkCount ?? 0}</Text>
                  <Text style={styles.statLabel}>Walks</Text>
                </View>
                <View style={styles.statPill}>
                  <Text style={styles.statValue}>{formatMiles(activity?.totalDistanceM ?? 0)}</Text>
                  <Text style={styles.statLabel}>Miles</Text>
                </View>
                <View style={styles.statPill}>
                  <Text style={styles.statValue}>{activity?.currentStreak ?? 0}d</Text>
                  <Text style={styles.statLabel}>Streak</Text>
                </View>
              </View>

              {!activity ? (
                <Text style={styles.activityHint}>Friend stats appear after their next completed walk.</Text>
              ) : null}

              <Pressable
                onPress={() => chooseChallenge(friend)}
                disabled={isChallenging}
                style={({ pressed }) => [
                  styles.challengeButton,
                  isChallenging ? styles.disabled : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                {isChallenging ? (
                  <ActivityIndicator color={BRAND.forest} />
                ) : (
                  <OutdoorIcon name="trail" size={18} color={BRAND.forest} />
                )}
                <Text style={styles.challengeButtonText}>
                  {isChallenging ? "Sending Challenge..." : "Challenge Friend"}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
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
    backgroundColor: "rgba(255,249,239,0.72)",
    borderWidth: 1,
    borderColor: "rgba(30,42,36,0.08)",
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
  hero: {
    minHeight: 258,
  },
  statusText: {
    color: "rgba(30,42,36,0.66)",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  loadingCard: {
    minHeight: 86,
    borderRadius: OutdoorTheme.radii.lg,
    backgroundColor: OutdoorTheme.colors.paperTranslucent,
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.10)",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    ...OutdoorTheme.shadows.soft,
  },
  loadingText: {
    color: "rgba(30,42,36,0.62)",
    fontWeight: "800",
  },
  emptyCard: {
    borderRadius: OutdoorTheme.radii.lg,
    backgroundColor: OutdoorTheme.colors.paperTranslucent,
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.10)",
    padding: 18,
    gap: 10,
    ...OutdoorTheme.shadows.soft,
  },
  emptyTitle: {
    color: BRAND.charcoal,
    fontSize: 18,
    fontWeight: "900",
  },
  emptyBody: {
    color: "rgba(30,42,36,0.62)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
  },
  emptyButton: {
    minHeight: 46,
    borderRadius: 12,
    paddingHorizontal: 16,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: BRAND.forest,
  },
  emptyButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  friendCard: {
    borderRadius: OutdoorTheme.radii.xl,
    backgroundColor: BRAND.forest,
    borderWidth: 1,
    borderColor: "rgba(198,155,66,0.34)",
    padding: 16,
    gap: 14,
    ...OutdoorTheme.shadows.card,
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
    backgroundColor: "rgba(255,249,239,0.14)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,249,239,0.24)",
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
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  friendUsername: {
    color: "rgba(255,249,239,0.74)",
    fontSize: 13,
    fontWeight: "900",
  },
  removeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,249,239,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,249,239,0.28)",
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
  },
  statPill: {
    flex: 1,
    minHeight: 68,
    borderRadius: 14,
    backgroundColor: "rgba(255,249,239,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,249,239,0.16)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    gap: 4,
  },
  statValue: {
    color: BRAND.gold,
    fontSize: 20,
    fontWeight: "900",
  },
  statLabel: {
    color: "rgba(255,249,239,0.72)",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  activityHint: {
    color: "rgba(255,249,239,0.66)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  challengeButton: {
    minHeight: 48,
    borderRadius: OutdoorTheme.radii.md,
    backgroundColor: "rgba(255,249,239,0.94)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
  },
  challengeButtonText: {
    color: BRAND.forest,
    fontSize: 14,
    fontWeight: "900",
  },
  disabled: {
    opacity: 0.62,
  },
  pressed: {
    opacity: 0.9,
  },
});
