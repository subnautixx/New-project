"use client";

import { BookOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { WhatsappSetupGuide } from "@/components/admin/whatsapp-setup-guide";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/misc";
import { formatPhone } from "@/lib/phone";
import type { WaAccountStatus, WhatsappAccountRow } from "@/lib/types/database";
import type { UserRef } from "@/lib/types/views";

interface Permission {
  user_id: string;
  whatsapp_account_id: string;
}

const STATUS_META: Record<WaAccountStatus, { label: string; dot: string }> = {
  connected: { label: "Conectado", dot: "bg-emerald-400" },
  pending: { label: "Pendente", dot: "bg-amber-400" },
  disconnected: { label: "Desconectado", dot: "bg-zinc-500" },
  error: { label: "Erro", dot: "bg-red-400" },
};

export function WhatsappManager({
  accounts,
  users,
  permissions,
}: {
  accounts: WhatsappAccountRow[];
  users: UserRef[];
  permissions: Permission[];
}) {
  const router = useRouter();
  const [guideOpen, setGuideOpen] = useState(false);

  async function disconnect(account: WhatsappAccountRow) {
    if (
      !confirm(
        `Remover "${account.display_name}" da operação?\n\nO histórico de conversas é preservado, mas o token de acesso é apagado e não será mais possível enviar por este número.`,
      )
    ) {
      return;
    }

    const response = await fetch(`/api/admin/whatsapp-accounts/${account.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      alert("Não foi possível remover o número.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setGuideOpen(true)}>
          <BookOpen className="h-3.5 w-3.5" />
          Como conectar
        </Button>
        <NewAccountDialog users={users} onCreated={() => router.refresh()} />
      </div>

      <WhatsappSetupGuide open={guideOpen} onOpenChange={setGuideOpen} />

      {accounts.length === 0 ? (
        <EmptyState
          title="Nenhum número conectado"
          description="Conecte o número da loja para começar a atender pelo CRM. São cinco passos, e a maior parte acontece no painel da Meta."
          action={
            <Button variant="outline" size="sm" onClick={() => setGuideOpen(true)}>
              <BookOpen className="h-3.5 w-3.5" />
              Ver o passo a passo
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {accounts.map((account) => {
            const meta = STATUS_META[account.status];
            const linked = permissions
              .filter((p) => p.whatsapp_account_id === account.id)
              .map((p) => users.find((u) => u.id === p.user_id)?.full_name)
              .filter(Boolean);

            return (
              <li
                key={account.id}
                className="flex flex-wrap items-start gap-3 rounded-lg border border-border bg-surface p-4"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{account.display_name}</span>
                    <Badge variant={account.mode === "shared" ? "default" : "outline"}>
                      {account.mode === "shared" ? "Compartilhado" : "Individual"}
                    </Badge>
                    {account.coexistence_enabled ? (
                      <Badge variant="outline">Coexistência</Badge>
                    ) : null}
                    {!account.is_active ? <Badge variant="danger">Removido</Badge> : null}
                  </div>

                  <p className="text-sm text-muted-foreground">
                    {formatPhone(account.phone_e164)}
                  </p>

                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </p>

                  <p className="text-xs text-muted-foreground">
                    Acesso:{" "}
                    {linked.length === 0 ? (
                      <span className="text-amber-300">nenhum usuário liberado</span>
                    ) : (
                      linked.join(", ")
                    )}
                  </p>
                </div>

                {account.is_active ? (
                  <Button variant="outline" size="sm" onClick={() => void disconnect(account)}>
                    Remover
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-2 rounded-lg border border-border bg-surface p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Sobre a integração</p>
        <p>
          O CRM usa exclusivamente a Cloud API oficial da Meta. Não há automação de WhatsApp Web
          nem qualquer contorno das políticas da plataforma.
        </p>
        <p>
          Com a coexistência ativada, o vendedor continua usando o WhatsApp Business no celular
          enquanto o mesmo número responde pelo CRM.
        </p>
        <p>
          O token de acesso fica em uma tabela sem política de leitura: só o backend enxerga. Nem
          esta tela consegue exibi-lo depois de salvo.
        </p>
      </div>
    </div>
  );
}

function NewAccountDialog({ users, onCreated }: { users: UserRef[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"shared" | "individual">("shared");
  const [defaultOwner, setDefaultOwner] = useState<string>("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [coexistence, setCoexistence] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    const response = await fetch("/api/admin/whatsapp-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: String(form.get("displayName") ?? "").trim(),
        phone: String(form.get("phone") ?? "").trim(),
        phoneNumberId: String(form.get("phoneNumberId") ?? "").trim(),
        wabaId: String(form.get("wabaId") ?? "").trim() || undefined,
        accessToken: String(form.get("accessToken") ?? "").trim(),
        mode,
        coexistenceEnabled: coexistence,
        defaultOwnerUserId: defaultOwner || null,
        userIds: selectedUsers,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        issues?: string[];
      } | null;
      setError(payload?.issues?.join(" · ") ?? payload?.message ?? "Não foi possível conectar.");
      setPending(false);
      return;
    }

    setPending(false);
    setOpen(false);
    setSelectedUsers([]);
    setDefaultOwner("");
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Conectar número</Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conectar número</DialogTitle>
          <DialogDescription>
            Os identificadores vêm do painel da Meta, em WhatsApp · Configuração da API.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="displayName">Nome de exibição</Label>
              <Input
                id="displayName"
                name="displayName"
                required
                placeholder="4FMOTORS Principal"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Número</Label>
              <Input id="phone" name="phone" required placeholder="(11) 4004-1234" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="phoneNumberId">Phone number ID</Label>
              <Input id="phoneNumberId" name="phoneNumberId" required autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wabaId">WABA ID</Label>
              <Input id="wabaId" name="wabaId" autoComplete="off" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="accessToken">Token de acesso</Label>
            <Input
              id="accessToken"
              name="accessToken"
              type="password"
              required
              minLength={20}
              autoComplete="off"
            />
            <p className="text-[11px] text-muted-foreground">
              Guardado apenas no servidor. Não aparece novamente após salvar.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mode">Modo</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
                <SelectTrigger id="mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shared">Compartilhado (número da loja)</SelectItem>
                  <SelectItem value="individual">Individual (de um consignador)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="defaultOwner">Responsável padrão</Label>
              <Select value={defaultOwner} onValueChange={setDefaultOwner}>
                <SelectTrigger id="defaultOwner">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Recebe as conversas de números desconhecidos.
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
              checked={coexistence}
              onChange={(e) => setCoexistence(e.target.checked)}
            />
            Coexistência ativada (WhatsApp Business App + Cloud API no mesmo número)
          </label>

          {users.length > 0 ? (
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Quem pode usar este número
              </legend>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {users.map((user) => (
                  <label key={user.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                      checked={selectedUsers.includes(user.id)}
                      onChange={(e) =>
                        setSelectedUsers((prev) =>
                          e.target.checked
                            ? [...prev, user.id]
                            : prev.filter((id) => id !== user.id),
                        )
                      }
                    />
                    {user.full_name}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Conectando…" : "Conectar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
