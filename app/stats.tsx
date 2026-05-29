import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BrandBadge } from "../src/components/BrandBadge";
import { PremiumFeatureGate } from "../src/components/PremiumFeatureGate";
import { PREMIUM, alpha } from "../src/lib/premiumTheme";
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
    bg: PREMIUM.colors.cream,
    headerText: PREMIUM.colors.forest,
    pageText: PREMIUM.colors.ink,
    pageSub: PREMIUM.colors.textMuted,
    yellowText: PREMIUM.colors.ink,
    yellowSub: alpha(PREMIUM.colors.ink, 0.74),
    text: PREMIUM.colors.offWhite,
    sub: alpha(PREMIUM.colors.offWhite, 0.76),
    card: PREMIUM.colors.forest,
    cardBorder: PREMIUM.colors.lineStrong,
    highlight: PREMIUM.colors.gold,
    greenTint: PREMIUM.colors.forest,
    greenBorder: PREMIUM.colors.lineStrong,
    yellowTint: alpha(PREMIUM.colors.gold, 0.92),
    yellowBorder: alpha(PREMIUM.colors.goldDeep, 0.42),
    heroGlow: PREMIUM.colors.glowGold,
    heroGlowSoft: PREMIUM.colors.glowCream,
    watermark: 0.04,
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
  const totalDistanceM = useMemo(
    () => sessions.reduce((acc, session) => acc + (typeof session.distanceM === "number" ? Math.max(0, session.distanceM) : 0), 0),
    [sessions]
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]} edges={["top", "left", "right", "bottom"]}>
      <View style={[styles.container, { backgroundColor: t.bg }]}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <BrandBadge size={30} />
            <Text style={[styles.headerTitle, { color: t.headerText }]}>Stats</Text>
          </View>

          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              router.back();
            }}
            style={({ pressed }) => [
              styles.backBtn,
              { backgroundColor: "rgba(37,94,54,0.08)", borderColor: t.cardBorder },
              pressed ? { opacity: 0.9 } : null,
            ]}
          >
            <Text style={[styles.backBtnText, { color: t.headerText }]}>Done</Text>
          </Pressable>
        </View>

        <Image
          source={require("../assets/images/icon.png")}
          resizeMode="contain"
          style={[styles.watermark, { opacity: t.watermark }]}
        />

        <ScrollView contentContainerStyle={styles.scrollPad} showsVerticalScrollIndicator={false}>
          <View style={[styles.summaryHero, { backgroundColor: t.greenTint, borderColor: t.greenBorder }]}>
            <View style={[styles.heroGlowOne, { backgroundColor: t.heroGlow }]} />
            <View style={[styles.heroGlowTwo, { backgroundColor: t.heroGlowSoft }]} />
            <Text style={[styles.summaryEyebrow, { color: t.sub }]}>Your rhythm</Text>
            <Text style={[styles.summaryTitle, { color: t.text }]}>
              {totalSessions === 0 ? "Your first walk starts the story." : `${totalSessions} walks creating steadier momentum.`}
            </Text>
            <Text style={[styles.summaryBody, { color: t.sub }]}>
              {totalSessions === 0
                ? "Stats will fill in gently as soon as you log a first outside reset."
                : `You’ve logged ${totalMinutes} minutes outside with a best streak of ${bestStreak} day${bestStreak === 1 ? "" : "s"}.`}
            </Text>

            <View style={styles.heroChips}>
              <View style={[styles.heroChip, { backgroundColor: "rgba(248,244,238,0.12)", borderColor: t.greenBorder }]}>
                <Text style={[styles.heroChipLabel, { color: t.sub }]}>Total walks</Text>
                <Text style={[styles.heroChipValue, { color: t.highlight }]}>{totalSessions}</Text>
              </View>
              <View style={[styles.heroChip, { backgroundColor: "rgba(248,244,238,0.12)", borderColor: t.yellowBorder }]}>
                <Text style={[styles.heroChipLabel, { color: t.sub }]}>Total distance</Text>
                <Text style={[styles.heroChipValue, { color: t.highlight }]}>{formatDistanceMiles(totalDistanceM)}</Text>
              </View>
              <View style={[styles.heroChip, { backgroundColor: "rgba(248,244,238,0.12)", borderColor: t.yellowBorder }]}>
                <Text style={[styles.heroChipLabel, { color: t.sub }]}>Avg session</Text>
                <Text style={[styles.heroChipValue, { color: t.text }]}>{avgSessionMinutes} min</Text>
              </View>
            </View>

            <View style={styles.summaryRow}>
              <View style={[styles.summaryMetric, { backgroundColor: "rgba(248,244,238,0.10)", borderColor: t.cardBorder }]}>
                <Text style={[styles.summaryMetricLabel, { color: t.sub }]}>Current streak</Text>
                <Text style={[styles.summaryMetricValue, { color: t.highlight }]}>{currentStreak}</Text>
              </View>
              <View style={[styles.summaryMetric, { backgroundColor: "rgba(248,244,238,0.10)", borderColor: t.cardBorder }]}>
                <Text style={[styles.summaryMetricLabel, { color: t.sub }]}>Total time</Text>
                <Text style={[styles.summaryMetricValue, { color: t.text }]}>{formatMinutesLabel(totalMinutes)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.grid}>
            <View style={[styles.card, { backgroundColor: t.greenTint, borderColor: t.greenBorder }]}>
              <Text style={[styles.cardLabel, { color: t.sub }]}>Total walks</Text>
              <Text style={[styles.cardValue, { color: t.highlight }]}>{totalSessions}</Text>
              <Text style={[styles.cardSub, { color: t.sub }]}>sessions</Text>
            </View>

            <View style={[styles.card, { backgroundColor: t.yellowTint, borderColor: t.yellowBorder }]}>
              <Text style={[styles.cardLabel, { color: t.yellowSub }]}>Total distance</Text>
              <Text style={[styles.cardValue, { color: t.yellowText }]}>{formatDistanceMiles(totalDistanceM)}</Text>
              <Text style={[styles.cardSub, { color: t.yellowSub }]}>across your walks</Text>
            </View>

            <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
              <Text style={[styles.cardLabel, { color: t.sub }]}>Total time</Text>
              <Text style={[styles.cardValue, { color: t.text }]}>{formatMinutesLabel(totalMinutes)}</Text>
              <Text style={[styles.cardSub, { color: t.sub }]}>outside</Text>
            </View>

            <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
              <Text style={[styles.cardLabel, { color: t.sub }]}>Current streak</Text>
              <Text style={[styles.cardValue, { color: t.text }]}>{currentStreak}</Text>
              <Text style={[styles.cardSub, { color: t.sub }]}>days in a row</Text>
            </View>
          </View>

          <Text style={[styles.sectionTitle, { color: t.headerText }]}>Last 7 days</Text>
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
                  <Pressable style={[styles.unlockBtn, { backgroundColor: t.highlight }]} onPress={() => router.push("/walk")}>
                    <Text style={styles.unlockBtnText}>Start a walk</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>

          <Text style={[styles.sectionTitle, { color: t.headerText }]}>Monthly Progress</Text>
          <View style={[styles.accentRule, { backgroundColor: t.highlight }]} />

          <View style={[styles.panel, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
            <PremiumFeatureGate
              title="Monthly progress insights"
              body="Unlock monthly progress insights with Step Outside Premium."
              ctaLabel="Unlock Premium"
              tone="forest"
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

          <Text style={[styles.sectionTitle, { color: t.headerText }]}>Premium Streaks</Text>
          <View style={[styles.accentRule, { backgroundColor: t.highlight }]} />

          <View style={[styles.panel, { backgroundColor: t.greenTint, borderColor: t.greenBorder }]}>
            <PremiumFeatureGate
              title="Premium streaks"
              body="Unlock Premium for weekly consistency streaks, active day totals, comeback tracking, and goal progress."
              ctaLabel="Unlock Premium"
              tone="forest"
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

          <Text style={[styles.sectionTitle, { color: t.headerText }]}>Golden Hours</Text>
          <View style={[styles.accentRule, { backgroundColor: t.highlight }]} />

          <View style={[styles.panel, { backgroundColor: t.yellowTint, borderColor: t.yellowBorder }]}>
            <View style={styles.row}>
              <Text style={[styles.rowLeft, { color: t.pageText }]}>Sunrise bonuses</Text>
              <Text style={[styles.rowRight, { color: t.pageText }]}>{sunriseBonusCount}</Text>
            </View>
            <View style={styles.row}>
              <Text style={[styles.rowLeft, { color: t.pageText }]}>Sunset bonuses</Text>
              <Text style={[styles.rowRight, { color: t.pageText }]}>{sunsetBonusCount}</Text>
            </View>

            <PremiumFeatureGate
              title="Premium insights"
              body="Unlock Premium for Golden Hour streaks, dual reset tracking, and deeper rhythm insights."
              ctaLabel="Unlock Premium"
              tone="forest"
            >
              <>
                <View style={styles.row}>
                  <Text style={[styles.rowLeft, { color: t.yellowSub }]}>Golden Hour streak</Text>
                  <Text style={[styles.rowRight, { color: t.yellowText }]}>{goldenHourStreakCurrent} days</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowLeft, { color: t.yellowSub }]}>Best Golden Hour run</Text>
                  <Text style={[styles.rowRight, { color: t.yellowText }]}>{goldenHourStreakBest} days</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowLeft, { color: t.yellowSub }]}>Dual reset days</Text>
                  <Text style={[styles.rowRight, { color: t.yellowText }]}>{dualResetDaysCount}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowLeft, { color: t.yellowSub }]}>Golden Hour hit rate</Text>
                  <Text style={[styles.rowRight, { color: t.yellowText }]}>{goldenHourRate}%</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowLeft, { color: t.yellowSub }]}>Avg session length</Text>
                  <Text style={[styles.rowRight, { color: t.yellowText }]}>{avgSessionMinutes} min</Text>
                </View>
                <View style={styles.row}>
                  <Text style={[styles.rowLeft, { color: t.yellowSub }]}>Active days (30d)</Text>
                  <Text style={[styles.rowRight, { color: t.yellowText }]}>{last30ActiveDays} days</Text>
                </View>
                <Text style={[styles.insightText, { color: t.yellowSub }]}>{goldenHourInsight}</Text>
              </>
            </PremiumFeatureGate>
          </View>

          <Text style={[styles.sectionTitle, { color: t.headerText }]}>Recent sessions</Text>
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
                  <View
                    key={key}
                    style={[
                      styles.sessionRow,
                      idx % 2 === 0
                        ? { backgroundColor: PREMIUM.colors.forest, borderColor: PREMIUM.colors.lineStrong }
                        : { backgroundColor: alpha(PREMIUM.colors.gold, 0.92), borderColor: alpha(PREMIUM.colors.goldDeep, 0.42) },
                    ]}
                  >
                    <Text style={[styles.sessionTitle, { color: idx % 2 === 0 ? t.text : t.pageText }]}>{mins} min</Text>
                    <Text style={[styles.sessionSub, { color: idx % 2 === 0 ? t.sub : t.pageSub }]}>{fmtTime(s.endedAt)}</Text>
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
  safe: { flex: 1, backgroundColor: PREMIUM.colors.cream },
  container: { flex: 1, paddingHorizontal: PREMIUM.spacing.lg },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 8,
    marginTop: 10,
  },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  headerTitle: { marginLeft: 10, fontSize: 26, lineHeight: 32, fontWeight: "700", color: PREMIUM.colors.text, fontFamily: PREMIUM.type.serifFamily },
  

  backBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: PREMIUM.radius.pill,
    borderWidth: 1,
  },
  backBtnText: { fontWeight: "800" },

  watermark: {
    position: "absolute",
    top: 140,
    right: -48,
    width: 300,
    height: 300,
  },

  scrollPad: { paddingBottom: 108 },
  summaryHero: {
    position: "relative",
    borderRadius: PREMIUM.radius.hero,
    padding: PREMIUM.spacing.xl,
    borderWidth: 1,
    marginTop: 10,
    marginBottom: 18,
    overflow: "hidden",
    ...PREMIUM.shadow.hero,
  },
  heroGlowOne: {
    position: "absolute",
    top: -36,
    right: -20,
    width: 140,
    height: 140,
    borderRadius: 999,
  },
  heroGlowTwo: {
    position: "absolute",
    bottom: -52,
    left: -28,
    width: 124,
    height: 124,
    borderRadius: 999,
  },
  summaryEyebrow: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  summaryTitle: {
    marginTop: 10,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "700",
    fontFamily: PREMIUM.type.serifFamily,
  },
  summaryBody: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "600",
  },
  heroChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  heroChip: {
    borderRadius: PREMIUM.radius.md,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minWidth: 120,
  },
  heroChipLabel: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  heroChipValue: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: "900",
  },
  summaryRow: {
    marginTop: 16,
    flexDirection: "row",
    gap: 10,
  },
  summaryMetric: {
    flex: 1,
    borderRadius: PREMIUM.radius.md,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  summaryMetricLabel: {
    fontSize: 12,
    fontWeight: "800",
  },
  summaryMetricValue: {
    marginTop: 6,
    fontSize: 24,
    fontWeight: "900",
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  card: {
    width: "48%",
    borderRadius: PREMIUM.radius.lg,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    ...PREMIUM.shadow.soft,
  },
  cardLabel: { fontWeight: "800", fontSize: 13 },
  cardValue: {
    fontSize: 40,
    fontWeight: "900",
    marginTop: 8,
    letterSpacing: -0.3,
    lineHeight: 42,
  },
  cardSub: { fontWeight: "800", marginTop: 2, fontSize: 13 },

  sectionTitle: {
    fontSize: 30,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 10,
    fontFamily: PREMIUM.type.serifFamily,
  },
  accentRule: {
    height: 4,
    width: 46,
    borderRadius: 99,
    marginTop: -6,
    marginBottom: 12,
  },

  panel: {
    borderRadius: PREMIUM.radius.lg,
    padding: 18,
    borderWidth: 1,
    ...PREMIUM.shadow.soft,
  },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9 },
  rowLeft: { fontWeight: "800", fontSize: 15 },
  rowRight: { fontWeight: "900", fontSize: 15 },

  sessionRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: PREMIUM.radius.md,
    borderWidth: 1,
    marginBottom: 10,
  },
  sessionTitle: { fontWeight: "900", fontSize: 18 },
  sessionSub: { marginTop: 4, fontWeight: "700", fontSize: 14 },

  muted: { fontWeight: "700" },
  emptyPanel: { gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "900" },
  emptyBody: { fontWeight: "700", lineHeight: 20 },
  monthTitle: {
    fontSize: 22,
    fontWeight: "700",
    fontFamily: PREMIUM.type.serifFamily,
  },
  monthBody: {
    marginTop: 6,
    fontWeight: "700",
    lineHeight: 20,
  },
  monthComparisonCard: {
    marginTop: 12,
    borderRadius: PREMIUM.radius.md,
    padding: 14,
    backgroundColor: alpha(PREMIUM.colors.offWhite, 0.10),
    borderWidth: 1,
    borderColor: alpha(PREMIUM.colors.offWhite, 0.14),
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
    backgroundColor: PREMIUM.colors.forest,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: PREMIUM.radius.pill,
  },
  unlockBtnText: {
    color: PREMIUM.colors.offWhite,
    fontWeight: "900",
  },
});
