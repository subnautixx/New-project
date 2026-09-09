import { z } from "zod";

import { authorizeRequest } from "@/lib/auth/api";
import { NextResponse } from "next/server";
const jsonResponse = NextResponse.json;
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendMediaMessage, sendTextMessage } from "@/lib/whatsapp/client";
import { MEDIA_BUCKET, resolveMediaKind } from "@/lib/whatsapp/media";
import { describeRetry } from "@/lib/whatsapp/retry-policy";
import { authorizeConversationSend } from "@/lib/whatsapp/send-guard";
import { MESSAGE_SELECT, persistedOutcome, UNCERTAIN_MESSAGE } from "./outcome";

/**
 * Reenvio manual de uma mensagem que falhou.
 *
 * Regras que sustentam este arquivo:
 *
 * - Reaproveita a MESMA linha e o MESMO `client_ref`. Uma segunda linha
 *   quebraria a deduplicação do envio original e sujaria o histórico.
 * - O conteúdo enviado é o que está SALVO no banco. Texto ou caminho de
 *   arquivo vindos do request seriam uma forma de mandar qualquer coisa para
 *   o cliente passando pela permissão de outra mensagem.
 * - O direito de reenviar é reconferido AGORA: dono da conversa, permissão no
 *   número e janela de 24 horas podem ter mudado desde a falha.
 * - O claim é atômico via `updated_at` (a trigger `messages_touch` já mantém
 *   essa coluna). Dois cliques, duas abas ou uma resposta perdida não
 *   conseguem disparar duas chamadas à Meta.
 * - No máximo UMA chamada à Meta por reenvio.
 */

const bodySchema = z.object({
  messageId: z.string().uuid(),
  /** Versão da linha que o navegador viu. É o que torna o claim atômico. */
  expectedUpdatedAt: z.string().min(1).max(64),
});

const RETRY_LIMIT = 10;
const RETRY_WINDOW_MS = 60_000;
const SIGNED_URL_TTL_SECONDS = 600;

/** Tipos que não têm como ser reenviados por esta rota. */
const UNSUPPORTED: Record<string, string> = {
  template: "Modelos aprovados não são reenviados por aqui — envie o modelo novamente.",
  sticker: "Figurinhas não podem ser reenviadas automaticamente. Envie a figurinha de novo.",
  system: "Esta mensagem foi gerada pelo sistema e não pode ser reenviada.",
  unsupported: "Este tipo de mensagem não pode ser reenviado.",
  location: "Localização não pode ser reenviada por aqui.",
  contacts: "Contato compartilhado não pode ser reenviado por aqui.",
};

export async function handleRetry(request: Request): Promise<Response> {
  const auth = await authorizeRequest();
  if (!auth.ok) return auth.response;

  const { actor, supabase } = auth;

  const limit = rateLimit(`retry:${actor.id}`, RETRY_LIMIT, RETRY_WINDOW_MS);
  if (!limit.allowed) {
    return jsonResponse(
      { error: "rate_limited", message: "Muitas tentativas em pouco tempo. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonResponse({ error: "invalid_body" }, { status: 400 });

  const { messageId, expectedUpdatedAt } = parsed.data;

  // Leitura pela SESSÃO: mensagem de conversa alheia simplesmente não existe.
  const { data: message, error: readError } = await supabase
    .from("messages")
    .select(
      "id, conversation_id, contact_id, direction, message_type, content, media_url, media_mime_type, media_filename, status, error_code, error_message, provider_message_id, updated_at",
    )
    .eq("id", messageId)
    .maybeSingle();

  if (readError) return jsonResponse({ error: "read_failed", message: "Não foi possível consultar a mensagem." }, { status: 503 });
  if (!message) return jsonResponse({ error: "message_not_found" }, { status: 404 });
  if (message.updated_at !== expectedUpdatedAt) {
    return jsonResponse({ error: "stale", message: "A mensagem mudou. Atualize a conversa antes de tentar novamente." }, { status: 409 });
  }
  if (message.message_type === "text" && (!message.content?.trim() || message.content.length > 4096)) {
    return jsonResponse({ error: "invalid_content", message: "O texto original não pode ser reenviado." }, { status: 422 });
  }

  const verdict = describeRetry(message);
  if (!verdict.retryable) {
    return jsonResponse({ error: "not_retryable", message: verdict.reason }, { status: 422 });
  }

  const impedimento = UNSUPPORTED[message.message_type];
  if (impedimento) {
    return jsonResponse({ error: "unsupported_type", message: impedimento }, { status: 422 });
  }

  // Janela, conta e permissões de AGORA. Janela fechada devolve a mesma
  // resposta do envio normal, que já aponta o caminho do modelo aprovado.
  const guard = await authorizeConversationSend(supabase, actor, message.conversation_id);
  if (!guard.ok) return guard.response;

  const { contactPhone, account } = guard.context;
  const admin = createSupabaseAdminClient();

  // Claim atômico: só uma requisição consegue tirar a linha de `failed` nesta
  // versão exata. Quem perder não fala com a Meta.
  const { data: claimed, error: claimError } = await admin
    .from("messages")
    .update({ status: "queued", error_code: null, error_message: null })
    .eq("id", message.id)
    .eq("status", "failed")
    .eq("updated_at", expectedUpdatedAt)
    .select(MESSAGE_SELECT)
    .maybeSingle();

  if (claimError) return jsonResponse({ error: "claim_failed", message: "Não foi possível iniciar a tentativa." }, { status: 503 });
  if (!claimed) {
    // Outra aba já reenviou, ou a tela está desatualizada. Devolve o estado
    // completo para o navegador mesclar por id — sem nenhuma chamada à Meta.
    const { data: atual } = await supabase
      .from("messages")
      .select(MESSAGE_SELECT)
      .eq("id", message.id)
      .maybeSingle();

    return jsonResponse(
      {
        error: "stale",
        message: "Esta mensagem já mudou de estado. A conversa foi atualizada.",
        messageRecord: atual,
      },
      { status: 409 },
    );
  }

  let link: string | null = null;

  if (message.message_type !== "text") {
    const path: string | null = message.media_url;

    // O caminho tem de ser o da própria conversa: sem isso, uma linha
    // adulterada no banco viraria leitura de arquivo de outra conversa.
    if (!path || !path.startsWith(`outbound/${message.conversation_id}/`)) {
      return await falhar(
        admin,
        message.id,
        claimed.updated_at,
        "media_missing",
        "O arquivo original não está mais disponível. Envie o arquivo de novo.",
      );
    }

    const { data: signed, error: signError } = await admin.storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    if (signError || !signed?.signedUrl) {
      return await falhar(
        admin,
        message.id,
        claimed.updated_at,
        "media_missing",
        "O arquivo original não está mais disponível. Envie o arquivo de novo.",
      );
    }

    link = signed.signedUrl;
  }

  // Daqui para baixo: no máximo UMA chamada à Meta. Nada de laço.
  let result;
  try {
    if (message.message_type === "text") {
      result = await sendTextMessage(account.credentials, contactPhone, message.content ?? "");
    } else {
      const kind = resolveMediaKind(message.media_mime_type ?? "");
      if (!kind) {
        return await falhar(
          admin,
          message.id,
          claimed.updated_at,
          "media_missing",
          "O formato deste arquivo não é mais aceito pelo WhatsApp.",
        );
      }
      result = await sendMediaMessage(account.credentials, contactPhone, kind, link!, {
        caption: message.content,
        filename: message.media_filename,
      });
    }
  } catch {
    // Exceção depois de disparar: a mensagem PODE ter chegado. A linha fica em
    // `queued` de propósito — devolver o claim aqui abriria a porta para um
    // segundo envio às cegas.
    return jsonResponse(
      { error: "send_uncertain", message: UNCERTAIN_MESSAGE, messageRecord: claimed },
      { status: 202 },
    );
  }

  const outcome = persistedOutcome(result);

  const { data: updated, error: updateError } = await admin
    .from("messages")
    .update(outcome)
    .eq("id", message.id)
    .eq("status", "queued")
    .eq("updated_at", claimed.updated_at)
    .select(MESSAGE_SELECT)
    .maybeSingle();

  if (updateError || !updated) {
    // A Meta pode ter aceitado e a gravação falhou: fica `queued`, nunca
    // `failed`. A conciliação depende de um id do provedor disponível.
    return jsonResponse(
      { error: "persist_failed", message: UNCERTAIN_MESSAGE, messageRecord: claimed },
      { status: 202 },
    );
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

  return jsonResponse({ message: updated }, { status: 200 });
}

/** Falha antes de falar com a Meta: devolve a linha a `failed` explicando. */
async function falhar(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  id: string,
  expectedUpdatedAt: string,
  code: string,
  texto: string,
): Promise<Response> {
  const { data: updated, error } = await admin
    .from("messages")
    .update({ status: "failed", error_code: code, error_message: texto })
    .eq("id", id)
    .eq("status", "queued")
    .eq("updated_at", expectedUpdatedAt)
    .select(MESSAGE_SELECT)
    .maybeSingle();

  if (error || !updated) return jsonResponse({ error: "persist_failed", message: UNCERTAIN_MESSAGE }, { status: 202 });
  return jsonResponse({ error: code, message: texto, messageRecord: updated }, { status: 422 });
}
