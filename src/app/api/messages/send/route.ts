import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeRequest } from "@/lib/auth/api";
import { nextStatusAfterOutbound } from "@/lib/domain/lead";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendTextMessage } from "@/lib/whatsapp/client";
import { describeSendError } from "@/lib/whatsapp/errors";
import { authorizeConversationSend } from "@/lib/whatsapp/send-guard";

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
 * Envio de mensagem de texto pelo CRM.
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

  const guard = await authorizeConversationSend(supabase, actor, conversationId);
  if (!guard.ok) return guard.response;

  const { contactPhone, contactStatus, contactId, account } = guard.context;
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
    .select("id")
    .single();

  if (insertError || !message) {
    return NextResponse.json({ error: "message_insert_failed" }, { status: 500 });
  }

  const result = await sendTextMessage(account.credentials, contactPhone, text);

  const { data: updated } = await admin
    .from("messages")
    .update({
      provider_message_id: result.providerMessageId,
      status: result.ok ? "sent" : "failed",
      error_code: result.errorCode,
      // Guarda o texto que a pessoa vai ler, não o jargão da Graph API.
      error_message: describeSendError(result.errorCode, result.errorMessage).message,
    })
    .eq("id", message.id)
    .select(
      "id, direction, message_type, content, media_id, media_mime_type, media_filename, status, error_message, sent_by_user_id, wa_timestamp, created_at",
    )
    .single();

  if (!result.ok) {
    return NextResponse.json(
      {
        error: "send_failed",
        message: describeSendError(result.errorCode, result.errorMessage).message,
        messageRecord: updated,
      },
      { status: 502 },
    );
  }

  // Primeira abordagem move o lead de "novo" para "contatado".
  const advanced = nextStatusAfterOutbound(contactStatus);
  if (advanced) {
    await admin.from("contacts").update({ status: advanced }).eq("id", contactId);
  }

  return NextResponse.json({ message: updated }, { status: 201 });
}
