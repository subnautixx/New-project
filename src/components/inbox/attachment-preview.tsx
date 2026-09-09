/* eslint-disable @next/next/no-img-element -- URLs blob locais de mídia autenticada. */
"use client";

import { AlertCircle, FileText, Mic, X } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Prévia do anexo antes de enviar.
 *
 * Vídeo ganha player de verdade: quem manda um vídeo de carro precisa
 * conferir se pegou o ângulo certo e se não gravou 40 segundos de chão. A URL
 * de objeto nasce e morre junto do item — remover um arquivo (ou trocar de
 * conversa, que desmonta a lista) libera a memória na hora.
 */

export type UploadPhase = "upload" | "confirming" | "done";

export interface UploadState {
  /** 0 a 100, vindo do progresso REAL do XMLHttpRequest. */
  percent: number;
  phase: UploadPhase;
}

function formatBytes(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** `mm:ss`. Duração não finita (stream, arquivo quebrado) não vira texto. */
export function formatDuration(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function useObjectUrl(file: File, enabled: boolean): string | null {
  const [resource, setResource] = useState<{ file: File; url: string } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const created = URL.createObjectURL(file);
    setResource({ file, url: created });
    return () => {
      URL.revokeObjectURL(created);
    };
  }, [file, enabled]);

  return enabled && resource?.file === file ? resource.url : null;
}

function VideoPreview({ file }: { file: File }) {
  const url = useObjectUrl(file, true);
  const [duration, setDuration] = useState<string | null>(null);
  const [state, setState] = useState<"carregando" | "pronto" | "erro">("carregando");

  // Trocar o arquivo reinicia a leitura: metadados do vídeo anterior não podem
  // continuar na tela.
  useEffect(() => {
    setDuration(null);
    setState("carregando");
  }, [file]);

  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1 truncate font-medium" title={file.name}>{file.name}</p>
      {state === "erro" ? (
        <p className="flex items-center gap-1.5 text-[11px] text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Não foi possível abrir a prévia deste vídeo. Ele ainda pode ser enviado.
        </p>
      ) : url ? (
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          onLoadedMetadata={(event) => {
            setDuration(formatDuration(event.currentTarget.duration));
            setState("pronto");
          }}
          onError={() => setState("erro")}
          className="max-h-48 w-full rounded-lg bg-black/40"
        >
          <track kind="captions" />
        </video>
      ) : null}

      <p className="mt-1 truncate text-[11px] text-muted-foreground">
        {state === "carregando" ? "Lendo o vídeo… · " : duration ? `${duration} · ` : "Duração indisponível · "}
        {formatBytes(file.size)}
      </p>
    </div>
  );
}

export function AttachmentPreview({
  file,
  upload,
  disabled,
  onRemove,
}: {
  file: File;
  upload?: UploadState;
  disabled: boolean;
  onRemove: () => void;
}) {
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  const imageUrl = useObjectUrl(file, isImage);

  return (
    <li className="rounded-lg bg-surface-muted px-2 py-1.5 text-xs ring-1 ring-inset ring-border">
      <div className="flex items-center gap-2">
        {isVideo ? (
          <VideoPreview file={file} />
        ) : (
          <>
            {imageUrl ? (
              <img
                src={imageUrl}
                alt=""
                className="h-9 w-9 shrink-0 rounded object-cover ring-1 ring-inset ring-border"
              />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-secondary text-muted-foreground">
                {file.type.startsWith("audio/") ? (
                  <Mic className="h-4 w-4" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatBytes(file.size)}
            </span>
          </>
        )}

        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="shrink-0 self-start rounded p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
        >
          <X className="h-3.5 w-3.5" />
          <span className="sr-only">Remover {file.name}</span>
        </button>
      </div>

      {upload ? (
        <div className="mt-1.5">
          <div
            role="progressbar"
            aria-label={`Envio de ${file.name}`}
            aria-valuenow={upload.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1 w-full overflow-hidden rounded-full bg-black/30"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-150"
              style={{ width: `${upload.percent}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">
            {/* 100% do upload ainda não é mensagem entregue: o servidor ainda
                precisa pedir o envio à Meta e confirmar. */}
            {upload.phase === "confirming"
              ? "Enviado ao servidor · aguardando confirmação do WhatsApp"
              : `Enviando arquivo · ${upload.percent}%`}
          </p>
        </div>
      ) : null}
    </li>
  );
}
