-- Math Quest multiplayer rooms.
-- Room state and secrets (answers, player token hashes, treasure spots) live in
-- separate tables. Neither table is readable by the public anon key: clients
-- only talk to the "room" Edge Function, which uses the service role and
-- broadcasts public state over Realtime.

create table if not exists public.rooms (
  code text primary key check (code ~ '^[0-9]{4}$'),
  state jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.room_secrets (
  code text primary key references public.rooms(code) on delete cascade,
  secrets jsonb not null
);

alter table public.rooms enable row level security;
alter table public.room_secrets enable row level security;
-- No policies on purpose: anon/authenticated users cannot read or write either table.

create or replace function public.room_insert(p_code text, p_state jsonb, p_secrets jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from rooms where updated_at < now() - interval '6 hours';
  insert into rooms(code, state) values (p_code, p_state);
  insert into room_secrets(code, secrets) values (p_code, p_secrets);
  return true;
exception when unique_violation then
  return false;
end $$;

-- Optimistic concurrency: only saves when nobody else wrote since we read.
create or replace function public.room_save(p_code text, p_state jsonb, p_secrets jsonb, p_version integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update rooms set state = p_state, version = version + 1, updated_at = now()
    where code = p_code and version = p_version;
  get diagnostics n = row_count;
  if n = 0 then return false; end if;
  update room_secrets set secrets = p_secrets where code = p_code;
  return true;
end $$;

revoke all on function public.room_insert(text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.room_save(text, jsonb, jsonb, integer) from public, anon, authenticated;
grant execute on function public.room_insert(text, jsonb, jsonb) to service_role;
grant execute on function public.room_save(text, jsonb, jsonb, integer) to service_role;
