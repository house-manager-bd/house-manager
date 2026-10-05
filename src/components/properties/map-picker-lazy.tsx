"use client";

import dynamic from "next/dynamic";

// Leaflet needs the browser's window object, so the map loads only on the client.
export const MapPickerLazy = dynamic(() => import("./map-picker"), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-lg border bg-muted sm:h-80" />,
});
