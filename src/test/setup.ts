import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  // Um teste chega a derrubar o sessionStorage de propósito; limpar não pode falhar.
  try {
    globalThis.sessionStorage?.clear();
  } catch {
    /* storage indisponível no teste */
  }
  vi.restoreAllMocks();
});

// jsdom não implementa nada disso, e componentes de mídia/rolagem usam os três.
Element.prototype.scrollIntoView = () => undefined;

if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => "blob:test";
  URL.revokeObjectURL = () => undefined;
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = "";
    thresholds: number[] = [];
  } as unknown as typeof IntersectionObserver;
}

if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis.crypto ?? {}, "randomUUID", {
    value: () => `id-${Math.random().toString(16).slice(2)}`,
  });
}
