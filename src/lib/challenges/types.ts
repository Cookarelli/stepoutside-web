import type { OutsideSession, SummaryStats } from "../store";

export type ChallengeType = "streak" | "completion_percentage" | "milestone" | "time_of_day";
export type ChallengeMetric =
  | "sessions"
  | "minutes"
  | "distance_m"
  | "days_completed"
  | "sunrise_sessions"
  | "sunset_sessions"
  | "weekend_sessions"
  | "hike_sessions"
  | "current_streak_days";
export type ChallengeWindow = "all_time" | "weekly" | "monthly" | "rolling_7d" | "rolling_30d";
export type ChallengeAudience = "personal" | "company" | "team" | "global";
export type ChallengeStatus = "active" | "completed" | "locked" | "upcoming";
export type BadgeCategory = "streak" | "milestone" | "time_of_day" | "community" | "recovery";
export type BadgeRarity = "common" | "rare" | "legendary";
export type BadgeArtKey =
  | "mindful-steps"
  | "7-day-streak"
  | "100-mile-club"
  | "comeback"
  | "daily-outside"
  | "evening-walk"
  | "park-loop"
  | "quiet-miles"
  | "sunrise-reset"
  | "sunrise-walker"
  | "trail-explorer"
  | "trailblazer"
  | "weekend-trail"
  | "weekend-warrior";
export type CompanyRole = "member" | "manager" | "admin";
export type CompanyAccessSource = "company_plan" | "bring_your_own_premium" | "hybrid" | "trial";
export type InviteCodeStatus = "active" | "paused" | "expired";

export type RewardDefinition = {
  id: string;
  kind: "badge_only" | "raffle_entry" | "coupon" | "perk" | "sponsor_reward";
  title: string;
  description: string;
};

export type BadgeDefinition = {
  id: string;
  title: string;
  description: string;
  category: BadgeCategory;
  rarity: BadgeRarity;
  accent: "forest" | "sunrise";
  artKey: BadgeArtKey;
  unlockChallengeId?: string;
  availability?: "live" | "coming_soon";
};

export type ChallengeDefinition = {
  id: string;
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  type: ChallengeType;
  metric: ChallengeMetric;
  goal: number;
  window: ChallengeWindow;
  cadence: "evergreen" | "scheduled";
  audience: ChallengeAudience;
  rewardId?: string;
  badgeId?: string;
  isPremium?: boolean;
  corporateEligible?: boolean;
  highlight?: "forest" | "sunrise";
};

export type ChallengeInstance = {
  id: string;
  templateId: string;
  title: string;
  audience: ChallengeAudience;
  companyId?: string;
  teamId?: string;
  startsAt: number;
  endsAt?: number;
  status: "draft" | "active" | "completed" | "archived";
  rewardId?: string;
};

export type CompanyChallengeInstance = {
  id: string;
  companyId: string;
  teamId?: string;
  templateId?: string;
  title: string;
  description: string;
  metric: ChallengeMetric;
  goal: number;
  progressLabel?: string;
  startsAt: number;
  endsAt?: number;
  status: "draft" | "active" | "completed" | "archived";
  rewardId?: string;
};

export type CompanyChallengeProgress = {
  instanceId: string;
  companyId: string;
  uid: string;
  teamId?: string;
  status: ChallengeStatus;
  metric: ChallengeMetric;
  progressValue: number;
  goalValue: number;
  percentComplete: number;
  supportingLabel: string;
  updatedAt: number;
};

export type CompanyChallengeAggregate = {
  instanceId: string;
  participantCount: number;
  completedCount: number;
  averagePercentComplete: number;
  topPercentComplete: number;
};

export type CompanyAdminDashboard = {
  memberCount: number;
  activeMembersThisWeek: number;
  totalSessions: number;
  totalMinutes: number;
  totalDistanceM: number;
  averageMinutesPerMember: number;
};

export type LocalChallengeProgress = {
  challengeId: string;
  status: ChallengeStatus;
  progressValue: number;
  goalValue: number;
  percentComplete: number;
  supportingLabel: string;
  badgeId?: string;
  rewardId?: string;
  updatedAt?: number;
};

export type CompanyDefinition = {
  id: string;
  name: string;
  slug: string;
  status: "trial" | "active" | "paused";
  premiumAccessMode: "company_paid" | "bring_your_own_premium" | "hybrid";
  adminUids: string[];
};

export type TeamDefinition = {
  id: string;
  companyId: string;
  name: string;
  inviteCodeHint?: string;
  memberCount?: number;
};

export type CompanyMembership = {
  uid: string;
  companyId: string;
  teamId?: string;
  role: CompanyRole;
  joinedAt: number;
  accessSource: Extract<CompanyAccessSource, "company_plan" | "hybrid" | "trial">;
};

export type InviteCodeDefinition = {
  id: string;
  normalizedCode: string;
  companyId: string;
  companyName?: string;
  teamId?: string | null;
  teamName?: string | null;
  status: InviteCodeStatus;
  expiresAt?: number | null;
};

export type CompanyLeaderboardEntry = {
  uid: string;
  name: string;
  role: CompanyRole;
  streakDays: number;
  activeDays: number;
  joinedAt: number;
  totalSessions?: number;
  totalMinutes?: number;
  totalDistanceM?: number;
};

export type BadgeUnlockState = {
  badge: BadgeDefinition;
  earned: boolean;
  earnedAtLabel?: string;
  progressHint: string;
  updatedAt?: number;
};

export type ChallengeUnlockResult = {
  newlyCompletedChallengeIds: string[];
  newlyEarnedBadgeIds: string[];
};

export type LocalChallengeSnapshot = {
  version: number;
  updatedAt: number;
  progress: LocalChallengeProgress[];
  badges: BadgeUnlockState[];
  completedChallengeIds: string[];
  earnedBadgeIds: string[];
};

export type TeamPreviewMember = {
  id: string;
  name: string;
  streakDays: number;
  activeDays: number;
};

export type TeamPreview = {
  companyName: string;
  teamName: string;
  inviteCodeHint: string;
  activeChallengeTitle: string;
  leaderboard: TeamPreviewMember[];
};

export type ChallengeEvaluationContext = {
  sessions: OutsideSession[];
  summary: SummaryStats;
  now?: Date;
};
