import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeAdmin, clientIp, writeAuditLog } from "@/lib/auth/api";
import { normalizePhone } from "@/lib/phone";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(8),
  phoneNumberId: z.string().trim().min(1),
  wabaId: z.string().trim().optional(),
  mode: z.enum(["shared", "individual"]),
  coexistenceEnabled: z.boolean().default(false),
  accessToken: z.string().trim().min(20),
  defaultOwnerUserId: z.string().uuid().nullish(),
  userIds: z.array(z.string().uuid()).default([]),
});

/**
 * Conecta um novo número.
 *
 * O access token entra em `whatsapp_account_secrets`, tabela sem policy de
 * leitura: nem o admin logado consegue puxá-la pelo cliente, apenas o backend.
 */
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

  const input = parsed.data;
  const phoneE164 = normalizePhone(input.phone);

  if (!phoneE164) {
    return NextResponse.json(
      { error: "invalid_phone", message: "Telefone inválido. Use DDD + número." },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();

  const { data: account, error } = await admin
    .from("whatsapp_accounts")
    .insert({
      display_name: input.displayName,
      phone_e164: phoneE164,
      phone_number_id: input.phoneNumberId,
      waba_id: input.wabaId ?? null,
      mode: input.mode,
      coexistence_enabled: input.coexistenceEnabled,
      default_owner_user_id: input.defaultOwnerUserId ?? null,
      status: "connected",
    })
    .select("id")
    .single();

  if (error || !account) {
    const duplicate = error?.code === "23505";
    return NextResponse.json(
      {
        error: duplicate ? "duplicate_phone_number_id" : "create_failed",
        message: duplicate ? "Este phone_number_id já está cadastrado." : error?.message,
      },
      { status: duplicate ? 409 : 400 },
    );
  }

  await admin.from("whatsapp_account_secrets").insert({
    whatsapp_account_id: account.id,
    access_token: input.accessToken,
  });

  const userIds = new Set(input.userIds);
  if (input.defaultOwnerUserId) userIds.add(input.defaultOwnerUserId);

  if (userIds.size > 0) {
    await admin.from("user_whatsapp_permissions").insert(
      [...userIds].map((userId) => ({
        user_id: userId,
        whatsapp_account_id: account.id,
      })),
    );
  }

  await writeAuditLog({
    actorUserId: auth.actor.id,
    action: "whatsapp_account.create",
    entityType: "whatsapp_account",
    entityId: account.id,
    // O token nunca entra no log de auditoria.
    metadata: { display_name: input.displayName, phone: phoneE164, mode: input.mode },
    ip: clientIp(request.headers),
  });

  return NextResponse.json({ id: account.id }, { status: 201 });
}
