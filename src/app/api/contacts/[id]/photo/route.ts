import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeRequest } from "@/lib/auth/api";
import { rateLimit } from "@/lib/rate-limit";
import { CONTACT_PHOTO_BUCKET, buildPhotoPath, validatePhoto } from "@/lib/contacts/photo";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serve a foto do cliente.
 *
 * O bucket é privado: foto de cliente é dado pessoal e não pode ficar num link
 * público adivinhável. A consulta usa o cliente da sessão, então a RLS decide
 * quem enxerga — cliente de outro consignador simplesmente não existe aqui.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeRequest();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const { data: contact } = await auth.supabase
    .from("contacts")
    .select("id, photo_path")
    .eq("id", id)
    .maybeSingle();

  if (!contact?.photo_path) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: blob, error } = await createSupabaseAdminClient()
    .storage.from(CONTACT_PHOTO_BUCKET)
    .download(contact.photo_path);

  if (error || !blob) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return new NextResponse(blob.stream(), {
    status: 200,
    headers: {
      "Content-Type": blob.type || "image/jpeg",
      // Privado e longo: o caminho muda a cada troca de foto, então o cache
      // nunca serve uma imagem desatualizada.
      "Cache-Control": "private, max-age=86400",
    },
  });
}

const uploadSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(3).max(120),
  sizeBytes: z.number().int().positive(),
});

/** Emite URL assinada para o navegador subir a foto direto ao Storage. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeRequest();
  if (!auth.ok) return auth.response;

  const limit = rateLimit(`photo:${auth.actor.id}`, 20, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Muitos envios em pouco tempo." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const parsed = uploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const validation = validatePhoto(parsed.data.mimeType, parsed.data.sizeBytes);
  if (!validation.ok) {
    return NextResponse.json({ error: "invalid_photo", message: validation.error }, { status: 422 });
  }

  // Confere pela sessão que este usuário pode mexer neste cliente antes de
  // emitir qualquer token de escrita.
  const { data: contact } = await auth.supabase
    .from("contacts")
    .select("id, photo_path")
    .eq("id", id)
    .maybeSingle();

  if (!contact) {
    return NextResponse.json({ error: "contact_not_found" }, { status: 404 });
  }

  const admin = createSupabaseAdminClient();
  const path = buildPhotoPath(id, parsed.data.filename);

  const { data, error } = await admin.storage
    .from(CONTACT_PHOTO_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    return NextResponse.json({ error: "upload_url_failed" }, { status: 500 });
  }

  return NextResponse.json({
    path: data.path,
    token: data.token,
    bucket: CONTACT_PHOTO_BUCKET,
    previousPath: contact.photo_path,
  });
}

/** Remove a foto atual. */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeRequest();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  // O update passa pela RLS: quem não é dono do cliente não altera nada.
  const { data: updated, error } = await auth.supabase
    .from("contacts")
    .update({ photo_path: null })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    return NextResponse.json({ error: "update_failed" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
