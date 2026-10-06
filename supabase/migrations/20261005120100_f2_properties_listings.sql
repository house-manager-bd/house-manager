-- F2: buildings, units, nearby places and listings (text only, photos come in F3)
-- Shared with House Manage: buildings, building_managers, units.
-- Every table has RLS. Multi-table writes go through security definer
-- functions that check the caller, so a half-saved building cannot happen.

-- 1. Types ---------------------------------------------------------------------

create type public.gas_type as enum ('titas_line', 'lpg', 'none');
create type public.manager_role as enum ('owner', 'caretaker');
create type public.unit_kind as enum ('flat', 'room', 'mess_room');
create type public.unit_status as enum ('vacant', 'listed', 'occupied');
create type public.furnishing as enum ('unfurnished', 'semi_furnished', 'furnished');
create type public.nearby_kind as enum ('metro', 'bus_stop', 'market', 'school', 'hospital', 'mosque', 'park');
create type public.listing_type as enum ('flat', 'room', 'sublet', 'mess_seat');
create type public.posted_as as enum ('owner', 'caretaker', 'tenant_sublet');
create type public.listing_status as enum ('draft', 'pending_review', 'active', 'rented', 'expired', 'rejected', 'hidden');
create type public.electricity_billing as enum ('prepaid', 'postpaid', 'included');
create type public.water_billing as enum ('included', 'tenant_pays');
create type public.gas_billing as enum ('included', 'tenant_pays');

-- 2. Buildings -------------------------------------------------------------------

create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles (id),
  -- Empty while the owner is not on the platform (caretaker or subletting
  -- tenant added the building). A claim flow fills it later.
  owner_id uuid references public.profiles (id),
  name text not null check (char_length(name) between 2 and 80),
  area_id integer not null references public.areas (id),
  landmark text check (landmark is null or char_length(landmark) <= 120),
  -- Public pin: the exact pin moved by a fixed random offset (plan section 4).
  approx_lat numeric(9, 6) not null check (approx_lat between 20.5 and 26.7),
  approx_lng numeric(9, 6) not null check (approx_lng between 88.0 and 92.7),
  total_floors smallint check (total_floors is null or total_floors between 1 and 60),
  gas public.gas_type not null default 'none',
  amenities text[] not null default '{}'
    check (amenities <@ array['lift', 'parking', 'generator', 'security_guard', 'cctv', 'rooftop']::text[]),
  -- { pets, smoking, guests, gate_closing_time, rooftop_use, notes }
  house_rules jsonb not null default '{}'::jsonb
    check (jsonb_typeof(house_rules) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index buildings_area_idx on public.buildings (area_id);
create index buildings_pin_idx on public.buildings (approx_lat, approx_lng);
create index buildings_created_by_idx on public.buildings (created_by);
create index buildings_owner_idx on public.buildings (owner_id);
create index buildings_amenities_idx on public.buildings using gin (amenities);

create trigger buildings_set_updated_at
  before update on public.buildings
  for each row execute function public.set_updated_at();

create table public.building_private (
  building_id uuid primary key references public.buildings (id) on delete cascade,
  road_address text not null check (char_length(road_address) between 3 and 200),
  house_no text check (house_no is null or char_length(house_no) <= 40),
  exact_lat numeric(9, 6) not null check (exact_lat between 20.5 and 26.7),
  exact_lng numeric(9, 6) not null check (exact_lng between 88.0 and 92.7),
  -- Saved once when the building is created, so the public pin never moves
  -- around (averaging many page loads would otherwise reveal the real spot).
  offset_lat numeric(9, 6) not null,
  offset_lng numeric(9, 6) not null
);

create table public.building_managers (
  building_id uuid not null references public.buildings (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.manager_role not null,
  added_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (building_id, user_id)
);

create index building_managers_user_idx on public.building_managers (user_id);

create table public.nearby_places (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings (id) on delete cascade,
  kind public.nearby_kind not null,
  name text not null check (char_length(name) between 2 and 80),
  walk_minutes smallint check (walk_minutes is null or walk_minutes between 1 and 120)
);

create index nearby_places_building_idx on public.nearby_places (building_id);

-- 3. Units ------------------------------------------------------------------------

create table public.units (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 40),
  unit_kind public.unit_kind not null,
  floor_no smallint check (floor_no is null or floor_no between 0 and 60),
  size_sqft integer check (size_sqft is null or size_sqft between 50 and 20000),
  bedrooms smallint check (bedrooms is null or bedrooms between 0 and 20),
  bathrooms smallint check (bathrooms is null or bathrooms between 0 and 20),
  balconies smallint check (balconies is null or balconies between 0 and 20),
  facing text check (facing is null or facing in ('north', 'south', 'east', 'west', 'north_east', 'north_west', 'south_east', 'south_west')),
  furnishing public.furnishing not null default 'unfurnished',
  -- Beds in a mess room, 1 for flats and rooms.
  capacity smallint not null default 1 check (capacity between 1 and 30),
  status public.unit_status not null default 'vacant',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (building_id, label)
);

create index units_building_status_idx on public.units (building_id, status);

create trigger units_set_updated_at
  before update on public.units
  for each row execute function public.set_updated_at();

-- 4. Listings ------------------------------------------------------------------------
-- Drafts may be incomplete, so most columns are nullable. submit_listing
-- checks that everything needed is filled in before an ad goes live.

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id) on delete restrict,
  posted_by uuid not null references public.profiles (id),
  posted_as public.posted_as not null,
  owner_name text check (owner_name is null or char_length(owner_name) between 2 and 80),
  sublet_consent boolean not null default false,
  listing_type public.listing_type not null,
  tenant_types text[] not null default '{}'
    check (tenant_types <@ array['family', 'bachelor_male', 'bachelor_female', 'student', 'job_holder']::text[]),
  title text check (title is null or char_length(title) between 5 and 100),
  description text check (description is null or char_length(description) <= 2000),
  open_slots smallint not null default 1 check (open_slots between 1 and 30),
  max_occupants smallint check (max_occupants is null or max_occupants between 1 and 30),
  monthly_rent integer check (monthly_rent is null or monthly_rent between 500 and 10000000),
  rent_negotiable boolean not null default false,
  advance_months smallint check (advance_months is null or advance_months between 0 and 12),
  service_charge integer check (service_charge is null or service_charge between 0 and 1000000),
  electricity public.electricity_billing,
  water public.water_billing,
  gas_bill public.gas_billing,
  other_charges text check (other_charges is null or char_length(other_charges) <= 300),
  extra_rules text check (extra_rules is null or char_length(extra_rules) <= 1000),
  agreement_required boolean not null default true,
  dmp_form_required boolean not null default true,
  available_from date,
  status public.listing_status not null default 'draft',
  rejection_reason text,
  published_at timestamptz,
  expires_at timestamptz,
  is_featured boolean not null default false,
  featured_until timestamptz,
  view_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One open ad per unit (a draft also counts, so two people cannot draft the
-- same unit at once).
create unique index listings_one_open_per_unit
  on public.listings (unit_id)
  where status in ('draft', 'pending_review', 'active', 'hidden');

create index listings_status_rent_idx on public.listings (status, monthly_rent);
create index listings_posted_by_idx on public.listings (posted_by);
create index listings_tenant_types_idx on public.listings using gin (tenant_types);

create trigger listings_set_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

create table public.listing_private (
  listing_id uuid primary key references public.listings (id) on delete cascade,
  contact_phone text check (contact_phone is null or contact_phone ~ '^\+8801[3-9][0-9]{8}$'),
  whatsapp text check (whatsapp is null or whatsapp ~ '^\+8801[3-9][0-9]{8}$')
);

-- 5. Access helpers ---------------------------------------------------------------
-- security definer so policies can use them without recursive RLS checks.

-- Owner or caretaker of the building, or the person who added it
-- (a subletting tenant manages only the record they created).
create or replace function public.can_manage_building(p_building_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.building_managers m
    where m.building_id = p_building_id and m.user_id = (select auth.uid())
  ) or exists (
    select 1 from public.buildings b
    where b.id = p_building_id and b.created_by = (select auth.uid())
  );
$$;

create or replace function public.building_has_active_listing(p_building_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.listings l
    join public.units u on u.id = l.unit_id
    where u.building_id = p_building_id and l.status = 'active'
  );
$$;

create or replace function public.unit_building_id(p_unit_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select building_id from public.units where id = p_unit_id;
$$;

revoke execute on function public.can_manage_building(uuid) from public;
revoke execute on function public.building_has_active_listing(uuid) from public;
revoke execute on function public.unit_building_id(uuid) from public;
grant execute on function public.can_manage_building(uuid) to anon, authenticated;
grant execute on function public.building_has_active_listing(uuid) to anon, authenticated;
grant execute on function public.unit_building_id(uuid) to anon, authenticated;

-- 6. Row Level Security ------------------------------------------------------------

alter table public.buildings enable row level security;
alter table public.building_private enable row level security;
alter table public.building_managers enable row level security;
alter table public.nearby_places enable row level security;
alter table public.units enable row level security;
alter table public.listings enable row level security;
alter table public.listing_private enable row level security;

-- Writes to buildings, building_private, building_managers and nearby_places
-- only happen inside save_building().
revoke insert, update, delete on public.buildings, public.building_private,
  public.building_managers, public.nearby_places from anon, authenticated;

-- Buildings: managers always; everyone while the building has a live ad
-- (name, area, approximate pin, facilities and house rules show on ads).
create policy "buildings visible to managers or with a live ad"
  on public.buildings for select to anon, authenticated
  using (public.can_manage_building(id) or public.building_has_active_listing(id));

-- Exact address: managers always; logged-in members while there is a live ad.
-- F8 adds active tenants.
create policy "exact address for managers or members with a live ad"
  on public.building_private for select to authenticated
  using (
    public.can_manage_building(building_id)
    or public.building_has_active_listing(building_id)
  );
revoke select on public.building_private from anon;

create policy "managers see who manages their buildings"
  on public.building_managers for select to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_building(building_id));

create policy "nearby places follow building visibility"
  on public.nearby_places for select to anon, authenticated
  using (public.can_manage_building(building_id) or public.building_has_active_listing(building_id));

-- Units: managers read and write; everyone reads a unit with a live ad.
create policy "units visible to managers or with a live ad"
  on public.units for select to anon, authenticated
  using (
    public.can_manage_building(building_id)
    or exists (select 1 from public.listings l where l.unit_id = units.id and l.status = 'active')
  );

create policy "managers add units"
  on public.units for insert to authenticated
  with check (public.can_manage_building(building_id));

create policy "managers edit units"
  on public.units for update to authenticated
  using (public.can_manage_building(building_id))
  with check (public.can_manage_building(building_id));

-- A unit with any ad cannot be deleted (listings.unit_id is on delete restrict).
create policy "managers delete units"
  on public.units for delete to authenticated
  using (public.can_manage_building(building_id));

revoke insert, update, delete on public.units from anon;
revoke update on public.units from authenticated;
-- status changes only through listing functions; building_id never moves.
grant update (label, unit_kind, floor_no, size_sqft, bedrooms, bathrooms, balconies, facing, furnishing, capacity)
  on public.units to authenticated;

-- Listings: the poster always; building managers; everyone for live ads.
create policy "listings visible to poster, managers, or when live"
  on public.listings for select to anon, authenticated
  using (
    status = 'active'
    or posted_by = (select auth.uid())
    or public.can_manage_building(public.unit_building_id(unit_id))
  );

-- Only drafts are edited directly, and only by the poster. Creating,
-- submitting and status changes go through functions.
create policy "poster edits own drafts"
  on public.listings for update to authenticated
  using (posted_by = (select auth.uid()) and status = 'draft')
  with check (posted_by = (select auth.uid()) and status = 'draft');

create policy "poster deletes own drafts"
  on public.listings for delete to authenticated
  using (posted_by = (select auth.uid()) and status = 'draft');

revoke insert, update, delete on public.listings from anon;
revoke insert, update on public.listings from authenticated;
grant update (owner_name, sublet_consent, listing_type, tenant_types, title, description,
  open_slots, max_occupants, monthly_rent, rent_negotiable, advance_months, service_charge,
  electricity, water, gas_bill, other_charges, extra_rules, agreement_required,
  available_from)
  on public.listings to authenticated;

-- Contact numbers: the poster; logged-in members for live ads (FR12).
create policy "contact visible to poster or members for live ads"
  on public.listing_private for select to authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id
        and (l.posted_by = (select auth.uid()) or l.status = 'active')
    )
  );

create policy "poster edits contact on drafts"
  on public.listing_private for update to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and l.posted_by = (select auth.uid()) and l.status = 'draft'))
  with check (exists (select 1 from public.listings l where l.id = listing_id and l.posted_by = (select auth.uid()) and l.status = 'draft'));

revoke select, insert, update, delete on public.listing_private from anon;
revoke insert, delete, update on public.listing_private from authenticated;
grant update (contact_phone, whatsapp) on public.listing_private to authenticated;

-- 7. save_building: create or edit a building in one transaction ----------------
-- p_data keys: name, my_role (owner | caretaker | tenant, create only),
-- area_id, landmark, road_address, house_no, exact_lat, exact_lng,
-- total_floors, gas, amenities (array), house_rules (object),
-- nearby (array of { kind, name, walk_minutes }).

create or replace function public.save_building(p_building_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := p_building_id;
  v_role text := p_data ->> 'my_role';
  v_lat numeric := (p_data ->> 'exact_lat')::numeric;
  v_lng numeric := (p_data ->> 'exact_lng')::numeric;
  v_off_lat numeric;
  v_off_lng numeric;
  v_angle double precision;
  v_dist double precision;
  v_amenities text[];
  v_nearby jsonb := coalesce(p_data -> 'nearby', '[]'::jsonb);
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and is_banned) then
    raise exception 'banned' using errcode = '42501';
  end if;
  if jsonb_typeof(v_nearby) <> 'array' or jsonb_array_length(v_nearby) > 10 then
    raise exception 'invalid_nearby' using errcode = '22023';
  end if;

  select coalesce(array_agg(value), '{}') into v_amenities
  from jsonb_array_elements_text(coalesce(p_data -> 'amenities', '[]'::jsonb));

  if v_id is null then
    if v_role not in ('owner', 'caretaker', 'tenant') then
      raise exception 'invalid_role' using errcode = '22023';
    end if;

    -- Random offset of 80 to 250 metres in a random direction, saved once.
    v_angle := random() * 2 * pi();
    v_dist := 80 + random() * 170;
    v_off_lat := round((v_dist * cos(v_angle) / 111320)::numeric, 6);
    v_off_lng := round((v_dist * sin(v_angle) / (111320 * cos(radians(v_lat::double precision))))::numeric, 6);

    insert into public.buildings (
      created_by, owner_id, name, area_id, landmark, approx_lat, approx_lng,
      total_floors, gas, amenities, house_rules
    ) values (
      v_uid,
      case when v_role = 'owner' then v_uid end,
      trim(p_data ->> 'name'),
      (p_data ->> 'area_id')::integer,
      nullif(trim(p_data ->> 'landmark'), ''),
      round(v_lat + v_off_lat, 4),
      round(v_lng + v_off_lng, 4),
      nullif(p_data ->> 'total_floors', '')::smallint,
      coalesce(nullif(p_data ->> 'gas', ''), 'none')::public.gas_type,
      v_amenities,
      coalesce(p_data -> 'house_rules', '{}'::jsonb)
    )
    returning id into v_id;

    insert into public.building_private (building_id, road_address, house_no, exact_lat, exact_lng, offset_lat, offset_lng)
    values (v_id, trim(p_data ->> 'road_address'), nullif(trim(p_data ->> 'house_no'), ''), v_lat, v_lng, v_off_lat, v_off_lng);

    if v_role in ('owner', 'caretaker') then
      insert into public.building_managers (building_id, user_id, role, added_by)
      values (v_id, v_uid, v_role::public.manager_role, v_uid);
    end if;
  else
    if not public.can_manage_building(v_id) then
      raise exception 'not_allowed' using errcode = '42501';
    end if;

    select offset_lat, offset_lng into v_off_lat, v_off_lng
    from public.building_private where building_id = v_id;

    update public.buildings set
      name = trim(p_data ->> 'name'),
      area_id = (p_data ->> 'area_id')::integer,
      landmark = nullif(trim(p_data ->> 'landmark'), ''),
      approx_lat = round(v_lat + v_off_lat, 4),
      approx_lng = round(v_lng + v_off_lng, 4),
      total_floors = nullif(p_data ->> 'total_floors', '')::smallint,
      gas = coalesce(nullif(p_data ->> 'gas', ''), 'none')::public.gas_type,
      amenities = v_amenities,
      house_rules = coalesce(p_data -> 'house_rules', '{}'::jsonb)
    where id = v_id;

    update public.building_private set
      road_address = trim(p_data ->> 'road_address'),
      house_no = nullif(trim(p_data ->> 'house_no'), ''),
      exact_lat = v_lat,
      exact_lng = v_lng
    where building_id = v_id;

    delete from public.nearby_places where building_id = v_id;
  end if;

  insert into public.nearby_places (building_id, kind, name, walk_minutes)
  select v_id,
         (item ->> 'kind')::public.nearby_kind,
         trim(item ->> 'name'),
         nullif(item ->> 'walk_minutes', '')::smallint
  from jsonb_array_elements(v_nearby) as item
  where nullif(trim(item ->> 'name'), '') is not null;

  return v_id;
end;
$$;

revoke execute on function public.save_building(uuid, jsonb) from public, anon;
grant execute on function public.save_building(uuid, jsonb) to authenticated;

-- 8. create_listing_draft: start an ad for a unit -----------------------------------
-- Returns the existing draft when the caller already has one for this unit.

create or replace function public.create_listing_draft(p_unit_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_unit public.units%rowtype;
  v_building public.buildings%rowtype;
  v_role public.manager_role;
  v_posted_as public.posted_as;
  v_type public.listing_type;
  v_open record;
  v_id uuid;
  v_phone text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and is_banned) then
    raise exception 'banned' using errcode = '42501';
  end if;

  select * into v_unit from public.units where id = p_unit_id;
  if not found or not public.can_manage_building(v_unit.building_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select id, posted_by, status into v_open
  from public.listings
  where unit_id = p_unit_id and status in ('draft', 'pending_review', 'active', 'hidden');

  if found then
    if v_open.status = 'draft' and v_open.posted_by = v_uid then
      return v_open.id;
    end if;
    raise exception 'unit_has_open_listing' using errcode = 'P0001';
  end if;

  select * into v_building from public.buildings where id = v_unit.building_id;
  select role into v_role from public.building_managers
  where building_id = v_unit.building_id and user_id = v_uid;

  -- Who is posting follows from the person's link to the building.
  v_posted_as := case
    when v_role = 'owner' then 'owner'
    when v_role = 'caretaker' then 'caretaker'
    else 'tenant_sublet'
  end;

  v_type := case
    when v_unit.unit_kind = 'mess_room' then 'mess_seat'
    when v_posted_as = 'tenant_sublet' then 'sublet'
    when v_unit.unit_kind = 'room' then 'room'
    else 'flat'
  end;

  select phone into v_phone from public.profile_private where user_id = v_uid;

  insert into public.listings (unit_id, posted_by, posted_as, listing_type, open_slots, owner_name)
  values (
    p_unit_id, v_uid, v_posted_as, v_type, 1,
    -- A caretaker's previous ad in this building already named the owner.
    case when v_posted_as = 'caretaker' then (
      select l.owner_name from public.listings l
      join public.units u on u.id = l.unit_id
      where u.building_id = v_unit.building_id and l.owner_name is not null
      order by l.created_at desc limit 1
    ) end
  )
  returning id into v_id;

  insert into public.listing_private (listing_id, contact_phone)
  values (v_id, v_phone);

  return v_id;
end;
$$;

revoke execute on function public.create_listing_draft(uuid) from public, anon;
grant execute on function public.create_listing_draft(uuid) to authenticated;

-- 9. submit_listing: check a draft and publish it ------------------------------------
-- F2 publishes straight away. F3 adds the 4 photo minimum, F5 replaces this
-- with automatic checks and the review queue for new members.

create or replace function public.submit_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_l public.listings%rowtype;
  v_unit public.units%rowtype;
  v_phone text;
  v_missing text[] := '{}';
begin
  select * into v_l from public.listings where id = p_listing_id for update;
  if not found or v_l.posted_by is distinct from v_uid then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_l.status <> 'draft' then
    raise exception 'not_a_draft' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and is_banned) then
    raise exception 'banned' using errcode = '42501';
  end if;

  select * into v_unit from public.units where id = v_l.unit_id;
  select contact_phone into v_phone from public.listing_private where listing_id = p_listing_id;

  if v_l.title is null then v_missing := array_append(v_missing, 'title'); end if;
  if v_l.available_from is null then v_missing := array_append(v_missing, 'available_from'); end if;
  if v_l.monthly_rent is null then v_missing := array_append(v_missing, 'monthly_rent'); end if;
  if v_l.advance_months is null then v_missing := array_append(v_missing, 'advance_months'); end if;
  if v_l.electricity is null then v_missing := array_append(v_missing, 'electricity'); end if;
  if v_l.water is null then v_missing := array_append(v_missing, 'water'); end if;
  if cardinality(v_l.tenant_types) = 0 then v_missing := array_append(v_missing, 'tenant_types'); end if;
  if v_phone is null then v_missing := array_append(v_missing, 'contact_phone'); end if;
  if v_l.posted_as = 'caretaker' and v_l.owner_name is null then v_missing := array_append(v_missing, 'owner_name'); end if;
  if v_l.posted_as = 'tenant_sublet' and not v_l.sublet_consent then v_missing := array_append(v_missing, 'sublet_consent'); end if;
  if v_l.listing_type = 'mess_seat' and v_unit.unit_kind <> 'mess_room' then v_missing := array_append(v_missing, 'listing_type'); end if;
  if v_l.open_slots > v_unit.capacity then v_missing := array_append(v_missing, 'open_slots'); end if;

  if cardinality(v_missing) > 0 then
    raise exception 'listing_incomplete' using errcode = 'P0001', detail = array_to_string(v_missing, ',');
  end if;

  update public.listings set
    status = 'active',
    published_at = now(),
    expires_at = now() + interval '30 days'
  where id = p_listing_id;

  update public.units set status = 'listed' where id = v_l.unit_id and status = 'vacant';
end;
$$;

revoke execute on function public.submit_listing(uuid) from public, anon;
grant execute on function public.submit_listing(uuid) to authenticated;
