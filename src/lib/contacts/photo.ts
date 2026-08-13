import { sanitizeFilename } from "@/lib/whatsapp/media";

/** Bucket privado das fotos de cliente. */
export const CONTACT_PHOTO_BUCKET = "contact-photos";

/**
 * A Cloud API da Meta não expõe a foto de perfil de um contato — o webhook
 * traz apenas `profile.name` e `wa_id`. Por isso a foto é carregada pelo
 * consignador. Formatos limitados aos que todo navegador exibe.
 */
export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export interface PhotoValidation {
  ok: boolean;
  error: string | null;
}

export function validatePhoto(mimeType: string, sizeBytes: number): PhotoValidation {
  const type = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";

  if (!ACCEPTED_PHOTO_TYPES.includes(type)) {
    return { ok: false, error: "Use uma imagem JPG, PNG ou WEBP." };
  }

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, error: "Arquivo vazio." };
  }

  if (sizeBytes > MAX_PHOTO_BYTES) {
    return { ok: false, error: "Imagem acima de 5 MB." };
  }

  return { ok: true, error: null };
}

/**
 * Caminho no bucket. O prefixo com o id do cliente permite amarrar o upload à
 * pessoa certa no servidor, e o sufixo aleatório evita que trocar a foto
 * reaproveite a URL antiga em cache.
 */
export function buildPhotoPath(contactId: string, filename: string): string {
  return `contacts/${contactId}/${crypto.randomUUID()}-${sanitizeFilename(filename)}`;
}

/** Endereço da rota autenticada que serve a foto. */
export function contactPhotoUrl(contactId: string, photoPath: string | null): string | null {
  if (!photoPath) return null;

  // O caminho entra como parâmetro para o navegador buscar de novo quando a
  // foto muda, em vez de servir a anterior do cache.
  return `/api/contacts/${contactId}/photo?v=${encodeURIComponent(photoPath.slice(-24))}`;
}
