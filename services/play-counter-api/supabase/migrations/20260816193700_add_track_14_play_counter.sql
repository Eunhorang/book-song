begin;

alter table public.track_play_counts
  drop constraint if exists track_play_counts_track_id_check;

alter table public.track_play_counts
  add constraint track_play_counts_track_id_check
  check (track_id ~ '^(0[1-9]|1[0-4])$');

alter table public.track_play_events
  drop constraint if exists track_play_events_track_id_check;

alter table public.track_play_events
  add constraint track_play_events_track_id_check
  check (track_id ~ '^(0[1-9]|1[0-4])$');

insert into public.track_play_counts (track_id, play_count)
values ('14', 0)
on conflict (track_id) do nothing;

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
  if p_track_id is null or p_track_id !~ '^(0[1-9]|1[0-4])$' then
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

revoke all on function public.record_track_play(text, uuid) from public;
revoke execute on function public.record_track_play(text, uuid) from anon, authenticated;
grant execute on function public.record_track_play(text, uuid) to service_role;

commit;
