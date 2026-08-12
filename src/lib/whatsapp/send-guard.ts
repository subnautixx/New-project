import "server-only";

import { NextResponse } from "next/server";
import type { ApiActor } from "@/lib/auth/api";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type { LeadStatus } from "@/lib/types/database";
import { getAccountWithSecrets, userCanSendFromAccount } from "./accounts";
import type { AccountWithSecrets } from "./accounts";

type SessionClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export interface SendContext {
  conversationId: string;
  contactId: string;
  contactPhone: string;
  contactStatus: LeadStatus;
  account: AccountWithSecrets;
}

type Guarded = { ok: true; context: SendContext } | { ok: false; response: NextResponse };

/**
 * Verificação única antes de qualquer envio (texto, mídia ou template).
 *
 * A conversa é lida pelo cliente da SESSÃO: se pertence a outro consignador, a
 * RLS já a esconde e a rota responde 404 — sem revelar que ela existe.
 *
 * `allowOutsideWindow` só é usado pelo envio de template, o único caminho que a
 * Meta permite depois das 24 horas.
 */
export async function authorizeConversationSend(
  supabase: SessionClient,
  actor: ApiActor,
  conversationId: string,
  options: { allowOutsideWindow?: boolean } = {},
): Promise<Guarded> {
  const { data: conversation } = await supabase
    .from("conversations")
    .select(
      "id, contact_id, whatsapp_account_id, assigned_user_id, service_window_expires_at, contacts(phone_e164, status)",
    )
    .eq("id", conversationId)
    .maybeSingle();

  if (!conversation) {
    return {
      ok: false,
      response: NextResponse.json({ error: "conversation_not_found" }, { status: 404 }),
    };
  }

  if (actor.role !== "admin" && conversation.assigned_user_id !== actor.id) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  const canSend = await userCanSendFromAccount(
    actor.id,
    actor.role === "admin",
    conversation.whatsapp_account_id,
  );

  if (!canSend) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "forbidden", message: "Você não tem permissão para enviar por este número." },
        { status: 403 },
      ),
    };
  }

  const contact = conversation.contacts as unknown as
    | { phone_e164: string; status: LeadStatus }
    | null;

  if (!contact?.phone_e164) {
    return {
      ok: false,
      response: NextResponse.json({ error: "contact_without_phone" }, { status: 422 }),
    };
  }

  // Regra da Meta: fora da janela de 24h só template aprovado é aceito.
  // O CRM avisa em vez de tentar contornar.
  if (!options.allowOutsideWindow && isWindowExpired(conversation.service_window_expires_at)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "service_window_expired",
          message:
            "A janela de 24 horas expirou. Só é possível reabrir a conversa com um template aprovado pela Meta.",
        },
        { status: 422 },
      ),
    };
  }

  const account = await getAccountWithSecrets(conversation.whatsapp_account_id);

  if (!account) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "account_not_configured", message: "Número de WhatsApp sem credenciais válidas." },
        { status: 503 },
      ),
    };
  }

  return {
    ok: true,
    context: {
      conversationId: conversation.id,
      contactId: conversation.contact_id,
      contactPhone: contact.phone_e164,
      contactStatus: contact.status,
      account,
    },
  };
}

export function isWindowExpired(expiresAt: string | null): boolean {
  return Boolean(expiresAt && new Date(expiresAt) <= new Date());
}
