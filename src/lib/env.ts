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

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

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
