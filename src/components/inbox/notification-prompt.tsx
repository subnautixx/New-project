"use client";

import { Bell, X } from "lucide-react";
import { useEffect, useState } from "react";
import { permissionState, requestPermission, type PermissionState } from "@/lib/notifications";

/** Lembra a dispensa neste navegador — reaparecer todo dia vira ruído. */
const DISMISSED_KEY = "4fmotors:notificacao-dispensada";

/**
 * Convite para ligar o aviso de mensagem nova.
 *
 * Aparece uma vez, discreto, no topo da lista de conversas. Não é modal e não
 * bloqueia nada: quem não quiser fecha e não vê mais.
 *
 * O pedido de permissão sai daqui, de um clique — nunca sozinho ao entrar.
 * Navegador só dá uma chance: um "bloquear" tomado antes de a pessoa entender
 * para que serve é definitivo.
 */
export function NotificationPrompt({ onGranted }: { onGranted: () => void }) {
  const [state, setState] = useState<PermissionState | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setState(permissionState());
    try {
      setDismissed(window.localStorage.getItem(DISMISSED_KEY) === "1");
    } catch {
      // Navegador com armazenamento bloqueado: mostra o convite mesmo assim.
      setDismissed(false);
    }
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Sem armazenamento o convite volta na próxima sessão. Aceitável.
    }
  }

  async function enable() {
    const result = await requestPermission();
    setState(result);
    if (result === "concedida") onGranted();
    else dismiss(); // negou: não insiste, o navegador nem perguntaria de novo
  }

  if (state !== "nao-pedida" || dismissed) return null;

  return (
    <div className="mx-2 mb-1 flex items-start gap-2.5 rounded-lg bg-surface-muted px-2.5 py-2 ring-1 ring-inset ring-border">
      <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />

      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Quer ser avisado quando um cliente responder, mesmo com o CRM em segundo plano?
        </p>
        <button
          type="button"
          onClick={() => void enable()}
          className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
        >
          Ativar avisos
        </button>
      </div>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dispensar"
        className="-m-0.5 shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
