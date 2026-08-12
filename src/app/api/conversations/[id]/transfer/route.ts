import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeAdmin, clientIp, writeAuditLog } from "@/lib/auth/api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  toUserId: z.string().uuid(),
  reason: z.string().trim().max(280).optional(),
  /** Move também o cliente, para que prospecções futuras sigam o novo dono. */
  transferContact: z.boolean().default(true),
});

/**
 * Transferência de conversa entre consignadores. Exclusiva do administrador —
 * verificado aqui, na RLS e por trigger no banco.
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

  const { toUserId, reason, transferContact } = parsed.data;
  const admin = createSupabaseAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("id, full_name, is_active")
    .eq("id", toUserId)
    .maybeSingle();

  if (!target || !target.is_active) {
    return NextResponse.json(
      { error: "invalid_target", message: "Usuário de destino inexistente ou desativado." },
      { status: 422 },
    );
  }

  const { data: conversation } = await admin
    .from("conversations")
    .select("id, contact_id, assigned_user_id")
    .eq("id", id)
    .maybeSingle();

  if (!conversation) {
    return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
  }

  if (conversation.assigned_user_id === toUserId) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  // O trigger no banco grava o histórico em conversation_assignments.
  const { error } = await admin
    .from("conversations")
    .update({ assigned_user_id: toUserId })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "transfer_failed", message: error.message }, { status: 400 });
  }

  if (transferContact) {
    await admin.from("contacts").update({ owner_user_id: toUserId }).eq("id", conversation.contact_id);
  }

  if (reason) {
    const { data: latest } = await admin
      .from("conversation_assignments")
      .select("id")
      .eq("conversation_id", id)
      .eq("to_user_id", toUserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest) {
      await admin.from("conversation_assignments").update({ reason }).eq("id", latest.id);
    }
  }

  await writeAuditLog({
    actorUserId: auth.actor.id,
    action: "conversation.transfer",
    entityType: "conversation",
    entityId: id,
    metadata: {
      from_user_id: conversation.assigned_user_id,
      to_user_id: toUserId,
      transfer_contact: transferContact,
      reason: reason ?? null,
    },
    ip: clientIp(request.headers),
  });

  return NextResponse.json({ ok: true });
}
