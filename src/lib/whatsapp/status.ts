import type { MessageStatus } from "@/lib/types/database";

/**
 * Webhooks da Meta chegam fora de ordem: `read` pode aterrissar antes de
 * `delivered`. Só avançamos o status da mensagem, nunca regredimos — senão a
 * interface fica piscando entre dois tiques e um tique.
 */
const RANK: Record<MessageStatus, number> = {
  queued: 0,
  sent: 1,
  received: 1,
  delivered: 2,
  read: 3,
  failed: 4,
  deleted: 5,
};

export function statusRank(status: MessageStatus): number {
  return RANK[status];
}

export function shouldApplyStatus(current: MessageStatus, incoming: MessageStatus): boolean {
  // Uma falha reportada pela Meta é definitiva e sempre prevalece.
  if (incoming === "failed") return current !== "failed";
  if (current === "failed") return false;

  return statusRank(incoming) > statusRank(current);
}

const LABEL: Record<MessageStatus, string> = {
  queued: "Enviando",
  sent: "Enviada",
  received: "Recebida",
  delivered: "Entregue",
  read: "Lida",
  failed: "Falhou",
  deleted: "Apagada",
};

export function statusLabel(status: MessageStatus): string {
  return LABEL[status];
}
