import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it("aceita caminho interno", () => {
    expect(safeRedirectPath("/clientes")).toBe("/clientes");
  });

  it("preserva a query, que carrega o link direto da conversa", () => {
    expect(safeRedirectPath("/inbox?c=8f1e")).toBe("/inbox?c=8f1e");
  });

  it("bloqueia endereço protocolo-relativo", () => {
    // O navegador leria isto como https://site-externo.com — open redirect.
    expect(safeRedirectPath("//site-externo.com")).toBe("/inbox");
    expect(safeRedirectPath("//site-externo.com/login")).toBe("/inbox");
  });

  it("bloqueia barra invertida, que alguns navegadores normalizam para barra", () => {
    expect(safeRedirectPath("/\\site-externo.com")).toBe("/inbox");
    expect(safeRedirectPath("/\\/site-externo.com")).toBe("/inbox");
  });

  it("bloqueia URL absoluta", () => {
    expect(safeRedirectPath("https://site-externo.com")).toBe("/inbox");
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/inbox");
  });

  it("bloqueia controles e espaços usados para burlar a checagem", () => {
    expect(safeRedirectPath("/\t/site-externo.com")).toBe("/inbox");
    expect(safeRedirectPath("/\n/site-externo.com")).toBe("/inbox");
    expect(safeRedirectPath("/ /site-externo.com")).toBe("/inbox");
  });

  it("cai no destino padrão quando não há valor", () => {
    expect(safeRedirectPath(null)).toBe("/inbox");
    expect(safeRedirectPath(undefined)).toBe("/inbox");
    expect(safeRedirectPath("")).toBe("/inbox");
    expect(safeRedirectPath("   ")).toBe("/inbox");
  });

  it("respeita o destino padrão informado", () => {
    expect(safeRedirectPath(null, "/clientes")).toBe("/clientes");
  });
});
