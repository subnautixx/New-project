import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeRequest } from "@/lib/auth/api";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendTemplateMessage } from "@/lib/whatsapp/client";
import { describeSendError } from "@/lib/whatsapp/errors";
import { renderTemplateBody } from "@/lib/whatsapp/template";
import { authorizeConversationSend } from "@/lib/whatsapp/send-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
export async function POST(request: NextRequest) {
  const auth = await authorizeRequest();
  if (!auth.ok) return auth.response;

  const { actor, supabase } = auth;

  const limit = rateLimit(`template:${actor.id}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "Muitos templates em pouco tempo. Aguarde antes de reabrir outra conversa.",
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { conversationId, templateName, languageCode, parameters, bodyText, clientRef } =
    parsed.data;

  const guard = await authorizeConversationSend(supabase, actor, conversationId, {
    allowOutsideWindow: true,
  });
  if (!guard.ok) return guard.response;

  const { contactPhone, contactId, account } = guard.context;
  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from("messages")
    .select("id, status, provider_message_id")
    .eq("client_ref", clientRef)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ message: existing, deduplicated: true }, { status: 200 });
  }

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
    .select("id")
    .single();

  if (insertError || !message) {
    return NextResponse.json({ error: "message_insert_failed" }, { status: 500 });
  }

  const result = await sendTemplateMessage(
    account.credentials,
    contactPhone,
    templateName,
    languageCode,
    parameters,
  );

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

  return NextResponse.json({ message: updated }, { status: 201 });
}
