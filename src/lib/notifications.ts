/**
 * Aviso de mensagem nova.
 *
 * O CRM fica aberto numa aba o dia inteiro. Sem aviso, o cliente responde e
 * ninguém vê até alguém lembrar de olhar — e numa loja onde resposta rápida
 * fecha venda, isso é dinheiro parado.
 *
 * Duas decisões deliberadas:
 *
 * A permissão NÃO é pedida ao entrar. Pedir de cara, antes de a pessoa saber
 * para que serve, é o jeito mais rápido de tomar um "bloquear" definitivo —
 * e depois disso não há segunda chance pelo navegador. Quem pede é a própria
 * pessoa, clicando num convite discreto na inbox.
 *
 * E não notifica o que já está na tela. Avisar sobre a conversa que a pessoa
 * está lendo, com a aba na frente, treina todo mundo a ignorar o aviso.
 */

export type PermissionState = "indisponivel" | "concedida" | "negada" | "nao-pedida";

export interface NotifyDecision {
  notify: boolean;
  reason: "aba-oculta" | "outra-conversa" | null;
}

/**
 * Decide se vale avisar. Separado da API do navegador de propósito: é aqui
 * que mora a regra, e regra se testa.
 */
export function shouldNotify(params: {
  direction: "inbound" | "outbound";
  conversationId: string;
  openConversationId: string | null;
  documentHidden: boolean;
}): NotifyDecision {
  // Mensagem que a própria loja enviou nunca vira aviso.
  if (params.direction !== "inbound") return { notify: false, reason: null };

  // Aba escondida: avisa mesmo que seja a conversa aberta — a pessoa não está vendo.
  if (params.documentHidden) return { notify: true, reason: "aba-oculta" };

  // Aba visível e conversa aberta: ela já está lendo. Avisar seria ruído.
  if (params.conversationId === params.openConversationId) {
    return { notify: false, reason: null };
  }

  return { notify: true, reason: "outra-conversa" };
}

/** Estado atual da permissão, sem pedir nada. */
export function permissionState(): PermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "indisponivel";

  switch (Notification.permission) {
    case "granted":
      return "concedida";
    case "denied":
      return "negada";
    default:
      return "nao-pedida";
  }
}

/** Pede a permissão. Só chame a partir de um clique da pessoa. */
export async function requestPermission(): Promise<PermissionState> {
  if (permissionState() === "indisponivel") return "indisponivel";

  const result = await Notification.requestPermission();
  return result === "granted" ? "concedida" : result === "denied" ? "negada" : "nao-pedida";
}

/**
 * Mostra o aviso. `tag` faz a mesma conversa substituir o aviso anterior em vez
 * de empilhar dez balões quando o cliente manda dez mensagens seguidas.
 */
export function showMessageNotification(params: {
  contactName: string;
  preview: string;
  conversationId: string;
  onClick: () => void;
}): void {
  if (permissionState() !== "concedida") return;

  const notification = new Notification(params.contactName, {
    body: params.preview || "Enviou uma mensagem",
    tag: `conversa-${params.conversationId}`,
    icon: "/icon.svg",
  });

  notification.onclick = () => {
    window.focus();
    params.onClick();
    notification.close();
  };
}
