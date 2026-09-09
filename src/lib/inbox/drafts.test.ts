import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearDraft, draftKey, readDraft, writeDraft } from "./drafts";

function fakeStorage(overrides: Partial<Storage> = {}): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
    ...overrides,
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal("sessionStorage", fakeStorage());
});

describe("rascunhos", () => {
  it("separa por usuário e por conversa", () => {
    expect(draftKey("u1", "c1")).not.toBe(draftKey("u2", "c1"));
    expect(draftKey("u1", "c1")).not.toBe(draftKey("u1", "c2"));
  });

  it("guarda e devolve o texto da conversa certa", () => {
    writeDraft("u1", "c1", "oi joão");
    writeDraft("u1", "c2", "outro");
    expect(readDraft("u1", "c1")).toBe("oi joão");
    expect(readDraft("u1", "c2")).toBe("outro");
    expect(readDraft("u2", "c1")).toBe("");
  });

  it("texto vazio apaga o rascunho", () => {
    writeDraft("u1", "c1", "algo");
    writeDraft("u1", "c1", "");
    expect(readDraft("u1", "c1")).toBe("");
  });

  it("clearDraft remove só aquela conversa", () => {
    writeDraft("u1", "c1", "a");
    writeDraft("u1", "c2", "b");
    clearDraft("u1", "c1");
    expect(readDraft("u1", "c1")).toBe("");
    expect(readDraft("u1", "c2")).toBe("b");
  });

  it("storage indisponível não derruba nada", () => {
    vi.stubGlobal("sessionStorage", undefined);
    expect(() => writeDraft("u1", "c1", "x")).not.toThrow();
    expect(readDraft("u1", "c1")).toBe("");
  });

  it("cota estourada não derruba o envio", () => {
    vi.stubGlobal(
      "sessionStorage",
      fakeStorage({
        setItem: () => {
          throw new Error("QuotaExceeded");
        },
      }),
    );
    expect(() => writeDraft("u1", "c1", "x")).not.toThrow();
  });
});
