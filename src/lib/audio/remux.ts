import { writeOggStream, type OggPacket } from "./ogg";
import { buildOpusHead, buildOpusTags, opusPacketSamples, parseOpusHead } from "./opus";
import { extractOpusFromWebm } from "./webm";

/**
 * Converte WebM/Opus em Ogg/Opus.
 *
 * O Chrome grava áudio em WebM, contêiner que a Cloud API não aceita. Mas os
 * pacotes Opus lá dentro são exatamente os mesmos que o Ogg carrega: dá para
 * trocar a embalagem sem recodificar. Sem perda de qualidade, sem ffmpeg no
 * navegador, e o áudio sai no formato que o WhatsApp usa nativamente.
 */

export const OGG_MIME_TYPE = "audio/ogg";

export interface RemuxResult {
  ok: boolean;
  blob: Blob | null;
  error: string | null;
}

export function remuxWebmToOgg(buffer: ArrayBuffer | Uint8Array): RemuxResult {
  const { codecPrivate, packets } = extractOpusFromWebm(buffer);

  if (packets.length === 0) {
    return { ok: false, blob: null, error: "Nenhum áudio encontrado na gravação." };
  }

  // O MediaRecorder normalmente grava o OpusHead em CodecPrivate. Se faltar,
  // montamos um equivalente: a gravação sempre sai em 48 kHz.
  const head = (codecPrivate && parseOpusHead(codecPrivate)) ?? {
    channels: 1,
    preSkip: 3840,
    inputSampleRate: 48000,
  };

  let granule = 0;
  const audioPackets: OggPacket[] = [];

  for (const data of packets) {
    granule += opusPacketSamples(data);
    audioPackets.push({ data, granulePosition: granule });
  }

  const ogg = writeOggStream(
    buildOpusHead(head),
    buildOpusTags(),
    audioPackets,
    // Serial aleatório: o formato pede que fluxos distintos não colidam.
    (Math.random() * 0xffff_ffff) >>> 0,
  );

  return {
    ok: true,
    blob: new Blob([ogg as unknown as BlobPart], { type: OGG_MIME_TYPE }),
    error: null,
  };
}

/** Duração da gravação, em segundos, a partir dos pacotes. */
export function opusDurationSeconds(buffer: ArrayBuffer | Uint8Array): number {
  const { packets } = extractOpusFromWebm(buffer);
  const samples = packets.reduce((sum, packet) => sum + opusPacketSamples(packet), 0);
  return samples / 48000;
}

/**
 * Escolhe o melhor formato de gravação disponível no navegador.
 *
 * A ordem é por Opus, não por "quem evita trabalho". Ogg/Opus é o formato que o
 * próprio WhatsApp usa em áudio, e é o que a Cloud API aceita sem reclamar.
 *
 * MP4 fica por último de propósito. O MediaRecorder grava MP4 fragmentado, e a
 * Meta recusa esse arquivo com o código 131053 ("Media upload error"). Antes o
 * MP4 vinha antes do WebM porque dispensava o remux; quando o Chrome passou a
 * oferecer `audio/mp4`, todo áudio gravado no Chrome caiu nesse ramo e parou de
 * ser entregue. Só o Safari chega aqui embaixo hoje, por não gravar mais nada.
 */
export function pickRecordingMimeType(
  isSupported: (type: string) => boolean,
): { mimeType: string; needsRemux: boolean } | null {
  const candidates: { mimeType: string; needsRemux: boolean }[] = [
    { mimeType: "audio/ogg;codecs=opus", needsRemux: false },
    { mimeType: "audio/ogg", needsRemux: false },
    { mimeType: "audio/webm;codecs=opus", needsRemux: true },
    { mimeType: "audio/webm", needsRemux: true },
    { mimeType: "audio/mp4", needsRemux: false },
    { mimeType: "audio/aac", needsRemux: false },
  ];

  for (const candidate of candidates) {
    if (isSupported(candidate.mimeType)) return candidate;
  }

  return null;
}

/** Mime type final enviado à Meta, já sem os parâmetros de codec. */
export function normalizeAudioMimeType(mimeType: string, remuxed: boolean): string {
  if (remuxed) return OGG_MIME_TYPE;
  return mimeType.split(";")[0]?.trim() ?? mimeType;
}
