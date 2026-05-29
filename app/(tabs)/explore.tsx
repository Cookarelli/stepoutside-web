import React, { useEffect, useMemo, useRef, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { usePremiumAccess } from "../../hooks/use-premium-access";
import { BadgeCard } from "../../src/components/BadgeCard";
import { BrandBadge } from "../../src/components/BrandBadge";
import { ChallengeProgressCard } from "../../src/components/ChallengeProgressCard";
import { PREMIUM, alpha } from "../../src/lib/premiumTheme";
import { BADGE_CATALOG, CHALLENGE_CATALOG, TEAM_MVP_PREVIEW } from "../../src/lib/challenges/catalog";
import { hydrateLocalChallengeSnapshotFromFirestore, refreshLocalChallengeSnapshot } from "../../src/lib/challenges/storage";
import type { LocalChallengeSnapshot } from "../../src/lib/challenges/types";
import { getCachedAuthUser, subscribeToAuth, type AuthUserSnapshot } from "../../src/lib/auth";
import {
  createCompanyMvpSeedForCurrentUser,
  createInviteCodeForCompany,
  createStarterChallengeForCompany,
} from "../../src/lib/corporateAdmin";
import {
  getCorporateMembershipSnapshot,
  joinCompanyWithInviteCode,
  syncCorporateChallengeProgressFromWalk,
  syncCorporateMemberStatsFromWalk,
  type CorporateMembershipSnapshot,
} from "../../src/lib/corporate";
import { getSessions, getSummary, type OutsideSession, type SummaryStats } from "../../src/lib/store";

const BRAND = {
  forest: PREMIUM.colors.forest,
  sunrise: PREMIUM.colors.gold,
  bone: PREMIUM.colors.offWhite,
  charcoal: PREMIUM.colors.ink,
  mist: PREMIUM.colors.creamSoft,
} as const;

type Segment = "for-you" | "badges" | "team";
type JumpTarget = "top" | "completed" | "badges";

const SEGMENTS: { id: Segment; label: string }[] = [
  { id: "for-you", label: "For You" },
  { id: "badges", label: "Badges" },
  { id: "team", label: "Team" },
];

export default function ExploreScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const [segment, setSegment] = useState<Segment>("for-you");
  const [pendingJump, setPendingJump] = useState<JumpTarget | null>(null);
  const [sectionOffsets, setSectionOffsets] = useState<Record<JumpTarget, number>>({
    top: 0,
    completed: 360,
    badges: 360,
  });
  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [sessionHistory, setSessionHistory] = useState<OutsideSession[]>([]);
  const [challengeSnapshot, setChallengeSnapshot] = useState<LocalChallengeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [authUser, setAuthUser] = useState<AuthUserSnapshot | null>(null);
  const [corporateSnapshot, setCorporateSnapshot] = useState<CorporateMembershipSnapshot | null>(null);
  const [corporateLoading, setCorporateLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [joiningCompany, setJoiningCompany] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const [latestAdminInviteCode, setLatestAdminInviteCode] = useState<string | null>(null);
  const { isPremium } = usePremiumAccess();

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        const hydratedSnapshot = await hydrateLocalChallengeSnapshotFromFirestore();
        if (active && hydratedSnapshot) {
          setChallengeSnapshot(hydratedSnapshot);
        }
        const [nextSummary, nextSessions] = await Promise.all([getSummary(), getSessions()]);
        if (!active) return;
        setSummary(nextSummary);
        setSessionHistory(nextSessions);
        const nextChallengeState = await refreshLocalChallengeSnapshot({
          sessions: nextSessions,
          summary: nextSummary,
          now: new Date(),
        });
        if (!active) return;
        setChallengeSnapshot(nextChallengeState.snapshot);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadCorporateState(user: AuthUserSnapshot | null) {
      if (!active) return;

      if (!user?.uid) {
        setCorporateSnapshot({
          membership: null,
          company: null,
          team: null,
          leaderboard: [],
          activeChallenge: null,
          activeChallengeProgress: null,
          activeChallengeAggregate: null,
          adminDashboard: null,
        });
        setCorporateLoading(false);
        return;
      }

      setCorporateLoading(true);
      try {
        const snapshot = await getCorporateMembershipSnapshot();
        if (!active) return;
        setCorporateSnapshot(snapshot);
      } catch {
        if (!active) return;
        setCorporateSnapshot({
          membership: null,
          company: null,
          team: null,
          leaderboard: [],
          activeChallenge: null,
          activeChallengeProgress: null,
          activeChallengeAggregate: null,
          adminDashboard: null,
        });
      } finally {
        if (active) setCorporateLoading(false);
      }
    }

    void getCachedAuthUser().then((user) => {
      if (!active) return;
      setAuthUser(user);
      void loadCorporateState(user);
    });

    const unsubscribe = subscribeToAuth((user) => {
      if (!active) return;
      setAuthUser(user);
      void loadCorporateState(user);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const activeChallenges = useMemo(
    () =>
      CHALLENGE_CATALOG.map((challenge) => ({
        challenge,
        progress: challengeSnapshot?.progress.find((item) => item.challengeId === challenge.id),
      }))
        .filter((item) => Boolean(item.progress) && item.progress?.status !== "completed")
        .slice(0, 4),
    [challengeSnapshot]
  );

  const completedChallenges = useMemo(
    () =>
      CHALLENGE_CATALOG.map((challenge) => ({
        challenge,
        progress: challengeSnapshot?.progress.find((item) => item.challengeId === challenge.id),
      })).filter((item) => item.progress?.status === "completed"),
    [challengeSnapshot]
  );

  const featuredBadges = useMemo(() => {
    if (challengeSnapshot?.badges.length) return challengeSnapshot.badges;
    return BADGE_CATALOG.map((badge) => ({
      badge,
      earned: false,
      progressHint: badge.availability === "coming_soon" ? "Coming soon" : "Progress starts with your next walk.",
    }));
  }, [challengeSnapshot]);

  const earnedBadges = useMemo(() => featuredBadges.filter((badge) => badge.earned), [featuredBadges]);
  const lockedBadges = useMemo(() => featuredBadges.filter((badge) => !badge.earned), [featuredBadges]);

  const completedCount = challengeSnapshot?.completedChallengeIds.length ?? 0;
  const earnedCount = challengeSnapshot?.earnedBadgeIds.length ?? 0;

  const heroTitle = challengeSnapshot
    ? completedCount > 0
      ? `${completedCount} challenge${completedCount === 1 ? "" : "s"} already complete.`
      : "Challenges that reward steady time outside."
    : "Challenges that reward steady time outside.";

  const goldenHourCount = (summary?.sunriseBonusCount ?? 0) + (summary?.sunsetBonusCount ?? 0);

  const heroBody = challengeSnapshot
    ? goldenHourCount > 0
      ? `${earnedCount} badge${earnedCount === 1 ? "" : "s"} unlocked so far, with ${goldenHourCount} Golden Hour session${goldenHourCount === 1 ? "" : "s"} adding extra glow.`
      : `${earnedCount} badge${earnedCount === 1 ? "" : "s"} unlocked so far, with more milestones ready as your rhythm grows.`
    : "Unlock guided milestones, streaks, and outdoor achievements.";

  const hasCorporateMembership = Boolean(corporateSnapshot?.membership && corporateSnapshot.company);
  const leaderboardRows =
    corporateSnapshot?.leaderboard.length ? corporateSnapshot.leaderboard : TEAM_MVP_PREVIEW.leaderboard;
  const activeCorporateChallenge = corporateSnapshot?.activeChallenge;
  const activeCorporateChallengeProgress = corporateSnapshot?.activeChallengeProgress;
  const activeCorporateChallengeAggregate = corporateSnapshot?.activeChallengeAggregate;
  const adminDashboard = corporateSnapshot?.adminDashboard;
  const isCompanyAdmin = corporateSnapshot?.membership?.role === "admin";

  useEffect(() => {
    if (!pendingJump) return;
    const targetY = sectionOffsets[pendingJump] ?? 0;
    const timeout = setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, targetY - 24),
        animated: true,
      });
      setPendingJump(null);
    }, 70);

    return () => clearTimeout(timeout);
  }, [pendingJump, sectionOffsets, segment]);

  function rememberSectionOffset(key: JumpTarget) {
    return (event: LayoutChangeEvent) => {
      const nextY = event.nativeEvent.layout.y;
      setSectionOffsets((current) => (current[key] === nextY ? current : { ...current, [key]: nextY }));
    };
  }

  function jumpToSection(nextSegment: Segment, target: JumpTarget) {
    setSegment(nextSegment);
    setPendingJump(target);
  }

  async function handleJoinCompany() {
    if (joiningCompany) return;

    setInviteError(null);
    setJoiningCompany(true);
    try {
      const joinedSnapshot = await joinCompanyWithInviteCode(inviteCode, authUser);
      if (summary && sessionHistory.length) {
        await syncCorporateMemberStatsFromWalk({
          summary,
          sessions: sessionHistory,
          cachedUser: authUser,
        });
        await syncCorporateChallengeProgressFromWalk({
          summary,
          sessions: sessionHistory,
          now: new Date(),
        });
      }
      const nextSnapshot = await getCorporateMembershipSnapshot();
      setCorporateSnapshot(nextSnapshot.membership ? nextSnapshot : joinedSnapshot);
      setInviteCode("");
      Alert.alert(
        "Joined your team",
        nextSnapshot.company
          ? `You’re now connected to ${nextSnapshot.company.name}.`
          : "Your company membership is ready."
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Please try again in a moment.";
      setInviteError(message);
      Alert.alert("Couldn’t join company", message);
    } finally {
      setJoiningCompany(false);
    }
  }

  async function refreshCorporateView() {
    const nextSnapshot = await getCorporateMembershipSnapshot();
    setCorporateSnapshot(nextSnapshot);
    return nextSnapshot;
  }

  async function handleCreateSampleCompany() {
    if (adminBusy) return;
    setAdminBusy(true);
    try {
      const seeded = await createCompanyMvpSeedForCurrentUser(authUser);
      setLatestAdminInviteCode(seeded.inviteCode);
      await refreshCorporateView();
      Alert.alert(
        "Sample company ready",
        `${seeded.companyName} is set up with invite code ${seeded.inviteCode}.`
      );
    } catch (error) {
      Alert.alert(
        "Couldn’t create company seed",
        error instanceof Error ? error.message : "Please try again in a moment."
      );
    } finally {
      setAdminBusy(false);
    }
  }

  async function handleCreateInviteCode() {
    if (adminBusy || !corporateSnapshot?.company) return;
    setAdminBusy(true);
    try {
      const code = await createInviteCodeForCompany({
        companyId: corporateSnapshot.company.id,
        companyName: corporateSnapshot.company.name,
        teamId: corporateSnapshot.team?.id ?? corporateSnapshot.membership?.teamId,
        teamName: corporateSnapshot.team?.name ?? null,
      });
      setLatestAdminInviteCode(code);
      Alert.alert("Invite code created", `Share ${code} with your team.`);
    } catch (error) {
      Alert.alert(
        "Couldn’t create invite code",
        error instanceof Error ? error.message : "Please try again in a moment."
      );
    } finally {
      setAdminBusy(false);
    }
  }

  async function handleCreateStarterChallenge() {
    if (adminBusy || !corporateSnapshot?.company) return;
    setAdminBusy(true);
    try {
      await createStarterChallengeForCompany({
        companyId: corporateSnapshot.company.id,
        teamId: corporateSnapshot.team?.id ?? corporateSnapshot.membership?.teamId,
      });
      const nextSnapshot = await refreshCorporateView();
      Alert.alert(
        "Starter challenge created",
        nextSnapshot.activeChallenge
          ? `${nextSnapshot.activeChallenge.title} is now live for your team.`
          : "Your starter challenge is ready."
      );
    } catch (error) {
      Alert.alert(
        "Couldn’t create starter challenge",
        error instanceof Error ? error.message : "Please try again in a moment."
      );
    } finally {
      setAdminBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.page}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <View style={styles.heroGlowOne} />
            <View style={styles.heroGlowTwo} />
            <View style={styles.heroHeader}>
              <BrandBadge variant="inverse" size={34} />
              <Text style={styles.heroEyebrow}>Challenges</Text>
            </View>
            <Text style={styles.heroTitle}>{heroTitle}</Text>
            <Text style={styles.heroBody}>{heroBody}</Text>

            <View style={styles.heroPills}>
              <Pressable onPress={() => jumpToSection("for-you", "completed")} style={styles.heroPill}>
                <Text style={styles.heroPillValue}>{completedCount}</Text>
                <Text style={styles.heroPillLabel}>completed</Text>
              </Pressable>
              <Pressable onPress={() => jumpToSection("badges", "badges")} style={styles.heroPill}>
                <Text style={styles.heroPillValue}>{earnedCount}</Text>
                <Text style={styles.heroPillLabel}>badges</Text>
              </Pressable>
              <View style={[styles.heroPill, styles.heroPillWarm]}>
                <Text style={[styles.heroPillValue, styles.heroPillValueDark]}>{isPremium ? "Premium" : "Free"}</Text>
                <Text style={[styles.heroPillLabel, styles.heroPillValueDark]}>{isPremium ? "challenge tier" : "challenge tier"}</Text>
              </View>
            </View>
          </View>

          <View style={styles.segmentRow}>
            {SEGMENTS.map((item) => {
              const active = segment === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setSegment(item.id)}
                  style={[styles.segmentBtn, active ? styles.segmentBtnActive : null]}
                >
                  <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {loading || !challengeSnapshot ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Loading your progress…</Text>
              <Text style={styles.emptyBody}>We’re pulling in your latest walks, streaks, and badges.</Text>
            </View>
          ) : null}

          {!loading && challengeSnapshot && segment === "for-you" ? (
            <>
              <View style={styles.sectionHeader} onLayout={rememberSectionOffset("top")}>
                <Text style={styles.sectionTitle}>Premium Challenges</Text>
                <Text style={styles.sectionCaption}>Unlock guided milestones, streaks, and outdoor achievements.</Text>
              </View>

              <View style={styles.stack}>
                {activeChallenges.map((item) =>
                  item.progress ? (
                    <ChallengeProgressCard key={item.challenge.id} challenge={item.challenge} progress={item.progress} />
                  ) : null
                )}
              </View>

              <View style={styles.sectionHeader} onLayout={rememberSectionOffset("completed")}>
                <Text style={styles.sectionTitle}>Completed</Text>
                <Text style={styles.sectionCaption}>Your finished milestones stay close so you can see the rhythm you’ve already built.</Text>
              </View>

              {completedChallenges.length > 0 ? (
                <View style={styles.stack}>
                  {completedChallenges.map((item) =>
                    item.progress ? (
                      <ChallengeProgressCard key={item.challenge.id} challenge={item.challenge} progress={item.progress} />
                    ) : null
                  )}
                </View>
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>No completed challenges yet</Text>
                  <Text style={styles.emptyBody}>Your first finished challenge will show up here as soon as you cross the line.</Text>
                </View>
              )}
            </>
          ) : null}

          {!loading && challengeSnapshot && segment === "badges" ? (
            <>
              <View style={styles.sectionHeader} onLayout={rememberSectionOffset("badges")}>
                <Text style={styles.sectionTitle}>Badges</Text>
                <Text style={styles.sectionCaption}>Earned and in progress as your outdoor rhythm grows.</Text>
              </View>

              <View style={styles.subsection}>
                <Text style={styles.subsectionTitle}>Earned badges</Text>
                <Text style={styles.subsectionCaption}>The ones you’ve already unlocked through real walks, streaks, and steady momentum.</Text>
              </View>

              {earnedBadges.length > 0 ? (
                <View style={styles.badgeGrid}>
                  {earnedBadges.map((state) => (
                    <BadgeCard key={state.badge.id} state={state} />
                  ))}
                </View>
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Your first badge is close</Text>
                  <Text style={styles.emptyBody}>Earned badges will collect here once your next milestones start landing.</Text>
                </View>
              )}

              <View style={styles.subsection}>
                <Text style={styles.subsectionTitle}>In progress</Text>
                <Text style={styles.subsectionCaption}>The milestones still ahead, plus a few more badges waiting in future updates.</Text>
              </View>

              <View style={styles.badgeGrid}>
                {lockedBadges.map((state) => (
                  <BadgeCard key={state.badge.id} state={state} />
                ))}
              </View>
            </>
          ) : null}

          {!loading && challengeSnapshot && segment === "team" ? (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Team challenges</Text>
                <Text style={styles.sectionCaption}>Join your workplace team for shared progress, friendly momentum, and badges earned together.</Text>
              </View>

              {corporateLoading ? (
                <View style={styles.emptyCard}>
                  <ActivityIndicator color={PREMIUM.colors.forest} />
                  <Text style={styles.emptyTitle}>Checking team access…</Text>
                  <Text style={styles.emptyBody}>We’re looking for a company membership tied to your account.</Text>
                </View>
              ) : null}

              {!corporateLoading && !authUser ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Sign in to join a team</Text>
                  <Text style={styles.emptyBody}>
                    Company challenges and invite codes are tied to your account so progress can stay with you.
                  </Text>
                  <Pressable style={styles.inlineActionBtn} onPress={() => router.push("/profile")}>
                    <Text style={styles.inlineActionText}>Open Profile</Text>
                  </Pressable>
                </View>
              ) : null}

              {!corporateLoading && authUser && !hasCorporateMembership ? (
                <>
                  {__DEV__ ? (
                    <View style={styles.adminCard}>
                      <Text style={styles.adminEyebrow}>Developer bootstrap</Text>
                      <Text style={styles.adminTitle}>Create a sample company seed.</Text>
                      <Text style={styles.adminBody}>
                        This dev-only shortcut creates a trial company, default team, starter invite code, and starter challenge for your current account.
                      </Text>
                      <Pressable
                        style={[styles.adminActionBtn, adminBusy ? styles.adminActionBtnDisabled : null]}
                        disabled={adminBusy}
                        onPress={() => void handleCreateSampleCompany()}
                      >
                        <Text style={styles.adminActionText}>{adminBusy ? "Creating…" : "Create sample company"}</Text>
                      </Pressable>
                    </View>
                  ) : null}

                  <View style={styles.teamCard}>
                    <Text style={styles.teamEyebrow}>Join by invite code</Text>
                    <Text style={styles.teamTitle}>Connect your company or team.</Text>
                    <Text style={styles.teamBody}>
                      Enter a code from your workplace admin to unlock company membership, team challenges, and shared progress.
                    </Text>

                    <View style={styles.joinCard}>
                      <Text style={styles.joinLabel}>Invite code</Text>
                      <TextInput
                        autoCapitalize="characters"
                        autoCorrect={false}
                        editable={!joiningCompany}
                        onChangeText={(value) => {
                          setInviteCode(value);
                          if (inviteError) setInviteError(null);
                        }}
                        placeholder="ENTER CODE"
                        placeholderTextColor={alpha(PREMIUM.colors.offWhite, 0.42)}
                        style={styles.joinInput}
                        value={inviteCode}
                      />
                      {inviteError ? <Text style={styles.joinError}>{inviteError}</Text> : null}
                      <Pressable
                        style={[styles.joinBtn, joiningCompany ? styles.joinBtnDisabled : null]}
                        disabled={joiningCompany}
                        onPress={() => void handleJoinCompany()}
                      >
                        <Text style={styles.joinBtnText}>{joiningCompany ? "Joining…" : "Join team"}</Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.teamCard}>
                    <Text style={styles.teamEyebrow}>{TEAM_MVP_PREVIEW.companyName}</Text>
                    <Text style={styles.teamTitle}>{TEAM_MVP_PREVIEW.teamName}</Text>
                    <Text style={styles.teamBody}>{TEAM_MVP_PREVIEW.inviteCodeHint}</Text>

                    <View style={styles.teamChallengeCard}>
                      <Text style={styles.teamChallengeEyebrow}>Team challenge preview</Text>
                      <Text style={styles.teamChallengeTitle}>{TEAM_MVP_PREVIEW.activeChallengeTitle}</Text>
                      <Text style={styles.teamChallengeBody}>
                        Shared company challenges make daily outdoor resets feel more connected, more encouraging, and easier to keep going.
                      </Text>
                    </View>

                    <View style={styles.leaderboardCard}>
                      <Text style={styles.leaderboardTitle}>Leaderboard preview</Text>
                      {TEAM_MVP_PREVIEW.leaderboard.map((member, index) => (
                        <View key={member.id} style={styles.leaderboardRow}>
                          <Text style={styles.leaderboardRank}>{index + 1}</Text>
                          <Text style={styles.leaderboardName}>{member.name}</Text>
                          <Text style={styles.leaderboardMeta}>{member.activeDays} active days</Text>
                          <Text style={styles.leaderboardStreak}>{member.streakDays}d</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </>
              ) : null}

              {!corporateLoading && authUser && hasCorporateMembership ? (
                <View style={styles.teamCard}>
                  <Text style={styles.teamEyebrow}>{corporateSnapshot?.company?.name ?? TEAM_MVP_PREVIEW.companyName}</Text>
                  <Text style={styles.teamTitle}>{corporateSnapshot?.team?.name ?? "Default Team"}</Text>
                  <Text style={styles.teamBody}>
                    Your company membership is active. Shared challenges, badges, and team momentum live here.
                  </Text>

                  <View style={styles.membershipMetaRow}>
                    <View style={styles.membershipPill}>
                      <Text style={styles.membershipPillText}>{corporateSnapshot?.membership?.role ?? "member"}</Text>
                    </View>
                    <View style={[styles.membershipPill, styles.membershipPillWarm]}>
                      <Text style={styles.membershipPillTextDark}>
                        {corporateSnapshot?.membership?.accessSource === "hybrid" ? "Hybrid access" : "Company access"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.teamChallengeCard}>
                    <Text style={styles.teamChallengeEyebrow}>Active company challenge</Text>
                    <Text style={styles.teamChallengeTitle}>
                      {activeCorporateChallenge?.title ?? TEAM_MVP_PREVIEW.activeChallengeTitle}
                    </Text>
                    <Text style={styles.teamChallengeBody}>
                      {activeCorporateChallenge?.description ??
                        "A shared team challenge will appear here as soon as your company launches one."}
                    </Text>
                    {activeCorporateChallenge ? (
                      <View style={styles.challengeMetaRow}>
                        <View style={styles.challengeMetaPill}>
                          <Text style={styles.challengeMetaText}>
                            Goal {activeCorporateChallenge.goal} {activeCorporateChallenge.metric.replace(/_/g, " ")}
                          </Text>
                        </View>
                        {activeCorporateChallenge.progressLabel ? (
                          <View style={[styles.challengeMetaPill, styles.challengeMetaPillWarm]}>
                            <Text style={styles.challengeMetaTextDark}>{activeCorporateChallenge.progressLabel}</Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>

                  {activeCorporateChallenge && activeCorporateChallengeProgress ? (
                    <View style={styles.progressCard}>
                      <Text style={styles.progressEyebrow}>Your challenge progress</Text>
                      <Text style={styles.progressValue}>{activeCorporateChallengeProgress.percentComplete}%</Text>
                      <Text style={styles.progressLabel}>{activeCorporateChallengeProgress.supportingLabel}</Text>
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            { width: `${Math.max(6, Math.min(100, activeCorporateChallengeProgress.percentComplete))}%` },
                          ]}
                        />
                      </View>
                    </View>
                  ) : activeCorporateChallenge ? (
                    <View style={styles.progressCard}>
                      <Text style={styles.progressEyebrow}>Your challenge progress</Text>
                      <Text style={styles.progressValue}>Ready to start</Text>
                      <Text style={styles.progressLabel}>Your next completed walk will begin syncing this company challenge.</Text>
                    </View>
                  ) : null}

                  {activeCorporateChallenge && activeCorporateChallengeAggregate ? (
                    <View style={styles.aggregateCard}>
                      <Text style={styles.aggregateEyebrow}>Team participation</Text>
                      <Text style={styles.aggregateTitle}>
                        {activeCorporateChallengeAggregate.completedCount} of {activeCorporateChallengeAggregate.participantCount} complete
                      </Text>
                      <Text style={styles.aggregateBody}>
                        Average progress is {activeCorporateChallengeAggregate.averagePercentComplete}%, with the current top progress at{" "}
                        {activeCorporateChallengeAggregate.topPercentComplete}%.
                      </Text>
                      <View style={styles.aggregateStatRow}>
                        <View style={styles.aggregateStatPill}>
                          <Text style={styles.aggregateStatValue}>{activeCorporateChallengeAggregate.participantCount}</Text>
                          <Text style={styles.aggregateStatLabel}>participants</Text>
                        </View>
                        <View style={styles.aggregateStatPill}>
                          <Text style={styles.aggregateStatValue}>{activeCorporateChallengeAggregate.completedCount}</Text>
                          <Text style={styles.aggregateStatLabel}>finished</Text>
                        </View>
                        <View style={[styles.aggregateStatPill, styles.aggregateStatPillWarm]}>
                          <Text style={styles.aggregateStatValueDark}>{activeCorporateChallengeAggregate.averagePercentComplete}%</Text>
                          <Text style={styles.aggregateStatLabelDark}>avg progress</Text>
                        </View>
                      </View>
                    </View>
                  ) : activeCorporateChallenge ? (
                    <View style={styles.aggregateCard}>
                      <Text style={styles.aggregateEyebrow}>Team participation</Text>
                      <Text style={styles.aggregateTitle}>You’re first on the board.</Text>
                      <Text style={styles.aggregateBody}>
                        Once teammates join and complete walks, this challenge will show shared completion and participation momentum here.
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.leaderboardCard}>
                    <Text style={styles.leaderboardTitle}>
                      {corporateSnapshot?.leaderboard.length ? "Team leaderboard" : "Leaderboard preview"}
                    </Text>
                    {leaderboardRows.map((member, index) => (
                      <View key={member.id} style={styles.leaderboardRow}>
                        <Text style={styles.leaderboardRank}>{index + 1}</Text>
                        <Text style={styles.leaderboardName}>{member.name}</Text>
                        <Text style={styles.leaderboardMeta}>{member.activeDays} active days</Text>
                        <Text style={styles.leaderboardStreak}>{member.streakDays}d</Text>
                      </View>
                    ))}
                  </View>

                  {isCompanyAdmin ? (
                    <>
                      <View style={styles.adminCard}>
                        <Text style={styles.adminEyebrow}>Admin tools</Text>
                        <Text style={styles.adminTitle}>Invite and launch with less friction.</Text>
                        <Text style={styles.adminBody}>
                          Use these simple tools to invite teammates and launch your first shared challenge.
                        </Text>

                        {latestAdminInviteCode ? (
                          <View style={styles.adminCodePill}>
                            <Text style={styles.adminCodeLabel}>Latest invite code</Text>
                            <Text style={styles.adminCodeValue}>{latestAdminInviteCode}</Text>
                          </View>
                        ) : null}

                        <View style={styles.adminActionRow}>
                          <Pressable
                            style={[styles.adminActionBtn, adminBusy ? styles.adminActionBtnDisabled : null]}
                            disabled={adminBusy}
                            onPress={() => void handleCreateInviteCode()}
                          >
                            <Text style={styles.adminActionText}>{adminBusy ? "Working…" : "Create invite code"}</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.adminActionBtn, styles.adminActionBtnWarm, adminBusy ? styles.adminActionBtnDisabled : null]}
                            disabled={adminBusy}
                            onPress={() => void handleCreateStarterChallenge()}
                          >
                            <Text style={styles.adminActionTextDark}>
                              {adminBusy ? "Working…" : activeCorporateChallenge ? "Create another challenge" : "Seed starter challenge"}
                            </Text>
                          </Pressable>
                        </View>
                      </View>

                      {adminDashboard ? (
                        <View style={styles.dashboardCard}>
                          <Text style={styles.dashboardEyebrow}>Admin dashboard</Text>
                          <Text style={styles.dashboardTitle}>Optimize Local overview</Text>
                          <Text style={styles.dashboardBody}>
                            This dashboard tracks member activations and in-app usage from company data. True App Store download counts still need store analytics outside the app.
                          </Text>

                          <View style={styles.dashboardGrid}>
                            <View style={styles.dashboardStat}>
                              <Text style={styles.dashboardStatValue}>{adminDashboard.memberCount}</Text>
                              <Text style={styles.dashboardStatLabel}>company accounts</Text>
                            </View>
                            <View style={styles.dashboardStat}>
                              <Text style={styles.dashboardStatValue}>{adminDashboard.activeMembersThisWeek}</Text>
                              <Text style={styles.dashboardStatLabel}>active this week</Text>
                            </View>
                            <View style={styles.dashboardStat}>
                              <Text style={styles.dashboardStatValue}>{adminDashboard.totalSessions}</Text>
                              <Text style={styles.dashboardStatLabel}>total sessions</Text>
                            </View>
                            <View style={styles.dashboardStat}>
                              <Text style={styles.dashboardStatValue}>{adminDashboard.totalMinutes}</Text>
                              <Text style={styles.dashboardStatLabel}>total minutes</Text>
                            </View>
                          </View>

                          <View style={styles.dashboardCallout}>
                            <Text style={styles.dashboardCalloutLabel}>Average time per member</Text>
                            <Text style={styles.dashboardCalloutValue}>{adminDashboard.averageMinutesPerMember} min</Text>
                          </View>

                          <View style={styles.dashboardMemberList}>
                            <Text style={styles.dashboardMemberTitle}>Individual member activity</Text>
                            {leaderboardRows.map((member, index) => (
                              <View key={member.id} style={styles.dashboardMemberRow}>
                                <Text style={styles.dashboardMemberRank}>{index + 1}</Text>
                                <Text style={styles.dashboardMemberName}>{member.name}</Text>
                                <Text style={styles.dashboardMemberMeta}>{member.activeDays} active days</Text>
                                <Text style={styles.dashboardMemberMeta}>{member.streakDays}d streak</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      ) : null}
                    </>
                  ) : null}
                </View>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: PREMIUM.colors.cream,
  },
  page: {
    flex: 1,
    backgroundColor: PREMIUM.colors.cream,
  },
  scroll: {
    paddingHorizontal: PREMIUM.spacing.screen,
    paddingTop: 16,
    paddingBottom: 140,
    gap: 22,
  },
  heroCard: {
    backgroundColor: PREMIUM.colors.forest,
    borderRadius: PREMIUM.radius.hero,
    padding: 24,
    overflow: "hidden",
    gap: 12,
    ...PREMIUM.shadow.hero,
  },
  heroGlowOne: {
    position: "absolute",
    top: -36,
    right: -28,
    width: 168,
    height: 168,
    borderRadius: 999,
    backgroundColor: "rgba(242,181,65,0.18)",
  },
  heroGlowTwo: {
    position: "absolute",
    bottom: -30,
    left: -18,
    width: 126,
    height: 126,
    borderRadius: 999,
    backgroundColor: "rgba(248,244,238,0.09)",
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  heroEyebrow: {
    color: "rgba(248,244,238,0.72)",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: PREMIUM.colors.offWhite,
    fontSize: 36,
    lineHeight: 42,
    fontWeight: "700",
    fontFamily: PREMIUM.type.serifFamily,
  },
  heroBody: {
    color: alpha(PREMIUM.colors.offWhite, 0.78),
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
  },
  heroPills: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 4,
  },
  heroPill: {
    minWidth: 92,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: "rgba(248,244,238,0.12)",
  },
  heroPillWarm: {
    backgroundColor: BRAND.sunrise,
  },
  heroPillValue: {
    color: BRAND.bone,
    fontSize: 20,
    fontWeight: "900",
  },
  heroPillValueDark: {
    color: BRAND.charcoal,
  },
  heroPillLabel: {
    color: "rgba(248,244,238,0.72)",
    fontSize: 12,
    fontWeight: "800",
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
  },
  segmentBtn: {
    flex: 1,
    borderRadius: PREMIUM.radius.pill,
    paddingVertical: 14,
    backgroundColor: alpha(PREMIUM.colors.forest, 0.08),
    alignItems: "center",
  },
  segmentBtnActive: {
    backgroundColor: BRAND.forest,
  },
  segmentText: {
    color: BRAND.forest,
    fontSize: 13,
    fontWeight: "800",
  },
  segmentTextActive: {
    color: BRAND.bone,
  },
  sectionHeader: {
    gap: 4,
    marginTop: 4,
  },
  sectionTitle: {
    color: PREMIUM.colors.text,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "700",
    fontFamily: PREMIUM.type.serifFamily,
  },
  sectionCaption: {
    color: PREMIUM.colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
  },
  stack: {
    gap: 14,
  },
  infoCard: {
    borderRadius: 26,
    backgroundColor: "rgba(242,181,65,0.92)",
    padding: 18,
    gap: 8,
  },
  infoEyebrow: {
    color: "rgba(11,15,14,0.7)",
    fontSize: 11,
    textTransform: "uppercase",
    fontWeight: "900",
    letterSpacing: 1,
  },
  infoTitle: {
    color: BRAND.charcoal,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "900",
  },
  infoBody: {
    color: "rgba(11,15,14,0.76)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  badgeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  subsection: {
    gap: 4,
    marginTop: 4,
  },
  subsectionTitle: {
    color: PREMIUM.colors.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
    fontFamily: PREMIUM.type.serifFamily,
  },
  subsectionCaption: {
    color: PREMIUM.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  teamCard: {
    borderRadius: PREMIUM.radius.hero,
    backgroundColor: PREMIUM.colors.forest,
    padding: 22,
    gap: 16,
    ...PREMIUM.shadow.card,
  },
  teamEyebrow: {
    color: "rgba(248,244,238,0.7)",
    fontSize: 11,
    textTransform: "uppercase",
    fontWeight: "900",
    letterSpacing: 1,
  },
  teamTitle: {
    color: BRAND.bone,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "900",
  },
  teamBody: {
    color: "rgba(248,244,238,0.78)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  teamChallengeCard: {
    borderRadius: 22,
    backgroundColor: "rgba(248,244,238,0.08)",
    padding: 16,
    gap: 6,
  },
  joinCard: {
    borderRadius: 22,
    backgroundColor: "rgba(248,244,238,0.08)",
    padding: 16,
    gap: 10,
  },
  joinLabel: {
    color: "rgba(248,244,238,0.72)",
    fontSize: 11,
    textTransform: "uppercase",
    fontWeight: "900",
    letterSpacing: 1,
  },
  joinInput: {
    borderRadius: 18,
    backgroundColor: "rgba(248,244,238,0.12)",
    borderWidth: 1,
    borderColor: "rgba(248,244,238,0.14)",
    color: BRAND.bone,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  joinError: {
    color: "#FFD6D6",
    fontSize: 13,
    fontWeight: "700",
  },
  joinBtn: {
    borderRadius: PREMIUM.radius.pill,
    backgroundColor: PREMIUM.colors.gold,
    alignItems: "center",
    paddingVertical: 14,
  },
  joinBtnDisabled: {
    opacity: 0.72,
  },
  joinBtnText: {
    color: PREMIUM.colors.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  teamChallengeEyebrow: {
    color: BRAND.sunrise,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  teamChallengeTitle: {
    color: PREMIUM.colors.offWhite,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
    fontFamily: PREMIUM.type.serifFamily,
  },
  teamChallengeBody: {
    color: "rgba(248,244,238,0.74)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  challengeMetaRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 6,
  },
  challengeMetaPill: {
    borderRadius: 999,
    backgroundColor: "rgba(248,244,238,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  challengeMetaPillWarm: {
    backgroundColor: BRAND.sunrise,
  },
  challengeMetaText: {
    color: BRAND.bone,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  challengeMetaTextDark: {
    color: BRAND.charcoal,
    fontSize: 12,
    fontWeight: "900",
  },
  progressCard: {
    borderRadius: 22,
    backgroundColor: "rgba(248,244,238,0.08)",
    padding: 16,
    gap: 8,
  },
  progressEyebrow: {
    color: BRAND.sunrise,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  progressValue: {
    color: BRAND.bone,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "900",
  },
  progressLabel: {
    color: "rgba(248,244,238,0.76)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(248,244,238,0.12)",
    overflow: "hidden",
    marginTop: 4,
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: BRAND.sunrise,
  },
  aggregateCard: {
    borderRadius: PREMIUM.radius.lg,
    backgroundColor: alpha(PREMIUM.colors.gold, 0.96),
    padding: 18,
    gap: 8,
  },
  aggregateEyebrow: {
    color: "rgba(11,15,14,0.72)",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  aggregateTitle: {
    color: PREMIUM.colors.ink,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
    fontFamily: PREMIUM.type.serifFamily,
  },
  aggregateBody: {
    color: "rgba(11,15,14,0.78)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  aggregateStatRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 4,
  },
  aggregateStatPill: {
    minWidth: 92,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.28)",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  aggregateStatPillWarm: {
    backgroundColor: BRAND.forest,
  },
  aggregateStatValue: {
    color: BRAND.charcoal,
    fontSize: 18,
    fontWeight: "900",
  },
  aggregateStatValueDark: {
    color: BRAND.bone,
    fontSize: 18,
    fontWeight: "900",
  },
  aggregateStatLabel: {
    color: "rgba(11,15,14,0.66)",
    fontSize: 11,
    fontWeight: "800",
  },
  aggregateStatLabelDark: {
    color: "rgba(248,244,238,0.72)",
    fontSize: 11,
    fontWeight: "800",
  },
  adminCard: {
    borderRadius: PREMIUM.radius.lg,
    backgroundColor: alpha(PREMIUM.colors.offWhite, 0.08),
    padding: 18,
    gap: 10,
  },
  adminEyebrow: {
    color: BRAND.sunrise,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  adminTitle: {
    color: PREMIUM.colors.offWhite,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
    fontFamily: PREMIUM.type.serifFamily,
  },
  adminBody: {
    color: "rgba(248,244,238,0.76)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  adminCodePill: {
    alignSelf: "flex-start",
    borderRadius: 18,
    backgroundColor: "rgba(248,244,238,0.12)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  adminCodeLabel: {
    color: "rgba(248,244,238,0.64)",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  adminCodeValue: {
    color: BRAND.bone,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1,
  },
  adminActionRow: {
    gap: 10,
  },
  adminActionBtn: {
    borderRadius: 18,
    backgroundColor: BRAND.forest,
    borderWidth: 1,
    borderColor: "rgba(248,244,238,0.12)",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  adminActionBtnWarm: {
    backgroundColor: BRAND.sunrise,
    borderColor: "rgba(242,181,65,0.82)",
  },
  adminActionBtnDisabled: {
    opacity: 0.7,
  },
  adminActionText: {
    color: BRAND.bone,
    fontSize: 14,
    fontWeight: "900",
  },
  adminActionTextDark: {
    color: BRAND.charcoal,
    fontSize: 14,
    fontWeight: "900",
  },
  dashboardCard: {
    borderRadius: PREMIUM.radius.lg,
    backgroundColor: alpha(PREMIUM.colors.offWhite, 0.10),
    padding: 18,
    gap: 10,
  },
  dashboardEyebrow: {
    color: BRAND.sunrise,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  dashboardTitle: {
    color: PREMIUM.colors.offWhite,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
    fontFamily: PREMIUM.type.serifFamily,
  },
  dashboardBody: {
    color: "rgba(248,244,238,0.76)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  dashboardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  dashboardStat: {
    minWidth: 120,
    flex: 1,
    borderRadius: 18,
    backgroundColor: "rgba(248,244,238,0.12)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 2,
  },
  dashboardStatValue: {
    color: BRAND.bone,
    fontSize: 20,
    fontWeight: "900",
  },
  dashboardStatLabel: {
    color: "rgba(248,244,238,0.68)",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  dashboardCallout: {
    borderRadius: 18,
    backgroundColor: BRAND.sunrise,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 2,
  },
  dashboardCalloutLabel: {
    color: "rgba(11,15,14,0.72)",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  dashboardCalloutValue: {
    color: BRAND.charcoal,
    fontSize: 20,
    fontWeight: "900",
  },
  dashboardMemberList: {
    gap: 8,
  },
  dashboardMemberTitle: {
    color: BRAND.bone,
    fontSize: 16,
    fontWeight: "900",
  },
  dashboardMemberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dashboardMemberRank: {
    width: 20,
    color: BRAND.sunrise,
    fontWeight: "900",
  },
  dashboardMemberName: {
    flex: 1,
    color: BRAND.bone,
    fontWeight: "800",
  },
  dashboardMemberMeta: {
    color: "rgba(248,244,238,0.72)",
    fontSize: 12,
    fontWeight: "700",
  },
  leaderboardCard: {
    borderRadius: PREMIUM.radius.lg,
    backgroundColor: PREMIUM.colors.gold,
    padding: 18,
    gap: 10,
  },
  membershipMetaRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  membershipPill: {
    borderRadius: 999,
    backgroundColor: "rgba(248,244,238,0.12)",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  membershipPillWarm: {
    backgroundColor: BRAND.sunrise,
  },
  membershipPillText: {
    color: BRAND.bone,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "capitalize",
  },
  membershipPillTextDark: {
    color: BRAND.charcoal,
    fontSize: 12,
    fontWeight: "900",
  },
  leaderboardTitle: {
    color: PREMIUM.colors.ink,
    fontSize: 22,
    fontWeight: "700",
    fontFamily: PREMIUM.type.serifFamily,
  },
  leaderboardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  leaderboardRank: {
    width: 20,
    color: BRAND.charcoal,
    fontWeight: "900",
  },
  leaderboardName: {
    flex: 1,
    color: BRAND.charcoal,
    fontWeight: "800",
  },
  leaderboardMeta: {
    color: "rgba(11,15,14,0.68)",
    fontWeight: "700",
    fontSize: 12,
  },
  leaderboardStreak: {
    color: BRAND.charcoal,
    fontWeight: "900",
  },
  emptyCard: {
    borderRadius: PREMIUM.radius.xl,
    borderWidth: 1,
    borderColor: PREMIUM.colors.line,
    backgroundColor: PREMIUM.colors.creamSoft,
    padding: 18,
    gap: 8,
    ...PREMIUM.shadow.soft,
  },
  emptyTitle: {
    color: PREMIUM.colors.text,
    fontSize: 24,
    fontWeight: "700",
    fontFamily: PREMIUM.type.serifFamily,
  },
  emptyBody: {
    color: PREMIUM.colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
  },
  inlineActionBtn: {
    alignSelf: "flex-start",
    marginTop: 4,
    borderRadius: PREMIUM.radius.pill,
    backgroundColor: PREMIUM.colors.forest,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inlineActionText: {
    color: PREMIUM.colors.offWhite,
    fontSize: 14,
    fontWeight: "900",
  },
});
