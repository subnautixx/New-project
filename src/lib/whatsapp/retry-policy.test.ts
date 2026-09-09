import { describe, expect, it } from "vitest";

import { canRetry, describeRetry } from "./retry-policy";
import type { RetryCandidate } from "./retry-policy";

/**
 * A política é a mesma para o botão e para a rota. Se estes testes passarem, a
 * interface nunca oferece reenvio de algo que pode ter sido entregue.
 */

function falha(overrides: Partial<RetryCandidate> = {}): RetryCandidate {
  return {
    status: "failed",
    direction: "outbound",
    error_code: "131053",
    provider_message_id: null,
    ...overrides,
  };
}

describe("describeRetry", () => {
  it("permite reenvio quando a Meta recusou de forma inequívoca", () => {
    for (const code of ["190", "10", "131047", "131026", "131053", "4", "100"]) {
      expect(canRetry(falha({ error_code: code }))).toBe(true);
    }
  });

  it("bloqueia quando a entrega é incerta", () => {
    for (const code of ["network_error", "unknown", null, "no_provider_id", "131000"]) {
      const verdict = describeRetry(falha({ error_code: code }));
      expect(verdict.retryable).toBe(false);
      expect(verdict.reason).toMatch(/confirmar|duas vezes|aplicativo/i);
    }
  });

  it("bloqueia se a Meta já tinha devolvido um id de mensagem", () => {
    const verdict = describeRetry(falha({ provider_message_id: "wamid.123" }));
    expect(verdict.retryable).toBe(false);
    expect(verdict.reason).toMatch(/aceitar/i);
  });

  it("só vale para mensagem de saída marcada como falha", () => {
    expect(canRetry(falha({ status: "sent" }))).toBe(false);
    expect(canRetry(falha({ status: "queued" }))).toBe(false);
    expect(canRetry(falha({ direction: "inbound" }))).toBe(false);
  });
});
