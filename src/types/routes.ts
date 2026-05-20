import type { FilteredRoutePoint, OutsideSession, RawRoutePoint } from "../lib/store";

export type { RawRoutePoint, FilteredRoutePoint };

export type DisplayRoutePoint = {
  latitude: number;
  longitude: number;
};

export type SavedActivity = OutsideSession;
