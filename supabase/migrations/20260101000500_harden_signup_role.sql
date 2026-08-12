-- =============================================================================
-- Correção de segurança: papel nunca vem do metadata do cadastro
-- =============================================================================
-- A versão anterior de handle_new_auth_user lia `raw_user_meta_data->>'role'`
-- e promovia a admin quando o valor era 'admin'. Esse campo é controlado por
-- quem faz o cadastro, então qualquer signup poderia nascer administrador.
--
-- Agora todo perfil nasce como consignador, sem exceção. Promover alguém a
-- admin só acontece por PATCH /api/admin/users/[id], que exige um admin
-- autenticado e registra a ação na auditoria.
-- =============================================================================

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
    -- Fixo. O metadata do cadastro não decide privilégio.
    'consignador'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
