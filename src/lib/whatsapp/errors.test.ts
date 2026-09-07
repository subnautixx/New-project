import { describe, expect, it } from "vitest";
import { describeSendError, isRetryableStatus } from "./errors";

/**
 * O que importa aqui é a decisão: insistir ou não, e chamar o administrador ou
 * não. Uma mensagem bonita que manda reenviar o que nunca vai passar é pior
 * que o erro cru da Meta.
 */

describe("describeSendError", () => {
  it("manda falar com o administrador quando o token expirou", () => {
    const e = describeSendError("190", "Session has expired");
    expect(e.needsAdmin).toBe(true);
    expect(e.retryable).toBe(false);
    expect(e.message).not.toContain("Session has expired");
  });

  it("deixa reenviar quando é limite de taxa ou instabilidade", () => {
    expect(describeSendError("130429", null).retryable).toBe(true);
    expect(describeSendError("network_error", null).retryable).toBe(true);
  });

  it("explica a janela de 24 horas em vez de mostrar o código", () => {
    expect(describeSendError("131047", null).message).toContain("modelo aprovado");
  });

  it("não manda reenviar mídia que a Meta recusou processar", () => {
    // 131053 chega como "Media upload error". Reenviar o mesmo arquivo repete
    // a falha; o caminho é trocar o formato.
    const e = describeSendError("131053", "Media upload error");
    expect(e.retryable).toBe(false);
    expect(e.needsAdmin).toBe(false);
    expect(e.message).toContain("formato");
    expect(e.message).not.toContain("Media upload error");
  });

  it("repassa o texto da Meta quando o código é desconhecido", () => {
    expect(describeSendError("999999", "Algo estranho").message).toContain("Algo estranho");
  });

  it("não inventa detalhe quando não veio mensagem nenhuma", () => {
    expect(describeSendError(null, null).message).toBe("Não foi possível enviar a mensagem.");
  });
});

describe("isRetryableStatus", () => {
  it("reenvia em timeout, excesso de requisições e erro do servidor", () => {
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
  });

  it("não reenvia no que é culpa do pedido", () => {
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(403)).toBe(false);
  });
});
