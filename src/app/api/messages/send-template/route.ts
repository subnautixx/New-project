import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeRequest } from "@/lib/auth/api";
const jsonResponse = NextResponse.json;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendTemplateMessage } from "@/lib/whatsapp/client";
import { renderTemplateBody } from "@/lib/whatsapp/template";
import { existingAttempt } from "@/lib/messages/deduplicate";
import { MESSAGE_SELECT, UNCERTAIN_MESSAGE, persistedOutcome } from "@/lib/messages/outcome";
import { authorizeConversationSend } from "@/lib/whatsapp/send-guard";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  templateName: z.string().trim().min(1).max(120),
  languageCode: z.string().trim().min(2).max(10),
  parameters: z.array(z.string().trim().max(400)).max(10).default([]),
  /** Corpo do template, só para gravar no histórico o que o cliente recebeu. */
  bodyText: z.string().max(2000).optional(),
  clientRef: z.string().uuid(),
});

/**
 * Envio de template aprovado.
 *
 * É o único caminho que a Meta permite depois que a janela de 24 horas fecha —
 * por isso esta rota passa `allowOutsideWindow`. Continua valendo tudo o mais:
 * a conversa precisa ser do usuário e o número precisa estar liberado para ele.
 *
 * Limite mais apertado que o de texto: template é mensagem de reengajamento, e
 * disparo em volume é exatamente o que as políticas da Meta punem.
 */
export async function POST(request: Request) {
  const auth = await authorizeRequest();
  if (!auth.ok) return auth.response;

  const { actor, supabase } = auth;

  const limit = rateLimit(`template:${actor.id}`, 10, 60_000);
  if (!limit.allowed) {
    return jsonResponse(
      {
        error: "rate_limited",
        message: "Muitos templates em pouco tempo. Aguarde antes de reabrir outra conversa.",
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonResponse({ error: "invalid_body" }, { status: 400 });
  }

  const { conversationId, templateName, languageCode, parameters, bodyText, clientRef } =
    parsed.data;

  const guard = await authorizeConversationSend(supabase, actor, conversationId, {
    allowOutsideWindow: true,
  });
  if (!guard.ok) return guard.response;

  const { contactPhone, contactId, account } = guard.context;
  const admin = createSupabaseAdminClient();

  const existing = await existingAttempt(admin, clientRef, conversationId, actor.id);
  if (existing) return existing;

  // Guarda o texto já preenchido: daqui a um mês ninguém lembra o que o
  // template "reengajamento_v2" dizia.
  const content = bodyText
    ? renderTemplateBody(bodyText, parameters)
    : `[template: ${templateName}]`;

  const { data: message, error: insertError } = await admin
    .from("messages")
    .insert({
      conversation_id: conversationId,
      whatsapp_account_id: account.account.id,
      contact_id: contactId,
      direction: "outbound",
      message_type: "template",
      content,
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

  const result = await sendTemplateMessage(
    account.credentials,
    contactPhone,
    templateName,
    languageCode,
    parameters,
  );

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
      { status: result.uncertain ? 202 : 502 },
    );
  }

  return jsonResponse({ message: updated }, { status: 201 });
}
