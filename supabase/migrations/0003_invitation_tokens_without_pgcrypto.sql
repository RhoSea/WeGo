-- 0003 — mint invitation tokens without pgcrypto.
--
-- Fixes: "function gen_random_bytes(integer) does not exist" when creating an
-- invitation link.
--
-- create_invitation() has minted its token with pgcrypto's gen_random_bytes()
-- since 0001, but it is a SECURITY DEFINER function with search_path pinned to
-- `public`, and Supabase installs pgcrypto into the `extensions` schema. The
-- extension was there all along; the function simply could not see it, and
-- `create extension if not exists pgcrypto` in 0001 was a no-op because it
-- already existed elsewhere. Nothing else in the schema was affected —
-- gen_random_uuid() is a pg_catalog built-in in PostgreSQL 13+, which is why
-- creating trips has always worked.
--
-- Widening the search_path would have fixed it, but only for as long as the
-- extension stays where it is. This drops the dependency instead: the token is
-- now built from pg_catalog functions alone, so it cannot be broken by where a
-- project happens to keep its extensions.
--
-- Run 0002 first. Existing invitation links keep working — tokens are opaque
-- text, looked up by exact match, and no row is rewritten.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'trips' and column_name = 'archived_at'
  ) then
    raise exception 'Run 0002_multi_trip.sql first — this migration builds on it.';
  end if;
end;
$$;

-- Identical to 0002 apart from how the token is generated.
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
    -- Two v4 UUIDs are 32 bytes drawn from the same cryptographic source
    -- gen_random_bytes() would have used (pg_strong_random), minus the six
    -- bits each spends on its version and variant. Stripped of hyphens they
    -- are plain hex, so decode/encode turn them into 43 URL-safe characters:
    -- translate maps + and / to - and _, and drops the = padding, which has no
    -- counterpart in the replacement string.
    translate(
      encode(
        decode(translate(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex'),
        'base64'
      ),
      '+/=', '-_'
    ),
    nullif(btrim(p_label), ''),
    auth.uid()
  )
  returning * into v_inv;

  return v_inv;
end;
$$;
