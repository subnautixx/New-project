import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeRequest } from "@/lib/auth/api";
import { nextStatusAfterOutbound } from "@/lib/domain/lead";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAccountWithSecrets, userCanSendFromAccount } from "@/lib/whatsapp/accounts";
import { sendTextMessage } from "@/lib/whatsapp/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().trim().min(1, "Mensagem vazia").max(4096, "Mensagem muito longa"),
  /** Gerado no navegador antes do POST: garante idempotência em retry/duplo clique. */
  clientRef: z.string().uuid(),
});

const SEND_LIMIT = 30;
const SEND_WINDOW_MS = 60_000;

/**
 * Envio de mensagem pelo CRM.
 *
 * O navegador nunca fala com a Meta: ele chama esta rota, que valida
 * permissão, registra a tentativa, envia e só então guarda o
 * provider_message_id. Os status finais chegam depois, por webhook.
 */
export async function POST(request: NextRequest) {
  const auth = await authorizeRequest();
  if (!auth.ok) return auth.response;

  const { actor, supabase } = auth;

  const limit = rateLimit(`send:${actor.id}`, SEND_LIMIT, SEND_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Muitas mensagens em pouco tempo. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const { conversationId, text, clientRef } = parsed.data;

  // Leitura pelo cliente da sessão: a RLS já esconde conversa de outro consignador.
  const { data: conversation } = await supabase
    .from("conversations")
    .select(
      "id, contact_id, whatsapp_account_id, assigned_user_id, service_window_expires_at, contacts(phone_e164, status)",
    )
    .eq("id", conversationId)
    .maybeSingle();

  if (!conversation) {
    return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
  }

  if (actor.role !== "admin" && conversation.assigned_user_id !== actor.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const canSend = await userCanSendFromAccount(
    actor.id,
    actor.role === "admin",
    conversation.whatsapp_account_id,
  );

  if (!canSend) {
    return NextResponse.json(
      { error: "forbidden", message: "Você não tem permissão para enviar por este número." },
      { status: 403 },
    );
  }

  const contact = conversation.contacts as unknown as
    | { phone_e164: string; status: string }
    | null;

  if (!contact?.phone_e164) {
    return NextResponse.json({ error: "contact_without_phone" }, { status: 422 });
  }

  // Regra da Meta: fora da janela de 24h só template aprovado é aceito.
  // O CRM avisa em vez de tentar contornar.
  const windowExpiresAt = conversation.service_window_expires_at;
  if (windowExpiresAt && new Date(windowExpiresAt) <= new Date()) {
    return NextResponse.json(
      {
        error: "service_window_expired",
        message:
          "A janela de 24 horas expirou. Só é possível reabrir a conversa com um template aprovado pela Meta.",
      },
      { status: 422 },
    );
  }

  const admin = createSupabaseAdminClient();

  // Idempotência: se o mesmo clientRef já foi gravado, devolve o que existe.
  const { data: existing } = await admin
    .from("messages")
    .select("id, status, provider_message_id")
    .eq("client_ref", clientRef)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ message: existing, deduplicated: true }, { status: 200 });
  }

  const account = await getAccountWithSecrets(conversation.whatsapp_account_id);
  if (!account) {
    return NextResponse.json(
      { error: "account_not_configured", message: "Número de WhatsApp sem credenciais válidas." },
      { status: 503 },
    );
  }

  // A tentativa é registrada ANTES da chamada externa: se a Meta responder e o
  // processo cair em seguida, a mensagem não some do histórico.
  const { data: message, error: insertError } = await admin
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      whatsapp_account_id: conversation.whatsapp_account_id,
      contact_id: conversation.contact_id,
      direction: "outbound",
      message_type: "text",
      content: text,
      sent_by_user_id: actor.id,
      status: "queued",
      client_ref: clientRef,
    })
    .select("id, status, content, created_at")
    .single();

  if (insertError || !message) {
    return NextResponse.json({ error: "message_insert_failed" }, { status: 500 });
  }

  const result = await sendTextMessage(account.credentials, contact.phone_e164, text);

  const { data: updated } = await admin
    .from("messages")
    .update({
      provider_message_id: result.providerMessageId,
      status: result.ok ? "sent" : "failed",
      error_code: result.errorCode,
      error_message: result.errorMessage,
    })
    .eq("id", message.id)
    .select("id, status, content, provider_message_id, error_message, created_at")
    .single();

  if (!result.ok) {
    return NextResponse.json(
      { error: "send_failed", message: result.errorMessage, messageRecord: updated },
      { status: 502 },
    );
  }

  // Primeira abordagem move o lead de "novo" para "contatado".
  const advanced = nextStatusAfterOutbound((contact.status ?? "novo") as never);
  if (advanced) {
    await admin.from("contacts").update({ status: advanced }).eq("id", conversation.contact_id);
  }

  return NextResponse.json({ message: updated }, { status: 201 });
}
