-- =============================================================================
-- Consignador precisa abrir a conversa ao cadastrar um prospect
-- =============================================================================
-- As policies iniciais deixavam a criação de conversas só para o admin e para
-- o service_role (webhook). Mas o fluxo principal de prospecção é o próprio
-- consignador cadastrar o dono do anúncio e já mandar a primeira mensagem.
--
-- O INSERT é liberado apenas quando as três condições valem ao mesmo tempo:
--   1. a conversa nasce atribuída a ele mesmo;
--   2. o cliente já é dele;
--   3. ele tem permissão de envio naquele número de WhatsApp.
-- Assim ninguém cria conversa em nome de outro vendedor nem por um número
-- que não lhe foi concedido.
-- =============================================================================

create policy conversations_insert on public.conversations
  for insert to authenticated
  with check (
    public.is_admin()
    or (
      assigned_user_id = public.auth_uid_active()
      and exists (
        select 1
        from public.contacts ct
        where ct.id = conversations.contact_id
          and ct.owner_user_id = public.auth_uid_active()
      )
      and exists (
        select 1
        from public.user_whatsapp_permissions p
        where p.whatsapp_account_id = conversations.whatsapp_account_id
          and p.user_id = public.auth_uid_active()
          and p.can_send
      )
    )
  );
