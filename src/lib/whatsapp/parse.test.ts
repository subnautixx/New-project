import { describe, expect, it } from "vitest";
import { parseWebhook } from "./parse";
import type { MetaWebhookBody } from "./types";

function envelope(value: Record<string, unknown>): MetaWebhookBody {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "551140041234", phone_number_id: "PNID_1" },
              ...value,
            },
          },
        ],
      },
    ],
  };
}

describe("parseWebhook — mensagens recebidas", () => {
  it("extrai mensagem de texto com nome do perfil", () => {
    const events = parseWebhook(
      envelope({
        contacts: [{ wa_id: "5511987654321", profile: { name: "João Silva" } }],
        messages: [
          {
            id: "wamid.ABC",
            from: "5511987654321",
            timestamp: "1735689600",
            type: "text",
            text: { body: "Ainda está disponível?" },
          },
        ],
      }),
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "message",
      eventKey: "wamid.ABC",
      phoneNumberId: "PNID_1",
      waId: "5511987654321",
      profileName: "João Silva",
      messageType: "text",
      content: "Ainda está disponível?",
    });
    expect(events[0]?.timestamp).toBe("2025-01-01T00:00:00.000Z");
  });

  it("extrai mídia com legenda e mime type", () => {
    const events = parseWebhook(
      envelope({
        messages: [
          {
            id: "wamid.IMG",
            from: "5511987654321",
            timestamp: "1735689600",
            type: "image",
            image: { id: "MEDIA_1", mime_type: "image/jpeg", caption: "Foto do carro" },
          },
        ],
      }),
    );

    expect(events[0]).toMatchObject({
      messageType: "image",
      content: "Foto do carro",
      mediaId: "MEDIA_1",
      mediaMimeType: "image/jpeg",
    });
  });

  it("preserva o nome do arquivo em documentos", () => {
    const events = parseWebhook(
      envelope({
        messages: [
          {
            id: "wamid.DOC",
            from: "5511987654321",
            timestamp: "1735689600",
            type: "document",
            document: { id: "MEDIA_2", mime_type: "application/pdf", filename: "crlv.pdf" },
          },
        ],
      }),
    );

    expect(events[0]).toMatchObject({ messageType: "document", mediaFilename: "crlv.pdf" });
  });

  it("trata tipo desconhecido como unsupported em vez de quebrar", () => {
    const events = parseWebhook(
      envelope({
        messages: [
          { id: "wamid.NEW", from: "5511987654321", timestamp: "1735689600", type: "reaction" },
        ],
      }),
    );

    expect(events[0]).toMatchObject({ messageType: "unsupported" });
  });

  it("ignora mensagem sem id ou remetente", () => {
    const events = parseWebhook(
      envelope({ messages: [{ timestamp: "1735689600", type: "text", text: { body: "oi" } }] }),
    );
    expect(events).toHaveLength(0);
  });
});

describe("parseWebhook — status de entrega", () => {
  it("gera chave de idempotência por mensagem + status", () => {
    const events = parseWebhook(
      envelope({
        statuses: [
          {
            id: "wamid.OUT",
            status: "delivered",
            timestamp: "1735689600",
            recipient_id: "5511987654321",
            conversation: { id: "conv", expiration_timestamp: "1735776000" },
          },
        ],
      }),
    );

    expect(events[0]).toMatchObject({
      kind: "status",
      eventKey: "wamid.OUT:delivered",
      status: "delivered",
      serviceWindowExpiresAt: "2025-01-02T00:00:00.000Z",
    });
  });

  it("captura detalhes de falha", () => {
    const events = parseWebhook(
      envelope({
        statuses: [
          {
            id: "wamid.OUT",
            status: "failed",
            timestamp: "1735689600",
            errors: [{ code: 131047, title: "Re-engagement message", message: "Fora da janela" }],
          },
        ],
      }),
    );

    expect(events[0]).toMatchObject({
      status: "failed",
      errorCode: "131047",
      errorMessage: "Fora da janela",
    });
  });

  it("descarta status desconhecido", () => {
    const events = parseWebhook(
      envelope({ statuses: [{ id: "wamid.OUT", status: "warping", timestamp: "1735689600" }] }),
    );
    expect(events).toHaveLength(0);
  });
});

describe("parseWebhook — robustez", () => {
  it("não quebra com payload vazio ou inesperado", () => {
    expect(parseWebhook(null)).toEqual([]);
    expect(parseWebhook(undefined)).toEqual([]);
    expect(parseWebhook({})).toEqual([]);
    expect(parseWebhook({ entry: [{}] })).toEqual([]);
    expect(parseWebhook({ entry: [{ changes: [{ value: {} }] }] })).toEqual([]);
  });

  it("processa mensagens e status no mesmo payload", () => {
    const events = parseWebhook(
      envelope({
        messages: [
          { id: "wamid.IN", from: "5511987654321", timestamp: "1735689600", type: "text", text: { body: "oi" } },
        ],
        statuses: [{ id: "wamid.OUT", status: "read", timestamp: "1735689600" }],
      }),
    );

    expect(events.map((e) => e.kind)).toEqual(["message", "status"]);
  });
});
