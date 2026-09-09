/* eslint-disable @next/next/no-img-element -- URLs blob locais de mídia autenticada. */
"use client";

import { AlertCircle, Check, CheckCheck, Clock, FileText, Loader2, Mic, Video } from "lucide-react";

import { describeRetry } from "@/lib/whatsapp/retry-policy";

import { formatTime } from "@/lib/format";
import { useAuthedObjectUrl, useNearViewport } from "@/lib/media/use-authed-media";
import type { ThreadMessage } from "@/lib/types/views";
import { cn } from "@/lib/utils";
import { statusLabel } from "@/lib/whatsapp/status";

/**
 * Tique de status, como no WhatsApp: um tique enviado, dois entregue, dois
 * azuis lido. Só aparece em mensagem de saída — em recebida não faz sentido.
 */
function StatusTicks({ message }: { message: ThreadMessage }) {
  if (message.direction !== "outbound") return null;

  const { status } = message;

  if (status === "failed") {
    return <AlertCircle className="h-3.5 w-3.5 text-red-300" aria-label="Falhou" />;
  }
  if (status === "queued") {
    return <Clock className="h-3.5 w-3.5 opacity-70" aria-label="Enviando" />;
  }
  if (status === "read") {
    return <CheckCheck className="h-3.5 w-3.5 text-sky-400" aria-label="Lida" />;
  }
  if (status === "delivered") {
    return <CheckCheck className="h-3.5 w-3.5 opacity-70" aria-label="Entregue" />;
  }
  return <Check className="h-3.5 w-3.5 opacity-70" aria-label="Enviada" />;
}

/** Espaço reservado enquanto a mídia não chega, no formato de cada tipo. */
const PLACEHOLDER_SIZE: Record<string, string> = {
  image: "h-40 w-56",
  sticker: "h-24 w-24",
  video: "h-40 w-56",
  audio: "h-9 w-[240px]",
  document: "h-10 w-48",
};

function MediaContent({
  message,
  onOpenImage,
}: {
  message: ThreadMessage;
  onOpenImage?: () => void;
}) {
  const { ref, near } = useNearViewport<HTMLSpanElement>();
  const { objectUrl: url, failed } = useAuthedObjectUrl(`/api/media/${message.id}`, near);

  if (failed) {
    return (
      <span
        ref={ref}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
      >
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        Não foi possível carregar este arquivo.
      </span>
    );
  }

  if (!url) {
    return (
      <span
        ref={ref}
        className={cn(
          "block animate-pulse rounded-lg bg-black/20",
          PLACEHOLDER_SIZE[message.message_type] ?? "h-24 w-40",
        )}
      />
    );
  }

  switch (message.message_type) {
    case "image":
    case "sticker":
      return (
        // Botão de verdade, não `<img onClick>`: assim abre com Enter/Espaço e
        // o leitor de tela anuncia que dá para abrir a foto.
        <button
          type="button"
          onClick={onOpenImage}
          className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Abrir imagem em tela cheia"
        >
          <img
            src={url}
            alt={message.content ?? "Imagem recebida"}
            className="max-h-80 w-auto cursor-zoom-in rounded-lg object-contain"
          />
        </button>
      );


    case "audio":
      return (
        <span className="flex items-center gap-2">
          <Mic className="h-4 w-4 shrink-0 opacity-60" />
          <audio controls src={url} className="h-9 w-[240px] max-w-full">
            <track kind="captions" />
          </audio>
        </span>
      );

    case "video":
      return (
        <video controls preload="metadata" src={url} className="max-h-80 rounded-lg">
          <track kind="captions" />
          <Video className="h-4 w-4" />
        </video>
      );

    case "document":
      return (
        <a
          href={url}
          // PDF abre para leitura: recibo, laudo e CRLV a pessoa quer ver, não
          // guardar. Os outros formatos o navegador não exibe, então baixa — e
          // aí o `download` é obrigatório, porque a URL de objeto não tem nome
          // e o arquivo seria salvo como um identificador aleatório.
          {...(message.media_mime_type === "application/pdf"
            ? { target: "_blank", rel: "noreferrer" }
            : { download: message.media_filename ?? "documento" })}
          className="flex items-center gap-2.5 rounded-lg bg-black/20 px-2.5 py-2 transition-colors hover:bg-black/30"
        >
          <FileText className="h-5 w-5 shrink-0 opacity-70" />
          <span className="truncate underline-offset-2 hover:underline">
            {message.media_filename ?? "Documento"}
          </span>
        </a>
      );

    default:
      return null;
  }
}

export function MessageBubble({
  message,
  senderName,
  showSender,
  onOpenImage,
  onRetry,
  retrying = false,
  retryError = null,
}: {
  message: ThreadMessage;
  senderName: string | null;
  showSender: boolean;
  /** Abre o visualizador nesta foto; a lista de fotos vive na conversa. */
  onOpenImage?: () => void;
  /** Reenvio manual desta mensagem. A conversa é quem fala com o servidor. */
  onRetry?: () => void;
  retrying?: boolean;
  retryError?: string | null;
}) {
  // A MESMA política do servidor decide se o botão aparece: só recusa
  // inequívoca da Meta pode ser reenviada sem risco de mandar duas vezes.
  const veredito = describeRetry(message);
  const outbound = message.direction === "outbound";
  const hasMedia = message.message_type !== "text" && message.message_type !== "unsupported";

  return (
    <div
      // A thread usa este marcador para reancorar a rolagem depois de carregar
      // mensagens anteriores.
      data-mid={message.id}
      className={cn("motion-enter flex w-full", outbound ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          // O canto reto do lado do remetente faz as vezes da "rabicho" do
          // WhatsApp: indica a direção sem desenhar nada a mais.
          "max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed shadow-sm sm:max-w-[68%]",
          outbound
            ? "rounded-br-md bg-emerald-800/40 text-foreground ring-1 ring-inset ring-emerald-600/25"
            : "rounded-bl-md bg-surface text-foreground ring-1 ring-inset ring-border",
        )}
      >
        {/* No número compartilhado, saber QUEM respondeu é essencial. */}
        {showSender && outbound && senderName ? (
          <p className="mb-0.5 text-[11px] font-semibold text-emerald-300/90">{senderName}</p>
        ) : null}

        {hasMedia ? (
          <div className="mb-1">
            <MediaContent message={message} onOpenImage={onOpenImage} />
          </div>
        ) : null}

        {message.content ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : message.message_type === "unsupported" ? (
          <p className="italic text-muted-foreground">
            Mensagem de tipo não suportado. Veja no aplicativo do WhatsApp.
          </p>
        ) : null}

        <div
          className={cn(
            "mt-0.5 flex items-center justify-end gap-1 text-[10px] tabular-nums",
            outbound ? "text-foreground/55" : "text-muted-foreground",
          )}
        >
          <span>{formatTime(message.wa_timestamp ?? message.created_at)}</span>
          <StatusTicks message={message} />
        </div>

        {outbound && message.status === "queued" ? (
          <p role="status" className="mt-1 text-[11px] text-amber-200">{message.error_message ?? "Envio em confirmação. Aguarde antes de enviar novamente."}</p>
        ) : null}
        {message.status === "failed" ? (
          <div className="mt-1 space-y-1 border-t border-destructive/20 pt-1">
            <p className="text-[11px] text-red-300">
              {message.error_message ?? statusLabel("failed")}
            </p>

            {veredito.retryable && onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                disabled={retrying}
                className="flex items-center gap-1.5 rounded-full bg-destructive/10 px-2 py-1 text-[11px] font-medium text-red-300 transition-colors hover:bg-destructive/20 disabled:opacity-60"
              >
                {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {retrying ? "Reenviando…" : "Tentar novamente"}
              </button>
            ) : (
              // Entrega incerta: oferecer o botão aqui arriscaria mandar a
              // mesma mensagem duas vezes para o cliente.
              <p className="text-[11px] text-muted-foreground">{veredito.reason}</p>
            )}

            {retryError ? (
              <p role="alert" className="text-[11px] text-red-300">
                {retryError}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
