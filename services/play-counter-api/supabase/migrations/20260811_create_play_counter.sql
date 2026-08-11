begin;

create table if not exists public.track_play_counts (
  track_id text primary key check (track_id ~ '^0[1-9]$'),
  play_count bigint not null default 0 check (play_count >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.track_play_events (
  event_id uuid primary key,
  track_id text not null references public.track_play_counts(track_id) on update cascade on delete restrict,
  counted_at timestamptz not null default now()
);

create index if not exists track_play_events_counted_at_idx
  on public.track_play_events (counted_at);

insert into public.track_play_counts (track_id)
select '0' || number::text
from generate_series(1, 9) as number
on conflict (track_id) do nothing;

alter table public.track_play_counts enable row level security;
alter table public.track_play_events enable row level security;

revoke all on table public.track_play_counts from anon, authenticated;
revoke all on table public.track_play_events from anon, authenticated;

create or replace function public.get_track_play_counts()
returns table(track_id text, play_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select counts.track_id, counts.play_count
  from public.track_play_counts as counts
  order by counts.track_id;
$$;

create or replace function public.record_track_play(
  p_track_id text,
  p_event_id uuid
)
returns table(track_id text, play_count bigint, counted boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_rows integer := 0;
begin
  if p_track_id is null or p_track_id !~ '^0[1-9]$' then
    raise exception 'invalid track id' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.track_play_counts as counts
    where counts.track_id = p_track_id
  ) then
    raise exception 'unknown track id' using errcode = '22023';
  end if;

  insert into public.track_play_events (event_id, track_id)
  values (p_event_id, p_track_id)
  on conflict (event_id) do nothing;

  get diagnostics inserted_rows = row_count;

  if inserted_rows = 1 then
    update public.track_play_counts as counts
    set play_count = counts.play_count + 1,
        updated_at = pg_catalog.now()
    where counts.track_id = p_track_id;
  end if;

  return query
  select counts.track_id, counts.play_count, inserted_rows = 1
  from public.track_play_counts as counts
  where counts.track_id = p_track_id;
end;
$$;

revoke all on function public.get_track_play_counts() from public;
revoke all on function public.record_track_play(text, uuid) from public;
revoke execute on function public.get_track_play_counts() from anon, authenticated;
revoke execute on function public.record_track_play(text, uuid) from anon, authenticated;
grant execute on function public.get_track_play_counts() to service_role;
grant execute on function public.record_track_play(text, uuid) to service_role;

commit;
