// @vitest-environment jsdom
import "@/test/setup";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { adiada, conversaFake, mensagemFake } from "@/test/fixtures";

/**
 * Reenvio visto da conversa: o que é pedido ao servidor, o que volta para a
 * tela e o que acontece com resposta atrasada. Nenhuma mensagem real é enviada.
 */

let respostaRetry: () => Promise<Response>;
const chamadas: { url: string; body: unknown }[] = [];

const fetch = vi.fn(async (url: string, init?: RequestInit) => {
  chamadas.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
  if (url.includes("/retry")) return respostaRetry();
  return { ok: true, json: async () => ({}) } as unknown as Response;
});

vi.stubGlobal("fetch", (url: string, init?: RequestInit) => fetch(url, init));
vi.mock("./composer", () => ({ Composer: () => <div data-testid="composer" /> }));
vi.mock("@/components/crm/contact-avatar", () => ({ ContactAvatar: () => null }));
vi.mock("@/lib/media/use-authed-media", () => ({
  useAuthedObjectUrl: () => ({ objectUrl: null, failed: false }),
}));

const falha = mensagemFake({
  id: "m1",
  direction: "outbound",
  status: "failed",
  error_code: "131053",
  error_message: "O WhatsApp recusou este formato.",
  content: "Bom dia!",
  updated_at: "v1",
});

vi.mock("@/lib/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
  createSupabaseBrowserClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {
        select: () => q,
        eq: () => q,
        in: () => q,
        or: () => q,
        order: () => q,
        limit: async () => ({ data: [falha], error: null }),
        then: (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res),
      };
      return q;
    },
  }),
}));

import { MessageThread } from "./message-thread";

function renderThread() {
  return render(
    <MessageThread
      conversation={conversaFake({ id: "conv-1", unread_count: 0 })}
      users={[]}
      isAdmin={false}
      currentUserId="user-1"
      onBack={vi.fn()}
      onToggleDetails={vi.fn()}
      refreshToken={0}
    />,
  );
}

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  fetch.mockClear();
  chamadas.length = 0;
  respostaRetry = async () => json(200, { message: { ...falha, status: "sent", updated_at: "v2" } });
});

describe("MessageThread — reenvio", () => {
  it("envia id e versão da linha e mostra a mensagem como enviada", async () => {
    renderThread();

    fireEvent.click(await screen.findByRole("button", { name: /tentar novamente/i }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /tentar novamente/i })).toBeNull(),
    );

    const pedido = chamadas.find((c) => c.url.includes("/retry"));
    expect(pedido?.body).toEqual({ messageId: "m1", expectedUpdatedAt: "v1" });
  });

  it("dois cliques rápidos disparam um único pedido", async () => {
    const lenta = adiada<Response>();
    respostaRetry = () => lenta.promise;

    renderThread();
    const botao = await screen.findByRole("button", { name: /tentar novamente/i });
    fireEvent.click(botao);
    fireEvent.click(botao);

    await screen.findByRole("button", { name: /reenviando/i });
    expect(chamadas.filter((c) => c.url.includes("/retry"))).toHaveLength(1);

    lenta.resolve(json(200, { message: { ...falha, status: "sent", updated_at: "v2" } }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /reenviando/i })).toBeNull(),
    );
  });

  it("versão desatualizada atualiza a tela com o estado real, sem duplicar", async () => {
    respostaRetry = async () =>
      json(409, {
        error: "stale",
        message: "Esta mensagem já mudou de estado. A conversa foi atualizada.",
        messageRecord: { ...falha, status: "delivered", updated_at: "v2", error_message: null },
      });

    renderThread();
    fireEvent.click(await screen.findByRole("button", { name: /tentar novamente/i }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /tentar novamente/i })).toBeNull(),
    );
    expect(screen.getAllByText("Bom dia!")).toHaveLength(1);
  });

  it("falha de rede avisa no balão e mantém o botão", async () => {
    respostaRetry = async () => {
      throw new Error("offline");
    };

    renderThread();
    fireEvent.click(await screen.findByRole("button", { name: /tentar novamente/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/sem conexão/i);
    expect(screen.getByRole("button", { name: /tentar novamente/i })).toBeInTheDocument();
  });

  it("entrega incerta devolvida pelo servidor troca o balão por explicação", async () => {
    respostaRetry = async () =>
      json(202, {
        error: "send_uncertain",
        message: "Não foi possível confirmar o envio com o WhatsApp.",
        messageRecord: { ...falha, status: "queued", updated_at: "v2" },
      });

    renderThread();
    fireEvent.click(await screen.findByRole("button", { name: /tentar novamente/i }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /tentar novamente/i })).toBeNull(),
    );
  });
});
