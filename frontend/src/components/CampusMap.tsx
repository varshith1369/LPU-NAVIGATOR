import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Circle,
  Popup,
  Polyline,
  GeoJSON,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import type { Place } from "../services/api";
import campus from "../data/campus.json";
import { api } from "../services/api";
import { mapLabel } from "../services/location";
function Focus({
  selected,
  historical,
  position,
  follow,
  pauseFollow,
}: {
  selected: Place | null;
  historical: boolean;
  position: [number, number] | null;
  follow: boolean;
  pauseFollow: () => void;
}) {
  const map = useMap();
  useMapEvents({ dragstart: pauseFollow });
  useEffect(() => {
    if (follow && position && !historical) {
      if (selected?.latitude != null && selected.longitude != null)
        map.fitBounds([position, [selected.latitude, selected.longitude]], {
          paddingTopLeft: [50, 230],
          paddingBottomRight: [50, 65],
          maxZoom: 18,
          animate: false,
        });
      else map.setView(position, 18, { animate: false });
      return;
    }
  }, [map, position, follow, historical, selected]);
  useEffect(() => {
    if (follow) return;
    if (selected) {
      if (
        historical &&
        selected.image_x_px != null &&
        selected.image_y_px != null
      )
        map.flyTo([787 - selected.image_y_px, selected.image_x_px], 1);
      if (
        !historical &&
        selected.latitude != null &&
        selected.longitude != null
      )
        map.flyTo([selected.latitude, selected.longitude], 18);
    }
  }, [map, selected, historical]);
  return null;
}
function Resize() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}
function RouteFocus({ route }: { route: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (route.length > 1)
      map.fitBounds(route, { padding: [55, 100], maxZoom: 18 });
  }, [map, route]);
  return null;
}
function CampusBounds({ context }: { context: any }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (context?.boundary && !fitted.current) {
      fitted.current = true;
      map.fitBounds(L.geoJSON(context.boundary).getBounds(), {
        padding: [35, 35],
      });
    }
  }, [map, context]);
  return null;
}
export default function CampusMap({
  historical,
  places,
  selected,
  onSelect,
  position,
  route,
  accuracy = null,
  follow = false,
  pauseFollow = () => {},
  fresh = false,
  suggestion = null,
}: {
  historical: boolean;
  places: Place[];
  selected: Place | null;
  onSelect: (p: Place) => void;
  position: [number, number] | null;
  route: [number, number][];
  accuracy?: number | null;
  follow?: boolean;
  pauseFollow?: () => void;
  fresh?: boolean;
  suggestion?: Place | null;
}) {
  const [context, setContext] = useState<any>({ boundary: campus.boundary });
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    api("/map-context")
      .then((data) => {
        if (data?.boundary) setContext(data);
      })
      .catch(() => {});
  }, []);
  const geographic = places.filter(
    (p) => p.latitude != null && p.longitude != null,
  );
  const center: [number, number] = geographic.length
    ? [geographic[0].latitude!, geographic[0].longitude!]
    : [31.25336, 75.7041];
  return (
    <div className="map-surface">
      <MapContainer
        key={historical ? "historical" : "geographic"}
        center={center}
        zoom={16}
        zoomControl={true}
        scrollWheelZoom
      >
        <Resize />
        {!historical && <RouteFocus route={route} />}
        {!historical && context && (
          <>
            <CampusBounds context={context} />
            <GeoJSON
              data={context.boundary}
              style={{
                color: "#658662",
                weight: 2,
                fillOpacity: 0.04,
                dashArray: "5 5",
              }}
            />
          </>
        )}
        <Focus
          selected={selected}
          historical={historical}
          position={position}
          follow={follow && fresh}
          pauseFollow={pauseFollow}
        />
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{ tileerror: () => setTileError(true) }}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {!historical && (
          <Polyline
            positions={campus.paths.map((path) =>
              path.map(([lng, lat]) => [lat, lng] as [number, number]),
            )}
            pathOptions={{ color: "#77858c", weight: 2, opacity: 0.45 }}
          />
        )}
        {places.map((p) => {
          const point: L.LatLngExpression | null = historical
            ? p.image_x_px != null && p.image_y_px != null
              ? [787 - p.image_y_px, p.image_x_px]
              : null
            : p.latitude != null && p.longitude != null
              ? [p.latitude, p.longitude]
              : null;
          return (
            point && (
              <CircleMarker
                key={p.id}
                center={point}
                radius={
                  historical
                    ? selected?.id === p.id
                      ? 13
                      : 9
                    : selected?.id === p.id
                      ? 19
                      : 17
                }
                pathOptions={{
                  color: "#ffffff",
                  fillColor:
                    selected?.id === p.id
                      ? "#f36e2c"
                      : p.category === "Library"
                        ? "#866548"
                        : p.category === "Shopping"
                          ? "#977445"
                          : "#24394a",
                  fillOpacity: 1,
                  weight: 2,
                }}
                eventHandlers={{ click: () => onSelect(p) }}
              >
                <Tooltip
                  permanent
                  direction="center"
                  className="map-number"
                  opacity={1}
                >
                  {mapLabel(p, places)}
                </Tooltip>
                <Popup>
                  {p.name}
                  {p.historical ? " · historical" : ""}
                </Popup>
              </CircleMarker>
            )
          );
        })}
        {!historical && position && (
          <>
            {accuracy != null && (
              <Circle
                center={position}
                radius={accuracy}
                pathOptions={{
                  color: fresh ? "#2563eb" : "#64748b",
                  fillOpacity: 0.1,
                  weight: 1,
                }}
              />
            )}
            <CircleMarker
              center={position}
              radius={8}
              pathOptions={{
                color: "#fff",
                fillColor: fresh ? "#2563eb" : "#64748b",
                fillOpacity: 1,
              }}
            >
              <Popup>
                {fresh
                  ? "Your current location"
                  : "Last known position · waiting for GPS"}
                {accuracy != null
                  ? ` · accuracy ±${Math.round(accuracy)} m`
                  : ""}
              </Popup>
            </CircleMarker>
          </>
        )}
        {!historical &&
          suggestion?.latitude != null &&
          suggestion.longitude != null && (
            <CircleMarker
              center={[suggestion.latitude, suggestion.longitude]}
              radius={20}
              pathOptions={{
                color: "#a855f7",
                fillColor: "#faf5ff",
                fillOpacity: 1,
                dashArray: "4 3",
                weight: 3,
              }}
              eventHandlers={{ click: () => onSelect(suggestion) }}
            >
              <Tooltip
                permanent
                direction="center"
                className="map-number suggestion-number"
                opacity={1}
              >
                {mapLabel(suggestion, places)}
              </Tooltip>
              <Popup>
                {suggestion.name} · Your unverified location suggestion
              </Popup>
            </CircleMarker>
          )}
        {!historical && route.length > 0 && (
          <>
            <Polyline
              positions={route}
              pathOptions={{ color: "#285b47", weight: 5 }}
            />
            <CircleMarker
              center={route[0]}
              radius={7}
              pathOptions={{
                color: "#fff",
                fillColor: "#285b47",
                fillOpacity: 1,
              }}
            >
              <Tooltip permanent direction="top">
                Mapped path start
              </Tooltip>
            </CircleMarker>
            <CircleMarker
              center={route[route.length - 1]}
              radius={7}
              pathOptions={{
                color: "#fff",
                fillColor: "#f36e2c",
                fillOpacity: 1,
              }}
            >
              <Tooltip permanent direction="top">
                Mapped path end
              </Tooltip>
            </CircleMarker>
          </>
        )}
      </MapContainer>
      {!historical && tileError && (
        <div className="tile-status" role="status">
          Background tiles are unavailable. Campus outline, mapped paths and
          places are still shown.
        </div>
      )}
      {!historical && geographic.length === 0 && !position && !context && (
        <div className="map-notice">
          No campus GPS points have been verified yet. This is a world map;
          explore the historical plan for the supplied campus reference.
        </div>
      )}
    </div>
  );
}
