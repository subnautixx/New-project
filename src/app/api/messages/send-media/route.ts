import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeRequest } from "@/lib/auth/api";
const jsonResponse = NextResponse.json;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { nextStatusAfterOutbound } from "@/lib/domain/lead";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendMediaMessage } from "@/lib/whatsapp/client";
import { MEDIA_BUCKET, validateMedia } from "@/lib/whatsapp/media";
import { existingAttempt } from "@/lib/messages/deduplicate";
import { MESSAGE_SELECT, UNCERTAIN_MESSAGE, persistedOutcome } from "@/lib/messages/outcome";
import { authorizeConversationSend } from "@/lib/whatsapp/send-guard";

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
export async function POST(request: Request) {
  const auth = await authorizeRequest();
  if (!auth.ok) return auth.response;

  const { actor, supabase } = auth;

  const limit = rateLimit(`send:${actor.id}`, 30, 60_000);
  if (!limit.allowed) {
    return jsonResponse(
      { error: "rate_limited", message: "Muitas mensagens em pouco tempo. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonResponse({ error: "invalid_body" }, { status: 400 });
  }

  const { conversationId, path, mimeType, filename, caption, clientRef } = parsed.data;

  const validation = validateMedia(mimeType, 1);
  if (!validation.ok || !validation.kind || !validation.messageType) {
    return jsonResponse({ error: "invalid_media", message: validation.error }, { status: 422 });
  }

  const guard = await authorizeConversationSend(supabase, actor, conversationId);
  if (!guard.ok) return guard.response;

  const { contactPhone, contactStatus, contactId, account } = guard.context;

  // O caminho vem do cliente; amarrá-lo à conversa impede que alguém envie um
  // arquivo de outra conversa apenas trocando o valor no corpo da requisição.
  if (!path.startsWith(`outbound/${conversationId}/`)) {
    return jsonResponse({ error: "invalid_path" }, { status: 422 });
  }

  const admin = createSupabaseAdminClient();

  const existing = await existingAttempt(admin, clientRef, conversationId, actor.id);
  if (existing) return existing;

  const { data: signed, error: signError } = await admin.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed?.signedUrl) {
    return jsonResponse(
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
    .select(MESSAGE_SELECT)
    .single();

  if (insertError?.code === "23505") {
    const replay = await existingAttempt(admin, clientRef, conversationId, actor.id);
    return replay ?? jsonResponse({ error: "attempt_conflict" }, { status: 409 });
  }
  if (insertError || !message) {
    return jsonResponse({ error: "message_insert_failed" }, { status: 500 });
  }

  const result = await sendMediaMessage(
    account.credentials,
    contactPhone,
    validation.kind,
    signed.signedUrl,
    { caption, filename },
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

  const advanced = nextStatusAfterOutbound(contactStatus);
  if (advanced) {
    await admin.from("contacts").update({ status: advanced }).eq("id", contactId);
  }

  return jsonResponse({ message: updated }, { status: 201 });
}
