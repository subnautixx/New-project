"use client";

import { AlertCircle, CheckCircle2, X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Avisos curtos no canto da tela.
 *
 * Escrito à mão em vez de trazer uma biblioteca: são três estados e um
 * temporizador, e o sistema já carrega Radix e lucide para o resto. Uma
 * dependência a mais aqui não pagaria o próprio peso.
 *
 * O erro não some sozinho — quem precisa ler uma falha merece decidir quando
 * dispensá-la. O sucesso desaparece em quatro segundos.
 */

type ToastKind = "success" | "error";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const SUCCESS_DURATION_MS = 4000;

const ToastContext = React.createContext<((kind: ToastKind, message: string) => void) | null>(null);

/**
 * Dispara um aviso. Fora de um `ToastProvider` vira `console`: um aviso que
 * não aparece nunca deve derrubar a ação que ele estava só comentando.
 */
export function useToast() {
  const push = React.useContext(ToastContext);

  return React.useMemo(
    () => ({
      success: (message: string) =>
        push ? push("success", message) : console.info("[toast]", message),
      error: (message: string) =>
        push ? push("error", message) : console.error("[toast]", message),
    }),
    [push],
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextId = React.useRef(0);

  const dismiss = React.useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = React.useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, kind, message }]);

      if (kind === "success") {
        window.setTimeout(() => dismiss(id), SUCCESS_DURATION_MS);
      }
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}

      {/* `polite` para não interromper o que o leitor de tela estiver falando. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.kind === "error" ? "alert" : "status"}
            className={cn(
              "motion-enter pointer-events-auto flex items-start gap-2.5 rounded-lg border p-3 text-[13px] shadow-lg shadow-black/30",
              toast.kind === "success"
                ? "border-emerald-500/25 bg-surface text-foreground"
                : "border-destructive/30 bg-surface text-foreground",
            )}
          >
            {toast.kind === "success" ? (
              <CheckCircle2 className="mt-px h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="mt-px h-4 w-4 shrink-0 text-destructive" />
            )}

            <p className="min-w-0 flex-1 leading-relaxed">{toast.message}</p>

            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dispensar aviso"
              className="-m-1 shrink-0 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/70"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
