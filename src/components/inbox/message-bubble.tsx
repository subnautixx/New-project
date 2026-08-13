"use client";

import { AlertCircle, Check, CheckCheck, Clock, FileText, Mic, Video } from "lucide-react";
import { formatTime } from "@/lib/format";
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
    return <AlertCircle className="h-3.5 w-3.5 text-destructive" aria-label="Falhou" />;
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

function MediaContent({ message }: { message: ThreadMessage }) {
  // A mídia é servida por rota autenticada — o link da Meta expira e exige token.
  const src = `/api/media/${message.id}`;

  switch (message.message_type) {
    case "image":
    case "sticker":
      return (
        // eslint-disable-next-line @next/next/no-img-element -- binário vem de rota autenticada, sem otimização do Next
        <img
          src={src}
          alt={message.content ?? "Imagem recebida"}
          className="max-h-80 w-auto rounded-lg object-contain"
          loading="lazy"
        />
      );

    case "audio":
      return (
        <span className="flex items-center gap-2">
          <Mic className="h-4 w-4 shrink-0 opacity-60" />
          <audio controls preload="none" src={src} className="h-9 w-[240px] max-w-full">
            <track kind="captions" />
          </audio>
        </span>
      );

    case "video":
      return (
        <video controls preload="metadata" src={src} className="max-h-80 rounded-lg">
          <track kind="captions" />
          <Video className="h-4 w-4" />
        </video>
      );

    case "document":
      return (
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
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
}: {
  message: ThreadMessage;
  senderName: string | null;
  showSender: boolean;
}) {
  const outbound = message.direction === "outbound";
  const hasMedia = message.message_type !== "text" && message.message_type !== "unsupported";

  return (
    <div className={cn("flex w-full", outbound ? "justify-end" : "justify-start")}>
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
            <MediaContent message={message} />
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

        {message.status === "failed" ? (
          <p className="mt-1 border-t border-destructive/20 pt-1 text-[11px] text-destructive">
            {message.error_message ?? statusLabel("failed")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
