import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeAdmin, clientIp, writeAuditLog } from "@/lib/auth/api";
import { normalizePhone } from "@/lib/phone";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ProfileRow } from "@/lib/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().optional(),
  // String vazia apaga o telefone; `null` faz o mesmo de forma explícita.
  phone: z.string().trim().max(30).nullable().optional(),
  role: z.enum(["admin", "consignador"]).optional(),
  isActive: z.boolean().optional(),
  whatsappAccountIds: z.array(z.string().uuid()).optional(),
});

/** Atualiza usuário: dados do perfil, papel, ativação e WhatsApps liberados. */
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

  const { fullName, email, phone, role, isActive, whatsappAccountIds } = parsed.data;
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
  if (phone !== undefined) updates.phone = normalizePhone(phone);

  // O e-mail vive em dois lugares: é a credencial de login, no Auth, e é o que
  // a equipe lê na tela, no perfil. Trocar só um dos dois faz a pessoa entrar
  // com um endereço e aparecer com outro.
  //
  // O Auth vem primeiro porque é ele que pode recusar — e-mail já usado por
  // outra conta. Se recusar, nada foi alterado ainda.
  if (email !== undefined) {
    const { error } = await admin.auth.admin.updateUserById(id, { email, email_confirm: true });

    if (error) {
      return NextResponse.json(
        {
          error: "email_update_failed",
          message:
            error.message.toLowerCase().includes("already")
              ? "Este e-mail já está em uso por outro usuário."
              : `Não foi possível alterar o e-mail: ${error.message}`,
        },
        { status: 422 },
      );
    }

    updates.email = email;
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await admin.from("profiles").update(updates).eq("id", id);
    if (error) {
      // Se o e-mail já mudou no Auth e o perfil falhou aqui, os dois ficam
      // divergentes até alguém salvar de novo. A mensagem diz isso em vez de
      // deixar o admin achar que nada aconteceu.
      return NextResponse.json(
        {
          error: "update_failed",
          message:
            email !== undefined
              ? `O e-mail de login foi alterado, mas o perfil não pôde ser salvo: ${error.message}. Salve novamente.`
              : error.message,
        },
        { status: 400 },
      );
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
