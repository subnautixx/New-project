import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/env", () => ({ publicEnv: () => ({ NEXT_PUBLIC_SUPABASE_URL: "https://storage.example.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-public-key" }) }));

import { uploadToSignedUrl } from "./upload-xhr";

/**
 * Upload com progresso real. O XMLHttpRequest é fingido: nenhum arquivo sai
 * daqui e nenhum token é registrado.
 */

interface FakeXhr {
  status: number;
  method?: string;
  url?: string;
  headers: Record<string, string>;
  sent?: unknown;
}

let ultimo: FakeXhr;
let comportamento: (xhr: XhrFake) => void;

class XhrFake {
  status = 0;
  upload: { onprogress?: (event: ProgressEvent) => void } = {};
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  headers: Record<string, string> = {};
  method?: string;
  url?: string;
  sent?: unknown;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  abort() {
    this.onabort?.();
  }
  send(body: unknown) {
    this.sent = body;
    ultimo = { status: this.status, method: this.method, url: this.url, headers: this.headers, sent: this.sent };
    comportamento(this);
  }
}

function arquivo() {
  return new File([new Uint8Array(2048)], "vídeo do carro.mp4", { type: "video/mp4" });
}

beforeEach(() => {
  vi.stubGlobal("XMLHttpRequest", XhrFake);
  comportamento = (xhr) => {
    xhr.status = 200;
    xhr.onload?.();
  };
});

describe("uploadToSignedUrl", () => {
  it("reporta o progresso real e conclui em 100%", async () => {
    const vistos: number[] = [];
    comportamento = (xhr) => {
      xhr.upload.onprogress?.({ lengthComputable: true, loaded: 512, total: 2048 } as ProgressEvent);
      xhr.upload.onprogress?.({ lengthComputable: true, loaded: 2048, total: 2048 } as ProgressEvent);
      xhr.status = 200;
      xhr.onload?.();
    };

    const result = await uploadToSignedUrl({
      bucket: "whatsapp-media",
      path: "outbound/conv-1/abc-video.mp4",
      token: "token-secreto",
      file: arquivo(),
      onProgress: (p) => vistos.push(p),
    });

    expect(result.ok).toBe(true);
    expect(vistos).toEqual([25, 100, 100]);
    expect(ultimo.method).toBe("PUT");
    expect(ultimo.headers["content-type"]).toBe("video/mp4");
  });

  it("progresso sem tamanho conhecido não inventa percentual", async () => {
    const vistos: number[] = [];
    comportamento = (xhr) => {
      xhr.upload.onprogress?.({ lengthComputable: false, loaded: 10, total: 0 } as ProgressEvent);
      xhr.status = 200;
      xhr.onload?.();
    };

    await uploadToSignedUrl({
      bucket: "b",
      path: "outbound/conv-1/x.mp4",
      token: "t",
      file: arquivo(),
      onProgress: (p) => vistos.push(p),
    });

    expect(vistos).toEqual([100]);
  });

  it("erro de rede vira mensagem legível, sem vazar o token", async () => {
    comportamento = (xhr) => xhr.onerror?.();

    const result = await uploadToSignedUrl({
      bucket: "b",
      path: "outbound/conv-1/x.mp4",
      token: "token-secreto",
      file: arquivo(),
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/conexão/i);
    expect(result.error).not.toContain("token-secreto");
  });

  it("resposta de erro do Storage não é tratada como sucesso", async () => {
    comportamento = (xhr) => {
      xhr.status = 413;
      xhr.onload?.();
    };

    const result = await uploadToSignedUrl({
      bucket: "b",
      path: "outbound/conv-1/x.mp4",
      token: "t",
      file: arquivo(),
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/grande demais/i);
  });

  it("cancelar aborta a requisição", async () => {
    comportamento = () => {
      /* nunca responde */
    };
    const controller = new AbortController();

    const promessa = uploadToSignedUrl({
      bucket: "b",
      path: "outbound/conv-1/x.mp4",
      token: "t",
      file: arquivo(),
      signal: controller.signal,
    });

    controller.abort();
    const result = await promessa;
    expect(result.ok).toBe(false);
  });

  it("o caminho é escapado e o token viaja na query, não no corpo", async () => {
    await uploadToSignedUrl({
      bucket: "whatsapp-media",
      path: "outbound/conv-1/arquivo com espaço.mp4",
      token: "abc def",
      file: arquivo(),
    });

    expect(ultimo.url).toContain("outbound/conv-1/arquivo%20com%20espa%C3%A7o.mp4");
    expect(ultimo.url).toContain("token=abc%20def");
  });
});

// Silencia o aviso do vi não usado quando o arquivo roda isolado.
void vi;
