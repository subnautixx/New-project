import { describe, expect, it } from "vitest";
import {
  addDaysInAppTz,
  dayKeyInAppTz,
  hourInAppTz,
  isSameDayInAppTz,
  isoToLocalInput,
  localInputToIso,
  startOfDayInAppTz,
  timeZoneOffsetMs,
} from "./time";

// O ambiente de teste roda em UTC, igual à Vercel. É exatamente o cenário que
// estas funções existem para corrigir.

describe("timeZoneOffsetMs", () => {
  it("devolve -3h para o horário de Brasília", () => {
    expect(timeZoneOffsetMs(new Date("2026-08-12T12:00:00Z"))).toBe(-3 * 60 * 60 * 1000);
  });

  it("continua -3h em janeiro (não há mais horário de verão)", () => {
    expect(timeZoneOffsetMs(new Date("2026-01-15T12:00:00Z"))).toBe(-3 * 60 * 60 * 1000);
  });
});

describe("dayKeyInAppTz", () => {
  it("usa o dia local, não o dia UTC", () => {
    // 01:00 UTC do dia 13 ainda é dia 12 em São Paulo (22:00).
    expect(dayKeyInAppTz("2026-08-13T01:00:00Z")).toBe("2026-08-12");
  });

  it("vira o dia às 03:00 UTC", () => {
    expect(dayKeyInAppTz("2026-08-13T02:59:00Z")).toBe("2026-08-12");
    expect(dayKeyInAppTz("2026-08-13T03:00:00Z")).toBe("2026-08-13");
  });

  it("lida com valor ausente ou inválido", () => {
    expect(dayKeyInAppTz(null)).toBe("");
    expect(dayKeyInAppTz("não é data")).toBe("");
  });
});

describe("startOfDayInAppTz", () => {
  it("meia-noite local é 03:00 UTC", () => {
    const start = startOfDayInAppTz(new Date("2026-08-12T18:30:00Z"));
    expect(start.toISOString()).toBe("2026-08-12T03:00:00.000Z");
  });

  it("uma mensagem das 22h locais pertence ao dia local, não ao seguinte", () => {
    // 2026-08-13T01:00Z = 12/08 às 22:00 em São Paulo.
    const instant = new Date("2026-08-13T01:00:00Z");
    const start = startOfDayInAppTz(instant);

    expect(start.toISOString()).toBe("2026-08-12T03:00:00.000Z");
    expect(instant.getTime()).toBeGreaterThan(start.getTime());
  });

  it("é idempotente", () => {
    const first = startOfDayInAppTz(new Date("2026-08-12T18:30:00Z"));
    expect(startOfDayInAppTz(first).toISOString()).toBe(first.toISOString());
  });
});

describe("addDaysInAppTz", () => {
  it("retrocede mantendo a meia-noite local", () => {
    const start = startOfDayInAppTz(new Date("2026-08-12T18:30:00Z"));
    expect(addDaysInAppTz(start, -6).toISOString()).toBe("2026-08-06T03:00:00.000Z");
  });

  it("atravessa a virada de mês", () => {
    const start = startOfDayInAppTz(new Date("2026-03-02T12:00:00Z"));
    expect(dayKeyInAppTz(addDaysInAppTz(start, -3))).toBe("2026-02-27");
  });
});

describe("hourInAppTz", () => {
  it("converte a hora para o fuso local", () => {
    expect(hourInAppTz("2026-08-12T19:32:00Z")).toBe(16);
  });

  it("meia-noite local devolve 0, não 24", () => {
    expect(hourInAppTz("2026-08-12T03:00:00Z")).toBe(0);
  });
});

describe("isSameDayInAppTz", () => {
  it("compara pelo dia local", () => {
    expect(isSameDayInAppTz("2026-08-12T23:00:00Z", "2026-08-13T01:00:00Z")).toBe(true);
    expect(isSameDayInAppTz("2026-08-13T02:00:00Z", "2026-08-13T04:00:00Z")).toBe(false);
  });
});

describe("isoToLocalInput / localInputToIso", () => {
  it("mostra o instante no horário de Brasília", () => {
    // 19:32 UTC = 16:32 local.
    expect(isoToLocalInput("2026-08-12T19:32:00Z")).toBe("2026-08-12T16:32");
  });

  it("usa o dia local quando em UTC já virou", () => {
    expect(isoToLocalInput("2026-08-13T01:00:00Z")).toBe("2026-08-12T22:00");
  });

  it("converte o valor digitado de volta para instante", () => {
    expect(localInputToIso("2026-08-12T16:32")).toBe("2026-08-12T19:32:00.000Z");
  });

  it("faz round-trip sem deslocar o horário", () => {
    const original = "2026-03-04T09:15";
    expect(isoToLocalInput(localInputToIso(original))).toBe(original);
  });

  it("faz round-trip a partir do instante", () => {
    const instant = "2026-11-20T23:45:00.000Z";
    expect(localInputToIso(isoToLocalInput(instant))).toBe(instant);
  });

  it("lida com valor ausente ou malformado", () => {
    expect(isoToLocalInput(null)).toBe("");
    expect(isoToLocalInput("nao-e-data")).toBe("");
    expect(localInputToIso("")).toBeNull();
    expect(localInputToIso("12/08/2026 16:32")).toBeNull();
  });
});
