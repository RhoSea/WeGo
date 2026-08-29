-- WeGo — full database schema, Row Level Security policies and RPCs.
-- Paste this whole file into the Supabase SQL editor and run it once.
-- It is idempotent enough to re-run on a fresh project.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text,
  created_at   timestamptz not null default now()
);

create table if not exists public.trips (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(btrim(name)) between 1 and 120),
  destination    text not null check (length(btrim(destination)) between 1 and 160),
  departure_date date not null,
  currency       text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  created_by     uuid not null references auth.users (id) on delete cascade,
  created_at     timestamptz not null default now()
);

create table if not exists public.trip_members (
  id        uuid primary key default gen_random_uuid(),
  trip_id   uuid not null references public.trips (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  unique (trip_id, user_id)
);

create table if not exists public.invitations (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  token       text not null unique,
  label       text,
  created_by  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null
);

create table if not exists public.plan_items (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  title      text not null check (length(btrim(title)) between 1 and 200),
  item_date  date,
  link       text check (link is null or link ~ '^https?://'),
  note       text check (note is null or length(note) <= 2000),
  status     text not null default 'idea' check (status in ('idea', 'maybe', 'confirmed', 'booked')),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.costs (
  id               uuid primary key default gen_random_uuid(),
  trip_id          uuid not null references public.trips (id) on delete cascade,
  description      text not null check (length(btrim(description)) between 1 and 200),
  category         text not null check (category in ('flights', 'accommodation', 'transportation', 'food', 'activities', 'buffer', 'other')),
  estimated_amount numeric(12, 2) not null check (estimated_amount >= 0),
  actual_amount    numeric(12, 2) check (actual_amount >= 0),
  note             text check (note is null or length(note) <= 2000),
  split_type       text not null default 'equal' check (split_type in ('equal', 'personal')),
  assigned_to      uuid references auth.users (id) on delete cascade,
  created_by       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint costs_assignment_ck check (
    (split_type = 'equal' and assigned_to is null) or
    (split_type = 'personal' and assigned_to is not null)
  )
);

create table if not exists public.savings_entries (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount     numeric(12, 2) not null check (amount > 0),
  entry_date date not null default current_date,
  note       text check (note is null or length(note) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists trip_members_trip_idx     on public.trip_members (trip_id);
create index if not exists trip_members_user_idx     on public.trip_members (user_id);
create index if not exists invitations_trip_idx      on public.invitations (trip_id);
create index if not exists plan_items_trip_idx       on public.plan_items (trip_id);
create index if not exists costs_trip_idx            on public.costs (trip_id);
create index if not exists savings_entries_trip_idx  on public.savings_entries (trip_id);

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER so RLS policies never recurse into trip_members)
-- ---------------------------------------------------------------------------

create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trip_members m
    where m.trip_id = p_trip_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_trip_owner(p_trip_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trip_members m
    where m.trip_id = p_trip_id and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

create or replace function public.is_member_of(p_trip_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trip_members m
    where m.trip_id = p_trip_id and m.user_id = p_user_id
  );
$$;

create or replace function public.shares_trip_with(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.trip_members mine
    join public.trip_members theirs on theirs.trip_id = mine.trip_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  );
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists plan_items_touch on public.plan_items;
create trigger plan_items_touch before update on public.plan_items
  for each row execute function public.touch_updated_at();

drop trigger if exists costs_touch on public.costs;
create trigger costs_touch before update on public.costs
  for each row execute function public.touch_updated_at();

-- Mirror new auth users into profiles so member lists can show a name.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(coalesce(new.email, ''), '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.trips           enable row level security;
alter table public.trip_members    enable row level security;
alter table public.invitations     enable row level security;
alter table public.plan_items      enable row level security;
alter table public.costs           enable row level security;
alter table public.savings_entries enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_trip_with(id));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (id = auth.uid());

-- Trips are created through public.create_trip(); direct inserts are blocked.
drop policy if exists trips_select on public.trips;
create policy trips_select on public.trips for select to authenticated
  using (public.is_trip_member(id));

drop policy if exists trips_update on public.trips;
create policy trips_update on public.trips for update to authenticated
  using (public.is_trip_owner(id)) with check (public.is_trip_owner(id));

drop policy if exists trips_delete on public.trips;
create policy trips_delete on public.trips for delete to authenticated
  using (public.is_trip_owner(id));

-- Membership is only ever written by create_trip()/accept_invitation().
drop policy if exists trip_members_select on public.trip_members;
create policy trip_members_select on public.trip_members for select to authenticated
  using (public.is_trip_member(trip_id));

-- Invitation rows are readable by members only; the token itself is the secret.
drop policy if exists invitations_select on public.invitations;
create policy invitations_select on public.invitations for select to authenticated
  using (public.is_trip_member(trip_id));

drop policy if exists invitations_delete on public.invitations;
create policy invitations_delete on public.invitations for delete to authenticated
  using (public.is_trip_member(trip_id));

drop policy if exists plan_items_select on public.plan_items;
create policy plan_items_select on public.plan_items for select to authenticated
  using (public.is_trip_member(trip_id));

drop policy if exists plan_items_insert on public.plan_items;
create policy plan_items_insert on public.plan_items for insert to authenticated
  with check (public.is_trip_member(trip_id) and created_by = auth.uid());

drop policy if exists plan_items_update on public.plan_items;
create policy plan_items_update on public.plan_items for update to authenticated
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

drop policy if exists plan_items_delete on public.plan_items;
create policy plan_items_delete on public.plan_items for delete to authenticated
  using (public.is_trip_member(trip_id));

drop policy if exists costs_select on public.costs;
create policy costs_select on public.costs for select to authenticated
  using (public.is_trip_member(trip_id));

drop policy if exists costs_insert on public.costs;
create policy costs_insert on public.costs for insert to authenticated
  with check (public.is_trip_member(trip_id) and created_by = auth.uid()
              and (assigned_to is null or public.is_member_of(trip_id, assigned_to)));

drop policy if exists costs_update on public.costs;
create policy costs_update on public.costs for update to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id)
              and (assigned_to is null or public.is_member_of(trip_id, assigned_to)));

drop policy if exists costs_delete on public.costs;
create policy costs_delete on public.costs for delete to authenticated
  using (public.is_trip_member(trip_id));

-- Savings: everyone in the trip can see the history, but you may only write your own.
drop policy if exists savings_select on public.savings_entries;
create policy savings_select on public.savings_entries for select to authenticated
  using (public.is_trip_member(trip_id));

drop policy if exists savings_insert on public.savings_entries;
create policy savings_insert on public.savings_entries for insert to authenticated
  with check (public.is_trip_member(trip_id) and user_id = auth.uid());

drop policy if exists savings_update on public.savings_entries;
create policy savings_update on public.savings_entries for update to authenticated
  using (public.is_trip_member(trip_id) and user_id = auth.uid())
  with check (public.is_trip_member(trip_id) and user_id = auth.uid());

drop policy if exists savings_delete on public.savings_entries;
create policy savings_delete on public.savings_entries for delete to authenticated
  using (public.is_trip_member(trip_id) and user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.create_trip(
  p_name text, p_destination text, p_departure_date date, p_currency text
) returns public.trips
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_trip public.trips;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  insert into public.trips (name, destination, departure_date, currency, created_by)
  values (btrim(p_name), btrim(p_destination), p_departure_date, upper(btrim(p_currency)), v_uid)
  returning * into v_trip;

  insert into public.trip_members (trip_id, user_id, role)
  values (v_trip.id, v_uid, 'owner');

  return v_trip;
end;
$$;

create or replace function public.create_invitation(p_trip_id uuid, p_label text default null)
returns public.invitations
language plpgsql security definer set search_path = public as $$
declare v_inv public.invitations;
begin
  if not public.is_trip_member(p_trip_id) then
    raise exception 'Not a member of this trip' using errcode = '42501';
  end if;

  insert into public.invitations (trip_id, token, label, created_by)
  values (
    p_trip_id,
    replace(replace(encode(gen_random_bytes(24), 'base64'), '+', '-'), '/', '_'),
    nullif(btrim(p_label), ''),
    auth.uid()
  )
  returning * into v_inv;

  return v_inv;
end;
$$;

-- Anonymous-friendly: lets an invited friend see what they are joining before
-- signing in. Only ever reachable by someone already holding the secret token.
create or replace function public.preview_invitation(p_token text)
returns table (
  trip_id uuid, trip_name text, destination text,
  departure_date date, currency text, status text
)
language plpgsql security definer set search_path = public as $$
declare v_inv public.invitations; v_trip public.trips;
begin
  select * into v_inv from public.invitations i where i.token = p_token;
  if not found then
    return query select null::uuid, null::text, null::text, null::date, null::text, 'invalid';
    return;
  end if;

  select * into v_trip from public.trips t where t.id = v_inv.trip_id;

  if v_inv.accepted_at is not null then
    return query select v_trip.id, v_trip.name, v_trip.destination,
                        v_trip.departure_date, v_trip.currency, 'used';
  elsif v_inv.expires_at < now() then
    return query select v_trip.id, v_trip.name, v_trip.destination,
                        v_trip.departure_date, v_trip.currency, 'expired';
  else
    return query select v_trip.id, v_trip.name, v_trip.destination,
                        v_trip.departure_date, v_trip.currency, 'valid';
  end if;
end;
$$;

-- Single-use. FOR UPDATE serialises two friends racing on the same link.
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_inv public.invitations; v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_inv from public.invitations i where i.token = p_token for update;
  if not found then
    raise exception 'This invitation link is not valid';
  end if;

  -- Re-opening your own link after joining should not look like an error.
  if exists (select 1 from public.trip_members m
             where m.trip_id = v_inv.trip_id and m.user_id = v_uid) then
    return v_inv.trip_id;
  end if;

  if v_inv.accepted_at is not null then
    raise exception 'This invitation link has already been used';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'This invitation link has expired';
  end if;

  insert into public.trip_members (trip_id, user_id, role)
  values (v_inv.trip_id, v_uid, 'member');

  update public.invitations
     set accepted_at = now(), accepted_by = v_uid
   where id = v_inv.id;

  return v_inv.trip_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  public.profiles, public.trips, public.trip_members, public.invitations,
  public.plan_items, public.costs, public.savings_entries
  to authenticated;

revoke all on function public.create_trip(text, text, date, text) from public, anon;
revoke all on function public.create_invitation(uuid, text) from public, anon;
revoke all on function public.accept_invitation(text) from public, anon;
revoke all on function public.preview_invitation(text) from public;

grant execute on function public.create_trip(text, text, date, text) to authenticated;
grant execute on function public.create_invitation(uuid, text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.preview_invitation(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['trips', 'trip_members', 'plan_items', 'costs', 'savings_entries'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end;
$$;
