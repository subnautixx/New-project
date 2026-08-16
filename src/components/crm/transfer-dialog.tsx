"use client";

import { useState } from "react";
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
import type { UserRef } from "@/lib/types/views";

/**
 * Transferência entre consignadores. Só o administrador enxerga este botão — e
 * só ele passa pela verificação do backend, da RLS e do trigger.
 *
 * Aceita conversa ou cliente: um prospect recém cadastrado ainda não tem
 * conversa, e mesmo assim precisa poder mudar de responsável. Os dois caminhos
 * convergem, porque trocar o dono do cliente propaga para as conversas dele.
 */
export function TransferDialog({
  conversationId,
  contactId,
  currentUserId,
  users,
  onTransferred,
}: {
  conversationId?: string;
  contactId?: string;
  currentUserId: string;
  users: UserRef[];
  onTransferred?: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [toUserId, setToUserId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = users.filter((u) => u.id !== currentUserId);

  async function submit() {
    if (!toUserId || pending || (!conversationId && !contactId)) return;

    setPending(true);
    setError(null);

    const endpoint = conversationId
      ? `/api/conversations/${conversationId}/transfer`
      : `/api/contacts/${contactId}/transfer`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toUserId,
        reason: reason.trim() || undefined,
        ...(conversationId ? { transferContact: true } : {}),
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(payload?.message ?? "Não foi possível transferir.");
      setPending(false);
      return;
    }

    const recipient = options.find((u) => u.id === toUserId);

    setPending(false);
    setOpen(false);
    setReason("");
    setToUserId("");
    toast.success(
      recipient ? `Cliente transferido para ${recipient.full_name}.` : "Cliente transferido.",
    );
    onTransferred?.();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
          Transferir
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transferir atendimento</DialogTitle>
          <DialogDescription>
            O cliente e suas conversas passam para o novo responsável. O histórico é preservado e
            a ação fica registrada na auditoria.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="transfer-to">Novo responsável</Label>
            <Select value={toUserId} onValueChange={setToUserId}>
              <SelectTrigger id="transfer-to">
                <SelectValue placeholder="Selecione um consignador" />
              </SelectTrigger>
              <SelectContent>
                {options.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="transfer-reason">Motivo (opcional)</Label>
            <Input
              id="transfer-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: férias do responsável"
              maxLength={280}
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={pending || !toUserId}>
            {pending ? "Transferindo…" : "Transferir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
