-- =============================================================================
-- Remove os dados de demonstração
-- =============================================================================
-- Reconhece o que apagar por dois marcadores: os telefones da faixa reservada
-- +55 11 9000-00xx e os e-mails @demo.4fmotors.local. Nada fora disso é
-- tocado, então rodar com dados reais no banco é seguro.
-- =============================================================================

do $$
declare
  v_contacts int;
  v_users    int;
begin
  -- Conversas, mensagens, veículos, notas e histórico saem por cascade.
  with removed as (
    delete from public.contacts
    where phone_e164 like '+55119000000%'
    returning 1
  )
  select count(*) into v_contacts from removed;

  delete from public.whatsapp_accounts
  where phone_number_id in ('DEMO_PNID_PRINCIPAL', 'DEMO_PNID_LUISA');

  -- Apagar de auth.users leva junto o profile (on delete cascade).
  with removed as (
    delete from auth.users
    where email like '%@demo.4fmotors.local'
    returning 1
  )
  select count(*) into v_users from removed;

  -- Eventos de atividade dos usuários removidos ficam com user_id nulo
  -- (on delete set null); sem dono, não servem para nada.
  delete from public.activity_events where user_id is null and contact_id is null;

  raise notice 'Removidos: % clientes de demonstração e % usuários.', v_contacts, v_users;
end;
$$;
