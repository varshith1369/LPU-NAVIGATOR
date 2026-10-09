import type { Place } from "./api";

export function walkingDirectionsUrl(from?: Place, to?: Place) {
  if (!from || !to || from.id === to.id) return null;
  for (const place of [from, to]) {
    if (
      place.historical ||
      place.latitude == null ||
      place.longitude == null ||
      !Number.isFinite(place.latitude) ||
      !Number.isFinite(place.longitude) ||
      Math.abs(place.latitude) > 90 ||
      Math.abs(place.longitude) > 180
    )
      return null;
  }
  const params = new URLSearchParams({
    api: "1",
    origin: `${from.latitude},${from.longitude}`,
    destination: `${to.latitude},${to.longitude}`,
    travelmode: "walking",
  });
  return `https://www.google.com/maps/dir/?${params}`;
}
