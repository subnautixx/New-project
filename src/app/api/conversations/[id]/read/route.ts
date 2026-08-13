import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeRequest } from "@/lib/auth/api";
import { getAccountWithSecrets } from "@/lib/whatsapp/accounts";
import { markMessageAsRead } from "@/lib/whatsapp/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * Marca a conversa como lida.
 *
 * Zera o contador local e avisa a Meta, para o cliente ver o tique azul —
 * do outro lado, "foi lido" é sinal de atendimento, e deixar isso de fora
 * fazia o CRM parecer menos responsivo do que o WhatsApp no celular.
 *
 * A RLS garante que só o dono da conversa (ou o admin) consegue.
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeRequest();
  if (!auth.ok) return auth.response;

  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const conversationId = parsed.data.id;

  const { data: conversation, error } = await auth.supabase
    .from("conversations")
    .update({ unread_count: 0 })
    .eq("id", conversationId)
    .select("id, whatsapp_account_id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "update_failed" }, { status: 400 });
  }

  if (!conversation) {
    return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
  }

  // A Meta marca a conversa inteira como lida a partir da última recebida.
  const { data: lastInbound } = await auth.supabase
    .from("messages")
    .select("provider_message_id")
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .not("provider_message_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastInbound?.provider_message_id) {
    const account = await getAccountWithSecrets(conversation.whatsapp_account_id);

    // Falha aqui não invalida a leitura local: o contador já foi zerado e o
    // consignador não pode ficar preso porque a Meta oscilou.
    if (account) {
      await markMessageAsRead(account.credentials, lastInbound.provider_message_id).catch(
        () => false,
      );
    }
  }

  return NextResponse.json({ ok: true });
}
