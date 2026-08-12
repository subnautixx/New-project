import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { requireAdmin } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Auditoria" };
export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  "user.create": "Criou usuário",
  "user.update": "Alterou usuário",
  "conversation.transfer": "Transferiu conversa",
  "whatsapp_account.create": "Conectou número",
  "whatsapp_account.update": "Alterou número",
  "whatsapp_account.disconnect": "Removeu número",
};

export default async function AuditPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: logs } = await supabase
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, metadata, ip, created_at, actor_user_id")
    .order("created_at", { ascending: false })
    .limit(200);

  const actorIds = [...new Set((logs ?? []).map((l) => l.actor_user_id).filter(Boolean))];

  const { data: actors } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", actorIds as string[])
    : { data: [] };

  const nameOf = (id: string | null) =>
    actors?.find((a) => a.id === id)?.full_name ?? "Sistema";

  return (
    <>
      <PageHeader
        title="Auditoria"
        description="Ações administrativas registradas — quem fez o quê e quando"
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!logs || logs.length === 0 ? (
          <EmptyState
            title="Nenhuma ação registrada"
            description="Criações de usuário, transferências e mudanças de número aparecem aqui."
          />
        ) : (
          <div className="mx-auto max-w-4xl p-4 sm:p-6">
            <ul className="divide-y divide-border rounded-lg border border-border">
              {logs.map((log) => (
                <li key={log.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3">
                  <Badge variant="outline" className="shrink-0">
                    {ACTION_LABEL[log.action] ?? log.action}
                  </Badge>
                  <span className="text-sm font-medium">{nameOf(log.actor_user_id)}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(log.created_at)}
                  </span>
                  {log.ip ? (
                    <span className="text-xs text-muted-foreground/70">{log.ip}</span>
                  ) : null}
                  {log.metadata && Object.keys(log.metadata).length > 0 ? (
                    <code className="w-full break-all font-mono text-[11px] text-muted-foreground">
                      {JSON.stringify(log.metadata)}
                    </code>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
