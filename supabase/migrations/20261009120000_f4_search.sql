-- F4: browse, search, filters and map view.
-- One read-only function, search_listings(), serves the search page, the map
-- and the home page. It returns only live ads, and only columns a visitor can
-- already read through Row Level Security: no building name, no address, no
-- exact pin and no phone. Keyword search never looks at the building name or
-- the address either, so a visitor cannot learn them by searching.
-- No new tables in this migration.

-- 1. pg_trgm, for area names typed with a different spelling (plan section 2) --

create extension if not exists pg_trgm with schema extensions;

-- Supabase keeps extensions in the "extensions" schema. If pg_trgm was
-- enabled somewhere else from the dashboard, move it so the calls below work.
do $$
begin
  if (
    select n.nspname
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_trgm'
  ) <> 'extensions' then
    alter extension pg_trgm set schema extensions;
  end if;
end;
$$;

-- 2. search_compact: one form for comparing search words and ad text --------------
-- Lower case, Bangla digits as ASCII digits, and spaces and punctuation
-- removed, so "Mirpur-10", "mirpur 10", "Mirpur10" and "মিরপুর ১০" all compare
-- the same way as the stored area names. Because every punctuation mark is
-- removed, search words can never contain the LIKE wildcards % and _.

create or replace function public.search_compact(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select regexp_replace(
    lower(translate(coalesce(p_text, ''), '০১২৩৪৫৬৭৮৯', '0123456789')),
    '[[:space:][:punct:]।]+',
    '',
    'g'
  );
$$;

-- 3. listings.search_text ------------------------------------------------------------
-- The title and description in compact form, worked out once when an ad is
-- saved instead of on every search (a 2,000 character description made
-- keyword search several times slower). Only drafts are edited, through the
-- wizard; the database fills this column by itself and nobody can write it.
-- "if not exists" makes the whole migration safe to run twice.
-- If search_compact() ever changes, refresh it with:
--   update public.listings set title = title;

alter table public.listings
  add column if not exists search_text text
  generated always as (
    public.search_compact(coalesce(title, '') || ' ' || coalesce(description, ''))
  ) stored;

-- 4. search_listings ------------------------------------------------------------------
-- Filters (all optional; null or an empty array means "any"):
--   p_q             keyword: every word must appear in the title, description,
--                   landmark, or area or thana name (Bangla or English). English
--                   words of 4 letters or more also match an area whose name is
--                   spelled a little differently ("sheorapara", "kajipara",
--                   "pallobi"), using pg_trgm word similarity of 0.5 or more.
--   p_area_ids      areas (a thana is sent as the list of its areas)
--   p_types         flat, room, sublet, mess_seat
--   p_tenant_types  ads that accept at least one of these
--   p_rent_min, p_rent_max   monthly rent in taka (per seat for mess seats)
--   p_bedrooms_min  at least this many bedrooms
--   p_amenities     the building has all of these
--   p_gas           titas_line, lpg, or any (line or cylinder)
--   p_available_by  available on or before this date
--   p_bounds        {south, west, north, east}: public pins inside the map view
-- Sort: newest (default), rent_asc, rent_desc. At most 300 rows per call.
-- total_count is the number of matching ads before the limit.

create or replace function public.search_listings(
  p_q text default null,
  p_area_ids integer[] default null,
  p_types text[] default null,
  p_tenant_types text[] default null,
  p_rent_min integer default null,
  p_rent_max integer default null,
  p_bedrooms_min integer default null,
  p_amenities text[] default null,
  p_gas text default null,
  p_available_by date default null,
  p_bounds double precision[] default null,
  p_sort text default 'newest',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  title text,
  listing_type public.listing_type,
  tenant_types text[],
  monthly_rent integer,
  rent_negotiable boolean,
  open_slots smallint,
  available_from date,
  published_at timestamptz,
  area_id integer,
  landmark text,
  approx_lat numeric,
  approx_lng numeric,
  gas public.gas_type,
  amenities text[],
  unit_kind public.unit_kind,
  bedrooms smallint,
  bathrooms smallint,
  size_sqft integer,
  furnishing public.furnishing,
  cover_path text,
  photo_count integer,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with words as (
    select d.word
    from (
      select distinct public.search_compact(w) as word
      from regexp_split_to_table(left(coalesce(p_q, ''), 100), '[[:space:],।]+') as w
    ) d
    where d.word <> ''
    limit 6
  ),
  -- Area and thana names in both languages, compacted once per search.
  area_texts as (
    select a.id as area_id,
           public.search_compact(concat_ws(' ', a.name_en, a.name_bn, t.name_en, t.name_bn)) as txt
    from public.areas a
    join public.thanas t on t.id = a.thana_id
    where exists (select 1 from words)
  ),
  -- Areas whose English name (or thana name) is close to a typed word.
  area_hits as (
    select w.word, a.id as area_id
    from words w
    cross join public.areas a
    join public.thanas t on t.id = a.thana_id
    where w.word ~ '^[a-z]{4,}$'
      and greatest(
        extensions.word_similarity(w.word, public.search_compact(a.name_en)),
        extensions.word_similarity(w.word, public.search_compact(t.name_en))
      ) >= 0.5
  ),
  matched as (
    select
      l.id, l.title, l.listing_type, l.tenant_types, l.monthly_rent, l.rent_negotiable,
      l.open_slots, l.available_from, l.published_at,
      b.area_id, b.landmark, b.approx_lat, b.approx_lng, b.gas, b.amenities,
      u.unit_kind, u.bedrooms, u.bathrooms, u.size_sqft, u.furnishing
    from public.listings l
    join public.units u on u.id = l.unit_id
    join public.buildings b on b.id = u.building_id
    where l.status = 'active'
      and (coalesce(cardinality(p_area_ids), 0) = 0 or b.area_id = any (p_area_ids))
      and (coalesce(cardinality(p_types), 0) = 0 or l.listing_type::text = any (p_types))
      and (coalesce(cardinality(p_tenant_types), 0) = 0 or l.tenant_types && p_tenant_types)
      and (p_rent_min is null or l.monthly_rent >= p_rent_min)
      and (p_rent_max is null or l.monthly_rent <= p_rent_max)
      and (p_bedrooms_min is null or u.bedrooms >= p_bedrooms_min)
      and (coalesce(cardinality(p_amenities), 0) = 0 or b.amenities @> p_amenities)
      and (p_gas is null or (p_gas = 'any' and b.gas <> 'none') or b.gas::text = p_gas)
      and (p_available_by is null or l.available_from <= p_available_by)
      and (
        cardinality(p_bounds) is distinct from 4
        or (
          b.approx_lat between p_bounds[1] and p_bounds[3]
          and b.approx_lng between p_bounds[2] and p_bounds[4]
        )
      )
      -- Keyword: no word may be missing. Never the building name or address.
      and not exists (
        select 1
        from words w
        where l.search_text not like '%' || w.word || '%'
          and public.search_compact(b.landmark) not like '%' || w.word || '%'
          and not exists (
            select 1 from area_texts x
            where x.area_id = b.area_id and x.txt like '%' || w.word || '%'
          )
          and not exists (select 1 from area_hits h where h.word = w.word and h.area_id = b.area_id)
      )
  ),
  page as (
    select
      m.*,
      count(*) over () as total_count,
      row_number() over (
        order by
          case when p_sort = 'rent_asc' then m.monthly_rent end asc nulls last,
          case when p_sort = 'rent_desc' then m.monthly_rent end desc nulls last,
          m.published_at desc nulls last,
          m.id
      ) as rn
    from matched m
    order by rn
    limit least(greatest(coalesce(p_limit, 20), 1), 300)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    p.id, p.title, p.listing_type, p.tenant_types, p.monthly_rent, p.rent_negotiable,
    p.open_slots, p.available_from, p.published_at,
    p.area_id, p.landmark, p.approx_lat, p.approx_lng, p.gas, p.amenities,
    p.unit_kind, p.bedrooms, p.bathrooms, p.size_sqft, p.furnishing,
    cover.storage_path,
    coalesce(photos.n, 0),
    p.total_count
  from page p
  left join lateral (
    select ph.storage_path
    from public.listing_photos ph
    where ph.listing_id = p.id
    order by ph.sort_order
    limit 1
  ) cover on true
  left join lateral (
    select count(*)::integer as n
    from public.listing_photos ph
    where ph.listing_id = p.id
  ) photos on true
  order by p.rn;
$$;

revoke execute on function public.search_listings(
  text, integer[], text[], text[], integer, integer, integer, text[], text, date, double precision[], text, integer, integer
) from public;
grant execute on function public.search_listings(
  text, integer[], text[], text[], integer, integer, integer, text[], text, date, double precision[], text, integer, integer
) to anon, authenticated;

-- 5. Index for "newest first", the default order ------------------------------------

create index if not exists listings_active_published_idx
  on public.listings (published_at desc)
  where status = 'active';
