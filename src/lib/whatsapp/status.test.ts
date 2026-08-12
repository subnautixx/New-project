import { describe, expect, it } from "vitest";
import { shouldApplyStatus } from "./status";

describe("shouldApplyStatus", () => {
  it("avança na ordem normal", () => {
    expect(shouldApplyStatus("queued", "sent")).toBe(true);
    expect(shouldApplyStatus("sent", "delivered")).toBe(true);
    expect(shouldApplyStatus("delivered", "read")).toBe(true);
  });

  it("ignora eventos atrasados que regrediriam o status", () => {
    expect(shouldApplyStatus("read", "delivered")).toBe(false);
    expect(shouldApplyStatus("delivered", "sent")).toBe(false);
    expect(shouldApplyStatus("sent", "queued")).toBe(false);
  });

  it("é idempotente para o mesmo status", () => {
    expect(shouldApplyStatus("delivered", "delivered")).toBe(false);
    expect(shouldApplyStatus("read", "read")).toBe(false);
  });

  it("deixa a falha prevalecer sobre qualquer progresso", () => {
    expect(shouldApplyStatus("read", "failed")).toBe(true);
    expect(shouldApplyStatus("queued", "failed")).toBe(true);
  });

  it("não sobrescreve uma falha já registrada", () => {
    expect(shouldApplyStatus("failed", "delivered")).toBe(false);
    expect(shouldApplyStatus("failed", "read")).toBe(false);
    expect(shouldApplyStatus("failed", "failed")).toBe(false);
  });

  it("permite pular etapas quando o webhook intermediário se perde", () => {
    expect(shouldApplyStatus("queued", "read")).toBe(true);
  });
});
