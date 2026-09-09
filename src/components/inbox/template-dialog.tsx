"use client";

import { Loader2 } from "lucide-react";
import { useRef, useState } from "react";
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
import type { ThreadMessage } from "@/lib/types/views";
import { attemptKey, readAttempt, clearAttempt, readSendResponse, type SendResponse } from "@/lib/messages/send-response";
import { renderTemplateBody } from "@/lib/whatsapp/template";

interface Template {
  name: string;
  language: string;
  category: string | null;
  bodyText: string | null;
  variableCount: number;
}

/**
 * Envio de template aprovado, para reabrir uma conversa fora da janela de 24h.
 * A lista vem da Meta — só aparecem templates efetivamente aprovados, então
 * não há como tentar burlar a política a partir daqui.
 */
export function TemplateDialog({
  conversationId,
  accountId,
  currentUserId,
  onSent,
}: {
  conversationId: string;
  accountId: string;
  currentUserId: string;
  onSent: (message: ThreadMessage) => void;
}) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedName, setSelectedName] = useState("");
  const [parameters, setParameters] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const selected = templates.find((t) => t.name === selectedName) ?? null;

  async function loadTemplates(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen || templates.length > 0) return;

    setLoading(true);
    setError(null);

    const response = await fetch(`/api/whatsapp/accounts/${accountId}/templates`);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(payload?.message ?? "Não foi possível carregar os templates.");
      setLoading(false);
      return;
    }

    const payload = (await response.json()) as { templates: Template[] };
    setTemplates(payload.templates);
    setLoading(false);
  }

  function selectTemplate(name: string) {
    setSelectedName(name);
    const template = templates.find((t) => t.name === name);
    setParameters(Array.from({ length: template?.variableCount ?? 0 }, () => ""));
  }

  async function submit() {
    if (!selected || lock.current) return;
    lock.current = true;
    setPending(true);
    setError(null);
    const key = attemptKey(currentUserId, conversationId, JSON.stringify(["template", selected.name, selected.language, parameters]));
    const { clientRef } = readAttempt(key);
    try {
      const response = await fetch("/api/messages/send-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId, templateName: selected.name, languageCode: selected.language,
          parameters, bodyText: selected.bodyText ?? undefined, clientRef,
        }),
      });
      const payload = (await response.json().catch(() => null)) as SendResponse | null;
      const result = readSendResponse(response.status, payload);
      if (result.record) {
        onSent(result.record);
        clearAttempt(key);
        setSelectedName("");
        setParameters([]);
      }
      if (result.confirmed) setOpen(false);
      else setError(result.notice);
    } catch {
      setError("Envio não confirmado. Tentar novamente consulta a mesma tentativa.");
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  const missingParameter = parameters.some((p) => p.trim().length === 0);

  return (
    <Dialog open={open} onOpenChange={loadTemplates}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          Reabrir com template aprovado
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar template</DialogTitle>
          <DialogDescription>
            Apenas templates aprovados pela Meta podem reabrir uma conversa fora da janela de 24
            horas.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 && !error ? (
          <p className="py-4 text-sm text-muted-foreground">
            Nenhum template aprovado disponível para este número. Cadastre e aprove um template no
            painel da Meta.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="template">Template</Label>
              <Select value={selectedName} onValueChange={selectTemplate}>
                <SelectTrigger id="template">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={`${template.name}:${template.language}`} value={template.name}>
                      {template.name} · {template.language}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selected?.bodyText ? (
              <div className="space-y-1.5">
                <Label>Prévia</Label>
                <p className="whitespace-pre-wrap rounded-md bg-surface-muted p-2.5 text-sm">
                  {renderTemplateBody(
                    selected.bodyText,
                    parameters.map((p, i) => (p.trim() ? p : `{{${i + 1}}}`)),
                  )}
                </p>
              </div>
            ) : null}

            {parameters.map((value, index) => (
              <div key={index} className="space-y-1.5">
                <Label htmlFor={`param-${index}`}>{`Variável {{${index + 1}}}`}</Label>
                <Input
                  id={`param-${index}`}
                  value={value}
                  onChange={(e) =>
                    setParameters((prev) =>
                      prev.map((p, i) => (i === index ? e.target.value : p)),
                    )
                  }
                  maxLength={400}
                />
              </div>
            ))}
          </div>
        )}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={pending || !selected || missingParameter}>
            {pending ? "Enviando…" : "Enviar template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
