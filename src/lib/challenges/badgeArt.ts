import type { ImageSourcePropType } from "react-native";

import type { BadgeArtKey, BadgeDefinition } from "./types";

const BADGE_ART: Record<BadgeArtKey, ImageSourcePropType> = {
  "mindful-steps": require("../../../assets/badges/badge-mindful-steps.png"),
  "7-day-streak": require("../../../assets/badges/badge-7-day-streak.png"),
  "100-mile-club": require("../../../assets/badges/badge-100-mile-club.png"),
  comeback: require("../../../assets/badges/badge-comeback.png"),
  "daily-outside": require("../../../assets/badges/badge-daily-outside.png"),
  "evening-walk": require("../../../assets/badges/badge-evening-walk.png"),
  "park-loop": require("../../../assets/badges/badge-park-loop.png"),
  "quiet-miles": require("../../../assets/badges/badge-quiet-miles.png"),
  "sunrise-reset": require("../../../assets/badges/badge-sunrise-reset.png"),
  "sunrise-walker": require("../../../assets/badges/badge-sunrise-walker.png"),
  "trail-explorer": require("../../../assets/badges/badge-trail-explorer.png"),
  trailblazer: require("../../../assets/badges/badge-trailblazer.png"),
  "weekend-trail": require("../../../assets/badges/badge-weekend-trail.png"),
  "weekend-warrior": require("../../../assets/badges/badge-weekend-warrior.png"),
};

const BADGE_ART_BY_ID: Record<string, BadgeArtKey> = {
  "badge-first-walk": "mindful-steps",
  "badge-7-day-streak": "7-day-streak",
  "badge-100-mile-club": "100-mile-club",
  "badge-comeback": "comeback",
  "badge-daily-outside": "daily-outside",
  "badge-evening-walk": "evening-walk",
  "badge-park-loop": "park-loop",
  "badge-quiet-miles": "quiet-miles",
  "badge-sunrise-reset": "sunrise-reset",
  "badge-sunrise-walker": "sunrise-walker",
  "badge-trail-explorer": "trail-explorer",
  "badge-trailblazer": "trailblazer",
  "badge-weekend-trail": "weekend-trail",
  "badge-weekend-warrior": "weekend-warrior",
};

export function getBadgeArtSource(artKey: BadgeArtKey): ImageSourcePropType {
  return BADGE_ART[artKey];
}

export function getBadgeArtSourceForBadge(
  badge: Pick<BadgeDefinition, "id" | "artKey"> | { id: string; artKey?: BadgeArtKey }
): ImageSourcePropType {
  const artKey = badge.artKey ?? BADGE_ART_BY_ID[badge.id] ?? "mindful-steps";
  return BADGE_ART[artKey];
}
