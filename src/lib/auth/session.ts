import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/types/database";

export type SessionProfile = Pick<
  ProfileRow,
  "id" | "full_name" | "email" | "role" | "is_active"
>;

/** Perfil do usuário logado, ou null. Não redireciona. */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) return null;

  return profile;
}

/** Para uso em páginas: garante sessão ativa ou manda para o login. */
export async function requireProfile(): Promise<SessionProfile> {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  return profile;
}

/** Para uso em páginas restritas ao administrador. */
export async function requireAdmin(): Promise<SessionProfile> {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/inbox");
  return profile;
}

export function isAdmin(profile: SessionProfile | null): boolean {
  return profile?.role === "admin";
}
