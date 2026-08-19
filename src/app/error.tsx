"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

/**
 * Tela de falha.
 *
 * Sem isto, um erro em qualquer rota cai na página padrão do Next — sem a
 * marca, sem caminho de volta e com um texto que não diz nada a quem está
 * tentando atender um cliente.
 *
 * A mensagem do erro não vai para a tela de propósito: pode conter detalhe de
 * consulta ou de infraestrutura. Vai para o console, onde quem dá suporte
 * consegue ler.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-12 text-center">
      <Logo className="text-lg" />

      <h1 className="mt-8 font-display text-xl font-semibold tracking-[-0.01em]">Algo saiu do lugar</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        A tela não conseguiu carregar. Tentar de novo costuma resolver — nada do que você já
        salvou se perdeu.
      </p>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset}>
          <RotateCcw className="h-4 w-4" />
          Tentar de novo
        </Button>
        <Button variant="outline" asChild>
          <a href="/inbox">Voltar para a Inbox</a>
        </Button>
      </div>

      {error.digest ? (
        <p className="mt-8 font-mono text-[11px] text-muted-foreground/70">
          Código: {error.digest}
        </p>
      ) : null}
    </main>
  );
}
