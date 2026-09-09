import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Rota de reenvio manual, com tudo fingido: nenhuma mensagem real sai, nenhum
 * banco é tocado. O que se testa aqui é a ordem das travas — permissão,
 * janela, claim atômico e UMA chamada à Meta.
 */

const authorizeRequest = vi.fn();
const authorizeConversationSend = vi.fn();
const sendTextMessage = vi.fn();
const sendMediaMessage = vi.fn();
const rateLimit = vi.fn(() => ({ allowed: true, remaining: 9, retryAfterSeconds: 0 }));

vi.mock("@/lib/auth/api", () => ({ authorizeRequest: () => authorizeRequest() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => rateLimit() }));
vi.mock("@/lib/whatsapp/send-guard", () => ({
  authorizeConversationSend: () => authorizeConversationSend(),
}));
vi.mock("@/lib/whatsapp/client", () => ({
  sendTextMessage: (...args: unknown[]) => sendTextMessage(...args),
  sendMediaMessage: (...args: unknown[]) => sendMediaMessage(...args),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => admin }));

interface Filtros {
  [coluna: string]: string;
}

/** Cada atualização feita pela rota, para conferir o que foi gravado. */
let updates: { valores: Record<string, unknown>; filtros: Filtros }[] = [];
/** Resposta do claim (`update ... eq status failed eq updated_at`). */
let claimDevolve: unknown = null;
let signedUrl: { data: { signedUrl: string } | null; error: unknown } = {
  data: { signedUrl: "https://storage.exemplo/assinada" },
  error: null,
};
let persistErro: unknown = null;

/** Trocável nos testes de corrida; restaurado a cada teste. */
let fromImpl: () => Record<string, unknown>;

const fromPadrao = () => {
    const filtros: Filtros = {};
    let valores: Record<string, unknown> = {};
    const q: Record<string, unknown> = {
      update: (v: Record<string, unknown>) => {
        valores = v;
        return q;
      },
      eq: (coluna: string, valor: string) => {
        filtros[coluna] = valor;
        return q;
      },
      select: () => q,
      maybeSingle: async () => {
        updates.push({ valores, filtros });
        const ehClaim = filtros['status'] === "failed";
        if (ehClaim) {
          return { data: claimDevolve, error: null };
        }
        if (persistErro) return { data: null, error: persistErro };
        return { data: { id: "msg-1", ...valores }, error: null };
      },
    };
    return q;
};

const admin = {
  from: () => fromImpl(),
  storage: {
    from: () => ({ createSignedUrl: async () => signedUrl }),
  },
};

/** Mensagem lida pela sessão (RLS). */
let mensagem: Record<string, unknown> | null = null;
let estadoAtual: Record<string, unknown> | null = null;

const sessionClient = {
  from: () => {
    // A releitura do estado atual (caminho "stale") pede outras colunas que a
    // leitura inicial — é assim que o fingido distingue as duas.
    let colunas = "";
    const q: Record<string, unknown> = {
      select: (c: string) => {
        colunas = c;
        return q;
      },
      eq: () => q,
      maybeSingle: async () => ({
        data: mensagem === null ? null : colunas.includes("conversation_id") ? mensagem : estadoAtual,
        error: null,
      }),
    };
    return q;
  },
};

import { handleRetry } from "./retry";

function pedido(body: unknown = { messageId: crypto.randomUUID(), expectedUpdatedAt: "v1" }) {
  return new Request("http://localhost/api/messages/retry", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function mensagemFalha(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-1",
    conversation_id: "conv-1",
    contact_id: "contact-1",
    direction: "outbound",
    message_type: "text",
    content: "Bom dia!",
    media_url: null,
    media_mime_type: null,
    media_filename: null,
    status: "failed",
    error_code: "131053",
    error_message: "recusado",
    provider_message_id: null,
    updated_at: "v1",
    ...overrides,
  };
}

beforeEach(() => {
  fromImpl = fromPadrao;
  updates = [];
  persistErro = null;
  signedUrl = { data: { signedUrl: "https://storage.exemplo/assinada" }, error: null };
  mensagem = mensagemFalha();
  estadoAtual = { id: "msg-1", status: "sent" };
  claimDevolve = { id: "msg-1", status: "queued", updated_at: "v2" };
  sendTextMessage.mockReset().mockResolvedValue({
    ok: true,
    providerMessageId: "wamid.1",
    errorCode: null,
    errorMessage: null,
    uncertain: false,
  });
  sendMediaMessage.mockReset().mockResolvedValue({
    ok: true,
    providerMessageId: "wamid.2",
    errorCode: null,
    errorMessage: null,
    uncertain: false,
  });
  rateLimit.mockReturnValue({ allowed: true, remaining: 9, retryAfterSeconds: 0 });
  authorizeRequest.mockResolvedValue({
    ok: true,
    actor: { id: "user-1", full_name: "Atendente", role: "consignador" },
    supabase: sessionClient,
  });
  authorizeConversationSend.mockResolvedValue({
    ok: true,
    context: {
      conversationId: "conv-1",
      contactId: "contact-1",
      contactPhone: "+5511900000000",
      contactStatus: "contatado",
      account: { account: { id: "acc-1" }, credentials: { phoneNumberId: "1", accessToken: "t" } },
    },
  });
});

describe("handleRetry", () => {
  it("recusa a versão divergente antes de adquirir o claim", async () => {
    const response = await handleRetry(pedido({ messageId: crypto.randomUUID(), expectedUpdatedAt: "v0" }));
    expect(response.status).toBe(409);
    expect(updates).toHaveLength(0);
    expect(sendTextMessage).not.toHaveBeenCalled();
  });

  it("a conclusão exige a versão obtida pelo claim para não sobrescrever webhook", async () => {
    await handleRetry(pedido());
    expect(updates[1]?.filtros).toMatchObject({ status: "queued", updated_at: "v2" });
  });
  it("reenvia o texto SALVO, uma única vez, e marca como enviada", async () => {
    const response = await handleRetry(pedido());

    expect(response.status).toBe(200);
    expect(sendTextMessage).toHaveBeenCalledTimes(1);
    expect(sendTextMessage.mock.calls[0]?.[2]).toBe("Bom dia!");
    // O claim exige status failed E a versão exata da linha.
    expect(updates[0]?.filtros).toMatchObject({ status: "failed", updated_at: "v1" });
    expect(updates[0]?.valores).toMatchObject({ status: "queued" });
    expect(updates[1]?.valores).toMatchObject({ status: "sent", provider_message_id: "wamid.1" });
  });

  it("mensagem invisível pela RLS responde 404 sem falar com a Meta", async () => {
    mensagem = null;
    const response = await handleRetry(pedido());

    expect(response.status).toBe(404);
    expect(sendTextMessage).not.toHaveBeenCalled();
  });

  it("sem permissão na conversa, devolve a resposta do guard", async () => {
    authorizeConversationSend.mockResolvedValue({
      ok: false,
      response: new Response("forbidden", { status: 403 }),
    });

    const response = await handleRetry(pedido());
    expect(response.status).toBe(403);
    expect(sendTextMessage).not.toHaveBeenCalled();
  });

  it("janela fechada devolve o caminho do modelo aprovado", async () => {
    authorizeConversationSend.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "service_window_expired" }), { status: 422 }),
    });

    const response = await handleRetry(pedido());
    expect(response.status).toBe(422);
    expect(await response.text()).toContain("service_window_expired");
    expect(sendTextMessage).not.toHaveBeenCalled();
  });

  it("entrega incerta não é reenviável nem chega ao claim", async () => {
    mensagem = mensagemFalha({ error_code: "network_error" });

    const response = await handleRetry(pedido());
    expect(response.status).toBe(422);
    expect(updates).toHaveLength(0);
    expect(sendTextMessage).not.toHaveBeenCalled();
  });

  it("mensagem que a Meta já aceitou não é reenviada", async () => {
    mensagem = mensagemFalha({ provider_message_id: "wamid.antigo" });

    const response = await handleRetry(pedido());
    expect(response.status).toBe(422);
    expect(sendTextMessage).not.toHaveBeenCalled();
  });

  it("versão desatualizada (segundo clique / outra aba) não chama a Meta", async () => {
    claimDevolve = null;

    const response = await handleRetry(pedido());
    const body = (await response.json()) as { error: string; messageRecord: unknown };

    expect(response.status).toBe(409);
    expect(body.error).toBe("stale");
    // Devolve o estado atual para a conversa mesclar por id.
    expect(body.messageRecord).toEqual({ id: "msg-1", status: "sent" });
    expect(sendTextMessage).not.toHaveBeenCalled();
  });

  it("corrida de dois claims: só o primeiro fala com a Meta", async () => {
    let primeiro = true;
    fromImpl = () => {
        const filtros: Filtros = {};
        let valores: Record<string, unknown> = {};
        const q: Record<string, unknown> = {
          update: (v: Record<string, unknown>) => {
            valores = v;
            return q;
          },
          eq: (c: string, v: string) => {
            filtros[c] = v;
            return q;
          },
          select: () => q,
          maybeSingle: async () => {
            if (filtros['status'] === "failed") {
              const ganhou = primeiro;
              primeiro = false;
              return { data: ganhou ? { id: "msg-1", status: "queued" } : null, error: null };
            }
            return { data: { id: "msg-1", ...valores }, error: null };
          },
        };
        return q;
    };

    const [a, b] = await Promise.all([handleRetry(pedido()), handleRetry(pedido())]);
    const status = [a.status, b.status].sort();

    expect(status).toEqual([200, 409]);
    expect(sendTextMessage).toHaveBeenCalledTimes(1);
  });

  it("mídia sem caminho válido volta a falhar sem chamar a Meta", async () => {
    mensagem = mensagemFalha({
      message_type: "image",
      media_mime_type: "image/jpeg",
      media_url: "outbound/OUTRA-CONVERSA/foto.jpg",
    });

    const response = await handleRetry(pedido());

    expect(response.status).toBe(422);
    expect(sendMediaMessage).not.toHaveBeenCalled();
    expect(updates[1]?.valores).toMatchObject({ status: "failed", error_code: "media_missing" });
  });

  it("arquivo ausente no armazenamento explica em vez de enviar", async () => {
    mensagem = mensagemFalha({
      message_type: "image",
      media_mime_type: "image/jpeg",
      media_url: "outbound/conv-1/foto.jpg",
    });
    signedUrl = { data: null, error: { message: "not found" } };

    const response = await handleRetry(pedido());

    expect(response.status).toBe(422);
    expect(sendMediaMessage).not.toHaveBeenCalled();
  });

  it("mídia válida usa URL assinada nova e o arquivo salvo", async () => {
    mensagem = mensagemFalha({
      message_type: "image",
      media_mime_type: "image/jpeg",
      media_url: "outbound/conv-1/foto.jpg",
      media_filename: "foto.jpg",
    });

    const response = await handleRetry(pedido());

    expect(response.status).toBe(200);
    expect(sendMediaMessage).toHaveBeenCalledTimes(1);
    expect(sendMediaMessage.mock.calls[0]?.[3]).toBe("https://storage.exemplo/assinada");
  });

  it("template não é reenviado por aqui e explica o porquê", async () => {
    mensagem = mensagemFalha({ message_type: "template" });

    const response = await handleRetry(pedido());
    const body = (await response.json()) as { message: string };

    expect(response.status).toBe(422);
    expect(body.message).toMatch(/modelo/i);
    expect(updates).toHaveLength(0);
  });

  it("figurinha não é reenviada por aqui", async () => {
    mensagem = mensagemFalha({ message_type: "sticker" });
    const response = await handleRetry(pedido());
    expect(response.status).toBe(422);
    expect(sendMediaMessage).not.toHaveBeenCalled();
  });

  it("tempo esgotado fica em queued, sem oferecer novo reenvio", async () => {
    sendTextMessage.mockResolvedValue({
      ok: false,
      providerMessageId: null,
      errorCode: "network_error",
      errorMessage: "timeout",
      uncertain: true,
    });

    const response = await handleRetry(pedido());

    expect(response.status).toBe(202);
    expect(sendTextMessage).toHaveBeenCalledTimes(1);
    expect(updates[1]?.valores).toMatchObject({ status: "queued", error_code: "network_error" });
  });

  it("recusa inequívoca da Meta volta a failed, sem segunda chamada", async () => {
    sendTextMessage.mockResolvedValue({
      ok: false,
      providerMessageId: null,
      errorCode: "131026",
      errorMessage: "não recebe",
      uncertain: false,
    });

    const response = await handleRetry(pedido());

    expect(response.status).toBe(502);
    expect(sendTextMessage).toHaveBeenCalledTimes(1);
    expect(updates[1]?.valores).toMatchObject({ status: "failed", error_code: "131026" });
  });

  it("exceção depois de chamar a Meta não devolve o claim", async () => {
    sendTextMessage.mockRejectedValue(new Error("socket"));

    const response = await handleRetry(pedido());
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(202);
    expect(body.error).toBe("send_uncertain");
    // Só o claim foi gravado: a linha continua em `queued`, nunca em `failed`.
    expect(updates).toHaveLength(1);
  });

  it("falha ao gravar depois da Meta não vira sucesso fictício", async () => {
    persistErro = { message: "conexão perdida" };

    const response = await handleRetry(pedido());
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(202);
    expect(body.error).toBe("persist_failed");
  });

  it("respeita o limite de tentativas", async () => {
    rateLimit.mockReturnValue({ allowed: false, remaining: 0, retryAfterSeconds: 30 });

    const response = await handleRetry(pedido());
    expect(response.status).toBe(429);
    expect(sendTextMessage).not.toHaveBeenCalled();
  });

  it("corpo inválido é recusado antes de qualquer leitura", async () => {
    const response = await handleRetry(pedido({ messageId: "não-uuid" }));
    expect(response.status).toBe(400);
  });
});
