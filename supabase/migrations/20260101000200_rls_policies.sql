-- =============================================================================
-- 4FMOTORS CRM — Row Level Security
-- =============================================================================
-- Regra de ouro: o frontend NÃO é uma camada de segurança.
-- Um consignador nunca enxerga clientes ou conversas de outro consignador,
-- mesmo que chame a API do Supabase diretamente com o token dele.
--
-- Escritas sensíveis (mensagens, eventos de webhook, auditoria) só acontecem
-- via service_role no backend — o service_role ignora RLS por definição, então
-- a ausência de policy de INSERT já fecha a porta para o cliente.
-- =============================================================================

alter table public.profiles                  enable row level security;
alter table public.whatsapp_accounts         enable row level security;
alter table public.whatsapp_account_secrets  enable row level security;
alter table public.user_whatsapp_permissions enable row level security;
alter table public.contacts                  enable row level security;
alter table public.vehicles                  enable row level security;
alter table public.conversations             enable row level security;
alter table public.conversation_assignments  enable row level security;
alter table public.messages                  enable row level security;
alter table public.message_events            enable row level security;
alter table public.notes                     enable row level security;
alter table public.lead_status_history       enable row level security;
alter table public.activity_events           enable row level security;
alter table public.webhook_events            enable row level security;
alter table public.audit_logs                enable row level security;

-- Força RLS também para o dono das tabelas (defesa em profundidade).
alter table public.whatsapp_account_secrets force row level security;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
-- Consignadores precisam ler nomes dos colegas (ex.: "transferido para Júlio"),
-- mas apenas dados não sensíveis já presentes na tabela.
create policy profiles_select on public.profiles
  for select to authenticated
  using (public.auth_uid_active() is not null);

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = public.auth_uid_active())
  with check (id = public.auth_uid_active());

create policy profiles_admin_all on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- whatsapp_accounts — consignador só enxerga os números que pode usar
-- -----------------------------------------------------------------------------
create policy whatsapp_accounts_select on public.whatsapp_accounts
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.user_whatsapp_permissions p
      where p.whatsapp_account_id = whatsapp_accounts.id
        and p.user_id = public.auth_uid_active()
    )
  );

create policy whatsapp_accounts_admin_write on public.whatsapp_accounts
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- whatsapp_account_secrets — NENHUMA policy. Só service_role.
-- -----------------------------------------------------------------------------
revoke all on public.whatsapp_account_secrets from anon, authenticated;

-- -----------------------------------------------------------------------------
-- user_whatsapp_permissions
-- -----------------------------------------------------------------------------
create policy user_wa_perm_select on public.user_whatsapp_permissions
  for select to authenticated
  using (public.is_admin() or user_id = public.auth_uid_active());

create policy user_wa_perm_admin_write on public.user_whatsapp_permissions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- contacts
-- -----------------------------------------------------------------------------
create policy contacts_select on public.contacts
  for select to authenticated
  using (public.is_admin() or owner_user_id = public.auth_uid_active());

-- Consignador cadastra prospect apenas para si mesmo.
create policy contacts_insert on public.contacts
  for insert to authenticated
  with check (
    public.is_admin()
    or (owner_user_id = public.auth_uid_active() and created_by = public.auth_uid_active())
  );

create policy contacts_update on public.contacts
  for update to authenticated
  using (public.is_admin() or owner_user_id = public.auth_uid_active())
  with check (public.is_admin() or owner_user_id = public.auth_uid_active());

create policy contacts_delete_admin on public.contacts
  for delete to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- vehicles — acesso herdado do contato
-- -----------------------------------------------------------------------------
create policy vehicles_select on public.vehicles
  for select to authenticated
  using (public.can_access_contact(contact_id));

create policy vehicles_write on public.vehicles
  for all to authenticated
  using (public.can_access_contact(contact_id))
  with check (public.can_access_contact(contact_id));

-- -----------------------------------------------------------------------------
-- conversations
-- -----------------------------------------------------------------------------
create policy conversations_select on public.conversations
  for select to authenticated
  using (public.is_admin() or assigned_user_id = public.auth_uid_active());

-- Update serve para marcar como lida / arquivar. A troca de responsável é
-- bloqueada por trigger para quem não é admin (ver guard_conversation_assignment).
create policy conversations_update on public.conversations
  for update to authenticated
  using (public.is_admin() or assigned_user_id = public.auth_uid_active())
  with check (public.is_admin() or assigned_user_id = public.auth_uid_active());

create policy conversations_admin_write on public.conversations
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- conversation_assignments — somente leitura para quem enxerga a conversa
-- -----------------------------------------------------------------------------
create policy conversation_assignments_select on public.conversation_assignments
  for select to authenticated
  using (public.can_access_conversation(conversation_id));

-- -----------------------------------------------------------------------------
-- messages — leitura pelo dono da conversa; escrita só pelo backend
-- -----------------------------------------------------------------------------
create policy messages_select on public.messages
  for select to authenticated
  using (public.can_access_conversation(conversation_id));

create policy message_events_select on public.message_events
  for select to authenticated
  using (
    exists (
      select 1
      from public.messages m
      where m.id = message_events.message_id
        and public.can_access_conversation(m.conversation_id)
    )
  );

-- -----------------------------------------------------------------------------
-- notes
-- -----------------------------------------------------------------------------
create policy notes_select on public.notes
  for select to authenticated
  using (public.can_access_contact(contact_id));

create policy notes_insert on public.notes
  for insert to authenticated
  with check (
    public.can_access_contact(contact_id)
    and author_user_id = public.auth_uid_active()
  );

create policy notes_delete on public.notes
  for delete to authenticated
  using (public.is_admin() or author_user_id = public.auth_uid_active());

-- -----------------------------------------------------------------------------
-- lead_status_history
-- -----------------------------------------------------------------------------
create policy lead_status_history_select on public.lead_status_history
  for select to authenticated
  using (public.can_access_contact(contact_id));

-- -----------------------------------------------------------------------------
-- activity_events — consignador vê o próprio desempenho, admin vê tudo
-- -----------------------------------------------------------------------------
create policy activity_events_select on public.activity_events
  for select to authenticated
  using (public.is_admin() or user_id = public.auth_uid_active());

-- -----------------------------------------------------------------------------
-- webhook_events / audit_logs — leitura exclusiva do admin
-- -----------------------------------------------------------------------------
create policy webhook_events_admin_select on public.webhook_events
  for select to authenticated
  using (public.is_admin());

create policy audit_logs_admin_select on public.audit_logs
  for select to authenticated
  using (public.is_admin());

-- =============================================================================
-- Guards: campos que RLS sozinho não consegue proteger (precisam do valor antigo)
-- =============================================================================

-- Só admin transfere conversa entre consignadores.
create or replace function public.guard_conversation_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.assigned_user_id is distinct from old.assigned_user_id
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Apenas administradores podem transferir conversas'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger conversations_guard_assignment
  before update on public.conversations
  for each row execute function public.guard_conversation_assignment();

-- Só admin troca o responsável por um cliente.
create or replace function public.guard_contact_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.owner_user_id is distinct from old.owner_user_id
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Apenas administradores podem transferir clientes'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger contacts_guard_owner
  before update on public.contacts
  for each row execute function public.guard_contact_owner();

-- Ninguém escala o próprio papel nem se reativa pela API.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Apenas administradores podem alterar papel ou status de usuários'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- =============================================================================
-- Realtime
-- =============================================================================
-- As policies de SELECT acima também governam o Realtime: cada consignador só
-- recebe eventos das conversas e mensagens que já pode ler.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
