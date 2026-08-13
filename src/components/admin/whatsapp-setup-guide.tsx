"use client";

import { ArrowLeft, ArrowRight, Check, Copy } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Passo a passo de como conectar um número.
 *
 * Existe porque a parte difícil não é esta tela — é o painel da Meta. Quem
 * cadastra o número precisa saber de onde sai cada identificador, que o token
 * temporário morre em 24h e que sem o webhook configurado nada entra no CRM.
 *
 * As ilustrações são esquemas em CSS, não capturas de tela: a Meta muda o
 * layout do painel com frequência e captura desatualizada engana mais do que
 * ajuda.
 */

/** Valor que o admin precisa copiar para o painel da Meta. */
function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sem permissão de área de transferência o valor continua visível e
      // selecionável na tela — não há nada a comunicar.
    }
  }

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex items-center gap-1.5 rounded-md bg-surface-muted px-2.5 py-1.5">
        <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
          {value}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/70"
          aria-label={`Copiar ${label}`}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}

/** O que precisa existir antes: conta, aplicativo, número. */
function PrerequisiteSketch() {
  const items = ["Meta Business", "Aplicativo", "Número"];

  return (
    <div className="flex h-full items-center justify-center gap-2 px-6">
      {items.map((item, i) => (
        <div key={item} className="flex items-center gap-2">
          <div className="w-[74px] space-y-1.5 rounded-md bg-surface-muted p-2 text-center">
            <div className="mx-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[9px] text-primary/80">
              {i + 1}
            </div>
            <p className="text-[8px] leading-tight text-muted-foreground">{item}</p>
          </div>
          {i < items.length - 1 ? (
            <span className="text-muted-foreground/50">→</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Painel da Meta: menu à esquerda, os três valores destacados à direita. */
function MetaPanelSketch() {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="flex w-full max-w-[300px] gap-2 rounded-md border border-border bg-surface-muted p-2">
        <div className="w-[28%] space-y-1">
          <div className="h-1.5 w-3/4 rounded-sm bg-border" />
          <div className="h-1.5 w-2/3 rounded-sm bg-border/60" />
          <div className="h-1.5 w-full rounded-sm bg-primary/40" />
          <div className="h-1.5 w-1/2 rounded-sm bg-border/60" />
        </div>
        <div className="flex-1 space-y-1.5">
          {["Phone ID", "WABA ID", "Token"].map((row) => (
            <div key={row} className="flex items-center gap-1.5">
              <span className="w-[46px] shrink-0 whitespace-nowrap text-[8px] leading-none text-muted-foreground">
                {row}
              </span>
              <div className="h-2.5 flex-1 rounded-sm bg-background ring-1 ring-inset ring-border" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Os dados saindo do painel e entrando no formulário desta tela. */
function TransferSketch() {
  return (
    <div className="flex h-full items-center justify-center gap-3 px-6">
      <div className="w-[38%] space-y-1 rounded-md bg-surface-muted p-2">
        <div className="h-1.5 w-1/2 rounded-sm bg-border" />
        <div className="h-2 rounded-sm bg-background ring-1 ring-inset ring-border" />
        <div className="h-2 rounded-sm bg-background ring-1 ring-inset ring-border" />
        <p className="pt-0.5 text-center text-[8px] text-muted-foreground">Painel da Meta</p>
      </div>

      <span className="mb-4 text-muted-foreground/50">→</span>

      <div className="w-[38%] space-y-1 rounded-md bg-surface-muted p-2">
        <div className="h-1.5 w-1/2 rounded-sm bg-primary/40" />
        <div className="h-2 rounded-sm bg-background ring-1 ring-inset ring-primary/30" />
        <div className="h-2 rounded-sm bg-background ring-1 ring-inset ring-primary/30" />
        <p className="pt-0.5 text-center text-[8px] text-muted-foreground">Conectar número</p>
      </div>
    </div>
  );
}

/** O webhook: a Meta avisando o CRM a cada mensagem recebida. */
function WebhookSketch() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6">
      <div className="flex w-full max-w-[300px] items-center gap-2">
        <div className="flex h-12 flex-1 items-center justify-center rounded-md bg-surface-muted text-[9px] text-muted-foreground">
          Meta
        </div>
        <div className="flex flex-1 flex-col items-center gap-1">
          <span className="font-mono text-[8px] text-muted-foreground">messages</span>
          <div className="flex w-full items-center">
            <div className="h-px flex-1 bg-primary/40" />
            <span className="-ml-0.5 text-[9px] leading-none text-primary/70">▶</span>
          </div>
        </div>
        <div className="flex h-12 flex-1 items-center justify-center rounded-md bg-primary/15 text-[9px] text-foreground ring-1 ring-inset ring-primary/30">
          CRM
        </div>
      </div>
      <p className="max-w-[280px] text-center text-[9px] leading-tight text-muted-foreground">
        Sem webhook, o envio funciona e a resposta do cliente nunca chega.
      </p>
    </div>
  );
}

/** Coexistência: o celular e o CRM no mesmo número. */
function CoexistenceSketch() {
  return (
    <div className="flex h-full items-center justify-center gap-3 px-6">
      {[
        {
          label: "Celular",
          shape: <div className="h-14 w-9 rounded-md bg-surface-muted ring-1 ring-inset ring-border" />,
        },
        {
          label: "mesmo número",
          shape: (
            <div className="h-6 w-16 rounded-full bg-emerald-500/20 ring-1 ring-inset ring-emerald-500/30" />
          ),
        },
        {
          label: "CRM",
          shape: (
            <div className="h-14 w-20 rounded-md bg-primary/15 ring-1 ring-inset ring-primary/30" />
          ),
        },
      ].map((item) => (
        <div key={item.label} className="flex flex-col items-center gap-1.5">
          <div className="flex h-14 items-center">{item.shape}</div>
          <p className="text-[9px] leading-none text-muted-foreground">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

interface GuideStep {
  title: string;
  visual: React.ReactNode;
  body: React.ReactNode;
}

function buildSteps(webhookUrl: string): GuideStep[] {
  return [
    {
      title: "Antes de começar",
      visual: <PrerequisiteSketch />,
      body: (
        <>
          <p>
            A conexão é feita pela <strong className="text-foreground">Cloud API oficial</strong>{" "}
            da Meta. Você vai precisar de três coisas, todas do lado da Meta:
          </p>
          <ul className="space-y-1.5 pl-1">
            <li className="flex gap-2">
              <span className="text-muted-foreground/60">1.</span>
              <span>
                Uma conta no <strong className="text-foreground">Meta Business</strong> com a
                empresa verificada.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-muted-foreground/60">2.</span>
              <span>
                Um aplicativo em <strong className="text-foreground">developers.facebook.com</strong>{" "}
                com o produto <strong className="text-foreground">WhatsApp</strong> adicionado.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-muted-foreground/60">3.</span>
              <span>
                O número da loja cadastrado nesse aplicativo. Um número já em uso no WhatsApp
                Business só entra pelo modo de coexistência — o último passo explica.
              </span>
            </li>
          </ul>
        </>
      ),
    },
    {
      title: "Pegue os dados no painel da Meta",
      visual: <MetaPanelSketch />,
      body: (
        <>
          <p>
            No aplicativo, abra{" "}
            <strong className="text-foreground">WhatsApp · Configuração da API</strong>. Ali estão,
            na mesma tela:
          </p>
          <ul className="list-disc space-y-1 pl-5 marker:text-muted-foreground/50">
            <li>
              <strong className="text-foreground">Phone number ID</strong> — número comprido, logo
              abaixo do telefone selecionado.
            </li>
            <li>
              <strong className="text-foreground">WABA ID</strong> — o identificador da conta
              comercial, no mesmo bloco.
            </li>
            <li>
              <strong className="text-foreground">Token de acesso</strong> — o botão de gerar
              token.
            </li>
          </ul>
          <p className="rounded-md bg-amber-500/[0.08] px-2.5 py-2 text-xs text-amber-200/90 ring-1 ring-inset ring-amber-500/20">
            O token que aparece de cara é temporário e expira em 24 horas. Para a operação do dia
            a dia, crie um <strong>usuário do sistema</strong> em Configurações do Business e gere
            um token permanente para ele.
          </p>
        </>
      ),
    },
    {
      title: "Cadastre o número aqui",
      visual: <TransferSketch />,
      body: (
        <>
          <p>
            Volte para esta tela, clique em{" "}
            <strong className="text-foreground">Conectar número</strong> e cole os três valores.
          </p>
          <ul className="list-disc space-y-1 pl-5 marker:text-muted-foreground/50">
            <li>
              <strong className="text-foreground">Compartilhado</strong> é o número da loja, usado
              por vários consignadores. <strong className="text-foreground">Individual</strong> é o
              número de um vendedor só.
            </li>
            <li>
              O <strong className="text-foreground">responsável padrão</strong> recebe as conversas
              de quem escreve pela primeira vez, antes de alguém assumir.
            </li>
            <li>
              Marque quem pode usar o número. Quem não estiver marcado não envia por ele — a regra
              vale no banco, não só na tela.
            </li>
          </ul>
          <p>
            O token é gravado em uma tabela sem permissão de leitura: nem esta tela consegue
            mostrá-lo depois. Se precisar trocar, remova o número e cadastre de novo.
          </p>
        </>
      ),
    },
    {
      title: "Ligue o webhook",
      visual: <WebhookSketch />,
      body: (
        <>
          <p>
            É o webhook que faz as respostas dos clientes caírem na Inbox. No painel da Meta, em{" "}
            <strong className="text-foreground">WhatsApp · Configuração</strong>, edite os webhooks
            e informe:
          </p>

          <div className="space-y-2 rounded-md border border-border bg-surface-muted/50 p-2.5">
            <CopyRow label="URL de callback" value={webhookUrl} />
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Token de verificação
              </p>
              <p className="text-xs">
                O mesmo valor da variável{" "}
                <code className="rounded-sm bg-background px-1 py-0.5 font-mono text-[11px]">
                  META_WEBHOOK_VERIFY_TOKEN
                </code>
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Campos a assinar
              </p>
              <p className="text-xs">
                <code className="rounded-sm bg-background px-1 py-0.5 font-mono text-[11px]">
                  messages
                </code>{" "}
                — só esse.
              </p>
            </div>
          </div>

          <p className="rounded-md bg-amber-500/[0.08] px-2.5 py-2 text-xs text-amber-200/90 ring-1 ring-inset ring-amber-500/20">
            A variável <strong>META_APP_SECRET</strong> também precisa estar configurada no
            servidor. Sem ela o webhook recusa tudo — o endereço é público, e é a assinatura da
            Meta que prova que a mensagem veio mesmo dela.
          </p>
        </>
      ),
    },
    {
      title: "Coexistência e teste final",
      visual: <CoexistenceSketch />,
      body: (
        <>
          <p>
            Com a <strong className="text-foreground">coexistência</strong> marcada, o vendedor
            continua usando o WhatsApp Business no celular e o mesmo número atende pelo CRM. É esse
            o caminho da prospecção: a primeira mensagem para o dono do anúncio sai do celular, e
            quando ele responde a conversa aparece aqui.
          </p>
          <p>
            Para conferir se ficou tudo certo, peça a alguém de fora para mandar uma mensagem para
            o número. Em poucos segundos ela deve aparecer na{" "}
            <strong className="text-foreground">Inbox</strong>.
          </p>
          <p>
            Não apareceu? O webhook é o suspeito de sempre — confira a URL, o token de verificação
            e se o campo <code className="font-mono text-[11px]">messages</code> está assinado.
          </p>
        </>
      ),
    },
  ];
}

export function WhatsappSetupGuide({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [index, setIndex] = React.useState(0);
  const [origin, setOrigin] = React.useState<string | null>(null);

  // Lido depois da montagem: `window` não existe na renderização do servidor,
  // e ler ali produziria divergência de hidratação.
  React.useEffect(() => setOrigin(window.location.origin), []);

  const steps = React.useMemo(
    () => buildSteps(`${origin ?? "https://seu-dominio"}/api/whatsapp/webhook`),
    [origin],
  );

  const step = steps[index];
  const isLast = index === steps.length - 1;

  function close() {
    onOpenChange(false);
    setIndex(0);
  }

  if (!step) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border py-3 pl-5 pr-12">
          <span className="text-sm font-medium">Como conectar um número</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {index + 1} de {steps.length}
          </span>
        </div>

        <div className="h-[168px] shrink-0 border-b border-border bg-background">
          {step.visual}
        </div>

        <div className="max-h-[42vh] space-y-3 overflow-y-auto px-5 py-4">
          <DialogTitle className="text-base font-semibold tracking-tight">
            {step.title}
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
          ) : null}

          <Button size="sm" onClick={() => (isLast ? close() : setIndex((i) => i + 1))}>
            {isLast ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Entendi
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
