"use client";

import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      // Mensagem genérica de propósito: não revela se o e-mail existe.
      setError("E-mail ou senha inválidos.");
      setPending(false);
      return;
    }

    // O middleware barra usuário desativado; refresh garante que o servidor
    // reavalie a sessão antes de renderizar a área interna.
    router.replace(safeRedirectPath(nextPath));
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          disabled={pending}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@4fmotors.com.br"
          className="h-10"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Senha</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            disabled={pending}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            // Caps Lock ligado é a causa mais banal de "minha senha não funciona".
            onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
            onBlur={() => setCapsLock(false)}
            className="h-10 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={showPassword}
            className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {capsLock ? (
          <p className="text-[11px] text-amber-300/90">Caps Lock está ligado.</p>
        ) : null}
      </div>

      {/* `aria-live` para que o leitor de tela anuncie a falha sem mudar o foco. */}
      <div aria-live="polite">
        {error ? (
          <p
            role="alert"
            className="motion-fade flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-[13px] text-destructive ring-1 ring-inset ring-destructive/25"
          >
            <AlertCircle className="mt-px h-4 w-4 shrink-0" />
            {error}
          </p>
        ) : null}
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Entrando…
          </>
        ) : (
          <>
            Entrar
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  );
}
