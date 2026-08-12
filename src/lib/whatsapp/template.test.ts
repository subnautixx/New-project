import { describe, expect, it } from "vitest";
import { countTemplateVariables, renderTemplateBody } from "./template";

describe("countTemplateVariables", () => {
  it("conta as variáveis do corpo", () => {
    expect(countTemplateVariables("Olá {{1}}, o {{2}} ainda está à venda?")).toBe(2);
  });

  it("usa o maior índice, não a quantidade de ocorrências", () => {
    // A Meta espera uma lista posicional; repetir {{1}} não pede outro valor.
    expect(countTemplateVariables("Olá {{1}}, tudo bem {{1}}?")).toBe(1);
    // Numeração com buraco ainda exige preencher até o maior índice.
    expect(countTemplateVariables("Olá {{1}}, sobre o {{3}}")).toBe(3);
  });

  it("tolera espaços dentro das chaves", () => {
    expect(countTemplateVariables("Olá {{ 1 }}")).toBe(1);
  });

  it("devolve zero quando não há variável", () => {
    expect(countTemplateVariables("Mensagem fixa")).toBe(0);
    expect(countTemplateVariables(null)).toBe(0);
    expect(countTemplateVariables("")).toBe(0);
  });
});

describe("renderTemplateBody", () => {
  it("substitui as variáveis na ordem", () => {
    expect(
      renderTemplateBody("Olá {{1}}, o {{2}} ainda está disponível?", ["João", "Corolla"]),
    ).toBe("Olá João, o Corolla ainda está disponível?");
  });

  it("repete o mesmo valor em ocorrências repetidas", () => {
    expect(renderTemplateBody("{{1}}, {{1}}!", ["Oi"])).toBe("Oi, Oi!");
  });

  it("preserva o marcador quando falta o valor", () => {
    expect(renderTemplateBody("Olá {{1}} e {{2}}", ["João"])).toBe("Olá João e {{2}}");
  });

  it("lida com corpo ausente", () => {
    expect(renderTemplateBody(null, ["x"])).toBe("");
  });
});
