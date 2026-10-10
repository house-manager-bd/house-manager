"use client";

import dynamic from "next/dynamic";

// Leaflet needs the browser's window object, so the map loads only on the client.
export const SearchMapLazy = dynamic(() => import("./search-map"), {
  ssr: false,
  loading: () => <div className="h-[62dvh] min-h-80 animate-pulse rounded-xl border bg-muted lg:h-[68vh]" />,
});
