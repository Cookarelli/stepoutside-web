export type DailySpark = {
  title: string;
  quote: string;
  mission: string;
  reward: string;
  sunriseNudge: string;
  sunsetNudge: string;
};

const QUOTES = [
  "Step into the light before the day gets loud.",
  "A small walk can reset a whole mood.",
  "Fresh air counts even when the walk is short.",
  "Momentum starts with shoes on and the door open.",
  "Ten honest minutes outside can change the tone of the day.",
  "Sunrise is a reminder that restart is always available.",
  "A little daylight is often enough to find your footing again.",
  "You do not need a perfect plan to take a good walk.",
  "The streak grows one ordinary day at a time.",
  "Outside time is one of the simplest ways to feel more human.",
  "The best walk is the one you actually begin.",
  "Give the day a better story by stepping into it on purpose.",
];

const MISSIONS = [
  "Walk until you notice one thing you have not seen before.",
  "Take a ten-minute reset with your phone in your pocket.",
  "Let the first minute be slow and the second minute easier.",
  "Find a patch of sun and stay with it for three deep breaths.",
  "Take the long way back from one small errand today.",
  "Notice the temperature, the wind, and one sound you like.",
  "Use this walk to clear one thought that has been hanging around.",
  "Catch either sunrise color or the first hint of golden hour.",
  "Finish the walk wanting one more minute, not ten less.",
  "Make this one an easy win, not a dramatic effort.",
];

const REWARDS = [
  "Counts toward your streak and your nervous system.",
  "A low-effort win that keeps the week alive.",
  "A quiet point for consistency.",
  "Proof that momentum can stay simple.",
  "A soft reset that still moves the scoreboard.",
];

function hashDate(date: Date): number {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return y * 372 + m * 31 + d;
}

function pick<T>(items: T[], seed: number, offset = 0): T {
  return items[Math.abs(seed + offset) % items.length];
}

export function getDailySpark(date: Date = new Date()): DailySpark {
  const seed = hashDate(date);
  const quote = pick(QUOTES, seed);
  const mission = pick(MISSIONS, seed, 7);
  const reward = pick(REWARDS, seed, 13);

  return {
    title: "Daily Spark",
    quote,
    mission,
    reward,
    sunriseNudge: `Sunrise spark: ${quote}`,
    sunsetNudge: `Golden hour check-in: ${mission}`,
  };
}
