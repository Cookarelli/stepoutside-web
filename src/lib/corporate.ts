import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
} from "firebase/firestore";

import type { AuthUserSnapshot } from "./auth";
import { formatMetricSupportingLabel, metricProgressValue } from "./challenges/evaluate";
import { auth, db } from "./firebase";
import type {
  CompanyAdminDashboard,
  CompanyChallengeAggregate,
  ChallengeMetric,
  CompanyChallengeInstance,
  CompanyChallengeProgress,
  CompanyLeaderboardEntry,
  CompanyDefinition,
  CompanyMembership,
  InviteCodeDefinition,
  TeamDefinition,
  TeamPreviewMember,
} from "./challenges/types";
import type { OutsideSession, SummaryStats } from "./store";

export type InviteCodeRecord = InviteCodeDefinition;

export type CorporateMembershipSnapshot = {
  membership: CompanyMembership | null;
  company: CompanyDefinition | null;
  team: TeamDefinition | null;
  leaderboard: TeamPreviewMember[];
  activeChallenge: CompanyChallengeInstance | null;
  activeChallengeProgress: CompanyChallengeProgress | null;
  activeChallengeAggregate: CompanyChallengeAggregate | null;
  adminDashboard: CompanyAdminDashboard | null;
};

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function normalizeInviteCode(code: string): string {
  return code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().trim();
}

function normalizeCompanyDefinition(id: string, value: unknown): CompanyDefinition | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CompanyDefinition>;
  const premiumAccessMode =
    candidate.premiumAccessMode === "company_paid" ||
    candidate.premiumAccessMode === "bring_your_own_premium" ||
    candidate.premiumAccessMode === "hybrid"
      ? candidate.premiumAccessMode
      : "company_paid";

  return {
    id,
    name: normalizeString(candidate.name) ?? "Step Outside Company",
    slug: normalizeString(candidate.slug) ?? id,
    status:
      candidate.status === "trial" || candidate.status === "active" || candidate.status === "paused"
        ? candidate.status
        : "trial",
    premiumAccessMode,
    adminUids: Array.isArray(candidate.adminUids)
      ? candidate.adminUids.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function normalizeTeamDefinition(companyId: string, id: string, value: unknown): TeamDefinition | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<TeamDefinition>;
  return {
    id,
    companyId,
    name: normalizeString(candidate.name) ?? "Main Team",
    inviteCodeHint: normalizeString(candidate.inviteCodeHint),
    memberCount: toFiniteNumber(candidate.memberCount),
  };
}

function normalizeMembership(value: unknown): CompanyMembership | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CompanyMembership>;
  if (typeof candidate.uid !== "string" || typeof candidate.companyId !== "string") return null;

  return {
    uid: candidate.uid,
    companyId: candidate.companyId,
    teamId: normalizeString(candidate.teamId),
    role:
      candidate.role === "member" || candidate.role === "manager" || candidate.role === "admin"
        ? candidate.role
        : "member",
    joinedAt: toFiniteNumber(candidate.joinedAt) ?? Date.now(),
    accessSource:
      candidate.accessSource === "company_plan" ||
      candidate.accessSource === "hybrid" ||
      candidate.accessSource === "trial"
        ? candidate.accessSource
        : "company_plan",
  };
}

function normalizeLeaderboardMember(id: string, value: unknown): CompanyLeaderboardEntry | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CompanyLeaderboardEntry> & { displayName?: string; email?: string };

  return {
    uid: id,
    name: normalizeString(candidate.name) ?? normalizeString(candidate.displayName) ?? normalizeString(candidate.email) ?? "Member",
    role:
      candidate.role === "member" || candidate.role === "manager" || candidate.role === "admin"
        ? candidate.role
        : "member",
    streakDays: toFiniteNumber(candidate.streakDays) ?? 0,
    activeDays: toFiniteNumber(candidate.activeDays) ?? 0,
    joinedAt: toFiniteNumber(candidate.joinedAt) ?? 0,
    totalSessions: toFiniteNumber((candidate as { totalSessions?: number }).totalSessions) ?? 0,
    totalMinutes: toFiniteNumber((candidate as { totalMinutes?: number }).totalMinutes) ?? 0,
    totalDistanceM: toFiniteNumber((candidate as { totalDistanceM?: number }).totalDistanceM) ?? 0,
  };
}

function normalizeInviteRecord(id: string, companyIdFromPath: string, value: unknown): InviteCodeRecord | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<InviteCodeRecord>;
  const normalizedCode = normalizeString(candidate.normalizedCode);
  if (!normalizedCode) return null;

  return {
    id,
    normalizedCode,
    companyId: normalizeString(candidate.companyId) ?? companyIdFromPath,
    companyName: normalizeString(candidate.companyName),
    teamId: normalizeString(candidate.teamId) ?? null,
    teamName: normalizeString(candidate.teamName) ?? null,
    status:
      candidate.status === "active" || candidate.status === "paused" || candidate.status === "expired"
        ? candidate.status
        : "active",
    expiresAt: toFiniteNumber(candidate.expiresAt) ?? null,
  };
}

function normalizeChallengeMetric(value: unknown): ChallengeMetric {
  switch (value) {
    case "minutes":
    case "distance_m":
    case "days_completed":
    case "sunrise_sessions":
    case "sunset_sessions":
    case "weekend_sessions":
    case "hike_sessions":
    case "current_streak_days":
      return value;
    default:
      return "sessions";
  }
}

function normalizeChallengeProgress(value: unknown): CompanyChallengeProgress | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CompanyChallengeProgress>;
  if (
    typeof candidate.instanceId !== "string" ||
    typeof candidate.companyId !== "string" ||
    typeof candidate.uid !== "string"
  ) {
    return null;
  }

  return {
    instanceId: candidate.instanceId,
    companyId: candidate.companyId,
    uid: candidate.uid,
    teamId: normalizeString(candidate.teamId),
    status:
      candidate.status === "active" ||
      candidate.status === "completed" ||
      candidate.status === "locked" ||
      candidate.status === "upcoming"
        ? candidate.status
        : "active",
    metric: normalizeChallengeMetric(candidate.metric),
    progressValue: toFiniteNumber(candidate.progressValue) ?? 0,
    goalValue: toFiniteNumber(candidate.goalValue) ?? 0,
    percentComplete: toFiniteNumber(candidate.percentComplete) ?? 0,
    supportingLabel: normalizeString(candidate.supportingLabel) ?? "",
    updatedAt: toFiniteNumber(candidate.updatedAt) ?? 0,
  };
}

function normalizeCompanyChallengeInstance(
  id: string,
  companyId: string,
  value: unknown
): CompanyChallengeInstance | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CompanyChallengeInstance>;

  return {
    id,
    companyId,
    teamId: normalizeString(candidate.teamId),
    templateId: normalizeString(candidate.templateId),
    title: normalizeString(candidate.title) ?? "Company challenge",
    description:
      normalizeString(candidate.description) ?? "A shared challenge to keep team momentum gentle and real.",
    metric: normalizeChallengeMetric(candidate.metric),
    goal: toFiniteNumber(candidate.goal) ?? 1,
    progressLabel: normalizeString(candidate.progressLabel),
    startsAt: toFiniteNumber(candidate.startsAt) ?? Date.now(),
    endsAt: toFiniteNumber(candidate.endsAt),
    status:
      candidate.status === "draft" ||
      candidate.status === "active" ||
      candidate.status === "completed" ||
      candidate.status === "archived"
        ? candidate.status
        : "active",
    rewardId: normalizeString(candidate.rewardId),
  };
}

function toPreviewMember(entry: CompanyLeaderboardEntry): TeamPreviewMember {
  return {
    id: entry.uid,
    name: entry.name,
    streakDays: entry.streakDays,
    activeDays: entry.activeDays,
  };
}

function companyChallengeProgressDocId(instanceId: string, uid: string): string {
  return `${instanceId}__${uid}`;
}

function buildChallengeAggregate(
  instanceId: string,
  rows: CompanyChallengeProgress[]
): CompanyChallengeAggregate | null {
  if (rows.length === 0) return null;

  const participantCount = rows.length;
  const completedCount = rows.filter((row) => row.status === "completed").length;
  const averagePercentComplete = Math.round(
    rows.reduce((total, row) => total + row.percentComplete, 0) / participantCount
  );
  const topPercentComplete = rows.reduce((top, row) => Math.max(top, row.percentComplete), 0);

  return {
    instanceId,
    participantCount,
    completedCount,
    averagePercentComplete,
    topPercentComplete,
  };
}

function buildAdminDashboard(rows: CompanyLeaderboardEntry[]): CompanyAdminDashboard | null {
  if (rows.length === 0) return null;

  const memberCount = rows.length;
  const activeMembersThisWeek = rows.filter((row) => row.activeDays > 0).length;
  const totalSessions = rows.reduce((sum, row) => sum + (row.totalSessions ?? 0), 0);
  const totalMinutes = rows.reduce((sum, row) => sum + (row.totalMinutes ?? 0), 0);
  const totalDistanceM = rows.reduce((sum, row) => sum + (row.totalDistanceM ?? 0), 0);

  return {
    memberCount,
    activeMembersThisWeek,
    totalSessions,
    totalMinutes,
    totalDistanceM,
    averageMinutesPerMember: Math.round(totalMinutes / Math.max(1, memberCount)),
  };
}

function sessionsForCompanyChallenge(
  sessions: OutsideSession[],
  challenge: CompanyChallengeInstance,
  now = new Date()
): OutsideSession[] {
  const start = challenge.startsAt;
  const end = typeof challenge.endsAt === "number" ? challenge.endsAt : now.getTime();
  return sessions.filter((session) => session.endedAt >= start && session.endedAt <= end);
}

function evaluateCompanyChallengeProgress(input: {
  challenge: CompanyChallengeInstance;
  membership: CompanyMembership;
  uid: string;
  sessions: OutsideSession[];
  summary: SummaryStats;
  now?: Date;
}): CompanyChallengeProgress {
  const now = input.now ?? new Date();
  const scopedSessions = sessionsForCompanyChallenge(input.sessions, input.challenge, now);
  const progressValue = metricProgressValue(input.challenge.metric, scopedSessions, input.summary);
  const percentComplete = Math.max(0, Math.min(100, Math.round((progressValue / input.challenge.goal) * 100)));

  return {
    instanceId: input.challenge.id,
    companyId: input.membership.companyId,
    uid: input.uid,
    teamId: input.membership.teamId,
    status: progressValue >= input.challenge.goal ? "completed" : "active",
    metric: input.challenge.metric,
    progressValue,
    goalValue: input.challenge.goal,
    percentComplete,
    supportingLabel: formatMetricSupportingLabel(input.challenge.metric, progressValue, input.challenge.goal),
    updatedAt: now.getTime(),
  };
}

export async function getCorporateMembershipSnapshot(): Promise<CorporateMembershipSnapshot> {
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) {
    return {
      membership: null,
      company: null,
      team: null,
      leaderboard: [],
      activeChallenge: null,
      activeChallengeProgress: null,
      activeChallengeAggregate: null,
      adminDashboard: null,
    };
  }

  const membershipDocs = await getDocs(collection(db, "users", currentUser.uid, "memberships"));
  const membership = membershipDocs.docs
    .map((entry) => normalizeMembership(entry.data()))
    .find((item): item is CompanyMembership => item !== null) ?? null;

  if (!membership) {
    return {
      membership: null,
      company: null,
      team: null,
      leaderboard: [],
      activeChallenge: null,
      activeChallengeProgress: null,
      activeChallengeAggregate: null,
      adminDashboard: null,
    };
  }

  const [companySnapshot, teamSnapshot, membersSnapshot, challengeSnapshots] = await Promise.all([
    getDoc(doc(db, "companies", membership.companyId)),
    membership.teamId ? getDoc(doc(db, "companies", membership.companyId, "teams", membership.teamId)) : Promise.resolve(null),
    getDocs(collection(db, "companies", membership.companyId, "members")),
    getDocs(collection(db, "companies", membership.companyId, "challengeInstances")),
  ]);

  const company = companySnapshot.exists()
    ? normalizeCompanyDefinition(companySnapshot.id, companySnapshot.data())
    : null;

  const team =
    membership.teamId && teamSnapshot && "exists" in teamSnapshot && teamSnapshot.exists()
      ? normalizeTeamDefinition(membership.companyId, membership.teamId, teamSnapshot.data())
      : null;

  const memberRows = membersSnapshot.docs
    .map((entry) => normalizeLeaderboardMember(entry.id, entry.data()))
    .filter((item): item is CompanyLeaderboardEntry => item !== null)
    .sort((a, b) => {
      if (b.activeDays !== a.activeDays) return b.activeDays - a.activeDays;
      return b.streakDays - a.streakDays;
    });

  const leaderboard = memberRows
    .sort((a, b) => {
      if (b.activeDays !== a.activeDays) return b.activeDays - a.activeDays;
      return b.streakDays - a.streakDays;
    })
    .slice(0, 5)
    .map(toPreviewMember);
  const adminDashboard = buildAdminDashboard(memberRows);

  const activeChallenge =
    challengeSnapshots.docs
      .map((entry) => normalizeCompanyChallengeInstance(entry.id, membership.companyId, entry.data()))
      .filter((item): item is CompanyChallengeInstance => item !== null)
      .sort((a, b) => {
        const aPriority = a.status === "active" ? 0 : a.status === "completed" ? 1 : 2;
        const bPriority = b.status === "active" ? 0 : b.status === "completed" ? 1 : 2;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return b.startsAt - a.startsAt;
      })[0] ?? null;

  const activeChallengeProgressDocs = activeChallenge
    ? await getDocs(collection(db, "companies", membership.companyId, "challengeProgress"))
    : null;

  const activeChallengeProgressRows = activeChallenge
    ? (activeChallengeProgressDocs?.docs
        .map((entry) => normalizeChallengeProgress(entry.data()))
        .filter((item): item is CompanyChallengeProgress => item !== null)
        .filter((item) => item.instanceId === activeChallenge.id) ?? [])
    : [];

  const activeChallengeProgress =
    activeChallengeProgressRows.find((item) => item.uid === currentUser.uid) ?? null;
  const activeChallengeAggregate = activeChallenge
    ? buildChallengeAggregate(activeChallenge.id, activeChallengeProgressRows)
    : null;

  return {
    membership,
    company,
    team,
    leaderboard,
    activeChallenge,
    activeChallengeProgress,
    activeChallengeAggregate,
    adminDashboard,
  };
}

export async function joinCompanyWithInviteCode(code: string, cachedUser?: AuthUserSnapshot | null) {
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) {
    throw new Error("Sign in to join a company.");
  }

  const normalizedCode = normalizeInviteCode(code);
  if (!normalizedCode) {
    throw new Error("Enter a valid invite code.");
  }

  const inviteQuery = query(
    collectionGroup(db, "inviteCodes"),
    where("normalizedCode", "==", normalizedCode),
    where("status", "==", "active"),
    limit(1)
  );

  const inviteSnapshot = await getDocs(inviteQuery);
  const inviteDoc = inviteSnapshot.docs[0];
  if (!inviteDoc) {
    throw new Error("That invite code wasn’t found.");
  }

  const companyIdFromPath = inviteDoc.ref.parent.parent?.id;
  if (!companyIdFromPath) {
    throw new Error("That invite code is misconfigured.");
  }

  const invite = normalizeInviteRecord(inviteDoc.id, companyIdFromPath, inviteDoc.data());
  if (!invite) {
    throw new Error("That invite code is incomplete.");
  }

  if (invite.expiresAt && invite.expiresAt < Date.now()) {
    throw new Error("That invite code has expired.");
  }

  const companySnapshot = await getDoc(doc(db, "companies", invite.companyId));
  if (!companySnapshot.exists()) {
    throw new Error("That company isn’t available yet.");
  }

  const company = normalizeCompanyDefinition(companySnapshot.id, companySnapshot.data());
  if (!company) {
    throw new Error("That company record is incomplete.");
  }

  const joinedAt = Date.now();
  const membership: CompanyMembership = {
    uid: currentUser.uid,
    companyId: company.id,
    teamId: invite.teamId ?? undefined,
    role: "member",
    joinedAt,
    accessSource: company.premiumAccessMode === "hybrid" ? "hybrid" : "company_plan",
  };

  await Promise.all([
    setDoc(doc(db, "users", currentUser.uid, "memberships", company.id), membership, { merge: true }),
    setDoc(
      doc(db, "companies", company.id, "members", currentUser.uid),
      {
        uid: currentUser.uid,
        companyId: company.id,
        teamId: invite.teamId ?? null,
        role: "member",
        joinedAt,
        name:
          normalizeString(cachedUser?.displayName) ??
          normalizeString(currentUser.displayName) ??
          normalizeString(cachedUser?.email) ??
          normalizeString(currentUser.email) ??
          "Member",
        email: normalizeString(cachedUser?.email) ?? normalizeString(currentUser.email) ?? null,
        streakDays: 0,
        activeDays: 0,
      },
      { merge: true }
    ),
  ]);

  return getCorporateMembershipSnapshot();
}

function computeTotalDistanceMeters(sessions: OutsideSession[]): number {
  return sessions.reduce((total, session) => {
    const distance = typeof session.distanceM === "number" && Number.isFinite(session.distanceM) ? session.distanceM : 0;
    return total + Math.max(0, distance);
  }, 0);
}

export async function syncCorporateMemberStatsFromWalk(input: {
  summary: SummaryStats;
  sessions: OutsideSession[];
  cachedUser?: AuthUserSnapshot | null;
}): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) return;

  const membershipSnapshot = await getCorporateMembershipSnapshot();
  if (!membershipSnapshot.membership?.companyId) return;

  const membership = membershipSnapshot.membership;
  const totalDistanceMeters = computeTotalDistanceMeters(input.sessions);

  await setDoc(
    doc(db, "companies", membership.companyId, "members", currentUser.uid),
    {
      uid: currentUser.uid,
      companyId: membership.companyId,
      teamId: membership.teamId ?? null,
      role: membership.role,
      joinedAt: membership.joinedAt,
      name:
        normalizeString(input.cachedUser?.displayName) ??
        normalizeString(currentUser.displayName) ??
        normalizeString(input.cachedUser?.email) ??
        normalizeString(currentUser.email) ??
        "Member",
      email: normalizeString(input.cachedUser?.email) ?? normalizeString(currentUser.email) ?? null,
      streakDays: input.summary.currentStreakDays,
      activeDays: input.summary.activeDaysThisWeek,
      totalSessions: input.summary.totalSessions,
      totalMinutes: input.summary.totalMinutes,
      totalDistanceM: Math.round(totalDistanceMeters),
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

export async function syncCorporateChallengeProgressFromWalk(input: {
  summary: SummaryStats;
  sessions: OutsideSession[];
  now?: Date;
}): Promise<CompanyChallengeProgress | null> {
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) return null;

  const membershipSnapshot = await getCorporateMembershipSnapshot();
  if (!membershipSnapshot.membership || !membershipSnapshot.activeChallenge) return null;

  const progress = evaluateCompanyChallengeProgress({
    challenge: membershipSnapshot.activeChallenge,
    membership: membershipSnapshot.membership,
    uid: currentUser.uid,
    sessions: input.sessions,
    summary: input.summary,
    now: input.now,
  });

  await setDoc(
    doc(
      db,
      "companies",
      membershipSnapshot.membership.companyId,
      "challengeProgress",
      companyChallengeProgressDocId(membershipSnapshot.activeChallenge.id, currentUser.uid)
    ),
    progress,
    { merge: true }
  );

  return progress;
}
