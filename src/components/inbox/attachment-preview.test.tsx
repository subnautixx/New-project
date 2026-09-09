// @vitest-environment jsdom
import "@/test/setup";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AttachmentPreview, formatDuration } from "./attachment-preview";

/** Prévia do anexo: nada é enviado, os arquivos são fictícios. */

function video(nome = "carro.mp4") {
  return new File([new Uint8Array(3 * 1024 * 1024)], nome, { type: "video/mp4" });
}

function duracao(elemento: HTMLElement, valor: number) {
  Object.defineProperty(elemento, "duration", { value: valor, configurable: true });
  fireEvent.loadedMetadata(elemento);
}

describe("formatDuration", () => {
  it("formata minutos e segundos", () => {
    expect(formatDuration(9)).toBe("0:09");
    expect(formatDuration(75)).toBe("1:15");
  });

  it("duração não finita não vira texto", () => {
    expect(formatDuration(Infinity)).toBeNull();
    expect(formatDuration(NaN)).toBeNull();
    expect(formatDuration(0)).toBeNull();
  });
});

describe("AttachmentPreview", () => {
  it("vídeo mostra player, duração e tamanho depois dos metadados", () => {
    const { container } = render(
      <AttachmentPreview file={video()} disabled={false} onRemove={vi.fn()} />,
    );

    expect(screen.getByText(/lendo o vídeo/i)).toBeInTheDocument();

    const player = container.querySelector("video")!;
    expect(player).toHaveAttribute("playsinline");
    expect(player).toHaveAttribute("preload", "metadata");
    expect(player.controls).toBe(true);

    duracao(player, 42);
    expect(screen.getByText(/0:42 · 3\.0 MB/)).toBeInTheDocument();
  });

  it("vídeo com metadados inválidos avisa sem impedir o envio", () => {
    const { container } = render(
      <AttachmentPreview file={video()} disabled={false} onRemove={vi.fn()} />,
    );

    fireEvent.error(container.querySelector("video")!);
    expect(screen.getByText(/ainda pode ser enviado/i)).toBeInTheDocument();
  });

  it("duração infinita não aparece na tela", () => {
    const { container } = render(
      <AttachmentPreview file={video()} disabled={false} onRemove={vi.fn()} />,
    );

    duracao(container.querySelector("video")!, Infinity);
    expect(screen.queryByText(/:/)).toBeNull();
    expect(screen.getByText(/3\.0 MB/)).toBeInTheDocument();
  });

  it("progresso real do upload aparece e vira 'aguardando confirmação'", () => {
    const { rerender } = render(
      <AttachmentPreview
        file={video()}
        upload={{ percent: 40, phase: "upload" }}
        disabled
        onRemove={vi.fn()}
      />,
    );

    const barra = screen.getByRole("progressbar");
    expect(barra).toHaveAttribute("aria-valuenow", "40");
    expect(screen.getByText(/enviando arquivo · 40%/i)).toBeInTheDocument();

    rerender(
      <AttachmentPreview
        file={video()}
        upload={{ percent: 100, phase: "confirming" }}
        disabled
        onRemove={vi.fn()}
      />,
    );

    // 100% do upload não é entrega: o WhatsApp ainda precisa confirmar.
    expect(screen.getByText(/aguardando confirmação do whatsapp/i)).toBeInTheDocument();
  });

  it("remover chama de volta e fica bloqueado durante o envio", () => {
    const onRemove = vi.fn();
    const { rerender } = render(
      <AttachmentPreview file={video("nota.mp4")} disabled={false} onRemove={onRemove} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /remover nota\.mp4/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);

    rerender(<AttachmentPreview file={video("nota.mp4")} disabled onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: /remover nota\.mp4/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
