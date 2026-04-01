# Route Catalog MVP

## Goal

Build a lightweight owned database of short walks that works even when live path search is flaky or the user prefers ZIP-based browsing.

## Firestore shape

Collection: `routes`

```ts
type RouteSpotDoc = {
  id: string;
  name: string;
  kind: "park_loop" | "trail" | "indoor_walk";
  lat: number;
  lng: number;
  zipCodes: string[];
  regionKey: string;
  distanceMeters: number;
  estMinutes: number;
  surface: "paved" | "mixed" | "indoor" | null;
  tags: string[];
  source: "osm_seed" | "manual";
  qualityScore: number;
  isIndoor: boolean;
};
```

## Query strategy

- Location allowed:
  - compute nearby `regionKey` buckets
  - fetch matching routes from Firestore
  - rank by distance and `qualityScore`
- Location denied:
  - ask for ZIP
  - query `zipCodes` with `array-contains`
  - fall back to bundled seed routes

## How to seed it

1. Run:

```bash
node ./scripts/build-route-catalog.mjs chicago austin
```

2. Review the output in `tmp/route-catalog-seed.json`
3. Import the JSON into Firestore collection `routes`
4. Add a few manual indoor routes per city:
   - malls
   - gyms with indoor tracks
   - rec centers
   - large public facilities

## Rollout order

1. Seed 3 to 5 metros with dense park paths
2. Add indoor backup walks for rain/heat cities
3. Track which routes are opened/saved most
4. Promote the strongest routes to higher `qualityScore`

## Notes

- OSM/Overpass is a great seeding source, but keep attribution and ODbL obligations in mind.
- This MVP does not require a custom backend.
- Firestore is optional at launch because the app includes a bundled seed catalog fallback.
