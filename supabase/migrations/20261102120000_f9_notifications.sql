-- F9: notifications, in the app and by email (FR29, plan section 9).
-- 1. Every step of a request and every moderation decision on an ad writes
--    a notification for the people it concerns, in the same transaction as
--    the change (triggers on rental_requests and listings), so no code path
--    can forget one:
--      request_new          the landlord side: a member sent a request
--      request_shortlisted  the member: the landlord shortlisted them
--      request_declined     the member: declined (also "filled" automatically)
--      offer_received       the member: an offer, with its 48 hour deadline
--      offer_taken_back     the member: the landlord side took the offer back
--      offer_accepted       the landlord side: the member accepted, tenancy confirmed
--      offer_turned_down    the landlord side: the member turned the offer down
--      offer_expired        both sides: nobody answered in 48 hours
--      ad_approved, ad_rejected, ad_hidden, ad_restored   the poster
--    Nobody is told about their own action. A suspended member hears about
--    the suspension (the F5 notice), not about each of their ads.
-- 2. Members read only their own notifications (RLS), mark them read
--    through mark_notifications_read, and get them live through Realtime.
-- 3. Each notification also waits in an email outbox (notification_emails).
--    The Next.js server sends the emails after the action that caused them
--    (through the project Gmail's SMTP) using claim_notification_emails and
--    finish_notification_emails. Those two need the email worker secret,
--    whose SHA-256 hash lives in private.email_worker (SETUP.md 8.8), so the
--    app needs no Supabase secret key. Members can turn emails off
--    (notification_settings); emails older than 24 hours are never sent.
--
-- Every new table has RLS in this migration (working rule). The whole file
-- is safe to run twice ("if not exists", "or replace", "drop ... if exists").

-- 1. notifications -----------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Text with a check (not an enum), so later features can add types easily.
  type text not null,
  request_id uuid references public.rental_requests (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete cascade,
  -- What the text needs, as it was at that moment: the ad's title and type,
  -- the member's name, the offer's rent and deadline, the decline reason.
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in (
    'request_new', 'request_shortlisted', 'request_declined',
    'offer_received', 'offer_taken_back', 'offer_accepted', 'offer_turned_down', 'offer_expired',
    'ad_approved', 'ad_rejected', 'ad_hidden', 'ad_restored'
  )
);
alter table public.notifications drop constraint if exists notifications_data_check;
alter table public.notifications add constraint notifications_data_check
  check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 2000);

comment on table public.notifications is
  'In-app notifications (F9). Written only by the request and listing triggers; read by their member; marked read through mark_notifications_read.';

create index if not exists notifications_user_time_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index if not exists notifications_request_idx on public.notifications (request_id);
create index if not exists notifications_listing_idx on public.notifications (listing_id);

alter table public.notifications enable row level security;

drop policy if exists "members read their own notifications" on public.notifications;
create policy "members read their own notifications"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.notifications from anon;
revoke insert, update, delete on public.notifications from authenticated;
grant select on public.notifications to authenticated;

-- 2. notification_emails: the email outbox ------------------------------------------------
-- One row per notification. Only the functions below read or change it.

create table if not exists public.notification_emails (
  notification_id uuid primary key references public.notifications (id) on delete cascade,
  status text not null default 'pending',
  attempts smallint not null default 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  -- Why it was skipped (turned_off, no_email, stale) or why sending failed.
  last_error text,
  created_at timestamptz not null default now()
);

alter table public.notification_emails drop constraint if exists notification_emails_status_check;
alter table public.notification_emails add constraint notification_emails_status_check check (
  status in ('pending', 'sending', 'sent', 'skipped', 'failed')
  and attempts between 0 and 10
  and (last_error is null or char_length(last_error) <= 300)
);

comment on table public.notification_emails is
  'Email outbox for notifications (F9). The app server claims and sends them with the email worker secret. No member can read it.';

create index if not exists notification_emails_waiting_idx
  on public.notification_emails (created_at)
  where status in ('pending', 'sending', 'failed');

alter table public.notification_emails enable row level security;
revoke all on public.notification_emails from anon, authenticated;

-- 3. notification_settings: emails on or off -------------------------------------------
-- No row means the defaults (emails on).

create table if not exists public.notification_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  email_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.notification_settings is
  'A member''s notification choices (F9). Changed only through set_email_notifications.';

alter table public.notification_settings enable row level security;

drop policy if exists "members read their own notification settings" on public.notification_settings;
create policy "members read their own notification settings"
  on public.notification_settings for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.notification_settings from anon;
revoke insert, update, delete on public.notification_settings from authenticated;
grant select on public.notification_settings to authenticated;

-- 4. The email worker secret (hash only) -------------------------------------------------
-- The private schema is not exposed through the API. The app server has the
-- secret itself (EMAIL_WORKER_SECRET on Vercel); this table only has its
-- SHA-256 hash, set once in the SQL Editor (SETUP.md 8.8).

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.email_worker (
  id boolean primary key default true check (id),
  secret_hash bytea not null check (octet_length(secret_hash) = 32),
  updated_at timestamptz not null default now()
);

alter table private.email_worker enable row level security;
revoke all on private.email_worker from public, anon, authenticated;

create or replace function public.email_worker_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_secret is not null
    and char_length(p_secret) between 32 and 200
    and exists (
      select 1 from private.email_worker w
      where w.secret_hash = sha256(convert_to(p_secret, 'UTF8'))
    );
$$;

revoke execute on function public.email_worker_ok(text) from public, anon, authenticated;

-- 5. Writing notifications ----------------------------------------------------------------

-- The ad's landlord side: the poster and the building's managers (the same
-- people as managed_listing_ids, seen from the ad). Internal.
create or replace function public.listing_side_member_ids(p_listing_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.posted_by from public.listings l where l.id = p_listing_id
  union
  select m.user_id
  from public.listings l
  join public.units u on u.id = l.unit_id
  join public.building_managers m on m.building_id = u.building_id
  where l.id = p_listing_id
  union
  select b.created_by
  from public.listings l
  join public.units u on u.id = l.unit_id
  join public.buildings b on b.id = u.building_id
  where l.id = p_listing_id;
$$;

revoke execute on function public.listing_side_member_ids(uuid) from public, anon, authenticated;

-- One notification and its email. Internal.
create or replace function public.add_notification(
  p_user_id uuid,
  p_type text,
  p_request_id uuid,
  p_listing_id uuid,
  p_data jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_user_id is null then
    return;
  end if;
  insert into public.notifications (user_id, type, request_id, listing_id, data)
  values (p_user_id, p_type, p_request_id, p_listing_id, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;
  insert into public.notification_emails (notification_id) values (v_id);
end;
$$;

revoke execute on function public.add_notification(uuid, text, uuid, uuid, jsonb) from public, anon, authenticated;

-- Request steps (plan section 1.4). Runs after every new request and every
-- status change, inside the same transaction as the change.
create or replace function public.notify_request_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_type text;
  v_to_seeker boolean := false;
  v_to_landlord boolean := false;
  v_title text;
  v_listing_type public.listing_type;
  v_member text;
  v_data jsonb;
  v_uid uuid;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      return null;
    end if;
    v_type := 'request_new';
    v_to_landlord := true;
  elsif new.status is not distinct from old.status then
    return null;
  elsif old.status = 'pending' and new.status = 'shortlisted' then
    v_type := 'request_shortlisted';
    v_to_seeker := true;
  elsif new.status = 'offered' then
    v_type := 'offer_received';
    v_to_seeker := true;
  elsif old.status = 'offered' and new.status = 'confirmed' then
    v_type := 'offer_accepted';
    v_to_landlord := true;
  elsif new.status = 'declined' then
    -- A landlord's answer, or the automatic "filled" when the place is taken.
    v_type := case when old.status = 'offered' then 'offer_taken_back' else 'request_declined' end;
    v_to_seeker := true;
  elsif old.status = 'offered' and new.status = 'withdrawn' then
    v_type := 'offer_turned_down';
    v_to_landlord := true;
  elsif old.status = 'offered' and new.status = 'expired' then
    v_type := 'offer_expired';
    v_to_seeker := true;
    v_to_landlord := true;
  else
    -- Withdrawing a new or shortlisted request tells nobody: it simply
    -- leaves the landlord's inbox.
    return null;
  end if;

  select l.title, l.listing_type into v_title, v_listing_type
  from public.listings l where l.id = new.listing_id;
  select p.full_name into v_member from public.profiles p where p.id = new.tenant_id;

  v_data := jsonb_build_object('title', v_title, 'listing_type', v_listing_type);
  if v_type = 'request_new' then
    v_data := v_data || jsonb_build_object(
      'member_name', v_member,
      'members_count', new.members_count,
      'household_type', new.household_type
    );
  elsif v_type = 'offer_received' then
    v_data := v_data || jsonb_build_object('rent', new.offer_rent, 'expires_at', new.offer_expires_at);
  elsif v_type in ('request_declined', 'offer_taken_back') then
    v_data := v_data || jsonb_build_object('reason', new.decline_reason);
  elsif v_type in ('offer_accepted', 'offer_turned_down', 'offer_expired') then
    v_data := v_data || jsonb_build_object('member_name', v_member);
  end if;

  -- Expiry is nobody's action (it is written when someone next touches the
  -- ad), so both sides hear about it, whoever that was.
  if v_to_seeker and (v_type = 'offer_expired' or new.tenant_id is distinct from v_actor) then
    perform public.add_notification(
      new.tenant_id, v_type, new.id, new.listing_id,
      v_data || case when v_type = 'offer_expired' then '{"side": "seeker"}'::jsonb else '{}'::jsonb end
    );
  end if;

  if v_to_landlord then
    for v_uid in select s from public.listing_side_member_ids(new.listing_id) s loop
      if v_uid <> new.tenant_id and (v_type = 'offer_expired' or v_uid is distinct from v_actor) then
        perform public.add_notification(
          v_uid, v_type, new.id, new.listing_id,
          v_data || case when v_type = 'offer_expired' then '{"side": "landlord"}'::jsonb else '{}'::jsonb end
        );
      end if;
    end loop;
  end if;

  return null;
end;
$$;

revoke execute on function public.notify_request_change() from public, anon, authenticated;

drop trigger if exists rental_requests_notify on public.rental_requests;
create trigger rental_requests_notify
  after insert or update of status on public.rental_requests
  for each row execute function public.notify_request_change();

-- Moderation decisions on an ad (plan section 1.6), for its poster.
create or replace function public.notify_listing_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  if new.status is not distinct from old.status then
    return null;
  end if;

  if old.status = 'pending_review' and new.status = 'active' then
    v_type := 'ad_approved';
  elsif old.status in ('pending_review', 'active', 'hidden') and new.status = 'rejected' then
    v_type := 'ad_rejected';
  elsif old.status = 'active' and new.status = 'hidden' then
    -- An admin, or three reports.
    v_type := 'ad_hidden';
  elsif old.status = 'hidden' and new.status = 'active' then
    v_type := 'ad_restored';
  else
    return null;
  end if;

  if new.posted_by is not distinct from auth.uid() then
    return null;
  end if;
  -- A ban hides and rejects every ad of the member at once; the member sees
  -- the suspension notice instead.
  if exists (select 1 from public.profiles where id = new.posted_by and is_banned) then
    return null;
  end if;

  perform public.add_notification(
    new.posted_by, v_type, null, new.id,
    jsonb_build_object('title', new.title, 'listing_type', new.listing_type)
  );
  return null;
end;
$$;

revoke execute on function public.notify_listing_change() from public, anon, authenticated;

drop trigger if exists listings_notify on public.listings;
create trigger listings_notify
  after update of status on public.listings
  for each row execute function public.notify_listing_change();

-- 6. Reading and marking read ------------------------------------------------------------

-- The bell's number.
create or replace function public.unread_notification_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.notifications
  where user_id = (select auth.uid()) and read_at is null;
$$;

revoke execute on function public.unread_notification_count() from public, anon;
grant execute on function public.unread_notification_count() to authenticated;

-- Marks the caller's unread notifications as read: one (p_notification_id),
-- those about one request (p_request_id, when its page is opened), or all
-- (neither). Returns how many changed.
create or replace function public.mark_notifications_read(
  p_notification_id uuid default null,
  p_request_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  update public.notifications
  set read_at = now()
  where user_id = v_uid
    and read_at is null
    and (p_notification_id is null or id = p_notification_id)
    and (p_request_id is null or request_id = p_request_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.mark_notifications_read(uuid, uuid) from public, anon;
grant execute on function public.mark_notifications_read(uuid, uuid) to authenticated;

-- Emails on or off for the caller.
create or replace function public.set_email_notifications(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  insert into public.notification_settings (user_id, email_enabled)
  values (v_uid, p_enabled)
  on conflict (user_id) do update set email_enabled = excluded.email_enabled, updated_at = now();
end;
$$;

revoke execute on function public.set_email_notifications(boolean) from public, anon;
grant execute on function public.set_email_notifications(boolean) to authenticated;

-- 7. The email worker (the Next.js server, with EMAIL_WORKER_SECRET) -------------------

-- Takes up to p_limit emails to send (at most 50) and marks them "sending",
-- with each recipient's address, name and language. Several workers at the
-- same moment never get the same email (skip locked). Before that it skips:
-- emails older than 24 hours, members who turned emails off, and members
-- without a confirmed address. A failed email is tried again after 5
-- minutes, at most 3 times; one stuck in "sending" after 10 minutes.
create or replace function public.claim_notification_emails(p_secret text, p_limit integer default 20)
returns table (
  notification_id uuid,
  email text,
  full_name text,
  locale public.app_locale,
  type text,
  data jsonb,
  request_id uuid,
  listing_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.email_worker_ok(p_secret) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  update public.notification_emails e
  set status = 'skipped', last_error = 'stale'
  where e.status in ('pending', 'sending', 'failed')
    and e.created_at < now() - interval '24 hours';

  update public.notification_emails e
  set status = 'skipped', last_error = 'turned_off'
  from public.notifications n
  join public.notification_settings s on s.user_id = n.user_id
  where n.id = e.notification_id and e.status = 'pending' and not s.email_enabled;

  update public.notification_emails e
  set status = 'skipped', last_error = 'no_email'
  from public.notifications n
  where n.id = e.notification_id and e.status = 'pending'
    and not exists (
      select 1 from auth.users u
      where u.id = n.user_id and u.email is not null and u.email_confirmed_at is not null
    );

  return query
  with picked as (
    select e.notification_id
    from public.notification_emails e
    where e.status = 'pending'
      or (e.status = 'failed' and e.attempts < 3 and e.claimed_at < now() - interval '5 minutes')
      or (e.status = 'sending' and e.attempts < 3 and e.claimed_at < now() - interval '10 minutes')
    order by e.created_at
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
    for update skip locked
  ),
  claimed as (
    update public.notification_emails e
    set status = 'sending', attempts = e.attempts + 1, claimed_at = now()
    from picked
    where e.notification_id = picked.notification_id
    returning e.notification_id
  )
  select n.id, u.email::text, p.full_name, p.preferred_locale, n.type, n.data,
         n.request_id, n.listing_id, n.created_at
  from claimed c
  join public.notifications n on n.id = c.notification_id
  join public.profiles p on p.id = n.user_id
  join auth.users u on u.id = n.user_id
  order by n.created_at;
end;
$$;

-- The worker calls without a member's session (as anon); the secret is the check.
revoke execute on function public.claim_notification_emails(text, integer) from public;
grant execute on function public.claim_notification_emails(text, integer) to anon, authenticated;

-- Records what happened to the claimed emails.
create or replace function public.finish_notification_emails(
  p_secret text,
  p_sent uuid[],
  p_failed uuid[],
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.email_worker_ok(p_secret) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.notification_emails
  set status = 'sent', sent_at = now(), last_error = null
  where notification_id = any (coalesce(p_sent, '{}'::uuid[])) and status = 'sending';
  update public.notification_emails
  set status = 'failed', last_error = left(coalesce(p_error, 'failed'), 300)
  where notification_id = any (coalesce(p_failed, '{}'::uuid[])) and status = 'sending';
end;
$$;

revoke execute on function public.finish_notification_emails(text, uuid[], uuid[], text) from public;
grant execute on function public.finish_notification_emails(text, uuid[], uuid[], text) to anon, authenticated;

-- 8. Live updates ---------------------------------------------------------------------------
-- Realtime checks the read policy above for every listener, so a member
-- only receives their own notifications.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    )
  then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
