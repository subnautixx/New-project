import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-12 text-center">
      <Logo className="text-lg" />

      <p className="mt-8 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
        404
      </p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">Esta página não existe</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        O endereço pode ter mudado, ou o cliente que você procura foi transferido para outro
        consignador.
      </p>

      <Button asChild className="mt-7">
        <Link href="/inbox">Voltar para a Inbox</Link>
      </Button>
    </main>
  );
}
