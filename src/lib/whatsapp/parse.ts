import type { MessageStatus, MessageType } from "@/lib/types/database";
import type { MetaMediaPayload, MetaMessage, MetaStatus, MetaWebhookBody } from "./types";

export interface ParsedInboundMessage {
  kind: "message";
  /** Chave de idempotência: o id da mensagem já é único na Meta. */
  eventKey: string;
  phoneNumberId: string;
  waId: string;
  profileName: string | null;
  providerMessageId: string;
  timestamp: string;
  messageType: MessageType;
  content: string | null;
  mediaId: string | null;
  mediaMimeType: string | null;
  mediaFilename: string | null;
  contextMessageId: string | null;
}

export interface ParsedStatusUpdate {
  kind: "status";
  /** A mesma mensagem gera vários eventos; a chave inclui o status. */
  eventKey: string;
  phoneNumberId: string;
  providerMessageId: string;
  status: MessageStatus;
  timestamp: string;
  errorCode: string | null;
  errorMessage: string | null;
  serviceWindowExpiresAt: string | null;
}

export type ParsedEvent = ParsedInboundMessage | ParsedStatusUpdate;

const MESSAGE_TYPE_MAP: Record<string, MessageType> = {
  text: "text",
  image: "image",
  audio: "audio",
  video: "video",
  document: "document",
  sticker: "sticker",
  location: "location",
  contacts: "contacts",
  button: "text",
  interactive: "text",
  template: "template",
  system: "system",
};

const STATUS_MAP: Record<string, MessageStatus> = {
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "failed",
  deleted: "deleted",
};

/** Timestamps da Meta vêm em segundos, como string. */
function toIso(timestamp: string | undefined): string {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return new Date().toISOString();
  return new Date(seconds * 1000).toISOString();
}

function mediaOf(message: MetaMessage): MetaMediaPayload | null {
  return (
    message.image ?? message.audio ?? message.video ?? message.document ?? message.sticker ?? null
  );
}

/** Texto legível para tipos que não são texto puro (usado na prévia da lista). */
function contentOf(message: MetaMessage, type: MessageType): string | null {
  if (type === "text") {
    return (
      message.text?.body ??
      message.button?.text ??
      message.interactive?.button_reply?.title ??
      message.interactive?.list_reply?.title ??
      null
    );
  }

  if (type === "location") {
    const loc = message.location;
    if (!loc) return null;
    return loc.name ?? loc.address ?? `${loc.latitude ?? "?"}, ${loc.longitude ?? "?"}`;
  }

  // Legenda de imagem/vídeo/documento.
  return mediaOf(message)?.caption ?? null;
}

function parseMessage(
  message: MetaMessage,
  phoneNumberId: string,
  profileNames: Map<string, string>,
): ParsedInboundMessage | null {
  if (!message.id || !message.from) return null;

  const type = MESSAGE_TYPE_MAP[message.type ?? ""] ?? "unsupported";
  const media = mediaOf(message);

  return {
    kind: "message",
    eventKey: message.id,
    phoneNumberId,
    waId: message.from,
    profileName: profileNames.get(message.from) ?? null,
    providerMessageId: message.id,
    timestamp: toIso(message.timestamp),
    messageType: type,
    content: contentOf(message, type),
    mediaId: media?.id ?? null,
    mediaMimeType: media?.mime_type ?? null,
    mediaFilename: media?.filename ?? null,
    contextMessageId: message.context?.id ?? null,
  };
}

function parseStatus(status: MetaStatus, phoneNumberId: string): ParsedStatusUpdate | null {
  if (!status.id || !status.status) return null;

  const mapped = STATUS_MAP[status.status];
  if (!mapped) return null;

  const error = status.errors?.[0];

  return {
    kind: "status",
    eventKey: `${status.id}:${mapped}`,
    phoneNumberId,
    providerMessageId: status.id,
    status: mapped,
    timestamp: toIso(status.timestamp),
    errorCode: error?.code !== undefined ? String(error.code) : null,
    errorMessage: error?.message ?? error?.title ?? error?.error_data?.details ?? null,
    serviceWindowExpiresAt: status.conversation?.expiration_timestamp
      ? toIso(status.conversation.expiration_timestamp)
      : null,
  };
}

/**
 * Achata o payload da Meta numa lista de eventos normalizados.
 * Nunca lança: um payload estranho vira lista vazia, e o webhook responde 200
 * para a Meta não ficar reenviando algo que jamais será processado.
 */
export function parseWebhook(body: MetaWebhookBody | null | undefined): ParsedEvent[] {
  const events: ParsedEvent[] = [];

  for (const entry of body?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const profileNames = new Map<string, string>();
      for (const contact of value?.contacts ?? []) {
        if (contact.wa_id && contact.profile?.name) {
          profileNames.set(contact.wa_id, contact.profile.name);
        }
      }

      for (const message of value?.messages ?? []) {
        const parsed = parseMessage(message, phoneNumberId, profileNames);
        if (parsed) events.push(parsed);
      }

      for (const status of value?.statuses ?? []) {
        const parsed = parseStatus(status, phoneNumberId);
        if (parsed) events.push(parsed);
      }
    }
  }

  return events;
}
