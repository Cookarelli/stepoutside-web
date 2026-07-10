import { formatElapsedClock } from "./time";

const formatElapsedClockCases = [
  { seconds: 0, expected: "00:00:00" },
  { seconds: 5, expected: "00:00:05" },
  { seconds: 65, expected: "00:01:05" },
  { seconds: 59 * 60, expected: "00:59:00" },
  { seconds: 60 * 60, expected: "01:00:00" },
  { seconds: 90 * 60, expected: "01:30:00" },
  { seconds: 130 * 60, expected: "02:10:00" },
  { seconds: 24 * 60 * 60, expected: "24:00:00" },
  { seconds: 25 * 60 * 60, expected: "25:00:00" },
  { seconds: 100 * 60 * 60, expected: "100:00:00" },
];

for (const { seconds, expected } of formatElapsedClockCases) {
  const actual = formatElapsedClock(seconds);
  if (actual !== expected) {
    throw new Error(`formatElapsedClock(${seconds}) expected ${expected}, received ${actual}`);
  }
}

export { formatElapsedClockCases };
