"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { OSM_ATTRIBUTION, OSM_TILES, pinIcon } from "./map-pin";

export type LatLng = { lat: number; lng: number };

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
          attribution={OSM_ATTRIBUTION}
          url={OSM_TILES}
          maxZoom={19}
        />
        <Marker position={[position.lat, position.lng]} draggable icon={pinIcon} eventHandlers={handlers} />
        <ClickToMove onChange={onChange} />
        <FollowCenter center={center} />
      </MapContainer>
    </div>
  );
}
