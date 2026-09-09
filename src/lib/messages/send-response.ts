import type { ThreadMessage } from "@/lib/types/views";

export interface SendResponse {
  message?: ThreadMessage | string;
  messageRecord?: ThreadMessage | null;
  error?: string;
}

export function readSendResponse(status: number, payload: SendResponse | null) {
  const record = payload?.messageRecord ??
    (payload?.message && typeof payload.message !== "string" ? payload.message : null);
  const confirmed = status >= 200 && status < 300 && status !== 202 &&
    Boolean(record && ["sent", "delivered", "read"].includes(record.status));
  const uncertain = status === 202 || record?.status === "queued" ||
    (status >= 200 && status < 300 && !confirmed);
  return {
    record,
    confirmed,
    uncertain,
    notice: typeof payload?.message === "string" ? payload.message :
      uncertain ? "Envio não confirmado. Confira o histórico antes de enviar novamente." :
      "Não foi possível enviar. Tente novamente.",
  };
}

/** Survives remount/reload in this tab so a lost response keeps its clientRef. */
export function attemptKey(user: string, conversation: string, signature: string) {
  return `inbox-attempt:${user}:${conversation}:${signature}`;
}

export interface SendAttempt { clientRef: string; path?: string }
const memory = new Map<string, SendAttempt>();
export function readAttempt(key: string): SendAttempt {
  const known = memory.get(key);
  if (known) return known;
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const saved = JSON.parse(raw) as SendAttempt;
      if (typeof saved.clientRef === "string") { memory.set(key, saved); return saved; }
    }
  } catch { /* Storage can be unavailable in private browsing. */ }
  const created = { clientRef: crypto.randomUUID() };
  saveAttempt(key, created);
  return created;
}
export function saveAttempt(key: string, attempt: SendAttempt) {
  memory.set(key, attempt);
  try { sessionStorage.setItem(key, JSON.stringify(attempt)); } catch { /* memory fallback */ }
}
export function clearAttempt(key: string) {
  memory.delete(key);
  try { sessionStorage.removeItem(key); } catch { /* memory fallback */ }
}
