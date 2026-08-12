import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifica o cabeçalho `X-Hub-Signature-256` da Meta.
 *
 * Precisa do corpo CRU (string exata recebida). Se o JSON for reserializado,
 * a assinatura não bate — por isso a rota lê `request.text()` antes de parsear.
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string | null | undefined,
): boolean {
  if (!appSecret) return false;
  if (!signatureHeader) return false;

  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) return false;

  const received = signatureHeader.slice(prefix.length).trim();
  if (!/^[0-9a-f]+$/i.test(received)) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

  const receivedBuf = Buffer.from(received, "hex");
  const expectedBuf = Buffer.from(expected, "hex");

  // timingSafeEqual explode com tamanhos diferentes; compare antes.
  if (receivedBuf.length !== expectedBuf.length) return false;

  return timingSafeEqual(receivedBuf, expectedBuf);
}

/**
 * Handshake de verificação do webhook (GET).
 * Retorna o `hub.challenge` quando o token confere, senão null.
 */
export function resolveVerificationChallenge(
  params: URLSearchParams,
  expectedToken: string | null | undefined,
): string | null {
  if (!expectedToken) return null;

  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) return null;

  const a = Buffer.from(token);
  const b = Buffer.from(expectedToken);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  return challenge;
}
