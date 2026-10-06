"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

export type LatLng = { lat: number; lng: number };

// A plain SVG pin, so no marker image files need to be served.
const pinIcon = L.divIcon({
  className: "",
  html: `<svg width="36" height="48" viewBox="0 0 36 48" aria-hidden="true"><path d="M18 0C8.1 0 0 8 0 17.9 0 31.3 18 48 18 48s18-16.7 18-30.1C36 8 27.9 0 18 0z" fill="#0F766E"/><circle cx="18" cy="18" r="7" fill="#fff"/></svg>`,
  iconSize: [36, 48],
  iconAnchor: [18, 48],
});

function ClickToMove({ onChange }: { onChange: (p: LatLng) => void }) {
  useMapEvents({
    click(event) {
      onChange({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

/** Pans the map when the selected area changes. */
function FollowCenter({ center }: { center: LatLng }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng], Math.max(map.getZoom(), 16));
  }, [map, center.lat, center.lng]);
  return null;
}

export default function MapPicker({
  value,
  center,
  onChange,
  label,
}: {
  value: LatLng | null;
  /** Where to look when there is no pin yet (the area centre). */
  center: LatLng;
  onChange: (p: LatLng) => void;
  label: string;
}) {
  const position = value ?? center;
  const handlers = useMemo(
    () => ({
      dragend(event: L.LeafletEvent) {
        const p = (event.target as L.Marker).getLatLng();
        onChange({ lat: p.lat, lng: p.lng });
      },
    }),
    [onChange],
  );

  return (
    <div
      className="relative z-0 h-72 overflow-hidden rounded-lg border sm:h-80"
      role="application"
      aria-label={label}
    >
      <MapContainer
        center={[position.lat, position.lng]}
        zoom={16}
        scrollWheelZoom={false}
        className="size-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <Marker position={[position.lat, position.lng]} draggable icon={pinIcon} eventHandlers={handlers} />
        <ClickToMove onChange={onChange} />
        <FollowCenter center={center} />
      </MapContainer>
    </div>
  );
}
