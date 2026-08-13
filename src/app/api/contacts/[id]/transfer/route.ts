import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeAdmin, clientIp, writeAuditLog } from "@/lib/auth/api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  toUserId: z.string().uuid(),
  reason: z.string().trim().max(280).optional(),
});

/**
 * Transfere um cliente entre consignadores.
 *
 * Complementa a transferência a partir da conversa: um prospect recém
 * cadastrado, que ainda não recebeu mensagem, não tem conversa nenhuma — e
 * antes disso não havia como passá-lo para outro vendedor.
 *
 * O trigger `sync_conversation_owner` propaga a mudança para as conversas
 * existentes, então os dois caminhos convergem para o mesmo estado.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { toUserId, reason } = parsed.data;
  const admin = createSupabaseAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("id, is_active")
    .eq("id", toUserId)
    .maybeSingle();

  if (!target || !target.is_active) {
    return NextResponse.json(
      { error: "invalid_target", message: "Usuário de destino inexistente ou desativado." },
      { status: 422 },
    );
  }

  const { data: contact } = await admin
    .from("contacts")
    .select("id, owner_user_id")
    .eq("id", id)
    .maybeSingle();

  if (!contact) {
    return NextResponse.json({ error: "contact_not_found" }, { status: 404 });
  }

  if (contact.owner_user_id === toUserId) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const { error } = await admin
    .from("contacts")
    .update({ owner_user_id: toUserId })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "transfer_failed", message: error.message }, { status: 400 });
  }

  await writeAuditLog({
    actorUserId: auth.actor.id,
    action: "contact.transfer",
    entityType: "contact",
    entityId: id,
    metadata: {
      from_user_id: contact.owner_user_id,
      to_user_id: toUserId,
      reason: reason ?? null,
    },
    ip: clientIp(request.headers),
  });

  return NextResponse.json({ ok: true });
}
