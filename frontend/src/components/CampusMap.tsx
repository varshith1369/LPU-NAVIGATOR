import { useEffect, useState } from "react";
import {
  MapContainer,
  ImageOverlay,
  TileLayer,
  CircleMarker,
  Popup,
  Polyline,
  GeoJSON,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { Place } from "../services/api";
import campus from "../data/campus.json";
import { api } from "../services/api";
const bounds: L.LatLngBoundsExpression = [
  [0, 0],
  [787, 559],
];
function Focus({
  selected,
  historical,
  position,
}: {
  selected: Place | null;
  historical: boolean;
  position: [number, number] | null;
}) {
  const map = useMap();
  useEffect(() => {
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
    } else if (position && !historical) map.flyTo(position, 17);
  }, [map, selected, historical, position]);
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
function CampusBounds({ context }: { context: any }) {
  const map = useMap();
  useEffect(() => {
    if (context?.boundary)
      map.fitBounds(L.geoJSON(context.boundary).getBounds(), {
        padding: [35, 35],
      });
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
}: {
  historical: boolean;
  places: Place[];
  selected: Place | null;
  onSelect: (p: Place) => void;
  position: [number, number] | null;
  route: [number, number][];
}) {
  const [imageAvailable, setImageAvailable] = useState<boolean | null>(null);
  const [context, setContext] = useState<any>({ boundary: campus.boundary });
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    api("/map-status")
      .then((d) => setImageAvailable(d.available))
      .catch(() => setImageAvailable(false));
  }, []);
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
        {...(historical
          ? {
              crs: L.CRS.Simple,
              bounds,
              minZoom: -2,
              maxZoom: 3,
              zoomSnap: 0.25,
            }
          : { center, zoom: 16 })}
        zoomControl={true}
        scrollWheelZoom
      >
        <Resize />
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
        />
        {historical ? (
          imageAvailable && (
            <ImageOverlay
              url="/api/historical-map"
              bounds={bounds}
              attribution="User-supplied historical LPU map · not to scale"
            />
          )
        ) : (
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            eventHandlers={{ tileerror: () => setTileError(true) }}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
        )}
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
                radius={selected?.id === p.id ? 10 : 7}
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
                <Tooltip>{p.name}</Tooltip>
                <Popup>
                  {p.name}
                  {p.historical ? " · historical" : ""}
                </Popup>
              </CircleMarker>
            )
          );
        })}
        {!historical && position && (
          <CircleMarker
            center={position}
            radius={8}
            pathOptions={{
              color: "#fff",
              fillColor: "#2563eb",
              fillOpacity: 1,
            }}
          >
            <Popup>You are here</Popup>
          </CircleMarker>
        )}
        {!historical && route.length > 0 && (
          <Polyline
            positions={route}
            pathOptions={{ color: "#285b47", weight: 5 }}
          />
        )}
      </MapContainer>
      {!historical && tileError && (
        <div className="tile-status" role="status">
          Background tiles are unavailable. Campus outline, mapped paths and
          places are still shown.
        </div>
      )}
      {historical && imageAvailable === false && (
        <div className="map-empty">
          <strong>Historical image is private</strong>
          <p>
            The directory is available. Add the supplied image locally to
            explore the historical plan.
          </p>
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
