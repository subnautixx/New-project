import { describe, expect, it } from "vitest";
import { compressIfNeeded } from "./compress";

/**
 * Só o caminho de decisão é testável aqui: reduzir de verdade depende de
 * `createImageBitmap` e de canvas, que não existem no Node.
 *
 * O que importa cobrir é o inverso — quando NÃO mexer. Recodificar arquivo que
 * já cabe perde qualidade à toa, e recodificar vídeo ou PDF corromperia.
 */

function fakeFile(name: string, type: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("compressIfNeeded", () => {
  it("devolve a foto intacta quando ela já cabe no limite", async () => {
    const original = fakeFile("carro.jpg", "image/jpeg", 2 * 1024 * 1024);
    const { file, changed } = await compressIfNeeded(original);

    expect(changed).toBe(false);
    expect(file).toBe(original);
  });

  it("não mexe em vídeo, mesmo grande", async () => {
    const original = fakeFile("volta.mp4", "video/mp4", 15 * 1024 * 1024);
    const { file, changed } = await compressIfNeeded(original);

    expect(changed).toBe(false);
    expect(file).toBe(original);
  });

  it("não mexe em documento", async () => {
    const original = fakeFile("laudo.pdf", "application/pdf", 10 * 1024 * 1024);
    const { file, changed } = await compressIfNeeded(original);

    expect(changed).toBe(false);
    expect(file).toBe(original);
  });

  it("não mexe em áudio", async () => {
    const original = fakeFile("audio.ogg", "audio/ogg", 12 * 1024 * 1024);
    const { file, changed } = await compressIfNeeded(original);

    expect(changed).toBe(false);
    expect(file).toBe(original);
  });

  it("devolve intacto o tipo que nem é aceito — quem recusa é a validação", async () => {
    const original = fakeFile("arquivo.zip", "application/zip", 30 * 1024 * 1024);
    const { file, changed } = await compressIfNeeded(original);

    expect(changed).toBe(false);
    expect(file).toBe(original);
  });
});
