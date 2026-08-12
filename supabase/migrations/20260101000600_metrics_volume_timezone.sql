-- =============================================================================
-- Correção: volume por horário precisa do fuso da operação
-- =============================================================================
-- `date_trunc('hour', occurred_at)` agrupava em UTC. Como o Supabase roda a
-- sessão em UTC e a 4FMOTORS opera em Brasília, o pico das 16h aparecia às 19h
-- no gráfico — e o volume "por dia" quebrava às 21h, não à meia-noite.
--
-- Agora o truncamento acontece no fuso informado e o resultado volta a ser um
-- timestamptz correspondente ao início real daquele bucket.
-- =============================================================================

drop function if exists public.metrics_volume(uuid, timestamptz, timestamptz, text);

create or replace function public.metrics_volume(
  p_user_id  uuid default null,
  p_from     timestamptz default (date_trunc('day', now())),
  p_to       timestamptz default now(),
  p_bucket   text default 'hour',
  p_timezone text default 'America/Sao_Paulo'
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
  v_caller   uuid := public.auth_uid_active();
  v_target   uuid := coalesce(p_user_id, public.auth_uid_active());
  v_bucket   text;
  v_timezone text;
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

  -- Fuso desconhecido faria a query explodir; cai no padrão da operação.
  v_timezone := coalesce(p_timezone, 'America/Sao_Paulo');
  if not exists (select 1 from pg_timezone_names z where z.name = v_timezone) then
    v_timezone := 'America/Sao_Paulo';
  end if;

  return query
  select
    -- Trunca no fuso local e devolve o instante correspondente em UTC.
    (date_trunc(v_bucket, a.occurred_at at time zone v_timezone) at time zone v_timezone) as bucket,
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

revoke all on function public.metrics_volume(uuid, timestamptz, timestamptz, text, text) from public;
grant execute on function public.metrics_volume(uuid, timestamptz, timestamptz, text, text) to authenticated;
