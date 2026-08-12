"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_STATUSES, STATUS_CLASS, STATUS_LABEL } from "@/lib/domain/lead";
import { formatListTime } from "@/lib/format";
import type { LeadStatus } from "@/lib/types/database";
import type { ConversationListItem, UserRef } from "@/lib/types/views";
import { cn } from "@/lib/utils";

interface Props {
  conversations: ConversationListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  users: UserRef[];
  isAdmin: boolean;
}

export function ConversationList({ conversations, selectedId, onSelect, users, isAdmin }: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LeadStatus | "todos">("todos");
  const [assignee, setAssignee] = useState<string>("todos");
  const [unreadOnly, setUnreadOnly] = useState(false);

  // Filtro no cliente: a RLS já entregou só o que este usuário pode ver, e a
  // lista cabe em memória. Resultado instantâneo, sem ida ao servidor.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    return conversations.filter((c) => {
      if (unreadOnly && c.unread_count === 0) return false;
      if (status !== "todos" && c.contact.status !== status) return false;
      if (assignee !== "todos" && c.assigned_user_id !== assignee) return false;

      if (!term) return true;

      const vehicle = [c.vehicle?.brand, c.vehicle?.model, c.vehicle?.version]
        .filter(Boolean)
        .join(" ");

      return (
        c.contact.full_name.toLowerCase().includes(term) ||
        c.contact.phone_e164.includes(term.replace(/\D/g, "")) ||
        vehicle.toLowerCase().includes(term) ||
        (c.last_message_preview ?? "").toLowerCase().includes(term)
      );
    });
  }, [conversations, search, status, assignee, unreadOnly]);

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread_count, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nome, telefone ou veículo"
            className="pl-8"
            aria-label="Buscar conversas"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setUnreadOnly((v) => !v)}
            aria-pressed={unreadOnly}
            className={cn(
              "rounded-md px-2 py-1 text-xs ring-1 ring-inset transition-colors",
              unreadOnly
                ? "bg-primary/15 text-primary ring-primary/30"
                : "text-muted-foreground ring-border hover:text-foreground",
            )}
          >
            Não lidas{totalUnread > 0 ? ` · ${totalUnread}` : ""}
          </button>

          <Select value={status} onValueChange={(v) => setStatus(v as LeadStatus | "todos")}>
            <SelectTrigger className="h-7 w-auto min-w-[7.5rem] gap-1 border-border bg-transparent px-2 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {ALL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isAdmin ? (
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="h-7 w-auto min-w-[7.5rem] gap-1 border-border bg-transparent px-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Toda a equipe</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {conversations.length === 0
              ? "Nenhuma conversa ainda."
              : "Nenhuma conversa com esses filtros."}
          </p>
        ) : (
          <ul>
            {filtered.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                selected={c.id === selectedId}
                showAssignee={isAdmin}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ConversationRow({
  conversation: c,
  selected,
  showAssignee,
  onSelect,
}: {
  conversation: ConversationListItem;
  selected: boolean;
  showAssignee: boolean;
  onSelect: (id: string) => void;
}) {
  const vehicle = [c.vehicle?.brand, c.vehicle?.model].filter(Boolean).join(" ");
  const unread = c.unread_count > 0;

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(c.id)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex w-full flex-col gap-1 border-b border-border/60 px-3 py-2.5 text-left transition-colors",
          selected ? "bg-secondary" : "hover:bg-surface-muted",
        )}
      >
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm",
              unread ? "font-semibold text-foreground" : "font-medium text-foreground/90",
            )}
          >
            {c.contact.full_name}
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {formatListTime(c.last_message_at)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-xs",
              unread ? "text-foreground/80" : "text-muted-foreground",
            )}
          >
            {c.last_message_preview ?? "Sem mensagens"}
          </span>
          {unread ? (
            <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {c.unread_count > 99 ? "99+" : c.unread_count}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <Badge className={cn("px-1.5 py-0 text-[10px] ring-1", STATUS_CLASS[c.contact.status])}>
            {STATUS_LABEL[c.contact.status]}
          </Badge>
          {vehicle ? (
            <span className="truncate text-[11px] text-muted-foreground">{vehicle}</span>
          ) : null}
          {showAssignee && c.assignee ? (
            <span className="ml-auto truncate text-[11px] text-muted-foreground/80">
              {c.assignee.full_name.split(" ")[0]}
            </span>
          ) : null}
        </div>
      </button>
    </li>
  );
}
