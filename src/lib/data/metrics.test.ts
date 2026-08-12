import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePeriod } from "./metrics";

beforeEach(() => {
  vi.useFakeTimers();
  // Quarta-feira, 14:30 no horário local.
  vi.setSystemTime(new Date(2026, 7, 12, 14, 30, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("resolvePeriod", () => {
  it("usa hoje como padrão, a partir da meia-noite", () => {
    const period = resolvePeriod({});
    expect(period.key).toBe("hoje");
    expect(period.from).toEqual(new Date(2026, 7, 12, 0, 0, 0, 0));
    expect(period.to).toEqual(new Date(2026, 7, 12, 14, 30, 0));
  });

  it("cobre 7 dias incluindo o dia atual", () => {
    const period = resolvePeriod({ periodo: "7d" });
    expect(period.from).toEqual(new Date(2026, 7, 6, 0, 0, 0, 0));
  });

  it("cobre 30 dias incluindo o dia atual", () => {
    const period = resolvePeriod({ periodo: "30d" });
    expect(period.from).toEqual(new Date(2026, 6, 14, 0, 0, 0, 0));
  });

  it("aceita intervalo personalizado e inclui o último dia inteiro", () => {
    const period = resolvePeriod({ de: "2026-03-01", ate: "2026-03-31" });
    expect(period.key).toBe("custom");
    // O fim é exclusivo, então precisa apontar para o início de 1º de abril.
    expect(period.to.getDate()).toBe(1);
    expect(period.to.getMonth()).toBe(3);
  });

  it("ignora intervalo invertido e volta para hoje", () => {
    expect(resolvePeriod({ de: "2026-03-31", ate: "2026-03-01" }).key).toBe("hoje");
  });

  it("ignora data inválida em vez de quebrar", () => {
    expect(resolvePeriod({ de: "nao-e-data" }).key).toBe("hoje");
    expect(resolvePeriod({ periodo: "seculo" }).key).toBe("hoje");
  });
});
