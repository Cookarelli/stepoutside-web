import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import * as Location from "expo-location";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { OutdoorTheme } from "../../constants/theme";
import { usePremiumAccess } from "../../hooks/use-premium-access";
import { BrandHeaderMark } from "../../src/components/BrandBadge";
import { TrailIllustration } from "../../src/components/OutdoorIllustrations";
import {
  BrandCard,
  LayeredEnvironment,
  PrimaryButton,
  SecondaryButton,
  SectionHeader,
  StatCard,
} from "../../src/components/OutdoorUI";
import { getDailySpark, type DailySpark } from "../../src/lib/dailySpark";
import {
  challengeTitle,
  getIncomingFriendChallenges,
  getSentFriendChallenges,
  type FriendChallengeListItem,
} from "../../src/lib/friendChallenges";
import { getFriendsList, type FriendListItem } from "../../src/lib/friendSystem";
import { auth } from "../../src/lib/firebase";
import { REFLECTION_PROMPTS } from "../../src/lib/reflectionPrompts";
import {
  cacheRouteSuggestions,
  getRouteSuggestionsByZip,
  getRouteSuggestionsNearCoords,
  normalizeZip,
  type RouteSuggestion,
} from "../../src/lib/routeCatalog";
import { dayKeyLocal, EMPTY_SUMMARY, getSessions, getSummary, type SummaryStats } from "../../src/lib/store";
import {
  calculateChallengeProgress,
  challengeDaysRemaining,
  dailyPromptIndex,
  friendsActiveToday,
  selectCurrentChallenge,
} from "../../src/utils/homeV3";

const BRAND = {
  forest: OutdoorTheme.colors.forest,
  sunrise: OutdoorTheme.colors.gold,
  bone: OutdoorTheme.colors.cream,
  charcoal: OutdoorTheme.colors.charcoal,
  mist: OutdoorTheme.colors.sand,
} as const;

const MICROCOPY = [
  "Start simple.",
  "Just step outside.",
  "Less noise. More clarity.",
  "A quiet reset still counts.",
  "Take the edge off the day.",
  "Ten honest minutes is enough.",
] as const;

const ZIP_CODE_KEY = "@stepoutside/routeZipCode";
const CAMPFIRE_DRAFT_PREFIX = "stepoutside:v3:user";
const GOLDEN_HOUR_WINDOW_MIN = 45;

type WeatherSnapshot = {
  sunrise?: string;
  sunset?: string;
  nowTempF?: number;
  nowLabel?: string;
};

type FeaturedReset = {
  route: RouteSuggestion | null;
  sourceLine: string;
};

function HomeLandscapeBackground() {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 390 390" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id="homeSky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF9EF" />
          <Stop offset="0.46" stopColor="#F7F4EC" />
          <Stop offset="1" stopColor="#F0DDC2" />
        </LinearGradient>
        <LinearGradient id="homeSunrise" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#D9842F" stopOpacity="0.34" />
          <Stop offset="0.55" stopColor="#C69B42" stopOpacity="0.18" />
          <Stop offset="1" stopColor="#FFF9EF" stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id="homeForestFade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#4B6B52" stopOpacity="0.28" />
          <Stop offset="1" stopColor="#0D2D20" stopOpacity="0.92" />
        </LinearGradient>
      </Defs>

      <Rect width="390" height="390" fill="url(#homeSky)" />
      <Circle cx="304" cy="82" r="112" fill="url(#homeSunrise)" />
      <Circle cx="304" cy="82" r="32" fill="#D9842F" opacity="0.22" />

      <Path d="M-10 242 L64 152 L113 206 L172 124 L252 232 L314 158 L410 244 V390 H-10Z" fill="#A9A69A" opacity="0.24" />
      <Path d="M-20 264 L62 182 L122 238 L184 160 L260 252 L324 196 L410 264 V390 H-20Z" fill="#4B6B52" opacity="0.24" />
      <Path d="M-10 288 L54 226 L118 268 L178 216 L242 278 L312 226 L402 286 V390 H-10Z" fill="#18442F" opacity="0.2" />

      <Path d="M28 172 C82 154 126 187 178 168 C235 147 282 176 352 154" stroke="#FFF9EF" strokeWidth="16" strokeLinecap="round" opacity="0.4" fill="none" />
      <Path d="M-4 210 C70 194 118 224 188 203 C254 184 308 214 398 196" stroke="#DAD8CF" strokeWidth="14" strokeLinecap="round" opacity="0.46" fill="none" />
      <Path d="M22 252 C92 238 140 263 208 246 C274 230 314 248 380 240" stroke="#FFF9EF" strokeWidth="10" strokeLinecap="round" opacity="0.36" fill="none" />

      <G opacity="0.94">
        <Path d="M0 320 L18 284 L10 286 L30 248 L50 286 L42 284 L62 320Z" fill="#0D2D20" />
        <Path d="M48 322 L70 278 L60 280 L86 230 L112 280 L102 278 L124 322Z" fill="#18442F" />
        <Path d="M108 323 L128 286 L118 288 L144 240 L170 288 L160 286 L180 323Z" fill="#0D2D20" />
        <Path d="M164 323 L190 270 L178 273 L210 214 L242 273 L230 270 L256 323Z" fill="#18442F" />
        <Path d="M238 323 L260 282 L250 284 L276 236 L302 284 L292 282 L314 323Z" fill="#0D2D20" />
        <Path d="M300 324 L326 270 L314 273 L346 218 L378 273 L366 270 L392 324Z" fill="#18442F" />
      </G>

      <Path d="M-8 322 C70 306 126 330 194 316 C256 304 314 318 398 304 V390 H-8Z" fill="url(#homeForestFade)" />
      <Path d="M40 346 C96 336 150 352 206 342 C260 332 306 345 352 336" stroke="#C69B42" strokeWidth="4" strokeLinecap="round" opacity="0.28" fill="none" />
      <Rect width="390" height="390" fill="#FFF9EF" opacity="0.05" />
    </Svg>
  );
}

type CampsiteStage = {
  label: string;
  note: string;
  level: number;
};

function getCampsiteStage(streak: number): CampsiteStage {
  if (streak >= 365) return { label: "Glowing campsite", note: "A full year beneath the stars.", level: 8 };
  if (streak >= 180) return { label: "Forest clearing", note: "Your campsite has room to breathe.", level: 7 };
  if (streak >= 100) return { label: "Picnic table", note: "A place to rest and return.", level: 6 };
  if (streak >= 60) return { label: "Lantern light", note: "The path back is easy to find.", level: 5 };
  if (streak >= 30) return { label: "Tent pitched", note: "This habit is becoming a place.", level: 4 };
  if (streak >= 14) return { label: "Larger fire", note: "The warmth is starting to hold.", level: 3 };
  if (streak >= 7) return { label: "Small campfire", note: "A steady flame is taking shape.", level: 2 };
  if (streak >= 3) return { label: "Tiny spark", note: "A little glow is alive.", level: 1 };
  return { label: "One log", note: streak > 0 ? "Your campsite has begun." : "One walk lays the first log.", level: 0 };
}

function CampfireProgressArt({ streak }: { streak: number }) {
  const stage = getCampsiteStage(streak);
  const showSpark = stage.level >= 1;
  const showFire = stage.level >= 2;
  const showLargeFire = stage.level >= 3;
  const showTent = stage.level >= 4;
  const showLantern = stage.level >= 5;
  const showTable = stage.level >= 6;
  const showClearing = stage.level >= 7;
  const showStars = stage.level >= 8;

  return (
    <View style={styles.campsiteArtWrap}>
      <Svg width="100%" height="100%" viewBox="0 0 360 210" preserveAspectRatio="xMidYMid meet">
        <Defs>
          <LinearGradient id="campSky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={showStars ? "#0D2D20" : "#FFF9EF"} />
            <Stop offset="0.5" stopColor={showStars ? "#18442F" : "#F7F4EC"} />
            <Stop offset="1" stopColor={showStars ? "#123A29" : "#EAD8BA"} />
          </LinearGradient>
          <LinearGradient id="campGlow" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#D9842F" stopOpacity={showFire ? "0.42" : "0.18"} />
            <Stop offset="1" stopColor="#C69B42" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="360" height="210" rx="26" fill="url(#campSky)" />
        <Circle cx="178" cy="118" r={showLargeFire ? 70 : 46} fill="url(#campGlow)" />

        {showStars ? (
          <G opacity="0.86">
            <Circle cx="48" cy="32" r="2" fill="#FFF9EF" />
            <Circle cx="90" cy="48" r="1.5" fill="#FFF9EF" />
            <Circle cx="284" cy="34" r="2.2" fill="#FFF9EF" />
            <Circle cx="320" cy="66" r="1.5" fill="#FFF9EF" />
            <Path d="M236 42 L239 48 L246 49 L241 54 L242 61 L236 57 L230 61 L231 54 L226 49 L233 48Z" fill="#C69B42" />
          </G>
        ) : null}

        <Path d="M0 152 C70 134 118 160 178 146 C238 132 288 154 360 138 V210 H0Z" fill={showClearing ? "#4B6B52" : "#DAD8CF"} opacity={showStars ? 0.48 : 0.6} />
        <Path d="M0 166 C68 150 112 176 178 160 C240 145 296 164 360 152 V210 H0Z" fill="#18442F" opacity={showStars ? 0.72 : 0.22} />

        <G opacity={showClearing ? 0.98 : 0.4}>
          <Path d="M10 154 L28 118 L20 120 L40 82 L60 120 L52 118 L70 154Z" fill="#0D2D20" />
          <Path d="M292 154 L314 110 L304 112 L330 66 L356 112 L346 110 L368 154Z" fill="#0D2D20" />
          <Path d="M58 162 L76 126 L68 128 L88 92 L108 128 L100 126 L118 162Z" fill="#18442F" />
        </G>

        {showTent ? (
          <G>
            <Path d="M218 148 L266 92 L314 148Z" fill="#FFF9EF" opacity="0.94" />
            <Path d="M266 92 L314 148 H268Z" fill="#C69B42" opacity="0.62" />
            <Path d="M238 148 L266 112 L292 148Z" fill="#18442F" opacity="0.88" />
            <Path d="M218 148 L266 92 L314 148" stroke="#0D2D20" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.5" />
          </G>
        ) : null}

        {showTable ? (
          <G opacity="0.92">
            <Rect x="38" y="138" width="70" height="9" rx="4" fill="#0D2D20" />
            <Rect x="48" y="122" width="50" height="8" rx="4" fill="#C69B42" />
            <Path d="M58 146 L48 168 M90 146 L104 168" stroke="#0D2D20" strokeWidth="5" strokeLinecap="round" />
          </G>
        ) : null}

        {showLantern ? (
          <G>
            <Path d="M112 72 C112 60 128 60 128 72" stroke="#0D2D20" strokeWidth="4" strokeLinecap="round" fill="none" />
            <Rect x="112" y="72" width="16" height="30" rx="7" fill="#18442F" />
            <Circle cx="120" cy="88" r="8" fill="#D9842F" opacity="0.76" />
            <Circle cx="120" cy="88" r="18" fill="#D9842F" opacity="0.14" />
          </G>
        ) : null}

        <G>
          <Path d="M146 154 L190 166" stroke="#0D2D20" strokeWidth="9" strokeLinecap="round" />
          <Path d="M194 154 L150 166" stroke="#0D2D20" strokeWidth="9" strokeLinecap="round" />
          {showSpark ? <Circle cx="170" cy="132" r={showFire ? 9 : 5} fill="#D9842F" opacity="0.9" /> : null}
          {showFire ? (
            <>
              <Path d="M171 82 C190 106 194 128 178 146 C160 140 154 118 171 82Z" fill="#D9842F" />
              <Path d="M174 106 C184 121 183 136 172 145 C160 135 162 120 174 106Z" fill="#C69B42" />
              {showLargeFire ? <Path d="M160 106 C152 124 156 142 170 151" stroke="#FFF9EF" strokeWidth="5" strokeLinecap="round" opacity="0.42" fill="none" /> : null}
            </>
          ) : null}
        </G>
      </Svg>
      <View style={styles.campsiteStagePill}>
        <Text style={styles.campsiteStageText}>{stage.label}</Text>
      </View>
    </View>
  );
}

function hashDate(date: Date): number {
  return date.getFullYear() * 372 + (date.getMonth() + 1) * 31 + date.getDate();
}

function pickMicrocopy(date: Date): string {
  return MICROCOPY[hashDate(date) % MICROCOPY.length] ?? MICROCOPY[0];
}

function getGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function weatherCodeLabel(code: number): string {
  if (code === 0) return "Clear";
  if ([1, 2, 3].includes(code)) return "Cloudy";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Storm";
  return "Mixed";
}

function cToF(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0 min";
  if (minutes < 60) return `${minutes} min`;

  const hours = minutes / 60;
  if (hours >= 10 || Number.isInteger(hours)) return `${Math.round(hours)} hr`;
  return `${hours.toFixed(1)} hr`;
}

function formatTimeUntil(minutes: number): string {
  if (minutes <= 0) return "now";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours} hr` : `${hours} hr ${remainder} min`;
}

function minutesFromNow(iso?: string, now: Date = new Date()): number | null {
  if (!iso) return null;
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.round((timestamp - now.getTime()) / 60000);
}

function buildStatusLine(todayMinutes: number, weather: WeatherSnapshot | null, now: Date = new Date()): string {
  const sunriseDelta = minutesFromNow(weather?.sunrise, now);
  const sunsetDelta = minutesFromNow(weather?.sunset, now);

  const goldenHourActive =
    (sunriseDelta !== null && Math.abs(sunriseDelta) <= GOLDEN_HOUR_WINDOW_MIN) ||
    (sunsetDelta !== null && Math.abs(sunsetDelta) <= GOLDEN_HOUR_WINDOW_MIN);

  if (goldenHourActive) return "Golden Hour active";
  if (todayMinutes > 0) return "You already showed up today";
  if (sunriseDelta !== null && sunriseDelta > 0 && sunriseDelta <= 120) {
    return `Sunrise in ${formatTimeUntil(sunriseDelta)}`;
  }
  if (sunsetDelta !== null && sunsetDelta > 0 && sunsetDelta <= 180) {
    return `Sunset in ${formatTimeUntil(sunsetDelta)}`;
  }

  const hour = now.getHours();
  if (hour < 12) return "Morning direction starts small";
  if (hour < 17) return "A midday reset still counts";
  return "Evening reset is still available";
}

function routeKindLabel(route: RouteSuggestion): string {
  if (route.isIndoor) return "Indoor reset";
  if (route.kind === "park_loop") return "Park loop";
  if (route.kind === "trail") return "Trail reset";
  return "Quick walk";
}

function routeSummary(route: RouteSuggestion): string {
  const base = `~${route.estMinutes} min`;
  const type = routeKindLabel(route);
  const tag = route.tags[0]?.replace(/-/g, " ");
  return tag ? `${base} • ${type} • ${tag}` : `${base} • ${type}`;
}

async function openInMaps(route: RouteSuggestion): Promise<void> {
  const label = encodeURIComponent(route.name);
  const url = `http://maps.apple.com/?ll=${route.lat},${route.lng}&q=${label}`;
  await Linking.openURL(url);
}

async function fetchWeatherSnapshot(coords: { lat: number; lng: number }): Promise<WeatherSnapshot | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lng}` +
      "&hourly=temperature_2m,weathercode&daily=sunrise,sunset&forecast_days=1&timezone=auto";

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    const hourly = data?.hourly;
    const times: string[] = hourly?.time ?? [];
    const tempsC: number[] = hourly?.temperature_2m ?? [];
    const weatherCodes: number[] = hourly?.weathercode ?? [];

    const nowHour = new Date().getHours();
    const index = times.findIndex((time) => new Date(time).getHours() === nowHour);
    const currentIndex = index >= 0 ? index : 0;

    return {
      sunrise: data?.daily?.sunrise?.[0] as string | undefined,
      sunset: data?.daily?.sunset?.[0] as string | undefined,
      nowTempF:
        typeof tempsC[currentIndex] === "number" ? cToF(tempsC[currentIndex]) : undefined,
      nowLabel:
        typeof weatherCodes[currentIndex] === "number"
          ? weatherCodeLabel(weatherCodes[currentIndex])
          : undefined,
    };
  } catch {
    return null;
  }
}

async function loadFeaturedResetFromZip(): Promise<FeaturedReset> {
  const savedZip = normalizeZip((await AsyncStorage.getItem(ZIP_CODE_KEY)) ?? "");
  if (savedZip.length !== 5) {
    return {
      route: null,
      sourceLine: "Turn on location or add a ZIP in Suggestions to see nearby reset ideas.",
    };
  }

  try {
    const routes = await getRouteSuggestionsByZip(savedZip);
    if (routes.length > 0) {
      void cacheRouteSuggestions(routes);
    }
    return {
      route: routes[0] ?? null,
      sourceLine:
        routes.length > 0
          ? `Pulled from your saved ZIP ${savedZip}.`
          : "No nearby reset is seeded for your saved ZIP yet.",
    };
  } catch {
    return {
      route: null,
      sourceLine: "Couldn’t load reset suggestions from your saved ZIP right now.",
    };
  }
}

export default function HomeTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [summary, setSummary] = useState<SummaryStats>(EMPTY_SUMMARY);
  const [dailySpark, setDailySpark] = useState<DailySpark | null>(null);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [featuredReset, setFeaturedReset] = useState<FeaturedReset>({
    route: null,
    sourceLine: "Looking for a nearby reset…",
  });
  const [loadingContext, setLoadingContext] = useState(true);
  const [friends, setFriends] = useState<FriendListItem[]>([]);
  const [currentChallenge, setCurrentChallenge] = useState<FriendChallengeListItem | null>(null);
  const [challengeSessions, setChallengeSessions] = useState<Awaited<ReturnType<typeof getSessions>>>([]);
  const [pendingChallengeCount, setPendingChallengeCount] = useState(0);
  const [communityLoading, setCommunityLoading] = useState(true);
  const [communityUnavailable, setCommunityUnavailable] = useState(false);
  const [challengeUnavailable, setChallengeUnavailable] = useState(false);
  const [campfireResponse, setCampfireResponse] = useState("");
  const [campfireSaved, setCampfireSaved] = useState(false);
  const { isPremium, isLoading: premiumLoading } = usePremiumAccess();

  const now = new Date();
  const todayKey = dayKeyLocal(now);
  const todayMinutes = summary.daysCompleted?.[todayKey] ?? 0;
  const currentStreak = summary.currentStreak ?? summary.currentStreakDays ?? 0;
  const longestStreak = summary.longestStreak ?? summary.bestStreakDays ?? 0;
  const activeDaysThisWeek = summary.activeDaysThisWeek ?? 0;
  const activeDaysThisMonth = summary.activeDaysThisMonth ?? 0;
  const weeklyGoal = summary.weeklyGoal ?? 4;
  const monthlyGoal = summary.monthlyGoal ?? 16;
  const weeklyConsistencyStreakCurrent = summary.weeklyConsistencyStreakCurrent ?? 0;

  const greeting = getGreeting(now);
  const dayLabel = formatDayLabel(now);
  const microcopy = pickMicrocopy(now);
  const statusLine = buildStatusLine(todayMinutes, weather, now);
  const weeklyProgressLabel = `${Math.min(activeDaysThisWeek, weeklyGoal)}/${weeklyGoal} this week`;
  const weeklyGoalRemaining = Math.max(0, weeklyGoal - activeDaysThisWeek);
  const premiumStreakMessage =
    activeDaysThisWeek >= weeklyGoal
      ? "Weekly goal complete. Keep the rhythm going."
      : `${weeklyGoalRemaining} more active day${weeklyGoalRemaining === 1 ? "" : "s"} to hit your weekly goal.`;
  const activeFriends = friendsActiveToday(friends, now);
  const recentFriendUpdates = activeFriends.slice(0, 2);
  const challengeProgress = currentChallenge
    ? calculateChallengeProgress(currentChallenge, challengeSessions)
    : null;
  const reflectionPrompt = REFLECTION_PROMPTS[dailyPromptIndex(now, REFLECTION_PROMPTS.length)];

  const loadCommunity = useCallback(async () => {
    setCommunityLoading(true);
    setCommunityUnavailable(false);
    setChallengeUnavailable(false);

    const currentUid = auth.currentUser?.uid;
    if (!currentUid) {
      setFriends([]);
      setCurrentChallenge(null);
      setChallengeSessions([]);
      setPendingChallengeCount(0);
      setCampfireResponse("");
      setCommunityLoading(false);
      return;
    }

    const [friendsResult, incomingResult, sentResult, draftResult] =
      await Promise.allSettled([
        getFriendsList({ includeActivity: true, ensureCurrentUserDiscoveryProfile: false }),
        getIncomingFriendChallenges(),
        getSentFriendChallenges(),
        AsyncStorage.getItem(`${CAMPFIRE_DRAFT_PREFIX}:${currentUid}:campfire:${dayKeyLocal(new Date())}`),
      ]);

    const nextFriends = friendsResult.status === "fulfilled" ? friendsResult.value : [];
    const incoming = incomingResult.status === "fulfilled" ? incomingResult.value : [];
    const sent = sentResult.status === "fulfilled" ? sentResult.value : [];
    const challengeItems = [...incoming, ...sent];
    const nextCurrentChallenge = selectCurrentChallenge(challengeItems, new Date());
    let nextChallengeSessions: Awaited<ReturnType<typeof getSessions>> = [];
    let challengeSessionsUnavailable = false;

    if (nextCurrentChallenge) {
      try {
        nextChallengeSessions = await getSessions();
      } catch {
        challengeSessionsUnavailable = true;
      }
    }

    setFriends(nextFriends);
    setCurrentChallenge(nextCurrentChallenge);
    setPendingChallengeCount(
      new Set(
        challengeItems
          .filter((item) => item.challenge.status === "pending")
          .map((item) => item.challenge.id)
      ).size
    );
    setChallengeSessions(nextChallengeSessions);
    setCampfireResponse(draftResult.status === "fulfilled" ? draftResult.value ?? "" : "");
    setCampfireSaved(Boolean(draftResult.status === "fulfilled" && draftResult.value));
    setCommunityUnavailable(friendsResult.status === "rejected");
    setChallengeUnavailable(
      incomingResult.status === "rejected" ||
        sentResult.status === "rejected" ||
        challengeSessionsUnavailable
    );
    setCommunityLoading(false);
  }, []);

  const saveCampfireResponse = useCallback(async () => {
    const currentUid = auth.currentUser?.uid;
    const trimmedResponse = campfireResponse.trim();
    if (!currentUid || !trimmedResponse) return;
    await AsyncStorage.setItem(
      `${CAMPFIRE_DRAFT_PREFIX}:${currentUid}:campfire:${todayKey}`,
      trimmedResponse
    );
    setCampfireResponse(trimmedResponse);
    setCampfireSaved(true);
  }, [campfireResponse, todayKey]);

  const loadHome = useCallback(async () => {
    setLoadingContext(true);

    const [summaryResult] = await Promise.allSettled([getSummary()]);

    setSummary(summaryResult.status === "fulfilled" ? summaryResult.value : EMPTY_SUMMARY);
    setDailySpark(getDailySpark(new Date()));

    let nextWeather: WeatherSnapshot | null = null;
    let nextReset: FeaturedReset | null = null;

    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status === "granted") {
        const lastKnown = await Location.getLastKnownPositionAsync();
        const position =
          lastKnown ??
          (await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }));

        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        const [weatherResult, routeResult] = await Promise.allSettled([
          fetchWeatherSnapshot(coords),
          getRouteSuggestionsNearCoords(coords),
        ]);

        nextWeather = weatherResult.status === "fulfilled" ? weatherResult.value : null;

        const nearbyRoutes = routeResult.status === "fulfilled" ? routeResult.value : [];
        if (nearbyRoutes.length > 0) {
          void cacheRouteSuggestions(nearbyRoutes);
          nextReset = {
            route: nearbyRoutes[0] ?? null,
            sourceLine: "Close enough to make today easy.",
          };
        }
      }
    } catch {
      nextWeather = null;
    }

    if (!nextReset) {
      nextReset = await loadFeaturedResetFromZip();
    }

    setWeather(nextWeather);
    setFeaturedReset(nextReset);
    setLoadingContext(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadHome();
      void loadCommunity();
    }, [loadCommunity, loadHome])
  );

  return (
    <SafeAreaView
      style={[styles.safe, { paddingTop: Math.max(insets.top, 10) }]}
      edges={["top", "left", "right"]}
    >
      <LayeredEnvironment />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <HomeLandscapeBackground />
          <View style={styles.heroAtmosphere} />
          <View style={styles.heroMasthead}>
            <BrandHeaderMark size={58} showTagline />
            <View style={styles.heroPillColumn}>
              <View style={styles.datePill}>
                <Text style={styles.datePillText} numberOfLines={1}>
                  {dayLabel}
                </Text>
              </View>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText} numberOfLines={2}>
                  {statusLine}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.heroCopy}>
            <Text style={styles.greeting}>Personal Today · {greeting}</Text>
            <Text style={styles.microcopy}>Your next Step Outside is waiting.</Text>
            <Text style={styles.heroSupportLine}>{microcopy}</Text>
            <Text style={styles.heroSupportLineSecondary}>
              {todayMinutes > 0 ? "You already have credit for today. Another short reset still counts." : "Your next best step is a short walk."}
            </Text>
          </View>

          <View style={styles.personalMetricsRow}>
            <View style={styles.personalMetric}>
              <Text style={styles.personalMetricValue}>{currentStreak}</Text>
              <Text style={styles.personalMetricLabel}>day streak</Text>
            </View>
            <View style={styles.personalMetric}>
              <Text style={styles.personalMetricValue}>{todayMinutes > 0 ? formatMinutes(todayMinutes) : "Ready"}</Text>
              <Text style={styles.personalMetricLabel}>today</Text>
            </View>
            <View style={styles.personalMetric}>
              <Text style={styles.personalMetricValue}>{weeklyProgressLabel}</Text>
              <Text style={styles.personalMetricLabel}>goal</Text>
            </View>
          </View>

          <View style={styles.personalActions}>
            <PrimaryButton
              onPress={() => router.push("/walk")}
              label={todayMinutes > 0 ? "Record Activity" : "Step Outside"}
              accessibilityLabel={todayMinutes > 0 ? "Record another outdoor activity" : "Start an outdoor walk"}
              style={styles.primaryCta}
              textStyle={styles.primaryCtaText}
            />
            <SecondaryButton
              onPress={() => router.push("/(tabs)/stats")}
              label="View Stats"
              accessibilityLabel="View personal outdoor statistics"
              style={styles.heroSecondaryCta}
              textStyle={styles.heroSecondaryCtaText}
            />
          </View>
        </View>

        <BrandCard withPines style={styles.communityCard}>
          <SectionHeader
            eyebrow="Community Today"
            title="Outside feels better together."
            actionLabel="Buddies"
            onActionPress={() => router.push("/friends")}
          />

          {communityLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={BRAND.forest} />
              <Text style={styles.loadingText}>Checking in with your circle…</Text>
            </View>
          ) : !auth.currentUser ? (
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyTitle}>Sign in to see your community.</Text>
              <Text style={styles.emptyBody}>Your personal activity remains private until you choose to connect.</Text>
              <SecondaryButton
                onPress={() => router.replace("/auth")}
                label="Sign In"
                style={styles.cardAction}
                textStyle={styles.cardActionText}
              />
            </View>
          ) : communityUnavailable ? (
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyTitle}>Community updates are resting.</Text>
              <Text style={styles.emptyBody}>Your personal progress is safe. Try the Buddies screen again when you are connected.</Text>
            </View>
          ) : (
            <>
              <View style={styles.communityCountRow}>
                <Text style={styles.communityCount}>{activeFriends.length}</Text>
                <Text style={styles.communityCountLabel}>
                  {activeFriends.length === 1 ? "buddy active today" : "buddies active today"}
                </Text>
              </View>

              {recentFriendUpdates.length > 0 ? (
                <View style={styles.updateList}>
                  {recentFriendUpdates.map((friend) => {
                    const name = friend.profile.displayName || `@${friend.profile.username}`;
                    return (
                      <View key={friend.profile.uid} style={styles.updateRow}>
                        <View style={styles.updateDot} />
                        <View style={styles.updateCopy}>
                          <Text style={styles.updateTitle}>{name} stepped outside today.</Text>
                          <Text style={styles.updateMeta}>
                            {friend.activity?.currentStreak
                              ? `${friend.activity.currentStreak}-day outdoor streak`
                              : "A little shared momentum for the day."}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.emptyPanelCompact}>
                  <Text style={styles.emptyTitle}>
                    {friends.length > 0 ? "Your circle is quiet so far today." : "Your outdoor circle starts here."}
                  </Text>
                  <Text style={styles.emptyBody}>
                    {friends.length > 0
                      ? "A short walk from you could be today’s first bit of momentum."
                      : "Add a buddy to share light accountability without adding screen noise."}
                  </Text>
                </View>
              )}

              <View style={styles.encouragementPanel}>
                <Text style={styles.encouragementLabel}>Recent encouragement</Text>
                <Text style={styles.encouragementText}>No encouragement has been shared yet.</Text>
              </View>
            </>
          )}
        </BrandCard>

        <BrandCard style={styles.challengeCard}>
          <SectionHeader
            eyebrow="Current Challenge"
            title={currentChallenge ? challengeTitle(currentChallenge.challenge.type, currentChallenge.challenge.target) : "Choose a shared goal."}
            actionLabel="Challenges"
            onActionPress={() => router.push("/challenges")}
          />

          {communityLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={BRAND.forest} />
              <Text style={styles.loadingText}>Loading challenge progress…</Text>
            </View>
          ) : challengeUnavailable ? (
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyTitle}>Challenge progress is unavailable right now.</Text>
              <Text style={styles.emptyBody}>Nothing was changed. Open Challenges to try again when your connection returns.</Text>
              <SecondaryButton
                onPress={() => router.push("/challenges")}
                label="Open Challenges"
                style={styles.cardAction}
                textStyle={styles.cardActionText}
              />
            </View>
          ) : currentChallenge && challengeProgress ? (
            <>
              <Text style={styles.challengeWith}>
                With {currentChallenge.profile?.displayName || currentChallenge.profile?.username || "a buddy"}
              </Text>
              <View style={styles.challengeProgressTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: challengeProgress.percent }}>
                <View style={[styles.challengeProgressFill, { width: `${challengeProgress.percent}%` }]} />
              </View>
              <View style={styles.challengeStatRow}>
                <View style={styles.challengeStat}>
                  <Text style={styles.challengeStatValue}>
                    {challengeProgress.unit === "miles" ? challengeProgress.current.toFixed(1) : Math.round(challengeProgress.current)} / {challengeProgress.target}
                  </Text>
                  <Text style={styles.challengeStatLabel}>{challengeProgress.unit}</Text>
                </View>
                <View style={styles.challengeStat}>
                  <Text style={styles.challengeStatValue}>{challengeDaysRemaining(currentChallenge.challenge.endDate, now)}</Text>
                  <Text style={styles.challengeStatLabel}>days remaining</Text>
                </View>
                <View style={styles.challengeStat}>
                  <Text style={styles.challengeStatValue}>—</Text>
                  <Text style={styles.challengeStatLabel}>rank not used</Text>
                </View>
              </View>
              <Text style={styles.challengeNote}>Friend challenges track personal progress; ranked challenge scoring is not available yet.</Text>
            </>
          ) : (
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyTitle}>
                {pendingChallengeCount > 0
                  ? `${pendingChallengeCount} challenge invitation${pendingChallengeCount === 1 ? " is" : "s are"} waiting.`
                  : "No active challenge right now."}
              </Text>
              <Text style={styles.emptyBody}>Invite a buddy to a weekly distance, walk, or outdoor-minutes goal.</Text>
              <SecondaryButton
                onPress={() => router.push("/challenges")}
                label={pendingChallengeCount > 0 ? "Review Invitations" : "Explore Challenges"}
                style={styles.cardAction}
                textStyle={styles.cardActionText}
              />
            </View>
          )}
        </BrandCard>

        <BrandCard withPines style={styles.teamCard}>
          <SectionHeader eyebrow="Team or Group" title="Make outside time a shared rhythm." />
          <View style={styles.emptyPanelForest}>
            <Text style={styles.emptyTitleForest}>No group or organization yet.</Text>
            <Text style={styles.emptyBodyForest}>
              Groups, team progress, and group leaderboards need a dedicated privacy-safe data model and are coming in a later V3 phase.
            </Text>
            <View style={styles.teamUnavailableRow}>
              <View style={styles.teamUnavailableItem}>
                <Text style={styles.teamUnavailableLabel}>Team progress</Text>
                <Text style={styles.teamUnavailableValue}>Not available</Text>
              </View>
              <View style={styles.teamUnavailableItem}>
                <Text style={styles.teamUnavailableLabel}>Leaderboard position</Text>
                <Text style={styles.teamUnavailableValue}>Not ranked</Text>
              </View>
            </View>
            <SecondaryButton
              onPress={() => router.push("/friends")}
              label="Build Your Circle"
              accessibilityLabel="Find buddies while groups are being prepared"
              style={styles.cardActionLight}
              textStyle={styles.cardActionLightText}
            />
          </View>
        </BrandCard>

        <BrandCard withCampfire style={styles.focusCard}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderCopy}>
              <SectionHeader
                eyebrow="Daily Outdoor Mission"
                title={dailySpark ? `“${dailySpark.quote}”` : "Start with one calm reset."}
                style={styles.focusHeader}
              />
            </View>
            <View style={styles.tinyGoldMark} />
          </View>
          <Text style={styles.focusBody}>
            {dailySpark ? dailySpark.mission : "A simple prompt will show up here each day."}
          </Text>
          <Text style={styles.focusReward}>
            {dailySpark ? dailySpark.reward : "Start a walk whenever you want a calmer reset."}
          </Text>
        </BrandCard>

        <BrandCard withCampfire style={styles.campfirePreviewCard}>
          <SectionHeader eyebrow="Campfire Preview" title="Pause for one quiet thought." />
          <Text style={styles.reflectionPrompt}>{reflectionPrompt}</Text>
          <TextInput
            value={campfireResponse}
            onChangeText={(value) => {
              setCampfireResponse(value);
              setCampfireSaved(false);
            }}
            placeholder="Optional private reflection"
            placeholderTextColor="rgba(30,42,36,0.45)"
            multiline
            maxLength={280}
            textAlignVertical="top"
            accessibilityLabel="Optional private daily reflection"
            style={styles.reflectionInput}
          />
          <View style={styles.reflectionFooter}>
            <Text style={styles.reflectionPrivacy}>
              {auth.currentUser ? "Private on this device." : "Sign in to save a private response."}
            </Text>
            <PrimaryButton
              onPress={() => void saveCampfireResponse()}
              label={campfireSaved ? "Saved" : "Save"}
              disabled={!auth.currentUser || !campfireResponse.trim() || campfireSaved}
              accessibilityLabel={campfireSaved ? "Reflection saved" : "Save private reflection"}
              style={styles.reflectionSave}
              textStyle={styles.reflectionSaveText}
            />
          </View>
        </BrandCard>

        <BrandCard style={styles.statsSummaryCard}>
          <SectionHeader title="Stats Summary" actionLabel="View stats" onActionPress={() => router.push("/(tabs)/stats")} />
          <View style={styles.statsGrid}>
            <StatCard label="Today" value={todayMinutes > 0 ? formatMinutes(todayMinutes) : "Ready"} />
            <StatCard label="Outside" value={formatMinutes(summary.totalMinutes)} />
            <StatCard label="Golden" value={summary.sunriseBonusCount + summary.sunsetBonusCount} />
            <StatCard label="Weather" value={weather?.nowTempF ? `${weather.nowTempF}°F` : "Calm"} />
          </View>
        </BrandCard>

        <BrandCard style={styles.streakCard}>
          <View style={styles.streakHeader}>
            <SectionHeader
              eyebrow="Campfire Progress"
              title="Your campsite is growing."
              subtitle={getCampsiteStage(currentStreak).note}
              style={styles.streakSectionHeader}
            />
          </View>

          <CampfireProgressArt streak={currentStreak} />

          <View style={styles.campsiteStatsRow}>
            <View style={styles.campsiteStreakBadge}>
              <Text style={styles.streakNumber}>{currentStreak}</Text>
              <Text style={styles.streakUnit}>day{currentStreak === 1 ? "" : "s"}</Text>
            </View>
            <View style={styles.streakCopy}>
              <Text style={styles.streakNote}>
                {currentStreak > 0 ? "Keep tending the campsite with one simple reset." : "One walk lays the first log."}
              </Text>
              <Text style={styles.streakStatusLine}>{statusLine}</Text>
            </View>
          </View>

          {isPremium && !premiumLoading ? (
            <View style={styles.premiumStreakCard}>
              <Text style={styles.premiumStreakEyebrow}>Premium Streaks</Text>
              <View style={styles.premiumStreakRow}>
                <Text style={styles.premiumStreakLabel}>Longest streak</Text>
                <Text style={styles.premiumStreakValue}>{longestStreak} days</Text>
              </View>
              <View style={styles.premiumStreakRow}>
                <Text style={styles.premiumStreakLabel}>Weekly progress</Text>
                <Text style={styles.premiumStreakValue}>{weeklyProgressLabel}</Text>
              </View>
              <View style={styles.premiumStreakRow}>
                <Text style={styles.premiumStreakLabel}>Active days this month</Text>
                <Text style={styles.premiumStreakValue}>{activeDaysThisMonth}/{monthlyGoal}</Text>
              </View>
              <View style={styles.premiumStreakRow}>
                <Text style={styles.premiumStreakLabel}>Weekly consistency</Text>
                <Text style={styles.premiumStreakValue}>{weeklyConsistencyStreakCurrent} weeks</Text>
              </View>
              <Text style={styles.premiumStreakBody}>{premiumStreakMessage}</Text>
            </View>
          ) : null}

          {!isPremium && !premiumLoading ? (
            <View style={styles.premiumPreviewCard}>
              <Text style={styles.premiumPreviewEyebrow}>Premium Streaks</Text>
              <Text style={styles.premiumPreviewTitle}>See the deeper pattern.</Text>
              <Text style={styles.premiumPreviewBody}>
                Unlock weekly goal progress, longest streaks, active month totals, and comeback tracking.
              </Text>
              <View style={styles.premiumPreviewRow}>
                <Text style={styles.premiumPreviewLabel}>Weekly progress</Text>
                <Text style={styles.premiumPreviewPlaceholder}>Locked</Text>
              </View>
              <View style={styles.premiumPreviewRow}>
                <Text style={styles.premiumPreviewLabel}>Longest streak</Text>
              <Text style={styles.premiumPreviewPlaceholder}>Locked</Text>
              </View>
            </View>
          ) : null}
        </BrandCard>

        <BrandCard withPines style={styles.actionCard}>
          <SectionHeader eyebrow="Suggested Action" title="Next reason to step outside" style={styles.suggestedHeader} />

          {loadingContext && !featuredReset.route ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={BRAND.forest} />
              <Text style={styles.loadingText}>Looking for something close by…</Text>
            </View>
          ) : featuredReset.route ? (
            <>
              <Text style={styles.resetTitle}>{featuredReset.route.name}</Text>
              <Text style={styles.resetMeta}>{routeSummary(featuredReset.route)}</Text>
              <Text style={styles.resetNote}>{featuredReset.sourceLine}</Text>

              <View style={styles.resetActions}>
                <PrimaryButton
                  style={styles.resetPrimaryBtn}
                  onPress={() => void openInMaps(featuredReset.route as RouteSuggestion)}
                  label="Open in Maps"
                  textStyle={styles.resetPrimaryBtnText}
                />

                <SecondaryButton
                  style={styles.resetSecondaryBtn}
                  onPress={() => router.push("/(tabs)/steps")}
                  label="See All Resets"
                  textStyle={styles.resetSecondaryBtnText}
                />
              </View>
            </>
          ) : (
            <>
              <View pointerEvents="none" style={styles.resetEmptyArt}>
                <TrailIllustration width={174} height={108} opacity={0.2} />
              </View>
              <Text style={styles.resetTitle}>No nearby reset loaded yet</Text>
              <Text style={styles.resetNote}>
                {featuredReset.sourceLine} A quiet route is still coming into view.
              </Text>
              <SecondaryButton
                style={styles.resetSecondaryBtnSolo}
                onPress={() => router.push("/(tabs)/steps")}
                label="Browse Resets"
                textStyle={styles.resetSecondaryBtnText}
              />
            </>
          )}
        </BrandCard>

        {!isPremium && !premiumLoading ? (
          <BrandCard withCampfire style={styles.proCard}>
            <SectionHeader eyebrow="Step Outside Premium" title="Keep your reset close." style={styles.proHeader} />
            <Text style={styles.proBody}>
              Unlock the full version for a steadier rhythm, smarter route support, and a more
              intentional daily practice.
            </Text>

            <PrimaryButton
              style={styles.proButton}
              onPress={() => router.push("/pro")}
              label="Explore Premium"
              textStyle={styles.proButtonText}
            />
          </BrandCard>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "transparent",
  },
  container: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 28,
    gap: 16,
  },
  heroCard: {
    minHeight: 430,
    borderRadius: OutdoorTheme.radii.xxl,
    padding: 22,
    backgroundColor: OutdoorTheme.colors.paper,
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.12)",
    overflow: "hidden",
    ...OutdoorTheme.shadows.card,
  },
  heroAtmosphere: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,249,239,0.1)",
  },
  heroMasthead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  heroPillColumn: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
    gap: 8,
  },
  datePill: {
    maxWidth: "100%",
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: "rgba(198,155,66,0.22)",
    borderWidth: 1,
    borderColor: "rgba(198,155,66,0.34)",
  },
  datePillText: {
    color: OutdoorTheme.colors.goldText,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  statusPill: {
    maxWidth: "100%",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,249,239,0.72)",
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.12)",
  },
  statusPillText: {
    color: BRAND.forest,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
    textAlign: "right",
  },
  heroCopy: {
    marginTop: 46,
    gap: 8,
    maxWidth: 350,
  },
  greeting: {
    color: OutdoorTheme.colors.goldText,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  microcopy: {
    color: BRAND.charcoal,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
    fontSize: 38,
    lineHeight: 43,
    fontWeight: "700",
    letterSpacing: 0,
  },
  heroSupportLine: {
    color: "rgba(30,42,36,0.68)",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
    maxWidth: 350,
  },
  heroSupportLineSecondary: {
    color: "rgba(30,42,36,0.72)",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "800",
    maxWidth: 350,
  },
  primaryCta: {
    minHeight: 56,
    flex: 1,
    borderRadius: OutdoorTheme.radii.pill,
    backgroundColor: "#101814",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    shadowColor: "#0D2D20",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  primaryCtaText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  personalMetricsRow: {
    marginTop: 22,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  personalMetric: {
    flex: 1,
    minWidth: 88,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: OutdoorTheme.radii.md,
    backgroundColor: "rgba(255,249,239,0.72)",
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.12)",
  },
  personalMetricValue: {
    color: BRAND.forest,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
  },
  personalMetricLabel: {
    marginTop: 3,
    color: "rgba(30,42,36,0.58)",
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  personalActions: {
    marginTop: 16,
    flexDirection: "row",
    gap: 10,
  },
  heroSecondaryCta: {
    flex: 1,
    minHeight: 56,
    borderRadius: OutdoorTheme.radii.pill,
    backgroundColor: "rgba(255,249,239,0.78)",
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroSecondaryCtaText: {
    color: BRAND.forest,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  communityCard: {
    borderRadius: OutdoorTheme.radii.xl,
    padding: 20,
    backgroundColor: "rgba(255,249,239,0.9)",
    borderWidth: 1,
    borderColor: OutdoorTheme.colors.lineSoft,
    overflow: "hidden",
    ...OutdoorTheme.shadows.soft,
  },
  communityCountRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 9,
  },
  communityCount: {
    color: BRAND.forest,
    fontSize: 36,
    lineHeight: 40,
    fontWeight: "900",
  },
  communityCountLabel: {
    flex: 1,
    color: BRAND.charcoal,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
  },
  updateList: {
    marginTop: 12,
    gap: 8,
  },
  updateRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: OutdoorTheme.radii.md,
    backgroundColor: "rgba(24,68,47,0.06)",
  },
  updateDot: {
    marginTop: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BRAND.sunrise,
  },
  updateCopy: {
    flex: 1,
    minWidth: 0,
  },
  updateTitle: {
    color: BRAND.charcoal,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
  },
  updateMeta: {
    marginTop: 3,
    color: OutdoorTheme.colors.mutedText,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  encouragementPanel: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(24,68,47,0.18)",
  },
  encouragementLabel: {
    color: OutdoorTheme.colors.goldText,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  encouragementText: {
    marginTop: 5,
    color: OutdoorTheme.colors.mutedText,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  emptyPanel: {
    marginTop: 14,
    padding: 15,
    borderRadius: OutdoorTheme.radii.lg,
    backgroundColor: "rgba(24,68,47,0.06)",
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.09)",
  },
  emptyPanelCompact: {
    marginTop: 12,
    padding: 13,
    borderRadius: OutdoorTheme.radii.md,
    backgroundColor: "rgba(24,68,47,0.05)",
  },
  emptyTitle: {
    color: BRAND.charcoal,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
  },
  emptyBody: {
    marginTop: 5,
    color: OutdoorTheme.colors.mutedText,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  cardAction: {
    marginTop: 13,
    minHeight: 46,
    borderRadius: OutdoorTheme.radii.md,
    backgroundColor: "rgba(255,249,239,0.7)",
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardActionText: {
    color: BRAND.forest,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  challengeCard: {
    borderRadius: OutdoorTheme.radii.xl,
    padding: 20,
    backgroundColor: "rgba(255,249,239,0.92)",
    borderWidth: 1,
    borderColor: "rgba(198,155,66,0.26)",
    ...OutdoorTheme.shadows.soft,
  },
  challengeWith: {
    marginTop: 12,
    color: OutdoorTheme.colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  challengeProgressTrack: {
    marginTop: 14,
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(24,68,47,0.1)",
    overflow: "hidden",
  },
  challengeProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: BRAND.sunrise,
  },
  challengeStatRow: {
    marginTop: 15,
    flexDirection: "row",
    gap: 8,
  },
  challengeStat: {
    flex: 1,
    minWidth: 0,
  },
  challengeStatValue: {
    color: BRAND.forest,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
  },
  challengeStatLabel: {
    marginTop: 2,
    color: OutdoorTheme.colors.mutedText,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "800",
  },
  challengeNote: {
    marginTop: 12,
    color: OutdoorTheme.colors.mutedText,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
  },
  teamCard: {
    borderRadius: OutdoorTheme.radii.xl,
    padding: 20,
    backgroundColor: "rgba(255,249,239,0.9)",
    borderWidth: 1,
    borderColor: OutdoorTheme.colors.lineSoft,
    overflow: "hidden",
    ...OutdoorTheme.shadows.soft,
  },
  emptyPanelForest: {
    marginTop: 14,
    padding: 16,
    borderRadius: OutdoorTheme.radii.lg,
    backgroundColor: BRAND.forest,
  },
  emptyTitleForest: {
    color: OutdoorTheme.colors.onForest,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
  },
  emptyBodyForest: {
    marginTop: 6,
    color: OutdoorTheme.colors.onForestMuted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  teamUnavailableRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },
  teamUnavailableItem: {
    flex: 1,
    padding: 11,
    borderRadius: OutdoorTheme.radii.md,
    backgroundColor: "rgba(255,249,239,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,249,239,0.12)",
  },
  teamUnavailableLabel: {
    color: OutdoorTheme.colors.onForestMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "800",
  },
  teamUnavailableValue: {
    marginTop: 4,
    color: OutdoorTheme.colors.onForest,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
  },
  cardActionLight: {
    marginTop: 14,
    minHeight: 46,
    borderRadius: OutdoorTheme.radii.md,
    backgroundColor: OutdoorTheme.colors.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  cardActionLightText: {
    color: BRAND.forest,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  campfirePreviewCard: {
    borderRadius: OutdoorTheme.radii.xl,
    padding: 20,
    backgroundColor: "rgba(255,249,239,0.9)",
    borderWidth: 1,
    borderColor: "rgba(217,132,47,0.2)",
    overflow: "hidden",
    ...OutdoorTheme.shadows.soft,
  },
  reflectionPrompt: {
    marginTop: 13,
    color: BRAND.charcoal,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
    fontSize: 19,
    lineHeight: 26,
    fontWeight: "700",
  },
  reflectionInput: {
    marginTop: 13,
    minHeight: 88,
    padding: 13,
    borderRadius: OutdoorTheme.radii.md,
    backgroundColor: "rgba(255,255,255,0.56)",
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.14)",
    color: BRAND.charcoal,
    fontSize: 14,
    lineHeight: 20,
  },
  reflectionFooter: {
    marginTop: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  reflectionPrivacy: {
    flex: 1,
    color: OutdoorTheme.colors.mutedText,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
  },
  reflectionSave: {
    minWidth: 84,
    minHeight: 44,
    borderRadius: OutdoorTheme.radii.pill,
    backgroundColor: BRAND.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  reflectionSaveText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  focusCard: {
    borderRadius: OutdoorTheme.radii.xl,
    padding: 20,
    backgroundColor: OutdoorTheme.colors.paperTranslucent,
    borderWidth: 1,
    borderColor: OutdoorTheme.colors.lineSoft,
    overflow: "hidden",
    ...OutdoorTheme.shadows.soft,
  },
  focusFire: {
    position: "absolute",
    right: 18,
    top: 18,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
  },
  cardHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  focusHeader: {
    flex: 1,
  },
  tinyGoldMark: {
    marginTop: 5,
    width: 34,
    height: 5,
    borderRadius: 999,
    backgroundColor: OutdoorTheme.colors.gold,
  },
  focusTitle: {
    marginTop: 10,
    color: BRAND.charcoal,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
    fontSize: 24,
    lineHeight: 31,
    fontWeight: "700",
    maxWidth: 360,
  },
  focusBody: {
    marginTop: 12,
    color: "rgba(30,42,36,0.78)",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
  },
  focusReward: {
    marginTop: 10,
    color: OutdoorTheme.colors.sage,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "800",
  },
  statsSummaryCard: {
    borderRadius: OutdoorTheme.radii.xl,
    padding: 18,
    backgroundColor: "rgba(255,249,239,0.9)",
    borderWidth: 1,
    borderColor: OutdoorTheme.colors.lineSoft,
    ...OutdoorTheme.shadows.soft,
  },
  statsGrid: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statTile: {
    flexGrow: 1,
    flexBasis: "47%",
    minHeight: 88,
    borderRadius: OutdoorTheme.radii.lg,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: OutdoorTheme.colors.paper,
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.10)",
    justifyContent: "space-between",
  },
  streakCard: {
    borderRadius: OutdoorTheme.radii.xxl,
    padding: 18,
    backgroundColor: "rgba(255,249,239,0.9)",
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.12)",
    overflow: "hidden",
    ...OutdoorTheme.shadows.card,
  },
  streakFire: {
    position: "absolute",
    right: 22,
    top: 50,
  },
  streakHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
  },
  streakSectionHeader: {
    flex: 1,
  },
  campsiteArtWrap: {
    marginTop: 16,
    height: 210,
    borderRadius: OutdoorTheme.radii.xl,
    overflow: "hidden",
    backgroundColor: OutdoorTheme.colors.paper,
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.10)",
  },
  campsiteStagePill: {
    position: "absolute",
    left: 14,
    bottom: 14,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: OutdoorTheme.radii.pill,
    backgroundColor: "rgba(255,249,239,0.82)",
    borderWidth: 1,
    borderColor: "rgba(198,155,66,0.22)",
  },
  campsiteStageText: {
    color: OutdoorTheme.colors.goldText,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  campsiteStatsRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  campsiteStreakBadge: {
    width: 92,
    minHeight: 78,
    borderRadius: OutdoorTheme.radii.xl,
    backgroundColor: OutdoorTheme.colors.forest,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(198,155,66,0.28)",
  },
  streakNumber: {
    color: OutdoorTheme.colors.gold,
    fontSize: 38,
    lineHeight: 42,
    fontWeight: "900",
  },
  streakCopy: {
    flex: 1,
    minWidth: 0,
    paddingBottom: 8,
  },
  streakUnit: {
    color: OutdoorTheme.colors.onForestMuted,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  streakNote: {
    color: OutdoorTheme.colors.charcoal,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "900",
    maxWidth: 240,
  },
  streakStatusLine: {
    marginTop: 5,
    color: OutdoorTheme.colors.mutedText,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  heroMetricsRow: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  heroMetricChip: {
    flex: 1,
    minWidth: 132,
    borderRadius: OutdoorTheme.radii.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "rgba(24,68,47,0.08)",
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.12)",
  },
  heroMetricLabel: {
    color: "rgba(30,42,36,0.52)",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  heroMetricValue: {
    marginTop: 6,
    color: BRAND.forest,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  momentumPanel: {
    borderRadius: OutdoorTheme.radii.xl,
    padding: 18,
    backgroundColor: BRAND.forest,
    borderWidth: 1,
    borderColor: "rgba(255,249,239,0.12)",
    overflow: "hidden",
    ...OutdoorTheme.shadows.soft,
  },
  momentumPines: {
    position: "absolute",
    right: -24,
    top: 16,
  },
  sectionTitle: {
    color: BRAND.charcoal,
    fontSize: 18,
    fontWeight: "900",
  },
  sectionTitleOnGreen: {
    color: "#F7F4EC",
    fontSize: 18,
    fontWeight: "900",
  },
  sectionLink: {
    color: BRAND.forest,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  sectionLinkOnGreen: {
    color: BRAND.sunrise,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.4,
    paddingVertical: 6,
  },
  progressGrid: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    width: "47%",
    borderRadius: 22,
    paddingVertical: 18,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255,249,239,0.56)",
    borderWidth: 1,
    borderColor: "rgba(30,42,36,0.08)",
  },
  statCardOnGreen: {
    width: "47%",
    borderRadius: OutdoorTheme.radii.lg,
    paddingVertical: 18,
    paddingHorizontal: 16,
    backgroundColor: "rgba(247,244,236,0.12)",
    borderWidth: 1,
    borderColor: "rgba(247,244,236,0.16)",
  },
  statLabel: {
    color: "rgba(30,42,36,0.56)",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  statLabelOnGreen: {
    color: "rgba(247,244,236,0.72)",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  statValue: {
    marginTop: 8,
    color: BRAND.charcoal,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "900",
  },
  statValueOnGreen: {
    marginTop: 8,
    color: "#FFFFFF",
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "900",
  },
  statMeta: {
    marginTop: 4,
    color: "rgba(30,42,36,0.58)",
    fontSize: 12,
    fontWeight: "700",
  },
  statMetaOnGreen: {
    marginTop: 4,
    color: "rgba(247,244,236,0.72)",
    fontSize: 12,
    fontWeight: "700",
  },
  premiumStreakCard: {
    marginTop: 14,
    borderRadius: OutdoorTheme.radii.lg,
    padding: 16,
    backgroundColor: "rgba(24,68,47,0.08)",
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.12)",
  },
  premiumStreakEyebrow: {
    color: OutdoorTheme.colors.goldText,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  premiumStreakRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  premiumStreakLabel: {
    color: OutdoorTheme.colors.mutedText,
    fontSize: 13,
    fontWeight: "700",
  },
  premiumStreakValue: {
    color: OutdoorTheme.colors.forest,
    fontSize: 13,
    fontWeight: "900",
  },
  premiumStreakBody: {
    marginTop: 12,
    color: "rgba(30,42,36,0.76)",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  premiumPreviewCard: {
    marginTop: 14,
    borderRadius: OutdoorTheme.radii.lg,
    padding: 16,
    backgroundColor: "rgba(24,68,47,0.08)",
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.12)",
  },
  premiumPreviewEyebrow: {
    color: OutdoorTheme.colors.goldText,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  premiumPreviewTitle: {
    marginTop: 8,
    color: OutdoorTheme.colors.charcoal,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
  },
  premiumPreviewBody: {
    marginTop: 8,
    color: "rgba(30,42,36,0.72)",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  premiumPreviewRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  premiumPreviewLabel: {
    color: OutdoorTheme.colors.mutedText,
    fontSize: 13,
    fontWeight: "700",
  },
  premiumPreviewPlaceholder: {
    color: OutdoorTheme.colors.forest,
    fontSize: 13,
    fontWeight: "900",
  },
  sparkCard: {
    borderRadius: OutdoorTheme.radii.xl,
    padding: 20,
    backgroundColor: OutdoorTheme.colors.paperTranslucent,
    borderWidth: 1,
    borderColor: OutdoorTheme.colors.lineSoft,
    overflow: "hidden",
    ...OutdoorTheme.shadows.soft,
  },
  sparkFire: {
    position: "absolute",
    right: 18,
    top: 18,
  },
  cardEyebrow: {
    color: BRAND.forest,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  sparkQuote: {
    marginTop: 10,
    color: BRAND.charcoal,
    fontSize: 24,
    lineHeight: 31,
    fontWeight: "900",
  },
  sparkMission: {
    marginTop: 12,
    color: "rgba(30,42,36,0.8)",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
  },
  sparkReward: {
    marginTop: 10,
    color: "rgba(30,42,36,0.6)",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  resetCard: {
    borderRadius: OutdoorTheme.radii.xl,
    padding: 20,
    backgroundColor: OutdoorTheme.colors.forestTint,
    borderWidth: 1,
    borderColor: OutdoorTheme.colors.line,
    overflow: "hidden",
  },
  actionCard: {
    borderRadius: OutdoorTheme.radii.xl,
    padding: 20,
    backgroundColor: "rgba(255,249,239,0.78)",
    borderWidth: 1,
    borderColor: OutdoorTheme.colors.line,
    overflow: "hidden",
    ...OutdoorTheme.shadows.soft,
  },
  resetPines: {
    position: "absolute",
    right: -28,
    bottom: -20,
  },
  suggestedHeader: {
    marginBottom: 4,
  },
  loadingRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    color: "rgba(30,42,36,0.7)",
    fontSize: 14,
    fontWeight: "700",
  },
  resetEmptyArt: {
    position: "absolute",
    right: -10,
    top: 64,
    width: 188,
    height: 116,
    alignItems: "center",
    justifyContent: "center",
  },
  resetTitle: {
    marginTop: 10,
    color: BRAND.charcoal,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
  },
  resetMeta: {
    marginTop: 8,
    color: "rgba(30,42,36,0.68)",
    fontSize: 14,
    fontWeight: "800",
  },
  resetNote: {
    marginTop: 8,
    color: "rgba(30,42,36,0.72)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  resetActions: {
    marginTop: 16,
    flexDirection: "row",
    gap: 10,
  },
  resetPrimaryBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: OutdoorTheme.radii.md,
    backgroundColor: BRAND.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  resetPrimaryBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  resetSecondaryBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: OutdoorTheme.radii.md,
    backgroundColor: "rgba(255,249,239,0.58)",
    borderWidth: 1,
    borderColor: "rgba(30,42,36,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  resetSecondaryBtnSolo: {
    marginTop: 16,
    minHeight: 50,
    borderRadius: OutdoorTheme.radii.md,
    backgroundColor: "rgba(255,249,239,0.58)",
    borderWidth: 1,
    borderColor: "rgba(30,42,36,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  resetSecondaryBtnText: {
    color: BRAND.charcoal,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  proCard: {
    borderRadius: OutdoorTheme.radii.xl,
    padding: 20,
    backgroundColor: "rgba(198,155,66,0.18)",
    borderWidth: 1,
    borderColor: "rgba(198,155,66,0.34)",
  },
  proHeader: {
    marginBottom: 4,
  },
  proTitle: {
    marginTop: 10,
    color: BRAND.charcoal,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
  },
  proBody: {
    marginTop: 10,
    color: "rgba(30,42,36,0.76)",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
  },
  proButton: {
    marginTop: 16,
    minHeight: 50,
    borderRadius: OutdoorTheme.radii.md,
    backgroundColor: BRAND.charcoal,
    alignItems: "center",
    justifyContent: "center",
  },
  proButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
});
