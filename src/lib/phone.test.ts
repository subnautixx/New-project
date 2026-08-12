import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone, phoneVariants, toWhatsappRecipient } from "./phone";

describe("normalizePhone", () => {
  it("normaliza celular com DDD e sem código de país", () => {
    expect(normalizePhone("(11) 98765-4321")).toBe("+5511987654321");
  });

  it("normaliza número já em E.164", () => {
    expect(normalizePhone("+55 11 98765-4321")).toBe("+5511987654321");
  });

  it("insere o nono dígito em celular antigo", () => {
    expect(normalizePhone("5511 8765-4321")).toBe("+5511987654321");
  });

  it("não insere nono dígito em telefone fixo", () => {
    // Fixos começam em 2-5 e continuam com 8 dígitos.
    expect(normalizePhone("+551133334444")).toBe("+551133334444");
  });

  it("aceita número internacional explícito", () => {
    expect(normalizePhone("+351912345678")).toBe("+351912345678");
  });

  it("rejeita entradas ambíguas ou vazias", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("351912345678")).toBeNull();
  });
});

describe("phoneVariants", () => {
  it("gera a forma sem o nono dígito para celulares", () => {
    expect(phoneVariants("+5511987654321")).toEqual(
      expect.arrayContaining(["+5511987654321", "+551187654321"]),
    );
  });

  it("gera a forma com o nono dígito a partir da antiga", () => {
    expect(phoneVariants("+551187654321")).toEqual(
      expect.arrayContaining(["+551187654321", "+5511987654321"]),
    );
  });

  it("não inventa variantes para fixo", () => {
    expect(phoneVariants("+551133334444")).toEqual(["+551133334444"]);
  });

  it("mantém números estrangeiros intactos", () => {
    expect(phoneVariants("+351912345678")).toEqual(["+351912345678"]);
  });
});

describe("formatPhone", () => {
  it("formata celular brasileiro", () => {
    expect(formatPhone("+5511987654321")).toBe("+55 (11) 98765-4321");
  });

  it("formata fixo brasileiro", () => {
    expect(formatPhone("+551133334444")).toBe("+55 (11) 3333-4444");
  });

  it("lida com valor ausente", () => {
    expect(formatPhone(null)).toBe("—");
  });
});

describe("toWhatsappRecipient", () => {
  it("remove o + exigido pela Cloud API", () => {
    expect(toWhatsappRecipient("+5511987654321")).toBe("5511987654321");
  });
});
