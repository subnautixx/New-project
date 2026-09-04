import type { MessageType } from "@/lib/types/database";

/** Bucket privado onde ficam as mídias que o CRM envia. */
export const MEDIA_BUCKET = "whatsapp-media";

/**
 * Tipos aceitos pela Cloud API, com o limite de tamanho de cada categoria.
 * Validar aqui evita subir 15 MB para o Storage e só então descobrir que a
 * Meta recusaria o arquivo.
 */
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/3gpp"];
const AUDIO_TYPES = ["audio/aac", "audio/mpeg", "audio/mp4", "audio/ogg", "audio/amr"];
const DOCUMENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];

export const ACCEPTED_MIME_TYPES = [
  ...IMAGE_TYPES,
  ...VIDEO_TYPES,
  ...AUDIO_TYPES,
  ...DOCUMENT_TYPES,
];

const MB = 1024 * 1024;

/** Limite por categoria, exposto para o navegador poder encolher antes de subir. */
export const LIMIT_FOR_KIND: Record<"image" | "video" | "audio" | "document", number> = {
  image: 5 * MB,
  video: 16 * MB,
  audio: 16 * MB,
  document: 16 * MB,
};

export type MediaKind = "image" | "video" | "audio" | "document";

export interface MediaValidation {
  ok: boolean;
  kind: MediaKind | null;
  messageType: MessageType | null;
  error: string | null;
}

/** Categoria da mídia a partir do mime type declarado. */
export function resolveMediaKind(mimeType: string): MediaKind | null {
  const type = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";

  if (IMAGE_TYPES.includes(type)) return "image";
  if (VIDEO_TYPES.includes(type)) return "video";
  if (AUDIO_TYPES.includes(type)) return "audio";
  if (DOCUMENT_TYPES.includes(type)) return "document";

  return null;
}

/** Valida tipo e tamanho antes de qualquer upload. */
export function validateMedia(mimeType: string, sizeBytes: number): MediaValidation {
  const kind = resolveMediaKind(mimeType);

  if (!kind) {
    return {
      ok: false,
      kind: null,
      messageType: null,
      error: "Tipo de arquivo não suportado pelo WhatsApp.",
    };
  }

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, kind, messageType: null, error: "Arquivo vazio." };
  }

  const limit = LIMIT_FOR_KIND[kind];
  if (sizeBytes > limit) {
    return {
      ok: false,
      kind,
      messageType: null,
      error: `Arquivo acima do limite de ${Math.round(limit / MB)} MB para ${LABEL[kind]}.`,
    };
  }

  return { ok: true, kind, messageType: kind, error: null };
}

const LABEL: Record<MediaKind, string> = {
  image: "imagem",
  video: "vídeo",
  audio: "áudio",
  document: "documento",
};

/**
 * Caminho no bucket. Inclui a conversa para facilitar rastreio e um sufixo
 * aleatório para dois arquivos de mesmo nome não colidirem.
 */
export function buildMediaPath(conversationId: string, filename: string): string {
  const safeName = sanitizeFilename(filename);
  const unique = crypto.randomUUID();
  return `outbound/${conversationId}/${unique}-${safeName}`;
}

/** Remove separadores de caminho e caracteres que quebram a chave do objeto. */
export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "arquivo";

  const cleaned = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // marcas de acento separadas pelo NFD
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(0, 80);

  return cleaned.length > 0 ? cleaned : "arquivo";
}
