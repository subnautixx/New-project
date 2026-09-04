/**
 * A janela de 24 horas da Meta.
 *
 * Depois que ela fecha, só um modelo aprovado reabre a conversa — e modelo
 * custa, demora para aprovar e nem sempre existe um que sirva. Na prática,
 * deixar a janela fechar costuma custar o atendimento.
 *
 * O sistema já sabia dizer que a janela FECHOU. O que faltava era avisar
 * enquanto ainda dá para agir.
 */

/** Abaixo disto a conversa entra em alerta na lista e no cabeçalho. */
export const WINDOW_WARNING_HOURS = 4;

export type WindowState = "aberta" | "acabando" | "fechada" | "sem-janela";

export interface ServiceWindow {
  state: WindowState;
  /** Minutos restantes; negativo depois de fechada, nulo sem janela. */
  minutesLeft: number | null;
  /** Texto curto para a interface, ou nulo quando não há o que dizer. */
  label: string | null;
}

export function describeServiceWindow(
  expiresAt: string | null,
  now: Date = new Date(),
): ServiceWindow {
  if (!expiresAt) {
    return { state: "sem-janela", minutesLeft: null, label: null };
  }

  const minutesLeft = Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 60_000);

  if (minutesLeft <= 0) {
    return { state: "fechada", minutesLeft, label: "Janela fechada" };
  }

  if (minutesLeft > WINDOW_WARNING_HOURS * 60) {
    return { state: "aberta", minutesLeft, label: null };
  }

  // Menos de uma hora conta em minutos: "faltam 3h" quando faltam 40 minutos
  // é o tipo de arredondamento que faz alguém perder a janela.
  const label =
    minutesLeft < 60
      ? `Faltam ${minutesLeft} min para responder`
      : `Faltam ${Math.floor(minutesLeft / 60)}h para responder`;

  return { state: "acabando", minutesLeft, label };
}
