import { describe, expect, it, vi } from "vitest";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ParsedInboundMessage } from "./parse";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("./accounts", () => ({
  getAccountByPhoneNumberId: vi.fn(async () => ({ account: { id: "account" } })),
}));

import { processInboundMessage } from "./ingest";

function database(messageError: { code: string; message: string } | null) {
  const finish = vi.fn();
  const from = vi.fn((table: string) => {
    const result = table === "contacts"
      ? { data: { id: "contact", owner_user_id: "owner", status: "respondeu" } }
      : { data: { id: "conversation" } };
    const query = {
      select: () => query,
      in: () => query,
      limit: () => query,
      eq: () => query,
      maybeSingle: async () => result,
      insert: async () => ({ error: messageError }),
      update: finish.mockReturnValue({ eq: () => ({ eq: async () => ({ error: null }) }) }),
    };
    return query;
  });
  return { admin: { from } as unknown as ReturnType<typeof createSupabaseAdminClient>, finish };
}

const event = {
  eventKey: "event", phoneNumberId: "phone", waId: "5511999999999",
  providerMessageId: "message", messageType: "text", content: "Olá",
} as ParsedInboundMessage;

describe("recebimento: erro de gravação versus duplicata", () => {
  it("propaga falha de gravação sem finalizar o evento, permitindo retry pela rota", async () => {
    const { admin, finish } = database({ code: "08006", message: "connection failure" });
    await expect(processInboundMessage(admin, event)).rejects.toThrow("connection failure");
    expect(finish).not.toHaveBeenCalled();
  });

  it("continua reconhecendo mensagem duplicada como evento concluído", async () => {
    const { admin, finish } = database({ code: "23505", message: "duplicate" });
    await expect(processInboundMessage(admin, event)).resolves.toEqual({
      status: "skipped", reason: "duplicate_message",
    });
    expect(finish).toHaveBeenCalledOnce();
  });
});
