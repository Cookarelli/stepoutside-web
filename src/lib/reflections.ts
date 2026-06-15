import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, setDoc } from "firebase/firestore";

import { auth, db } from "./firebase";
import { REFLECTION_PROMPTS, type ReflectionPrompt } from "./reflectionPrompts";

export type ReflectionAiStatus = "pending" | "complete" | "error";

export type ReflectionWalkMetadata = {
  walkId: string;
  durationSec: number;
  distanceM: number;
  sunriseBonus: boolean;
  sunsetBonus: boolean;
};

export type ReflectionRecord = ReflectionWalkMetadata & {
  id: string;
  prompt: string;
  text: string;
  createdAt: number;
  aiResponse: string | null;
  aiStatus: ReflectionAiStatus;
};

export type SaveReflectionInput = ReflectionWalkMetadata & {
  prompt: string;
  text: string;
  createdAt?: number;
  aiResponse?: string | null;
  aiStatus?: ReflectionAiStatus;
};

export type SaveReflectionResult = {
  record: ReflectionRecord;
  mode: "remote" | "local";
  warning?: string;
};

const LEGACY_LOCAL_REFLECTIONS_KEY = "stepoutside:v2:reflections";
const LOCAL_REFLECTIONS_PREFIX = "stepoutside:v2:user";
const LAST_REFLECTION_PROMPT_INDEX_KEY = "stepoutside:v2:lastReflectionPromptIndex";

function localReflectionsKeyForUid(uid: string): string {
  return `${LOCAL_REFLECTIONS_PREFIX}:${uid}:reflections`;
}

async function cleanupLegacyLocalReflections(): Promise<void> {
  await AsyncStorage.removeItem(LEGACY_LOCAL_REFLECTIONS_KEY);
}

function currentUid(): string | null {
  return auth.currentUser?.uid ?? null;
}

function createReflectionId(walkId: string, createdAt: number): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${walkId}-${createdAt}-${suffix}`;
}

function isAiStatus(value: unknown): value is ReflectionAiStatus {
  return value === "pending" || value === "complete" || value === "error";
}

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeReflectionRecord(value: unknown): ReflectionRecord | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<ReflectionRecord>;
  const createdAt = toNumber(candidate.createdAt);
  const durationSec = toNumber(candidate.durationSec);
  const distanceM = toNumber(candidate.distanceM);

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.prompt !== "string" ||
    typeof candidate.text !== "string" ||
    typeof candidate.walkId !== "string" ||
    createdAt === null ||
    durationSec === null ||
    distanceM === null ||
    typeof candidate.sunriseBonus !== "boolean" ||
    typeof candidate.sunsetBonus !== "boolean" ||
    !isAiStatus(candidate.aiStatus) ||
    !(candidate.aiResponse === null || typeof candidate.aiResponse === "string")
  ) {
    return null;
  }

  return {
    id: candidate.id,
    prompt: candidate.prompt,
    text: candidate.text,
    createdAt,
    walkId: candidate.walkId,
    durationSec,
    distanceM,
    sunriseBonus: candidate.sunriseBonus,
    sunsetBonus: candidate.sunsetBonus,
    aiResponse: candidate.aiResponse,
    aiStatus: candidate.aiStatus,
  };
}

async function readLocalReflections(): Promise<ReflectionRecord[]> {
  await cleanupLegacyLocalReflections();

  const uid = currentUid();
  if (!uid) return [];

  const raw = await AsyncStorage.getItem(localReflectionsKeyForUid(uid));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => normalizeReflectionRecord(item))
      .filter((item): item is ReflectionRecord => item !== null)
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

async function writeLocalReflections(reflections: ReflectionRecord[]): Promise<void> {
  await cleanupLegacyLocalReflections();

  const uid = currentUid();
  if (!uid) return;

  await AsyncStorage.setItem(localReflectionsKeyForUid(uid), JSON.stringify(reflections));
}

async function saveLocalReflection(record: ReflectionRecord): Promise<void> {
  const reflections = await readLocalReflections();
  const next = [record, ...reflections.filter((item) => item.id !== record.id)].sort(
    (a, b) => b.createdAt - a.createdAt
  );

  await writeLocalReflections(next);
}

function buildReflectionRecord(input: SaveReflectionInput): ReflectionRecord {
  const createdAt = input.createdAt ?? Date.now();

  return {
    id: createReflectionId(input.walkId, createdAt),
    prompt: input.prompt.trim(),
    text: input.text.trim(),
    createdAt,
    walkId: input.walkId,
    durationSec: Math.max(0, Math.round(input.durationSec)),
    distanceM: Math.max(0, Math.round(input.distanceM)),
    sunriseBonus: input.sunriseBonus,
    sunsetBonus: input.sunsetBonus,
    aiResponse: input.aiResponse ?? null,
    aiStatus: input.aiStatus ?? "pending",
  };
}

function hashSeed(seed: string | number): number {
  const source = String(seed);
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

async function getLastPromptIndex(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_REFLECTION_PROMPT_INDEX_KEY);
    const parsed = Number(raw ?? "");
    if (Number.isInteger(parsed) && parsed >= 0 && parsed < REFLECTION_PROMPTS.length) {
      return parsed;
    }
  } catch {
    // Ignore prompt-state read failures and fall back to deterministic selection.
  }

  return null;
}

async function setLastPromptIndex(index: number): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_REFLECTION_PROMPT_INDEX_KEY, String(index));
  } catch {
    // Keep reflection selection resilient even if prompt-state persistence fails.
  }
}

export async function pickReflectionPrompt(seed: string | number): Promise<ReflectionPrompt> {
  const baseIndex = hashSeed(seed) % REFLECTION_PROMPTS.length;
  const lastPromptIndex = await getLastPromptIndex();
  const nextIndex =
    lastPromptIndex !== null && lastPromptIndex === baseIndex
      ? (baseIndex + 1) % REFLECTION_PROMPTS.length
      : baseIndex;

  await setLastPromptIndex(nextIndex);
  return REFLECTION_PROMPTS[nextIndex] ?? REFLECTION_PROMPTS[0];
}

export async function getLocalReflections(): Promise<ReflectionRecord[]> {
  return readLocalReflections();
}

export async function saveReflection(input: SaveReflectionInput): Promise<SaveReflectionResult> {
  const record = buildReflectionRecord(input);
  const promptIndex = REFLECTION_PROMPTS.findIndex((prompt) => prompt === record.prompt);
  if (promptIndex >= 0) {
    await setLastPromptIndex(promptIndex);
  }
  const currentUser = auth.currentUser;

  if (!currentUser?.uid) {
    return {
      record,
      mode: "local",
      warning: "Sign in to save reflections to your profile.",
    };
  }

  try {
    await setDoc(doc(db, "users", currentUser.uid, "reflections", record.id), record);
    return { record, mode: "remote" };
  } catch (error) {
    try {
      await saveLocalReflection(record);
      return {
        record,
        mode: "local",
        warning: "Cloud save was unavailable, so this reflection was saved on this device.",
      };
    } catch {
      throw error;
    }
  }
}
