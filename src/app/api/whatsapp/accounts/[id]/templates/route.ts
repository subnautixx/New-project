import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeRequest } from "@/lib/auth/api";
import { getAccountWithSecrets, userCanSendFromAccount } from "@/lib/whatsapp/accounts";
import { listMessageTemplates } from "@/lib/whatsapp/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Templates aprovados de um número.
 *
 * A consulta à Meta acontece no servidor: o token nunca sai daqui. Só devolve
 * templates para quem tem permissão de enviar por aquele número.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeRequest();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const canSend = await userCanSendFromAccount(auth.actor.id, auth.actor.role === "admin", id);
  if (!canSend) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const account = await getAccountWithSecrets(id);
  if (!account) {
    return NextResponse.json({ error: "account_not_configured" }, { status: 503 });
  }

  if (!account.account.waba_id) {
    return NextResponse.json(
      {
        error: "missing_waba_id",
        message: "Cadastre o WABA ID deste número para listar os templates aprovados.",
      },
      { status: 422 },
    );
  }

  const templates = await listMessageTemplates(account.credentials, account.account.waba_id);

  return NextResponse.json({ templates });
}
