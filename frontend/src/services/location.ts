import type { Place } from "./api";

export type LocationFix = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
};
export function readFix(p: GeolocationPosition): LocationFix {
  const { latitude, longitude, accuracy } = p.coords;
  if (
    ![latitude, longitude, accuracy, p.timestamp].every(Number.isFinite) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180 ||
    accuracy < 0
  )
    throw new Error("The device returned an invalid location. Please retry.");
  return { latitude, longitude, accuracy, timestamp: p.timestamp };
}
export function freshFix(fix: LocationFix | null, now = Date.now()) {
  return !!fix && now - fix.timestamp < 30000 && now >= fix.timestamp - 5000;
}
export function locationError(error: { code: number }) {
  return error.code === 1
    ? "Location permission was denied. Allow location in your browser's site settings, then try again."
    : error.code === 3
      ? "Waiting for a GPS fix. Move outdoors or check your device location settings."
      : "Your device cannot determine its location right now. You can still browse the map.";
}
export function watchLocation(
  geo: Geolocation,
  onFix: (fix: LocationFix) => void,
  onError: (message: string, denied: boolean) => void,
) {
  let active = true;
  const id = geo.watchPosition(
    (p) => {
      if (!active) return;
      try {
        onFix(readFix(p));
      } catch (e) {
        onError((e as Error).message, false);
      }
    },
    (e) => {
      if (active) onError(locationError(e), e.code === 1);
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
  );
  return () => {
    active = false;
    geo.clearWatch(id);
  };
}
export function distanceMeters(a: [number, number], b: [number, number]) {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b[0] - a[0]) * r) / 2) ** 2 +
    Math.cos(a[0] * r) *
      Math.cos(b[0] * r) *
      Math.sin(((b[1] - a[1]) * r) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function mapLabel(place: Place, places: Place[]) {
  if (place.old_map_id) return String(place.old_map_id).padStart(2, "0");
  const block = place.name.match(/^Block\s+(\d+)/i);
  if (block) return `B${block[1]}`;
  const names: Record<string, string> = {
    "Lovely Institute Of Management": "LIM",
    "Lovely Institute of Technology": "LIT",
    "Lovely Institute of Pharmacy": "Pharm",
    "LPU Mall": "Mall",
    "Central Library": "Library",
    "School of Design": "Design",
  };
  return names[place.name] ?? place.name.split(" ")[0].slice(0, 8);
}
