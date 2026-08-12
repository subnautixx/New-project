import { EmptyState } from "@/components/ui/misc";
import { formatTime } from "@/lib/format";
import type { MetricsSummaryRow } from "@/lib/types/database";

/**
 * Comparativo entre consignadores.
 *
 * Ranking simples por atividade, sem medalha, pódio ou pontuação inventada:
 * o administrador precisa enxergar a operação, não promover competição.
 */
export function TeamRanking({ rows }: { rows: MetricsSummaryRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Sem atividade no período"
        description="Nenhuma mensagem ou movimentação registrada."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">Consignador</th>
            <th className="px-3 py-2 text-right font-medium">Enviadas</th>
            <th className="px-3 py-2 text-right font-medium">Recebidas</th>
            <th className="px-3 py-2 text-right font-medium">Abordados</th>
            <th className="px-3 py-2 text-right font-medium">Responderam</th>
            <th className="px-3 py-2 text-right font-medium">Taxa</th>
            <th className="px-3 py-2 text-right font-medium">Interessados</th>
            <th className="px-3 py-2 text-right font-medium">Consignados</th>
            <th className="px-3 py-2 text-right font-medium">Última atividade</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.user_id} className="border-b border-border/60 last:border-0 hover:bg-surface">
              <td className="px-3 py-2 font-medium">{row.full_name ?? "—"}</td>
              <td className="px-3 py-2 text-right">{row.messages_sent}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">
                {row.messages_received}
              </td>
              <td className="px-3 py-2 text-right">{row.contacts_approached}</td>
              <td className="px-3 py-2 text-right">{row.contacts_replied}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{row.response_rate}%</td>
              <td className="px-3 py-2 text-right">{row.interested_count}</td>
              <td className="px-3 py-2 text-right font-medium text-primary">
                {row.consigned_count}
              </td>
              <td className="px-3 py-2 text-right text-muted-foreground">
                {row.last_activity_at ? formatTime(row.last_activity_at) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
