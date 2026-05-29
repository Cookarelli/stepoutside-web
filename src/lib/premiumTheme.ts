import { Platform } from "react-native";

export const PREMIUM = {
  colors: {
    cream: "#F5F1E8",
    creamSoft: "#F3EFE5",
    forest: "#1F4D36",
    forestDeep: "#173C2A",
    forestCard: "#4D7A56",
    forestSoft: "#5B8A63",
    gold: "#D7A94B",
    goldDeep: "#C89A3D",
    offWhite: "#FFF8EC",
    ink: "#193626",
    text: "#203629",
    textMuted: "rgba(32,54,41,0.66)",
    textSoft: "rgba(255,248,236,0.76)",
    line: "rgba(31,77,54,0.14)",
    lineStrong: "rgba(31,77,54,0.22)",
    glowGold: "rgba(215,169,75,0.16)",
    glowCream: "rgba(255,248,236,0.10)",
    danger: "#B84A41",
  },
  radius: {
    xs: 12,
    sm: 16,
    md: 20,
    lg: 24,
    xl: 30,
    hero: 34,
    pill: 999,
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 22,
    xxl: 28,
    section: 32,
    screen: 22,
  },
  shadow: {
    soft: {
      shadowColor: "#0D2117",
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    card: {
      shadowColor: "#102A1D",
      shadowOpacity: 0.14,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 8,
    },
    hero: {
      shadowColor: "#102A1D",
      shadowOpacity: 0.18,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: 16 },
      elevation: 10,
    },
  },
  type: {
    serifFamily: Platform.select({
      ios: "Georgia",
      android: "serif",
      default: "serif",
    }),
    bodyFamily: Platform.select({
      ios: "System",
      android: "sans-serif",
      default: "sans-serif",
    }),
    eyebrow: {
      fontSize: 12,
      letterSpacing: 1,
      fontWeight: "800" as const,
      textTransform: "uppercase" as const,
    },
    titleHero: {
      fontSize: 34,
      lineHeight: 40,
      fontWeight: "700" as const,
    },
    titlePage: {
      fontSize: 30,
      lineHeight: 36,
      fontWeight: "700" as const,
    },
    titleCard: {
      fontSize: 24,
      lineHeight: 30,
      fontWeight: "700" as const,
    },
    titleTile: {
      fontSize: 20,
      lineHeight: 24,
      fontWeight: "800" as const,
    },
    body: {
      fontSize: 15,
      lineHeight: 22,
      fontWeight: "600" as const,
    },
    bodySmall: {
      fontSize: 13,
      lineHeight: 19,
      fontWeight: "600" as const,
    },
  },
} as const;

export function alpha(hex: string, opacity: number): string {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalized;
  const value = Number.parseInt(full, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${opacity})`;
}
