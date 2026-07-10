import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { OutdoorTheme } from "../constants/theme";
import { BrandBadge } from "../src/components/BrandBadge";
import { OutdoorIcon } from "../src/components/OutdoorIcons";
import {
  MountainLayersIllustration,
  PineForestIllustration,
  TrailIllustration,
} from "../src/components/OutdoorIllustrations";
import { LayeredEnvironment, PremiumHero } from "../src/components/OutdoorUI";
import {
  getLeaderboardPage,
  refreshCurrentUserLeaderboardEntry,
  type GlobalLeaderboardCursor,
  type LeaderboardPeriod,
  type LeaderboardScope,
  type RankedLeaderboardEntry,
} from "../src/lib/leaderboard";
import { getSessions } from "../src/lib/store";

const BRAND = {
  forest: OutdoorTheme.colors.forest,
  sunrise: OutdoorTheme.colors.gold,
  bone: OutdoorTheme.colors.cream,
  charcoal: OutdoorTheme.colors.charcoal,
  goldText: OutdoorTheme.colors.goldText,
} as const;

const PAGE_SIZE = 20;
const SCOPES: LeaderboardScope[] = ["friends", "global"];
const PERIODS: LeaderboardPeriod[] = ["weekly", "monthly", "allTime"];

function scopeLabel(scope: LeaderboardScope): string {
  return scope === "friends" ? "Friends" : "Global";
}

function periodLabel(period: LeaderboardPeriod): string {
  if (period === "weekly") return "Weekly";
  if (period === "monthly") return "Monthly";
  return "All Time";
}

function formatMiles(distanceM: number): string {
  if (!Number.isFinite(distanceM) || distanceM <= 0) return "0.0";
  return (distanceM / 1609.344).toFixed(distanceM >= 16093.44 ? 0 : 1);
}

function walkLabel(count: number): string {
  return `${count} walk${count === 1 ? "" : "s"}`;
}

function initialsFor(entry: RankedLeaderboardEntry): string {
  const parts = entry.displayName.split(/\s+/).filter(Boolean);
  const initials = parts.length >= 2 ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}` : entry.displayName.slice(0, 2);
  return initials.toUpperCase() || "SO";
}

function topThreeColor(rank: number): string {
  if (rank === 1) return "rgba(198,155,66,0.34)";
  if (rank === 2) return "rgba(198,155,66,0.22)";
  if (rank === 3) return "rgba(198,155,66,0.16)";
  return "rgba(247,244,236,0.10)";
}

type LeaderboardRowProps = {
  entry: RankedLeaderboardEntry;
  pinned?: boolean;
};

function LeaderboardRow({ entry, pinned = false }: LeaderboardRowProps) {
  const isTopThree = entry.rank > 0 && entry.rank <= 3;

  return (
    <View
      style={[
        styles.rowCard,
        isTopThree ? { backgroundColor: topThreeColor(entry.rank), borderColor: "rgba(198,155,66,0.42)" } : null,
        entry.isCurrentUser || pinned ? styles.currentUserRow : null,
      ]}
    >
      <View style={[styles.rankBadge, isTopThree ? styles.rankBadgeGold : null]}>
        <Text style={[styles.rankText, isTopThree ? styles.rankTextGold : null]}>
          {entry.rank > 0 ? `#${entry.rank}` : "--"}
        </Text>
      </View>

      <View style={styles.avatar}>
        {entry.photoURL ? (
          <Image source={{ uri: entry.photoURL }} style={styles.avatarImage} resizeMode="cover" />
        ) : (
          <Text style={styles.avatarText}>{initialsFor(entry)}</Text>
        )}
      </View>

      <View style={styles.rowCopy}>
        <Text style={styles.username} numberOfLines={1}>
          @{entry.username}
          {entry.isCurrentUser ? "  You" : ""}
        </Text>
        <Text style={styles.name} numberOfLines={1}>
          {entry.displayName}
        </Text>
        <View style={styles.metricLine}>
          <Text style={styles.metricText}>{walkLabel(entry.scoreSessions)}</Text>
          <Text style={styles.metricDot}>•</Text>
          <Text style={styles.metricText}>{formatMiles(entry.scoreDistanceM)} mi</Text>
          <Text style={styles.metricDot}>•</Text>
          <Text style={styles.metricText}>{entry.currentStreak}d streak</Text>
        </View>
      </View>
    </View>
  );
}

export default function LeaderboardScreen() {
  const router = useRouter();
  const [scope, setScope] = useState<LeaderboardScope>("friends");
  const [period, setPeriod] = useState<LeaderboardPeriod>("weekly");
  const [entries, setEntries] = useState<RankedLeaderboardEntry[]>([]);
  const [pinnedEntry, setPinnedEntry] = useState<RankedLeaderboardEntry | null>(null);
  const [cursor, setCursor] = useState<GlobalLeaderboardCursor | null>(null);
  const [friendCount, setFriendCount] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleEntries = useMemo(() => entries, [entries]);

  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      try {
        const sessions = await getSessions();
        await refreshCurrentUserLeaderboardEntry(sessions);
      } catch {
        // Existing leaderboard entries remain readable if local refresh is unavailable.
      }

      const page = await getLeaderboardPage({
        scope,
        period,
        pageSize: PAGE_SIZE,
        cursor: null,
        rankOffset: 0,
        includePinned: true,
      });

      setEntries(page.entries);
      setPinnedEntry(page.pinnedEntry);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setFriendCount(page.friendCount);
    } catch {
      setEntries([]);
      setPinnedEntry(null);
      setCursor(null);
      setHasMore(false);
      setFriendCount(null);
      setError("Leaderboard data is unavailable right now.");
    } finally {
      setLoading(false);
    }
  }, [period, scope]);

  const loadMore = useCallback(async () => {
    if (scope !== "global" || !hasMore || loadingMore) return;

    setLoadingMore(true);
    try {
      const page = await getLeaderboardPage({
        scope,
        period,
        pageSize: PAGE_SIZE,
        cursor,
        rankOffset: entries.length,
        includePinned: false,
      });

      setEntries((current) => [...current, ...page.entries]);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch {
      setError("Leaderboard data is unavailable right now.");
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, entries.length, hasMore, loadingMore, period, scope]);

  useFocusEffect(
    useCallback(() => {
      void loadLeaderboard();
    }, [loadLeaderboard])
  );

  const selectScope = (nextScope: LeaderboardScope) => {
    if (scope === nextScope) return;
    void Haptics.selectionAsync();
    setScope(nextScope);
    setEntries([]);
    setCursor(null);
    setHasMore(false);
  };

  const selectPeriod = (nextPeriod: LeaderboardPeriod) => {
    if (period === nextPeriod) return;
    void Haptics.selectionAsync();
    setPeriod(nextPeriod);
    setEntries([]);
    setCursor(null);
    setHasMore(false);
  };

  const showNoFriends = scope === "friends" && friendCount === 0;
  const showNoData = !loading && !error && visibleEntries.length === 0 && !showNoFriends;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <LayeredEnvironment />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={styles.headerBrand}>
            <BrandBadge size={46} />
            <View>
              <Text style={styles.eyebrow}>Step Outside</Text>
              <Text style={styles.title}>Leaderboard</Text>
            </View>
          </View>

          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}>
            <Ionicons name="close" size={20} color={BRAND.forest} />
          </Pressable>
        </View>

        <PremiumHero
          style={styles.heroCard}
          eyebrow="Leaderboard"
          title="Small walks, steady momentum."
          subtitle="Compare weekly, monthly, and all-time progress across friends or the wider Step Outside community."
        />

        <View style={styles.controlCard}>
          <View style={styles.segmentedControl}>
            {SCOPES.map((item) => {
              const selected = scope === item;
              return (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => selectScope(item)}
                  style={[styles.segmentButton, selected ? styles.segmentButtonActive : null]}
                >
                  <Text style={[styles.segmentButtonText, selected ? styles.segmentButtonTextActive : null]}>
                    {scopeLabel(item)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.periodRow}>
            {PERIODS.map((item) => {
              const selected = period === item;
              return (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => selectPeriod(item)}
                  style={[styles.periodButton, selected ? styles.periodButtonActive : null]}
                >
                  <Text style={[styles.periodButtonText, selected ? styles.periodButtonTextActive : null]}>
                    {periodLabel(item)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {pinnedEntry ? (
          <View style={styles.pinnedCard}>
            <View style={styles.pinnedHeader}>
              <Text style={styles.pinnedEyebrow}>Your ranking</Text>
              <Text style={styles.pinnedScore}>{pinnedEntry.scoreMinutes} min</Text>
            </View>
            <LeaderboardRow entry={pinnedEntry} pinned />
          </View>
        ) : null}

        <View style={styles.boardCard}>
          <View style={styles.boardHeader}>
            <Text style={styles.boardTitle}>{scopeLabel(scope)} · {periodLabel(period)}</Text>
            {scope === "global" ? <Text style={styles.boardMeta}>Paged results</Text> : null}
          </View>

          {loading ? (
            <View style={styles.emptyState}>
              <View pointerEvents="none" style={styles.emptyStateArt}>
                <MountainLayersIllustration width={190} height={112} opacity={0.16} variant="forest" />
              </View>
              <ActivityIndicator color={BRAND.sunrise} />
              <Text style={styles.emptyTitle}>Loading leaderboard...</Text>
              <Text style={styles.emptyBody}>Pulling the latest rankings.</Text>
            </View>
          ) : error ? (
            <View style={styles.emptyState}>
              <View pointerEvents="none" style={styles.emptyStateArt}>
                <TrailIllustration width={170} height={104} opacity={0.18} variant="forest" />
              </View>
              <Text style={styles.emptyTitle}>Leaderboard unavailable</Text>
              <Text style={styles.emptyBody}>{error}</Text>
            </View>
          ) : showNoFriends ? (
            <View style={styles.emptyState}>
              <View pointerEvents="none" style={styles.emptyStateArt}>
                <TrailIllustration width={170} height={104} opacity={0.24} variant="forest" />
                <PineForestIllustration width={190} height={100} opacity={0.12} variant="forest" style={styles.emptyStateForest} />
              </View>
              <OutdoorIcon name="tree" size={29} color={BRAND.sunrise} accentColor={OutdoorTheme.colors.campfire} />
              <Text style={styles.emptyTitle}>No friends yet</Text>
              <Text style={styles.emptyBody}>A quiet trail is open. Add friends from Profile to start a friends-only ranking.</Text>
            </View>
          ) : showNoData ? (
            <View style={styles.emptyState}>
              <View pointerEvents="none" style={styles.emptyStateArt}>
                <MountainLayersIllustration width={190} height={112} opacity={0.22} variant="forest" />
              </View>
              <OutdoorIcon name="mountain" size={29} color={BRAND.sunrise} accentColor={OutdoorTheme.colors.campfire} />
              <Text style={styles.emptyTitle}>A mountain waiting to be climbed</Text>
              <Text style={styles.emptyBody}>Completed walks will appear here after rankings sync.</Text>
            </View>
          ) : (
            visibleEntries.map((entry) => <LeaderboardRow key={`${scope}-${period}-${entry.uid}`} entry={entry} />)
          )}

          {!loading && !error && scope === "global" && hasMore ? (
            <Pressable
              onPress={() => void loadMore()}
              disabled={loadingMore}
              style={({ pressed }) => [styles.loadMoreButton, pressed ? styles.pressed : null, loadingMore ? styles.disabled : null]}
            >
              {loadingMore ? <ActivityIndicator color={BRAND.forest} /> : null}
              <Text style={styles.loadMoreText}>{loadingMore ? "Loading..." : "Load more"}</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "transparent",
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 36,
    gap: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: BRAND.goldText,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 2,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
    color: BRAND.charcoal,
    fontSize: 31,
    lineHeight: 36,
    fontWeight: "700",
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(24,68,47,0.10)",
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.14)",
  },
  heroCard: {
    minHeight: 260,
  },
  heroTitle: {
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
    color: BRAND.charcoal,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: "700",
  },
  heroBody: {
    marginTop: 8,
    color: "rgba(30,42,36,0.66)",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
  },
  controlCard: {
    borderRadius: OutdoorTheme.radii.xl,
    padding: 10,
    backgroundColor: "rgba(24,68,47,0.94)",
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.98)",
  },
  segmentedControl: {
    flexDirection: "row",
    gap: 6,
  },
  segmentButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: OutdoorTheme.radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentButtonActive: {
    backgroundColor: BRAND.bone,
  },
  segmentButtonText: {
    color: "rgba(247,244,236,0.74)",
    fontSize: 14,
    fontWeight: "900",
  },
  segmentButtonTextActive: {
    color: BRAND.forest,
  },
  periodRow: {
    marginTop: 8,
    flexDirection: "row",
    gap: 7,
  },
  periodButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: OutdoorTheme.radii.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(247,244,236,0.16)",
    paddingHorizontal: 4,
  },
  periodButtonActive: {
    backgroundColor: "rgba(198,155,66,0.22)",
    borderColor: "rgba(198,155,66,0.44)",
  },
  periodButtonText: {
    color: "rgba(247,244,236,0.72)",
    fontSize: 12,
    fontWeight: "900",
  },
  periodButtonTextActive: {
    color: "#FFFFFF",
  },
  pinnedCard: {
    borderRadius: OutdoorTheme.radii.lg,
    padding: 12,
    backgroundColor: "rgba(198,155,66,0.18)",
    borderWidth: 1,
    borderColor: "rgba(198,155,66,0.34)",
  },
  pinnedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  pinnedEyebrow: {
    color: BRAND.goldText,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  pinnedScore: {
    color: BRAND.charcoal,
    fontSize: 13,
    fontWeight: "900",
  },
  boardCard: {
    borderRadius: OutdoorTheme.radii.xl,
    padding: 12,
    backgroundColor: BRAND.forest,
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.98)",
  },
  boardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  boardTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },
  boardMeta: {
    color: BRAND.sunrise,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  rowCard: {
    marginTop: 10,
    borderRadius: OutdoorTheme.radii.lg,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(247,244,236,0.10)",
    borderWidth: 1,
    borderColor: "rgba(247,244,236,0.14)",
  },
  currentUserRow: {
    borderColor: "rgba(198,155,66,0.72)",
  },
  rankBadge: {
    width: 42,
    minHeight: 42,
    borderRadius: OutdoorTheme.radii.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(247,244,236,0.12)",
  },
  rankBadgeGold: {
    backgroundColor: BRAND.sunrise,
  },
  rankText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  rankTextGold: {
    color: BRAND.charcoal,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(247,244,236,0.14)",
    borderWidth: 1,
    borderColor: "rgba(198,155,66,0.44)",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  username: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  name: {
    marginTop: 2,
    color: "rgba(247,244,236,0.70)",
    fontSize: 12,
    fontWeight: "700",
  },
  metricLine: {
    marginTop: 6,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 5,
  },
  metricText: {
    color: "rgba(247,244,236,0.78)",
    fontSize: 11,
    fontWeight: "800",
  },
  metricDot: {
    color: BRAND.sunrise,
    fontSize: 11,
    fontWeight: "900",
  },
  emptyState: {
    marginTop: 10,
    borderRadius: OutdoorTheme.radii.lg,
    alignItems: "center",
    minHeight: 178,
    padding: 22,
    justifyContent: "flex-end",
    backgroundColor: "rgba(247,244,236,0.10)",
    borderWidth: 1,
    borderColor: "rgba(247,244,236,0.14)",
    overflow: "hidden",
  },
  emptyStateArt: {
    position: "absolute",
    top: 4,
    right: -10,
    width: 196,
    height: 118,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateForest: {
    position: "absolute",
    right: -18,
    bottom: -20,
  },
  emptyTitle: {
    marginTop: 10,
    color: "#FFFFFF",
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyBody: {
    marginTop: 6,
    color: "rgba(247,244,236,0.72)",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
    textAlign: "center",
  },
  loadMoreButton: {
    marginTop: 12,
    minHeight: 50,
    borderRadius: OutdoorTheme.radii.lg,
    backgroundColor: BRAND.bone,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  loadMoreText: {
    color: BRAND.forest,
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  pressed: {
    opacity: 0.88,
  },
  disabled: {
    opacity: 0.55,
  },
});
