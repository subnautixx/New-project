import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeRequest } from "@/lib/auth/api";
import { getAccountWithSecrets } from "@/lib/whatsapp/accounts";
import { downloadMedia, resolveMediaUrl } from "@/lib/whatsapp/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serve a mídia de uma mensagem.
 *
 * A URL que a Meta devolve expira em minutos e exige o token de acesso, então
 * ela nunca vai para o navegador. O CRM baixa no servidor e repassa o binário,
 * depois de confirmar pela RLS que este usuário pode ver esta conversa.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ messageId: string }> },
) {
  const auth = await authorizeRequest();
  if (!auth.ok) return auth.response;

  const { messageId } = await context.params;
  if (!z.string().uuid().safeParse(messageId).success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  // Consulta pelo cliente da sessão: se a conversa não é do usuário, some.
  const { data: message } = await auth.supabase
    .from("messages")
    .select("id, media_id, media_mime_type, media_filename, whatsapp_account_id")
    .eq("id", messageId)
    .maybeSingle();

  if (!message?.media_id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const account = await getAccountWithSecrets(message.whatsapp_account_id);
  if (!account) {
    return NextResponse.json({ error: "account_not_configured" }, { status: 503 });
  }

  const resolved = await resolveMediaUrl(account.credentials, message.media_id);
  if (!resolved) {
    return NextResponse.json({ error: "media_expired" }, { status: 404 });
  }

  const upstream = await downloadMedia(account.credentials, resolved.url);
  if (!upstream?.body) {
    return NextResponse.json({ error: "media_unavailable" }, { status: 502 });
  }

  const contentType = message.media_mime_type ?? resolved.mimeType ?? "application/octet-stream";

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      // Privado: a mídia é de um cliente, não pode ficar em cache compartilhado.
      "Cache-Control": "private, max-age=300",
      ...(message.media_filename
        ? { "Content-Disposition": `inline; filename="${encodeURIComponent(message.media_filename)}"` }
        : {}),
    },
  });
}
