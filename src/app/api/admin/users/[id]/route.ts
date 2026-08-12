import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeAdmin, clientIp, writeAuditLog } from "@/lib/auth/api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ProfileRow } from "@/lib/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  role: z.enum(["admin", "consignador"]).optional(),
  isActive: z.boolean().optional(),
  whatsappAccountIds: z.array(z.string().uuid()).optional(),
});

/** Atualiza usuário: papel, ativação e números de WhatsApp liberados. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { fullName, role, isActive, whatsappAccountIds } = parsed.data;
  const admin = createSupabaseAdminClient();

  // Um admin não pode se rebaixar nem se desativar: sobrando zero admins,
  // ninguém mais consegue administrar a operação.
  if (id === auth.actor.id && (role === "consignador" || isActive === false)) {
    return NextResponse.json(
      { error: "self_lockout", message: "Você não pode remover o próprio acesso de administrador." },
      { status: 422 },
    );
  }

  if (role === "consignador" || isActive === false) {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_active", true);

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "last_admin", message: "A operação precisa de pelo menos um administrador ativo." },
        { status: 422 },
      );
    }
  }

  const updates: Partial<ProfileRow> = {};
  if (fullName !== undefined) updates.full_name = fullName;
  if (role !== undefined) updates.role = role;
  if (isActive !== undefined) updates.is_active = isActive;

  if (Object.keys(updates).length > 0) {
    const { error } = await admin.from("profiles").update(updates).eq("id", id);
    if (error) {
      return NextResponse.json({ error: "update_failed", message: error.message }, { status: 400 });
    }
  }

  if (whatsappAccountIds) {
    await admin.from("user_whatsapp_permissions").delete().eq("user_id", id);

    if (whatsappAccountIds.length > 0) {
      await admin.from("user_whatsapp_permissions").insert(
        whatsappAccountIds.map((accountId) => ({
          user_id: id,
          whatsapp_account_id: accountId,
        })),
      );
    }
  }

  await writeAuditLog({
    actorUserId: auth.actor.id,
    action: "user.update",
    entityType: "profile",
    entityId: id,
    metadata: { ...updates, whatsapp_accounts: whatsappAccountIds?.length },
    ip: clientIp(request.headers),
  });

  return NextResponse.json({ ok: true });
}
