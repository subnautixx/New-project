import type { SupabaseClient } from "@supabase/supabase-js";
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

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Resolve o período a partir da URL. Aceita atalhos e intervalo personalizado
 * (`de`/`ate`); qualquer coisa inválida cai em "hoje" em vez de quebrar a tela.
 */
export function resolvePeriod(params: {
  periodo?: string;
  de?: string;
  ate?: string;
}): Period {
  const now = new Date();

  if (params.de) {
    const from = new Date(params.de);
    const to = params.ate ? new Date(params.ate) : now;

    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to) {
      // O fim do intervalo é exclusivo; inclui o dia inteiro escolhido.
      const inclusiveTo = startOfDay(to);
      inclusiveTo.setDate(inclusiveTo.getDate() + 1);
      return { key: "custom", label: "Personalizado", from: startOfDay(from), to: inclusiveTo };
    }
  }

  switch (params.periodo) {
    case "7d": {
      const from = startOfDay(now);
      from.setDate(from.getDate() - 6);
      return { key: "7d", label: "7 dias", from, to: now };
    }
    case "30d": {
      const from = startOfDay(now);
      from.setDate(from.getDate() - 29);
      return { key: "30d", label: "30 dias", from, to: now };
    }
    default:
      return { key: "hoje", label: "Hoje", from: startOfDay(now), to: now };
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

export async function fetchVolume(
  supabase: Client,
  userId: string | null,
  period: Period,
): Promise<MetricsVolumeRow[]> {
  const { data, error } = await supabase.rpc("metrics_volume", {
    p_user_id: userId,
    p_from: period.from.toISOString(),
    p_to: period.to.toISOString(),
    // "Hoje" pede visão por hora; períodos longos, por dia.
    p_bucket: period.key === "hoje" ? "hour" : "day",
  });

  if (error) throw new Error(`Falha ao carregar volume: ${error.message}`);
  return data ?? [];
}
