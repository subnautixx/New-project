"use client";

import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useMemo, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { TOUR_STEPS } from "./steps";

interface Props {
  userId: string;
  firstName: string;
  isAdmin: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Primeiro acesso marca como concluído ao fechar; reabrir depois não remarca. */
  markCompleteOnClose: boolean;
}

export function OnboardingTour({
  userId,
  firstName,
  isAdmin,
  open,
  onOpenChange,
  markCompleteOnClose,
}: Props) {
  const steps = useMemo(() => TOUR_STEPS.filter((s) => !s.adminOnly || isAdmin), [isAdmin]);
  const [index, setIndex] = useState(0);

  const step = steps[index];
  const isLast = index === steps.length - 1;

  async function finish() {
    onOpenChange(false);
    setIndex(0);

    if (!markCompleteOnClose) return;

    // Falha aqui só faz o tutorial reaparecer no próximo acesso — nada que
    // justifique travar a entrada do usuário no sistema.
    await createSupabaseBrowserClient()
      .from("profiles")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", userId);
  }

  if (!step) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) void finish();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border py-3 pl-5 pr-12">
          <Logo compact={false} className="text-sm" />
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {index + 1} de {steps.length}
          </span>
        </div>

        {/* Ilustração: esquema simples da tela, não captura de tela — não
            desatualiza quando a interface muda. */}
        <div className="h-[168px] border-b border-border bg-background">{step.visual}</div>

        <div className="space-y-3 px-5 py-4">
          <DialogTitle className="text-base font-semibold tracking-tight">
            {index === 0 ? `${firstName}, ${step.title.toLowerCase()}` : step.title}
          </DialogTitle>

          <DialogDescription asChild>
            <div className="space-y-2.5 text-[13px] leading-relaxed text-muted-foreground">
              {step.body}
            </div>
          </DialogDescription>
        </div>

        <div className="flex items-center gap-3 border-t border-border px-5 py-3">
          <div className="flex flex-1 items-center gap-1.5">
            {steps.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Ir para o passo ${i + 1}`}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-200",
                  i === index ? "w-5 bg-primary" : "w-1.5 bg-border hover:bg-muted-foreground",
                )}
              />
            ))}
          </div>

          {index > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setIndex((i) => i - 1)}>
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => void finish()}>
              Pular
            </Button>
          )}

          <Button size="sm" onClick={() => (isLast ? void finish() : setIndex((i) => i + 1))}>
            {isLast ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Começar
              </>
            ) : (
              <>
                Próximo
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
