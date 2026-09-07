import type { SupabaseClient } from "@supabase/supabase-js";
import {
  APP_TIME_ZONE,
  addDaysInAppTz,
  dayKeyInAppTz,
  hourInAppTz,
  startOfDayInAppTz,
  truncateToMinute,
} from "@/lib/time";
import type { Database, MetricsSummaryRow, MetricsVolumeRow } from "@/lib/types/database";

type Client = SupabaseClient<Database>;

export type PeriodKey = "hoje" | "7d" | "30d";

export interface Period {
  key: PeriodKey | "custom";
  label: string;
  from: Date;
  to: Date;
}

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
];

/**
 * `de`/`ate` chegam como "2026-03-01". `new Date()` interpretaria isso como
 * meia-noite UTC, que é 21h do dia anterior em São Paulo — deslocando o
 * período inteiro em um dia. Por isso a data é montada ao meio-dia e depois
 * truncada no fuso da operação.
 */
function parseDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const [, year, month, day] = match;
  const midday = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));

  return Number.isNaN(midday.getTime()) ? null : startOfDayInAppTz(midday);
}

/**
 * Resolve o período a partir da URL. Aceita atalhos e intervalo personalizado
 * (`de`/`ate`); qualquer coisa inválida cai em "hoje" em vez de quebrar a tela.
 *
 * Os recortes de dia usam o fuso da operação, não o do servidor: "hoje" tem
 * que começar à meia-noite em Brasília, e não às 21h do dia anterior.
 */
export function resolvePeriod(params: {
  periodo?: string;
  de?: string;
  ate?: string;
}): Period {
  const now = new Date();
  // "Até agora" truncado no minuto. Este valor vai parar na chave de cache da
  // tela de Desempenho; com a precisão de milissegundo do `new Date()`, cada
  // render produzia uma chave diferente e a página ficava buscando em laço,
  // sem nunca sair do carregando.
  const agora = truncateToMinute(now);

  if (params.de) {
    const from = parseDateInput(params.de);
    const toDay = params.ate ? parseDateInput(params.ate) : startOfDayInAppTz(now);

    if (from && toDay && from <= toDay) {
      // O fim é exclusivo, então avança um dia para incluir o dia escolhido.
      return {
        key: "custom",
        label: "Personalizado",
        from,
        to: addDaysInAppTz(toDay, 1),
      };
    }
  }

  const today = startOfDayInAppTz(now);

  switch (params.periodo) {
    case "7d":
      return { key: "7d", label: "7 dias", from: addDaysInAppTz(today, -6), to: agora };
    case "30d":
      return { key: "30d", label: "30 dias", from: addDaysInAppTz(today, -29), to: agora };
    default:
      return { key: "hoje", label: "Hoje", from: today, to: agora };
  }
}

const EMPTY_SUMMARY: Omit<MetricsSummaryRow, "user_id" | "full_name"> = {
  messages_sent: 0,
  messages_received: 0,
  contacts_approached: 0,
  contacts_replied: 0,
  response_rate: 0,
  interested_count: 0,
  negotiating_count: 0,
  consigned_count: 0,
  lost_count: 0,
  first_activity_at: null,
  last_activity_at: null,
};

/** Desempenho de um usuário. A própria função no banco verifica a permissão. */
export async function fetchUserMetrics(
  supabase: Client,
  userId: string,
  fullName: string,
  period: Period,
): Promise<MetricsSummaryRow> {
  const { data, error } = await supabase.rpc("metrics_user_summary", {
    p_user_id: userId,
    p_from: period.from.toISOString(),
    p_to: period.to.toISOString(),
  });

  if (error) throw new Error(`Falha ao carregar métricas: ${error.message}`);

  return data?.[0] ?? { user_id: userId, full_name: fullName, ...EMPTY_SUMMARY };
}

/** Comparativo da equipe. Só admin — o banco recusa os demais. */
export async function fetchTeamMetrics(
  supabase: Client,
  period: Period,
): Promise<MetricsSummaryRow[]> {
  const { data, error } = await supabase.rpc("metrics_team_summary", {
    p_from: period.from.toISOString(),
    p_to: period.to.toISOString(),
  });

  if (error) throw new Error(`Falha ao carregar métricas da equipe: ${error.message}`);
  return data ?? [];
}

export function bucketOf(period: Period): "hour" | "day" {
  // "Hoje" pede visão por hora; períodos longos, por dia.
  return period.key === "hoje" ? "hour" : "day";
}

export async function fetchVolume(
  supabase: Client,
  userId: string | null,
  period: Period,
): Promise<MetricsVolumeRow[]> {
  const { data, error } = await supabase.rpc("metrics_volume", {
    p_user_id: userId,
    p_from: period.from.toISOString(),
    p_to: period.to.toISOString(),
    p_bucket: bucketOf(period),
    // Sem isto o agrupamento sairia por hora UTC: o pico das 16h da operação
    // apareceria às 19h no gráfico.
    p_timezone: APP_TIME_ZONE,
  });

  if (error) throw new Error(`Falha ao carregar volume: ${error.message}`);
  return data ?? [];
}

export interface VolumeBucket {
  key: string;
  label: string;
  sent: number;
  received: number;
}

/**
 * Completa as lacunas do gráfico.
 *
 * O banco só devolve períodos com atividade. Sem preencher os vazios, uma hora
 * sem mensagem simplesmente desapareceria e o eixo ficaria mentindo sobre a
 * distribuição do dia.
 */
export function fillVolumeBuckets(rows: MetricsVolumeRow[], period: Period): VolumeBucket[] {
  const bucket = bucketOf(period);

  const totals = new Map<string, { sent: number; received: number }>();
  for (const row of rows) {
    const date = new Date(row.bucket);
    if (Number.isNaN(date.getTime())) continue;

    const key =
      bucket === "hour"
        ? `${dayKeyInAppTz(date)}T${String(hourInAppTz(date)).padStart(2, "0")}`
        : dayKeyInAppTz(date);

    totals.set(key, { sent: Number(row.sent) || 0, received: Number(row.received) || 0 });
  }

  const buckets: VolumeBucket[] = [];

  if (bucket === "hour") {
    const day = dayKeyInAppTz(period.from);
    for (let hour = 0; hour < 24; hour++) {
      const key = `${day}T${String(hour).padStart(2, "0")}`;
      const value = totals.get(key);
      buckets.push({
        key,
        label: `${String(hour).padStart(2, "0")}h`,
        sent: value?.sent ?? 0,
        received: value?.received ?? 0,
      });
    }
    return buckets;
  }

  let cursor = startOfDayInAppTz(period.from);
  // Guarda contra intervalos absurdos vindos da URL.
  for (let i = 0; i < 400 && cursor < period.to; i++) {
    const key = dayKeyInAppTz(cursor);
    const value = totals.get(key);
    const [, month, day] = key.split("-");

    buckets.push({
      key,
      label: `${day}/${month}`,
      sent: value?.sent ?? 0,
      received: value?.received ?? 0,
    });

    cursor = addDaysInAppTz(cursor, 1);
  }

  return buckets;
}
