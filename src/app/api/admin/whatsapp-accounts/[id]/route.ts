import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeAdmin, clientIp, writeAuditLog } from "@/lib/auth/api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { WhatsappAccountRow } from "@/lib/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  displayName: z.string().trim().min(2).max(80).optional(),
  mode: z.enum(["shared", "individual"]).optional(),
  status: z.enum(["pending", "connected", "disconnected", "error"]).optional(),
  coexistenceEnabled: z.boolean().optional(),
  isActive: z.boolean().optional(),
  defaultOwnerUserId: z.string().uuid().nullish(),
  accessToken: z.string().trim().min(20).optional(),
  userIds: z.array(z.string().uuid()).optional(),
});

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

  const input = parsed.data;
  const admin = createSupabaseAdminClient();

  const updates: Partial<WhatsappAccountRow> = {};
  if (input.displayName !== undefined) updates.display_name = input.displayName;
  if (input.mode !== undefined) updates.mode = input.mode;
  if (input.status !== undefined) updates.status = input.status;
  if (input.coexistenceEnabled !== undefined) updates.coexistence_enabled = input.coexistenceEnabled;
  if (input.isActive !== undefined) updates.is_active = input.isActive;
  if (input.defaultOwnerUserId !== undefined) updates.default_owner_user_id = input.defaultOwnerUserId;

  if (Object.keys(updates).length > 0) {
    const { error } = await admin.from("whatsapp_accounts").update(updates).eq("id", id);
    if (error) {
      return NextResponse.json({ error: "update_failed", message: error.message }, { status: 400 });
    }
  }

  // Rotação de token: o valor antigo é sobrescrito e nunca registrado.
  if (input.accessToken) {
    await admin.from("whatsapp_account_secrets").upsert({
      whatsapp_account_id: id,
      access_token: input.accessToken,
      updated_at: new Date().toISOString(),
    });
  }

  if (input.userIds) {
    await admin.from("user_whatsapp_permissions").delete().eq("whatsapp_account_id", id);

    if (input.userIds.length > 0) {
      await admin.from("user_whatsapp_permissions").insert(
        input.userIds.map((userId) => ({ user_id: userId, whatsapp_account_id: id })),
      );
    }
  }

  await writeAuditLog({
    actorUserId: auth.actor.id,
    action: "whatsapp_account.update",
    entityType: "whatsapp_account",
    entityId: id,
    metadata: { ...updates, token_rotated: Boolean(input.accessToken), users: input.userIds?.length },
    ip: clientIp(request.headers),
  });

  return NextResponse.json({ ok: true });
}

/** Remove o número da operação. Conversas e histórico são preservados. */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  // Desativa em vez de apagar: `conversations.whatsapp_account_id` é
  // `on delete restrict` justamente para não perder histórico de atendimento.
  const { error } = await admin
    .from("whatsapp_accounts")
    .update({ is_active: false, status: "disconnected" })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "delete_failed", message: error.message }, { status: 400 });
  }

  // O token sai do banco imediatamente.
  await admin.from("whatsapp_account_secrets").delete().eq("whatsapp_account_id", id);

  await writeAuditLog({
    actorUserId: auth.actor.id,
    action: "whatsapp_account.disconnect",
    entityType: "whatsapp_account",
    entityId: id,
    ip: clientIp(request.headers),
  });

  return NextResponse.json({ ok: true });
}
