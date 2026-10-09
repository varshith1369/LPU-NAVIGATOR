import { Fragment, useMemo, useState } from "react";
import {
  CircleMarker,
  Polyline,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import type { Place } from "../services/api";

// Keep nearby numbers readable at campus zoom, with a line back to the actual building.
export default function NumberedBuildings({
  places,
  selected,
  onSelect,
}: {
  places: Place[];
  selected: Place | null;
  onSelect: (place: Place) => void;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const pins = useMemo(() => {
    const occupied: L.Point[] = [];
    return places
      .filter(
        (p) => p.building_code && p.latitude != null && p.longitude != null,
      )
      .sort((a, b) =>
        a.building_code!.localeCompare(b.building_code!, undefined, {
          numeric: true,
        }),
      )
      .map((place) => {
        const actual = L.latLng(place.latitude!, place.longitude!);
        const origin = map.project(actual, zoom);
        let label = origin;
        search: for (let radius = 0; radius <= 160; radius += 24) {
          for (let step = 0; step < (radius ? 16 : 1); step++) {
            const angle = (step * Math.PI) / 8;
            const candidate = origin.add([
              Math.cos(angle) * radius,
              Math.sin(angle) * radius,
            ]);
            if (occupied.every((p) => p.distanceTo(candidate) >= 39)) {
              label = candidate;
              break search;
            }
          }
        }
        occupied.push(label);
        return {
          place,
          actual,
          label: map.unproject(label, zoom),
          shifted: !label.equals(origin),
        };
      });
  }, [map, zoom, places]);
  return (
    <>
      {pins.map(({ place, actual, label, shifted }) => (
        <Fragment key={place.id}>
          {shifted && (
            <>
              <Polyline
                positions={[actual, label]}
                pathOptions={{ color: "#24394a", weight: 1.5, opacity: 0.8 }}
                interactive={false}
              />
              <CircleMarker
                center={actual}
                radius={3}
                pathOptions={{
                  color: "#fff",
                  fillColor: "#24394a",
                  fillOpacity: 1,
                  weight: 1,
                }}
                interactive={false}
              />
            </>
          )}
          <CircleMarker
            center={label}
            radius={selected?.id === place.id ? 19 : 17}
            pathOptions={{
              color: "#fff",
              fillColor:
                selected?.id === place.id
                  ? "#f36e2c"
                  : place.number_basis === "campus_plan"
                    ? "#89643b"
                    : "#24394a",
              fillOpacity: 1,
              weight: 2,
              dashArray:
                place.number_basis === "campus_plan" ? "3 2" : undefined,
            }}
            eventHandlers={{ click: () => onSelect(place) }}
          >
            <Tooltip
              permanent
              direction="center"
              className="map-number"
              opacity={1}
            >
              {place.building_code}
            </Tooltip>
          </CircleMarker>
        </Fragment>
      ))}
    </>
  );
}
