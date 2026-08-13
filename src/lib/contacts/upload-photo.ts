"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Sobe a foto e amarra ao cliente.
 *
 * Mesmo caminho da mídia das conversas: o backend confere a permissão e emite
 * uma URL assinada, e o binário vai do navegador direto para o Storage — a
 * função serverless da Vercel aceita poucos megabytes por requisição, e foto
 * de celular passa disso.
 */
export async function uploadContactPhoto(
  contactId: string,
  file: File,
): Promise<{ ok: boolean; error: string | null }> {
  const response = await fetch(`/api/contacts/${contactId}/photo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, error: payload?.message ?? "Não foi possível preparar o envio da foto." };
  }

  const { path, token, bucket, previousPath } = (await response.json()) as {
    path: string;
    token: string;
    bucket: string;
    previousPath: string | null;
  };

  const supabase = createSupabaseBrowserClient();

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(path, token, file, { contentType: file.type });

  if (uploadError) {
    return { ok: false, error: "Falha ao enviar a foto." };
  }

  // A RLS decide se este usuário pode alterar o cliente.
  const { error: updateError } = await supabase
    .from("contacts")
    .update({ photo_path: path })
    .eq("id", contactId);

  if (updateError) {
    return { ok: false, error: "Foto enviada, mas não foi possível vinculá-la ao cliente." };
  }

  // Só remove a anterior depois que a nova está gravada: se algo falhar no
  // meio, o cliente continua com a foto antiga em vez de ficar sem nenhuma.
  if (previousPath) {
    await supabase.storage.from(bucket).remove([previousPath]).catch(() => undefined);
  }

  return { ok: true, error: null };
}
