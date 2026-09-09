import "server-only";

import { serverEnv } from "@/lib/env";
import { toWhatsappRecipient } from "@/lib/phone";
import { countTemplateVariables } from "./template";

const GRAPH_BASE = "https://graph.facebook.com";

export interface WhatsappCredentials {
  phoneNumberId: string;
  accessToken: string;
}

export interface SendResult {
  uncertain?: boolean;
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

/**
 * Envia mídia por link.
 *
 * A Meta baixa o arquivo da URL informada — usamos uma URL assinada e de vida
 * curta do Supabase Storage. Assim o binário nunca atravessa a função
 * serverless, que na Vercel tem limite de poucos megabytes por requisição.
 */
export async function sendMediaMessage(
  credentials: WhatsappCredentials,
  toE164: string,
  kind: "image" | "video" | "audio" | "document",
  link: string,
  options: { caption?: string | null; filename?: string | null } = {},
): Promise<SendResult> {
  // Áudio não aceita legenda; documento aceita legenda e nome do arquivo.
  const media: Record<string, unknown> = { link };

  if (options.caption && kind !== "audio") media.caption = options.caption;
  if (options.filename && kind === "document") media.filename = options.filename;

  return postMessage(credentials, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toWhatsappRecipient(toE164),
    type: kind,
    [kind]: media,
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

/**
 * Cada tentativa faz um único POST. O client_ref é local ao CRM e não torna
 * a API da Meta idempotente; repetir após timeout pode duplicar a entrega.
 */
async function postMessage(
  credentials: WhatsappCredentials,
  payload: Record<string, unknown>,
): Promise<SendResult> {
  const uncertain = (): SendResult => ({
    uncertain: true,
    ok: false,
    providerMessageId: null,
    errorCode: "delivery_unknown",
    errorMessage: "Não foi possível confirmar a entrega. Confira a conversa antes de tentar enviar novamente.",
  });

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
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return uncertain();
  }

  const body: unknown = await response.json().catch(() => null);
  if (response.status >= 500 || response.status === 408) return uncertain();
  if (!response.ok) {
    const error = extractError(body, `HTTP ${response.status}`);
    return { ok: false, providerMessageId: null, errorCode: error.code, errorMessage: error.message };
  }

  // Recibo de leitura confirma a operação sem criar uma nova mensagem.
  if (payload.status === "read") {
    return { ok: true, providerMessageId: null, errorCode: null, errorMessage: null };
  }

  const id = (body as { messages?: { id?: unknown }[] } | null)?.messages?.[0]?.id;
  if (typeof id !== "string" || !id.trim()) return uncertain();
  return { ok: true, providerMessageId: id, errorCode: null, errorMessage: null };
}

export interface TemplateComponent {
  type?: string;
  text?: string;
  format?: string;
}

export interface MessageTemplate {
  name: string;
  language: string;
  category: string | null;
  bodyText: string | null;
  variableCount: number;
}

/** Templates aprovados da conta. Só os aprovados podem ser enviados. */
export async function listMessageTemplates(
  credentials: WhatsappCredentials,
  wabaId: string,
): Promise<MessageTemplate[]> {
  const response = await fetch(
    `${graphUrl(wabaId)}/message_templates?status=APPROVED&limit=100`,
    {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
      cache: "no-store",
    },
  );

  if (!response.ok) return [];

  const body = (await response.json().catch(() => null)) as {
    data?: {
      name?: string;
      language?: string;
      category?: string;
      components?: TemplateComponent[];
    }[];
  } | null;

  return (body?.data ?? [])
    .filter((template) => template.name && template.language)
    .map((template) => {
      const bodyText =
        template.components?.find((c) => c.type?.toUpperCase() === "BODY")?.text ?? null;

      return {
        name: template.name!,
        language: template.language!,
        category: template.category ?? null,
        bodyText,
        variableCount: countTemplateVariables(bodyText),
      };
    });
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
