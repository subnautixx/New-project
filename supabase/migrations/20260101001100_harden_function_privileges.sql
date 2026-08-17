-- =============================================================================
-- Fecha as funções que não deveriam ser endpoints públicos
-- =============================================================================
-- Projetos Supabase com grants explícitos na Data API concedem EXECUTE a
-- anon/authenticated/service_role assim que uma função é criada. Isso publica
-- em /rest/v1/rpc/ coisas que nunca foram feitas para serem chamadas de fora:
-- as funções de trigger e os helpers `security definer` da RLS.
--
-- Aqui tudo é revogado e devolvido caso a caso: os helpers porque as policies
-- os avaliam em nome do usuário autenticado, e as três funções de métrica
-- porque são as únicas realmente chamadas via `supabase.rpc()` — e cada uma
-- verifica permissão internamente.
--
-- Esta migration nasceu aplicada direto no projeto, fora do repositório.
-- Trazê-la para cá evita que um ambiente novo, criado a partir destes
-- arquivos, suba sem o fechamento.
-- =============================================================================

revoke execute on all functions in schema public
from public, anon, authenticated, service_role;

-- Helpers avaliados pelas policies de RLS.
grant execute on function public.auth_uid_active()
to authenticated, service_role;
grant execute on function public.is_admin()
to authenticated, service_role;
grant execute on function public.can_access_conversation(uuid)
to authenticated, service_role;
grant execute on function public.can_access_contact(uuid)
to authenticated, service_role;

-- As únicas chamadas diretamente por `supabase.rpc()`.
grant execute on function public.metrics_user_summary(uuid, timestamptz, timestamptz)
to authenticated, service_role;
grant execute on function public.metrics_team_summary(timestamptz, timestamptz)
to authenticated, service_role;
grant execute on function public.metrics_volume(uuid, timestamptz, timestamptz, text, text)
to authenticated, service_role;

-- Última função com search_path mutável: fixa também.
alter function public.touch_updated_at()
  set search_path = public, pg_temp;

-- Função nova nasce fechada e só é liberada de propósito.
alter default privileges for role postgres in schema public
  revoke execute on functions from public;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;
