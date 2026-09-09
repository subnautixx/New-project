import type { ConversationListItem, ThreadMessage } from "@/lib/types/views";

/**
 * Fixtures dos testes de componente.
 *
 * Tudo aqui é inventado: nenhuma conversa, número ou janela de atendimento
 * real é tocada pelos testes.
 */

/** Janela ABERTA fictícia: uma hora à frente do relógio do teste. */
export function janelaAberta(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

export function conversaFake(overrides: Partial<ConversationListItem> = {}): ConversationListItem {
  return {
    id: "conv-1",
    last_message_at: "2026-01-01T10:00:00.000Z",
    last_message_preview: "Olá",
    unread_count: 0,
    assigned_user_id: "user-1",
    whatsapp_account_id: "acc-1",
    service_window_expires_at: janelaAberta(),
    contact: {
      id: "contact-1",
      full_name: "Cliente de Teste",
      phone_e164: "+5511900000000",
      status: "novo",
      photo_path: null,
    } as ConversationListItem["contact"],
    vehicle: null,
    assignee: { id: "user-1", full_name: "Atendente" },
    account: {
      id: "acc-1",
      display_name: "Número de teste",
      phone_e164: "+5511900000001",
      mode: "individual",
    },
    ...overrides,
  };
}

export function mensagemFake(overrides: Partial<ThreadMessage> = {}): ThreadMessage {
  return {
    id: "msg-1",
    direction: "inbound",
    message_type: "text",
    content: "Mensagem de teste",
    media_id: null,
    media_mime_type: null,
    media_filename: null,
    status: "delivered",
    error_message: null,
    error_code: null,
    provider_message_id: null,
    sent_by_user_id: null,
    wa_timestamp: "2026-01-01T10:00:00.000Z",
    created_at: "2026-01-01T10:00:00.000Z",
    updated_at: "2026-01-01T10:00:00.000Z",
    ...overrides,
  } as ThreadMessage;
}

export function arquivoFake(nome: string, tipo = "image/jpeg", bytes = 1024): File {
  return new File([new Uint8Array(bytes)], nome, { type: tipo });
}

/** Promessa que o teste resolve na hora que quiser — simula rede lenta. */
export function adiada<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
