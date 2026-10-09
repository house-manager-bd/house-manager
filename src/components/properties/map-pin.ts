import L from "leaflet";

// A plain SVG pin, so no marker image files need to be served.
export const pinIcon = L.divIcon({
  className: "",
  html: `<svg width="36" height="48" viewBox="0 0 36 48" aria-hidden="true"><path d="M18 0C8.1 0 0 8 0 17.9 0 31.3 18 48 18 48s18-16.7 18-30.1C36 8 27.9 0 18 0z" fill="#0F766E"/><circle cx="18" cy="18" r="7" fill="#fff"/></svg>`,
  iconSize: [36, 48],
  iconAnchor: [18, 48],
});

export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
export const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
