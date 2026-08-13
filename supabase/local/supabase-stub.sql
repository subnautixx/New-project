-- =============================================================================
-- Stub do que o Supabase fornece pronto
-- =============================================================================
-- Recria localmente `auth`, `storage`, os papéis e a publicação de realtime,
-- para que as migrations do projeto rodem num Postgres comum exatamente como
-- rodariam no Supabase.
--
-- Serve à verificação (`scripts/verify-db.sh`): dá para validar schema, RLS,
-- triggers e métricas antes de tocar num banco de verdade. NÃO é uma migration
-- e nunca deve ser aplicado num projeto Supabase — lá tudo isto já existe.
-- =============================================================================

create extension if not exists pgcrypto;

create schema if not exists auth;
create schema if not exists storage;

create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key default gen_random_uuid(),
  aud text,
  role text,
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  confirmation_token text default '',
  recovery_token text default '',
  email_change_token_new text default '',
  email_change text default ''
);

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now()
);

-- No Supabase, auth.uid() lê a claim do JWT. Aqui usamos um parâmetro de
-- sessão com o mesmo nome, o que permite "virar" cada usuário e exercitar a
-- RLS de verdade, em vez de apenas ler as policies.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;

create publication supabase_realtime;
