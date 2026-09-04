"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ContactAvatar } from "@/components/crm/contact-avatar";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_STATUSES, STATUS_DOT, STATUS_LABEL } from "@/lib/domain/lead";
import { describeServiceWindow } from "@/lib/domain/service-window";
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
    const digits = term.replace(/\D/g, "");

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
        (digits.length > 0 && c.contact.phone_e164.includes(digits)) ||
        vehicle.toLowerCase().includes(term) ||
        (c.last_message_preview ?? "").toLowerCase().includes(term)
      );
    });
  }, [conversations, search, status, assignee, unreadOnly]);

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread_count, 0);
  const hasFilters = status !== "todos" || assignee !== "todos" || unreadOnly;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="space-y-2.5 border-b border-border px-3 pb-2.5 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nome, telefone ou veículo"
            className="h-9 rounded-lg border-transparent bg-surface-muted pl-8 pr-8 text-[13px]"
            aria-label="Buscar conversas"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
              <span className="sr-only">Limpar busca</span>
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip active={unreadOnly} onClick={() => setUnreadOnly((v) => !v)}>
            Não lidas
            {totalUnread > 0 ? (
              <span className={cn("ml-1 tabular-nums", unreadOnly ? "" : "text-primary")}>
                {totalUnread}
              </span>
            ) : null}
          </FilterChip>

          <Select value={status} onValueChange={(v) => setStatus(v as LeadStatus | "todos")}>
            <SelectTrigger
              className={cn(
                "h-7 w-auto gap-1 rounded-full border-0 px-2.5 text-xs ring-1 ring-inset",
                status !== "todos"
                  ? "bg-primary/10 text-primary ring-primary/25"
                  : "bg-transparent text-muted-foreground ring-border",
              )}
            >
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
              <SelectTrigger
                className={cn(
                  "h-7 w-auto gap-1 rounded-full border-0 px-2.5 text-xs ring-1 ring-inset",
                  assignee !== "todos"
                    ? "bg-primary/10 text-primary ring-primary/25"
                    : "bg-transparent text-muted-foreground ring-border",
                )}
              >
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

          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setStatus("todos");
                setAssignee("todos");
                setUnreadOnly(false);
              }}
              className="ml-auto text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Limpar
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-muted-foreground">
            {conversations.length === 0
              ? "Nenhuma conversa ainda."
              : "Nenhuma conversa com esses filtros."}
          </p>
        ) : (
          <ul className="py-1">
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

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 items-center rounded-full px-2.5 text-xs ring-1 ring-inset transition-colors",
        active
          ? "bg-primary/10 font-medium text-primary ring-primary/25"
          : "text-muted-foreground ring-border hover:text-foreground",
      )}
    >
      {children}
    </button>
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
  // Quem está para perder a janela precisa ser visto sem abrir a conversa.
  const janela = describeServiceWindow(c.service_window_expires_at);

  return (
    <li className="px-2">
      <button
        type="button"
        onClick={() => onSelect(c.id)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "relative flex w-full gap-2.5 rounded-lg px-2 py-2.5 text-left transition-colors",
          selected ? "bg-secondary" : "hover:bg-surface-muted",
        )}
      >
        {/* Marcador de seleção: mais legível que só a mudança de fundo. */}
        {selected ? (
          <span className="motion-fade absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
        ) : null}

        <ContactAvatar
          contactId={c.contact.id}
          name={c.contact.full_name}
          photoPath={c.contact.photo_path}
          highlighted={unread}
          className="mt-0.5"
        />

        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[13px] leading-5",
                unread ? "font-semibold text-foreground" : "font-medium text-foreground/90",
              )}
            >
              {c.contact.full_name}
            </span>
            <span
              className={cn(
                "shrink-0 text-[11px] tabular-nums",
                unread ? "font-medium text-primary" : "text-muted-foreground",
              )}
            >
              {formatListTime(c.last_message_at)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-xs leading-5",
                unread ? "text-foreground/75" : "text-muted-foreground",
              )}
            >
              {c.last_message_preview ?? "Sem mensagens"}
            </span>
            {unread ? (
              <span className="motion-pop flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold tabular-nums text-primary-foreground">
                {c.unread_count > 99 ? "99+" : c.unread_count}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5 pt-0.5 text-[11px] text-muted-foreground">
            <span
              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[c.contact.status])}
              title={STATUS_LABEL[c.contact.status]}
            />
            <span className="shrink-0">{STATUS_LABEL[c.contact.status]}</span>

            {janela.state === "acabando" ? (
              <span
                className="shrink-0 rounded-full bg-amber-500/15 px-1.5 text-[10px] font-medium text-amber-300 ring-1 ring-inset ring-amber-500/25"
                title="A janela de 24 horas está acabando"
              >
                {janela.minutesLeft !== null && janela.minutesLeft < 60
                  ? `${janela.minutesLeft}min`
                  : `${Math.floor((janela.minutesLeft ?? 0) / 60)}h`}
              </span>
            ) : janela.state === "fechada" ? (
              <span
                className="shrink-0 rounded-full bg-surface-muted px-1.5 text-[10px] font-medium text-muted-foreground/80 ring-1 ring-inset ring-border"
                title="A janela de 24 horas fechou — só com modelo aprovado"
              >
                fechada
              </span>
            ) : null}

            {vehicle ? (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="truncate">{vehicle}</span>
              </>
            ) : null}
            {showAssignee && c.assignee ? (
              <span className="ml-auto shrink-0 truncate pl-1 text-muted-foreground/70">
                {c.assignee.full_name.split(" ")[0]}
              </span>
            ) : null}
          </div>
        </div>
      </button>
    </li>
  );
}
