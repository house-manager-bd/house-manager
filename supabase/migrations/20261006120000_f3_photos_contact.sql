-- F3: listing photos, the 4 photo minimum, phone reveal with a daily limit,
-- and closing two privacy gaps for visitors (building name, contact numbers).
-- Every new table has RLS in this migration (working rule).

-- 1. listing_photos -------------------------------------------------------------
-- Files live in the public listing-photos bucket at
-- <user id>/<listing id>/<random id>.webp. Rows are written only through the
-- functions below, which check the poster, the draft status and the limits.
-- The first photo (sort_order 0) is always the cover.

create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) <= 200),
  sort_order smallint not null check (sort_order between 0 and 7),
  is_cover boolean not null default false,
  width integer check (width is null or width between 1 and 10000),
  height integer check (height is null or height between 1 and 10000),
  -- SHA-256 of the original file. A signal for duplicate photos across ads
  -- (F5 moderation), and blocks the same photo twice in one ad.
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create index listing_photos_listing_idx on public.listing_photos (listing_id, sort_order);
create index listing_photos_hash_idx on public.listing_photos (content_hash);
create unique index listing_photos_one_cover on public.listing_photos (listing_id) where is_cover;
create unique index listing_photos_unique_hash_per_listing
  on public.listing_photos (listing_id, content_hash) where content_hash is not null;

alter table public.listing_photos enable row level security;

-- Photos are visible exactly when their ad is visible: the subquery runs
-- under the listings policy (live ads for everyone, any ad for its poster
-- and the building's managers).
create policy "photos follow ad visibility"
  on public.listing_photos for select to anon, authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id));

revoke insert, update, delete on public.listing_photos from anon, authenticated;

-- 2. Storage bucket ----------------------------------------------------------------
-- Public, so ad pages and share previews can load photos without signed URLs.
-- Photos are compressed in the browser (WebP, longest side 1600px, about
-- 250 KB), so 2 MB leaves plenty of room.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 2097152, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

-- Upload only into <own id>/<own draft id>/.
create policy "posters upload photos to own drafts"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(name))[2]
        and l.posted_by = (select auth.uid())
        and l.status = 'draft'
    )
  );

create policy "posters delete own listing photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Removing files needs a select policy too. Public URLs work without it.
create policy "posters list own listing photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- 3. Photo functions -----------------------------------------------------------------

-- Shared check: the caller posted this listing, it is still a draft, and the
-- caller is not banned. Locks the listing row so two uploads at once cannot
-- go past the limit.
create or replace function public.lock_own_draft(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_l record;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and is_banned) then
    raise exception 'banned' using errcode = '42501';
  end if;
  select posted_by, status into v_l from public.listings where id = p_listing_id for update;
  if not found or v_l.posted_by is distinct from v_uid then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_l.status <> 'draft' then
    raise exception 'not_a_draft' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.lock_own_draft(uuid) from public, anon, authenticated;

-- Records a photo that was just uploaded to storage.
create or replace function public.add_listing_photo(
  p_listing_id uuid,
  p_path text,
  p_width integer,
  p_height integer,
  p_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
  v_id uuid;
begin
  perform public.lock_own_draft(p_listing_id);

  -- The file must sit in the caller's folder for this listing, and exist.
  if p_path is null
    or p_path !~ ('^' || v_uid::text || '/' || p_listing_id::text || '/[0-9a-f-]{36}\.(webp|jpg)$')
    or not exists (select 1 from storage.objects o where o.bucket_id = 'listing-photos' and o.name = p_path)
  then
    raise exception 'invalid_photo' using errcode = '22023';
  end if;

  select count(*) into v_count from public.listing_photos where listing_id = p_listing_id;
  if v_count >= 8 then
    raise exception 'too_many_photos' using errcode = 'P0001';
  end if;

  if p_hash is not null and exists (
    select 1 from public.listing_photos where listing_id = p_listing_id and content_hash = lower(p_hash)
  ) then
    raise exception 'duplicate_photo' using errcode = 'P0001';
  end if;

  insert into public.listing_photos (listing_id, storage_path, sort_order, is_cover, width, height, content_hash)
  values (p_listing_id, p_path, v_count, v_count = 0, p_width, p_height, lower(p_hash))
  returning id into v_id;

  return v_id;
end;
$$;

-- Deletes a photo row and returns its storage path, so the caller can remove
-- the file. The remaining photos are numbered again from 0.
create or replace function public.remove_listing_photo(p_photo_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo public.listing_photos%rowtype;
begin
  select * into v_photo from public.listing_photos where id = p_photo_id;
  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform public.lock_own_draft(v_photo.listing_id);

  delete from public.listing_photos where id = p_photo_id;

  update public.listing_photos set is_cover = false where listing_id = v_photo.listing_id and is_cover;
  update public.listing_photos p set
    sort_order = o.rn - 1,
    is_cover = o.rn = 1
  from (
    select id, row_number() over (order by sort_order, created_at) as rn
    from public.listing_photos where listing_id = v_photo.listing_id
  ) o
  where p.id = o.id;

  return v_photo.storage_path;
end;
$$;

-- Saves a new order. p_photo_ids must list every photo of the ad exactly
-- once; the first one becomes the cover.
create or replace function public.reorder_listing_photos(p_listing_id uuid, p_photo_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_own_draft(p_listing_id);

  if p_photo_ids is null
    or cardinality(p_photo_ids) <> (select count(*) from public.listing_photos where listing_id = p_listing_id)
    or cardinality(p_photo_ids) <> (select count(distinct x) from unnest(p_photo_ids) as x)
    or exists (
      select 1 from unnest(p_photo_ids) as x
      where not exists (select 1 from public.listing_photos p where p.id = x and p.listing_id = p_listing_id)
    )
  then
    raise exception 'invalid_order' using errcode = '22023';
  end if;

  -- Two statements, because the one-cover index is checked row by row.
  update public.listing_photos set is_cover = false where listing_id = p_listing_id and is_cover;
  update public.listing_photos p set
    sort_order = o.ord - 1,
    is_cover = o.ord = 1
  from unnest(p_photo_ids) with ordinality as o (id, ord)
  where p.id = o.id;
end;
$$;

revoke execute on function public.add_listing_photo(uuid, text, integer, integer, text) from public, anon;
revoke execute on function public.remove_listing_photo(uuid) from public, anon;
revoke execute on function public.reorder_listing_photos(uuid, uuid[]) from public, anon;
grant execute on function public.add_listing_photo(uuid, text, integer, integer, text) to authenticated;
grant execute on function public.remove_listing_photo(uuid) to authenticated;
grant execute on function public.reorder_listing_photos(uuid, uuid[]) to authenticated;

-- 4. submit_listing: now needs at least 4 photos --------------------------------------
-- Same as F2 plus the photo check. F5 replaces it with automatic checks and
-- the review queue for new members.

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
  v_photos integer;
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
  select count(*) into v_photos from public.listing_photos where listing_id = p_listing_id;

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
  if v_photos < 4 then v_missing := array_append(v_missing, 'photos'); end if;

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

-- 5. Phone reveal with a daily limit (FR12) --------------------------------------------
-- In F2 any logged-in member could read every live ad's number straight from
-- listing_private, which makes scraping easy. Now only the poster and the
-- building's managers read the table; everyone else goes through
-- reveal_contact(), which allows 20 different ads per 24 hours.

create table public.contact_reveals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index contact_reveals_user_time_idx on public.contact_reveals (user_id, created_at desc);
create index contact_reveals_listing_idx on public.contact_reveals (listing_id);

alter table public.contact_reveals enable row level security;

create policy "members see own reveals"
  on public.contact_reveals for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.contact_reveals from anon;
revoke insert, update, delete on public.contact_reveals from authenticated;

drop policy "contact visible to poster or members for live ads" on public.listing_private;

create policy "contact visible to poster or building managers"
  on public.listing_private for select to authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id
        and (
          l.posted_by = (select auth.uid())
          or public.can_manage_building(public.unit_building_id(l.unit_id))
        )
    )
  );

-- Returns the ad's numbers and how many reveals are left today. Opening the
-- same ad again within 24 hours does not use up another reveal.
create or replace function public.reveal_contact(p_listing_id uuid)
returns table (contact_phone text, whatsapp text, remaining integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_l record;
  v_used integer;
  v_limit constant integer := 20;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and is_banned) then
    raise exception 'banned' using errcode = '42501';
  end if;

  select l.posted_by, l.status, l.unit_id into v_l from public.listings l where l.id = p_listing_id;
  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select count(distinct r.listing_id) into v_used
  from public.contact_reveals r
  where r.user_id = v_uid and r.created_at > now() - interval '24 hours';

  -- The poster and the building's managers see their own numbers freely.
  if v_l.posted_by <> v_uid and not public.can_manage_building(public.unit_building_id(v_l.unit_id)) then
    if v_l.status <> 'active' then
      raise exception 'not_allowed' using errcode = '42501';
    end if;

    if not exists (
      select 1 from public.contact_reveals r
      where r.user_id = v_uid and r.listing_id = p_listing_id and r.created_at > now() - interval '24 hours'
    ) then
      if v_used >= v_limit then
        raise exception 'reveal_limit' using errcode = 'P0001';
      end if;
      insert into public.contact_reveals (user_id, listing_id) values (v_uid, p_listing_id);
      v_used := v_used + 1;
    end if;
  end if;

  return query
    select p.contact_phone, p.whatsapp, greatest(v_limit - v_used, 0)
    from public.listing_private p
    where p.listing_id = p_listing_id;
end;
$$;

revoke execute on function public.reveal_contact(uuid) from public, anon;
grant execute on function public.reveal_contact(uuid) to authenticated;

-- 6. Building name stays private for visitors -------------------------------------------
-- The name is often the name on the gate, or the house and road number
-- (see the building form hint), so showing it to visitors would defeat the
-- approximate pin. Visitors can read every other column.

revoke select on public.buildings from anon;
grant select (id, created_by, owner_id, area_id, landmark, approx_lat, approx_lng,
  total_floors, gas, amenities, house_rules, created_at, updated_at)
  on public.buildings to anon;
