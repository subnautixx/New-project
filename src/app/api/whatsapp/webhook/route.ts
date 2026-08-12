import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/types/database";
import {
  claimWebhookEvent,
  processInboundMessage,
  processStatusUpdate,
  releaseWebhookEvent,
} from "@/lib/whatsapp/ingest";
import { parseWebhook } from "@/lib/whatsapp/parse";
import { resolveVerificationChallenge, verifyMetaSignature } from "@/lib/whatsapp/signature";
import type { MetaWebhookBody } from "@/lib/whatsapp/types";

// Precisa de Node: a verificação de assinatura usa node:crypto.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Handshake de verificação do webhook. */
export async function GET(request: NextRequest) {
  const challenge = resolveVerificationChallenge(
    request.nextUrl.searchParams,
    serverEnv().META_WEBHOOK_VERIFY_TOKEN,
  );

  if (!challenge) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

/**
 * Recebimento de eventos.
 *
 * Ordem: assinatura -> idempotência -> gravação -> atualização.
 * Um evento inválido ou impossível de processar responde 200, senão a Meta
 * reentrega para sempre. Falha transitória (banco fora) responde 500 de
 * propósito, para que a reentrega aconteça.
 */
export async function POST(request: NextRequest) {
  // O corpo CRU é obrigatório: reserializar o JSON invalida o HMAC.
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  const signatureValid = verifyMetaSignature(
    rawBody,
    signature,
    serverEnv().META_APP_SECRET,
  );

  if (!signatureValid) {
    // Não processamos nada sem assinatura válida — este endpoint é público.
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let body: MetaWebhookBody;
  try {
    body = JSON.parse(rawBody) as MetaWebhookBody;
  } catch {
    return NextResponse.json({ received: true, ignored: "invalid_json" }, { status: 200 });
  }

  const events = parseWebhook(body);
  if (events.length === 0) {
    return NextResponse.json({ received: true, processed: 0 }, { status: 200 });
  }

  const admin = createSupabaseAdminClient();
  let processed = 0;
  let duplicates = 0;

  for (const event of events) {
    let claimed = false;

    try {
      claimed = await claimWebhookEvent(admin, event.eventKey, body as unknown as Json, true);

      if (!claimed) {
        duplicates += 1;
        continue;
      }

      const outcome =
        event.kind === "message"
          ? await processInboundMessage(admin, event)
          : await processStatusUpdate(admin, event);

      if (outcome.status === "processed") processed += 1;
    } catch (error) {
      // Devolve a reserva para que a reentrega da Meta consiga processar.
      if (claimed) {
        await releaseWebhookEvent(admin, event.eventKey).catch(() => undefined);
      }

      console.error("[whatsapp/webhook] falha ao processar evento", {
        eventKey: event.eventKey,
        kind: event.kind,
        error: error instanceof Error ? error.message : String(error),
      });

      return NextResponse.json({ error: "processing_failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true, processed, duplicates }, { status: 200 });
}
