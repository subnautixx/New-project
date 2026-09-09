import { describe, expect, it } from "vitest";
import type { ThreadMessage } from "@/lib/types/views";
import { mergeMessages, oldestCursor, olderThanFilter } from "./history";

function msg(id: string, created_at: string, extra: Partial<ThreadMessage> = {}): ThreadMessage {
  return {
    id,
    created_at,
    direction: "inbound",
    message_type: "text",
    content: id,
    media_id: null,
    media_mime_type: null,
    media_filename: null,
    status: "delivered",
    error_message: null,
    sent_by_user_id: null,
    wa_timestamp: created_at,
    ...extra,
  } as ThreadMessage;
}

describe("cursor", () => {
  it("sem mensagens não há de onde paginar", () => {
    expect(oldestCursor([])).toBeNull();
  });

  it("o cursor é a mensagem mais antiga da tela", () => {
    const cursor = oldestCursor([msg("a", "2026-01-01T10:00:00Z"), msg("b", "2026-01-01T11:00:00Z")]);
    expect(cursor).toEqual({ createdAt: "2026-01-01T10:00:00Z", id: "a" });
  });

  it("o filtro desempata por id no mesmo instante", () => {
    expect(olderThanFilter({ createdAt: "2026-01-01T10:00:00Z", id: "b" })).toBe(
      "created_at.lt.2026-01-01T10:00:00Z,and(created_at.eq.2026-01-01T10:00:00Z,id.lt.b)",
    );
  });
});

describe("mergeMessages", () => {
  it("resposta antiga não desfaz o status de uma tentativa mais recente", () => {
    const current = msg("a", "2026-01-01T10:00:00Z", { status: "sent", updated_at: "2026-01-01T10:01:00.000002+00:00" });
    const stale = { ...current, status: "failed" as const, updated_at: "2026-01-01T10:01:00.000001+00:00" };
    expect(mergeMessages([current], [stale])[0]?.status).toBe("sent");
  });
  it("acrescenta página antiga no começo sem perder o que já estava", () => {
    const atual = [msg("c", "2026-01-01T12:00:00Z")];
    const antigas = [msg("a", "2026-01-01T10:00:00Z"), msg("b", "2026-01-01T11:00:00Z")];
    expect(mergeMessages(atual, antigas).map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("não duplica quando a mesma mensagem volta em duas respostas", () => {
    const atual = [msg("a", "2026-01-01T10:00:00Z")];
    expect(mergeMessages(atual, [msg("a", "2026-01-01T10:00:00Z")])).toHaveLength(1);
  });

  it("status novo substitui a versão antiga da mesma mensagem", () => {
    const atual = [msg("a", "2026-01-01T10:00:00Z", { status: "queued" })];
    const [depois] = mergeMessages(atual, [msg("a", "2026-01-01T10:00:00Z", { status: "read" })]);
    expect(depois?.status).toBe("read");
  });

  it("ordena por instante e desempata por id", () => {
    const merged = mergeMessages(
      [msg("b", "2026-01-01T10:00:00Z"), msg("z", "2026-01-01T09:00:00Z")],
      [msg("a", "2026-01-01T10:00:00Z")],
    );
    expect(merged.map((m) => m.id)).toEqual(["z", "a", "b"]);
  });
});
