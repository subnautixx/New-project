import { z } from "zod";

/**
 * Variáveis públicas — vão para o bundle do navegador.
 * Nunca adicione segredo aqui.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

/** Variáveis server-side. Jamais expostas ao cliente. */
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  META_APP_SECRET: z.string().min(1).optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(1).optional(),
  META_GRAPH_API_VERSION: z.string().default("v21.0"),
});

let cachedPublicEnv: z.infer<typeof publicSchema> | null = null;

/**
 * Lê as variáveis públicas sob demanda.
 *
 * Já foi validação no topo do módulo, e isso acoplava a BUILD à configuração
 * de runtime: `next build` importa cada rota para coletar dados, o parse
 * rodava ali e o build inteiro morria com "Failed to collect page data for
 * /api/admin/users" — uma mensagem que não diz que faltou variável.
 *
 * Agora o build passa e a falta só aparece na primeira requisição, dizendo
 * qual variável falta. Vale lembrar que `NEXT_PUBLIC_*` é substituída no
 * bundle durante a build: para o navegador funcionar, elas precisam existir
 * no momento em que a build roda, não só em execução.
 */
export function publicEnv(): z.infer<typeof publicSchema> {
  if (cachedPublicEnv) return cachedPublicEnv;

  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      `Configuração de ambiente inválida: ${parsed.error.issues
        .map((i) => i.path.join("."))
        .join(", ")}`,
    );
  }

  cachedPublicEnv = parsed.data;
  return cachedPublicEnv;
}

let cachedServerEnv: z.infer<typeof serverSchema> | null = null;

/**
 * Lê o ambiente server-side sob demanda. Chamar isto a partir de um
 * componente de cliente é um erro — as variáveis simplesmente não existem lá.
 */
export function serverEnv(): z.infer<typeof serverSchema> {
  if (cachedServerEnv) return cachedServerEnv;

  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    META_APP_SECRET: process.env.META_APP_SECRET,
    META_WEBHOOK_VERIFY_TOKEN: process.env.META_WEBHOOK_VERIFY_TOKEN,
    META_GRAPH_API_VERSION: process.env.META_GRAPH_API_VERSION ?? "v21.0",
  });

  if (!parsed.success) {
    throw new Error(
      `Configuração de ambiente inválida: ${parsed.error.issues
        .map((i) => i.path.join("."))
        .join(", ")}`,
    );
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}
