import { describe, expect, it } from "vitest";
import { requiresApprovedTemplate, requiresTemplateForWindow } from "./service-window";

/**
 * Regressão: cliente que nunca escreveu era tratado como conversa liberada.
 *
 * É o caso do prospect cadastrado a partir de um anúncio — exatamente quando a
 * loja quer dar o primeiro passo. O CRM deixava digitar e enviar, e a recusa só
 * vinha da Meta depois, como mensagem falha.
 */
describe("requiresApprovedTemplate", () => {
  it("exige modelo quando o cliente nunca escreveu", () => {
    expect(requiresApprovedTemplate("sem-janela")).toBe(true);
  });

  it("exige modelo depois que a janela fecha", () => {
    expect(requiresApprovedTemplate("fechada")).toBe(true);
  });

  it("não exige nada com a janela aberta, nem no fim dela", () => {
    expect(requiresApprovedTemplate("aberta")).toBe(false);
    expect(requiresApprovedTemplate("acabando")).toBe(false);
  });
});
import { describeServiceWindow } from "./service-window";

const agora = new Date("2026-09-04T12:00:00Z");
const em = (minutos: number) => new Date(agora.getTime() + minutos * 60_000).toISOString();

describe("describeServiceWindow", () => {
  it("fica quieta enquanto sobra tempo", () => {
    const w = describeServiceWindow(em(20 * 60), agora);
    expect(w.state).toBe("aberta");
    expect(w.label).toBeNull();
  });

  it("avisa quando entra nas últimas horas", () => {
    const w = describeServiceWindow(em(3 * 60), agora);
    expect(w.state).toBe("acabando");
    expect(w.label).toBe("Faltam 3h para responder");
  });

  it("conta em minutos na última hora — arredondar para hora faz perder a janela", () => {
    const w = describeServiceWindow(em(40), agora);
    expect(w.state).toBe("acabando");
    expect(w.label).toBe("Faltam 40 min para responder");
  });

  it("marca como fechada quando o prazo passou", () => {
    const w = describeServiceWindow(em(-10), agora);
    expect(w.state).toBe("fechada");
    expect(w.minutesLeft).toBeLessThan(0);
  });

  it("trata o limite exato como fechada", () => {
    const w = describeServiceWindow(em(0), agora);
    expect(w.state).toBe("fechada");
  });

  it("não inventa janela quando não existe", () => {
    const w = describeServiceWindow(null, agora);
    expect(w.state).toBe("sem-janela");
    expect(w.label).toBeNull();
  });
});

describe("requiresTemplateForWindow", () => {
  it("exige modelo quando não há janela nenhuma", () => {
    expect(requiresTemplateForWindow(null)).toBe(true);
  });

  it("exige modelo quando a janela já passou", () => {
    expect(requiresTemplateForWindow(new Date(Date.now() - 3_600_000).toISOString())).toBe(true);
  });

  it("libera enquanto a janela está aberta", () => {
    expect(requiresTemplateForWindow(new Date(Date.now() + 3_600_000).toISOString())).toBe(false);
  });
});
