import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  searchUserForFriendDiscovery,
  sendFriendRequest,
  type FriendDiscoveryResult,
} from "../src/lib/friendSystem";

const BRAND = {
  forest: "#255E36",
  cream: "#F8F4EE",
  charcoal: "#0B0F0E",
  sunrise: "#F2B541",
} as const;

function initialsFor(result: FriendDiscoveryResult): string {
  const label = result.displayName || result.username || "SO";
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function actionLabel(result: FriendDiscoveryResult): string {
  if (result.relationshipStatus === "friends") return "Friends";
  if (result.relationshipStatus === "pending_sent") return "Pending";
  if (result.relationshipStatus === "pending_received") return "Request Pending";
  return "Add Friend";
}

export default function FriendsSearchScreen() {
  const router = useRouter();
  const [searchText, setSearchText] = useState("");
  const [result, setResult] = useState<FriendDiscoveryResult | null>(null);
  const [status, setStatus] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const onSearch = async () => {
    const query = searchText.trim();
    if (!query) {
      setStatus("Enter a username.");
      setResult(null);
      return;
    }

    setIsSearching(true);
    setStatus("");
    setResult(null);

    try {
      const nextResult = await searchUserForFriendDiscovery(query);
      setResult(nextResult);
      setStatus(nextResult ? "" : "No match found.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Search failed.");
    } finally {
      setIsSearching(false);
    }
  };

  const onAddFriend = async () => {
    if (!result || result.relationshipStatus !== "none") return;

    setIsSending(true);
    setStatus("");

    try {
      const request = await sendFriendRequest(result.uid);
      setResult({
        ...result,
        relationshipStatus: "pending_sent",
        pendingRequestId: request.id,
      });
      setStatus("Friend request sent.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Friend request failed.");
    } finally {
      setIsSending(false);
    }
  };

  const addDisabled = !result || result.relationshipStatus !== "none" || isSending;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}>
          <Ionicons name="chevron-back" size={22} color={BRAND.charcoal} />
        </Pressable>
        <Text style={styles.headerTitle}>Find Friends</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.searchCard}>
          <View style={styles.searchRow}>
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              onSubmitEditing={() => void onSearch()}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="default"
              placeholder="Username"
              placeholderTextColor="rgba(11,15,14,0.42)"
              returnKeyType="search"
              style={styles.searchInput}
            />
            <Pressable
              onPress={() => void onSearch()}
              disabled={isSearching}
              style={({ pressed }) => [
                styles.searchButton,
                isSearching ? styles.disabled : null,
                pressed ? styles.pressed : null,
              ]}
            >
              {isSearching ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Ionicons name="search" size={20} color="#FFFFFF" />
              )}
            </Pressable>
          </View>

          {status ? <Text style={styles.statusText}>{status}</Text> : null}
        </View>

        {result ? (
          <View style={styles.resultCard}>
            <View style={styles.avatar}>
              {result.photoURL ? (
                <Image source={{ uri: result.photoURL }} style={styles.avatarImage} contentFit="cover" />
              ) : (
                <Text style={styles.avatarText}>{initialsFor(result)}</Text>
              )}
            </View>
            <View style={styles.resultCopy}>
              <Text style={styles.resultName}>{result.displayName}</Text>
              <Text style={styles.resultUsername}>@{result.username}</Text>
            </View>
            <Pressable
              onPress={() => void onAddFriend()}
              disabled={addDisabled}
              style={({ pressed }) => [
                styles.addButton,
                addDisabled ? styles.addButtonDisabled : null,
                pressed ? styles.pressed : null,
              ]}
            >
              {isSending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.addButtonText}>{actionLabel(result)}</Text>
              )}
            </Pressable>
          </View>
        ) : null}
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
  headerSpacer: {
    width: 42,
  },
  container: {
    padding: 20,
    paddingBottom: 34,
    gap: 14,
  },
  searchCard: {
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.78)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.10)",
    padding: 14,
    gap: 10,
  },
  searchRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  searchInput: {
    flex: 1,
    minHeight: 50,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.12)",
    backgroundColor: "rgba(255,255,255,0.86)",
    paddingHorizontal: 14,
    color: BRAND.charcoal,
    fontSize: 15,
    fontWeight: "800",
  },
  searchButton: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: BRAND.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  statusText: {
    color: "rgba(11,15,14,0.62)",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  resultCard: {
    minHeight: 86,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.82)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.12)",
    padding: 14,
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
  resultCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  resultName: {
    color: BRAND.charcoal,
    fontSize: 16,
    fontWeight: "900",
  },
  resultUsername: {
    color: BRAND.forest,
    fontSize: 13,
    fontWeight: "900",
  },
  addButton: {
    minWidth: 104,
    minHeight: 46,
    borderRadius: 15,
    backgroundColor: BRAND.forest,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  addButtonDisabled: {
    backgroundColor: "rgba(11,15,14,0.18)",
  },
  addButtonText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 13,
  },
  disabled: {
    opacity: 0.7,
  },
  pressed: {
    opacity: 0.9,
  },
});
