import { afterEach, describe, expect, it, vi } from "vitest";
import { rateLimit, resetRateLimits } from "./rate-limit";

afterEach(() => {
  resetRateLimits();
  vi.useRealTimers();
});

describe("rateLimit", () => {
  it("libera até o limite e bloqueia depois", () => {
    for (let i = 0; i < 3; i++) {
      expect(rateLimit("user-1", 3, 60_000).allowed).toBe(true);
    }
    const blocked = rateLimit("user-1", 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("isola chaves diferentes", () => {
    rateLimit("user-1", 1, 60_000);
    expect(rateLimit("user-1", 1, 60_000).allowed).toBe(false);
    expect(rateLimit("user-2", 1, 60_000).allowed).toBe(true);
  });

  it("libera novamente após a janela expirar", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));

    expect(rateLimit("user-1", 1, 60_000).allowed).toBe(true);
    expect(rateLimit("user-1", 1, 60_000).allowed).toBe(false);

    vi.setSystemTime(new Date("2026-01-01T10:01:01Z"));
    expect(rateLimit("user-1", 1, 60_000).allowed).toBe(true);
  });

  it("informa quantas chamadas ainda restam", () => {
    expect(rateLimit("user-1", 3, 60_000).remaining).toBe(2);
    expect(rateLimit("user-1", 3, 60_000).remaining).toBe(1);
    expect(rateLimit("user-1", 3, 60_000).remaining).toBe(0);
  });
});
