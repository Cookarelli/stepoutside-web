export type RouteKind = "park_loop" | "trail" | "indoor_walk";

export type RouteSpotDoc = {
  id: string;
  name: string;
  kind: RouteKind;
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

export type ZipCentroid = {
  zip: string;
  lat: number;
  lng: number;
};

function regionKeyForCoords(lat: number, lng: number): string {
  const cellSize = 0.25;
  const latBucket = Math.floor(lat / cellSize);
  const lngBucket = Math.floor(lng / cellSize);
  return `${latBucket}:${lngBucket}`;
}

function route(
  id: string,
  name: string,
  kind: RouteKind,
  lat: number,
  lng: number,
  zipCodes: string[],
  distanceMeters: number,
  estMinutes: number,
  surface: "paved" | "mixed" | "indoor" | null,
  tags: string[],
  source: "osm_seed" | "manual",
  qualityScore: number,
  isIndoor: boolean
): RouteSpotDoc {
  return {
    id,
    name,
    kind,
    lat,
    lng,
    zipCodes,
    regionKey: regionKeyForCoords(lat, lng),
    distanceMeters,
    estMinutes,
    surface,
    tags,
    source,
    qualityScore,
    isIndoor,
  };
}

export const SEEDED_ROUTE_SPOTS: RouteSpotDoc[] = [
  route("chi-lincoln-park-loop", "Lincoln Park Nature Boardwalk Loop", "park_loop", 41.9211, -87.6354, ["60614", "60657"], 910, 12, "paved", ["park", "waterfront", "beginner"], "manual", 94, false),
  route("chi-lakeshore-reset", "Lakefront 10-Min Reset", "trail", 41.8826, -87.6178, ["60601", "60611"], 1200, 16, "paved", ["lakefront", "city", "sunrise"], "manual", 90, false),
  route("chi-eastbank-indoor", "East Bank Indoor Track Laps", "indoor_walk", 41.8883, -87.6484, ["60654"], 805, 10, "indoor", ["gym", "track", "rainy-day"], "manual", 78, true),
  route("chi-water-tower-loop", "Water Tower Place Climate Loop", "indoor_walk", 41.8988, -87.6243, ["60611"], 960, 12, "indoor", ["mall", "indoor", "downtown"], "manual", 79, true),
  route("chi-block37-loop", "Block 37 Indoor Reset", "indoor_walk", 41.8847, -87.6276, ["60602", "60603"], 840, 10, "indoor", ["mall", "lunch-break", "rainy-day"], "manual", 77, true),
  route("chi-pedway-loop", "Chicago Pedway Warm Walk", "indoor_walk", 41.8834, -87.6317, ["60602"], 1100, 14, "indoor", ["pedway", "winter", "commuter"], "manual", 82, true),
  route("aus-ladybird-short", "Lady Bird Lake Short Loop", "park_loop", 30.2625, -97.7479, ["78701", "78704"], 1300, 17, "mixed", ["lake", "popular", "evening"], "manual", 95, false),
  route("aus-pease-park", "Pease Park Easy Loop", "park_loop", 30.2791, -97.7566, ["78703"], 900, 12, "mixed", ["park", "shade", "easy"], "manual", 87, false),
  route("aus-domain-indoor", "Domain Mall Climate Walk", "indoor_walk", 30.4026, -97.7252, ["78758"], 1000, 13, "indoor", ["mall", "indoor", "air-conditioned"], "manual", 72, true),
  route("aus-barton-creek-indoor", "Barton Creek Square Indoor Loop", "indoor_walk", 30.2581, -97.8136, ["78746", "78735"], 980, 12, "indoor", ["mall", "heat-safe", "easy"], "manual", 76, true),
  route("aus-lakeline-indoor", "Lakeline Mall Comfort Walk", "indoor_walk", 30.4781, -97.7945, ["78717"], 1040, 13, "indoor", ["mall", "north-austin", "backup"], "manual", 74, true),
  route("aus-downtown-ymca-track", "Downtown YMCA Indoor Track", "indoor_walk", 30.2665, -97.7469, ["78701"], 805, 10, "indoor", ["gym", "track", "downtown"], "manual", 73, true),
  route("nyc-bryant-park", "Bryant Park Quick Loop", "park_loop", 40.7536, -73.9832, ["10018", "10001"], 820, 10, "paved", ["midtown", "park", "lunchtime"], "manual", 84, false),
  route("nyc-hudson-river", "Hudson River 10-Min Out-and-Back", "trail", 40.7523, -74.0048, ["10014", "10011"], 1150, 15, "paved", ["river", "sunset", "city"], "manual", 89, false),
  route("nyc-oculus-loop", "Oculus Concourse Loop", "indoor_walk", 40.7116, -74.0113, ["10007"], 920, 11, "indoor", ["mall", "downtown", "rainy-day"], "manual", 83, true),
  route("nyc-brookfield-loop", "Brookfield Place Climate Walk", "indoor_walk", 40.7127, -74.015, ["10281"], 980, 12, "indoor", ["waterfront", "mall", "quiet"], "manual", 82, true),
  route("nyc-hudson-yards-loop", "Hudson Yards Indoor Loop", "indoor_walk", 40.7538, -74.0019, ["10001"], 1060, 13, "indoor", ["mall", "midtown", "backup"], "manual", 80, true),
  route("nyc-chelsea-piers-loop", "Chelsea Piers Concourse Walk", "indoor_walk", 40.7465, -74.0081, ["10011"], 860, 10, "indoor", ["sports-complex", "indoor", "riverfront"], "manual", 74, true),
  route("sf-crissy-short", "Crissy Field Breeze Loop", "trail", 37.8036, -122.4648, ["94129"], 1450, 18, "mixed", ["bay", "views", "windy"], "manual", 93, false),
  route("sf-ggp-indoor", "Stonestown Indoor Reset", "indoor_walk", 37.7287, -122.4761, ["94132"], 900, 11, "indoor", ["mall", "indoor", "easy"], "manual", 69, true),
  route("sf-metreon-loop", "Metreon Climate Loop", "indoor_walk", 37.7841, -122.4035, ["94103"], 880, 10, "indoor", ["mall", "downtown", "backup"], "manual", 76, true),
  route("sf-japantown-loop", "Japantown Center Indoor Walk", "indoor_walk", 37.785, -122.4294, ["94115"], 930, 11, "indoor", ["mall", "covered", "city"], "manual", 75, true),
  route("sf-ferry-building-loop", "Ferry Building Arcade Walk", "indoor_walk", 37.7956, -122.3933, ["94111"], 820, 10, "indoor", ["market", "downtown", "backup"], "manual", 72, true),
  route("mia-bayfront-loop", "Bayfront Park Palm Loop", "park_loop", 25.7754, -80.1868, ["33132"], 850, 11, "paved", ["waterfront", "city", "easy"], "manual", 83, false),
  route("mia-brickell-climate", "Brickell City Centre Climate Walk", "indoor_walk", 25.7668, -80.1931, ["33131"], 990, 12, "indoor", ["mall", "air-conditioned", "downtown"], "manual", 80, true),
  route("mia-dadeland-loop", "Dadeland Mall Indoor Loop", "indoor_walk", 25.6897, -80.3133, ["33156"], 1120, 14, "indoor", ["mall", "heat-safe", "easy"], "manual", 77, true),
  route("mia-dolphin-loop", "Dolphin Mall Indoor Reset", "indoor_walk", 25.7863, -80.3806, ["33172"], 1180, 15, "indoor", ["mall", "indoor", "rainy-day"], "manual", 75, true),
  route("mia-aventura-loop", "Aventura Indoor Walk", "indoor_walk", 25.9586, -80.1421, ["33180"], 1100, 14, "indoor", ["mall", "covered", "backup"], "manual", 74, true),
  route("denver-city-park", "City Park Morning Loop", "park_loop", 39.7478, -104.9506, ["80206"], 980, 12, "paved", ["park", "sunrise", "flat"], "manual", 86, false),
];

export const SEEDED_ZIP_CENTROIDS: ZipCentroid[] = [
  { zip: "60614", lat: 41.9227, lng: -87.6533 },
  { zip: "60657", lat: 41.9397, lng: -87.6533 },
  { zip: "60601", lat: 41.8864, lng: -87.6186 },
  { zip: "60602", lat: 41.883, lng: -87.6291 },
  { zip: "60603", lat: 41.8807, lng: -87.6287 },
  { zip: "60611", lat: 41.8947, lng: -87.6205 },
  { zip: "60654", lat: 41.8925, lng: -87.6364 },
  { zip: "78701", lat: 30.2711, lng: -97.7437 },
  { zip: "78704", lat: 30.245, lng: -97.7601 },
  { zip: "78703", lat: 30.2839, lng: -97.7648 },
  { zip: "78717", lat: 30.4932, lng: -97.7718 },
  { zip: "78735", lat: 30.2459, lng: -97.8417 },
  { zip: "78746", lat: 30.2875, lng: -97.8107 },
  { zip: "78758", lat: 30.3896, lng: -97.7203 },
  { zip: "10001", lat: 40.7506, lng: -73.9972 },
  { zip: "10018", lat: 40.7547, lng: -73.9928 },
  { zip: "10011", lat: 40.742, lng: -74.0008 },
  { zip: "10007", lat: 40.713, lng: -74.0086 },
  { zip: "10281", lat: 40.7145, lng: -74.0158 },
  { zip: "94103", lat: 37.7725, lng: -122.4091 },
  { zip: "94111", lat: 37.7983, lng: -122.3985 },
  { zip: "94115", lat: 37.7869, lng: -122.4374 },
  { zip: "94129", lat: 37.7999, lng: -122.4662 },
  { zip: "94132", lat: 37.7217, lng: -122.4786 },
  { zip: "33131", lat: 25.7656, lng: -80.1936 },
  { zip: "33132", lat: 25.7812, lng: -80.1905 },
  { zip: "33156", lat: 25.6734, lng: -80.3044 },
  { zip: "33172", lat: 25.7876, lng: -80.3592 },
  { zip: "33180", lat: 25.9593, lng: -80.1391 },
  { zip: "80206", lat: 39.7317, lng: -104.9555 },
];
