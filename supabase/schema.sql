-- Перед парой · schema v1
-- Run once in Supabase SQL Editor. Safe to re-run; existing queues are preserved.
begin;

create table if not exists public.members (
  id uuid primary key,
  name text not null check (char_length(name) between 2 and 80),
  created_at timestamptz not null default now()
);

create table if not exists public.queues (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 100),
  starts_at timestamptz not null,
  note text not null default '' check (char_length(note) <= 300),
  status text not null default 'open' check (status in ('open','closed','finished')),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index if not exists one_active_queue on public.queues ((true)) where status <> 'finished';
create index if not exists queues_history on public.queues (created_at desc);

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null references public.queues(id) on delete cascade,
  member_id uuid references public.members(id),
  name text not null check (char_length(name) between 2 and 80),
  position integer not null check (position >= 1),
  status text not null default 'waiting' check (status in ('waiting','done','left','removed')),
  joined_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (queue_id, member_id)
);
create unique index if not exists entry_unique_active_name on public.entries
  (queue_id, lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) where status in ('waiting','done');
create index if not exists entries_queue on public.entries (queue_id, status, position);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  queue_id uuid not null references public.queues(id) on delete cascade,
  action text not null,
  description text not null,
  actor_role text not null check (actor_role in ('admin','member')),
  created_at timestamptz not null default now()
);
create index if not exists audit_queue on public.audit_log (queue_id, id desc);

create table if not exists public.rate_limits (
  key text primary key,
  attempts integer not null,
  expires_at timestamptz not null
);

-- No browser role may read or mutate tables, even with a guessed API URL.
alter table public.members enable row level security;
alter table public.queues enable row level security;
alter table public.entries enable row level security;
alter table public.audit_log enable row level security;
alter table public.rate_limits enable row level security;
revoke all on public.members, public.queues, public.entries, public.audit_log, public.rate_limits from anon, authenticated;
grant all on public.members, public.queues, public.entries, public.audit_log, public.rate_limits to service_role;
grant usage, select on sequence public.audit_log_id_seq to service_role;

create or replace function public.take_rate_limit(p_key text, p_limit integer, p_seconds integer)
returns boolean language plpgsql set search_path = '' as $$
declare v_attempts integer;
begin
  delete from public.rate_limits where expires_at < now() - interval '1 day';
  insert into public.rate_limits (key, attempts, expires_at)
  values (p_key, 1, now() + make_interval(secs => p_seconds))
  on conflict (key) do update set
    attempts = case when public.rate_limits.expires_at <= now() then 1 else public.rate_limits.attempts + 1 end,
    expires_at = case when public.rate_limits.expires_at <= now() then now() + make_interval(secs => p_seconds) else public.rate_limits.expires_at end
  returning attempts into v_attempts;
  return v_attempts <= p_limit;
end;
$$;

create or replace function public.queue_command(p_action text, p_actor uuid, p_admin boolean, p_payload jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_queue public.queues%rowtype;
  v_entry public.entries%rowtype;
  v_other public.entries%rowtype;
  v_name text;
  v_count integer;
  v_position integer;
  v_description text;
  v_is_admin boolean := coalesce(p_admin, false);
begin
  -- Every write uses the same transaction lock, including initial queue creation.
  -- This also protects the empty-queue case (where no row exists to lock).
  perform pg_advisory_xact_lock(214701);

  if p_action = 'register' then
    v_name := btrim(regexp_replace(p_payload->>'name', '\s+', ' ', 'g'));
    if p_actor is null or v_name is null or char_length(v_name) not between 2 and 80 then raise exception 'INVALID_INPUT'; end if;
    if exists (select 1 from public.entries e join public.queues q on q.id=e.queue_id
      where e.member_id=p_actor and q.status <> 'finished' and e.status in ('waiting','done') and e.name <> v_name)
      then raise exception 'NAME_LOCKED'; end if;
    insert into public.members(id,name) values(p_actor,v_name) on conflict(id) do update set name=excluded.name;
    return jsonb_build_object('ok',true);
  end if;

  if p_action not in ('join','leave') and not v_is_admin then raise exception 'FORBIDDEN'; end if;

  if p_action = 'create' then
    if exists(select 1 from public.queues where status <> 'finished') then raise exception 'ACTIVE_EXISTS'; end if;
    insert into public.queues(title, starts_at, note)
    values(btrim(p_payload->>'title'), (p_payload->>'startsAt')::timestamptz, coalesce(p_payload->>'note','')) returning * into v_queue;
    insert into public.audit_log(queue_id,action,description,actor_role)
    values(v_queue.id,'create','Открыта очередь «' || v_queue.title || '»','admin');
    return jsonb_build_object('ok',true,'queueId',v_queue.id);
  end if;

  select * into v_queue from public.queues where id=(p_payload->>'queueId')::uuid and status <> 'finished';
  if not found then raise exception 'QUEUE_NOT_ACTIVE'; end if;
  if v_is_admin and p_action not in ('join','leave') and
    (p_payload->>'revision' is null or (p_payload->>'revision')::integer <> v_queue.revision)
    then raise exception 'STALE_QUEUE'; end if;

  if p_action = 'join' then
    if v_queue.status <> 'open' then raise exception 'REGISTRATION_CLOSED'; end if;
    select name into v_name from public.members where id=p_actor;
    if not found then raise exception 'LOGIN_REQUIRED'; end if;
    select * into v_entry from public.entries where queue_id=v_queue.id and member_id=p_actor;
    if found and v_entry.status='waiting' then return jsonb_build_object('ok',true); end if;
    if found and v_entry.status='done' then raise exception 'ALREADY_DONE'; end if;
    select count(*) into v_count from public.entries where queue_id=v_queue.id and status='waiting';
    if v_count >= 200 then raise exception 'QUEUE_FULL'; end if;
    insert into public.entries(queue_id,member_id,name,position)
      values(v_queue.id,p_actor,v_name,v_count+1)
      on conflict(queue_id,member_id) do update set name=excluded.name, position=excluded.position,
        status='waiting',joined_at=now(),completed_at=null;
    v_description := v_name || ' — в очереди';
  elsif p_action = 'leave' then
    update public.entries set status='left' where queue_id=v_queue.id and member_id=p_actor and status='waiting'
      returning * into v_entry;
    if not found then return jsonb_build_object('ok',true); end if;
    v_description := v_entry.name || ' — вышел(а) из очереди';
  elsif p_action = 'add' then
    select count(*) into v_count from public.entries where queue_id=v_queue.id and status='waiting';
    if v_count >= 200 then raise exception 'QUEUE_FULL'; end if;
    v_name := btrim(regexp_replace(p_payload->>'name', '\s+', ' ', 'g'));
    insert into public.entries(queue_id,name,position) values(v_queue.id,v_name,v_count+1);
    v_description := 'Администратор добавил: ' || v_name;
  elsif p_action in ('move','swap','remove','complete') then
    select * into v_entry from public.entries where id=(p_payload->>'entryId')::uuid and queue_id=v_queue.id and status='waiting';
    if not found then raise exception 'ENTRY_NOT_FOUND'; end if;
    if p_action='move' then
      select count(*) into v_count from public.entries where queue_id=v_queue.id and status='waiting';
      v_position := (p_payload->>'position')::integer;
      if v_position is null or v_position < 1 or v_position > v_count then raise exception 'INVALID_POSITION'; end if;
      if v_position=v_entry.position then return jsonb_build_object('ok',true); end if;
      update public.entries set position = case
        when id=v_entry.id then v_position
        when v_position < v_entry.position and position >= v_position and position < v_entry.position then position+1
        when v_position > v_entry.position and position > v_entry.position and position <= v_position then position-1
        else position end
      where queue_id=v_queue.id and status='waiting';
      v_description := v_entry.name || ': место ' || v_entry.position || ' → ' || v_position;
    elsif p_action='swap' then
      select * into v_other from public.entries where id=(p_payload->>'otherId')::uuid and queue_id=v_queue.id and status='waiting';
      if not found or v_other.id=v_entry.id then raise exception 'ENTRY_NOT_FOUND'; end if;
      update public.entries set position=case when id=v_entry.id then v_other.position else v_entry.position end
        where id in (v_entry.id,v_other.id);
      v_description := 'Обмен местами: ' || v_entry.name || ' и ' || v_other.name;
    elsif p_action='remove' then
      update public.entries set status='removed' where id=v_entry.id;
      v_description := 'Администратор убрал: ' || v_entry.name;
    else
      if v_entry.position <> 1 then raise exception 'NOT_FIRST'; end if;
      update public.entries set status='done',completed_at=now() where id=v_entry.id;
      v_description := v_entry.name || ' — прошёл(ла)';
    end if;
  elsif p_action='toggle' then
    update public.queues set status=case when status='open' then 'closed' else 'open' end where id=v_queue.id;
    v_description := case when v_queue.status='open' then 'Запись закрыта' else 'Запись открыта' end;
  elsif p_action='finish' then
    update public.queues set status='finished',finished_at=now() where id=v_queue.id;
    v_description := 'Пара завершена. Очередь сохранена в истории';
  elsif p_action='edit' then
    update public.queues set title=btrim(p_payload->>'title'),starts_at=(p_payload->>'startsAt')::timestamptz,
      note=coalesce(p_payload->>'note','') where id=v_queue.id;
    v_description := 'Изменены сведения о паре';
  else
    raise exception 'INVALID_ACTION';
  end if;

  -- Compact the positions after removals; row IDs remain stable for UI updates.
  with ranked as (
    select id, row_number() over(order by position,joined_at,id)::integer as n from public.entries
    where queue_id=v_queue.id and status='waiting'
  ) update public.entries e set position=r.n from ranked r where e.id=r.id;
  update public.queues set revision=revision+1 where id=v_queue.id;
  insert into public.audit_log(queue_id,action,description,actor_role)
    values(v_queue.id,p_action,v_description,case when p_action in ('join','leave') then 'member' else 'admin' end);
  return jsonb_build_object('ok',true);
exception when unique_violation then
  raise exception 'DUPLICATE_NAME';
end;
$$;

-- One SQL statement gives a consistent snapshot. Only explicitly public fields
-- leave the database; member IDs and security data are never included.
create or replace function public.queue_state(p_actor uuid, p_admin boolean, p_queue_id uuid default null, p_offset integer default 0)
returns jsonb language sql stable set search_path = '' as $$
  with selected as (
    select * from public.queues where
      (p_queue_id is not null and id=p_queue_id) or (p_queue_id is null and status <> 'finished')
    limit 1
  )
  select jsonb_build_object(
    'member', (select jsonb_build_object('name',name) from public.members where id=p_actor),
    'queue', (select to_jsonb(q) from selected q),
    'entries', coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'name',e.name,'position',e.position,'status',e.status,
      'isMe',coalesce(e.member_id=p_actor,false),'joinedAt',e.joined_at,'completedAt',e.completed_at
    ) order by case e.status when 'waiting' then 0 else 1 end,e.position,e.completed_at)
      from public.entries e join selected q on q.id=e.queue_id where e.status in ('waiting','done')), '[]'::jsonb),
    'audit', case when coalesce(p_admin,false) then coalesce((select jsonb_agg(to_jsonb(a) order by a.id desc) from
      (select id,action,description,actor_role,created_at from public.audit_log
       where queue_id=(select id from selected) order by id desc limit 100) a),'[]'::jsonb) else '[]'::jsonb end,
    'history', coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc) from
      (select q.id,q.title,q.starts_at,q.created_at,q.finished_at,
        (select count(*) from public.entries e where e.queue_id=q.id and e.status='done') as completed,
        (select count(*) from public.entries e where e.queue_id=q.id and e.status in ('waiting','done')) as total
       from public.queues q where q.status='finished' order by q.created_at desc limit 20 offset greatest(0,p_offset)) h),'[]'::jsonb),
    'historyMore', (select count(*) > greatest(0,p_offset)+20 from public.queues where status='finished')
  );
$$;

-- PostgreSQL grants function execution to PUBLIC by default. Revoke it explicitly.
revoke all on function public.take_rate_limit(text,integer,integer) from public, anon, authenticated;
revoke all on function public.queue_command(text,uuid,boolean,jsonb) from public, anon, authenticated;
revoke all on function public.queue_state(uuid,boolean,uuid,integer) from public, anon, authenticated;
grant execute on function public.take_rate_limit(text,integer,integer) to service_role;
grant execute on function public.queue_command(text,uuid,boolean,jsonb) to service_role;
grant execute on function public.queue_state(uuid,boolean,uuid,integer) to service_role;

commit;
