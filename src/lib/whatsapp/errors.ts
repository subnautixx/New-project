/**
 * Traduz a falha da Meta para o que a pessoa na loja precisa fazer.
 *
 * O erro cru da Graph API é escrito para quem programa: "Error validating
 * access token: Session has expired". O consignador lê isso, conclui que o
 * sistema quebrou e liga para alguém. A mensagem certa diz quem resolve.
 *
 * Também decide o que vale reenviar: erro de rede e instabilidade da Meta
 * passam se tentar de novo; token errado e número inválido não passam nunca —
 * insistir só atrasa o aviso.
 */

/** Códigos de erro da Graph API relevantes para o envio. */
const TOKEN_CODES = new Set(["190", "102", "463", "467"]);
const PERMISSION_CODES = new Set(["10", "200", "299", "3"]);
const RATE_LIMIT_CODES = new Set(["4", "80007", "130429", "131048", "131056"]);
const TRANSIENT_CODES = new Set(["1", "2", "131000", "131016", "133016", "network_error"]);

export interface FriendlyError {
  /** O que aparece para quem está atendendo. */
  message: string;
  /** Vale tentar de novo automaticamente? */
  retryable: boolean;
  /** Alguém precisa mexer na configuração para destravar? */
  needsAdmin: boolean;
}

export function describeSendError(code: string | null, rawMessage: string | null): FriendlyError {
  const c = code ?? "unknown";

  if (TOKEN_CODES.has(c)) {
    return {
      message:
        "O acesso deste número ao WhatsApp expirou. Avise o administrador para cadastrar o número de novo em Configurações · WhatsApps.",
      retryable: false,
      needsAdmin: true,
    };
  }

  if (PERMISSION_CODES.has(c)) {
    return {
      message:
        "Este número não tem permissão para enviar pelo WhatsApp. O administrador precisa revisar a configuração na Meta.",
      retryable: false,
      needsAdmin: true,
    };
  }

  if (RATE_LIMIT_CODES.has(c)) {
    return {
      message:
        "O WhatsApp está limitando os envios deste número no momento. Aguarde alguns minutos antes de tentar de novo.",
      retryable: true,
      needsAdmin: false,
    };
  }

  // 131047: fora da janela de 24h — precisa de template. É a regra da Meta,
  // não uma falha, então a mensagem explica a saída.
  if (c === "131047" || c === "131051") {
    return {
      message:
        "Já passaram 24 horas desde a última mensagem do cliente. Para reabrir a conversa, use um modelo aprovado.",
      retryable: false,
      needsAdmin: false,
    };
  }

  if (c === "131026" || c === "131052") {
    return {
      message: "Este número não recebe mensagens pelo WhatsApp. Confira se está correto.",
      retryable: false,
      needsAdmin: false,
    };
  }

  if (TRANSIENT_CODES.has(c)) {
    return {
      message: "Instabilidade na conexão com o WhatsApp. A mensagem não foi enviada.",
      retryable: true,
      needsAdmin: false,
    };
  }

  return {
    message: rawMessage?.trim()
      ? `Não foi possível enviar: ${rawMessage}`
      : "Não foi possível enviar a mensagem.",
    retryable: false,
    needsAdmin: false,
  };
}

/** Resposta HTTP da Meta que vale reenviar mesmo sem código conhecido. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}
