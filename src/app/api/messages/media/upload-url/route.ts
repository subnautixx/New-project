import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeRequest } from "@/lib/auth/api";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildMediaPath, MEDIA_BUCKET, validateMedia } from "@/lib/whatsapp/media";
import { authorizeConversationSend } from "@/lib/whatsapp/send-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(3).max(120),
  sizeBytes: z.number().int().positive(),
});

/**
 * Emite uma URL assinada para o navegador subir o arquivo direto ao Storage.
 *
 * A permissão é conferida AQUI, antes de emitir o token: quem não pode enviar
 * naquela conversa não recebe URL nenhuma. O binário em si não passa pela
 * função serverless, que na Vercel aceita poucos megabytes por requisição.
 */
export async function POST(request: NextRequest) {
  const auth = await authorizeRequest();
  if (!auth.ok) return auth.response;

  const { actor, supabase } = auth;

  const limit = rateLimit(`upload:${actor.id}`, 20, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Muitos envios em pouco tempo. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { conversationId, filename, mimeType, sizeBytes } = parsed.data;

  // Recusa tipo e tamanho antes de gastar upload — a Meta recusaria depois.
  const validation = validateMedia(mimeType, sizeBytes);
  if (!validation.ok) {
    return NextResponse.json(
      { error: "invalid_media", message: validation.error },
      { status: 422 },
    );
  }

  const guard = await authorizeConversationSend(supabase, actor, conversationId);
  if (!guard.ok) return guard.response;

  const path = buildMediaPath(conversationId, filename);

  const { data, error } = await createSupabaseAdminClient()
    .storage.from(MEDIA_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    return NextResponse.json(
      { error: "upload_url_failed", message: error?.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    path: data.path,
    token: data.token,
    bucket: MEDIA_BUCKET,
    kind: validation.kind,
  });
}
