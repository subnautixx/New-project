import "server-only";

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types/database";

export interface ApiActor {
  id: string;
  full_name: string;
  role: UserRole;
}

type Authorized = { ok: true; actor: ApiActor; supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> };
type Unauthorized = { ok: false; response: NextResponse };

/**
 * Autentica a requisição e devolve também o cliente ligado à sessão.
 * Toda rota de API começa por aqui — nada é deduzido do corpo do request.
 */
export async function authorizeRequest(): Promise<Authorized | Unauthorized> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  return {
    ok: true,
    actor: { id: profile.id, full_name: profile.full_name, role: profile.role },
    supabase,
  };
}

export async function authorizeAdmin(): Promise<Authorized | Unauthorized> {
  const result = await authorizeRequest();
  if (!result.ok) return result;

  if (result.actor.role !== "admin") {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  return result;
}

/** Registra ação administrativa. O admin precisa saber quem fez o quê. */
export async function writeAuditLog(params: {
  actorUserId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}): Promise<void> {
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");

  await createSupabaseAdminClient()
    .from("audit_logs")
    .insert({
      actor_user_id: params.actorUserId,
      action: params.action,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      metadata: (params.metadata ?? {}) as never,
      ip: params.ip ?? null,
    });
}

export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? headers.get("x-real-ip");
}
