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
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2">
          <Logo className="text-lg" />
          <p className="text-sm text-muted-foreground">
            Acesso restrito à equipe. Entre com suas credenciais.
          </p>
        </div>

        <LoginForm nextPath={next} />

        <p className="text-xs text-muted-foreground">
          Perdeu o acesso? Fale com o administrador da 4FMOTORS.
        </p>
      </div>
    </main>
  );
}
