import type { LeadStatus } from "@/lib/types/database";

/** O funil, na ordem. Curto de propósito. */
export const FUNNEL_ORDER: LeadStatus[] = [
  "novo",
  "contatado",
  "respondeu",
  "interessado",
  "negociacao",
  "consignado",
];

/** Estados terminais fora do funil linear. */
export const TERMINAL_STATUSES: LeadStatus[] = ["perdido", "sem_resposta"];

export const ALL_STATUSES: LeadStatus[] = [...FUNNEL_ORDER, ...TERMINAL_STATUSES];

export const STATUS_LABEL: Record<LeadStatus, string> = {
  novo: "Novo",
  contatado: "Contatado",
  respondeu: "Respondeu",
  interessado: "Interessado",
  negociacao: "Negociação",
  consignado: "Consignado",
  perdido: "Perdido",
  sem_resposta: "Sem resposta",
};

/**
 * Cores do badge de status. Um tom por etapa, sem degradê e sem excesso —
 * o objetivo é leitura rápida da lista, não decoração.
 */
export const STATUS_CLASS: Record<LeadStatus, string> = {
  novo: "bg-zinc-500/12 text-zinc-300 ring-zinc-500/25",
  contatado: "bg-sky-500/12 text-sky-300 ring-sky-500/25",
  respondeu: "bg-cyan-500/12 text-cyan-300 ring-cyan-500/25",
  interessado: "bg-amber-500/12 text-amber-300 ring-amber-500/25",
  negociacao: "bg-orange-500/12 text-orange-300 ring-orange-500/25",
  consignado: "bg-emerald-500/12 text-emerald-300 ring-emerald-500/25",
  perdido: "bg-red-500/12 text-red-300 ring-red-500/25",
  sem_resposta: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/20",
};

/**
 * Ponto colorido do status. Onde a densidade importa — a lista de conversas —
 * um ponto de 6px carrega a mesma informação que um badge, ocupando um oitavo
 * do espaço e sem competir com o nome do cliente.
 */
export const STATUS_DOT: Record<LeadStatus, string> = {
  novo: "bg-zinc-400",
  contatado: "bg-sky-400",
  respondeu: "bg-cyan-400",
  interessado: "bg-amber-400",
  negociacao: "bg-orange-400",
  consignado: "bg-emerald-400",
  perdido: "bg-red-400",
  sem_resposta: "bg-zinc-500",
};

export function statusLabel(status: LeadStatus): string {
  return STATUS_LABEL[status];
}

/** Plataformas onde os consignadores encontram os anúncios. */
export const SOURCE_PLATFORMS = [
  "OLX",
  "Webmotors",
  "iCarros",
  "Mercado Livre",
  "Facebook Marketplace",
  "Instagram",
  "Indicação",
  "Outro",
] as const;

export type SourcePlatform = (typeof SOURCE_PLATFORMS)[number];

/**
 * Avanço automático de status a partir de fatos da conversa.
 * Só empurra para frente e nunca mexe em estado terminal ou já adiantado —
 * a decisão comercial continua sendo do consignador.
 */
export function nextStatusAfterOutbound(current: LeadStatus): LeadStatus | null {
  return current === "novo" ? "contatado" : null;
}

export function nextStatusAfterInbound(current: LeadStatus): LeadStatus | null {
  if (current === "novo" || current === "contatado" || current === "sem_resposta") {
    return "respondeu";
  }
  return null;
}
