// @vitest-environment jsdom
import "@/test/setup";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { readDraft } from "@/lib/inbox/drafts";
import { adiada, arquivoFake, conversaFake } from "@/test/fixtures";

/**
 * Comportamento do campo de mensagem, com rede e compressão fingidas.
 * Nenhum teste aqui fala com o servidor real nem envia nada a cliente.
 */

const fetch = vi.fn();

vi.stubGlobal("fetch", (...args: unknown[]) => fetch(...args));

vi.mock("@/lib/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
  createSupabaseBrowserClient: () => ({
    storage: {
      from: () => ({ uploadToSignedUrl: async () => ({ error: null }) }),
    },
  }),
}));

vi.mock("@/lib/media/compress", () => ({
  compressIfNeeded: async (file: File) => ({ file, changed: false }),
}));

vi.mock("@/components/inbox/quick-replies", () => ({
  QuickReplies: () => null,
}));
vi.mock("@/components/inbox/audio-recorder", () => ({
  AudioRecorder: ({ disabled, onRecorded }: { disabled?: boolean; onRecorded: (f: File) => void }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onRecorded(new File(["x"], "audio.ogg", { type: "audio/ogg" }))}
    >
      Gravar
    </button>
  ),
}));
vi.mock("@/components/inbox/template-dialog", () => ({
  TemplateDialog: () => null,
}));

import { Composer } from "./composer";

function renderComposer(props: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const conversation = props.conversation ?? conversaFake();
  const utils = render(
    <Composer
      conversation={conversation}
      isAdmin={false}
      users={[]}
      currentUserId="user-1"
      onSent={props.onSent ?? vi.fn()}
      onPending={props.onPending ?? vi.fn()}
      onPendingDone={props.onPendingDone ?? vi.fn()}
    />,
  );
  return { ...utils, conversation };
}

function campo() {
  return screen.getByLabelText("Mensagem") as HTMLTextAreaElement;
}

function digitar(texto: string) {
  fireEvent.change(campo(), { target: { value: texto } });
}

function colarArquivos(arquivos: File[]) {
  fireEvent.paste(campo(), { clipboardData: { files: arquivos, items: [], types: ["Files"] } });
}

function respostaOk(body: unknown) {
  return { ok: true, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  fetch.mockReset();
  sessionStorage.clear();
});

describe("Composer — anexos", () => {
  it("colar mais de 10 arquivos anexa 10 e AVISA o excedente", async () => {
    renderComposer();

    colarArquivos(Array.from({ length: 13 }, (_, i) => arquivoFake(`foto-${i}.jpg`)));

    await screen.findByText("10 arquivos · vão como mensagens separadas");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /3 arquivos ficaram de fora/i,
    );
  });

  it("duas levas no mesmo instante não passam do teto", async () => {
    renderComposer();

    // Sem trava síncrona, as duas levas leriam o mesmo "zero anexos".
    colarArquivos(Array.from({ length: 8 }, (_, i) => arquivoFake(`a-${i}.jpg`)));
    colarArquivos(Array.from({ length: 8 }, (_, i) => arquivoFake(`b-${i}.jpg`)));

    await screen.findByText(/8 arquivos/);
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(8));
  });

  it("remover durante o processamento não faz o arquivo voltar", async () => {
    renderComposer();

    colarArquivos([arquivoFake("um.jpg"), arquivoFake("dois.jpg")]);
    await screen.findByText("2 arquivos · vão como mensagens separadas");

    fireEvent.click(screen.getByRole("button", { name: "Remover um.jpg" }));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));

    // A leva seguinte parte do estado real, sem ressuscitar o removido.
    colarArquivos([arquivoFake("tres.jpg")]);
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
    expect(screen.queryByText("um.jpg")).toBeNull();
  });

  it("arquivo que a compressão derruba vira aviso, sem quebrar a tela", async () => {
    const compress = await import("@/lib/media/compress");
    vi.spyOn(compress, "compressIfNeeded").mockRejectedValueOnce(new Error("boom"));

    renderComposer();
    colarArquivos([arquivoFake("quebrado.heic", "image/heic")]);

    expect(await screen.findByRole("alert")).toHaveTextContent(/quebrado.heic/);
  });

  it("gravar áudio fica bloqueado enquanto anexos são processados", async () => {
    const trava = adiada<{ file: File; changed: boolean }>();
    const compress = await import("@/lib/media/compress");
    vi.spyOn(compress, "compressIfNeeded").mockReturnValueOnce(trava.promise);

    renderComposer();
    colarArquivos([arquivoFake("lenta.jpg")]);

    await waitFor(() => expect(screen.getByText("Gravar")).toBeDisabled());
    trava.resolve({ file: arquivoFake("lenta.jpg"), changed: false });
    await waitFor(() => expect(screen.getByText("Gravar")).not.toBeDisabled());
  });
});

describe("Composer — envio de texto e rascunho", () => {
  it("mantém o texto no campo até o servidor confirmar", async () => {
    const envio = adiada<Response>();
    fetch.mockReturnValueOnce(envio.promise);

    renderComposer();
    digitar("Bom dia!");
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    // Enquanto viaja, o texto continua onde estava.
    expect(campo().value).toBe("Bom dia!");
    expect(readDraft("user-1", "conv-1")).toBe("Bom dia!");

    envio.resolve(respostaOk({ message: { id: "m1" } }));
    await waitFor(() => expect(campo().value).toBe(""));
    expect(readDraft("user-1", "conv-1")).toBe("");
  });

  it("falha de envio preserva o texto", async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: "Deu ruim." }),
    } as unknown as Response);

    renderComposer();
    digitar("Tentativa");
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Deu ruim.");
    expect(campo().value).toBe("Tentativa");
    expect(readDraft("user-1", "conv-1")).toBe("Tentativa");
  });

  it("o que foi digitado DURANTE o envio não é apagado pelo sucesso", async () => {
    const envio = adiada<Response>();
    fetch.mockReturnValueOnce(envio.promise);

    renderComposer();
    digitar("primeira");
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    digitar("já estou escrevendo a próxima");

    envio.resolve(respostaOk({ message: { id: "m1" } }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await waitFor(() => expect(campo().value).toBe("já estou escrevendo a próxima"));
    expect(readDraft("user-1", "conv-1")).toBe("já estou escrevendo a próxima");
  });

  it("trocar de conversa durante o envio não mistura os rascunhos", async () => {
    const envio = adiada<Response>();
    fetch.mockReturnValueOnce(envio.promise);

    const conversaA = conversaFake({ id: "conv-A" });
    const conversaB = conversaFake({ id: "conv-B" });
    const props = {
      isAdmin: false,
      users: [],
      currentUserId: "user-1",
      onSent: vi.fn(),
      onPending: vi.fn(),
      onPendingDone: vi.fn(),
    };

    const { rerender } = render(<Composer conversation={conversaA} {...props} />);
    digitar("mensagem da A");
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    rerender(<Composer conversation={conversaB} {...props} />);
    await waitFor(() => expect(campo().value).toBe(""));
    digitar("texto da B");

    envio.resolve(respostaOk({ message: { id: "m1" } }));

    // O envio da A limpa só o rascunho da A; a B fica intacta.
    await waitFor(() => expect(readDraft("user-1", "conv-A")).toBe(""));
    expect(readDraft("user-1", "conv-B")).toBe("texto da B");
    expect(campo().value).toBe("texto da B");
  });

  it("voltar para a conversa devolve o rascunho guardado", async () => {
    const conversaA = conversaFake({ id: "conv-A" });
    const conversaB = conversaFake({ id: "conv-B" });
    const props = {
      isAdmin: false,
      users: [],
      currentUserId: "user-1",
      onSent: vi.fn(),
      onPending: vi.fn(),
      onPendingDone: vi.fn(),
    };

    const { rerender } = render(<Composer conversation={conversaA} {...props} />);
    digitar("meio escrito");

    rerender(<Composer conversation={conversaB} {...props} />);
    await waitFor(() => expect(campo().value).toBe(""));

    rerender(<Composer conversation={conversaA} {...props} />);
    await waitFor(() => expect(campo().value).toBe("meio escrito"));
  });
});

describe("Composer — envio de anexos", () => {
  function mockUploadSequence(resultados: boolean[]) {
    let envio = 0;
    fetch.mockImplementation(async (url: string) => {
      if (url.includes("upload-url")) {
        return respostaOk({ path: "p", token: "t", bucket: "b", kind: "image" });
      }
      const ok = resultados[envio] ?? true;
      envio += 1;
      if (!ok) {
        return { ok: false, json: async () => ({ message: "Falhou o segundo." }) } as Response;
      }
      return respostaOk({ message: { id: `m${envio}` } });
    });
  }

  it("legenda vai só no primeiro arquivo e some após o sucesso", async () => {
    mockUploadSequence([true, true]);
    renderComposer();

    colarArquivos([arquivoFake("a.jpg"), arquivoFake("b.jpg")]);
    await screen.findByText("2 arquivos · vão como mensagens separadas");
    digitar("olha as fotos");

    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(campo().value).toBe(""));

    const legendas = fetch.mock.calls
      .filter(([url]) => String(url).includes("send-media"))
      .map(([, init]) => JSON.parse((init as RequestInit).body as string).caption);

    expect(legendas).toEqual(["olha as fotos", undefined]);
  });

  it("arquivo confirmado sai da fila; o que falhou continua para reenvio", async () => {
    mockUploadSequence([true, false]);
    renderComposer();

    colarArquivos([arquivoFake("a.jpg"), arquivoFake("b.jpg")]);
    await screen.findByText("2 arquivos · vão como mensagens separadas");

    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Falhou o segundo.");
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    expect(screen.getByText("b.jpg")).toBeInTheDocument();
  });
});
it("resposta de instância desmontada preserva o rascunho escrito ao voltar", async () => {
  const envio = adiada<Response>();
  fetch.mockReturnValueOnce(envio.promise);
  const first = renderComposer();
  digitar("primeira");
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  first.unmount();
  renderComposer();
  digitar("novo rascunho após voltar");
  await act(async () => { envio.resolve(respostaOk({ message: { id: "m1" } })); });
  expect(readDraft("user-1", "conv-1")).toBe("novo rascunho após voltar");
  expect(campo().value).toBe("novo rascunho após voltar");
});
