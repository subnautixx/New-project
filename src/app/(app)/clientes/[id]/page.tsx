import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactNotes } from "@/components/crm/contact-notes";
import { StatusSelect } from "@/components/crm/status-select";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Separator } from "@/components/ui/misc";
import { requireProfile } from "@/lib/auth/session";
import { fetchContactNotes, fetchStatusHistory } from "@/lib/data/queries";
import { STATUS_LABEL } from "@/lib/domain/lead";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatCurrencyBRL, formatKm } from "@/lib/utils";

export const metadata: Metadata = { title: "Cliente" };
export const dynamic = "force-dynamic";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createSupabaseServerClient();

  // Sem contato visível pela RLS = 404. Não existe "acesso negado" que revele
  // a existência de um cliente de outro consignador.
  const { data: contact } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!contact) notFound();

  const [{ data: vehicles }, { data: owner }, notes, history] = await Promise.all([
    supabase.from("vehicles").select("*").eq("contact_id", id).order("is_primary", { ascending: false }),
    supabase.from("profiles").select("id, full_name").eq("id", contact.owner_user_id).maybeSingle(),
    fetchContactNotes(supabase, id),
    fetchStatusHistory(supabase, id),
  ]);

  const vehicle = vehicles?.[0] ?? null;
  const listingUrl = vehicle?.listing_url ?? contact.listing_url;

  return (
    <>
      <PageHeader
        title={contact.full_name}
        description={formatPhone(contact.phone_e164)}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/inbox">Abrir inbox</Link>
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-5xl gap-6 p-4 sm:p-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Veículo
              </h2>

              {vehicle ? (
                <>
                  <p className="text-sm font-medium">
                    {[vehicle.brand, vehicle.model, vehicle.version].filter(Boolean).join(" ") ||
                      "Sem descrição"}
                  </p>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Field label="Ano">
                      {vehicle.year
                        ? `${vehicle.year}${vehicle.model_year ? `/${vehicle.model_year}` : ""}`
                        : "—"}
                    </Field>
                    <Field label="KM">{formatKm(vehicle.km)}</Field>
                    <Field label="Preço anunciado">{formatCurrencyBRL(vehicle.listed_price)}</Field>
                    <Field label="Plataforma">{vehicle.source_platform ?? "—"}</Field>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum veículo cadastrado.</p>
              )}

              {listingUrl ? (
                <a
                  href={listingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary underline-offset-2 hover:underline"
                >
                  Abrir anúncio original
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </section>

            <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Notas
              </h2>
              <ContactNotes contactId={id} initialNotes={notes} currentUserId={profile.id} />
            </section>
          </div>

          <div className="space-y-6">
            <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Situação
              </h2>

              <StatusSelect contactId={id} value={contact.status} />

              <Separator />

              <Field label="Responsável">{owner?.full_name ?? "—"}</Field>
              <Field label="Cadastrado em">{formatDate(contact.created_at)}</Field>
              <Field label="Última interação">{formatDate(contact.last_interaction_at)}</Field>

              {contact.next_action_at ? (
                <Field label="Próxima ação">
                  {formatDateTime(contact.next_action_at)}
                  {contact.next_action_note ? ` · ${contact.next_action_note}` : ""}
                </Field>
              ) : null}

              {contact.notes ? <Field label="Observações">{contact.notes}</Field> : null}
            </section>

            {history.length > 0 ? (
              <section className="space-y-2 rounded-lg border border-border bg-surface p-4">
                <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Histórico
                </h2>
                <ul className="space-y-1.5">
                  {history.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-2 text-xs">
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {STATUS_LABEL[entry.to_status]}
                      </Badge>
                      <span className="truncate text-muted-foreground">
                        {formatDateTime(entry.created_at)}
                        {entry.changed_by ? ` · ${entry.changed_by.full_name}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
