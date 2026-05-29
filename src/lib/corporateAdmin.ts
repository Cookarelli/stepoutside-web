import { doc, setDoc } from "firebase/firestore";

import type { AuthUserSnapshot } from "./auth";
import { auth, db } from "./firebase";
import type { CompanyChallengeInstance, CompanyDefinition, CompanyMembership, TeamDefinition } from "./challenges/types";

export type CorporateSeedResult = {
  companyId: string;
  companyName: string;
  teamId: string;
  teamName: string;
  inviteCode: string;
  challengeId: string;
};

type DemoMemberSeed = {
  uid: string;
  name: string;
  email: string;
  streakDays: number;
  activeDays: number;
  totalSessions: number;
  totalMinutes: number;
  totalDistanceM: number;
  challengePercentComplete: number;
  challengeProgressValue: number;
};

const OPTIMIZE_LOCAL_DEMO_MEMBERS: DemoMemberSeed[] = [
  {
    uid: "demo-olivia",
    name: "Olivia",
    email: "olivia@optimizelocal.test",
    streakDays: 6,
    activeDays: 4,
    totalSessions: 9,
    totalMinutes: 128,
    totalDistanceM: 14250,
    challengePercentComplete: 100,
    challengeProgressValue: 4,
  },
  {
    uid: "demo-mason",
    name: "Mason",
    email: "mason@optimizelocal.test",
    streakDays: 4,
    activeDays: 3,
    totalSessions: 7,
    totalMinutes: 96,
    totalDistanceM: 10840,
    challengePercentComplete: 75,
    challengeProgressValue: 3,
  },
  {
    uid: "demo-riley",
    name: "Riley",
    email: "riley@optimizelocal.test",
    streakDays: 2,
    activeDays: 2,
    totalSessions: 4,
    totalMinutes: 52,
    totalDistanceM: 6150,
    challengePercentComplete: 50,
    challengeProgressValue: 2,
  },
];

function normalizeString(value: string | null | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function baseIdentity(cachedUser?: AuthUserSnapshot | null) {
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) {
    throw new Error("Sign in to use company admin tools.");
  }

  const displayName =
    normalizeString(cachedUser?.displayName) ??
    normalizeString(currentUser.displayName) ??
    normalizeString(cachedUser?.email?.split("@")[0] ?? undefined) ??
    normalizeString(currentUser.email?.split("@")[0] ?? undefined) ??
    "Step Outside";

  const email = normalizeString(cachedUser?.email) ?? normalizeString(currentUser.email) ?? null;

  return {
    uid: currentUser.uid,
    displayName,
    email,
  };
}

function generateInviteCode(seed: string): string {
  const cleaned = seed.replace(/[^A-Z0-9]/g, "").toUpperCase();
  const prefix = cleaned.slice(0, 4).padEnd(4, "X");
  const suffix = String(Date.now()).slice(-4);
  return `${prefix}${suffix}`;
}

function companyIdFor(name: string, uid: string): string {
  return `company-${slugify(name) || "stepoutside"}-${uid.slice(0, 6)}`;
}

function defaultTeamName(name: string): string {
  return `${name} Founding Team`;
}

function defaultCompanyName(): string {
  return "Optimize Local";
}

function startOfToday(): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

function plusDays(timestamp: number, days: number): number {
  return timestamp + days * 86400000;
}

export async function createCompanyMvpSeedForCurrentUser(cachedUser?: AuthUserSnapshot | null): Promise<CorporateSeedResult> {
  const identity = baseIdentity(cachedUser);
  const companyName = defaultCompanyName();
  const companyId = companyIdFor(companyName, identity.uid);
  const teamName = defaultTeamName(companyName);
  const teamId = "team-main";
  const inviteCode = generateInviteCode("Optimize Local");
  const challengeId = "challenge-reset-week";

  const companyDoc: CompanyDefinition = {
    id: companyId,
    name: companyName,
    slug: slugify(companyName) || companyId,
    status: "trial",
    premiumAccessMode: "hybrid",
    adminUids: [identity.uid],
  };

  const teamDoc: TeamDefinition = {
    id: teamId,
    companyId,
    name: teamName,
    inviteCodeHint: `Share ${inviteCode} to add people to ${teamName}.`,
    memberCount: 1 + OPTIMIZE_LOCAL_DEMO_MEMBERS.length,
  };

  const membership: CompanyMembership = {
    uid: identity.uid,
    companyId,
    teamId,
    role: "admin",
    joinedAt: Date.now(),
    accessSource: "hybrid",
  };

  const challengeDoc: CompanyChallengeInstance = {
    id: challengeId,
    companyId,
    teamId,
    title: "Company Reset Week",
    description: "Log four active days together this week to build a shared outdoor rhythm.",
    metric: "days_completed",
    goal: 4,
    progressLabel: "4 of 7 days",
    startsAt: startOfToday(),
    endsAt: plusDays(startOfToday(), 7),
    status: "active",
    templateId: "challenge-consistency-club",
  };

  await setDoc(doc(db, "companies", companyId), companyDoc, { merge: true });

  await Promise.all([
    setDoc(doc(db, "companies", companyId, "teams", teamId), teamDoc, { merge: true }),
    setDoc(
      doc(db, "companies", companyId, "inviteCodes", inviteCode.toLowerCase()),
      {
        normalizedCode: inviteCode,
        companyId,
        companyName,
        teamId,
        teamName,
        status: "active",
        createdAt: Date.now(),
      },
      { merge: true }
    ),
    setDoc(doc(db, "companies", companyId, "challengeInstances", challengeId), challengeDoc, { merge: true }),
    setDoc(doc(db, "users", identity.uid, "memberships", companyId), membership, { merge: true }),
    setDoc(
      doc(db, "companies", companyId, "members", identity.uid),
      {
        uid: identity.uid,
        companyId,
        teamId,
        role: "admin",
        joinedAt: membership.joinedAt,
        name: identity.displayName,
        email: identity.email,
        streakDays: 0,
        activeDays: 0,
        totalSessions: 0,
        totalMinutes: 0,
        totalDistanceM: 0,
        updatedAt: Date.now(),
      },
      { merge: true }
    ),
    ...OPTIMIZE_LOCAL_DEMO_MEMBERS.map((member) =>
      setDoc(
        doc(db, "companies", companyId, "members", member.uid),
        {
          uid: member.uid,
          companyId,
          teamId,
          role: "member",
          joinedAt: Date.now(),
          name: member.name,
          email: member.email,
          streakDays: member.streakDays,
          activeDays: member.activeDays,
          totalSessions: member.totalSessions,
          totalMinutes: member.totalMinutes,
          totalDistanceM: member.totalDistanceM,
          updatedAt: Date.now(),
        },
        { merge: true }
      )
    ),
    ...OPTIMIZE_LOCAL_DEMO_MEMBERS.map((member) =>
      setDoc(
        doc(db, "companies", companyId, "challengeProgress", `${challengeId}__${member.uid}`),
        {
          instanceId: challengeId,
          companyId,
          uid: member.uid,
          teamId,
          status: member.challengePercentComplete >= 100 ? "completed" : "active",
          metric: "days_completed",
          progressValue: member.challengeProgressValue,
          goalValue: challengeDoc.goal,
          percentComplete: member.challengePercentComplete,
          supportingLabel: `${member.challengeProgressValue} / ${challengeDoc.goal} active days`,
          updatedAt: Date.now(),
        },
        { merge: true }
      )
    ),
  ]);

  return {
    companyId,
    companyName,
    teamId,
    teamName,
    inviteCode,
    challengeId,
  };
}

export async function createInviteCodeForCompany(input: {
  companyId: string;
  companyName: string;
  teamId?: string;
  teamName?: string | null;
  suggestedCode?: string;
}): Promise<string> {
  const identity = baseIdentity();
  const inviteCode = generateInviteCode(input.suggestedCode ?? input.companyName ?? identity.displayName);

  await setDoc(
    doc(db, "companies", input.companyId, "inviteCodes", inviteCode.toLowerCase()),
    {
      normalizedCode: inviteCode,
      companyId: input.companyId,
      companyName: input.companyName,
      teamId: input.teamId ?? null,
      teamName: input.teamName ?? null,
      status: "active",
      createdAt: Date.now(),
      createdBy: identity.uid,
    },
    { merge: true }
  );

  return inviteCode;
}

export async function createStarterChallengeForCompany(input: {
  companyId: string;
  teamId?: string;
}): Promise<CompanyChallengeInstance> {
  const challengeId = `challenge-reset-${Date.now()}`;
  const challenge: CompanyChallengeInstance = {
    id: challengeId,
    companyId: input.companyId,
    teamId: input.teamId,
    title: "Fresh Air Reset",
    description: "Complete three outdoor resets this week to build shared team momentum.",
    metric: "sessions",
    goal: 3,
    progressLabel: "3 resets this week",
    startsAt: startOfToday(),
    endsAt: plusDays(startOfToday(), 7),
    status: "active",
    templateId: "challenge-consistency-club",
  };

  await setDoc(doc(db, "companies", input.companyId, "challengeInstances", challengeId), challenge, { merge: true });
  return challenge;
}
