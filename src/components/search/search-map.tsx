"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Loader2, RotateCcw, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { OSM_ATTRIBUTION, OSM_TILES } from "@/components/properties/map-pin";
import { formatNumber, formatTaka } from "@/lib/format";
import { groupByPin, toSearchResult, type PinGroup, type SearchResult } from "@/lib/search";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { MAP_LIMIT, toSearchArgs, type SearchFilters } from "@/lib/validation/search";
import { ListingCard } from "./listing-card";

export type MapBox = { south: number; west: number; north: number; east: number };

/** Cards listed under the map; the markers show everything in view. */
const LIST_UNDER_MAP = 24;
/** Pins are 80 to 250 m from the building, so closer zoom would mislead. */
const MAX_ZOOM = 17;

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** A rent label as the marker. Selected markers turn amber. */
function pinIcon(label: string, selected: boolean) {
  return L.divIcon({
    className: "",
    // No size: the label sizes itself and sits centred above the point.
    iconSize: undefined,
    html: `<span class="absolute bottom-1 left-0 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full border-2 px-2 py-0.5 text-xs font-semibold shadow-md ${
      selected
        ? "z-10 border-amber-600 bg-accent text-accent-foreground"
        : "border-white bg-primary text-primary-foreground hover:bg-teal-800"
    }">${escapeHtml(label)}</span>`,
  });
}

/**
 * Reports pans and zooms. The first view is set by MapContainer's bounds
 * before these handlers exist, so every move seen here is the person's.
 */
function MapEvents({
  onUserMove,
  onBackgroundClick,
}: {
  onUserMove: (box: MapBox) => void;
  onBackgroundClick: () => void;
}) {
  const map = useMap();

  useMapEvents({
    moveend() {
      const b = map.getBounds();
      const r = (n: number) => Math.round(n * 10000) / 10000;
      onUserMove({ south: r(b.getSouth()), west: r(b.getWest()), north: r(b.getNorth()), east: r(b.getEast()) });
    },
    click() {
      onBackgroundClick();
    },
  });
  return null;
}

/**
 * Map view of the search. The first markers come from the server (every
 * matching ad, up to 300). After the person pans or zooms, the map asks
 * the database for the matching ads inside the visible area only. Markers
 * sit on each building's public, approximate pin.
 */
export default function SearchMap({
  filters,
  areaIds,
  initial,
  initialTotal,
  fallbackBox,
  areaLabels,
}: {
  filters: SearchFilters;
  areaIds: number[] | null;
  initial: SearchResult[];
  initialTotal: number;
  /** Where to look when nothing matches (the chosen place or all of Mirpur). */
  fallbackBox: MapBox;
  areaLabels: Record<number, string>;
}) {
  const t = useTranslations("Search");
  const locale = useLocale();
  const [results, setResults] = useState(initial);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<MapBox | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const requestId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const groups = useMemo(() => groupByPin(results), [results]);
  const current = groups.find((g) => g.key === selected) ?? null;

  const initialBox = useMemo<MapBox>(() => {
    if (initial.length === 0) return fallbackBox;
    const lats = initial.map((r) => r.approx_lat);
    const lngs = initial.map((r) => r.approx_lng);
    return { south: Math.min(...lats), west: Math.min(...lngs), north: Math.max(...lats), east: Math.max(...lngs) };
  }, [initial, fallbackBox]);

  const load = useCallback(
    async (box: MapBox) => {
      const id = ++requestId.current;
      setLoading(true);
      setFailed(null);
      const supabase = createClient();
      const { data, error } = await supabase.rpc(
        "search_listings",
        toSearchArgs(filters, areaIds, {
          limit: MAP_LIMIT,
          offset: 0,
          bounds: [box.south, box.west, box.north, box.east],
        }),
      );
      if (id !== requestId.current) return; // A newer move already asked again.
      setLoading(false);
      if (error) {
        setFailed(box);
        return;
      }
      const rows = data ?? [];
      setResults(rows.map(toSearchResult));
      setTotal(Number(rows[0]?.total_count ?? 0));
      setSelected((key) => (key && rows.some((r) => `${Number(r.approx_lat).toFixed(5)},${Number(r.approx_lng).toFixed(5)}` === key) ? key : null));
    },
    [filters, areaIds],
  );

  const onUserMove = useCallback(
    (box: MapBox) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void load(box), 350);
    },
    [load],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const markerLabel = (g: PinGroup) => {
    const cheapest = g.ads[0].monthly_rent;
    const rent = cheapest === null ? "" : formatTaka(cheapest, locale);
    return g.ads.length > 1 ? `${rent} +${formatNumber(g.ads.length - 1, locale)}` : rent;
  };

  const listed = results.slice(0, LIST_UNDER_MAP);

  return (
    <div className="flex flex-col gap-4">
      <div
        className="relative z-0 h-[62dvh] min-h-80 overflow-hidden rounded-xl border bg-muted lg:h-[68vh]"
        role="region"
        aria-label={t("mapRegion")}
      >
        <MapContainer
          bounds={[
            [initialBox.south, initialBox.west],
            [initialBox.north, initialBox.east],
          ]}
          boundsOptions={{ padding: [32, 32], maxZoom: 16 }}
          maxZoom={MAX_ZOOM}
          minZoom={11}
          className="size-full"
        >
          <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILES} maxZoom={MAX_ZOOM} />
          <MapEvents onUserMove={onUserMove} onBackgroundClick={() => setSelected(null)} />
          {groups.map((g) => (
            <Marker
              key={g.key}
              position={[g.lat, g.lng]}
              icon={pinIcon(markerLabel(g), g.key === selected)}
              title={t("markerLabel", { count: g.ads.length, rent: markerLabel(g) })}
              zIndexOffset={g.key === selected ? 1000 : 0}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  setSelected(g.key);
                },
              }}
            />
          ))}
        </MapContainer>

        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex justify-center p-3">
          <p
            className="pointer-events-auto flex items-center gap-2 rounded-full bg-background/95 px-3 py-1.5 text-sm font-medium shadow-md"
            aria-live="polite"
          >
            {loading && <Loader2 className="size-4 animate-spin text-primary" aria-hidden />}
            {loading ? t("mapLoading") : t("inView", { count: total })}
          </p>
        </div>

        {failed && (
          <div className="absolute inset-x-0 top-14 z-[1000] flex justify-center px-3">
            <p className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-background px-3 py-2 text-sm shadow-md">
              {t("mapError")}
              <button
                type="button"
                onClick={() => void load(failed)}
                className="flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
              >
                <RotateCcw className="size-3.5" aria-hidden />
                {t("retry")}
              </button>
            </p>
          </div>
        )}

        {current && (
          <div className="absolute inset-x-0 bottom-0 z-[1000] p-2 sm:p-3">
            <div className="mx-auto flex max-w-xl flex-col gap-2 rounded-xl border bg-background p-2 shadow-lg">
              <div className="flex items-center justify-between gap-2 px-1">
                <p className="text-sm font-semibold">{t("atThisPin", { count: current.ads.length })}</p>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label={t("close")}
                  className="grid size-8 place-items-center rounded-full outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
              <ul className="flex max-h-[40dvh] flex-col gap-2 overflow-y-auto">
                {current.ads.map((ad) => (
                  <li key={ad.id}>
                    <ListingCard ad={ad} areaLabel={areaLabels[ad.area_id] ?? ""} compact />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{t("mapApproxNote")}</p>

      {results.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="in-view-title">
          <h2 id="in-view-title" className="text-base font-semibold">
            {t("listInView")}
          </h2>
          <ul className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3", loading && "opacity-60")}>
            {listed.map((ad) => (
              <li key={ad.id} className="flex">
                <ListingCard ad={ad} areaLabel={areaLabels[ad.area_id] ?? ""} className="w-full" />
              </li>
            ))}
          </ul>
          {total > listed.length && (
            <p className="text-sm text-muted-foreground">{t("mapMore", { shown: listed.length, total })}</p>
          )}
        </section>
      )}
    </div>
  );
}
