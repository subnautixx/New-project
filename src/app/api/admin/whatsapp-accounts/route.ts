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

  // Sem token o número não envia nada. Se esta gravação falhar em silêncio, a
  // tela mostra um número "conectado" que nunca vai funcionar, e a falha só
  // aparece na primeira tentativa de envio — longe daqui, difícil de ligar à
  // causa. Melhor desfazer o cadastro e dizer o que houve.
  const { error: secretError } = await admin.from("whatsapp_account_secrets").insert({
    whatsapp_account_id: account.id,
    access_token: input.accessToken,
  });

  if (secretError) {
    await admin.from("whatsapp_accounts").delete().eq("id", account.id);

    return NextResponse.json(
      {
        error: "secret_failed",
        message: "Não foi possível guardar o token deste número. Tente cadastrar de novo.",
      },
      { status: 500 },
    );
  }

  const userIds = new Set(input.userIds);
  if (input.defaultOwnerUserId) userIds.add(input.defaultOwnerUserId);

  if (userIds.size > 0) {
    const { error: permissionError } = await admin.from("user_whatsapp_permissions").insert(
      [...userIds].map((userId) => ({
        user_id: userId,
        whatsapp_account_id: account.id,
      })),
    );

    // O número existe e funciona; só as liberações falharam. Não desfaz o
    // cadastro por isso — mas também não finge que deu tudo certo, senão
    // alguém vai passar a tarde sem entender por que não consegue enviar.
    if (permissionError) {
      return NextResponse.json(
        {
          id: account.id,
          warning: "permissions_failed",
          message:
            "Número cadastrado, mas as liberações de acesso não foram salvas. Ajuste quem pode usar este número em Configurações · WhatsApps.",
        },
        { status: 207 },
      );
    }
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
