import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({ META_GRAPH_API_VERSION: "v21.0" }) }));

import { markMessageAsRead, sendMediaMessage, sendTextMessage } from "./client";

const credentials = { phoneNumberId: "test-number", accessToken: "test-token" };
const recipient = "+5511900000000";
const request = vi.fn<typeof fetch>();

beforeEach(() => {
  request.mockReset();
  vi.stubGlobal("fetch", request);
});
afterEach(() => vi.unstubAllGlobals());

describe("POST de mensagem sem repetição em resultado incerto", () => {
  it("uma queda de rede não dispara outro POST", async () => {
    request.mockRejectedValue(new TypeError("network unavailable"));
    const result = await sendTextMessage(credentials, recipient, "teste isolado");
    expect(result.ok).toBe(false);
    expect(result.providerMessageId).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("HTTP 503 não repete uma mensagem potencialmente aceita", async () => {
    request.mockResolvedValue(new Response(JSON.stringify({ error: { code: 2 } }), { status: 503 }));
    const result = await sendTextMessage(credentials, recipient, "teste isolado");
    expect(result.ok).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("HTTP 200 sem identificador não é confirmação de mensagem enviada", async () => {
    request.mockResolvedValue(new Response("{}", { status: 200 }));
    const result = await sendTextMessage(credentials, recipient, "teste isolado");
    expect(result.ok).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("o mesmo cuidado vale para envio de vídeo", async () => {
    request.mockRejectedValue(new TypeError("connection reset"));
    const result = await sendMediaMessage(credentials, recipient, "video", "https://example.invalid/video.mp4");
    expect(result.ok).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("preserva a confirmação com identificador da Meta", async () => {
    request.mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.fixture" }] }), { status: 200 }));
    const result = await sendTextMessage(credentials, recipient, "teste isolado");
    expect(result.ok).toBe(true);
    expect(result.providerMessageId).toBe("wamid.fixture");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("não exige identificador de nova mensagem para confirmar recibo de leitura", async () => {
    request.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    expect(await markMessageAsRead(credentials, "wamid.fixture")).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
