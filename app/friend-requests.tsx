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

import {
  acceptFriendRequest,
  declineFriendRequest,
  getIncomingFriendRequests,
  getOutgoingFriendRequests,
  type FriendRequestListItem,
} from "../src/lib/friendSystem";

const BRAND = {
  forest: "#255E36",
  cream: "#F8F4EE",
  charcoal: "#0B0F0E",
  danger: "#A13B2B",
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
      setStatus(error instanceof Error ? error.message : "Friend requests could not be loaded.");
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
      setStatus(error instanceof Error ? error.message : "Friend request could not be accepted.");
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
      setStatus(error instanceof Error ? error.message : "Friend request could not be declined.");
    } finally {
      setActionRequest(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
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
          {isLoading ? <ActivityIndicator color={BRAND.forest} /> : <Ionicons name="refresh" size={20} color={BRAND.charcoal} />}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
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
            <Text style={styles.emptyText}>No incoming requests right now.</Text>
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
            <Text style={styles.emptyText}>No outgoing requests pending.</Text>
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
    gap: 18,
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
    color: "rgba(11,15,14,0.58)",
    fontWeight: "800",
    lineHeight: 20,
  },
  requestCard: {
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.82)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.12)",
    padding: 14,
    gap: 12,
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
    borderRadius: 15,
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
    borderRadius: 15,
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
    borderRadius: 999,
    backgroundColor: "rgba(37,94,54,0.10)",
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
