-- =============================================================================
-- 4FMOTORS CRM — Métricas
-- =============================================================================
-- Produtividade nunca é medida só por "quantidade de conversas".
-- Tudo aqui é derivado de fatos gravados: mensagens, histórico de status e
-- activity_events. A permissão é verificada DENTRO da função (security definer).
-- =============================================================================

create or replace function public.metrics_user_summary(
  p_user_id uuid default null,
  p_from    timestamptz default (date_trunc('day', now())),
  p_to      timestamptz default now()
)
returns table (
  user_id             uuid,
  full_name           text,
  messages_sent       bigint,
  messages_received   bigint,
  contacts_approached bigint,
  contacts_replied    bigint,
  response_rate       numeric,
  interested_count    bigint,
  negotiating_count   bigint,
  consigned_count     bigint,
  lost_count          bigint,
  first_activity_at   timestamptz,
  last_activity_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_caller uuid := public.auth_uid_active();
  v_target uuid := coalesce(p_user_id, public.auth_uid_active());
begin
  if v_caller is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;

  if v_target <> v_caller and not public.is_admin() then
    raise exception 'Sem permissão para consultar métricas de outro usuário'
      using errcode = '42501';
  end if;

  return query
  with sent as (
    -- Mensagens efetivamente enviadas pelo CRM por ESTE usuário.
    -- Vale para número compartilhado: o que importa é quem apertou enviar.
    select m.contact_id as ct_id, m.created_at as at
    from public.messages m
    where m.direction = 'outbound'
      and m.sent_by_user_id = v_target
      and m.status <> 'failed'
      and m.created_at >= p_from
      and m.created_at < p_to
  ),
  received as (
    select m.id
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.direction = 'inbound'
      and c.assigned_user_id = v_target
      and m.created_at >= p_from
      and m.created_at < p_to
  ),
  replied as (
    -- Cliente abordado que respondeu DEPOIS da abordagem.
    select distinct s.ct_id
    from sent s
    where exists (
      select 1
      from public.messages im
      where im.contact_id = s.ct_id
        and im.direction = 'inbound'
        and im.created_at >= s.at
        and im.created_at < p_to
    )
  ),
  approached as (
    select count(distinct s.ct_id) as n from sent s
  ),
  status_moves as (
    select h.to_status as st, count(distinct h.contact_id) as n
    from public.lead_status_history h
    join public.contacts ct on ct.id = h.contact_id
    where h.created_at >= p_from
      and h.created_at < p_to
      and ct.owner_user_id = v_target
    group by h.to_status
  ),
  activity as (
    select min(a.occurred_at) as first_at, max(a.occurred_at) as last_at
    from public.activity_events a
    where a.user_id = v_target
      and a.occurred_at >= p_from
      and a.occurred_at < p_to
  )
  select
    v_target,
    (select p.full_name from public.profiles p where p.id = v_target),
    (select count(*) from sent),
    (select count(*) from received),
    (select n from approached),
    (select count(*) from replied),
    case
      when (select n from approached) = 0 then 0::numeric
      else round(100.0 * (select count(*) from replied) / (select n from approached), 1)
    end,
    coalesce((select n from status_moves where st = 'interessado'), 0),
    coalesce((select n from status_moves where st = 'negociacao'), 0),
    coalesce((select n from status_moves where st = 'consignado'), 0),
    coalesce((select n from status_moves where st = 'perdido'), 0),
    (select first_at from activity),
    (select last_at from activity);
end;
$$;

-- -----------------------------------------------------------------------------
-- Comparativo entre consignadores — apenas admin
-- -----------------------------------------------------------------------------
create or replace function public.metrics_team_summary(
  p_from timestamptz default (date_trunc('day', now())),
  p_to   timestamptz default now()
)
returns table (
  user_id             uuid,
  full_name           text,
  messages_sent       bigint,
  messages_received   bigint,
  contacts_approached bigint,
  contacts_replied    bigint,
  response_rate       numeric,
  interested_count    bigint,
  negotiating_count   bigint,
  consigned_count     bigint,
  lost_count          bigint,
  first_activity_at   timestamptz,
  last_activity_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores' using errcode = '42501';
  end if;

  return query
  select s.*
  from public.profiles p
  cross join lateral public.metrics_user_summary(p.id, p_from, p_to) s
  where p.is_active
  order by s.messages_sent desc, s.contacts_approached desc;
end;
$$;

-- -----------------------------------------------------------------------------
-- Volume por hora ou por dia
-- -----------------------------------------------------------------------------
create or replace function public.metrics_volume(
  p_user_id uuid default null,
  p_from    timestamptz default (date_trunc('day', now())),
  p_to      timestamptz default now(),
  p_bucket  text default 'hour'
)
returns table (
  bucket   timestamptz,
  sent     bigint,
  received bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_caller uuid := public.auth_uid_active();
  v_target uuid := coalesce(p_user_id, public.auth_uid_active());
  v_bucket text;
begin
  if v_caller is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;

  -- p_user_id nulo + admin = visão da operação inteira.
  if p_user_id is null and public.is_admin() then
    v_target := null;
  elsif v_target <> v_caller and not public.is_admin() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  -- Nunca interpolar entrada do usuário em date_trunc sem validar.
  v_bucket := case lower(coalesce(p_bucket, 'hour'))
    when 'day' then 'day'
    when 'hour' then 'hour'
    else null
  end;

  if v_bucket is null then
    raise exception 'Bucket inválido: use hour ou day' using errcode = '22023';
  end if;

  return query
  select
    date_trunc(v_bucket, a.occurred_at) as bucket,
    count(*) filter (where a.type = 'message_sent')     as sent,
    count(*) filter (where a.type = 'message_received') as received
  from public.activity_events a
  where a.occurred_at >= p_from
    and a.occurred_at < p_to
    and a.type in ('message_sent', 'message_received')
    and (v_target is null or a.user_id = v_target)
  group by 1
  order by 1;
end;
$$;

revoke all on function public.metrics_user_summary(uuid, timestamptz, timestamptz) from public;
revoke all on function public.metrics_team_summary(timestamptz, timestamptz) from public;
revoke all on function public.metrics_volume(uuid, timestamptz, timestamptz, text) from public;

grant execute on function public.metrics_user_summary(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.metrics_team_summary(timestamptz, timestamptz) to authenticated;
grant execute on function public.metrics_volume(uuid, timestamptz, timestamptz, text) to authenticated;
