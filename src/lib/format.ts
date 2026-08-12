import { APP_TIME_ZONE, addDaysInAppTz, dayKeyInAppTz } from "@/lib/time";

/**
 * Formatação de data e hora com fuso fixo da operação.
 *
 * Fixar o fuso é o que garante que o mesmo instante apareça igual no HTML
 * gerado no servidor (UTC) e no navegador do consignador (Brasília) — sem
 * isso, além do horário errado, cada timestamp causaria divergência de
 * hidratação no React.
 */

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: APP_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: APP_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: APP_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
});

const shortDateYearFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: APP_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

const longDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: APP_TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
});

const yearFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
});

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Horário no padrão de aplicativo de mensagem: hoje mostra a hora, ontem
 * mostra "Ontem", o resto mostra a data. Sem "há 3 minutos" — em operação, o
 * horário exato é mais útil que o relativo.
 */
export function formatListTime(value: string | null | undefined): string {
  const date = toDate(value);
  if (!date) return "";

  const now = new Date();
  const key = dayKeyInAppTz(date);

  if (key === dayKeyInAppTz(now)) return timeFormatter.format(date);
  if (key === dayKeyInAppTz(addDaysInAppTz(now, -1))) return "Ontem";
  if (yearFormatter.format(date) === yearFormatter.format(now)) {
    return shortDateFormatter.format(date);
  }
  return shortDateYearFormatter.format(date);
}

export function formatTime(value: string | null | undefined): string {
  const date = toDate(value);
  return date ? timeFormatter.format(date) : "";
}

export function formatDateTime(value: string | null | undefined): string {
  const date = toDate(value);
  return date ? `${dateFormatter.format(date)} às ${timeFormatter.format(date)}` : "—";
}

export function formatDate(value: string | null | undefined): string {
  const date = toDate(value);
  return date ? dateFormatter.format(date) : "—";
}

/** Separador de dia dentro da conversa. */
export function formatDayDivider(value: string): string {
  const date = toDate(value);
  if (!date) return "";

  const now = new Date();
  const key = dayKeyInAppTz(date);

  if (key === dayKeyInAppTz(now)) return "Hoje";
  if (key === dayKeyInAppTz(addDaysInAppTz(now, -1))) return "Ontem";

  return longDateFormatter.format(date);
}

/** Agrupamento por dia — usa o dia local, não o dia UTC. */
export function dayKey(value: string | null | undefined): string {
  return dayKeyInAppTz(value);
}
