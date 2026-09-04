"use client";

import { AlertTriangle, Loader2, Paperclip, SendHorizonal, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { compressIfNeeded } from "@/lib/media/compress";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ConversationListItem, ThreadMessage, UserRef } from "@/lib/types/views";
import { ACCEPTED_MIME_TYPES, validateMedia } from "@/lib/whatsapp/media";
import { AudioRecorder } from "./audio-recorder";
import { QuickReplies } from "./quick-replies";
import { TemplateDialog } from "./template-dialog";

const MAX_LENGTH = 4096;

/** Teto por envio. Acima disso a fila demora e a janela de 24h corre. */
const MAX_FILES = 10;

interface Props {
  conversation: ConversationListItem;
  isAdmin: boolean;
  users: UserRef[];
  currentUserId: string;
  onSent: (message: ThreadMessage) => void;
  /** Texto entregue à thread antes da ida ao servidor, para aparecer na hora. */
  onPending: (clientRef: string, text: string) => void;
  /** Fim da tentativa, com ou sem sucesso: o balão provisório sai. */
  onPendingDone: (clientRef: string) => void;
}

interface SendResponse {
  message?: ThreadMessage | string;
  error?: string;
}

export function Composer({
  conversation,
  isAdmin,
  currentUserId,
  onSent,
  onPending,
  onPendingDone,
}: Props) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  /** Quando manda vários: "enviando 2 de 5". */
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const windowExpiresAt = conversation.service_window_expires_at;
  const windowExpired = Boolean(windowExpiresAt && new Date(windowExpiresAt) <= new Date());

  async function pickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = ""; // permite escolher o mesmo arquivo de novo
    if (chosen.length === 0) return;

    setError(null);

    const aceitos: File[] = [];
    const recusados: string[] = [];

    for (const original of chosen) {
      // Foto acima do limite é encolhida em vez de recusada — o limite é da
      // Meta e não dá para aumentar, mas quase toda foto cabe depois de
      // reduzida.
      const { file } = await compressIfNeeded(original);
      const validation = validateMedia(file.type, file.size);

      if (validation.ok) aceitos.push(file);
      else recusados.push(original.name);
    }

    if (recusados.length > 0) {
      setError(
        recusados.length === 1
          ? `${recusados[0]} não pôde ser enviado: formato ou tamanho fora do aceito pelo WhatsApp.`
          : `${recusados.length} arquivos não puderam ser enviados: formato ou tamanho fora do aceito pelo WhatsApp.`,
      );
    }

    setFiles((prev) => [...prev, ...aceitos].slice(0, MAX_FILES));
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
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

  async function sendText(body: string, clientRef: string): Promise<boolean> {
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
    if ((!body && files.length === 0) || sending) return;

    setSending(true);
    setError(null);

    // Anexo continua esperando a resposta: o upload tem estado próprio na tela,
    // e um balão provisório sem a mídia carregada só confundiria.
    if (files.length > 0) {
      const total = files.length;
      setProgress({ done: 0, total });

      try {
        // Um arquivo por mensagem — a Cloud API não aceita várias mídias na
        // mesma. A legenda vai só na primeira, como no WhatsApp.
        for (const [index, item] of files.entries()) {
          const ok = await uploadAndSend(item, index === 0 ? body : "");

          if (!ok) {
            // Para na primeira falha e mantém o que ainda não foi: reenviar o
            // que já chegou duplicaria mensagem para o cliente.
            setFiles(files.slice(index));
            return;
          }

          setProgress({ done: index + 1, total });
        }

        setText("");
        setFiles([]);
        textareaRef.current?.focus();
      } catch {
        setError("Sem conexão com o servidor.");
      } finally {
        setProgress(null);
        setSending(false);
      }
      return;
    }

    // Gerado aqui: se a resposta se perder e o usuário reenviar, o backend
    // reconhece a mesma tentativa em vez de mandar duas mensagens ao cliente.
    const clientRef = crypto.randomUUID();

    // O balão aparece antes da ida ao servidor, e o campo esvazia junto — quem
    // atende segue escrevendo a próxima linha sem esperar a rede.
    onPending(clientRef, body);
    setText("");
    textareaRef.current?.focus();

    let ok = false;
    try {
      ok = await sendText(body, clientRef);
    } catch {
      setError("Sem conexão com o servidor.");
    } finally {
      onPendingDone(clientRef);
      setSending(false);
    }

    // Falhou: o texto volta para o campo, senão o que a pessoa escreveu some
    // junto com o balão e ela precisa digitar tudo de novo.
    if (!ok) setText((current) => (current.length > 0 ? current : body));
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

      {files.length > 0 ? (
        <div className="mb-2 space-y-1">
          <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
            <span>
              {files.length === 1 ? "1 arquivo" : `${files.length} arquivos`}
              {files.length > 1 ? " · vão como mensagens separadas" : ""}
            </span>
            {progress ? (
              <span className="tabular-nums text-primary">
                enviando {progress.done + 1} de {progress.total}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setFiles([])}
                disabled={sending}
                className="transition-colors hover:text-foreground"
              >
                Remover todos
              </button>
            )}
          </div>

          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {files.map((item, index) => (
              <li
                key={`${item.name}-${index}`}
                className="flex items-center gap-2 rounded-lg bg-surface-muted px-2.5 py-2 text-xs ring-1 ring-inset ring-border"
              >
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {(item.size / (1024 * 1024)).toFixed(1)} MB
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  disabled={sending}
                  className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                  <span className="sr-only">Remover {item.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex items-end gap-1.5">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept={ACCEPTED_MIME_TYPES.join(",")}
          onChange={(e) => void pickFile(e)}
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

        <QuickReplies
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          currentText={text}
          disabled={sending}
          onInsert={(body) => {
            // Acrescenta ao que já foi digitado em vez de substituir: o
            // consignador costuma escrever "Oi João!" antes de colar o padrão.
            setText((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${body}` : body));
            textareaRef.current?.focus();
          }}
        />

        <AudioRecorder disabled={sending} onRecorded={(f) => void sendRecording(f)} />

        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
          onKeyDown={handleKeyDown}
          placeholder={files.length > 0 ? "Legenda (opcional)…" : "Escreva uma mensagem…"}
          rows={1}
          aria-label="Mensagem"
          className="max-h-40 min-h-[38px] resize-none rounded-xl py-2"
        />

        <Button
          onClick={() => void send()}
          disabled={sending || (text.trim().length === 0 && files.length === 0)}
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
