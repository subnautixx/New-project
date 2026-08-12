-- =============================================================================
-- 4FMOTORS CRM — Funções auxiliares e triggers
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Identidade do usuário logado
-- -----------------------------------------------------------------------------

-- Retorna o uid apenas se o perfil existir E estiver ativo.
-- Desativar um usuário derruba o acesso dele no banco, não só na interface.
create or replace function public.auth_uid_active()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active
      and p.role = 'admin'
  )
$$;

-- Acesso a uma conversa: admin vê tudo, consignador só o que é dele.
create or replace function public.can_access_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_admin()
      or exists (
        select 1
        from public.conversations c
        where c.id = p_conversation_id
          and c.assigned_user_id = public.auth_uid_active()
      )
$$;

create or replace function public.can_access_contact(p_contact_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_admin()
      or exists (
        select 1
        from public.contacts ct
        where ct.id = p_contact_id
          and ct.owner_user_id = public.auth_uid_active()
      )
$$;

revoke all on function public.auth_uid_active() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.can_access_conversation(uuid) from public;
revoke all on function public.can_access_contact(uuid) from public;

grant execute on function public.auth_uid_active() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.can_access_conversation(uuid) to authenticated, service_role;
grant execute on function public.can_access_contact(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- updated_at automático
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger whatsapp_accounts_touch before update on public.whatsapp_accounts
  for each row execute function public.touch_updated_at();
create trigger contacts_touch before update on public.contacts
  for each row execute function public.touch_updated_at();
create trigger vehicles_touch before update on public.vehicles
  for each row execute function public.touch_updated_at();
create trigger conversations_touch before update on public.conversations
  for each row execute function public.touch_updated_at();
create trigger messages_touch before update on public.messages
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Novo usuário do Supabase Auth -> profile
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    new.email,
    -- O papel só pode ser elevado explicitamente por um admin depois.
    case when new.raw_user_meta_data ->> 'role' = 'admin' then 'admin' else 'consignador' end::public.user_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- Histórico de status do lead (automático)
-- -----------------------------------------------------------------------------
create or replace function public.log_contact_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.lead_status_history (contact_id, from_status, to_status, changed_by)
    values (new.id, null, new.status, coalesce(new.created_by, auth.uid()));

    insert into public.activity_events (user_id, contact_id, type, occurred_at, metadata)
    values (
      coalesce(new.created_by, auth.uid(), new.owner_user_id),
      new.id,
      'contact_created',
      new.created_at,
      jsonb_build_object('status', new.status)
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.lead_status_history (contact_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());

    insert into public.activity_events (user_id, contact_id, type, metadata)
    values (
      coalesce(auth.uid(), new.owner_user_id),
      new.id,
      'contact_status_changed',
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;

  return new;
end;
$$;

create trigger contacts_status_history
  after insert or update of status on public.contacts
  for each row execute function public.log_contact_status_change();

-- -----------------------------------------------------------------------------
-- Transferência de responsável: histórico + propagação para as conversas
-- -----------------------------------------------------------------------------
create or replace function public.log_conversation_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.assigned_user_id is not distinct from old.assigned_user_id then
    return new;
  end if;

  insert into public.conversation_assignments (
    conversation_id, from_user_id, to_user_id, changed_by
  )
  values (
    new.id,
    case when tg_op = 'UPDATE' then old.assigned_user_id else null end,
    new.assigned_user_id,
    auth.uid()
  );

  insert into public.activity_events (user_id, contact_id, conversation_id, type, metadata)
  values (
    coalesce(auth.uid(), new.assigned_user_id),
    new.contact_id,
    new.id,
    'conversation_assigned',
    jsonb_build_object('to_user_id', new.assigned_user_id)
  );

  return new;
end;
$$;

create trigger conversations_assignment_history
  after insert or update of assigned_user_id on public.conversations
  for each row execute function public.log_conversation_assignment();

-- Ao trocar o responsável do contato, as conversas dele acompanham.
create or replace function public.sync_conversation_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.owner_user_id is distinct from old.owner_user_id then
    update public.conversations
    set assigned_user_id = new.owner_user_id
    where contact_id = new.id
      and assigned_user_id = old.owner_user_id;
  end if;
  return new;
end;
$$;

create trigger contacts_sync_conversation_owner
  after update of owner_user_id on public.contacts
  for each row execute function public.sync_conversation_owner();

-- -----------------------------------------------------------------------------
-- Nota adicionada -> evento de atividade
-- -----------------------------------------------------------------------------
create or replace function public.log_note_added()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.activity_events (user_id, contact_id, type, occurred_at)
  values (new.author_user_id, new.contact_id, 'note_added', new.created_at);
  return new;
end;
$$;

create trigger notes_activity after insert on public.notes
  for each row execute function public.log_note_added();

-- -----------------------------------------------------------------------------
-- Mensagem gravada -> atualiza conversa, contato e métricas
-- -----------------------------------------------------------------------------
create or replace function public.on_message_inserted()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ts      timestamptz := coalesce(new.wa_timestamp, new.created_at);
  v_preview text;
  v_owner   uuid;
begin
  v_preview := case new.message_type
    when 'text' then left(coalesce(new.content, ''), 160)
    when 'image' then '📷 Foto'
    when 'audio' then '🎤 Áudio'
    when 'video' then '🎬 Vídeo'
    when 'document' then '📄 ' || coalesce(new.media_filename, 'Documento')
    when 'sticker' then 'Figurinha'
    when 'location' then '📍 Localização'
    when 'contacts' then '👤 Contato'
    else left(coalesce(new.content, 'Mensagem'), 160)
  end;

  if new.direction = 'inbound' then
    update public.conversations
    set last_message_at      = v_ts,
        last_message_preview = v_preview,
        last_inbound_at      = v_ts,
        unread_count         = unread_count + 1,
        -- Resposta do cliente reabre a janela de 24h da Meta.
        service_window_expires_at = v_ts + interval '24 hours'
    where id = new.conversation_id
    returning assigned_user_id into v_owner;
  else
    update public.conversations
    set last_message_at      = v_ts,
        last_message_preview = v_preview,
        last_outbound_at     = v_ts
    where id = new.conversation_id
    returning assigned_user_id into v_owner;
  end if;

  update public.contacts
  set last_interaction_at = v_ts
  where id = new.contact_id
    and (last_interaction_at is null or last_interaction_at < v_ts);

  insert into public.activity_events (
    user_id, contact_id, conversation_id, message_id, type, occurred_at, metadata
  )
  values (
    case when new.direction = 'outbound' then new.sent_by_user_id else v_owner end,
    new.contact_id,
    new.conversation_id,
    new.id,
    case when new.direction = 'outbound' then 'message_sent' else 'message_received' end::public.activity_type,
    v_ts,
    jsonb_build_object('message_type', new.message_type)
  );

  return new;
end;
$$;

create trigger messages_after_insert after insert on public.messages
  for each row execute function public.on_message_inserted();
