import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeRequest } from "@/lib/auth/api";
import { nextStatusAfterOutbound } from "@/lib/domain/lead";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendMediaMessage } from "@/lib/whatsapp/client";
import { describeSendError } from "@/lib/whatsapp/errors";
import { MEDIA_BUCKET, validateMedia } from "@/lib/whatsapp/media";
import { authorizeConversationSend } from "@/lib/whatsapp/send-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  path: z.string().trim().min(1).max(400),
  mimeType: z.string().trim().min(3).max(120),
  filename: z.string().trim().min(1).max(255),
  caption: z.string().trim().max(1024).optional(),
  clientRef: z.string().uuid(),
});

/** Tempo de vida do link que a Meta usa para buscar o arquivo. */
const SIGNED_URL_TTL_SECONDS = 600;

/**
 * Envia uma mídia já presente no Storage.
 *
 * A Meta baixa o arquivo por uma URL assinada de vida curta — nunca uma URL
 * pública. O caminho no bucket fica em `media_url`, então o histórico continua
 * legível mesmo depois que a cópia da Meta expirar.
 */
export async function POST(request: NextRequest) {
  const auth = await authorizeRequest();
  if (!auth.ok) return auth.response;

  const { actor, supabase } = auth;

  const limit = rateLimit(`send:${actor.id}`, 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Muitas mensagens em pouco tempo. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { conversationId, path, mimeType, filename, caption, clientRef } = parsed.data;

  const validation = validateMedia(mimeType, 1);
  if (!validation.ok || !validation.kind || !validation.messageType) {
    return NextResponse.json({ error: "invalid_media", message: validation.error }, { status: 422 });
  }

  const guard = await authorizeConversationSend(supabase, actor, conversationId);
  if (!guard.ok) return guard.response;

  const { contactPhone, contactStatus, contactId, account } = guard.context;

  // O caminho vem do cliente; amarrá-lo à conversa impede que alguém envie um
  // arquivo de outra conversa apenas trocando o valor no corpo da requisição.
  if (!path.startsWith(`outbound/${conversationId}/`)) {
    return NextResponse.json({ error: "invalid_path" }, { status: 422 });
  }

  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from("messages")
    .select("id, status, provider_message_id")
    .eq("client_ref", clientRef)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ message: existing, deduplicated: true }, { status: 200 });
  }

  const { data: signed, error: signError } = await admin.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed?.signedUrl) {
    return NextResponse.json(
      { error: "media_not_found", message: "Arquivo não encontrado no armazenamento." },
      { status: 404 },
    );
  }

  const { data: message, error: insertError } = await admin
    .from("messages")
    .insert({
      conversation_id: conversationId,
      whatsapp_account_id: account.account.id,
      contact_id: contactId,
      direction: "outbound",
      message_type: validation.messageType,
      content: caption ?? null,
      media_url: path,
      media_mime_type: mimeType,
      media_filename: filename,
      sent_by_user_id: actor.id,
      status: "queued",
      client_ref: clientRef,
    })
    .select("id")
    .single();

  if (insertError || !message) {
    return NextResponse.json({ error: "message_insert_failed" }, { status: 500 });
  }

  const result = await sendMediaMessage(
    account.credentials,
    contactPhone,
    validation.kind,
    signed.signedUrl,
    { caption, filename },
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

  const advanced = nextStatusAfterOutbound(contactStatus);
  if (advanced) {
    await admin.from("contacts").update({ status: advanced }).eq("id", contactId);
  }

  return NextResponse.json({ message: updated }, { status: 201 });
}
