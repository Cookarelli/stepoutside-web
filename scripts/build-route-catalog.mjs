#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const METROS = {
  austin: { lat: 30.2672, lng: -97.7431, radiusM: 6500, zip: "78701" },
  chicago: { lat: 41.8781, lng: -87.6298, radiusM: 7000, zip: "60601" },
  miami: { lat: 25.7617, lng: -80.1918, radiusM: 6000, zip: "33132" },
  nyc: { lat: 40.7505, lng: -73.9934, radiusM: 6000, zip: "10018" },
  sf: { lat: 37.7749, lng: -122.4194, radiusM: 7000, zip: "94129" },
};

const MANUAL_INDOOR_ROUTES = {
  chicago: [
    { id: "chi-eastbank-indoor", name: "East Bank Indoor Track Laps", lat: 41.8883, lng: -87.6484, zipCodes: ["60654"], distanceMeters: 805, estMinutes: 10, qualityScore: 78, tags: ["gym", "track", "rainy-day"] },
    { id: "chi-water-tower-loop", name: "Water Tower Place Climate Loop", lat: 41.8988, lng: -87.6243, zipCodes: ["60611"], distanceMeters: 960, estMinutes: 12, qualityScore: 79, tags: ["mall", "indoor", "downtown"] },
    { id: "chi-block37-loop", name: "Block 37 Indoor Reset", lat: 41.8847, lng: -87.6276, zipCodes: ["60602", "60603"], distanceMeters: 840, estMinutes: 10, qualityScore: 77, tags: ["mall", "lunch-break", "rainy-day"] },
    { id: "chi-pedway-loop", name: "Chicago Pedway Warm Walk", lat: 41.8834, lng: -87.6317, zipCodes: ["60602"], distanceMeters: 1100, estMinutes: 14, qualityScore: 82, tags: ["pedway", "winter", "commuter"] },
  ],
  austin: [
    { id: "aus-domain-indoor", name: "Domain Mall Climate Walk", lat: 30.4026, lng: -97.7252, zipCodes: ["78758"], distanceMeters: 1000, estMinutes: 13, qualityScore: 72, tags: ["mall", "indoor", "air-conditioned"] },
    { id: "aus-barton-creek-indoor", name: "Barton Creek Square Indoor Loop", lat: 30.2581, lng: -97.8136, zipCodes: ["78746", "78735"], distanceMeters: 980, estMinutes: 12, qualityScore: 76, tags: ["mall", "heat-safe", "easy"] },
    { id: "aus-lakeline-indoor", name: "Lakeline Mall Comfort Walk", lat: 30.4781, lng: -97.7945, zipCodes: ["78717"], distanceMeters: 1040, estMinutes: 13, qualityScore: 74, tags: ["mall", "north-austin", "backup"] },
    { id: "aus-downtown-ymca-track", name: "Downtown YMCA Indoor Track", lat: 30.2665, lng: -97.7469, zipCodes: ["78701"], distanceMeters: 805, estMinutes: 10, qualityScore: 73, tags: ["gym", "track", "downtown"] },
  ],
  nyc: [
    { id: "nyc-oculus-loop", name: "Oculus Concourse Loop", lat: 40.7116, lng: -74.0113, zipCodes: ["10007"], distanceMeters: 920, estMinutes: 11, qualityScore: 83, tags: ["mall", "downtown", "rainy-day"] },
    { id: "nyc-brookfield-loop", name: "Brookfield Place Climate Walk", lat: 40.7127, lng: -74.015, zipCodes: ["10281"], distanceMeters: 980, estMinutes: 12, qualityScore: 82, tags: ["waterfront", "mall", "quiet"] },
    { id: "nyc-hudson-yards-loop", name: "Hudson Yards Indoor Loop", lat: 40.7538, lng: -74.0019, zipCodes: ["10001"], distanceMeters: 1060, estMinutes: 13, qualityScore: 80, tags: ["mall", "midtown", "backup"] },
    { id: "nyc-chelsea-piers-loop", name: "Chelsea Piers Concourse Walk", lat: 40.7465, lng: -74.0081, zipCodes: ["10011"], distanceMeters: 860, estMinutes: 10, qualityScore: 74, tags: ["sports-complex", "indoor", "riverfront"] },
  ],
  sf: [
    { id: "sf-ggp-indoor", name: "Stonestown Indoor Reset", lat: 37.7287, lng: -122.4761, zipCodes: ["94132"], distanceMeters: 900, estMinutes: 11, qualityScore: 69, tags: ["mall", "indoor", "easy"] },
    { id: "sf-metreon-loop", name: "Metreon Climate Loop", lat: 37.7841, lng: -122.4035, zipCodes: ["94103"], distanceMeters: 880, estMinutes: 10, qualityScore: 76, tags: ["mall", "downtown", "backup"] },
    { id: "sf-japantown-loop", name: "Japantown Center Indoor Walk", lat: 37.785, lng: -122.4294, zipCodes: ["94115"], distanceMeters: 930, estMinutes: 11, qualityScore: 75, tags: ["mall", "covered", "city"] },
    { id: "sf-ferry-building-loop", name: "Ferry Building Arcade Walk", lat: 37.7956, lng: -122.3933, zipCodes: ["94111"], distanceMeters: 820, estMinutes: 10, qualityScore: 72, tags: ["market", "downtown", "backup"] },
  ],
  miami: [
    { id: "mia-brickell-climate", name: "Brickell City Centre Climate Walk", lat: 25.7668, lng: -80.1931, zipCodes: ["33131"], distanceMeters: 990, estMinutes: 12, qualityScore: 80, tags: ["mall", "air-conditioned", "downtown"] },
    { id: "mia-dadeland-loop", name: "Dadeland Mall Indoor Loop", lat: 25.6897, lng: -80.3133, zipCodes: ["33156"], distanceMeters: 1120, estMinutes: 14, qualityScore: 77, tags: ["mall", "heat-safe", "easy"] },
    { id: "mia-dolphin-loop", name: "Dolphin Mall Indoor Reset", lat: 25.7863, lng: -80.3806, zipCodes: ["33172"], distanceMeters: 1180, estMinutes: 15, qualityScore: 75, tags: ["mall", "indoor", "rainy-day"] },
    { id: "mia-aventura-loop", name: "Aventura Indoor Walk", lat: 25.9586, lng: -80.1421, zipCodes: ["33180"], distanceMeters: 1100, estMinutes: 14, qualityScore: 74, tags: ["mall", "covered", "backup"] },
  ],
};

function regionKeyForCoords(lat, lng) {
  const cellSize = 0.25;
  return `${Math.floor(lat / cellSize)}:${Math.floor(lng / cellSize)}`;
}

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function wayLengthMeters(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineMeters(
      { lat: points[i - 1].lat, lng: points[i - 1].lon },
      { lat: points[i].lat, lng: points[i].lon }
    );
  }
  return total;
}

function centroid(points) {
  if (!Array.isArray(points) || points.length === 0) return { lat: 0, lng: 0 };
  const sum = points.reduce((acc, point) => ({ lat: acc.lat + point.lat, lng: acc.lng + point.lon }), {
    lat: 0,
    lng: 0,
  });
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}

function buildQuery({ lat, lng, radiusM }) {
  return `
[out:json][timeout:25];
(
  way["highway"~"path|footway|track"]["name"](around:${radiusM},${lat},${lng});
);
out tags geom 120;
`;
}

async function fetchMetroRoutes(metroKey, config) {
  const delaysMs = [0, 3000, 7000, 12000];
  let lastStatus = 0;

  for (const delayMs of delaysMs) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: buildQuery(config),
    });

    lastStatus = res.status;
    if (res.ok) {
      const json = await res.json();
      const ways = json?.elements ?? [];

      return ways
        .map((way) => {
          const distanceMeters = Math.round(wayLengthMeters(way.geometry ?? []));
          const center = centroid(way.geometry ?? []);
          return {
            id: `${metroKey}-${way.id}`,
            name: way?.tags?.name?.trim() || "Local Park Loop",
            kind: "park_loop",
            lat: Number(center.lat.toFixed(6)),
            lng: Number(center.lng.toFixed(6)),
            zipCodes: [config.zip],
            regionKey: regionKeyForCoords(center.lat, center.lng),
            distanceMeters,
            estMinutes: Math.max(10, Math.round((distanceMeters / 1609.34) * 20)),
            surface: "mixed",
            tags: ["park", metroKey, "osm-seed"],
            source: "osm_seed",
            qualityScore: 70,
            isIndoor: false,
          };
        })
        .filter((route) => route.distanceMeters >= 805 && route.distanceMeters <= 2400 && route.lat && route.lng)
        .filter((route, index, routes) => routes.findIndex((candidate) => candidate.name === route.name) === index)
        .slice(0, 40);
    }

    if (res.status !== 429 && res.status < 500) {
      throw new Error(`Overpass failed for ${metroKey}: ${res.status}`);
    }
  }

  throw new Error(`Overpass failed for ${metroKey}: ${lastStatus}`);
}

function manualIndoorRoutesForMetro(metroKey) {
  return (MANUAL_INDOOR_ROUTES[metroKey] ?? []).map((route) => ({
    ...route,
    kind: "indoor_walk",
    regionKey: regionKeyForCoords(route.lat, route.lng),
    surface: "indoor",
    source: "manual",
    isIndoor: true,
  }));
}

function dedupeById(routes) {
  return routes.filter((route, index, items) => items.findIndex((candidate) => candidate.id === route.id) === index);
}

async function readExistingOutput(outPath) {
  try {
    const raw = await readFile(outPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function main() {
  const requestedMetros = process.argv.slice(2);
  const metros = requestedMetros.length > 0 ? requestedMetros : Object.keys(METROS);

  const outDir = path.resolve(process.cwd(), "tmp");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "route-catalog-seed.json");

  let output = await readExistingOutput(outPath);
  const failed = [];
  for (const metro of metros) {
    const config = METROS[metro];
    if (!config) {
      console.warn(`Skipping unknown metro "${metro}"`);
      continue;
    }

    console.log(`Seeding ${metro}...`);
    try {
      const routes = await fetchMetroRoutes(metro, config);
      output = dedupeById([...output, ...routes, ...manualIndoorRoutesForMetro(metro)]);
      await writeFile(outPath, JSON.stringify(output, null, 2));
      console.log(`Saved ${metro}. Running total: ${output.length} routes.`);
    } catch (error) {
      console.warn(`Failed ${metro}: ${error.message}`);
      failed.push(metro);
    }
  }

  console.log(`Wrote ${output.length} routes to ${outPath}`);
  console.log("Next step: import this JSON into Firestore collection \"routes\".");

  if (failed.length > 0) {
    throw new Error(`Failed metros: ${failed.join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
