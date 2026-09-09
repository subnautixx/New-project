// @vitest-environment jsdom
import "@/test/setup";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { adiada, conversaFake, mensagemFake } from "@/test/fixtures";

/**
 * Histórico da conversa com o banco fingido: paginação, mescla por id,
 * respostas fora de ordem e troca de conversa. Nada real é lido ou enviado.
 */

const fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response);

vi.stubGlobal("fetch", () => fetch());

vi.mock("./composer", () => ({ Composer: () => <div data-testid="composer" /> }));
vi.mock("@/components/crm/contact-avatar", () => ({ ContactAvatar: () => null }));
vi.mock("./message-bubble", () => ({
  MessageBubble: ({ message }: { message: { id: string; content: string; status: string } }) => (
    <div data-mid={message.id}>
      {message.content} [{message.status}]
    </div>
  ),
}));

interface Consulta {
  conversationId?: string;
  ids?: string[];
  or?: string;
  limit?: number;
}

type Resposta = { data: unknown[] | null; error: unknown };

let responder: (q: Consulta) => Promise<Resposta>;

vi.mock("@/lib/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
  createSupabaseBrowserClient: () => ({
    from: () => {
      const filtros: Consulta = {};
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (_c: string, v: string) => {
          filtros.conversationId = v;
          return q;
        },
        in: (_c: string, ids: string[]) => {
          filtros.ids = ids;
          return q;
        },
        or: (f: string) => {
          filtros.or = f;
          return q;
        },
        order: () => q,
        limit: (n: number) => {
          filtros.limit = n;
          return responder(filtros);
        },
        then: (res: (v: Resposta) => unknown, rej: (e: unknown) => unknown) =>
          responder(filtros).then(res, rej),
      };
      return q;
    },
  }),
}));

import { MessageThread } from "./message-thread";

function renderThread(conversationId = "conv-1", refreshToken = 0) {
  const conversation = conversaFake({ id: conversationId, unread_count: 0 });
  return render(
    <MessageThread
      conversation={conversation}
      users={[]}
      isAdmin={false}
      currentUserId="user-1"
      onBack={vi.fn()}
      onToggleDetails={vi.fn()}
      refreshToken={refreshToken}
    />,
  );
}

/** Página do banco: mais recente primeiro, como a consulta real devolve. */
function pagina(inicio: number, quantidade: number) {
  return Array.from({ length: quantidade }, (_, i) => {
    const n = inicio - i;
    return mensagemFake({
      id: `m${n}`,
      content: `msg ${n}`,
      created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString(),
    });
  });
}

beforeEach(() => {
  fetch.mockClear();
  responder = async () => ({ data: [], error: null });
});

describe("MessageThread", () => {
  it("mostra a conversa vazia sem oferecer 'carregar anteriores'", async () => {
    renderThread();
    await screen.findByTestId("composer");
    expect(screen.queryByRole("button", { name: /anteriores/i })).toBeNull();
  });

  it("erro na primeira carga aparece e o 'tentar de novo' funciona", async () => {
    let tentativa = 0;
    responder = async () => {
      tentativa += 1;
      if (tentativa === 1) return { data: null, error: { message: "falhou" } };
      return { data: pagina(2, 2), error: null };
    };

    renderThread();
    const botao = await screen.findByRole("button", { name: /tentar de novo/i });
    fireEvent.click(botao);
    expect(await screen.findByText(/msg 2/)).toBeInTheDocument();
  });

  it("carrega anteriores por cursor, sem duplicar, e anuncia o fim", async () => {
    responder = async (q) => {
      if (q.or) return { data: pagina(50, 10), error: null };
      if (q.ids) return { data: [], error: null };
      return { data: pagina(100, 50), error: null };
    };

    renderThread();
    await screen.findByText("msg 100 [delivered]");

    const botao = await screen.findByRole("button", { name: /anteriores/i });
    fireEvent.click(botao);

    await screen.findByText("msg 50 [delivered]");
    // Página curta = começo da conversa: o botão some.
    await waitFor(() => expect(screen.queryByRole("button", { name: /anteriores/i })).toBeNull());
    expect(screen.getAllByText("msg 51 [delivered]")).toHaveLength(1);
  });

  it("atualização mescla status de mensagem antiga sem descartar páginas", async () => {
    let fase = 0;
    responder = async (q) => {
      if (q.or) return { data: pagina(50, 10), error: null };
      if (q.ids) {
        // Reconferência: a mensagem antiga agora está lida.
        return fase === 0
          ? { data: [], error: null }
          : {
              data: [
                mensagemFake({
                  id: "m45",
                  content: "msg 45",
                  status: "read",
                  created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, 45)).toISOString(),
                }),
              ],
              error: null,
            };
      }
      return { data: pagina(100, 50), error: null };
    };

    const { rerender } = renderThread();
    await screen.findByText("msg 100 [delivered]");
    fireEvent.click(await screen.findByRole("button", { name: /anteriores/i }));
    await screen.findByText("msg 45 [delivered]");

    fase = 1;
    rerender(
      <MessageThread
        conversation={conversaFake({ id: "conv-1", unread_count: 0 })}
        users={[]}
        isAdmin={false}
        currentUserId="user-1"
        onBack={vi.fn()}
        onToggleDetails={vi.fn()}
        refreshToken={1}
      />,
    );

    await screen.findByText("msg 45 [read]");
    // Página antiga continua na tela e o fim do histórico não volta atrás.
    expect(screen.getByText("msg 41 [delivered]")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /anteriores/i })).toBeNull();
  });

  it("resposta atrasada da conversa anterior não escreve na conversa aberta (A→B→A)", async () => {
    const lenta = adiada<Resposta>();
    responder = async (q) => {
      if (q.conversationId === "conv-A") return lenta.promise;
      return { data: [mensagemFake({ id: "b1", content: "sou da B" })], error: null };
    };

    const props = {
      users: [],
      isAdmin: false,
      currentUserId: "user-1",
      onBack: vi.fn(),
      onToggleDetails: vi.fn(),
      refreshToken: 0,
    };

    const { rerender } = render(
      <MessageThread conversation={conversaFake({ id: "conv-A", unread_count: 0 })} {...props} />,
    );

    rerender(
      <MessageThread conversation={conversaFake({ id: "conv-B", unread_count: 0 })} {...props} />,
    );
    await screen.findByText("sou da B [delivered]");

    lenta.resolve({
      data: [mensagemFake({ id: "a1", content: "sou da A" })],
      error: null,
    });

    await waitFor(() => expect(screen.queryByText(/sou da A/)).toBeNull());
    expect(screen.getByText("sou da B [delivered]")).toBeInTheDocument();
  });

  it("falha ao atualizar avisa sem apagar o histórico", async () => {
    let fase = 0;
    responder = async () => {
      if (fase === 0) return { data: pagina(3, 3), error: null };
      return { data: null, error: { message: "sem rede" } };
    };

    const props = {
      users: [],
      isAdmin: false,
      currentUserId: "user-1",
      onBack: vi.fn(),
      onToggleDetails: vi.fn(),
    };

    const { rerender } = render(
      <MessageThread
        conversation={conversaFake({ id: "conv-1", unread_count: 0 })}
        {...props}
        refreshToken={0}
      />,
    );
    await screen.findByText("msg 3 [delivered]");

    fase = 1;
    rerender(
      <MessageThread
        conversation={conversaFake({ id: "conv-1", unread_count: 0 })}
        {...props}
        refreshToken={1}
      />,
    );

    expect(await screen.findByText(/não foi possível atualizar/i)).toBeInTheDocument();
    expect(screen.getByText("msg 3 [delivered]")).toBeInTheDocument();
  });
});
