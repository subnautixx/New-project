"use client";

import { AlertTriangle, Loader2, Paperclip, SendHorizonal, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ConversationListItem, ThreadMessage, UserRef } from "@/lib/types/views";
import { ACCEPTED_MIME_TYPES, validateMedia } from "@/lib/whatsapp/media";
import { AudioRecorder } from "./audio-recorder";
import { TemplateDialog } from "./template-dialog";

const MAX_LENGTH = 4096;

interface Props {
  conversation: ConversationListItem;
  isAdmin: boolean;
  users: UserRef[];
  onSent: (message: ThreadMessage) => void;
}

interface SendResponse {
  message?: ThreadMessage | string;
  error?: string;
}

export function Composer({ conversation, onSent }: Props) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const windowExpiresAt = conversation.service_window_expires_at;
  const windowExpired = Boolean(windowExpiresAt && new Date(windowExpiresAt) <= new Date());

  function pickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = ""; // permite escolher o mesmo arquivo de novo
    if (!chosen) return;

    // Mesma validação do backend, aqui só para avisar antes de gastar upload.
    const validation = validateMedia(chosen.type, chosen.size);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setError(null);
    setFile(chosen);
  }

  async function uploadAndSend(chosen: File, caption: string): Promise<boolean> {
    const clientRef = crypto.randomUUID();

    const urlResponse = await fetch("/api/messages/media/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: conversation.id,
        filename: chosen.name,
        mimeType: chosen.type,
        sizeBytes: chosen.size,
      }),
    });

    if (!urlResponse.ok) {
      const payload = (await urlResponse.json().catch(() => null)) as { message?: string } | null;
      setError(payload?.message ?? "Não foi possível preparar o envio do arquivo.");
      return false;
    }

    const { path, token, bucket } = (await urlResponse.json()) as {
      path: string;
      token: string;
      bucket: string;
    };

    // O arquivo vai direto do navegador para o Storage: não passa pela função
    // serverless, que aceita poucos megabytes por requisição.
    const { error: uploadError } = await createSupabaseBrowserClient()
      .storage.from(bucket)
      .uploadToSignedUrl(path, token, chosen, { contentType: chosen.type });

    if (uploadError) {
      setError("Falha ao enviar o arquivo. Verifique sua conexão.");
      return false;
    }

    const sendResponse = await fetch("/api/messages/send-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: conversation.id,
        path,
        mimeType: chosen.type,
        filename: chosen.name,
        caption: caption || undefined,
        clientRef,
      }),
    });

    const payload = (await sendResponse.json().catch(() => null)) as SendResponse | null;

    if (!sendResponse.ok) {
      setError(
        typeof payload?.message === "string"
          ? payload.message
          : "Não foi possível enviar o arquivo.",
      );
      return false;
    }

    if (payload?.message && typeof payload.message !== "string") onSent(payload.message);
    return true;
  }

  async function sendText(body: string): Promise<boolean> {
    // Gerado aqui: se a resposta se perder e o usuário reenviar, o backend
    // reconhece a mesma tentativa em vez de mandar duas mensagens ao cliente.
    const clientRef = crypto.randomUUID();

    const response = await fetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: conversation.id, text: body, clientRef }),
    });

    // Em sucesso `message` é o registro salvo; em erro, o texto do motivo.
    const payload = (await response.json().catch(() => null)) as SendResponse | null;

    if (!response.ok) {
      setError(
        typeof payload?.message === "string"
          ? payload.message
          : "Não foi possível enviar. Tente novamente.",
      );
      return false;
    }

    if (payload?.message && typeof payload.message !== "string") onSent(payload.message);
    return true;
  }

  async function send() {
    const body = text.trim();
    if ((!body && !file) || sending) return;

    setSending(true);
    setError(null);

    try {
      const sent = file ? await uploadAndSend(file, body) : await sendText(body);

      if (sent) {
        setText("");
        setFile(null);
        textareaRef.current?.focus();
      }
    } catch {
      setError("Sem conexão com o servidor.");
    } finally {
      setSending(false);
    }
  }

  /** Áudio gravado vai direto, como no WhatsApp — sem passo de confirmação. */
  async function sendRecording(recorded: File) {
    setSending(true);
    setError(null);

    try {
      await uploadAndSend(recorded, "");
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
      <div className="shrink-0 space-y-2.5 border-t border-border bg-surface px-3 py-3">
        <div className="flex items-start gap-2.5 rounded-lg bg-amber-500/[0.08] px-3 py-2.5 text-xs leading-relaxed text-amber-200/90 ring-1 ring-inset ring-amber-500/20">
          <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-amber-400" />
          <p>
            A janela de 24 horas expirou. Pelas regras da Meta, só é possível reabrir esta conversa
            com um template aprovado — ou aguardar o cliente enviar uma nova mensagem.
          </p>
        </div>

        <TemplateDialog
          conversationId={conversation.id}
          accountId={conversation.whatsapp_account_id}
          onSent={onSent}
        />
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-border bg-surface px-3 py-2.5">
      {error ? (
        <p role="alert" className="mb-2 px-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {file ? (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-surface-muted px-2.5 py-2 text-xs ring-1 ring-inset ring-border">
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {(file.size / (1024 * 1024)).toFixed(1)} MB
          </span>
          <button
            type="button"
            onClick={() => setFile(null)}
            disabled={sending}
            className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            <span className="sr-only">Remover arquivo</span>
          </button>
        </div>
      ) : null}

      <div className="flex items-end gap-1.5">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={ACCEPTED_MIME_TYPES.join(",")}
          onChange={pickFile}
        />

        <Button
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending}
          title="Anexar arquivo"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Paperclip className="h-4 w-4" />
          <span className="sr-only">Anexar arquivo</span>
        </Button>

        <AudioRecorder disabled={sending} onRecorded={(f) => void sendRecording(f)} />

        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
          onKeyDown={handleKeyDown}
          placeholder={file ? "Legenda (opcional)…" : "Escreva uma mensagem…"}
          rows={1}
          aria-label="Mensagem"
          className="max-h-40 min-h-[38px] resize-none rounded-xl py-2"
        />

        <Button
          onClick={() => void send()}
          disabled={sending || (text.trim().length === 0 && !file)}
          size="icon"
          title="Enviar (Enter)"
          className="shrink-0 rounded-full"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <SendHorizonal className="h-4 w-4" />
          )}
          <span className="sr-only">Enviar</span>
        </Button>
      </div>
    </div>
  );
}
