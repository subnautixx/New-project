import "server-only";

import { serverEnv } from "@/lib/env";
import { toWhatsappRecipient } from "@/lib/phone";

const GRAPH_BASE = "https://graph.facebook.com";

export interface WhatsappCredentials {
  phoneNumberId: string;
  accessToken: string;
}

export interface SendResult {
  ok: boolean;
  providerMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

interface MetaApiError {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    error_data?: { details?: string };
    fbtrace_id?: string;
  };
}

function graphUrl(path: string): string {
  return `${GRAPH_BASE}/${serverEnv().META_GRAPH_API_VERSION}/${path}`;
}

function extractError(payload: unknown, fallback: string): { code: string; message: string } {
  const err = (payload as MetaApiError | null)?.error;
  return {
    code: err?.code !== undefined ? String(err.code) : "unknown",
    message: err?.error_data?.details ?? err?.message ?? fallback,
  };
}

/**
 * Envia uma mensagem de texto.
 *
 * Nunca chamado do navegador: o token de acesso vive apenas no servidor.
 * Falha da Meta não vira exceção — vira um SendResult com erro, para que a
 * rota consiga registrar `failed` na mensagem e mostrar o motivo na interface.
 */
export async function sendTextMessage(
  credentials: WhatsappCredentials,
  toE164: string,
  text: string,
): Promise<SendResult> {
  return postMessage(credentials, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toWhatsappRecipient(toE164),
    type: "text",
    text: { preview_url: false, body: text },
  });
}

/**
 * Envia um template aprovado — único caminho permitido pela Meta quando a
 * janela de 24h já expirou.
 */
export async function sendTemplateMessage(
  credentials: WhatsappCredentials,
  toE164: string,
  templateName: string,
  languageCode: string,
  bodyParameters: string[] = [],
): Promise<SendResult> {
  return postMessage(credentials, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toWhatsappRecipient(toE164),
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(bodyParameters.length > 0
        ? {
            components: [
              {
                type: "body",
                parameters: bodyParameters.map((t) => ({ type: "text", text: t })),
              },
            ],
          }
        : {}),
    },
  });
}

/** Marca a mensagem como lida no aparelho do cliente (duplo tique azul). */
export async function markMessageAsRead(
  credentials: WhatsappCredentials,
  providerMessageId: string,
): Promise<boolean> {
  const result = await postMessage(credentials, {
    messaging_product: "whatsapp",
    status: "read",
    message_id: providerMessageId,
  });
  return result.ok;
}

async function postMessage(
  credentials: WhatsappCredentials,
  payload: Record<string, unknown>,
): Promise<SendResult> {
  let response: Response;

  try {
    response = await fetch(graphUrl(`${credentials.phoneNumberId}/messages`), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch (error) {
    return {
      ok: false,
      providerMessageId: null,
      errorCode: "network_error",
      errorMessage: error instanceof Error ? error.message : "Falha de rede ao contatar a Meta",
    };
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const { code, message } = extractError(body, `HTTP ${response.status}`);
    return { ok: false, providerMessageId: null, errorCode: code, errorMessage: message };
  }

  const messageId = (body as { messages?: { id?: string }[] } | null)?.messages?.[0]?.id ?? null;

  return { ok: true, providerMessageId: messageId, errorCode: null, errorMessage: null };
}

/**
 * Resolve a URL temporária de uma mídia recebida.
 * A URL da Meta expira em minutos e exige o token — por isso o CRM serve a
 * mídia através de uma rota própria, autenticada, em vez de expor este link.
 */
export async function resolveMediaUrl(
  credentials: WhatsappCredentials,
  mediaId: string,
): Promise<{ url: string; mimeType: string | null } | null> {
  const response = await fetch(graphUrl(mediaId), {
    headers: { Authorization: `Bearer ${credentials.accessToken}` },
    cache: "no-store",
  });

  if (!response.ok) return null;

  const body = (await response.json().catch(() => null)) as {
    url?: string;
    mime_type?: string;
  } | null;

  if (!body?.url) return null;

  return { url: body.url, mimeType: body.mime_type ?? null };
}

/** Baixa o binário da mídia. O link da Meta só funciona com o token. */
export async function downloadMedia(
  credentials: WhatsappCredentials,
  url: string,
): Promise<Response | null> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${credentials.accessToken}` },
    cache: "no-store",
  });

  return response.ok ? response : null;
}
