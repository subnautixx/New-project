import { format, isThisYear, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Horário no padrão de aplicativo de mensagem: hoje mostra a hora, ontem
 * mostra "Ontem", o resto mostra a data. Sem "há 3 minutos" — em operação, o
 * horário exato é mais útil que o relativo.
 */
export function formatListTime(value: string | null | undefined): string {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  if (isToday(date)) return format(date, "HH:mm");
  if (isYesterday(date)) return "Ontem";
  if (isThisYear(date)) return format(date, "dd/MM");
  return format(date, "dd/MM/yy");
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : format(date, "HH:mm");
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : format(date, "dd/MM/yyyy 'às' HH:mm");
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : format(date, "dd/MM/yyyy");
}

/** Separador de dia dentro da conversa. */
export function formatDayDivider(value: string): string {
  const date = new Date(value);
  if (isToday(date)) return "Hoje";
  if (isYesterday(date)) return "Ontem";
  return format(date, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
}

export function dayKey(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : format(date, "yyyy-MM-dd");
}
