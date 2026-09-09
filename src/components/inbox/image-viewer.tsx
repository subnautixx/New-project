"use client";
/* eslint-disable @next/next/no-img-element -- O visualizador usa URLs blob autenticadas e temporárias. */

import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Maximize2,
  Minimize2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuthedObjectUrl } from "@/lib/media/use-authed-media";
import type { ThreadMessage } from "@/lib/types/views";
import { cn } from "@/lib/utils";

/**
 * Visualizador de imagem da conversa.
 *
 * Usa o Dialog do Radix em modo modal: ele prende o foco dentro do
 * visualizador, deixa o resto da página inerte para leitor de tela e devolve o
 * foco a quem abriu ao fechar. Escrever isso à mão sempre esquece um caso.
 *
 * A imagem continua vindo da rota autenticada (`fetch` por baixo do hook),
 * então a URL de objeto vale só enquanto o visualizador está aberto — o hook
 * revoga sozinho ao fechar ou ao trocar de foto.
 */
interface Props {
  /** Só as imagens da conversa, na ordem em que aparecem. */
  images: ThreadMessage[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

const MAX_ZOOM = 4;

export function ImageViewer({ images, index, onIndexChange, onClose }: Props) {
  const current = images[index];
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const { objectUrl, failed } = useAuthedObjectUrl(
    current ? `/api/media/${current.id}` : null,
    true,
  );

  const goPrev = useCallback(() => {
    if (index > 0) onIndexChange(index - 1);
  }, [index, onIndexChange]);

  const goNext = useCallback(() => {
    if (index < images.length - 1) onIndexChange(index + 1);
  }, [index, images.length, onIndexChange]);

  // Trocar de foto começa de novo no tamanho normal e no topo.
  useEffect(() => {
    setZoom(1);
    const pane = paneRef.current;
    if (pane) {
      pane.scrollTop = 0;
      pane.scrollLeft = 0;
    }
  }, [index]);

  /**
   * Ampliar mantendo o centro do que está sendo olhado.
   *
   * A imagem ampliada cresce dentro de uma área rolável, então nada fica
   * inacessível: dá para arrastar/rolar até o canto superior esquerdo, que é
   * justamente o que um `transform: scale` centralizado cortava.
   */
  function applyZoom(next: number) {
    const pane = paneRef.current;
    const alvo = Math.min(MAX_ZOOM, Math.max(1, +next.toFixed(2)));

    if (pane) {
      const fator = alvo / zoom;
      const meioX = pane.scrollLeft + pane.clientWidth / 2;
      const meioY = pane.scrollTop + pane.clientHeight / 2;
      requestAnimationFrame(() => {
        pane.scrollLeft = meioX * fator - pane.clientWidth / 2;
        pane.scrollTop = meioY * fator - pane.clientHeight / 2;
      });
    }

    setZoom(alvo);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // O Escape já é do Radix; aqui ficam só as setas.
      if (event.key === "ArrowLeft") goPrev();
      else if (event.key === "ArrowRight") goNext();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrev]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await containerRef.current?.requestFullscreen?.();
    } catch {
      // Navegador que recusa tela cheia continua com o modal normal.
    }
  }

  function download() {
    if (!objectUrl) return;
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    // A URL de objeto não tem nome: sem isto o arquivo sai com um id aleatório.
    anchor.download = current?.media_filename ?? "imagem.jpg";
    anchor.click();
  }

  if (!current) return null;

  const legenda = current.content ?? null;

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm" />
        <DialogPrimitive.Content
          ref={containerRef}
          aria-label="Visualizador de imagem"
          className="fixed inset-0 z-50 flex flex-col bg-transparent focus:outline-none"
          onOpenAutoFocus={(event) => {
            openerRef.current = document.activeElement as HTMLElement | null;
            // O foco vai para o painel, não para o primeiro botão: quem usa
            // Tab percorre os controles na ordem em que aparecem.
            event.preventDefault();
            containerRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            openerRef.current?.focus();
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            {current.media_filename ?? "Imagem da conversa"}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Use as setas do teclado para navegar entre as imagens e Escape para fechar.
          </DialogPrimitive.Description>

          {/* Barra fixa: os controles nunca somem, por mais que a foto cresça. */}
          <div className="flex shrink-0 items-center justify-between gap-2 bg-black/40 px-3 py-2 text-white">
            <span className="min-w-0 truncate text-xs text-white/70">
              {images.length > 1
                ? `${index + 1} de ${images.length}`
                : (current.media_filename ?? "Imagem")}
            </span>

            <div className="flex shrink-0 items-center gap-0.5">
              <ViewerButton
                onClick={() => applyZoom(zoom - 0.5)}
                label="Diminuir zoom"
                disabled={zoom <= 1}
              >
                <ZoomOut className="h-4 w-4" />
              </ViewerButton>
              <ViewerButton
                onClick={() => applyZoom(zoom + 0.5)}
                label="Aumentar zoom"
                disabled={zoom >= MAX_ZOOM}
              >
                <ZoomIn className="h-4 w-4" />
              </ViewerButton>
              <ViewerButton onClick={download} label="Baixar imagem" disabled={!objectUrl}>
                <Download className="h-4 w-4" />
              </ViewerButton>
              <ViewerButton
                onClick={() => void toggleFullscreen()}
                label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
              >
                {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </ViewerButton>
              <DialogPrimitive.Close asChild>
                <ViewerButton onClick={() => undefined} label="Fechar visualizador">
                  <X className="h-4 w-4" />
                </ViewerButton>
              </DialogPrimitive.Close>
            </div>
          </div>

          <div className="relative min-h-0 flex-1">
            {index > 0 ? (
              <ViewerButton
                onClick={goPrev}
                label="Imagem anterior"
                className="absolute left-2 top-1/2 z-10 -translate-y-1/2 bg-black/50"
              >
                <ChevronLeft className="h-5 w-5" />
              </ViewerButton>
            ) : null}

            {/* Área rolável: com zoom, a foto inteira continua alcançável. */}
            <div
              ref={paneRef}
              data-testid="viewer-pane"
              className={cn(
                "flex h-full w-full items-center justify-center overflow-auto p-2",
                zoom > 1 && "cursor-grab items-start justify-start",
              )}
            >
              {failed ? (
                <p className="px-6 text-center text-sm text-white/80">
                  Não foi possível carregar esta imagem.
                </p>
              ) : objectUrl ? (
                <img
                  src={objectUrl}
                  alt={legenda ?? "Imagem da conversa"}
                  // Largura em vez de `scale`: o contêiner passa a conhecer o
                  // tamanho real e cria barras de rolagem de verdade.
                  style={zoom > 1 ? { width: `${zoom * 100}%`, maxWidth: "none" } : undefined}
                  className={cn(
                    "shrink-0 object-contain",
                    zoom > 1 ? "h-auto" : "max-h-full max-w-full",
                  )}
                />
              ) : (
                <Loader2 className="h-6 w-6 animate-spin text-white/70" />
              )}
            </div>

            {index < images.length - 1 ? (
              <ViewerButton
                onClick={goNext}
                label="Próxima imagem"
                className="absolute right-2 top-1/2 z-10 -translate-y-1/2 bg-black/50"
              >
                <ChevronRight className="h-5 w-5" />
              </ViewerButton>
            ) : null}
          </div>

          {legenda ? (
            <p className="max-h-[25vh] shrink-0 overflow-auto bg-black/40 px-4 py-3 text-center text-xs text-white/80">
              {legenda}
            </p>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ViewerButton({
  ref,
  onClick,
  label,
  disabled,
  className,
  children,
  ...rest
}: {
  ref?: React.Ref<HTMLButtonElement>;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "children">) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      {...rest}
      className={cn(
        // Alvo de 40px: no celular o dedo precisa acertar sem ampliar.
        "flex h-10 w-10 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-30",
        className,
      )}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}
