#!/usr/bin/env bash
# =============================================================================
# Verifica o banco num Postgres descartável
# =============================================================================
# Aplica as migrations, roda o seed e confere que a RLS realmente isola os
# consignadores — sem depender de um projeto Supabase.
#
# Os testes de `npm test` cobrem a lógica em TypeScript. Isto cobre o que vive
# no banco: policies, triggers, guards e as funções de métrica, que só falham
# quando executadas de verdade.
#
# Uso:  ./scripts/verify-db.sh
# Requer: PostgreSQL instalado (binários em /usr/lib/postgresql/<versão>/bin).
# =============================================================================
set -euo pipefail

PORT="${PGTEST_PORT:-5433}"
PGDATA="${PGTEST_DATA:-/tmp/4fmotors-verify-db}"
DB=crm_verify

PGBIN="$(dirname "$(command -v pg_ctl || true)")"
if [ -z "$PGBIN" ] || [ ! -x "$PGBIN/pg_ctl" ]; then
  PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
fi

if [ -z "$PGBIN" ] || [ ! -x "$PGBIN/initdb" ]; then
  echo "PostgreSQL não encontrado. Instale-o para rodar esta verificação." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PSQL="psql -h /tmp -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"

cleanup() {
  "$PGBIN/pg_ctl" -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$PGDATA"
}
trap cleanup EXIT

echo "→ subindo Postgres descartável na porta $PORT"
rm -rf "$PGDATA"
"$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$PGDATA" -o "-p $PORT -k /tmp" -l "$PGDATA/server.log" start >/dev/null
sleep 1

$PSQL -c "create database $DB;"
PSQL="$PSQL -d $DB"

echo "→ stub do Supabase"
$PSQL -f "$ROOT/supabase/local/supabase-stub.sql" >/dev/null 2>&1

echo "→ migrations"
for file in "$ROOT"/supabase/migrations/*.sql; do
  printf '   %-48s' "$(basename "$file")"
  $PSQL -f "$file" >/dev/null
  echo "ok"
done

echo "→ administrador inicial"
$PSQL >/dev/null <<'SQL'
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
  'authenticated', 'admin@4fmotors.com.br', crypt('senha', gen_salt('bf')), now(),
  '{"provider":"email"}'::jsonb, '{"full_name":"Administrador"}'::jsonb);
update public.profiles set role = 'admin' where email = 'admin@4fmotors.com.br';
grant usage on schema auth to authenticated;
SQL

echo "→ seed de demonstração"
$PSQL -f "$ROOT/supabase/seed/demo.sql" >/dev/null 2>&1

echo "→ verificações"
$PSQL <<'SQL'
\set QUIET on
select id as breno from public.profiles where email = 'breno@demo.4fmotors.local' \gset
select id as admin from public.profiles where email = 'admin@4fmotors.com.br' \gset
\set QUIET off

do $$
declare
  v_breno uuid;
  v_admin uuid;
  v_todos int;
  v_dele  int;
  v_falhas int := 0;
begin
  select id into v_breno from public.profiles where email = 'breno@demo.4fmotors.local';
  select id into v_admin from public.profiles where email = 'admin@4fmotors.com.br';

  select count(*) into v_todos from public.contacts;
  if v_todos = 0 then
    raise exception 'seed não populou nada';
  end if;

  -- Três respostas rápidas, criadas antes de assumir o papel: uma da loja,
  -- uma do Breno e uma de outro usuário.
  insert into public.quick_replies (owner_user_id, title, body)
  values (null, 'Da loja', 'x'), (v_breno, 'Minha', 'y'), (v_admin, 'De outro', 'z');

  -- O consignador enxerga apenas os clientes dele.
  perform set_config('request.jwt.claim.sub', v_breno::text, false);
  set local role authenticated;

  select count(*) into v_dele from public.contacts;
  if v_dele = 0 or v_dele >= v_todos then
    raise notice 'FALHA: RLS não recortou os clientes (viu % de %)', v_dele, v_todos;
    v_falhas := v_falhas + 1;
  else
    raise notice 'ok  RLS: consignador vê % de % clientes', v_dele, v_todos;
  end if;

  select count(*) into v_dele from public.contacts where owner_user_id <> v_breno;
  if v_dele > 0 then
    raise notice 'FALHA: vazou % cliente(s) de outro consignador', v_dele;
    v_falhas := v_falhas + 1;
  else
    raise notice 'ok  RLS: nenhum cliente de outro consignador visível';
  end if;

  -- Tokens da Meta são inacessíveis mesmo autenticado.
  begin
    perform count(*) from public.whatsapp_account_secrets;
    raise notice 'FALHA: tokens da Meta ficaram legíveis';
    v_falhas := v_falhas + 1;
  exception when others then
    raise notice 'ok  segredos: tokens da Meta inacessíveis';
  end;

  -- Escalonamento de papel e transferência são exclusivos do admin.
  begin
    update public.profiles set role = 'admin' where id = v_breno;
    raise notice 'FALHA: consignador escalou o próprio papel';
    v_falhas := v_falhas + 1;
  exception when others then
    raise notice 'ok  guard: escalonamento de papel bloqueado';
  end;

  begin
    update public.contacts set owner_user_id = v_admin
    where owner_user_id = v_breno;
    raise notice 'FALHA: consignador transferiu cliente';
    v_falhas := v_falhas + 1;
  exception when others then
    raise notice 'ok  guard: transferência de cliente bloqueada';
  end;

  begin
    perform * from public.metrics_team_summary(now() - interval '30 days', now());
    raise notice 'FALHA: consignador viu métricas da equipe';
    v_falhas := v_falhas + 1;
  exception when others then
    raise notice 'ok  métricas: comparativo restrito ao admin';
  end;

  -- Respostas rápidas: a da loja é comum, a pessoal é só de quem criou.
  select count(*) into v_dele from public.quick_replies;
  if v_dele <> 2 then
    raise notice 'FALHA: consignador viu % respostas rápidas (esperado 2)', v_dele;
    v_falhas := v_falhas + 1;
  else
    raise notice 'ok  respostas rápidas: vê a da loja e a própria, não a alheia';
  end if;

  reset role;

  -- O opt-in é gravado na primeira resposta do cliente.
  if not exists (
    select 1 from public.contacts ct
    join public.messages m on m.contact_id = ct.id and m.direction = 'inbound'
    where ct.opt_in_at is not null
    group by ct.id, ct.opt_in_at
    having ct.opt_in_at = min(m.wa_timestamp)
  ) then
    raise notice 'FALHA: opt-in não corresponde à primeira resposta recebida';
    v_falhas := v_falhas + 1;
  else
    raise notice 'ok  opt-in: gravado na primeira resposta do cliente';
  end if;

  -- O admin enxerga a operação inteira.
  perform set_config('request.jwt.claim.sub', v_admin::text, false);
  set local role authenticated;

  select count(*) into v_dele from public.contacts;
  if v_dele <> v_todos then
    raise notice 'FALHA: admin viu % de % clientes', v_dele, v_todos;
    v_falhas := v_falhas + 1;
  else
    raise notice 'ok  RLS: admin vê os % clientes', v_todos;
  end if;

  if not exists (
    select 1 from public.metrics_team_summary(now() - interval '30 days', now())
    where messages_sent > 0
  ) then
    raise notice 'FALHA: métricas da equipe vieram zeradas';
    v_falhas := v_falhas + 1;
  else
    raise notice 'ok  métricas: comparativo da equipe com dados';
  end if;

  reset role;

  if v_falhas > 0 then
    raise exception '% verificação(ões) falharam', v_falhas;
  end if;
end;
$$;
SQL

echo "→ limpeza do seed"
$PSQL -f "$ROOT/supabase/seed/demo_cleanup.sql" >/dev/null 2>&1
$PSQL -tc "select case when count(*) = 0 then '   ok  seed removido por completo'
  else '   FALHA: sobraram ' || count(*) || ' clientes' end from public.contacts;"

# A trava do seed só vale se ela realmente recusar. Cria um cliente com telefone
# fora da faixa de demonstração e confere que o seed se nega a rodar.
# Instalação nova: banco vazio, tutorial pendente e nada de dado de demonstração.
echo "→ loja recém instalada"
$PSQL -tc "select case
  when (select count(*) from public.contacts) = 0
   and (select count(*) from public.conversations) = 0
   and (select count(*) from public.messages) = 0
   and (select count(*) from public.whatsapp_accounts) = 0
  then '   ok  banco limpo: nenhum dado de demonstração sobrou'
  else '   FALHA: sobrou dado no banco' end;"

$PSQL -tc "select case when count(*) = (select count(*) from public.profiles)
  then '   ok  tutorial pendente para todo usuário novo'
  else '   FALHA: algum perfil nasceu com o tutorial concluído' end
  from public.profiles where onboarding_completed_at is null;"

echo "→ trava do seed em banco com dado real"
$PSQL -c "insert into public.contacts (full_name, phone_e164, owner_user_id)
  select 'Cliente Real', '+5511988887777', id from public.profiles where role = 'admin' limit 1;" >/dev/null

if $PSQL -f "$ROOT/supabase/seed/demo.sql" >/dev/null 2>&1; then
  echo "   FALHA: o seed rodou em um banco com cliente real"
  exit 1
fi
echo "   ok  seed recusado em banco com cliente real"

echo
echo "Banco verificado."
