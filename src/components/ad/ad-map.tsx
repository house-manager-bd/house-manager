"use client";

import "leaflet/dist/leaflet.css";
import { Circle, MapContainer, Marker, TileLayer } from "react-leaflet";
import { OSM_ATTRIBUTION, OSM_TILES, pinIcon } from "@/components/properties/map-pin";

/** Covers the 80 to 250 metre offset of the public pin with room to spare. */
const APPROX_RADIUS_M = 300;

/**
 * Read-only map on the ad page. Visitors see a shaded circle around the
 * approximate pin (never a pin, so it does not look exact); members see
 * the building's real pin.
 */
export default function AdMap({
  lat,
  lng,
  exact,
  label,
}: {
  lat: number;
  lng: number;
  exact: boolean;
  label: string;
}) {
  return (
    <div className="relative z-0 h-64 overflow-hidden rounded-lg border sm:h-80" role="region" aria-label={label}>
      <MapContainer center={[lat, lng]} zoom={exact ? 17 : 15} scrollWheelZoom={false} className="size-full">
        <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILES} maxZoom={19} />
        {exact ? (
          <Marker position={[lat, lng]} icon={pinIcon} keyboard={false} />
        ) : (
          <Circle
            center={[lat, lng]}
            radius={APPROX_RADIUS_M}
            pathOptions={{ color: "#0F766E", weight: 2, fillColor: "#0F766E", fillOpacity: 0.18 }}
          />
        )}
      </MapContainer>
    </div>
  );
}
