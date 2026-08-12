import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeAdmin, clientIp, writeAuditLog } from "@/lib/auth/api";
import { normalizePhone } from "@/lib/phone";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10, "Use pelo menos 10 caracteres"),
  fullName: z.string().trim().min(2).max(120),
  role: z.enum(["admin", "consignador"]).default("consignador"),
  phone: z.string().trim().optional(),
  whatsappAccountIds: z.array(z.string().uuid()).default([]),
});

/** Criação de usuário. Só admin — a chave de service_role vive apenas aqui. */
export async function POST(request: NextRequest) {
  const auth = await authorizeAdmin();
  if (!auth.ok) return auth.response;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const { email, password, fullName, role, phone, whatsappAccountIds } = parsed.data;
  const admin = createSupabaseAdminClient();

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error || !created.user) {
    return NextResponse.json(
      { error: "create_failed", message: error?.message ?? "Falha ao criar usuário" },
      { status: 400 },
    );
  }

  // O trigger handle_new_auth_user já criou o profile com papel padrão;
  // aqui aplicamos os campos que só o admin pode definir.
  await admin
    .from("profiles")
    .update({ full_name: fullName, role, phone: normalizePhone(phone ?? null), email })
    .eq("id", created.user.id);

  if (whatsappAccountIds.length > 0) {
    await admin.from("user_whatsapp_permissions").insert(
      whatsappAccountIds.map((accountId) => ({
        user_id: created.user!.id,
        whatsapp_account_id: accountId,
      })),
    );
  }

  await writeAuditLog({
    actorUserId: auth.actor.id,
    action: "user.create",
    entityType: "profile",
    entityId: created.user.id,
    metadata: { email, role, whatsapp_accounts: whatsappAccountIds.length },
    ip: clientIp(request.headers),
  });

  return NextResponse.json({ id: created.user.id }, { status: 201 });
}
