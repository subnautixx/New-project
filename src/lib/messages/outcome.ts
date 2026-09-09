import type { SendResult } from "@/lib/whatsapp/client";
import { describeSendError } from "@/lib/whatsapp/errors";

/**
 * Colunas que a conversa precisa para decidir a política de reenvio.
 * `updated_at` é a versão da linha usada no reenvio (claim atômico), e
 * `provider_message_id`/`error_code` dizem se a recusa foi inequívoca.
 * Nada aqui é segredo: token e credenciais nunca saem do servidor.
 */
export const MESSAGE_SELECT =
  "id, direction, message_type, content, media_id, media_mime_type, media_filename, status, error_code, error_message, provider_message_id, sent_by_user_id, wa_timestamp, created_at, updated_at";

/** Envio sem resposta conclusiva: a mensagem pode ter chegado ao cliente. */
export const UNCERTAIN_MESSAGE =
  "Não foi possível confirmar o envio com o WhatsApp. Confira a conversa no aplicativo antes de enviar de novo.";

export interface PersistedOutcome {
  status: "sent" | "queued" | "failed";
  provider_message_id: string | null;
  error_code: string | null;
  error_message: string | null;
}

/**
 * Como gravar o resultado de UMA chamada à Meta.
 *
 * O ponto delicado é o meio-termo: resultado incerto NÃO vira `failed`. Se
 * virasse, a conversa ofereceria "tentar de novo" para algo que talvez já
 * tenha sido entregue — e o cliente receberia a mesma mensagem duas vezes.
 * Fica em `queued` com o motivo explicado. Sem id do provedor, a conciliação
 * automática por webhook pode não ser possível.
 */
export function persistedOutcome(result: SendResult): PersistedOutcome {
  if (result.ok) {
    return {
      status: "sent",
      provider_message_id: result.providerMessageId,
      error_code: null,
      error_message: null,
    };
  }

  if (result.uncertain) {
    return {
      status: "queued",
      provider_message_id: result.providerMessageId,
      error_code: result.errorCode,
      error_message: UNCERTAIN_MESSAGE,
    };
  }

  return {
    status: "failed",
    provider_message_id: null,
    error_code: result.errorCode,
    error_message: describeSendError(result.errorCode, result.errorMessage).message,
  };
}
