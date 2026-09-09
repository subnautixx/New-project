import type { ThreadMessage } from "@/lib/types/views";

/**
 * Paginação do histórico da conversa.
 *
 * O cursor é o par (`created_at`, `id`), não o deslocamento: mensagem nova
 * chegando durante a leitura empurraria um `offset` e faria pular ou repetir
 * linhas. Com o par, a próxima página é sempre "o que vem antes desta mensagem",
 * independente do que chegou depois.
 */

export interface HistoryCursor {
  createdAt: string;
  id: string;
}

/** Mensagem mais antiga já carregada — é dela que sai a próxima página. */
export function oldestCursor(messages: ThreadMessage[]): HistoryCursor | null {
  const first = messages[0];
  if (!first) return null;
  return { createdAt: first.created_at, id: first.id };
}

/**
 * Filtro PostgREST para "estritamente antes do cursor", com desempate por id:
 * mensagens gravadas no mesmo instante não somem nem se repetem.
 */
export function olderThanFilter(cursor: HistoryCursor): string {
  return `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`;
}

function compare(a: ThreadMessage, b: ThreadMessage): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Junta o que já está na tela com o que acabou de chegar, por `id`.
 *
 * Vale para os três casos: página antiga acrescentada no começo, mensagem nova
 * do realtime no fim e atualização de status de uma mensagem já visível — nesse
 * último a versão nova substitui a antiga, sem duplicar e sem descartar as
 * páginas já carregadas.
 */
export function mergeMessages(
  current: ThreadMessage[],
  incoming: ThreadMessage[],
): ThreadMessage[] {
  const byId = new Map<string, ThreadMessage>();
  for (const message of current) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(compare);
}
