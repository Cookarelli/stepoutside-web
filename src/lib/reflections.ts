import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, setDoc } from "firebase/firestore";

import { auth, db } from "./firebase";

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

const LOCAL_REFLECTIONS_KEY = "stepoutside:v2:reflections";

export const REFLECTION_PROMPTS = [
  "What felt a little lighter by the end of this walk?",
  "What did you notice once your pace slowed down?",
  "What do you want to carry from this walk into the rest of your day?",
  "What felt grounded or steady while you were outside?",
  "What are you leaving behind after this walk?",
] as const;

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
  const raw = await AsyncStorage.getItem(LOCAL_REFLECTIONS_KEY);
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
  await AsyncStorage.setItem(LOCAL_REFLECTIONS_KEY, JSON.stringify(reflections));
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

export function pickReflectionPrompt(seed: string | number): string {
  const source = String(seed);
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(index);
    hash |= 0;
  }

  return REFLECTION_PROMPTS[Math.abs(hash) % REFLECTION_PROMPTS.length] ?? REFLECTION_PROMPTS[0];
}

export async function getLocalReflections(): Promise<ReflectionRecord[]> {
  return readLocalReflections();
}

export async function saveReflection(input: SaveReflectionInput): Promise<SaveReflectionResult> {
  const record = buildReflectionRecord(input);
  const currentUser = auth.currentUser;

  if (!currentUser?.uid) {
    await saveLocalReflection(record);
    return {
      record,
      mode: "local",
      warning: "Saved on this device for now.",
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
