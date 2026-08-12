import { describe, expect, it } from "vitest";
import {
  ALL_STATUSES,
  FUNNEL_ORDER,
  nextStatusAfterInbound,
  nextStatusAfterOutbound,
  STATUS_LABEL,
} from "./lead";

describe("funil", () => {
  it("tem rótulo para todo status", () => {
    for (const status of ALL_STATUSES) {
      expect(STATUS_LABEL[status]).toBeTruthy();
    }
  });

  it("mantém a ordem definida com a operação", () => {
    expect(FUNNEL_ORDER).toEqual([
      "novo",
      "contatado",
      "respondeu",
      "interessado",
      "negociacao",
      "consignado",
    ]);
  });
});

describe("avanço automático de status", () => {
  it("marca como contatado na primeira mensagem enviada", () => {
    expect(nextStatusAfterOutbound("novo")).toBe("contatado");
  });

  it("não regride quem já avançou no funil", () => {
    expect(nextStatusAfterOutbound("interessado")).toBeNull();
    expect(nextStatusAfterInbound("negociacao")).toBeNull();
    expect(nextStatusAfterInbound("consignado")).toBeNull();
  });

  it("marca como respondeu quando o cliente responde", () => {
    expect(nextStatusAfterInbound("contatado")).toBe("respondeu");
    expect(nextStatusAfterInbound("novo")).toBe("respondeu");
  });

  it("reativa quem estava sem resposta", () => {
    expect(nextStatusAfterInbound("sem_resposta")).toBe("respondeu");
  });

  it("não reabre lead perdido automaticamente", () => {
    expect(nextStatusAfterInbound("perdido")).toBeNull();
  });
});
