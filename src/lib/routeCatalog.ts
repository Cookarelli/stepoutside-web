import AsyncStorage from "@react-native-async-storage/async-storage";
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
  return seedRoutesNearCoords(coords);
}

export async function getRouteSuggestionsByZip(zip: string): Promise<RouteSuggestion[]> {
  const normalized = normalizeZip(zip);
  if (normalized.length !== 5) return [];
  return seedRoutesByZip(normalized);
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
  return hasSeed
    ? "Showing the closest curated resets we have near that ZIP."
    : "We have not curated that ZIP yet. We’ll fall back to simple local reset ideas instead.";
}

export { normalizeZip, regionKeyForCoords };
