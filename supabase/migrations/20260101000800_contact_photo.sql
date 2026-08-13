-- =============================================================================
-- Foto do cliente
-- =============================================================================
-- A Cloud API da Meta não entrega foto de perfil de contato — o webhook traz
-- `profile.name` e `wa_id`, nada além disso. Então a foto é carregada pelo
-- próprio consignador, no cadastro ou na edição.
--
-- Guardamos o CAMINHO no bucket, não uma URL: o bucket é privado e a imagem é
-- servida por rota autenticada, como as mídias das conversas. Foto de cliente
-- é dado pessoal e não fica em link público adivinhável.
-- =============================================================================

alter table public.contacts
  add column photo_path text;

comment on column public.contacts.photo_path is
  'Caminho no bucket contact-photos. Servido por /api/contacts/[id]/photo.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contact-photos',
  'contact-photos',
  false,
  5242880, -- 5 MB: foto de celular passa disso só em casos extremos
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;
