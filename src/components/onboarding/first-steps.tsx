"use client";

import { Check, MessagesSquare, Smartphone, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * O que fazer numa loja que acabou de instalar o CRM.
 *
 * A inbox é a primeira tela depois do login, e num banco vazio ela não tem o
 * que mostrar. Em vez de "selecione uma conversa" — sem lista para selecionar —
 * ela passa a dizer o que falta, na ordem em que precisa acontecer.
 *
 * Cada passo é marcado a partir do estado real do banco, não de um flag de
 * "já vi isto": quem remover o último número volta a ver o passo do WhatsApp.
 */

export interface FirstStepsState {
  hasWhatsapp: boolean;
  hasTeam: boolean;
  hasContacts: boolean;
}

interface Step {
  icon: typeof Smartphone;
  title: string;
  body: string;
  done: boolean;
  href?: string;
  cta?: string;
}

export function FirstSteps({ state, isAdmin }: { state: FirstStepsState; isAdmin: boolean }) {
  const steps: Step[] = isAdmin
    ? [
        {
          icon: Smartphone,
          title: "Conecte o número da loja",
          body: "É o que faz as mensagens entrarem aqui. A tela WhatsApps tem o passo a passo do painel da Meta.",
          done: state.hasWhatsapp,
          href: "/whatsapps",
          cta: "Ir para WhatsApps",
        },
        {
          icon: Users,
          title: "Cadastre os consignadores",
          body: "Cada um enxerga apenas os próprios clientes, mesmo quando o número é compartilhado.",
          done: state.hasTeam,
          href: "/equipe",
          cta: "Ir para Equipe",
        },
        {
          icon: UserPlus,
          title: "Cadastre o primeiro cliente",
          body: "Dono de anúncio, indicação, quem chegou na loja. A conversa aparece aqui quando ele responder.",
          done: state.hasContacts,
          href: "/clientes/novo",
          cta: "Cadastrar cliente",
        },
      ]
    : [
        {
          icon: Smartphone,
          // "Aguarde" riscado não faz sentido: concluído, o passo virou um fato.
          title: state.hasWhatsapp ? "Número liberado para você" : "Aguarde a liberação do número",
          body: "O administrador precisa conectar o WhatsApp e liberar seu acesso a ele.",
          done: state.hasWhatsapp,
        },
        {
          icon: UserPlus,
          title: "Cadastre seu primeiro cliente",
          body: "Dono de anúncio, indicação, quem chegou na loja. A conversa aparece aqui quando ele responder.",
          done: state.hasContacts,
          href: "/clientes/novo",
          cta: "Cadastrar cliente",
        },
      ];

  // O primeiro pendente é o que a pessoa deve fazer agora.
  const current = steps.findIndex((s) => !s.done);

  // Tudo configurado e a inbox ainda vazia é um estado normal: falta o cliente
  // responder. Dizer "faltam estes passos" ali seria mentira.
  if (current === -1) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
          <Check className="h-6 w-6" />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">Tudo pronto</p>
          <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
            A primeira conversa aparece aqui assim que um cliente responder. Lembrando que a
            abordagem inicial sai do celular, pelo WhatsApp Business.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/clientes">Ver meus clientes</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto px-6 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-muted-foreground/70">
            <MessagesSquare className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">Nenhuma conversa ainda</p>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              As conversas aparecem aqui assim que o cliente responder. Faltam estes passos:
            </p>
          </div>
        </div>

        <ol className="space-y-2">
          {steps.map((step, index) => {
            const isCurrent = index === current;

            return (
              <li
                key={step.title}
                className={cn(
                  "flex gap-3 rounded-lg border p-3.5 transition-colors",
                  isCurrent ? "border-primary/25 bg-surface" : "border-border bg-surface/50",
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                    step.done
                      ? "bg-emerald-500/15 text-emerald-400"
                      : isCurrent
                        ? "bg-primary/15 text-primary"
                        : "bg-surface-muted text-muted-foreground/60",
                  )}
                >
                  {step.done ? <Check className="h-3.5 w-3.5" /> : <step.icon className="h-3.5 w-3.5" />}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <p
                    className={cn(
                      "text-[13px] font-medium",
                      step.done ? "text-muted-foreground line-through" : "text-foreground",
                    )}
                  >
                    {step.title}
                  </p>

                  {!step.done ? (
                    <>
                      <p className="text-xs leading-relaxed text-muted-foreground">{step.body}</p>
                      {step.href && isCurrent ? (
                        <Button asChild size="sm" className="mt-2">
                          <Link href={step.href}>{step.cta}</Link>
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
