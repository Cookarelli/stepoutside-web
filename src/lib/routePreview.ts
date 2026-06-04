import type { RoutePoint } from "./store";

export function prepareRoutePreviewPoints(points: RoutePoint[], maxPoints = 120): RoutePoint[] {
  if (points.length <= maxPoints) return points;

  const lastIndex = points.length - 1;
  const selectedIndexes = new Set<number>([0, lastIndex]);

  for (let index = 0; index < maxPoints; index += 1) {
    selectedIndexes.add(Math.round((index / (maxPoints - 1)) * lastIndex));
  }

  points.forEach((point, index) => {
    if (!point.segmentStart) return;
    selectedIndexes.add(index);
    selectedIndexes.add(Math.max(0, index - 1));
  });

  return [...selectedIndexes]
    .sort((a, b) => a - b)
    .map((index) => points[index])
    .filter((point): point is RoutePoint => Boolean(point));
}
