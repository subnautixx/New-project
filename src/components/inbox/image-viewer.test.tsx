// @vitest-environment jsdom
import "@/test/setup";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mensagemFake } from "@/test/fixtures";

/** Visualizador de fotos: foco preso, teclado e troca de imagem. */

const fetch = vi.fn();

vi.stubGlobal("fetch", (...args: unknown[]) => fetch(...args));

import { ImageViewer } from "./image-viewer";

function imagem(id: string) {
  return mensagemFake({ id, message_type: "image", media_mime_type: "image/jpeg" });
}

function respostaImagem() {
  return {
    ok: true,
    blob: async () => new Blob(["x"], { type: "image/jpeg" }),
  } as unknown as Response;
}

beforeEach(() => {
  fetch.mockReset();
  fetch.mockResolvedValue(respostaImagem());
});

describe("ImageViewer", () => {
  it("prende o foco: Tab circula só pelos controles do visualizador", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">fora do visualizador</button>
        <ImageViewer
          images={[imagem("a"), imagem("b")]}
          index={0}
          onIndexChange={vi.fn()}
          onClose={vi.fn()}
        />
      </>,
    );

    const dialog = await screen.findByRole("dialog");
    for (let i = 0; i < 8; i += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it("Escape fecha e as setas navegam", async () => {
    const onClose = vi.fn();
    const onIndexChange = vi.fn();
    render(
      <ImageViewer
        images={[imagem("a"), imagem("b"), imagem("c")]}
        index={1}
        onIndexChange={onIndexChange}
        onClose={onClose}
      />,
    );

    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onIndexChange).toHaveBeenCalledWith(2);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onIndexChange).toHaveBeenCalledWith(0);
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("imagem que falha não deixa o erro grudado na próxima", async () => {
    fetch.mockReset();
    fetch
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockResolvedValue(respostaImagem());

    const { rerender } = render(
      <ImageViewer
        images={[imagem("a"), imagem("b")]}
        index={0}
        onIndexChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText(/não foi possível carregar/i)).toBeInTheDocument();

    rerender(
      <ImageViewer
        images={[imagem("a"), imagem("b")]}
        index={1}
        onIndexChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.queryByText(/não foi possível carregar/i)).toBeNull());
    await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
  });
});
it("A-B-A não reapresenta a URL revogada enquanto a nova busca está pendente", async () => {
  const props = { images: [imagem("a"), imagem("b")], onIndexChange: vi.fn(), onClose: vi.fn() };
  const { rerender } = render(<ImageViewer {...props} index={0} />);
  await screen.findByRole("img");
  fetch.mockImplementation(() => new Promise<Response>(() => undefined));
  rerender(<ImageViewer {...props} index={1} />);
  expect(screen.queryByRole("img")).toBeNull();
  rerender(<ImageViewer {...props} index={0} />);
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.getByRole("button", { name: "Baixar imagem" })).toBeDisabled();
});
