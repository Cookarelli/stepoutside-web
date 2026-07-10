import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { OutdoorTheme } from "../constants/theme";
import { BrandBadge } from "../src/components/BrandBadge";
import { CampfireGlyph } from "../src/components/OutdoorDecor";
import {
  BootPrintsIllustration,
  CampfireIllustration,
  MapIllustration,
  MorningFogIllustration,
  MountainLayersIllustration,
} from "../src/components/OutdoorIllustrations";
import { LayeredEnvironment, PremiumHero, SectionHeader, StatCard } from "../src/components/OutdoorUI";
import { PremiumFeatureGate } from "../src/components/PremiumFeatureGate";
import {
  getLeaderboardEntries,
  refreshCurrentUserLeaderboardEntry,
  type LeaderboardPeriod,
  type LeaderboardScope,
  type RankedLeaderboardEntry,
} from "../src/lib/leaderboard";
import { buildMonthlyActivityStats } from "../src/lib/monthlyStats";
import { dayKeyLocal, EMPTY_SUMMARY, getSessions, getSummary, type OutsideSession, type SummaryStats } from "../src/lib/store";

function fmtTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}

function lastNDaysKeys(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(dayKeyLocal(d));
  }
  return out.reverse();
}

function formatMinutesLabel(minutes: number): string {
  if (minutes <= 0) return "0 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return hours >= 10 || Number.isInteger(hours) ? `${Math.round(hours)} hr` : `${hours.toFixed(1)} hr`;
}

function formatDistanceMiles(distanceM: number): string {
  if (!Number.isFinite(distanceM) || distanceM <= 0) return "0.00 mi";
  return `${(distanceM / 1609.344).toFixed(2)} mi`;
}

function formatDurationLabel(durationSec: number): string {
  if (durationSec <= 0) return "0 min";
  const minutes = Math.round(durationSec / 60);
  return formatMinutesLabel(minutes);
}

function initialsForLeaderboardEntry(entry: RankedLeaderboardEntry): string {
  const parts = entry.displayName.split(/\s+/).filter(Boolean);
  const initials = parts.length >= 2 ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}` : entry.displayName.slice(0, 2);
  return initials.toUpperCase() || "SO";
}

function periodLabel(period: LeaderboardPeriod): string {
  if (period === "weekly") return "Weekly";
  if (period === "monthly") return "Monthly";
  return "All-time";
}

function walkCountLabel(count: number): string {
  return `${count} walk${count === 1 ? "" : "s"}`;
}

function formatDayKeyLabel(dayKey: string | null): string {
  if (!dayKey) return "No standout day yet";
  const [year, month, day] = dayKey.split("-").map((value) => Number(value));
  return new Date(year, (month ?? 1) - 1, day ?? 1).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatDelta(value: number, formatter: (input: number) => string): string {
  if (!Number.isFinite(value) || value === 0) return "Even with last month";
  const prefix = value > 0 ? "+" : "-";
  return `${prefix}${formatter(Math.abs(value))}`;
}

function StatsEmptyPanel({
  title,
  body,
  illustration = "bootprints",
  actionLabel,
  onActionPress,
}: {
  title: string;
  body: string;
  illustration?: "bootprints" | "mountain" | "campsite" | "map";
  actionLabel?: string;
  onActionPress?: () => void;
}) {
  return (
    <View style={styles.emptyPanel}>
      <View pointerEvents="none" style={styles.emptyPanelArt}>
        {illustration === "mountain" ? (
          <MountainLayersIllustration width={178} height={106} opacity={0.18} />
        ) : illustration === "campsite" ? (
          <CampfireIllustration size={118} opacity={0.2} />
        ) : illustration === "map" ? (
          <MapIllustration width={138} height={102} opacity={0.18} />
        ) : (
          <>
            <BootPrintsIllustration width={142} height={96} opacity={0.2} />
            <MorningFogIllustration width={170} height={70} opacity={0.26} style={styles.emptyPanelFog} />
          </>
        )}
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {actionLabel && onActionPress ? (
        <Pressable style={styles.unlockBtn} onPress={onActionPress}>
          <Text style={styles.unlockBtnText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function StatsScreen() {
  const router = useRouter();

  const t = {
    bg: OutdoorTheme.colors.cream,
    text: OutdoorTheme.colors.charcoal,
    sub: OutdoorTheme.colors.mutedText,
    card: OutdoorTheme.colors.paperTranslucent,
    cardBorder: OutdoorTheme.colors.line,
    highlight: OutdoorTheme.colors.campfire,
    greenTint: OutdoorTheme.colors.forestTint,
    greenBorder: OutdoorTheme.colors.line,
    goldTint: OutdoorTheme.colors.goldTint,
    goldBorder: "rgba(198,155,66,0.28)",
    watermark: 0.08,
  } as const;

  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [sessions, setSessions] = useState<OutsideSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [leaderboardScope, setLeaderboardScope] = useState<LeaderboardScope>("friends");
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<LeaderboardPeriod>("weekly");
  const [leaderboardEntries, setLeaderboardEntries] = useState<RankedLeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);

  const last7 = useMemo(() => lastNDaysKeys(7), []);

  const load = useCallback(async () => {
    let nextSessions: OutsideSession[] = [];
    let loadedStats = false;
    try {
      setLoading(true);
      const [s, sess] = await Promise.all([getSummary(), getSessions()]);
      nextSessions = sess;
      loadedStats = true;
      setSummary(s);
      setSessions(sess);
    } catch {
      setSummary(EMPTY_SUMMARY);
      setSessions([]);
    } finally {
      setLoading(false);
    }

    try {
      setLeaderboardLoading(true);
      setLeaderboardError(null);
      if (loadedStats) {
        try {
          await refreshCurrentUserLeaderboardEntry(nextSessions);
        } catch {
          // The leaderboard can still show previously synced rankings if refresh is unavailable.
        }
      }
      const nextLeaderboardEntries = await getLeaderboardEntries(leaderboardScope, leaderboardPeriod);
      setLeaderboardEntries(nextLeaderboardEntries);
    } catch {
      setLeaderboardEntries([]);
      setLeaderboardError("Leaderboard rankings are unavailable right now.");
    } finally {
      setLeaderboardLoading(false);
    }
  }, [leaderboardPeriod, leaderboardScope]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const totalMinutes = summary?.totalMinutes ?? 0;
  const totalSessions = summary?.totalSessions ?? 0;
  const currentStreak = summary?.currentStreak ?? summary?.currentStreakDays ?? 0;
  const bestStreak = summary?.longestStreak ?? summary?.bestStreakDays ?? 0;
  const activeDaysThisWeek = summary?.activeDaysThisWeek ?? 0;
  const activeDaysThisMonth = summary?.activeDaysThisMonth ?? 0;
  const weeklyGoal = summary?.weeklyGoal ?? 4;
  const monthlyGoal = summary?.monthlyGoal ?? 16;
  const weeklyConsistencyStreakCurrent = summary?.weeklyConsistencyStreakCurrent ?? 0;
  const comebackStreakCount = summary?.comebackStreakCount ?? 0;
  const streakFreezeCount = summary?.streakFreezeCount ?? 0;
  const sunriseBonusCount = summary?.sunriseBonusCount ?? 0;
  const sunsetBonusCount = summary?.sunsetBonusCount ?? 0;
  const goldenHourStreakCurrent = summary?.goldenHourStreakCurrent ?? 0;
  const goldenHourStreakBest = summary?.goldenHourStreakBest ?? 0;
  const dualResetDaysCount = summary?.dualResetDaysCount ?? 0;
  const goldenHourSessionCount = sunriseBonusCount + sunsetBonusCount;

  const avgSessionMinutes = useMemo(() => {
    if (sessions.length === 0) return 0;
    const total = sessions.reduce((acc, s) => acc + Math.max(1, Math.round(s.durationSec / 60)), 0);
    return Math.round(total / sessions.length);
  }, [sessions]);

  const goldenHourRate = useMemo(() => {
    if (totalSessions === 0) return 0;
    return Math.round((goldenHourSessionCount / totalSessions) * 100);
  }, [goldenHourSessionCount, totalSessions]);

  const last30ActiveDays = useMemo(() => {
    if (!summary) return 0;
    let count = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dayKeyLocal(d);
      if ((summary.daysCompleted?.[key] ?? 0) > 0) count += 1;
    }
    return count;
  }, [summary]);

  const weeklyGoalProgress = useMemo(
    () => `${Math.min(activeDaysThisWeek, weeklyGoal)}/${weeklyGoal} days`,
    [activeDaysThisWeek, weeklyGoal]
  );

  const premiumStreakMessage = useMemo(() => {
    if (activeDaysThisWeek >= weeklyGoal) {
      return "Weekly goal complete. Keep your streak calm and steady.";
    }
    const remaining = Math.max(0, weeklyGoal - activeDaysThisWeek);
    if (currentStreak === 0) {
      return "A fresh streak starts with one walk. Your weekly goal is still within reach.";
    }
    return `${remaining} more active day${remaining === 1 ? "" : "s"} to hit this week's goal.`;
  }, [activeDaysThisWeek, currentStreak, weeklyGoal]);

  const goldenHourInsight = useMemo(() => {
    if (goldenHourSessionCount === 0) {
      return "Your first sunrise or sunset walk starts this rhythm.";
    }
    if (dualResetDaysCount > 0) {
      return `${dualResetDaysCount} dual reset day${dualResetDaysCount === 1 ? "" : "s"} so far. Morning and evening both count.`;
    }
    if (goldenHourStreakCurrent > 0) {
      return `${goldenHourStreakCurrent}-day Golden Hour streak in motion.`;
    }
    return `Best Golden Hour run so far: ${goldenHourStreakBest} day${goldenHourStreakBest === 1 ? "" : "s"}.`;
  }, [dualResetDaysCount, goldenHourSessionCount, goldenHourStreakBest, goldenHourStreakCurrent]);
  const monthlyStats = useMemo(() => buildMonthlyActivityStats(sessions, new Date()), [sessions]);
  const hasAnyStats = totalSessions > 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <LayeredEnvironment />
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <BrandBadge size={30} />
            <Text style={[styles.headerTitle, { color: t.text }]}>Stats</Text>
          </View>

          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              router.back();
            }}
            style={({ pressed }) => [
              styles.backBtn,
              { backgroundColor: t.card, borderColor: t.cardBorder },
              pressed ? { opacity: 0.9 } : null,
            ]}
          >
            <Text style={[styles.backBtnText, { color: t.sub }]}>Done</Text>
          </Pressable>
        </View>

        <Image
          source={require("../assets/images/icon.png")}
          resizeMode="contain"
          style={[styles.watermark, { opacity: t.watermark }]}
        />

        <ScrollView contentContainerStyle={styles.scrollPad}>
          <PremiumHero
            style={styles.summaryHero}
            eyebrow="Your rhythm"
            title={totalSessions === 0 ? "Your first walk starts the story." : `${totalSessions} walks creating steadier momentum.`}
            subtitle={
              totalSessions === 0
                ? "Stats will fill in gently as soon as you log a first outside reset."
                : `You’ve logged ${totalMinutes} minutes outside with a best streak of ${bestStreak} day${bestStreak === 1 ? "" : "s"}.`
            }
          >
            <View style={styles.summaryRow}>
              <View style={[styles.summaryMetric, { backgroundColor: "rgba(255,249,239,0.54)", borderColor: t.cardBorder }]}>
                <Text style={[styles.summaryMetricLabel, { color: t.sub }]}>Current streak</Text>
                <Text style={[styles.summaryMetricValue, { color: t.text }]}>{currentStreak}</Text>
              </View>
              <View style={[styles.summaryMetric, { backgroundColor: "rgba(255,249,239,0.54)", borderColor: t.cardBorder }]}>
                <Text style={[styles.summaryMetricLabel, { color: t.sub }]}>Outside</Text>
                <Text style={[styles.summaryMetricValue, { color: t.text }]}>{formatMinutesLabel(totalMinutes)}</Text>
              </View>
            </View>
          </PremiumHero>

          <View style={styles.grid}>
            <StatCard label="Current streak" value={currentStreak} meta="days" style={styles.card} />
            <StatCard label="Total outside" value={totalMinutes} meta="minutes" style={styles.card} />
            <StatCard label="Best streak" value={bestStreak} meta="days" style={styles.card} />
            <StatCard label="Sessions" value={totalSessions} meta="completed" style={styles.card} />
          </View>

          <View style={styles.leaderboardHeader}>
            <SectionHeader title="Leaderboard" style={styles.inlineSectionHeader} />
            <Text style={[styles.leaderboardMeta, { color: t.sub }]}>{periodLabel(leaderboardPeriod)} minutes</Text>
          </View>
          <View style={[styles.accentRule, { backgroundColor: t.highlight }]} />

          <View style={[styles.panel, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
            <View style={[styles.segmentedControl, { backgroundColor: "rgba(255,249,239,0.58)", borderColor: t.cardBorder }]}>
              {(["friends", "global"] as LeaderboardScope[]).map((scope) => {
                const selected = leaderboardScope === scope;
                return (
                  <Pressable
                    key={scope}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setLeaderboardScope(scope);
                    }}
                    style={[styles.segmentButton, selected ? { backgroundColor: "#18442F" } : null]}
                  >
                    <Text style={[styles.segmentButtonText, { color: selected ? "white" : t.text }]}>
                      {scope === "friends" ? "Friends" : "Global"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.periodRow}>
              {(["weekly", "monthly", "allTime"] as LeaderboardPeriod[]).map((period) => {
                const selected = leaderboardPeriod === period;
                return (
                  <Pressable
                    key={period}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setLeaderboardPeriod(period);
                    }}
                    style={[
                      styles.periodButton,
                      { borderColor: selected ? "#18442F" : t.cardBorder, backgroundColor: selected ? t.greenTint : "transparent" },
                    ]}
                  >
                    <Text style={[styles.periodButtonText, { color: selected ? t.text : t.sub }]}>{periodLabel(period)}</Text>
                  </Pressable>
                );
              })}
            </View>

            {leaderboardLoading ? (
              <StatsEmptyPanel
                title="Loading rankings..."
                body={`Finding the latest ${leaderboardScope} leaderboard.`}
                illustration="map"
              />
            ) : leaderboardError ? (
              <StatsEmptyPanel title="Leaderboard unavailable" body={leaderboardError} illustration="map" />
            ) : leaderboardEntries.length === 0 ? (
              <StatsEmptyPanel
                title="A mountain waiting to be climbed"
                body={
                  leaderboardScope === "friends"
                    ? "Add friends and complete a walk to start a friends-only ranking."
                    : "Global rankings appear as Step Outside users sync completed walks."
                }
                illustration="mountain"
              />
            ) : (
              leaderboardEntries.slice(0, 10).map((entry) => (
                <View
                  key={entry.uid}
                  style={[
                    styles.leaderboardRow,
                    entry.isCurrentUser ? { backgroundColor: t.greenTint, borderColor: t.greenBorder } : { borderColor: t.cardBorder },
                  ]}
                >
                  <Text style={[styles.rankText, { color: t.text }]}>#{entry.rank}</Text>
                  <View style={styles.leaderboardAvatar}>
                    {entry.photoURL ? (
                      <Image source={{ uri: entry.photoURL }} style={styles.leaderboardAvatarImage} />
                    ) : (
                      <Text style={styles.leaderboardAvatarText}>{initialsForLeaderboardEntry(entry)}</Text>
                    )}
                  </View>
                  <View style={styles.leaderboardCopy}>
                    <Text style={[styles.leaderboardName, { color: t.text }]} numberOfLines={1}>
                      {entry.displayName}
                      {entry.isCurrentUser ? " (You)" : ""}
                    </Text>
                    <Text style={[styles.leaderboardSub, { color: t.sub }]} numberOfLines={1}>
                      @{entry.username} • {walkCountLabel(entry.scoreSessions)} • {formatDistanceMiles(entry.scoreDistanceM)}
                    </Text>
                  </View>
                  <Text style={[styles.leaderboardScore, { color: t.text }]}>{formatMinutesLabel(entry.scoreMinutes)}</Text>
                </View>
              ))
            )}
          </View>

          <Text style={[styles.sectionTitle, { color: t.text }]}>Last 7 days</Text>
          <View style={[styles.accentRule, { backgroundColor: t.highlight }]} />

          <View style={[styles.panel, { backgroundColor: t.greenTint, borderColor: t.greenBorder }]}>
            {summary && hasAnyStats ? (
              last7.map((dk) => {
                const mins = summary.daysCompleted?.[dk] ?? 0;
                return (
                  <View key={dk} style={styles.row}>
                    <Text style={[styles.rowLeft, { color: t.sub }]}>{dk}</Text>
                    <Text style={[styles.rowRight, { color: t.text }]}>{mins} min</Text>
                  </View>
                );
              })
            ) : (
              <StatsEmptyPanel
                title={loading ? "Loading your rhythm..." : "Bootprints waiting in fresh dirt"}
                body={loading ? "We are pulling your latest progress now." : "Your last 7 days will fill in after your first completed walk."}
                illustration="bootprints"
                actionLabel={!loading ? "Start a walk" : undefined}
                onActionPress={!loading ? () => router.push("/walk") : undefined}
              />
            )}
          </View>

          <Text style={[styles.sectionTitle, { color: t.text }]}>Monthly Progress</Text>
          <View style={[styles.accentRule, { backgroundColor: t.highlight }]} />

          <View style={[styles.panel, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
            <PremiumFeatureGate
              title="Monthly progress insights"
              body="Unlock monthly progress insights with Step Outside Premium."
              ctaLabel="Unlock Premium"
            >
              <>
                <Text style={[styles.monthTitle, { color: t.text }]}>{monthlyStats.monthLabel}</Text>
                <Text style={[styles.monthBody, { color: t.sub }]}>
                  {monthlyStats.totalActivities === 0
                    ? "No walks or hikes logged this month yet."
                    : `${monthlyStats.totalActivities} total activities • ${monthlyStats.walkCount} walks • ${monthlyStats.hikeCount} hikes`}
                </Text>

                <View style={styles.row}>
                  <Text style={[styles.rowLeft, { color: t.sub }]}>Total distance</Text>
                  <Text style={[styles.rowRight, { color: t.text }]}>{formatDistanceMiles(monthlyStats.totalDistanceM)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowLeft, { color: t.sub }]}>Total duration</Text>
                  <Text style={[styles.rowRight, { color: t.text }]}>{formatDurationLabel(monthlyStats.totalDurationSec)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowLeft, { color: t.sub }]}>Average distance</Text>
                  <Text style={[styles.rowRight, { color: t.text }]}>{formatDistanceMiles(monthlyStats.averageDistanceM)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowLeft, { color: t.sub }]}>Best day</Text>
                  <Text style={[styles.rowRight, { color: t.text }]}>{formatDayKeyLabel(monthlyStats.bestDayKey)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowLeft, { color: t.sub }]}>Golden Hour bonuses</Text>
                  <Text style={[styles.rowRight, { color: t.text }]}>
                    {monthlyStats.sunriseBonusCount + monthlyStats.sunsetBonusCount}
                  </Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowLeft, { color: t.sub }]}>Active days this month</Text>
                  <Text style={[styles.rowRight, { color: t.text }]}>{monthlyStats.activeDays}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowLeft, { color: t.sub }]}>Longest activity</Text>
                  <Text style={[styles.rowRight, { color: t.text }]}>
                    {monthlyStats.longestActivity ? formatDurationLabel(monthlyStats.longestActivity.durationSec) : "Not yet"}
                  </Text>
                </View>

                {monthlyStats.comparison ? (
                  <View style={styles.monthComparisonCard}>
                    <Text style={[styles.monthComparisonTitle, { color: t.text }]}>
                      Compared with {monthlyStats.comparison.previousMonthLabel}
                    </Text>
                    <Text style={[styles.monthComparisonBody, { color: t.sub }]}>
                      Activities {formatDelta(monthlyStats.comparison.activityDelta, (value) => `${value}`)} • Distance{" "}
                      {formatDelta(monthlyStats.comparison.distanceDeltaM, formatDistanceMiles)} • Time{" "}
                      {formatDelta(monthlyStats.comparison.durationDeltaSec, formatDurationLabel)}
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.insightText, { color: t.sub }]}>
                    Last month’s comparison will appear once previous month activity exists.
                  </Text>
                )}
              </>
            </PremiumFeatureGate>
          </View>

          <Text style={[styles.sectionTitle, { color: t.text }]}>Premium Streaks</Text>
          <View style={[styles.accentRule, { backgroundColor: t.highlight }]} />

          <View style={[styles.panel, { backgroundColor: t.greenTint, borderColor: t.greenBorder }]}>
            <PremiumFeatureGate
              title="Premium streaks"
              body="Unlock Premium for weekly consistency streaks, active day totals, comeback tracking, and goal progress."
              ctaLabel="Unlock Premium"
            >
              <>
                <View style={styles.row}>
                  <Text style={[styles.rowLeft, { color: t.sub }]}>Current streak</Text>
                  <Text style={[styles.rowRight, { color: t.text }]}>{currentStreak} days</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowLeft, { color: t.sub }]}>Longest streak</Text>
                  <Text style={[styles.rowRight, { color: t.text }]}>{bestStreak} days</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowLeft, { color: t.sub }]}>Weekly consistency</Text>
                  <Text style={[styles.rowRight, { color: t.text }]}>{weeklyConsistencyStreakCurrent} weeks</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowLeft, { color: t.sub }]}>Weekly progress</Text>
                  <Text style={[styles.rowRight, { color: t.text }]}>{weeklyGoalProgress}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowLeft, { color: t.sub }]}>Active days this month</Text>
                  <Text style={[styles.rowRight, { color: t.text }]}>{activeDaysThisMonth}/{monthlyGoal}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowLeft, { color: t.sub }]}>Comeback streaks</Text>
                  <Text style={[styles.rowRight, { color: t.text }]}>{comebackStreakCount}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowLeft, { color: t.sub }]}>Streak freeze</Text>
                  <Text style={[styles.rowRight, { color: t.text }]}>{streakFreezeCount} saved for later</Text>
                </View>
                <Text style={[styles.insightText, { color: t.sub }]}>{premiumStreakMessage}</Text>
              </>
            </PremiumFeatureGate>
          </View>

          <Text style={[styles.sectionTitle, { color: t.text }]}>Golden Hours</Text>
          <View style={[styles.accentRule, { backgroundColor: t.highlight }]} />

          <View style={[styles.panel, { backgroundColor: t.goldTint, borderColor: t.goldBorder }]}>
            <CampfireGlyph style={styles.panelFire} size={54} opacity={0.18} />
            <View style={styles.row}>
              <Text style={[styles.rowLeft, { color: t.sub }]}>Sunrise bonuses</Text>
              <Text style={[styles.rowRight, { color: t.text }]}>{sunriseBonusCount}</Text>
            </View>
            <View style={styles.row}>
              <Text style={[styles.rowLeft, { color: t.sub }]}>Sunset bonuses</Text>
              <Text style={[styles.rowRight, { color: t.text }]}>{sunsetBonusCount}</Text>
            </View>

            <PremiumFeatureGate
              title="Premium insights"
              body="Unlock Premium for Golden Hour streaks, dual reset tracking, and deeper rhythm insights."
              ctaLabel="Unlock Premium"
            >
              <>
                <View style={styles.row}>
                  <Text style={[styles.rowLeft, { color: t.sub }]}>Golden Hour streak</Text>
                  <Text style={[styles.rowRight, { color: t.text }]}>{goldenHourStreakCurrent} days</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowLeft, { color: t.sub }]}>Best Golden Hour run</Text>
                  <Text style={[styles.rowRight, { color: t.text }]}>{goldenHourStreakBest} days</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowLeft, { color: t.sub }]}>Dual reset days</Text>
                  <Text style={[styles.rowRight, { color: t.text }]}>{dualResetDaysCount}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowLeft, { color: t.sub }]}>Golden Hour hit rate</Text>
                  <Text style={[styles.rowRight, { color: t.text }]}>{goldenHourRate}%</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowLeft, { color: t.sub }]}>Avg session length</Text>
                  <Text style={[styles.rowRight, { color: t.text }]}>{avgSessionMinutes} min</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowLeft, { color: t.sub }]}>Active days (30d)</Text>
                  <Text style={[styles.rowRight, { color: t.text }]}>{last30ActiveDays} days</Text>
                </View>
                <Text style={[styles.insightText, { color: t.sub }]}>{goldenHourInsight}</Text>
              </>
            </PremiumFeatureGate>
          </View>

          <Text style={[styles.sectionTitle, { color: t.text }]}>Recent sessions</Text>
          <View style={[styles.accentRule, { backgroundColor: t.highlight }]} />

          <View style={[styles.panel, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
            {sessions.length === 0 ? (
              <StatsEmptyPanel
                title={loading ? "Loading sessions..." : "Bootprints waiting in fresh dirt"}
                body={loading ? "Your recent walks are on the way." : "Finish one walk and it will show up here with time and date."}
                illustration="bootprints"
              />
            ) : (
              sessions.slice(0, 10).map((s, idx) => {
                const mins = Math.max(1, Math.round(s.durationSec / 60));
                const key = `${String((s as any).id ?? "")}-${String((s as any).startedAt ?? "")}-${String(
                  (s as any).endedAt ?? ""
                )}-${idx}`;
                return (
                  <View key={key} style={styles.sessionRow}>
                    <Text style={[styles.sessionTitle, { color: t.text }]}>{mins} min</Text>
                    <Text style={[styles.sessionSub, { color: t.sub }]}>{fmtTime(s.endedAt)}</Text>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 18 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 8,
    marginTop: 10,
  },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  headerTitle: { marginLeft: 10, fontSize: 22, fontWeight: "900" },

  backBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  backBtnText: { fontWeight: "800" },

  watermark: {
    position: "absolute",
    top: 120,
    right: -40,
    width: 320,
    height: 320,
  },

  scrollPad: { paddingBottom: 28 },
  summaryHero: {
    marginTop: 10,
    marginBottom: 14,
    minHeight: 286,
  },
  summaryEyebrow: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  summaryTitle: {
    marginTop: 10,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "900",
  },
  summaryBody: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
  },
  summaryRow: {
    marginTop: 16,
    flexDirection: "row",
    gap: 10,
  },
  summaryMetric: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  summaryMetricLabel: {
    fontSize: 12,
    fontWeight: "800",
  },
  summaryMetricValue: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: "900",
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  card: {
    width: "48%",
    borderRadius: OutdoorTheme.radii.lg,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    ...OutdoorTheme.shadows.soft,
  },
  cardLabel: { fontWeight: "800", fontSize: 13 },
  cardValue: {
    fontSize: 40,
    fontWeight: "900",
    marginTop: 8,
  },
  cardSub: { fontWeight: "800", marginTop: 2, fontSize: 13 },

  leaderboardHeader: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inlineSectionHeader: {
    flex: 1,
  },
  leaderboardMeta: {
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  segmentedControl: {
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    marginBottom: 10,
  },
  segmentButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentButtonText: {
    fontSize: 14,
    fontWeight: "900",
  },
  periodRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  periodButton: {
    flex: 1,
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  periodButtonText: {
    fontSize: 12,
    fontWeight: "900",
  },
  leaderboardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    padding: 10,
    marginTop: 8,
  },
  rankText: {
    width: 34,
    fontSize: 15,
    fontWeight: "900",
  },
  leaderboardAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#18442F",
    overflow: "hidden",
  },
  leaderboardAvatarImage: {
    width: "100%",
    height: "100%",
  },
  leaderboardAvatarText: {
    color: "white",
    fontSize: 13,
    fontWeight: "900",
  },
  leaderboardCopy: {
    flex: 1,
    minWidth: 0,
  },
  leaderboardName: {
    fontSize: 15,
    fontWeight: "900",
  },
  leaderboardSub: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "700",
  },
  leaderboardScore: {
    maxWidth: 78,
    textAlign: "right",
    fontSize: 14,
    fontWeight: "900",
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: "900",
    marginTop: 8,
    marginBottom: 10,
  },
  accentRule: {
    height: 4,
    width: 46,
    borderRadius: 99,
    marginTop: -6,
    marginBottom: 12,
  },

  panel: {
    borderRadius: OutdoorTheme.radii.lg,
    padding: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  panelFire: {
    position: "absolute",
    right: 18,
    top: 14,
  },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9 },
  rowLeft: { fontWeight: "800", fontSize: 15 },
  rowRight: { fontWeight: "900", fontSize: 15 },

  sessionRow: { paddingVertical: 10 },
  sessionTitle: { fontWeight: "900", fontSize: 18 },
  sessionSub: { marginTop: 4, fontWeight: "700", fontSize: 14 },

  muted: { fontWeight: "700" },
  emptyPanel: {
    minHeight: 150,
    justifyContent: "flex-end",
    gap: 8,
    overflow: "hidden",
    paddingTop: 40,
  },
  emptyPanelArt: {
    position: "absolute",
    right: -18,
    top: 0,
    width: 180,
    height: 112,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyPanelFog: {
    position: "absolute",
    right: -18,
    bottom: 2,
  },
  emptyTitle: {
    maxWidth: 310,
    color: OutdoorTheme.colors.charcoal,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
  },
  emptyBody: {
    maxWidth: 330,
    color: OutdoorTheme.colors.mutedText,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 23,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: "900",
  },
  monthBody: {
    marginTop: 6,
    fontWeight: "700",
    lineHeight: 20,
  },
  monthComparisonCard: {
    marginTop: 12,
    borderRadius: 16,
    padding: 12,
    backgroundColor: "rgba(24,68,47,0.08)",
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.12)",
  },
  monthComparisonTitle: {
    fontWeight: "900",
    fontSize: 14,
  },
  monthComparisonBody: {
    marginTop: 6,
    fontWeight: "700",
    lineHeight: 20,
  },
  insightText: {
    marginTop: 10,
    fontWeight: "700",
    lineHeight: 20,
  },
  unlockBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: "#18442F",
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  unlockBtnText: {
    color: "white",
    fontWeight: "900",
  },
});
