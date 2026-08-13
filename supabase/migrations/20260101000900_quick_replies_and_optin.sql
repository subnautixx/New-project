-- =============================================================================
-- Respostas rápidas e registro de opt-in
-- =============================================================================
-- Respostas rápidas: o consignador digita "como funciona a consignação" dezenas
-- de vezes por dia. É a economia de tempo mais direta que dá para oferecer.
--
-- Opt-in: templates de Marketing da Meta exigem consentimento, e sem registro
-- de quando e como o cliente consentiu não há como sustentar o envio. Uma
-- resposta do próprio cliente já é evidência de consentimento para atendimento,
-- então isso é gravado automaticamente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Respostas rápidas
-- -----------------------------------------------------------------------------
create table public.quick_replies (
  id            uuid primary key default gen_random_uuid(),
  -- Nulo = resposta da loja, visível para todos. Preenchido = pessoal.
  owner_user_id uuid references public.profiles (id) on delete cascade,
  title         text not null,
  body          text not null,
  -- Atalho digitável, sem a barra: "consignacao" responde a "/consignacao".
  shortcut      text,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index quick_replies_owner_idx on public.quick_replies (owner_user_id);

create trigger quick_replies_touch before update on public.quick_replies
  for each row execute function public.touch_updated_at();

alter table public.quick_replies enable row level security;

-- Todo mundo lê as da loja e as próprias.
create policy quick_replies_select on public.quick_replies
  for select to authenticated
  using (
    public.auth_uid_active() is not null
    and (owner_user_id is null or owner_user_id = public.auth_uid_active())
  );

-- Consignador cria e mexe apenas nas próprias.
create policy quick_replies_own_write on public.quick_replies
  for all to authenticated
  using (owner_user_id = public.auth_uid_active())
  with check (owner_user_id = public.auth_uid_active());

-- Resposta da loja (owner nulo) é responsabilidade do administrador.
create policy quick_replies_admin_write on public.quick_replies
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- Opt-in
-- -----------------------------------------------------------------------------
alter table public.contacts
  add column opt_in_at     timestamptz,
  add column opt_in_source text;

comment on column public.contacts.opt_in_at is
  'Quando o cliente demonstrou consentimento. Exigido pela Meta para templates de Marketing.';

/**
 * Uma resposta do cliente é o registro mais confiável de consentimento que
 * existe: ele escreveu de volta por vontade própria. Gravamos na primeira,
 * e nunca sobrescrevemos — o que importa é a data mais antiga.
 */
create or replace function public.record_opt_in_from_inbound()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.direction = 'inbound' then
    update public.contacts
    set opt_in_at = coalesce(new.wa_timestamp, new.created_at),
        opt_in_source = 'resposta_do_cliente'
    where id = new.contact_id
      and opt_in_at is null;
  end if;

  return new;
end;
$$;

create trigger messages_record_opt_in after insert on public.messages
  for each row execute function public.record_opt_in_from_inbound();
