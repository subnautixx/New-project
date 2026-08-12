import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dayKey, formatDate, formatDateTime, formatDayDivider, formatListTime, formatTime } from "./format";

// O runtime dos testes é UTC, como a Vercel. Tudo aqui verifica que a saída
// sai no fuso de Brasília mesmo assim.

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-12T18:30:00Z")); // 15:30 em São Paulo
});

afterEach(() => {
  vi.useRealTimers();
});

describe("formatTime", () => {
  it("converte para o horário de Brasília", () => {
    expect(formatTime("2026-08-12T19:32:00Z")).toBe("16:32");
  });

  it("mostra 00:xx e não 24:xx na virada", () => {
    expect(formatTime("2026-08-12T03:05:00Z")).toBe("00:05");
  });
});

describe("formatListTime", () => {
  it("mostra a hora para mensagens de hoje", () => {
    expect(formatListTime("2026-08-12T17:00:00Z")).toBe("14:00");
  });

  it("trata 22h locais como hoje, mesmo já sendo o dia seguinte em UTC", () => {
    vi.setSystemTime(new Date("2026-08-13T01:30:00Z")); // 12/08, 22:30 local
    expect(formatListTime("2026-08-13T01:00:00Z")).toBe("22:00");
  });

  it("mostra Ontem para o dia anterior", () => {
    expect(formatListTime("2026-08-11T17:00:00Z")).toBe("Ontem");
  });

  it("mostra dia/mês no mesmo ano", () => {
    expect(formatListTime("2026-03-04T17:00:00Z")).toBe("04/03");
  });

  it("inclui o ano em datas de anos anteriores", () => {
    expect(formatListTime("2025-03-04T17:00:00Z")).toBe("04/03/25");
  });

  it("devolve vazio para valor ausente", () => {
    expect(formatListTime(null)).toBe("");
  });
});

describe("formatDate e formatDateTime", () => {
  it("usa o dia local", () => {
    // 01:00Z do dia 13 é 12/08 às 22:00 em São Paulo.
    expect(formatDate("2026-08-13T01:00:00Z")).toBe("12/08/2026");
    expect(formatDateTime("2026-08-13T01:00:00Z")).toBe("12/08/2026 às 22:00");
  });

  it("mostra travessão quando não há data", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
  });
});

describe("formatDayDivider", () => {
  it("identifica hoje e ontem", () => {
    expect(formatDayDivider("2026-08-12T17:00:00Z")).toBe("Hoje");
    expect(formatDayDivider("2026-08-11T17:00:00Z")).toBe("Ontem");
  });

  it("escreve a data por extenso nos demais dias", () => {
    expect(formatDayDivider("2026-08-03T17:00:00Z")).toContain("agosto");
  });
});

describe("dayKey", () => {
  it("agrupa pelo dia local, não pelo UTC", () => {
    // As duas mensagens são do dia 12 em São Paulo, apesar de UTC diferente.
    expect(dayKey("2026-08-12T23:00:00Z")).toBe(dayKey("2026-08-13T01:00:00Z"));
  });
});
