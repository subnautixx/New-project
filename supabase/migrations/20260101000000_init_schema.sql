-- =============================================================================
-- 4FMOTORS CRM — Schema inicial
-- =============================================================================
-- Princípios:
--   * Um usuário NÃO é acoplado a um único WhatsApp (tabela de permissões N:N).
--   * Um número pode ser compartilhado por vários usuários.
--   * Toda conversa possui exatamente um responsável (assigned_user_id).
--   * Toda mensagem enviada pelo CRM registra QUAL usuário interno enviou.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'consignador');

create type public.wa_account_mode as enum ('shared', 'individual');

create type public.wa_account_status as enum ('pending', 'connected', 'disconnected', 'error');

create type public.lead_status as enum (
  'novo',
  'contatado',
  'respondeu',
  'interessado',
  'negociacao',
  'consignado',
  'perdido',
  'sem_resposta'
);

create type public.message_direction as enum ('inbound', 'outbound');

-- Tipos extras já previstos para evolução futura sem migração de dados.
create type public.message_type as enum (
  'text',
  'image',
  'audio',
  'video',
  'document',
  'sticker',
  'location',
  'contacts',
  'template',
  'system',
  'unsupported'
);

create type public.message_status as enum (
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
  'received',
  'deleted'
);

create type public.activity_type as enum (
  'message_sent',
  'message_received',
  'contact_created',
  'contact_status_changed',
  'conversation_assigned',
  'note_added'
);

-- -----------------------------------------------------------------------------
-- profiles — espelha auth.users com papel e estado
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  email       text,
  phone       text,
  role        public.user_role not null default 'consignador',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'Perfil interno do usuário (admin ou consignador).';

create index profiles_role_idx on public.profiles (role) where is_active;

-- -----------------------------------------------------------------------------
-- whatsapp_accounts — uma linha por número conectado (compartilhado ou individual)
-- -----------------------------------------------------------------------------
create table public.whatsapp_accounts (
  id                    uuid primary key default gen_random_uuid(),
  display_name          text not null,
  phone_e164            text not null,
  -- Identificadores da Meta Cloud API
  phone_number_id       text unique,
  waba_id               text,
  mode                  public.wa_account_mode not null default 'shared',
  status                public.wa_account_status not null default 'pending',
  -- Coexistência oficial (WhatsApp Business App + Cloud API no mesmo número)
  coexistence_enabled   boolean not null default false,
  -- Responsável padrão para conversas novas que chegam sem dono definido
  default_owner_user_id uuid references public.profiles (id) on delete set null,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on column public.whatsapp_accounts.mode is
  'shared = número da loja usado por vários consignadores; individual = número de um consignador. O modo híbrido é simplesmente a coexistência de linhas dos dois tipos.';

create index whatsapp_accounts_active_idx on public.whatsapp_accounts (is_active);

-- -----------------------------------------------------------------------------
-- whatsapp_account_secrets — tokens NUNCA acessíveis pelo cliente
-- -----------------------------------------------------------------------------
create table public.whatsapp_account_secrets (
  whatsapp_account_id uuid primary key
    references public.whatsapp_accounts (id) on delete cascade,
  access_token        text not null,
  app_secret          text,
  verify_token        text,
  updated_at          timestamptz not null default now()
);

comment on table public.whatsapp_account_secrets is
  'Somente service_role. RLS habilitado e SEM policies: nem anon nem authenticated conseguem ler.';

-- -----------------------------------------------------------------------------
-- user_whatsapp_permissions — N:N usuário <-> número
-- -----------------------------------------------------------------------------
create table public.user_whatsapp_permissions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  whatsapp_account_id uuid not null references public.whatsapp_accounts (id) on delete cascade,
  can_send            boolean not null default true,
  created_at          timestamptz not null default now(),
  unique (user_id, whatsapp_account_id)
);

create index user_wa_perm_user_idx on public.user_whatsapp_permissions (user_id);
create index user_wa_perm_account_idx on public.user_whatsapp_permissions (whatsapp_account_id);

-- -----------------------------------------------------------------------------
-- contacts — prospects e clientes
-- -----------------------------------------------------------------------------
create table public.contacts (
  id                  uuid primary key default gen_random_uuid(),
  full_name           text not null,
  phone_e164          text not null,
  phone_raw           text,
  -- Responsável (consignador). Uma conversa herda daqui quando criada.
  owner_user_id       uuid not null references public.profiles (id) on delete restrict,
  status              public.lead_status not null default 'novo',
  -- Prospecção
  source_platform     text,
  listing_url         text,
  notes               text,
  -- Próxima ação (opcional)
  next_action_at      timestamptz,
  next_action_note    text,
  last_interaction_at timestamptz,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Um telefone = um responsável. Evita dois consignadores abordando a mesma pessoa
-- e torna o roteamento do número compartilhado determinístico.
create unique index contacts_phone_unique_idx on public.contacts (phone_e164);
create index contacts_owner_idx on public.contacts (owner_user_id);
create index contacts_status_idx on public.contacts (status);
create index contacts_last_interaction_idx on public.contacts (last_interaction_at desc nulls last);
create index contacts_next_action_idx on public.contacts (next_action_at)
  where next_action_at is not null;

-- -----------------------------------------------------------------------------
-- vehicles — veículo do prospect (o anúncio que originou o contato)
-- -----------------------------------------------------------------------------
create table public.vehicles (
  id              uuid primary key default gen_random_uuid(),
  contact_id      uuid not null references public.contacts (id) on delete cascade,
  brand           text,
  model           text,
  version         text,
  year            integer,
  model_year      integer,
  km              integer,
  color           text,
  plate           text,
  listed_price    numeric(12, 2),
  listing_url     text,
  source_platform text,
  is_primary      boolean not null default true,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index vehicles_contact_idx on public.vehicles (contact_id);
create unique index vehicles_one_primary_idx on public.vehicles (contact_id) where is_primary;

-- -----------------------------------------------------------------------------
-- conversations — uma por (contato, número de WhatsApp)
-- -----------------------------------------------------------------------------
create table public.conversations (
  id                   uuid primary key default gen_random_uuid(),
  contact_id           uuid not null references public.contacts (id) on delete cascade,
  whatsapp_account_id  uuid not null references public.whatsapp_accounts (id) on delete restrict,
  assigned_user_id     uuid not null references public.profiles (id) on delete restrict,
  last_message_at      timestamptz,
  last_message_preview text,
  last_inbound_at      timestamptz,
  last_outbound_at     timestamptz,
  unread_count         integer not null default 0,
  is_archived          boolean not null default false,
  -- Janela de atendimento de 24h da Meta (fora dela só template é permitido)
  service_window_expires_at timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (contact_id, whatsapp_account_id)
);

create index conversations_assigned_idx on public.conversations (assigned_user_id, last_message_at desc nulls last);
create index conversations_account_idx on public.conversations (whatsapp_account_id);
create index conversations_contact_idx on public.conversations (contact_id);

-- -----------------------------------------------------------------------------
-- conversation_assignments — histórico de transferências
-- -----------------------------------------------------------------------------
create table public.conversation_assignments (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  from_user_id    uuid references public.profiles (id) on delete set null,
  to_user_id      uuid not null references public.profiles (id) on delete restrict,
  changed_by      uuid references public.profiles (id) on delete set null,
  reason          text,
  created_at      timestamptz not null default now()
);

create index conversation_assignments_conv_idx on public.conversation_assignments (conversation_id, created_at desc);

-- -----------------------------------------------------------------------------
-- messages
-- -----------------------------------------------------------------------------
create table public.messages (
  id                  uuid primary key default gen_random_uuid(),
  provider_message_id text,
  conversation_id     uuid not null references public.conversations (id) on delete cascade,
  whatsapp_account_id uuid not null references public.whatsapp_accounts (id) on delete restrict,
  contact_id          uuid not null references public.contacts (id) on delete cascade,
  direction           public.message_direction not null,
  message_type        public.message_type not null default 'text',
  content             text,
  media_id            text,
  media_url           text,
  media_mime_type     text,
  media_filename      text,
  -- Quem apertou "enviar" no CRM. Essencial no modo de número compartilhado.
  sent_by_user_id     uuid references public.profiles (id) on delete set null,
  status              public.message_status not null default 'queued',
  error_code          text,
  error_message       text,
  -- Idempotência de saída: gerado pelo cliente antes do POST
  client_ref          uuid,
  wa_timestamp        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint messages_outbound_has_sender
    check (direction = 'inbound' or sent_by_user_id is not null)
);

create unique index messages_provider_id_idx on public.messages (provider_message_id)
  where provider_message_id is not null;
create unique index messages_client_ref_idx on public.messages (client_ref)
  where client_ref is not null;
create index messages_conversation_idx on public.messages (conversation_id, created_at desc);
create index messages_sender_idx on public.messages (sent_by_user_id, created_at desc)
  where sent_by_user_id is not null;
create index messages_contact_direction_idx on public.messages (contact_id, direction, created_at);

-- -----------------------------------------------------------------------------
-- message_events — trilha de status vinda dos webhooks
-- -----------------------------------------------------------------------------
create table public.message_events (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.messages (id) on delete cascade,
  status      public.message_status not null,
  occurred_at timestamptz not null default now(),
  raw         jsonb,
  created_at  timestamptz not null default now(),
  -- Um mesmo status nunca é gravado duas vezes para a mesma mensagem.
  unique (message_id, status)
);

create index message_events_message_idx on public.message_events (message_id, occurred_at);

-- -----------------------------------------------------------------------------
-- notes — anotações do consignador sobre o cliente
-- -----------------------------------------------------------------------------
create table public.notes (
  id             uuid primary key default gen_random_uuid(),
  contact_id     uuid not null references public.contacts (id) on delete cascade,
  author_user_id uuid not null references public.profiles (id) on delete restrict,
  body           text not null,
  created_at     timestamptz not null default now()
);

create index notes_contact_idx on public.notes (contact_id, created_at desc);

-- -----------------------------------------------------------------------------
-- lead_status_history — funil auditável
-- -----------------------------------------------------------------------------
create table public.lead_status_history (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references public.contacts (id) on delete cascade,
  from_status public.lead_status,
  to_status   public.lead_status not null,
  changed_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index lead_status_history_contact_idx on public.lead_status_history (contact_id, created_at desc);
create index lead_status_history_period_idx on public.lead_status_history (to_status, created_at);

-- -----------------------------------------------------------------------------
-- activity_events — base factual das métricas
-- -----------------------------------------------------------------------------
create table public.activity_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles (id) on delete set null,
  contact_id      uuid references public.contacts (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete cascade,
  message_id      uuid references public.messages (id) on delete set null,
  type            public.activity_type not null,
  occurred_at     timestamptz not null default now(),
  metadata        jsonb not null default '{}'::jsonb
);

create index activity_events_user_time_idx on public.activity_events (user_id, occurred_at desc);
create index activity_events_type_time_idx on public.activity_events (type, occurred_at desc);

-- -----------------------------------------------------------------------------
-- webhook_events — idempotência e debugging
-- -----------------------------------------------------------------------------
create table public.webhook_events (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null default 'meta',
  -- Chave natural do evento (id da mensagem, ou id+status para eventos de status)
  event_key       text not null,
  payload         jsonb not null,
  signature_valid boolean not null default false,
  processed_at    timestamptz,
  error           text,
  created_at      timestamptz not null default now(),
  unique (provider, event_key)
);

create index webhook_events_created_idx on public.webhook_events (created_at desc);
create index webhook_events_unprocessed_idx on public.webhook_events (created_at)
  where processed_at is null;

-- -----------------------------------------------------------------------------
-- audit_logs — auditoria de ações administrativas
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles (id) on delete set null,
  action        text not null,
  entity_type   text,
  entity_id     uuid,
  metadata      jsonb not null default '{}'::jsonb,
  ip            text,
  created_at    timestamptz not null default now()
);

create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_user_id, created_at desc);
