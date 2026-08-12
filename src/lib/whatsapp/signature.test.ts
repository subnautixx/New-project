import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resolveVerificationChallenge, verifyMetaSignature } from "./signature";

const SECRET = "app-secret-de-teste";

function sign(body: string, secret = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

describe("verifyMetaSignature", () => {
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });

  it("aceita assinatura válida", () => {
    expect(verifyMetaSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejeita corpo adulterado", () => {
    const signature = sign(body);
    expect(verifyMetaSignature(body + " ", signature, SECRET)).toBe(false);
  });

  it("rejeita assinatura de outro segredo", () => {
    expect(verifyMetaSignature(body, sign(body, "outro-segredo"), SECRET)).toBe(false);
  });

  it("rejeita cabeçalho ausente ou malformado", () => {
    expect(verifyMetaSignature(body, null, SECRET)).toBe(false);
    expect(verifyMetaSignature(body, "abc123", SECRET)).toBe(false);
    expect(verifyMetaSignature(body, "sha256=nao-e-hex", SECRET)).toBe(false);
  });

  it("rejeita quando não há segredo configurado", () => {
    expect(verifyMetaSignature(body, sign(body), undefined)).toBe(false);
    expect(verifyMetaSignature(body, sign(body), "")).toBe(false);
  });

  it("rejeita assinatura de tamanho diferente sem lançar exceção", () => {
    expect(verifyMetaSignature(body, "sha256=abcd", SECRET)).toBe(false);
  });
});

describe("resolveVerificationChallenge", () => {
  const token = "token-de-verificacao";

  it("devolve o challenge quando o token confere", () => {
    const params = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": token,
      "hub.challenge": "1158201444",
    });
    expect(resolveVerificationChallenge(params, token)).toBe("1158201444");
  });

  it("recusa token errado", () => {
    const params = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "errado",
      "hub.challenge": "1158201444",
    });
    expect(resolveVerificationChallenge(params, token)).toBeNull();
  });

  it("recusa modo diferente de subscribe", () => {
    const params = new URLSearchParams({
      "hub.mode": "unsubscribe",
      "hub.verify_token": token,
      "hub.challenge": "1158201444",
    });
    expect(resolveVerificationChallenge(params, token)).toBeNull();
  });

  it("recusa quando não há token configurado", () => {
    const params = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": token,
      "hub.challenge": "1158201444",
    });
    expect(resolveVerificationChallenge(params, null)).toBeNull();
  });
});
