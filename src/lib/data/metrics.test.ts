import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dayKeyInAppTz } from "@/lib/time";
import { bucketOf, fillVolumeBuckets, resolvePeriod } from "./metrics";

// O runtime é UTC, como a Vercel. Os recortes têm que sair no fuso de Brasília.

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-12T18:30:00Z")); // 12/08, 15:30 local
});

afterEach(() => {
  vi.useRealTimers();
});

describe("resolvePeriod", () => {
  it("usa hoje como padrão, começando à meia-noite local", () => {
    const period = resolvePeriod({});
    expect(period.key).toBe("hoje");
    // Meia-noite em São Paulo = 03:00 UTC.
    expect(period.from.toISOString()).toBe("2026-08-12T03:00:00.000Z");
  });

  it("não começa o dia às 21h do dia anterior", () => {
    // O bug do fuso faria "hoje" iniciar em 2026-08-12T00:00Z (11/08, 21:00).
    expect(resolvePeriod({}).from.toISOString()).not.toBe("2026-08-12T00:00:00.000Z");
  });

  it("mantém o dia local mesmo quando em UTC já é o dia seguinte", () => {
    vi.setSystemTime(new Date("2026-08-13T01:30:00Z")); // 12/08, 22:30 local
    expect(dayKeyInAppTz(resolvePeriod({}).from)).toBe("2026-08-12");
  });

  it("cobre 7 dias incluindo o dia atual", () => {
    expect(dayKeyInAppTz(resolvePeriod({ periodo: "7d" }).from)).toBe("2026-08-06");
  });

  it("cobre 30 dias incluindo o dia atual", () => {
    expect(dayKeyInAppTz(resolvePeriod({ periodo: "30d" }).from)).toBe("2026-07-14");
  });

  it("aceita intervalo personalizado e inclui o último dia inteiro", () => {
    const period = resolvePeriod({ de: "2026-03-01", ate: "2026-03-31" });
    expect(period.key).toBe("custom");
    expect(dayKeyInAppTz(period.from)).toBe("2026-03-01");
    // Fim exclusivo: precisa apontar para a meia-noite de 1º de abril.
    expect(dayKeyInAppTz(period.to)).toBe("2026-04-01");
  });

  it("ignora intervalo invertido e volta para hoje", () => {
    expect(resolvePeriod({ de: "2026-03-31", ate: "2026-03-01" }).key).toBe("hoje");
  });

  it("ignora entrada inválida em vez de quebrar", () => {
    expect(resolvePeriod({ de: "nao-e-data" }).key).toBe("hoje");
    expect(resolvePeriod({ de: "01/03/2026" }).key).toBe("hoje");
    expect(resolvePeriod({ periodo: "seculo" }).key).toBe("hoje");
  });
});

describe("bucketOf", () => {
  it("usa hora para hoje e dia para períodos longos", () => {
    expect(bucketOf(resolvePeriod({}))).toBe("hour");
    expect(bucketOf(resolvePeriod({ periodo: "7d" }))).toBe("day");
    expect(bucketOf(resolvePeriod({ periodo: "30d" }))).toBe("day");
  });
});

describe("fillVolumeBuckets", () => {
  it("gera as 24 horas do dia, mesmo sem atividade", () => {
    const buckets = fillVolumeBuckets([], resolvePeriod({}));
    expect(buckets).toHaveLength(24);
    expect(buckets[0]?.label).toBe("00h");
    expect(buckets[23]?.label).toBe("23h");
    expect(buckets.every((b) => b.sent === 0 && b.received === 0)).toBe(true);
  });

  it("posiciona o volume na hora local correta", () => {
    // 19:00 UTC = 16:00 em São Paulo.
    const buckets = fillVolumeBuckets(
      [{ bucket: "2026-08-12T19:00:00Z", sent: 12, received: 5 }],
      resolvePeriod({}),
    );

    expect(buckets[16]).toMatchObject({ label: "16h", sent: 12, received: 5 });
    expect(buckets[19]?.sent).toBe(0);
  });

  it("gera um bucket por dia no período de 7 dias", () => {
    const buckets = fillVolumeBuckets([], resolvePeriod({ periodo: "7d" }));
    expect(buckets).toHaveLength(7);
    expect(buckets[0]?.label).toBe("06/08");
    expect(buckets[6]?.label).toBe("12/08");
  });

  it("casa o volume diário com o dia local", () => {
    const buckets = fillVolumeBuckets(
      [{ bucket: "2026-08-10T03:00:00Z", sent: 40, received: 22 }],
      resolvePeriod({ periodo: "7d" }),
    );

    expect(buckets.find((b) => b.label === "10/08")).toMatchObject({ sent: 40, received: 22 });
  });

  it("descarta bucket com data inválida sem quebrar", () => {
    const buckets = fillVolumeBuckets(
      [{ bucket: "não é data", sent: 9, received: 9 }],
      resolvePeriod({}),
    );

    expect(buckets).toHaveLength(24);
    expect(buckets.every((b) => b.sent === 0)).toBe(true);
  });
});
