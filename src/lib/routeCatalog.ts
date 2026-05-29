import AsyncStorage from "@react-native-async-storage/async-storage";
import { ENV } from "../../env";
import { SEEDED_ROUTE_SPOTS, SEEDED_ZIP_CENTROIDS, type RouteKind, type RouteSpotDoc } from "../data/routeCatalogSeed";

export type RouteSuggestion = {
  id: string;
  name: string;
  kind: RouteKind;
  lat: number;
  lng: number;
  distanceMeters: number;
  estMinutes: number;
  isIndoor: boolean;
  tags: string[];
  source: "catalog" | "zip" | "gym" | "nearby" | "fallback";
};

const REGION_CELL_SIZE = 0.25;
const ZIP_MATCH_RADIUS_METERS = 1000 * 160.934;
const FALLBACK_RADIUS_METERS = 1000 * 120.701;
const GYM_SEARCH_RADIUS_METERS = 30 * 1609.34;
const GYM_RESET_DISTANCE_METERS = 1609;
const GYM_RESET_MINUTES = 18;
const ZIP_LOOKUP_URL = "https://api.zippopotam.us/us";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const ROUTE_SUGGESTIONS_CACHE_KEY = "@stepoutside/recentSuggestions";
const GOOGLE_PLACES_NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby";
const GOOGLE_PLACES_TIMEOUT_MS = 4500;
const GOOGLE_PLACES_NEARBY_RADIUS_METERS = 9000;
const GOOGLE_PLACES_ZIP_RADIUS_METERS = 12000;
const GOOGLE_PLACES_MAX_RESULTS = 10;
const GOOGLE_PLACES_FIELD_MASK =
  "places.id,places.displayName,places.location,places.primaryType,places.types,places.formattedAddress,places.businessStatus";
const GOOGLE_PLACES_INCLUDED_TYPES = [
  "park",
  "hiking_area",
  "dog_park",
  "botanical_garden",
  "campground",
  "tourist_attraction",
] as const;

function regionKeyForCoords(lat: number, lng: number): string {
  const latBucket = Math.floor(lat / REGION_CELL_SIZE);
  const lngBucket = Math.floor(lng / REGION_CELL_SIZE);
  return `${latBucket}:${lngBucket}`;
}

function neighboringRegionKeys(lat: number, lng: number): string[] {
  const latBucket = Math.floor(lat / REGION_CELL_SIZE);
  const lngBucket = Math.floor(lng / REGION_CELL_SIZE);
  const keys: string[] = [];

  for (let latOffset = -1; latOffset <= 1; latOffset += 1) {
    for (let lngOffset = -1; lngOffset <= 1; lngOffset += 1) {
      keys.push(`${latBucket + latOffset}:${lngBucket + lngOffset}`);
    }
  }

  return keys;
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return R * c;
}

function normalizeZip(zip: string): string {
  return zip.replace(/\D/g, "").slice(0, 5);
}

function isRouteSuggestion(value: unknown): value is RouteSuggestion {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RouteSuggestion>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    (candidate.kind === "park_loop" || candidate.kind === "trail" || candidate.kind === "indoor_walk") &&
    typeof candidate.lat === "number" &&
    Number.isFinite(candidate.lat) &&
    typeof candidate.lng === "number" &&
    Number.isFinite(candidate.lng) &&
    typeof candidate.distanceMeters === "number" &&
    Number.isFinite(candidate.distanceMeters) &&
    typeof candidate.estMinutes === "number" &&
    Number.isFinite(candidate.estMinutes) &&
    typeof candidate.isIndoor === "boolean" &&
    Array.isArray(candidate.tags) &&
    candidate.tags.every((tag) => typeof tag === "string") &&
    (candidate.source === "catalog" ||
      candidate.source === "zip" ||
      candidate.source === "gym" ||
      candidate.source === "nearby" ||
      candidate.source === "fallback")
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function toSuggestion(route: RouteSpotDoc, source: "catalog" | "zip"): RouteSuggestion {
  return {
    id: route.id,
    name: route.name,
    kind: route.kind,
    lat: route.lat,
    lng: route.lng,
    distanceMeters: route.distanceMeters,
    estMinutes: route.estMinutes,
    isIndoor: route.isIndoor,
    tags: route.tags,
    source,
  };
}

type GymElement = {
  id: number;
  lat?: number;
  lon?: number;
  center?: {
    lat: number;
    lon: number;
  };
  tags?: Record<string, string | undefined>;
};

type GooglePlacesNearbyResponse = {
  places?: GooglePlace[];
};

type GooglePlace = {
  id?: string;
  displayName?: {
    text?: string;
  };
  location?: {
    latitude?: number;
    longitude?: number;
  };
  primaryType?: string;
  types?: string[];
  formattedAddress?: string;
  businessStatus?: string;
};

function parseGymElementCoords(element: GymElement): { lat: number; lng: number } | null {
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat: lat as number, lng: lng as number };
}

function gymPriority(name: string): number {
  const lowered = name.toLowerCase();
  if (lowered.includes("ymca")) return 0;
  if (lowered.includes("planet fitness")) return 1;
  return 2;
}

function gymTagsForName(name: string): string[] {
  const lowered = name.toLowerCase();
  const tags = ["indoor", "gym"];
  if (lowered.includes("ymca")) tags.push("ymca");
  if (lowered.includes("planet fitness")) tags.push("planet-fitness");
  return tags;
}

function toGymSuggestion(name: string, coords: { lat: number; lng: number }): RouteSuggestion {
  return {
    id: `gym-${slugify(name)}-${Math.round(coords.lat * 1000)}-${Math.round(coords.lng * 1000)}`,
    name: `${name} Reset`,
    kind: "indoor_walk",
    lat: coords.lat,
    lng: coords.lng,
    distanceMeters: GYM_RESET_DISTANCE_METERS,
    estMinutes: GYM_RESET_MINUTES,
    isIndoor: true,
    tags: gymTagsForName(name),
    source: "gym",
  };
}

function formatMilesAway(distanceMeters: number): string {
  const miles = distanceMeters / 1609.34;
  if (miles < 0.15) return "very close";
  if (miles < 1) return `${miles.toFixed(1)} mi away`;
  return `${Math.round(miles * 10) / 10} mi away`;
}

function humanizePlaceType(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function inferRouteKindFromPlace(place: GooglePlace): RouteKind {
  const types = new Set(place.types ?? []);
  if (types.has("hiking_area") || types.has("campground")) {
    return "trail";
  }
  return "park_loop";
}

function estimateWalkDistanceMeters(kind: RouteKind, place: GooglePlace, distanceAwayMeters: number): number {
  const types = new Set(place.types ?? []);
  const longerWalk =
    kind === "trail" || types.has("hiking_area") || types.has("campground") || types.has("tourist_attraction");

  const baseDistance = longerWalk ? 1600 : 1050;
  const proximityBonus = distanceAwayMeters < 400 ? 0 : distanceAwayMeters < 1500 ? 120 : 240;
  return Math.round(Math.max(750, Math.min(2600, baseDistance + proximityBonus)));
}

function estimateWalkMinutes(distanceMeters: number): number {
  const walkingSpeedMetersPerMinute = 78;
  return Math.max(10, Math.min(34, Math.round(distanceMeters / walkingSpeedMetersPerMinute)));
}

function googlePlaceTypeTags(place: GooglePlace, distanceAwayMeters: number): string[] {
  const type = place.primaryType ?? place.types?.[0] ?? "nearby";
  const baseTags = [humanizePlaceType(type), formatMilesAway(distanceAwayMeters)];
  const tags = [...baseTags];
  if ((place.types ?? []).includes("park")) tags.unshift("Park");
  if ((place.types ?? []).includes("hiking_area")) tags.unshift("Trail");
  if ((place.types ?? []).includes("dog_park")) tags.unshift("Dog-friendly");
  if ((place.types ?? []).includes("botanical_garden")) tags.unshift("Calm");
  return Array.from(new Set(tags)).slice(0, 4);
}

function toGooglePlaceSuggestion(
  place: GooglePlace,
  origin: { lat: number; lng: number },
  source: "nearby" | "zip"
): RouteSuggestion | null {
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  const name = place.displayName?.text?.trim();
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (place.businessStatus === "CLOSED_PERMANENTLY") return null;

  const coords = { lat: lat as number, lng: lng as number };
  const distanceAwayMeters = haversineMeters(origin, coords);
  const kind = inferRouteKindFromPlace(place);
  const distanceMeters = estimateWalkDistanceMeters(kind, place, distanceAwayMeters);

  return {
    id: `google-place-${place.id ?? slugify(name)}`,
    name,
    kind,
    lat: coords.lat,
    lng: coords.lng,
    distanceMeters,
    estMinutes: estimateWalkMinutes(distanceMeters),
    isIndoor: false,
    tags: googlePlaceTypeTags(place, distanceAwayMeters),
    source,
  };
}

function suggestionQuality(route: RouteSuggestion): number {
  let quality = 0;
  if (route.source === "catalog" || route.source === "zip") quality += 18;
  if (route.source === "nearby") quality += 12;
  if (route.kind === "trail") quality += 10;
  if (route.kind === "park_loop") quality += 8;
  if (route.isIndoor) quality -= 6;
  if (route.tags.some((tag) => /park|trail|nature|water|shade|calm/i.test(tag))) quality += 4;
  return quality;
}

function rankSuggestionsByDistanceAndQuality(
  routes: RouteSuggestion[],
  coords: { lat: number; lng: number }
): RouteSuggestion[] {
  const deduped = new Map<string, RouteSuggestion>();

  for (const route of routes) {
    const key = `${slugify(route.name)}:${Math.round(route.lat * 1000)}:${Math.round(route.lng * 1000)}`;
    const existing = deduped.get(key);
    if (!existing || suggestionQuality(route) > suggestionQuality(existing)) {
      deduped.set(key, route);
    }
  }

  return [...deduped.values()]
    .sort((a, b) => {
      const distanceA = haversineMeters(coords, { lat: a.lat, lng: a.lng });
      const distanceB = haversineMeters(coords, { lat: b.lat, lng: b.lng });
      const scoreA = distanceA / 280 - suggestionQuality(a) * 14;
      const scoreB = distanceB / 280 - suggestionQuality(b) * 14;
      return scoreA - scoreB;
    })
    .slice(0, 8);
}

async function fetchGooglePlacesNearby(
  coords: { lat: number; lng: number },
  source: "nearby" | "zip"
): Promise<RouteSuggestion[]> {
  if (!ENV.MAPS.placesSuggestionsEnabled || !ENV.MAPS.placesApiKey) {
    return [];
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GOOGLE_PLACES_TIMEOUT_MS);

  try {
    const response = await fetch(GOOGLE_PLACES_NEARBY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": ENV.MAPS.placesApiKey,
        "X-Goog-FieldMask": GOOGLE_PLACES_FIELD_MASK,
      },
      body: JSON.stringify({
        includedTypes: GOOGLE_PLACES_INCLUDED_TYPES,
        maxResultCount: GOOGLE_PLACES_MAX_RESULTS,
        rankPreference: "DISTANCE",
        locationRestriction: {
          circle: {
            center: {
              latitude: coords.lat,
              longitude: coords.lng,
            },
            radius: source === "zip" ? GOOGLE_PLACES_ZIP_RADIUS_METERS : GOOGLE_PLACES_NEARBY_RADIUS_METERS,
          },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (__DEV__) {
        console.warn(`[places] Nearby search failed with ${response.status}.`);
      }
      return [];
    }

    const data = (await response.json()) as GooglePlacesNearbyResponse;
    return (data.places ?? [])
      .map((place) => toGooglePlaceSuggestion(place, coords, source))
      .filter((place): place is RouteSuggestion => place !== null);
  } catch (error) {
    if (__DEV__) {
      console.warn("[places] Nearby search request failed.", error);
    }
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchCoordsForZip(zip: string): Promise<{ lat: number; lng: number } | null> {
  const normalized = normalizeZip(zip);
  if (normalized.length !== 5) return null;

  const seeded = SEEDED_ZIP_CENTROIDS.find((entry) => entry.zip === normalized);
  if (seeded) {
    return {
      lat: seeded.lat,
      lng: seeded.lng,
    };
  }

  try {
    const response = await fetch(`${ZIP_LOOKUP_URL}/${normalized}`);
    if (!response.ok) return null;

    const data = (await response.json()) as {
      places?: {
        latitude?: string;
        longitude?: string;
      }[];
    };

    const place = data?.places?.[0];
    const lat = Number(place?.latitude);
    const lng = Number(place?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return { lat, lng };
  } catch {
    return null;
  }
}

async function searchGymNearCoords(coords: { lat: number; lng: number }): Promise<RouteSuggestion | null> {
  const overpassQuery = `
    [out:json][timeout:20];
    (
      nwr["name"~"YMCA|Planet Fitness",i](around:${Math.round(GYM_SEARCH_RADIUS_METERS)},${coords.lat},${coords.lng});
      nwr["leisure"="fitness_centre"](around:${Math.round(GYM_SEARCH_RADIUS_METERS)},${coords.lat},${coords.lng});
      nwr["amenity"="gym"](around:${Math.round(GYM_SEARCH_RADIUS_METERS)},${coords.lat},${coords.lng});
    );
    out center tags;
  `;

  try {
    const response = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: overpassQuery,
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { elements?: GymElement[] };
    const gyms =
      data.elements
        ?.map((element) => {
          const coordsForElement = parseGymElementCoords(element);
          const name = element.tags?.name?.trim();
          if (!coordsForElement || !name) return null;

          return {
            name,
            coords: coordsForElement,
            distance: haversineMeters(coords, coordsForElement),
            priority: gymPriority(name),
          };
        })
        .filter(
          (
            gym
          ): gym is { name: string; coords: { lat: number; lng: number }; distance: number; priority: number } =>
            gym !== null && gym.distance <= GYM_SEARCH_RADIUS_METERS
        )
        .sort((a, b) => (a.priority !== b.priority ? a.priority - b.priority : a.distance - b.distance)) ?? [];

    const best = gyms[0];
    if (!best) return null;

    return toGymSuggestion(best.name, best.coords);
  } catch {
    return null;
  }
}

function rankByDistanceAndQuality(routes: RouteSpotDoc[], coords: { lat: number; lng: number }, source: "catalog" | "zip") {
  return [...routes]
    .sort((a, b) => {
      const distanceA = haversineMeters(coords, { lat: a.lat, lng: a.lng });
      const distanceB = haversineMeters(coords, { lat: b.lat, lng: b.lng });
      const scoreA = distanceA / 300 + (100 - a.qualityScore);
      const scoreB = distanceB / 300 + (100 - b.qualityScore);
      return scoreA - scoreB;
    })
    .slice(0, 8)
    .map((route) => toSuggestion(route, source));
}

function routesWithinRadius(routes: RouteSpotDoc[], coords: { lat: number; lng: number }, radiusMeters: number) {
  return routes.filter((route) => haversineMeters(coords, { lat: route.lat, lng: route.lng }) <= radiusMeters);
}

function seedRoutesNearCoords(coords: { lat: number; lng: number }): RouteSuggestion[] {
  const allowedRegionKeys = new Set(neighboringRegionKeys(coords.lat, coords.lng));
  const local = SEEDED_ROUTE_SPOTS.filter((route) => allowedRegionKeys.has(route.regionKey));
  return rankByDistanceAndQuality(local, coords, "catalog");
}

function seedRoutesByZip(zip: string): RouteSuggestion[] {
  const normalized = normalizeZip(zip);
  const exact = SEEDED_ROUTE_SPOTS.filter((route) => route.zipCodes.includes(normalized));
  if (exact.length > 0) {
    const centroid = SEEDED_ZIP_CENTROIDS.find((entry) => entry.zip === normalized);
    return centroid
      ? rankByDistanceAndQuality(exact, centroid, "zip")
      : exact.slice(0, 8).map((route) => toSuggestion(route, "zip"));
  }

  const centroid = SEEDED_ZIP_CENTROIDS.find((entry) => entry.zip === normalized);
  if (!centroid) return [];
  const regional = routesWithinRadius(SEEDED_ROUTE_SPOTS, centroid, ZIP_MATCH_RADIUS_METERS);
  if (regional.length === 0) return [];
  return rankByDistanceAndQuality(regional, centroid, "zip");
}

export async function getRouteSuggestionsNearCoords(coords: { lat: number; lng: number }): Promise<RouteSuggestion[]> {
  const [googleRoutes] = await Promise.all([fetchGooglePlacesNearby(coords, "nearby")]);
  const seededRoutes = seedRoutesNearCoords(coords);
  return rankSuggestionsByDistanceAndQuality([...googleRoutes, ...seededRoutes], coords);
}

export async function getRouteSuggestionsByZip(zip: string): Promise<RouteSuggestion[]> {
  const normalized = normalizeZip(zip);
  if (normalized.length !== 5) return [];
  const seededRoutes = seedRoutesByZip(normalized);
  const coords = await fetchCoordsForZip(normalized);
  if (!coords) return seededRoutes;

  const googleRoutes = await fetchGooglePlacesNearby(coords, "zip");
  return rankSuggestionsByDistanceAndQuality([...googleRoutes, ...seededRoutes], coords);
}

export async function getGymResetNearCoords(coords: { lat: number; lng: number }): Promise<RouteSuggestion | null> {
  return await searchGymNearCoords(coords);
}

export async function getGymResetByZip(zip: string): Promise<RouteSuggestion | null> {
  const coords = await fetchCoordsForZip(zip);
  if (!coords) return null;
  return await searchGymNearCoords(coords);
}

export async function cacheRouteSuggestions(routes: RouteSuggestion[]): Promise<void> {
  await AsyncStorage.setItem(ROUTE_SUGGESTIONS_CACHE_KEY, JSON.stringify(routes));
}

export async function readCachedRouteSuggestions(): Promise<RouteSuggestion[]> {
  const raw = await AsyncStorage.getItem(ROUTE_SUGGESTIONS_CACHE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRouteSuggestion);
  } catch {
    return [];
  }
}

export function getFallbackRouteSuggestions(coords?: { lat: number; lng: number } | null): RouteSuggestion[] {
  if (coords) {
    const ranked = seedRoutesNearCoords(coords);
    if (ranked.length > 0) return ranked;

     const regional = routesWithinRadius(SEEDED_ROUTE_SPOTS, coords, FALLBACK_RADIUS_METERS);
     if (regional.length > 0) {
       return rankByDistanceAndQuality(regional, coords, "catalog");
     }
  }

  return [];
}

export function getRouteCatalogZipHint(zip: string): string {
  const normalized = normalizeZip(zip);
  if (normalized.length !== 5) return "Enter a 5-digit ZIP code.";
  const hasSeed = SEEDED_ZIP_CENTROIDS.some((entry) => entry.zip === normalized);
  if (ENV.MAPS.placesSuggestionsEnabled && ENV.MAPS.placesApiKey) {
    return hasSeed
      ? "Showing nearby parks and curated reset ideas around that ZIP."
      : "Searching live nearby parks and fallback reset ideas around that ZIP.";
  }
  return hasSeed
    ? "Showing the closest curated resets we have near that ZIP."
    : "We have not curated that ZIP yet. We’ll fall back to simple local reset ideas instead.";
}

export { normalizeZip, regionKeyForCoords };
