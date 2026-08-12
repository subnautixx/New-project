import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { PeriodTabs } from "@/components/metrics/period-tabs";
import { Stat } from "@/components/metrics/stat";
import { TeamRanking } from "@/components/metrics/team-ranking";
import { requireProfile } from "@/lib/auth/session";
import { fetchTeamMetrics, fetchUserMetrics, resolvePeriod } from "@/lib/data/metrics";
import { formatTime } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Desempenho" };
export const dynamic = "force-dynamic";

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; de?: string; ate?: string }>;
}) {
  const profile = await requireProfile();
  const supabase = await createSupabaseServerClient();
  const period = resolvePeriod(await searchParams);
  const isAdmin = profile.role === "admin";

  const [mine, team] = await Promise.all([
    fetchUserMetrics(supabase, profile.id, profile.full_name, period),
    isAdmin ? fetchTeamMetrics(supabase, period) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Desempenho"
        description={isAdmin ? "Sua atividade e a da equipe" : "Sua atividade"}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
          <PeriodTabs period={period} />

          <section className="space-y-3">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {isAdmin ? "Sua atividade" : period.label}
            </h2>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Mensagens enviadas" value={mine.messages_sent} />
              <Stat label="Mensagens recebidas" value={mine.messages_received} />
              <Stat label="Clientes abordados" value={mine.contacts_approached} />
              <Stat
                label="Responderam"
                value={mine.contacts_replied}
                hint={`${mine.response_rate}% de resposta`}
              />
              <Stat label="Interessados" value={mine.interested_count} />
              <Stat label="Consignados" value={mine.consigned_count} emphasis />
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>
                Primeira atividade:{" "}
                <span className="text-foreground">
                  {mine.first_activity_at ? formatTime(mine.first_activity_at) : "—"}
                </span>
              </span>
              <span>
                Última atividade:{" "}
                <span className="text-foreground">
                  {mine.last_activity_at ? formatTime(mine.last_activity_at) : "—"}
                </span>
              </span>
              <span>
                Em negociação: <span className="text-foreground">{mine.negotiating_count}</span>
              </span>
            </div>
          </section>

          {isAdmin ? (
            <section className="space-y-3">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Equipe · {period.label}
              </h2>
              <TeamRanking rows={team} />
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
