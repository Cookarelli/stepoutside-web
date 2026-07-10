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

import { OutdoorTheme } from "../constants/theme";
import { OutdoorIcon } from "../src/components/OutdoorIcons";
import { BrandCard, EmptyStateCard, LayeredEnvironment, PremiumHero } from "../src/components/OutdoorUI";
import { logChallengeJoined, logChallengeViewed } from "../src/lib/analytics";
import {
  acceptFriendChallenge,
  challengeTitle,
  challengeTypeLabel,
  declineFriendChallenge,
  getIncomingFriendChallenges,
  getSentFriendChallenges,
  type FriendChallengeListItem,
  type FriendChallengeStatus,
} from "../src/lib/friendChallenges";

const BRAND = {
  forest: OutdoorTheme.colors.forest,
  cream: OutdoorTheme.colors.cream,
  charcoal: OutdoorTheme.colors.charcoal,
  gold: OutdoorTheme.colors.gold,
  danger: OutdoorTheme.colors.danger,
} as const;

function initialsFor(item: FriendChallengeListItem): string {
  const label = item.profile?.displayName || item.profile?.username || "SO";
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function profileName(item: FriendChallengeListItem): string {
  return item.profile?.displayName || item.profile?.username || "Step Outside User";
}

function usernameLabel(item: FriendChallengeListItem): string {
  return item.profile?.username ? `@${item.profile.username}` : "@step-outside-user";
}

function formatDateRange(startDate: number, endDate: number): string {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${end.toLocaleDateString(
    undefined,
    { month: "short", day: "numeric" }
  )}`;
}

function statusLabel(status: FriendChallengeStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function ChallengeIdentity({ item }: { item: FriendChallengeListItem }) {
  return (
    <View style={styles.identityRow}>
      <View style={styles.avatar}>
        {item.profile?.photoURL ? (
          <Image source={{ uri: item.profile.photoURL }} style={styles.avatarImage} contentFit="cover" />
        ) : (
          <Text style={styles.avatarText}>{initialsFor(item)}</Text>
        )}
      </View>
      <View style={styles.identityCopy}>
        <Text style={styles.nameText} numberOfLines={1}>
          {profileName(item)}
        </Text>
        <Text style={styles.usernameText} numberOfLines={1}>
          {usernameLabel(item)}
        </Text>
      </View>
    </View>
  );
}

function ChallengeCard({
  item,
  mode,
  actionId,
  onAccept,
  onDecline,
}: {
  item: FriendChallengeListItem;
  mode: "incoming" | "sent";
  actionId: string | null;
  onAccept: (challengeId: string) => void;
  onDecline: (challengeId: string) => void;
}) {
  const { challenge } = item;
  const canRespond = mode === "incoming" && challenge.status === "pending";
  const isWorking = actionId === challenge.id;

  return (
    <View style={styles.challengeCard}>
      <View style={styles.cardHeader}>
        <ChallengeIdentity item={item} />
        <View style={[styles.statusPill, challenge.status === "pending" ? styles.pendingPill : null]}>
          <Text style={styles.statusPillText}>{statusLabel(challenge.status)}</Text>
        </View>
      </View>

      <View style={styles.challengeBody}>
        <Text style={styles.challengeTitle}>{challengeTitle(challenge.type, challenge.target)}</Text>
        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <OutdoorIcon name="trail" size={15} color={BRAND.gold} accentColor={OutdoorTheme.colors.campfire} strokeWidth={1.8} />
            <Text style={styles.metaText}>{challengeTypeLabel(challenge.type)}</Text>
          </View>
          <View style={styles.metaPill}>
            <OutdoorIcon name="map" size={15} color={BRAND.gold} accentColor={OutdoorTheme.colors.campfire} strokeWidth={1.8} />
            <Text style={styles.metaText}>{formatDateRange(challenge.startDate, challenge.endDate)}</Text>
          </View>
        </View>
      </View>

      {canRespond ? (
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => onAccept(challenge.id)}
            disabled={isWorking}
            style={({ pressed }) => [
              styles.acceptButton,
              isWorking ? styles.disabled : null,
              pressed ? styles.pressed : null,
            ]}
          >
            {isWorking ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.acceptButtonText}>Accept</Text>}
          </Pressable>
          <Pressable
            onPress={() => onDecline(challenge.id)}
            disabled={isWorking}
            style={({ pressed }) => [
              styles.declineButton,
              isWorking ? styles.disabled : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.declineButtonText}>Decline</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export default function ChallengesScreen() {
  const router = useRouter();
  const [incoming, setIncoming] = useState<FriendChallengeListItem[]>([]);
  const [sent, setSent] = useState<FriendChallengeListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [status, setStatus] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);

  const loadChallenges = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setStatus("");

    try {
      const [nextIncoming, nextSent] = await Promise.all([
        getIncomingFriendChallenges(),
        getSentFriendChallenges(),
      ]);
      setIncoming(nextIncoming);
      setSent(nextSent);
      for (const item of [...nextIncoming, ...nextSent]) {
        void logChallengeViewed(item.challenge.id);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Challenges could not be loaded.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadChallenges("initial");
    }, [loadChallenges])
  );

  const respond = async (challengeId: string, response: "accept" | "decline") => {
    setActionId(challengeId);
    setStatus("");

    try {
      if (response === "accept") {
        await acceptFriendChallenge(challengeId);
        void logChallengeJoined(challengeId);
      } else {
        await declineFriendChallenge(challengeId);
      }
      setIncoming((items) =>
        items.map((item) =>
          item.challenge.id === challengeId
            ? {
                ...item,
                challenge: {
                  ...item.challenge,
                  status: response === "accept" ? "accepted" : "declined",
                },
              }
            : item
        )
      );
      setStatus(response === "accept" ? "Challenge accepted." : "Challenge declined.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Challenge response could not be saved.");
    } finally {
      setActionId(null);
    }
  };

  const showEmpty = !isLoading && incoming.length === 0 && sent.length === 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <LayeredEnvironment />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}>
          <Ionicons name="chevron-back" size={22} color={BRAND.charcoal} />
        </Pressable>
        <Text style={styles.headerTitle}>Challenges</Text>
        <Pressable
          onPress={() => void loadChallenges("refresh")}
          disabled={isLoading || isRefreshing}
          style={({ pressed }) => [
            styles.iconButton,
            isLoading || isRefreshing ? styles.disabled : null,
            pressed ? styles.pressed : null,
          ]}
        >
          {isLoading || isRefreshing ? (
            <ActivityIndicator color={BRAND.forest} />
          ) : (
            <Ionicons name="refresh" size={20} color={BRAND.charcoal} />
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadChallenges("refresh")}
            tintColor={BRAND.forest}
          />
        }
      >
        <PremiumHero
          variant="forest"
          style={styles.heroCard}
          eyebrow="Friend Challenges"
          title="Weekly invites from your circle"
          subtitle="Challenge friends to a simple weekly distance, walk count, or outside minutes goal."
        />

        {status ? <Text style={styles.statusText}>{status}</Text> : null}

        {isLoading ? (
          <BrandCard style={styles.loadingCard}>
            <ActivityIndicator color={BRAND.forest} />
            <Text style={styles.loadingText}>Loading challenges...</Text>
          </BrandCard>
        ) : null}

        {showEmpty ? (
          <EmptyStateCard
            title="No challenges yet"
            body="An empty campsite is waiting. Invite a friend when you are ready for a gentle weekly goal."
            illustration="campsite"
            icon={<OutdoorIcon name="trail" size={25} color={BRAND.forest} />}
          />
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Incoming Challenges</Text>
          {!showEmpty && !isLoading && incoming.length === 0 ? (
            <EmptyStateCard
              title="No incoming challenges"
              body="The campsite is quiet. New invitations from friends will appear here."
              illustration="campsite"
              icon={<OutdoorIcon name="fire" size={20} color={BRAND.forest} />}
              style={styles.compactEmptyCard}
            />
          ) : null}
          {incoming.map((item) => (
            <ChallengeCard
              key={item.challenge.id}
              item={item}
              mode="incoming"
              actionId={actionId}
              onAccept={(challengeId) => void respond(challengeId, "accept")}
              onDecline={(challengeId) => void respond(challengeId, "decline")}
            />
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sent Challenges</Text>
          {!showEmpty && !isLoading && sent.length === 0 ? (
            <EmptyStateCard
              title="No sent challenges"
              body="No trail markers are waiting on friends yet. Send one when the week needs momentum."
              illustration="trail"
              icon={<OutdoorIcon name="trail" size={20} color={BRAND.forest} />}
              style={styles.compactEmptyCard}
            />
          ) : null}
          {sent.map((item) => (
            <ChallengeCard
              key={item.challenge.id}
              item={item}
              mode="sent"
              actionId={actionId}
              onAccept={(challengeId) => void respond(challengeId, "accept")}
              onDecline={(challengeId) => void respond(challengeId, "decline")}
            />
          ))}
        </View>
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
  heroCard: {
    minHeight: 258,
  },
  eyebrow: {
    color: BRAND.gold,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "900",
  },
  heroBody: {
    color: "rgba(255,249,239,0.74)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
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
    gap: 8,
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
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: BRAND.charcoal,
    fontSize: 18,
    fontWeight: "900",
  },
  emptyLine: {
    color: "rgba(30,42,36,0.56)",
    fontSize: 13,
    fontWeight: "800",
  },
  compactEmptyCard: {
    minHeight: 164,
    padding: 18,
  },
  challengeCard: {
    borderRadius: OutdoorTheme.radii.lg,
    backgroundColor: OutdoorTheme.colors.paperTranslucent,
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.12)",
    padding: 14,
    gap: 14,
    ...OutdoorTheme.shadows.soft,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  identityRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    fontSize: 15,
    fontWeight: "900",
  },
  identityCopy: {
    flex: 1,
    minWidth: 0,
  },
  nameText: {
    color: BRAND.charcoal,
    fontSize: 15,
    fontWeight: "900",
  },
  usernameText: {
    marginTop: 2,
    color: BRAND.forest,
    fontSize: 12,
    fontWeight: "900",
  },
  statusPill: {
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: "rgba(30,42,36,0.07)",
  },
  pendingPill: {
    backgroundColor: "rgba(198,155,66,0.15)",
  },
  statusPillText: {
    color: "rgba(30,42,36,0.66)",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  challengeBody: {
    gap: 10,
  },
  challengeTitle: {
    color: BRAND.charcoal,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metaPill: {
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 10,
    backgroundColor: "rgba(24,68,47,0.08)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    color: "rgba(30,42,36,0.64)",
    fontSize: 12,
    fontWeight: "900",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  acceptButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: OutdoorTheme.radii.md,
    backgroundColor: BRAND.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptButtonText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  declineButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: OutdoorTheme.radii.md,
    backgroundColor: "rgba(161,59,43,0.08)",
    borderWidth: 1,
    borderColor: "rgba(161,59,43,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  declineButtonText: {
    color: BRAND.danger,
    fontWeight: "900",
  },
  disabled: {
    opacity: 0.56,
  },
  pressed: {
    opacity: 0.9,
  },
});
