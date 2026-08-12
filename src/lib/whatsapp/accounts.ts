import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { WhatsappAccountRow } from "@/lib/types/database";
import type { WhatsappCredentials } from "./client";

export interface AccountWithSecrets {
  account: WhatsappAccountRow;
  credentials: WhatsappCredentials;
  appSecret: string | null;
  verifyToken: string | null;
}

/**
 * Carrega a conta e seus segredos. Usa service_role de propósito: a tabela de
 * segredos não tem policy alguma, então nem o admin logado consegue lê-la
 * pelo cliente — apenas o backend.
 */
export async function getAccountWithSecrets(
  accountId: string,
): Promise<AccountWithSecrets | null> {
  const admin = createSupabaseAdminClient();

  const [{ data: account }, { data: secret }] = await Promise.all([
    admin.from("whatsapp_accounts").select("*").eq("id", accountId).maybeSingle(),
    admin
      .from("whatsapp_account_secrets")
      .select("*")
      .eq("whatsapp_account_id", accountId)
      .maybeSingle(),
  ]);

  if (!account || !account.phone_number_id || !secret?.access_token) return null;

  return {
    account,
    credentials: {
      phoneNumberId: account.phone_number_id,
      accessToken: secret.access_token,
    },
    appSecret: secret.app_secret,
    verifyToken: secret.verify_token,
  };
}

/** Resolve a conta a partir do `phone_number_id` que veio no webhook. */
export async function getAccountByPhoneNumberId(
  phoneNumberId: string,
): Promise<AccountWithSecrets | null> {
  const admin = createSupabaseAdminClient();

  const { data: account } = await admin
    .from("whatsapp_accounts")
    .select("*")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();

  if (!account) return null;

  return getAccountWithSecrets(account.id);
}

/**
 * O usuário pode enviar por este número?
 * Admin pode por qualquer um; consignador só pelos números concedidos a ele.
 */
export async function userCanSendFromAccount(
  userId: string,
  isAdminUser: boolean,
  accountId: string,
): Promise<boolean> {
  if (isAdminUser) return true;

  const admin = createSupabaseAdminClient();

  const { data } = await admin
    .from("user_whatsapp_permissions")
    .select("can_send")
    .eq("user_id", userId)
    .eq("whatsapp_account_id", accountId)
    .maybeSingle();

  return data?.can_send === true;
}
