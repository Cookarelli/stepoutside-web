import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
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
  acceptFriendRequest,
  declineFriendRequest,
  formatFriendSystemError,
  getIncomingFriendRequests,
  getOutgoingFriendRequests,
  type FriendRequestListItem,
} from "../src/lib/friendSystem";

const BRAND = {
  forest: OutdoorTheme.colors.forest,
  cream: OutdoorTheme.colors.cream,
  charcoal: OutdoorTheme.colors.charcoal,
  danger: OutdoorTheme.colors.danger,
} as const;

function initialsFor(item: FriendRequestListItem): string {
  const label = item.profile.displayName || item.profile.username || "SO";
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function RequestIdentity({ item }: { item: FriendRequestListItem }) {
  return (
    <>
      <View style={styles.avatar}>
        {item.profile.photoURL ? (
          <Image source={{ uri: item.profile.photoURL }} style={styles.avatarImage} contentFit="cover" />
        ) : (
          <Text style={styles.avatarText}>{initialsFor(item)}</Text>
        )}
      </View>
      <View style={styles.requestCopy}>
        <Text style={styles.requestName}>{item.profile.displayName}</Text>
        <Text style={styles.requestUsername}>@{item.profile.username}</Text>
      </View>
    </>
  );
}

export default function FriendRequestsScreen() {
  const router = useRouter();
  const [incoming, setIncoming] = useState<FriendRequestListItem[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [actionRequest, setActionRequest] = useState<{
    id: string;
    type: "accept" | "decline";
  } | null>(null);

  const loadRequests = useCallback(async () => {
    setIsLoading(true);
    setStatus("");

    try {
      const [nextIncoming, nextOutgoing] = await Promise.all([
        getIncomingFriendRequests(),
        getOutgoingFriendRequests(),
      ]);
      setIncoming(nextIncoming);
      setOutgoing(nextOutgoing);
    } catch (error) {
      setStatus(formatFriendSystemError(error, "Friend requests could not be loaded."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadRequests();
    }, [loadRequests])
  );

  const onAccept = async (requestId: string) => {
    setActionRequest({ id: requestId, type: "accept" });
    setStatus("");

    try {
      await acceptFriendRequest(requestId);
      setIncoming((items) => items.filter((item) => item.request.id !== requestId));
      setStatus("Friend request accepted.");
    } catch (error) {
      setStatus(formatFriendSystemError(error, "Friend request could not be accepted."));
    } finally {
      setActionRequest(null);
    }
  };

  const onDecline = async (requestId: string) => {
    setActionRequest({ id: requestId, type: "decline" });
    setStatus("");

    try {
      await declineFriendRequest(requestId);
      setIncoming((items) => items.filter((item) => item.request.id !== requestId));
      setStatus("Friend request declined.");
    } catch (error) {
      setStatus(formatFriendSystemError(error, "Friend request could not be declined."));
    } finally {
      setActionRequest(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <LayeredEnvironment />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}>
          <Ionicons name="chevron-back" size={22} color={BRAND.charcoal} />
        </Pressable>
        <Text style={styles.headerTitle}>Friend Requests</Text>
        <Pressable
          onPress={() => void loadRequests()}
          disabled={isLoading}
          style={({ pressed }) => [styles.iconButton, isLoading ? styles.disabled : null, pressed ? styles.pressed : null]}
        >
          {isLoading ? <ActivityIndicator color={BRAND.forest} /> : <OutdoorIcon name="compass" size={21} color={BRAND.charcoal} />}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <PremiumHero
          style={styles.hero}
          eyebrow="Your circle"
          title="Friend Requests"
          subtitle="Review the people who want to join your Step Outside rhythm."
        />

        {status ? <Text style={styles.statusText}>{status}</Text> : null}

        {isLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={BRAND.forest} />
            <Text style={styles.loadingText}>Loading friend requests...</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Incoming Requests</Text>
          {!isLoading && incoming.length === 0 ? (
            <EmptyStateCard
              title="No incoming requests"
              body="The trail is quiet right now. New invites will appear here when someone reaches out."
              illustration="trail"
              icon={<OutdoorIcon name="binoculars" size={20} color={BRAND.forest} />}
              style={styles.requestEmptyCard}
            />
          ) : null}
          {incoming.map((item) => {
            const isAccepting = actionRequest?.id === item.request.id && actionRequest.type === "accept";
            const isDeclining = actionRequest?.id === item.request.id && actionRequest.type === "decline";
            const isWorking = isAccepting || isDeclining;
            return (
              <View key={item.request.id} style={styles.requestCard}>
                <View style={styles.requestTopRow}>
                  <RequestIdentity item={item} />
                </View>
                <View style={styles.actionRow}>
                  <Pressable
                    onPress={() => void onAccept(item.request.id)}
                    disabled={isWorking}
                    style={({ pressed }) => [
                      styles.acceptButton,
                      isWorking ? styles.disabled : null,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    {isAccepting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.acceptButtonText}>Accept</Text>}
                  </Pressable>
                  <Pressable
                    onPress={() => void onDecline(item.request.id)}
                    disabled={isWorking}
                    style={({ pressed }) => [
                      styles.declineButton,
                      isWorking ? styles.disabled : null,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    {isDeclining ? <ActivityIndicator color={BRAND.danger} /> : <Text style={styles.declineButtonText}>Decline</Text>}
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Outgoing Requests</Text>
          {!isLoading && outgoing.length === 0 ? (
            <EmptyStateCard
              title="No outgoing requests"
              body="No invitations are waiting on the map. Search for a friend whenever you are ready."
              illustration="map"
              icon={<OutdoorIcon name="map" size={20} color={BRAND.forest} />}
              style={styles.requestEmptyCard}
            />
          ) : null}
          {outgoing.map((item) => (
            <View key={item.request.id} style={styles.requestCard}>
              <View style={styles.requestTopRow}>
                <RequestIdentity item={item} />
                <View style={styles.pendingPill}>
                  <Text style={styles.pendingText}>Pending</Text>
                </View>
              </View>
            </View>
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
    gap: 18,
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
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: BRAND.forest,
    fontWeight: "900",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontSize: 12,
  },
  emptyText: {
    color: "rgba(30,42,36,0.58)",
    fontWeight: "800",
    lineHeight: 20,
  },
  requestEmptyCard: {
    minHeight: 164,
    padding: 18,
  },
  requestCard: {
    borderRadius: OutdoorTheme.radii.xl,
    backgroundColor: "rgba(255,249,239,0.82)",
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.12)",
    padding: 14,
    gap: 12,
    ...OutdoorTheme.shadows.soft,
  },
  requestTopRow: {
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
  requestCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  requestName: {
    color: BRAND.charcoal,
    fontSize: 16,
    fontWeight: "900",
  },
  requestUsername: {
    color: BRAND.forest,
    fontSize: 13,
    fontWeight: "900",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  acceptButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: OutdoorTheme.radii.lg,
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
    borderRadius: OutdoorTheme.radii.lg,
    backgroundColor: "rgba(161,59,43,0.10)",
    borderWidth: 1,
    borderColor: "rgba(161,59,43,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  declineButtonText: {
    color: BRAND.danger,
    fontWeight: "900",
  },
  pendingPill: {
    borderRadius: OutdoorTheme.radii.pill,
    backgroundColor: OutdoorTheme.colors.goldTint,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pendingText: {
    color: BRAND.forest,
    fontSize: 12,
    fontWeight: "900",
  },
  disabled: {
    opacity: 0.65,
  },
  pressed: {
    opacity: 0.9,
  },
});
