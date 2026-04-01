import { collection, getDocs, limit, query, where } from "firebase/firestore";

import { SEEDED_ROUTE_SPOTS, SEEDED_ZIP_CENTROIDS, type RouteKind, type RouteSpotDoc } from "../data/routeCatalogSeed";
import { db } from "./firebase";

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
  source: "catalog" | "zip";
};

const ROUTES_COLLECTION = "routes";
const REGION_CELL_SIZE = 0.25;

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
  return rankByDistanceAndQuality(SEEDED_ROUTE_SPOTS, centroid, "zip");
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return items.filter((item, index, array) => array.findIndex((candidate) => candidate.id === item.id) === index);
}

export async function getRouteSuggestionsNearCoords(coords: { lat: number; lng: number }): Promise<RouteSuggestion[]> {
  const regionKeys = neighboringRegionKeys(coords.lat, coords.lng);

  try {
    const snapshot = await getDocs(
      query(collection(db, ROUTES_COLLECTION), where("regionKey", "in", regionKeys), limit(24))
    );

    const liveRoutes = snapshot.docs
      .map((doc) => doc.data() as RouteSpotDoc)
      .filter((route) => typeof route?.lat === "number" && typeof route?.lng === "number");

    const ranked = rankByDistanceAndQuality(uniqueById(liveRoutes), coords, "catalog");
    if (ranked.length > 0) return ranked;
  } catch {
    // Firestore is optional at launch; bundled seeds keep the feature usable while the catalog grows.
  }

  return seedRoutesNearCoords(coords);
}

export async function getRouteSuggestionsByZip(zip: string): Promise<RouteSuggestion[]> {
  const normalized = normalizeZip(zip);
  if (normalized.length !== 5) return [];

  try {
    const snapshot = await getDocs(
      query(collection(db, ROUTES_COLLECTION), where("zipCodes", "array-contains", normalized), limit(24))
    );

    const liveRoutes = snapshot.docs
      .map((doc) => doc.data() as RouteSpotDoc)
      .filter((route) => Array.isArray(route?.zipCodes));

    if (liveRoutes.length > 0) {
      const centroid = SEEDED_ZIP_CENTROIDS.find((entry) => entry.zip === normalized);
      return centroid
        ? rankByDistanceAndQuality(uniqueById(liveRoutes), centroid, "zip")
        : uniqueById(liveRoutes).slice(0, 8).map((route) => toSuggestion(route, "zip"));
    }
  } catch {
    // Firestore lookup is optional; fall back to the bundled seed catalog.
  }

  return seedRoutesByZip(normalized);
}

export function getRouteCatalogZipHint(zip: string): string {
  const normalized = normalizeZip(zip);
  if (normalized.length !== 5) return "Enter a 5-digit ZIP code.";
  const hasSeed = SEEDED_ZIP_CENTROIDS.some((entry) => entry.zip === normalized);
  return hasSeed
    ? "Showing the closest seeded routes first. Firestore routes will appear here as the catalog grows."
    : "We have not seeded that ZIP yet. Start with nearby park loops in a seeded area, then expand the catalog city by city.";
}

export { normalizeZip, regionKeyForCoords };
