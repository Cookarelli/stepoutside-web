import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BrandBadge } from "../src/components/BrandBadge";
import { PremiumFeatureGate } from "../src/components/PremiumFeatureGate";
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

export default function StatsScreen() {
  const router = useRouter();

  const t = {
    bg: "#F8F4EE",
    text: "rgba(11,15,14,0.92)",
    sub: "rgba(11,15,14,0.62)",
    card: "rgba(11,15,14,0.06)",
    cardBorder: "rgba(11,15,14,0.12)",
    highlight: "#F2B541",
    greenTint: "rgba(37,94,54,0.10)",
    greenBorder: "rgba(37,94,54,0.16)",
    yellowTint: "rgba(242,181,65,0.16)",
    yellowBorder: "rgba(242,181,65,0.34)",
    watermark: 0.08,
  } as const;

  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [sessions, setSessions] = useState<OutsideSession[]>([]);
  const [loading, setLoading] = useState(true);

  const last7 = useMemo(() => lastNDaysKeys(7), []);

  const load = async () => {
    try {
      setLoading(true);
      const [s, sess] = await Promise.all([getSummary(), getSessions()]);
      setSummary(s);
      setSessions(sess);
    } catch {
      setSummary(EMPTY_SUMMARY);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [])
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
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]} edges={["top", "left", "right", "bottom"]}>
      <View style={[styles.container, { backgroundColor: t.bg }]}>
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
          <View style={[styles.summaryHero, { backgroundColor: t.greenTint, borderColor: t.greenBorder }]}>
            <Text style={[styles.summaryEyebrow, { color: t.sub }]}>Your rhythm</Text>
            <Text style={[styles.summaryTitle, { color: t.text }]}>
              {totalSessions === 0 ? "Your first walk starts the story." : `${totalSessions} walks creating steadier momentum.`}
            </Text>
            <Text style={[styles.summaryBody, { color: t.sub }]}>
              {totalSessions === 0
                ? "Stats will fill in gently as soon as you log a first outside reset."
                : `You’ve logged ${totalMinutes} minutes outside with a best streak of ${bestStreak} day${bestStreak === 1 ? "" : "s"}.`}
            </Text>

            <View style={styles.summaryRow}>
              <View style={[styles.summaryMetric, { backgroundColor: "rgba(255,255,255,0.54)", borderColor: t.cardBorder }]}>
                <Text style={[styles.summaryMetricLabel, { color: t.sub }]}>Current streak</Text>
                <Text style={[styles.summaryMetricValue, { color: t.text }]}>{currentStreak}</Text>
              </View>
              <View style={[styles.summaryMetric, { backgroundColor: "rgba(255,255,255,0.54)", borderColor: t.cardBorder }]}>
                <Text style={[styles.summaryMetricLabel, { color: t.sub }]}>Outside</Text>
                <Text style={[styles.summaryMetricValue, { color: t.text }]}>{formatMinutesLabel(totalMinutes)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.grid}>
            <View style={[styles.card, { backgroundColor: t.greenTint, borderColor: t.greenBorder }]}>
              <Text style={[styles.cardLabel, { color: t.sub }]}>Current streak</Text>
              <Text style={[styles.cardValue, { color: t.text }]}>{currentStreak}</Text>
              <Text style={[styles.cardSub, { color: t.sub }]}>days</Text>
            </View>

            <View style={[styles.card, { backgroundColor: t.yellowTint, borderColor: t.yellowBorder }]}>
              <Text style={[styles.cardLabel, { color: t.sub }]}>Total outside</Text>
              <Text style={[styles.cardValue, { color: t.text }]}>{totalMinutes}</Text>
              <Text style={[styles.cardSub, { color: t.sub }]}>minutes</Text>
            </View>

            <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
              <Text style={[styles.cardLabel, { color: t.sub }]}>Best streak</Text>
              <Text style={[styles.cardValue, { color: t.text }]}>{bestStreak}</Text>
              <Text style={[styles.cardSub, { color: t.sub }]}>days</Text>
            </View>

            <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
              <Text style={[styles.cardLabel, { color: t.sub }]}>Sessions</Text>
              <Text style={[styles.cardValue, { color: t.text }]}>{totalSessions}</Text>
              <Text style={[styles.cardSub, { color: t.sub }]}>completed</Text>
            </View>
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
              <View style={styles.emptyPanel}>
                <Text style={[styles.emptyTitle, { color: t.text }]}>{loading ? "Loading your rhythm…" : "No walk history yet"}</Text>
                <Text style={[styles.emptyBody, { color: t.sub }]}>
                  {loading
                    ? "We’re pulling your latest progress now."
                    : "Your last 7 days will fill in after your first completed walk."}
                </Text>
                {!loading ? (
                  <Pressable style={styles.unlockBtn} onPress={() => router.push("/walk")}>
                    <Text style={styles.unlockBtnText}>Start a walk</Text>
                  </Pressable>
                ) : null}
              </View>
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

          <View style={[styles.panel, { backgroundColor: t.yellowTint, borderColor: t.yellowBorder }]}>
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
              <View style={styles.emptyPanel}>
                <Text style={[styles.emptyTitle, { color: t.text }]}>{loading ? "Loading sessions…" : "No recent sessions yet"}</Text>
                <Text style={[styles.emptyBody, { color: t.sub }]}>
                  {loading
                    ? "Your recent walks are on the way."
                    : "Finish one walk and it will show up here with time and date."}
                </Text>
              </View>
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
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    marginTop: 10,
    marginBottom: 14,
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
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
  },
  cardLabel: { fontWeight: "800", fontSize: 13 },
  cardValue: {
    fontSize: 40,
    fontWeight: "900",
    marginTop: 8,
    letterSpacing: -0.3,
  },
  cardSub: { fontWeight: "800", marginTop: 2, fontSize: 13 },

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
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
  },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9 },
  rowLeft: { fontWeight: "800", fontSize: 15 },
  rowRight: { fontWeight: "900", fontSize: 15 },

  sessionRow: { paddingVertical: 10 },
  sessionTitle: { fontWeight: "900", fontSize: 18 },
  sessionSub: { marginTop: 4, fontWeight: "700", fontSize: 14 },

  muted: { fontWeight: "700" },
  emptyPanel: { gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "900" },
  emptyBody: { fontWeight: "700", lineHeight: 20 },
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
    backgroundColor: "rgba(37,94,54,0.08)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.12)",
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
    backgroundColor: "#255E36",
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  unlockBtnText: {
    color: "white",
    fontWeight: "900",
  },
});
