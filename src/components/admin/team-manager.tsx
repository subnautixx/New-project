"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { useToast } from "@/components/ui/toast";
import { formatPhone } from "@/lib/phone";
import type { ProfileRow } from "@/lib/types/database";
import type { AccountRef } from "@/lib/types/views";

interface Permission {
  user_id: string;
  whatsapp_account_id: string;
}

interface Props {
  profiles: ProfileRow[];
  accounts: AccountRef[];
  permissions: Permission[];
}

export function TeamManager({ profiles, accounts, permissions }: Props) {
  const router = useRouter();
  const toast = useToast();

  const accountsOf = (userId: string) =>
    permissions
      .filter((p) => p.user_id === userId)
      .map((p) => accounts.find((a) => a.id === p.whatsapp_account_id))
      .filter((a): a is AccountRef => Boolean(a));

  async function toggleActive(profile: ProfileRow) {
    const response = await fetch(`/api/admin/users/${profile.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !profile.is_active }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      toast.error(payload?.message ?? "Não foi possível alterar o usuário.");
      return;
    }

    toast.success(
      profile.is_active
        ? `${profile.full_name} foi desativado.`
        : `${profile.full_name} voltou a ter acesso.`,
    );
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <div className="flex justify-end">
        <NewUserDialog accounts={accounts} onCreated={() => router.refresh()} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Usuário</th>
              <th className="px-3 py-2 font-medium">Papel</th>
              <th className="px-3 py-2 font-medium">WhatsApps</th>
              <th className="px-3 py-2 font-medium">Situação</th>
              <th className="px-3 py-2 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => {
              const linked = accountsOf(profile.id);

              return (
                <tr key={profile.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2">
                    <span className="font-medium">{profile.full_name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {profile.email ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={profile.role === "admin" ? "warning" : "outline"}>
                      {profile.role === "admin" ? "Administrador" : "Consignador"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {linked.length === 0
                      ? "Nenhum"
                      : linked.map((a) => a.display_name).join(", ")}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={profile.is_active ? "success" : "danger"}>
                      {profile.is_active ? "Ativo" : "Desativado"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void toggleActive(profile)}
                    >
                      {profile.is_active ? "Desativar" : "Reativar"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Desativar um usuário corta o acesso no banco de dados, não apenas na interface: as
        políticas de segurança deixam de reconhecê-lo imediatamente.
      </p>
    </div>
  );
}

function NewUserDialog({
  accounts,
  onCreated,
}: {
  accounts: AccountRef[];
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<"admin" | "consignador">("consignador");
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: String(form.get("email") ?? "").trim(),
        password: String(form.get("password") ?? ""),
        fullName: String(form.get("fullName") ?? "").trim(),
        phone: String(form.get("phone") ?? "").trim() || undefined,
        role,
        whatsappAccountIds: selectedAccounts,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        issues?: string[];
      } | null;
      setError(payload?.issues?.join(" · ") ?? payload?.message ?? "Não foi possível criar.");
      setPending(false);
      return;
    }

    setPending(false);
    setOpen(false);
    setSelectedAccounts([]);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Novo usuário</Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>
            A senha inicial é definida aqui e pode ser trocada pelo usuário depois.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Nome completo</Label>
            <Input id="fullName" name="fullName" required minLength={2} maxLength={120} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" name="email" type="email" required autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" name="phone" inputMode="tel" autoComplete="off" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Senha inicial</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
            />
            <p className="text-[11px] text-muted-foreground">Mínimo de 10 caracteres.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="role">Papel</Label>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="consignador">Consignador</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {accounts.length > 0 ? (
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                WhatsApps liberados
              </legend>
              <div className="space-y-1">
                {accounts.map((account) => (
                  <label key={account.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                      checked={selectedAccounts.includes(account.id)}
                      onChange={(e) =>
                        setSelectedAccounts((prev) =>
                          e.target.checked
                            ? [...prev, account.id]
                            : prev.filter((id) => id !== account.id),
                        )
                      }
                    />
                    <span>
                      {account.display_name}{" "}
                      <span className="text-muted-foreground">
                        {formatPhone(account.phone_e164)}
                      </span>
                    </span>
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
              {pending ? "Criando…" : "Criar usuário"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
