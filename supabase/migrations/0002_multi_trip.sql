-- 0002 — many trips per person.
--
-- Purely additive. No table is dropped, no row is rewritten, and every trip
-- that already exists keeps its members, plan, costs and savings exactly as
-- they are: they simply become one journey in a collection instead of the
-- only one. Safe to run on a live database.
--
-- Paste this whole file into the Supabase SQL editor and run it once.

-- ---------------------------------------------------------------------------
-- Archiving
-- ---------------------------------------------------------------------------

-- Null for every existing trip, so nothing is archived by this migration.
alter table public.trips add column if not exists archived_at timestamptz;

comment on column public.trips.archived_at is
  'When the owner filed this trip away. Null means it is still on the desk.';

-- ---------------------------------------------------------------------------
-- A trip's identity cannot be edited
-- ---------------------------------------------------------------------------

-- The owner may rewrite the cover page (name, destination, date, currency) and
-- file the trip away. Nothing may move a trip to a different creator or forge
-- its age, which would rewrite every member's savings pace at once.
create or replace function public.guard_trip_identity()
returns trigger language plpgsql as $$
begin
  if new.id <> old.id
     or new.created_by <> old.created_by
     or new.created_at <> old.created_at then
    raise exception 'A trip''s id, creator and creation date cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists trips_guard_identity on public.trips;
create trigger trips_guard_identity before update on public.trips
  for each row execute function public.guard_trip_identity();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

-- Unchanged in effect, restated so this file is a complete description of who
-- may touch a trip: only members ever see one, archived or not.
drop policy if exists trips_select on public.trips;
create policy trips_select on public.trips for select to authenticated
  using (public.is_trip_member(id));

drop policy if exists trips_update on public.trips;
create policy trips_update on public.trips for update to authenticated
  using (public.is_trip_owner(id)) with check (public.is_trip_owner(id));

-- Deleting is permanent and cascades to everything in the trip, so it is
-- reachable only once the trip has been archived. That makes the destructive
-- step deliberate at the database, not only behind a dialog in the browser.
drop policy if exists trips_delete on public.trips;
create policy trips_delete on public.trips for delete to authenticated
  using (public.is_trip_owner(id) and archived_at is not null);

-- Inviting people is managing the trip, so it belongs to the owner. Members
-- can still read the invitation list to see who is expected.
drop policy if exists invitations_delete on public.invitations;
create policy invitations_delete on public.invitations for delete to authenticated
  using (public.is_trip_owner(trip_id));

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Owner-only, and never for a trip that has been filed away.
create or replace function public.create_invitation(p_trip_id uuid, p_label text default null)
returns public.invitations
language plpgsql security definer set search_path = public as $$
declare
  v_inv  public.invitations;
  v_trip public.trips;
begin
  if not public.is_trip_owner(p_trip_id) then
    raise exception 'Only the trip owner can invite people' using errcode = '42501';
  end if;

  select * into v_trip from public.trips t where t.id = p_trip_id;
  if v_trip.archived_at is not null then
    raise exception 'This trip is archived. Restore it before inviting anyone else.';
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

-- Adds 'archived' to the statuses a held token can preview as, so an invited
-- friend is told why rather than being refused at the last step.
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

  if v_trip.archived_at is not null then
    return query select v_trip.id, v_trip.name, v_trip.destination,
                        v_trip.departure_date, v_trip.currency, 'archived';
  elsif v_inv.accepted_at is not null then
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

-- Same single-use guarantee as before, with an archived trip closed to new
-- arrivals. A member who is already in the trip still gets a quiet success.
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_inv  public.invitations;
  v_trip public.trips;
  v_uid  uuid := auth.uid();
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

  select * into v_trip from public.trips t where t.id = v_inv.trip_id;
  if v_trip.archived_at is not null then
    raise exception 'This trip has been archived and is not taking new travellers';
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

-- Leaving is the only way membership is ever removed, and it only ever removes
-- your own. There is still no delete policy on trip_members, so this function
-- is the single door. The owner cannot walk out of their own trip — there is no
-- ownership transfer in this version, so it would strand everyone else.
create or replace function public.leave_trip(p_trip_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select m.role into v_role from public.trip_members m
   where m.trip_id = p_trip_id and m.user_id = v_uid;

  if v_role is null then
    raise exception 'You are not a member of this trip' using errcode = '42501';
  end if;
  if v_role = 'owner' then
    raise exception 'The trip owner cannot leave. Archive or delete the trip instead.'
      using errcode = '42501';
  end if;

  -- Their own savings record goes with them: it is their money, and leaving it
  -- behind would keep counting it towards a fund they are no longer part of.
  -- Everything the group wrote together stays.
  delete from public.savings_entries s
   where s.trip_id = p_trip_id and s.user_id = v_uid;

  delete from public.trip_members m
   where m.trip_id = p_trip_id and m.user_id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.leave_trip(uuid) from public, anon;
grant execute on function public.leave_trip(uuid) to authenticated;
