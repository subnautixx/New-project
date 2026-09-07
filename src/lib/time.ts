/**
 * Fuso da operação.
 *
 * O servidor da Vercel roda em UTC e o navegador do consignador em
 * America/Sao_Paulo. Formatar com o fuso do ambiente daria três resultados
 * diferentes para o mesmo instante: horário errado na tela, "Hoje" começando
 * às 21h do dia anterior nas métricas e divergência de hidratação em cada
 * timestamp renderizado no servidor.
 *
 * Por isso TODA conversão entre instante e "dia/hora" passa por aqui, com o
 * fuso fixo. O banco continua guardando `timestamptz` em UTC — o que muda é
 * apenas como o instante é apresentado e como os períodos são recortados.
 */
export const APP_TIME_ZONE = "America/Sao_Paulo";

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(date: Date): ZonedParts {
  const parts: Record<string, string> = {};
  for (const part of partsFormatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // `hour12: false` produz 24 para a meia-noite em alguns runtimes.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/**
 * Deslocamento do fuso, em milissegundos, no instante informado.
 * O Brasil não usa mais horário de verão desde 2019, então na prática é sempre
 * -03:00 — mas o cálculo é feito a partir do instante para não depender disso.
 */
export function timeZoneOffsetMs(date: Date): number {
  const p = zonedParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // O milissegundo se perde no formatToParts; devolve para não truncar.
  return asUtc - (date.getTime() - date.getMilliseconds());
}

/**
 * Trunca no minuto. Segundo e milissegundo não dependem de fuso, então isto
 * vale em qualquer lugar do mundo.
 *
 * Existe para dar estabilidade a um "agora" que vai virar chave de cache.
 * `new Date()` cru muda a cada milissegundo: onde esse valor entra numa chave
 * de consulta, cada render gera uma chave nova, que dispara uma busca nova,
 * que causa outro render — a tela gira para sempre e martela o banco. No
 * minuto o valor fica parado, sem perder o sentido de "até agora".
 */
export function truncateToMinute(date: Date): Date {
  const truncated = new Date(date.getTime());
  truncated.setSeconds(0, 0);
  return truncated;
}

/** Instante correspondente à meia-noite daquele dia no fuso da operação. */
export function startOfDayInAppTz(date: Date): Date {
  const offset = timeZoneOffsetMs(date);
  const shifted = new Date(date.getTime() + offset);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - offset);
}

/** Soma dias preservando a meia-noite local (não são 24h fixas em todo fuso). */
export function addDaysInAppTz(date: Date, days: number): Date {
  const offset = timeZoneOffsetMs(date);
  const shifted = new Date(date.getTime() + offset);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return new Date(shifted.getTime() - timeZoneOffsetMs(new Date(shifted.getTime() - offset)));
}

/** Chave de dia no fuso da operação: "2026-08-12". Serve para agrupar e comparar. */
export function dayKeyInAppTz(value: Date | string | null | undefined): string {
  if (!value) return "";

  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";

  const p = zonedParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Hora do dia (0-23) no fuso da operação. */
export function hourInAppTz(value: Date | string): number {
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? 0 : zonedParts(date).hour;
}

export function isSameDayInAppTz(a: Date | string, b: Date | string): boolean {
  const keyA = dayKeyInAppTz(a);
  return keyA !== "" && keyA === dayKeyInAppTz(b);
}

/**
 * Instante em UTC -> valor de um `<input type="datetime-local">`.
 *
 * O input não carrega fuso: ele mostra e devolve texto solto. Se a conversão
 * usasse o fuso do navegador, um consignador com o relógio em outro fuso veria
 * e gravaria horários diferentes dos colegas para o mesmo compromisso.
 */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const p = zonedParts(date);
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Valor de `<input type="datetime-local">` (horário local) -> instante ISO. */
export function localInputToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;

  // Interpreta o texto como se fosse UTC e desconta o deslocamento real do
  // fuso naquele instante.
  const asUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );

  const offset = timeZoneOffsetMs(new Date(asUtc));
  const instant = new Date(asUtc - offset);

  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}
