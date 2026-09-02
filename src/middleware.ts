import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// `/privacidade` é público por exigência da Meta: a política precisa abrir sem
// login e sem bloqueio a rastreadores para o app passar na análise.
const PUBLIC_PATHS = ["/login", "/auth", "/privacidade"];

/**
 * Renova a sessão a cada navegação e barra acesso anônimo.
 * Isto é conveniência de roteamento — a autorização de verdade está na RLS
 * e nas verificações das rotas de API.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // O webhook da Meta é autenticado por assinatura HMAC, não por sessão.
  if (pathname.startsWith("/api/whatsapp/webhook")) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    // Rota de API responde 401. Redirecionar faria o fetch do navegador seguir
    // para o HTML do login, e o response.json() quebraria com um erro que não
    // diz nada sobre a sessão ter expirado.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const url = request.nextUrl.clone();
    const search = request.nextUrl.search;

    url.pathname = "/login";
    url.search = "";
    // Guarda o destino completo: sem a query, um link direto para uma conversa
    // (`/inbox?c=...`) cairia na inbox genérica depois do login.
    url.searchParams.set("next", `${pathname}${search}`);

    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/inbox";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
