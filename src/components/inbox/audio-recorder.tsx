"use client";

import { Mic, Send, Square, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  normalizeAudioMimeType,
  pickRecordingMimeType,
  remuxWebmToOgg,
} from "@/lib/audio/remux";
import { cn } from "@/lib/utils";

/** Teto de duração. Áudio muito longo estoura o limite de 16 MB da Cloud API. */
const MAX_SECONDS = 300;
const LEVEL_BARS = 28;

interface Props {
  disabled?: boolean;
  onRecorded: (file: File) => void;
}

type State = "idle" | "recording" | "processing";

/**
 * Gravação de áudio pelo navegador.
 *
 * O Chrome só grava em WebM, contêiner que o WhatsApp não aceita. Em vez de
 * carregar um transcodificador, trocamos apenas a embalagem para Ogg — os
 * pacotes Opus lá dentro já são o formato nativo do WhatsApp.
 */
export function AudioRecorder({ disabled, onRecorded }: Props) {
  const [state, setState] = useState<State>("idle");
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => new Array(LEVEL_BARS).fill(0));
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);

  const cleanup = useCallback(() => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    if (timerRef.current) clearInterval(timerRef.current);

    animationRef.current = null;
    timerRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;

    recorderRef.current = null;
  }, []);

  // O microfone precisa ser liberado se o componente sair da tela no meio.
  useEffect(() => cleanup, [cleanup]);

  async function start() {
    if (disabled || state !== "idle") return;

    setError(null);

    const format = pickRecordingMimeType((type) =>
      typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type),
    );

    if (!format) {
      setError("Seu navegador não grava em um formato aceito pelo WhatsApp.");
      return;
    }

    let stream: MediaStream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setError("Permita o acesso ao microfone para gravar.");
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    cancelledRef.current = false;

    const recorder = new MediaRecorder(stream, { mimeType: format.mimeType });
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = async () => {
      const chunks = chunksRef.current;
      cleanup();

      if (cancelledRef.current || chunks.length === 0) {
        setState("idle");
        setSeconds(0);
        setLevels(new Array(LEVEL_BARS).fill(0));
        return;
      }

      setState("processing");

      const recorded = new Blob(chunks, { type: format.mimeType });
      let finalBlob: Blob = recorded;

      if (format.needsRemux) {
        const result = remuxWebmToOgg(await recorded.arrayBuffer());

        if (!result.ok || !result.blob) {
          setError(result.error ?? "Não foi possível preparar o áudio.");
          setState("idle");
          setSeconds(0);
          return;
        }

        finalBlob = result.blob;
      }

      const mimeType = normalizeAudioMimeType(format.mimeType, format.needsRemux);
      const extension = mimeType === "audio/ogg" ? "ogg" : mimeType === "audio/mp4" ? "m4a" : "aac";

      onRecorded(
        new File([finalBlob], `audio-${Date.now()}.${extension}`, { type: mimeType }),
      );

      setState("idle");
      setSeconds(0);
      setLevels(new Array(LEVEL_BARS).fill(0));
    };

    // Fatias curtas: se a aba fechar no meio, o que já foi gravado se preserva.
    recorder.start(250);
    setState("recording");

    timerRef.current = setInterval(() => {
      setSeconds((current) => {
        if (current + 1 >= MAX_SECONDS) stop();
        return current + 1;
      });
    }, 1000);

    startLevelMeter(stream);
  }

  function startLevelMeter(stream: MediaStream) {
    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextCtor) return;

    const context = new AudioContextCtor();
    audioContextRef.current = context;

    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(stream).connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteTimeDomainData(data);

      // RMS em torno do silêncio (128) dá um nível estável para a barra.
      let sum = 0;
      for (const sample of data) {
        const deviation = (sample - 128) / 128;
        sum += deviation * deviation;
      }

      const level = Math.min(1, Math.sqrt(sum / data.length) * 3.5);

      // Desliza para a esquerda: as barras viram uma linha do tempo do som.
      setLevels((previous) => [...previous.slice(1), level]);

      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);
  }

  function stop() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }

  function cancel() {
    cancelledRef.current = true;
    stop();
    cleanup();
    setState("idle");
    setSeconds(0);
    setLevels(new Array(LEVEL_BARS).fill(0));
  }

  if (state === "idle") {
    return (
      <div className="flex flex-col items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => void start()}
          disabled={disabled}
          title="Gravar áudio"
        >
          <Mic className="h-4 w-4" />
          <span className="sr-only">Gravar áudio</span>
        </Button>
        {error ? (
          <span role="alert" className="sr-only">
            {error}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center gap-2 rounded-md bg-surface-muted px-2.5 py-1.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={cancel}
        disabled={state === "processing"}
        title="Descartar gravação"
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
        <span className="sr-only">Descartar</span>
      </Button>

      <span
        className={cn(
          "font-mono text-xs tabular-nums",
          state === "recording" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {formatDuration(seconds)}
      </span>

      {/* Medidor ao vivo: confirma que o microfone está realmente captando. */}
      <div className="flex h-6 flex-1 items-center gap-[2px] overflow-hidden" aria-hidden>
        {levels.map((level, index) => (
          <span
            key={index}
            className="w-full min-w-[2px] rounded-full bg-primary/70 transition-[height] duration-75"
            style={{ height: `${Math.max(8, level * 100)}%` }}
          />
        ))}
      </div>

      <Button
        type="button"
        size="icon-sm"
        onClick={stop}
        disabled={state === "processing"}
        title="Concluir gravação"
      >
        {state === "processing" ? (
          <Square className="h-3.5 w-3.5 animate-pulse" />
        ) : (
          <Send className="h-3.5 w-3.5" />
        )}
        <span className="sr-only">Concluir gravação</span>
      </Button>
    </div>
  );
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
