-- =============================================================================
-- Tutorial de primeiro acesso
-- =============================================================================
-- Guarda quando o usuário concluiu o tutorial, para ele aparecer sozinho na
-- primeira entrada e nunca mais atrapalhar.
--
-- Fica em `profiles` porque é estado do usuário, não configuração da operação:
-- cada consignador conclui o seu, e um novo integrante recebe o tutorial mesmo
-- que o resto da equipe já o tenha visto.
-- =============================================================================

alter table public.profiles
  add column onboarding_completed_at timestamptz;

comment on column public.profiles.onboarding_completed_at is
  'Nulo = ainda não viu o tutorial. A policy profiles_update_self permite que o próprio usuário marque como concluído.';
