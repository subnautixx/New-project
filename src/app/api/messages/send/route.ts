import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeRequest } from "@/lib/auth/api";
const jsonResponse = NextResponse.json;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { nextStatusAfterOutbound } from "@/lib/domain/lead";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendTextMessage } from "@/lib/whatsapp/client";
import { existingAttempt } from "@/lib/messages/deduplicate";
import { MESSAGE_SELECT, UNCERTAIN_MESSAGE, persistedOutcome } from "@/lib/messages/outcome";
import { authorizeConversationSend } from "@/lib/whatsapp/send-guard";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().trim().min(1, "Mensagem vazia").max(4096, "Mensagem muito longa"),
  /** Gerado no navegador antes do POST: garante idempotência em retry/duplo clique. */
  clientRef: z.string().uuid(),
});

const SEND_LIMIT = 30;
const SEND_WINDOW_MS = 60_000;

/**
 * Envio de mensagem de texto pelo CRM.
 *
 * O navegador nunca fala com a Meta: ele chama esta rota, que valida
 * permissão, registra a tentativa, envia e só então guarda o
 * provider_message_id. Os status finais chegam depois, por webhook.
 */
export async function POST(request: Request) {
  const auth = await authorizeRequest();
  if (!auth.ok) return auth.response;

  const { actor, supabase } = auth;

  const limit = rateLimit(`send:${actor.id}`, SEND_LIMIT, SEND_WINDOW_MS);
  if (!limit.allowed) {
    return jsonResponse(
      { error: "rate_limited", message: "Muitas mensagens em pouco tempo. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonResponse(
      { error: "invalid_body", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const { conversationId, text, clientRef } = parsed.data;

  const guard = await authorizeConversationSend(supabase, actor, conversationId);
  if (!guard.ok) return guard.response;

  const { contactPhone, contactStatus, contactId, account } = guard.context;
  const admin = createSupabaseAdminClient();

  // Idempotência: se o mesmo clientRef já foi gravado, devolve o que existe.
  const existing = await existingAttempt(admin, clientRef, conversationId, actor.id);
  if (existing) return existing;

  // A tentativa é registrada ANTES da chamada externa: se a Meta responder e o
  // processo cair em seguida, a mensagem não some do histórico.
  const { data: message, error: insertError } = await admin
    .from("messages")
    .insert({
      conversation_id: conversationId,
      whatsapp_account_id: account.account.id,
      contact_id: contactId,
      direction: "outbound",
      message_type: "text",
      content: text,
      sent_by_user_id: actor.id,
      status: "queued",
      client_ref: clientRef,
    })
    .select(MESSAGE_SELECT)
    .single();

  if (insertError?.code === "23505") {
    const replay = await existingAttempt(admin, clientRef, conversationId, actor.id);
    return replay ?? jsonResponse({ error: "attempt_conflict" }, { status: 409 });
  }
  if (insertError || !message) {
    return jsonResponse({ error: "message_insert_failed" }, { status: 500 });
  }

  const result = await sendTextMessage(account.credentials, contactPhone, text);
  const outcome = persistedOutcome(result);

  const { data: updated, error: updateError } = await admin
    .from("messages")
    .update(outcome)
    .eq("id", message.id)
    .eq("status", "queued")
    .eq("updated_at", message.updated_at)
    .select(MESSAGE_SELECT)
    .single();

  if (updateError || !updated) {
    return jsonResponse({ error: "persist_failed", message: UNCERTAIN_MESSAGE,
      messageRecord: { ...message, error_code: "delivery_unknown", error_message: UNCERTAIN_MESSAGE } }, { status: 202 });
  }

  if (!result.ok) {
    return jsonResponse(
      {
        error: result.uncertain ? "send_uncertain" : "send_failed",
        message: outcome.error_message,
        messageRecord: updated,
      },
      // 202: a mensagem pode ter saído. A conversa não oferece reenvio cego.
      { status: result.uncertain ? 202 : 502 },
    );
  }

  // Primeira abordagem move o lead de "novo" para "contatado".
  const advanced = nextStatusAfterOutbound(contactStatus);
  if (advanced) {
    await admin.from("contacts").update({ status: advanced }).eq("id", contactId);
  }

  return jsonResponse({ message: updated }, { status: 201 });
}
