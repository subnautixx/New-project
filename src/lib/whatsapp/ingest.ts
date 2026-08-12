import "server-only";

import { nextStatusAfterInbound } from "@/lib/domain/lead";
import { normalizePhone, phoneVariants } from "@/lib/phone";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/types/database";
import { getAccountByPhoneNumberId } from "./accounts";
import type { ParsedInboundMessage, ParsedStatusUpdate } from "./parse";
import { shouldApplyStatus } from "./status";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Reserva o evento antes de processar.
 *
 * A Meta reentrega webhooks quando não recebe 200 rápido o suficiente, então o
 * mesmo evento chega várias vezes. O índice único em (provider, event_key)
 * transforma a segunda tentativa em conflito, e quem perdeu a corrida sai fora.
 */
export async function claimWebhookEvent(
  admin: Admin,
  eventKey: string,
  payload: Json,
  signatureValid: boolean,
): Promise<boolean> {
  const { error } = await admin
    .from("webhook_events")
    .insert({ provider: "meta", event_key: eventKey, payload, signature_valid: signatureValid });

  if (!error) return true;

  // 23505 = unique_violation: já processado (ou em processamento).
  if (error.code === "23505") return false;

  throw new Error(`Falha ao registrar webhook_event: ${error.message}`);
}

/**
 * Libera a reserva quando o processamento falha de forma inesperada.
 * Sem isto, a reentrega da Meta seria descartada como duplicata e o evento
 * se perderia para sempre.
 */
export async function releaseWebhookEvent(admin: Admin, eventKey: string): Promise<void> {
  await admin
    .from("webhook_events")
    .delete()
    .eq("provider", "meta")
    .eq("event_key", eventKey)
    .is("processed_at", null);
}

async function finishWebhookEvent(admin: Admin, eventKey: string, errorMessage?: string) {
  await admin
    .from("webhook_events")
    .update({ processed_at: new Date().toISOString(), error: errorMessage ?? null })
    .eq("provider", "meta")
    .eq("event_key", eventKey);
}

/** Responsável padrão para uma conversa que chega de um número desconhecido. */
async function resolveDefaultOwner(
  admin: Admin,
  accountDefaultOwner: string | null,
): Promise<string | null> {
  if (accountDefaultOwner) return accountDefaultOwner;

  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
}

export interface IngestOutcome {
  status: "processed" | "skipped";
  reason?: string;
}

/**
 * Grava uma mensagem recebida e mantém contato/conversa coerentes.
 * As atualizações derivadas (última mensagem, não lidas, activity_events)
 * são feitas por trigger no banco, para valerem também fora desta rota.
 */
export async function processInboundMessage(
  admin: Admin,
  event: ParsedInboundMessage,
): Promise<IngestOutcome> {
  const resolved = await getAccountByPhoneNumberId(event.phoneNumberId);

  if (!resolved) {
    await finishWebhookEvent(
      admin,
      event.eventKey,
      `Número não cadastrado no CRM: phone_number_id=${event.phoneNumberId}`,
    );
    return { status: "skipped", reason: "unknown_account" };
  }

  const { account } = resolved;
  const phone = normalizePhone(`+${event.waId}`) ?? `+${event.waId}`;

  // Casa contatos salvos com e sem o nono dígito.
  const { data: existing } = await admin
    .from("contacts")
    .select("id, owner_user_id, status, full_name")
    .in("phone_e164", phoneVariants(phone))
    .limit(1)
    .maybeSingle();

  let contactId: string;
  let ownerId: string;
  let currentStatus = existing?.status ?? "novo";

  if (existing) {
    contactId = existing.id;
    ownerId = existing.owner_user_id;
  } else {
    const owner = await resolveDefaultOwner(admin, account.default_owner_user_id);

    if (!owner) {
      await finishWebhookEvent(
        admin,
        event.eventKey,
        "Sem responsável padrão para atribuir o novo contato",
      );
      return { status: "skipped", reason: "no_default_owner" };
    }

    const { data: created, error } = await admin
      .from("contacts")
      .insert({
        full_name: event.profileName?.trim() || phone,
        phone_e164: phone,
        phone_raw: event.waId,
        owner_user_id: owner,
        status: "novo",
      })
      .select("id, owner_user_id, status")
      .single();

    if (error || !created) {
      await finishWebhookEvent(admin, event.eventKey, `Falha ao criar contato: ${error?.message}`);
      return { status: "skipped", reason: "contact_insert_failed" };
    }

    contactId = created.id;
    ownerId = created.owner_user_id;
    currentStatus = created.status;
  }

  // Busca antes de criar, em vez de upsert: um upsert reescreveria
  // `assigned_user_id` a cada mensagem recebida e desfaria silenciosamente uma
  // transferência feita só na conversa.
  const { data: found } = await admin
    .from("conversations")
    .select("id")
    .eq("contact_id", contactId)
    .eq("whatsapp_account_id", account.id)
    .maybeSingle();

  let conversationId = found?.id ?? null;

  if (!conversationId) {
    const { data: created, error: convError } = await admin
      .from("conversations")
      .insert({
        contact_id: contactId,
        whatsapp_account_id: account.id,
        assigned_user_id: ownerId,
      })
      .select("id")
      .single();

    if (convError || !created) {
      // Corrida com outra entrega do mesmo webhook: alguém já criou.
      const { data: raced } = await admin
        .from("conversations")
        .select("id")
        .eq("contact_id", contactId)
        .eq("whatsapp_account_id", account.id)
        .maybeSingle();

      if (!raced) {
        await finishWebhookEvent(admin, event.eventKey, `Falha na conversa: ${convError?.message}`);
        return { status: "skipped", reason: "conversation_failed" };
      }

      conversationId = raced.id;
    } else {
      conversationId = created.id;
    }
  }

  const { error: messageError } = await admin.from("messages").insert({
    provider_message_id: event.providerMessageId,
    conversation_id: conversationId,
    whatsapp_account_id: account.id,
    contact_id: contactId,
    direction: "inbound",
    message_type: event.messageType,
    content: event.content,
    media_id: event.mediaId,
    media_mime_type: event.mediaMimeType,
    media_filename: event.mediaFilename,
    status: "received",
    wa_timestamp: event.timestamp,
  });

  if (messageError) {
    // Corrida com outra entrega do mesmo webhook: a mensagem já existe.
    const duplicate = messageError.code === "23505";
    await finishWebhookEvent(admin, event.eventKey, duplicate ? undefined : messageError.message);
    return duplicate
      ? { status: "skipped", reason: "duplicate_message" }
      : { status: "skipped", reason: "message_insert_failed" };
  }

  // Cliente respondeu: o funil anda sozinho até "respondeu", e só até aí.
  const advanced = nextStatusAfterInbound(currentStatus);
  if (advanced) {
    await admin.from("contacts").update({ status: advanced }).eq("id", contactId);
  }

  await finishWebhookEvent(admin, event.eventKey);
  return { status: "processed" };
}

/** Aplica sent / delivered / read / failed a uma mensagem já enviada. */
export async function processStatusUpdate(
  admin: Admin,
  event: ParsedStatusUpdate,
): Promise<IngestOutcome> {
  const { data: message } = await admin
    .from("messages")
    .select("id, status, conversation_id")
    .eq("provider_message_id", event.providerMessageId)
    .maybeSingle();

  if (!message) {
    // Status de uma mensagem que o CRM não enviou (ex.: mandada pelo celular
    // no modo de coexistência). Guardamos o evento e seguimos.
    await finishWebhookEvent(admin, event.eventKey, "Mensagem não encontrada no CRM");
    return { status: "skipped", reason: "unknown_message" };
  }

  const { error: eventError } = await admin.from("message_events").insert({
    message_id: message.id,
    status: event.status,
    occurred_at: event.timestamp,
    raw: {
      errorCode: event.errorCode,
      errorMessage: event.errorMessage,
    } as Json,
  });

  if (eventError && eventError.code !== "23505") {
    await finishWebhookEvent(admin, event.eventKey, eventError.message);
    return { status: "skipped", reason: "event_insert_failed" };
  }

  if (shouldApplyStatus(message.status, event.status)) {
    await admin
      .from("messages")
      .update({
        status: event.status,
        error_code: event.errorCode,
        error_message: event.errorMessage,
      })
      .eq("id", message.id);
  }

  if (event.serviceWindowExpiresAt) {
    await admin
      .from("conversations")
      .update({ service_window_expires_at: event.serviceWindowExpiresAt })
      .eq("id", message.conversation_id);
  }

  await finishWebhookEvent(admin, event.eventKey);
  return { status: "processed" };
}
