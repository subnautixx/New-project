import type { MessageDirection, MessageStatus } from "@/lib/types/database";
import { isUnambiguousRejection } from "./errors";

/**
 * Política central de reenvio manual — usada pelo botão na conversa E pela
 * rota do servidor, para que as duas nunca discordem.
 *
 * O POST de mensagens da Meta não tem chave de idempotência: se a resposta se
 * perdeu, não há como saber se o cliente recebeu. Por isso só oferecemos
 * reenvio quando a recusa é INEQUÍVOCA — token inválido, formato recusado,
 * limite, janela fechada, número inválido. Nesses casos a Meta respondeu "não
 * enviei", e repetir é seguro.
 *
 * Tudo o mais (queda de rede, tempo esgotado, erro 5xx, 2xx sem id da Meta, e
 * os registros antigos gravados com `network_error`/`unknown`) é ENTREGA
 * INCERTA: reenviar às cegas pode mandar a mesma mensagem duas vezes para o
 * cliente. Nesses casos explicamos o motivo e não oferecemos o botão.
 */

export interface RetryCandidate {
  message_type?: string;
  status: MessageStatus;
  direction: MessageDirection;
  error_code: string | null;
  provider_message_id: string | null;
}

export type RetryVerdict =
  | { retryable: true; reason: null }
  | { retryable: false; reason: string };

const RETRYABLE: RetryVerdict = { retryable: true, reason: null };

function no(reason: string): RetryVerdict {
  return { retryable: false, reason };
}

export function describeRetry(message: RetryCandidate): RetryVerdict {
  if (message.direction !== "outbound") {
    return no("Só mensagens enviadas por você podem ser reenviadas.");
  }

  if (message.status !== "failed") {
    return no("Esta mensagem não está marcada como falha.");
  }

  if (message.message_type && !["text", "image", "video", "audio", "document"].includes(message.message_type)) {
    return no(message.message_type === "template"
      ? "Use um modelo aprovado para enviar este conteúdo novamente."
      : "Este formato precisa ser enviado novamente pelo compositor.");
  }

  // A Meta devolveu um id: ela ACEITOU a mensagem em algum momento. Mesmo que
  // a gravação seguinte tenha falhado, reenviar duplicaria para o cliente.
  if (message.provider_message_id) {
    return no(
      "O WhatsApp chegou a aceitar esta mensagem, então não dá para saber se o cliente recebeu. Confira a conversa no aplicativo antes de escrever de novo.",
    );
  }

  if (isUnambiguousRejection(message.error_code)) return RETRYABLE;

  return no(
    "Não foi possível confirmar se esta mensagem chegou ao cliente. Para não enviar duas vezes, confira no aplicativo e, se precisar, escreva uma nova mensagem.",
  );
}

/** Atalho para a interface. */
export function canRetry(message: RetryCandidate): boolean {
  return describeRetry(message).retryable;
}
