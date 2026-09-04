import { describe, expect, it } from "vitest";
import { shouldNotify } from "./notifications";

/**
 * A regra que importa é quando NÃO avisar. Aviso sobre o que a pessoa já está
 * lendo treina o time a ignorar todos os avisos — inclusive os que importam.
 */

const base = {
  direction: "inbound" as const,
  conversationId: "c1",
  openConversationId: "c1",
  documentHidden: false,
};

describe("shouldNotify", () => {
  it("não avisa sobre a conversa aberta com a aba na frente", () => {
    expect(shouldNotify(base).notify).toBe(false);
  });

  it("avisa quando a mensagem é de outra conversa", () => {
    const d = shouldNotify({ ...base, conversationId: "c2" });
    expect(d.notify).toBe(true);
    expect(d.reason).toBe("outra-conversa");
  });

  it("avisa com a aba escondida, mesmo sendo a conversa aberta", () => {
    const d = shouldNotify({ ...base, documentHidden: true });
    expect(d.notify).toBe(true);
    expect(d.reason).toBe("aba-oculta");
  });

  it("nunca avisa sobre mensagem que a própria loja enviou", () => {
    expect(shouldNotify({ ...base, direction: "outbound", conversationId: "c2" }).notify).toBe(
      false,
    );
  });

  it("não avisa sobre envio próprio nem com a aba escondida", () => {
    expect(
      shouldNotify({ ...base, direction: "outbound", documentHidden: true }).notify,
    ).toBe(false);
  });

  it("avisa quando nenhuma conversa está aberta", () => {
    const d = shouldNotify({ ...base, openConversationId: null });
    expect(d.notify).toBe(true);
  });
});
