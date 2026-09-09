/**
 * Rascunho de TEXTO por usuário e por conversa.
 *
 * Guardamos em `sessionStorage`: o que a pessoa começou a escrever sobrevive a
 * trocar de conversa e a recarregar a página, mas não fica no computador depois
 * de fechar o navegador — é conversa de cliente, não vale persistir para sempre.
 *
 * Só texto. Arquivo anexado NUNCA entra aqui: binário não cabe em storage e
 * guardá-lo seria uma cópia silenciosa de mídia do cliente.
 */

const PREFIX = "inbox:draft";

/** Chave separada por usuário: dois atendentes no mesmo navegador não se misturam. */
export function draftKey(userId: string, conversationId: string): string {
  return `${PREFIX}:${userId}:${conversationId}`;
}

/**
 * `sessionStorage` pode simplesmente não existir (SSR) ou lançar (modo
 * privado, cota cheia, storage bloqueado). Nenhuma dessas situações pode
 * derrubar a inbox — rascunho é conveniência, não função essencial.
 */
function storage(): Storage | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

export function readDraft(userId: string, conversationId: string): string {
  const store = storage();
  if (!store) return "";
  try {
    return store.getItem(draftKey(userId, conversationId)) ?? "";
  } catch {
    return "";
  }
}

/** Texto vazio apaga a chave em vez de guardar string vazia. */
export function writeDraft(userId: string, conversationId: string, text: string): void {
  const store = storage();
  if (!store) return;
  try {
    if (text.length === 0) store.removeItem(draftKey(userId, conversationId));
    else store.setItem(draftKey(userId, conversationId), text);
  } catch {
    // Cota estourada: seguimos sem rascunho, sem quebrar o envio.
  }
}

export function clearDraft(userId: string, conversationId: string): void {
  writeDraft(userId, conversationId, "");
}

/**
 * Apaga o rascunho SÓ se ele ainda for exatamente o texto que foi enviado.
 *
 * Enquanto a mensagem viaja, a pessoa pode já ter começado a escrever a
 * próxima — e pode até ter trocado de conversa e voltado, com o componente
 * desmontado no meio. Comparar antes de apagar garante que a resposta atrasada
 * de um envio nunca leve embora o que foi digitado depois.
 *
 * Devolve `true` quando realmente apagou.
 */
export function clearDraftIf(
  userId: string,
  conversationId: string,
  expected: string,
): boolean {
  if (readDraft(userId, conversationId) !== expected) return false;
  writeDraft(userId, conversationId, "");
  return true;
}
