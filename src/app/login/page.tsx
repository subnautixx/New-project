import { MessagesSquare, ShieldCheck, UserRoundCheck } from "lucide-react";
import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

/**
 * Tela dividida: à esquerda a marca, à direita o formulário.
 *
 * A coluna da marca é enfeite com função — diz o que é o sistema para quem
 * chega pela primeira vez e some abaixo de `lg`, onde o que importa é o campo
 * de e-mail estar acima da dobra. Nada aqui é decoração pura: a textura e o
 * halo já existem no sistema (`chat-canvas` e o acento âmbar), então a tela
 * de entrada parece o produto, e não uma peça à parte.
 */

const HIGHLIGHTS = [
  {
    icon: MessagesSquare,
    title: "Conversas no lugar certo",
    body: "Todo o WhatsApp da loja em uma inbox só, com o histórico do cliente ao lado.",
  },
  {
    icon: UserRoundCheck,
    title: "Cada cliente com um dono",
    body: "Mesmo com o número compartilhado, ninguém atende em cima do outro.",
  },
  {
    icon: ShieldCheck,
    title: "Cloud API oficial da Meta",
    body: "Sem automação de WhatsApp Web e sem contornar as regras da plataforma.",
  },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="min-h-dvh lg:grid lg:grid-cols-[1.1fr_1fr]">
      <aside className="chat-canvas relative hidden flex-col justify-between overflow-hidden border-r border-border p-12 lg:flex">
        {/* Halo único, ancorado no canto — a mesma luz âmbar do resto do sistema. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-primary/[0.07] blur-3xl"
        />

        <div className="relative">
          <Logo className="text-xl" />
          <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Consignação de veículos
          </p>
        </div>

        <div className="relative max-w-[420px] space-y-9">
          <h1 className="text-[26px] font-semibold leading-[1.25] tracking-tight text-foreground">
            O WhatsApp da loja,
            <br />
            organizado por cliente.
          </h1>

          <ul className="space-y-5">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex gap-3.5">
                <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-muted-foreground">
          Uso interno da equipe 4FMOTORS.
        </p>
      </aside>

      <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-5 py-12 lg:min-h-0">
        {/* Abaixo de `lg` a coluna da marca some, e o halo vem para cá. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[380px] w-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.06] blur-3xl lg:hidden"
        />

        <div className="motion-enter relative w-full max-w-[352px]">
          <div className="mb-8">
            {/* Sem a coluna da marca ao lado, a logo precisa aparecer aqui. */}
            <Logo className="mb-7 block text-lg lg:hidden" />

            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Entrar na conta
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Acesso restrito à equipe. Use o e-mail cadastrado pelo administrador.
              </p>
            </div>
          </div>

          <LoginForm nextPath={next} />

          <p className="mt-8 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
            Perdeu o acesso ou esqueceu a senha? Fale com o administrador da 4FMOTORS — só ele
            cria e reativa usuários.
          </p>
        </div>
      </div>
    </main>
  );
}
