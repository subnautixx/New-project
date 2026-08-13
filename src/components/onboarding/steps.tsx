import type * as React from "react";

/**
 * Conteúdo do tutorial.
 *
 * O passo mais importante é o da prospecção: abordar o dono de um anúncio é
 * contato frio, e pelas regras da Meta isso não sai do CRM. Sem alguém
 * explicar, a equipe tenta disparar em massa e derruba a qualidade do número.
 */

export interface TourStep {
  title: string;
  body: React.ReactNode;
  visual: React.ReactNode;
  adminOnly?: boolean;
}

/** Miniatura da inbox: três colunas, como a tela real. */
function InboxSketch() {
  return (
    <div className="flex h-full gap-1.5 p-3">
      <div className="flex w-[34%] flex-col gap-1 rounded-md bg-surface-muted p-1.5">
        <div className="h-2 rounded-sm bg-border" />
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`space-y-1 rounded-sm p-1 ${i === 1 ? "bg-secondary" : ""}`}
          >
            <div className="flex items-center gap-1">
              <div className="h-2.5 w-2.5 rounded-full bg-border" />
              <div className="h-1.5 flex-1 rounded-sm bg-border" />
            </div>
            <div className="h-1 w-3/4 rounded-sm bg-border/60" />
          </div>
        ))}
      </div>

      <div className="flex flex-1 flex-col justify-end gap-1 rounded-md bg-surface-muted p-1.5">
        <div className="ml-auto h-3 w-2/3 rounded-sm bg-emerald-800/50" />
        <div className="h-3 w-1/2 rounded-sm bg-border" />
        <div className="ml-auto h-3 w-3/5 rounded-sm bg-emerald-800/50" />
        <div className="mt-1 h-3 rounded-sm bg-background ring-1 ring-inset ring-border" />
      </div>

      <div className="w-[24%] space-y-1 rounded-md bg-surface-muted p-1.5">
        <div className="h-4 w-4 rounded-full bg-border" />
        <div className="h-1.5 rounded-sm bg-border" />
        <div className="h-1 w-2/3 rounded-sm bg-border/60" />
        <div className="mt-2 h-2 rounded-sm bg-primary/25" />
      </div>
    </div>
  );
}

/** O caminho da prospecção, em três tempos. */
function ProspectSketch() {
  const stages = [
    { label: "Celular", tone: "bg-border" },
    { label: "Cliente responde", tone: "bg-cyan-400/40" },
    { label: "Cai na inbox", tone: "bg-primary/40" },
  ];

  return (
    <div className="flex h-full items-center justify-center gap-2 px-4">
      {stages.map((stage, i) => (
        <div key={stage.label} className="flex items-center gap-2">
          <div className="space-y-1.5 text-center">
            <div className={`h-10 w-16 rounded-md ${stage.tone}`} />
            <p className="text-[9px] leading-tight text-muted-foreground">{stage.label}</p>
          </div>
          {i < stages.length - 1 ? (
            <span className="mb-4 text-muted-foreground/50">→</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** O funil, do jeito curto que ele é. */
function FunnelSketch() {
  const stages = [
    { label: "Novo", width: "w-full", tone: "bg-zinc-500/30" },
    { label: "Contatado", width: "w-[85%]", tone: "bg-sky-400/30" },
    { label: "Respondeu", width: "w-[70%]", tone: "bg-cyan-400/30" },
    { label: "Interessado", width: "w-[55%]", tone: "bg-amber-400/30" },
    { label: "Negociação", width: "w-[40%]", tone: "bg-orange-400/30" },
    { label: "Consignado", width: "w-[28%]", tone: "bg-emerald-400/40" },
  ];

  return (
    <div className="flex h-full flex-col justify-center gap-1 px-6">
      {stages.map((stage) => (
        <div key={stage.label} className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-right text-[9px] text-muted-foreground">
            {stage.label}
          </span>
          <div className="flex-1">
            <div className={`h-2.5 rounded-sm ${stage.width} ${stage.tone}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Atalhos do campo de mensagem. */
function ComposerSketch() {
  return (
    <div className="flex h-full flex-col justify-center gap-2 px-6">
      <div className="space-y-1 rounded-md bg-surface-muted p-2">
        <div className="h-1.5 w-1/3 rounded-sm bg-primary/40" />
        <div className="h-1 w-full rounded-sm bg-border" />
        <div className="h-1 w-4/5 rounded-sm bg-border/60" />
      </div>
      <div className="flex items-center gap-1.5">
        {["📎", "⚡", "🎤"].map((icon) => (
          <span
            key={icon}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-muted text-xs"
          >
            {icon}
          </span>
        ))}
        <span className="h-7 flex-1 rounded-md bg-background ring-1 ring-inset ring-border" />
        <span className="h-7 w-7 rounded-full bg-primary" />
      </div>
    </div>
  );
}

/** Comparativo da equipe. */
function TeamSketch() {
  const rows = [82, 51, 35, 22];
  const max = Math.max(...rows);

  return (
    <div className="flex h-full flex-col justify-center gap-2 px-6">
      {rows.map((value, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-2 w-10 shrink-0 rounded-sm bg-border" />
          <div className="h-3 flex-1 rounded-sm bg-surface-muted">
            <div
              className="h-full rounded-sm bg-primary/50"
              style={{ width: `${(value / max) * 100}%` }}
            />
          </div>
          <span className="w-5 shrink-0 text-right text-[9px] tabular-nums text-muted-foreground">
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: "Seu dia acontece aqui",
    visual: <InboxSketch />,
    body: (
      <>
        <p>
          A <strong className="text-foreground">Inbox</strong> é a tela principal. À esquerda suas
          conversas, no meio o atendimento, à direita a ficha do cliente com veículo, anúncio e
          histórico.
        </p>
        <p>
          Você enxerga apenas os seus clientes. Mesmo quando a equipe divide o número da loja, cada
          conversa tem um responsável.
        </p>
      </>
    ),
  },
  {
    title: "Como abordar o dono do anúncio",
    visual: <ProspectSketch />,
    body: (
      <>
        <p>
          A primeira mensagem para quem nunca falou com a loja{" "}
          <strong className="text-foreground">sai do seu celular</strong>, pelo WhatsApp Business —
          uma pessoa por vez, como você já faz hoje.
        </p>
        <p>
          Assim que o dono responde, a conversa aparece aqui automaticamente e todo o atendimento
          passa a ser pelo CRM.
        </p>
        <p className="rounded-md bg-amber-500/[0.08] px-2.5 py-2 text-xs text-amber-200/90 ring-1 ring-inset ring-amber-500/20">
          As regras do WhatsApp não permitem disparo em massa para quem não pediu contato. Insistir
          nisso derruba a qualidade do número e pode custar a linha da loja.
        </p>
      </>
    ),
  },
  {
    title: "Mova o cliente pelo funil",
    visual: <FunnelSketch />,
    body: (
      <>
        <p>
          Cada cliente tem um status. Ele anda sozinho no começo — vira{" "}
          <strong className="text-foreground">Contatado</strong> quando você manda a primeira
          mensagem e <strong className="text-foreground">Respondeu</strong> quando o dono responde.
        </p>
        <p>
          Daí em diante é você quem decide: Interessado, Negociação, Consignado. Use{" "}
          <strong className="text-foreground">Próxima ação</strong> para não esquecer de retornar —
          o que vence aparece destacado na lista de clientes.
        </p>
      </>
    ),
  },
  {
    title: "Ganhe tempo no atendimento",
    visual: <ComposerSketch />,
    body: (
      <>
        <p>
          No campo de mensagem você tem <strong className="text-foreground">anexo</strong> para foto
          e documento, <strong className="text-foreground">respostas rápidas</strong> para o que
          você repete todo dia, e <strong className="text-foreground">gravação de áudio</strong>.
        </p>
        <p>
          Digitou uma explicação boa? Salve como resposta rápida ali mesmo e reaproveite na próxima.
        </p>
      </>
    ),
  },
  {
    title: "Acompanhe seu desempenho",
    visual: <TeamSketch />,
    body: (
      <>
        <p>
          Em <strong className="text-foreground">Desempenho</strong> você vê quantos clientes
          abordou, quantos responderam e quantos fecharam — hoje, nos últimos 7 ou 30 dias.
        </p>
        <p>Serve para você mesmo enxergar o que está funcionando na sua abordagem.</p>
      </>
    ),
  },
  {
    title: "O que só você administra",
    adminOnly: true,
    visual: <TeamSketch />,
    body: (
      <>
        <p>
          Como administrador você enxerga todos os clientes e conversas, compara os consignadores
          lado a lado e pode{" "}
          <strong className="text-foreground">transferir um cliente</strong> de um vendedor para
          outro.
        </p>
        <p>
          Em <strong className="text-foreground">Equipe</strong> cria e desativa usuários, em{" "}
          <strong className="text-foreground">WhatsApps</strong> conecta os números, e em{" "}
          <strong className="text-foreground">Auditoria</strong> vê quem fez o quê.
        </p>
      </>
    ),
  },
];
