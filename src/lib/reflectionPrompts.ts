export const REFLECTION_PROMPTS = [
  "How are you feeling after getting outside?",
  "What stood out to you today?",
  "What was the best part of this walk?",
  "Did anything surprise you while you were outside?",
  "What helped you keep moving today?",
  "What felt easier after this walk?",
  "What thoughts came into focus today?",
  "What did this walk help you process?",
] as const;

export type ReflectionPrompt = (typeof REFLECTION_PROMPTS)[number];
