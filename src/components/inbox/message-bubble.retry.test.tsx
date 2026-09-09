// @vitest-environment jsdom
import "@/test/setup";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { mensagemFake } from "@/test/fixtures";

/** Botão de reenvio no balão. Nada sai daqui: o callback é fingido. */

vi.mock("@/lib/media/use-authed-media", () => ({
  useAuthedObjectUrl: () => ({ objectUrl: null, failed: false }),
}));

import { MessageBubble } from "./message-bubble";

function falha(overrides: Record<string, unknown> = {}) {
  return mensagemFake({
    direction: "outbound",
    status: "failed",
    error_code: "131053",
    error_message: "O WhatsApp recusou este formato de áudio.",
    content: "Bom dia!",
    ...overrides,
  });
}

describe("MessageBubble — reenvio", () => {
  it("oferece 'tentar novamente' quando a recusa foi inequívoca", () => {
    const onRetry = vi.fn();
    render(
      <MessageBubble message={falha()} senderName="Ana" showSender={false} onRetry={onRetry} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /tentar novamente/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("mostra 'reenviando' e bloqueia o segundo clique", () => {
    const onRetry = vi.fn();
    render(
      <MessageBubble
        message={falha()}
        senderName="Ana"
        showSender={false}
        onRetry={onRetry}
        retrying
      />,
    );

    const botao = screen.getByRole("button", { name: /reenviando/i });
    fireEvent.click(botao);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("entrega incerta explica o motivo e não oferece o botão", () => {
    render(
      <MessageBubble
        message={falha({ error_code: "network_error" })}
        senderName="Ana"
        showSender={false}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /tentar novamente/i })).toBeNull();
    expect(screen.getByText(/confira no aplicativo/i)).toBeInTheDocument();
  });

  it("mensagem que a Meta já aceitou não pode ser reenviada", () => {
    render(
      <MessageBubble
        message={falha({ provider_message_id: "wamid.1" })}
        senderName="Ana"
        showSender={false}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /tentar novamente/i })).toBeNull();
    expect(screen.getByText(/chegou a aceitar/i)).toBeInTheDocument();
  });

  it("erro do reenvio aparece junto do balão", () => {
    render(
      <MessageBubble
        message={falha()}
        senderName="Ana"
        showSender={false}
        onRetry={vi.fn()}
        retryError="Sem conexão com o servidor."
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Sem conexão com o servidor.");
  });

  it("mensagem entregue não mostra reenvio", () => {
    render(
      <MessageBubble
        message={mensagemFake({ direction: "outbound", status: "delivered" })}
        senderName="Ana"
        showSender={false}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /tentar novamente/i })).toBeNull();
  });
});
