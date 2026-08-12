"use client";

import { MessageSquare, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_STATUSES, STATUS_CLASS, STATUS_LABEL } from "@/lib/domain/lead";
import { formatDate } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import type { LeadStatus } from "@/lib/types/database";
import type { ContactListItem, UserRef } from "@/lib/types/views";
import { cn, formatCurrencyBRL } from "@/lib/utils";

interface Props {
  contacts: ContactListItem[];
  users: UserRef[];
  isAdmin: boolean;
}

export function ContactsTable({ contacts, users, isAdmin }: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LeadStatus | "todos">("todos");
  const [owner, setOwner] = useState("todos");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const digits = term.replace(/\D/g, "");

    return contacts.filter((c) => {
      if (status !== "todos" && c.status !== status) return false;
      if (owner !== "todos" && c.owner_user_id !== owner) return false;
      if (!term) return true;

      const vehicle = [c.vehicle?.brand, c.vehicle?.model, c.vehicle?.version]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        c.full_name.toLowerCase().includes(term) ||
        vehicle.includes(term) ||
        (digits.length > 0 && c.phone_e164.includes(digits))
      );
    });
  }, [contacts, search, status, owner]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nome, telefone ou veículo"
            className="pl-8"
            aria-label="Buscar clientes"
          />
        </div>

        <Select value={status} onValueChange={(v) => setStatus(v as LeadStatus | "todos")}>
          <SelectTrigger className="h-9 w-auto min-w-[9rem]">
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
          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger className="h-9 w-auto min-w-[9rem]">
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

        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} de {contacts.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <EmptyState
            title={contacts.length === 0 ? "Nenhum cliente cadastrado" : "Nada encontrado"}
            description={
              contacts.length === 0
                ? "Cadastre o primeiro prospect a partir de um anúncio."
                : "Ajuste a busca ou os filtros."
            }
          />
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Veículo</th>
                <th className="px-4 py-2 font-medium">Preço</th>
                <th className="px-4 py-2 font-medium">Origem</th>
                <th className="px-4 py-2 font-medium">Status</th>
                {isAdmin ? <th className="px-4 py-2 font-medium">Responsável</th> : null}
                <th className="px-4 py-2 font-medium">Última interação</th>
                <th className="w-10 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-border/60 hover:bg-surface">
                  <td className="px-4 py-2">
                    <Link href={`/clientes/${c.id}`} className="block hover:underline">
                      <span className="font-medium">{c.full_name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {formatPhone(c.phone_e164)}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    {[c.vehicle?.brand, c.vehicle?.model].filter(Boolean).join(" ") || "—"}
                    {c.vehicle?.year ? (
                      <span className="block text-xs text-muted-foreground">{c.vehicle.year}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {formatCurrencyBRL(c.vehicle?.listed_price)}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {c.vehicle?.source_platform ?? c.source_platform ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <Badge className={cn("ring-1", STATUS_CLASS[c.status])}>
                      {STATUS_LABEL[c.status]}
                    </Badge>
                  </td>
                  {isAdmin ? (
                    <td className="px-4 py-2 text-muted-foreground">{c.owner?.full_name ?? "—"}</td>
                  ) : null}
                  <td className="px-4 py-2 text-muted-foreground">
                    {formatDate(c.last_interaction_at)}
                  </td>
                  <td className="px-4 py-2">
                    {c.conversation_id ? (
                      <Link
                        href="/inbox"
                        title="Abrir conversa"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <MessageSquare className="h-4 w-4" />
                        <span className="sr-only">Abrir conversa</span>
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
