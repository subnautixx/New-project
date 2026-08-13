import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-12">
      {/* Halo único e discreto. Nenhuma outra decoração na tela. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.07] blur-3xl"
      />

      <div className="relative w-full max-w-[380px]">
        <div className="mb-7 space-y-2.5">
          <Logo className="text-xl" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            Acesso restrito à equipe.
            <br />
            Entre com suas credenciais para continuar.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-xl shadow-black/20">
          <LoginForm nextPath={next} />
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Perdeu o acesso? Fale com o administrador da 4FMOTORS.
        </p>
      </div>
    </main>
  );
}
