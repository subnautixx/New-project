import { describe, expect, it } from "vitest";
import { buildMediaPath, resolveMediaKind, sanitizeFilename, validateMedia } from "./media";

const MB = 1024 * 1024;

describe("resolveMediaKind", () => {
  it("classifica os tipos aceitos", () => {
    expect(resolveMediaKind("image/jpeg")).toBe("image");
    expect(resolveMediaKind("video/mp4")).toBe("video");
    expect(resolveMediaKind("audio/ogg")).toBe("audio");
    expect(resolveMediaKind("application/pdf")).toBe("document");
  });

  it("ignora parâmetros e caixa do mime type", () => {
    expect(resolveMediaKind("audio/ogg; codecs=opus")).toBe("audio");
    expect(resolveMediaKind("IMAGE/JPEG")).toBe("image");
  });

  it("recusa tipo não suportado", () => {
    expect(resolveMediaKind("image/heic")).toBeNull();
    expect(resolveMediaKind("application/x-msdownload")).toBeNull();
    expect(resolveMediaKind("")).toBeNull();
  });
});

describe("validateMedia", () => {
  it("aceita imagem dentro do limite", () => {
    expect(validateMedia("image/jpeg", 2 * MB)).toMatchObject({ ok: true, messageType: "image" });
  });

  it("recusa imagem acima de 5 MB", () => {
    const result = validateMedia("image/jpeg", 6 * MB);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("5 MB");
  });

  it("aceita vídeo até 16 MB", () => {
    expect(validateMedia("video/mp4", 15 * MB).ok).toBe(true);
    expect(validateMedia("video/mp4", 17 * MB).ok).toBe(false);
  });

  it("recusa tipo não suportado antes de olhar o tamanho", () => {
    const result = validateMedia("image/heic", 1);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("não suportado");
  });

  it("recusa arquivo vazio", () => {
    expect(validateMedia("image/png", 0).ok).toBe(false);
  });
});

describe("sanitizeFilename", () => {
  it("remove acentos e espaços", () => {
    expect(sanitizeFilename("Ficha Técnica Ônix.pdf")).toBe("Ficha-Tecnica-Onix.pdf");
  });

  it("neutraliza tentativa de subir de diretório", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("..\\..\\windows\\system.ini")).toBe("system.ini");
  });

  it("nunca devolve vazio", () => {
    expect(sanitizeFilename("...")).toBe("arquivo");
    expect(sanitizeFilename("")).toBe("arquivo");
  });

  it("limita o tamanho do nome", () => {
    expect(sanitizeFilename(`${"a".repeat(200)}.pdf`).length).toBeLessThanOrEqual(80);
  });
});

describe("buildMediaPath", () => {
  it("agrupa por conversa e evita colisão de nome", () => {
    const conversationId = "0b8f6a1e-1d3c-4f2a-9a11-6d0e2b1c7a55";

    const first = buildMediaPath(conversationId, "foto.jpg");
    const second = buildMediaPath(conversationId, "foto.jpg");

    expect(first.startsWith(`outbound/${conversationId}/`)).toBe(true);
    expect(first.endsWith("-foto.jpg")).toBe(true);
    expect(first).not.toBe(second);
  });

  it("não deixa o nome do arquivo escapar da pasta", () => {
    const path = buildMediaPath("conv", "../../secreto.pdf");
    expect(path).not.toContain("..");
  });
});
