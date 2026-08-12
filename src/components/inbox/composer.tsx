"use client";

import { AlertTriangle, SendHorizonal } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ConversationListItem, ThreadMessage } from "@/lib/types/views";

const MAX_LENGTH = 4096;

interface Props {
  conversation: ConversationListItem;
  isAdmin: boolean;
  onSent: (message: ThreadMessage) => void;
}

export function Composer({ conversation, onSent }: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const windowExpiresAt = conversation.service_window_expires_at;
  const windowExpired = Boolean(windowExpiresAt && new Date(windowExpiresAt) <= new Date());

  async function send() {
    const body = text.trim();
    if (!body || sending) return;

    setSending(true);
    setError(null);

    // Gerado aqui: se a resposta se perder e o usuário reenviar, o backend
    // reconhece a mesma tentativa em vez de mandar duas mensagens ao cliente.
    const clientRef = crypto.randomUUID();

    try {
      const response = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversation.id, text: body, clientRef }),
      });

      // Em sucesso `message` é o registro salvo; em erro, o texto do motivo.
      const payload = (await response.json().catch(() => null)) as
        | { message?: ThreadMessage | string; error?: string }
        | null;

      if (!response.ok) {
        setError(
          typeof payload?.message === "string"
            ? payload.message
            : "Não foi possível enviar. Tente novamente.",
        );
        setSending(false);
        return;
      }

      setText("");
      if (payload?.message && typeof payload.message !== "string") onSent(payload.message);
      textareaRef.current?.focus();
    } catch {
      setError("Sem conexão com o servidor.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envia, Shift+Enter quebra linha — como no WhatsApp Web.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  if (windowExpired) {
    return (
      <div className="shrink-0 border-t border-border bg-surface px-3 py-3">
        <div className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-200 ring-1 ring-inset ring-amber-500/25">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            A janela de 24 horas expirou. Pelas regras da Meta, só é possível reabrir esta conversa
            com um template aprovado — ou aguardar o cliente enviar uma nova mensagem.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-border bg-surface px-3 py-2.5">
      {error ? (
        <p role="alert" className="mb-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
          onKeyDown={handleKeyDown}
          placeholder="Escreva uma mensagem…"
          rows={1}
          aria-label="Mensagem"
          className="max-h-40 min-h-[38px] resize-none py-2"
        />
        <Button
          onClick={() => void send()}
          disabled={sending || text.trim().length === 0}
          size="icon"
          title="Enviar (Enter)"
        >
          <SendHorizonal className="h-4 w-4" />
          <span className="sr-only">Enviar</span>
        </Button>
      </div>
    </div>
  );
}
