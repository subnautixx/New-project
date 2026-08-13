"use client";

import { Loader2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PhotoPicker } from "@/components/crm/photo-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/misc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SOURCE_PLATFORMS } from "@/lib/domain/lead";
import { normalizePhone } from "@/lib/phone";
import { uploadContactPhoto } from "@/lib/contacts/upload-photo";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ContactRow, VehicleRow } from "@/lib/types/database";
import { isoToLocalInput, localInputToIso } from "@/lib/time";

interface Props {
  contactId: string;
  /** Botão compacto para caber na ficha lateral da inbox. */
  compact?: boolean;
  onSaved?: () => void;
}

/**
 * Edição de cliente e veículo.
 *
 * Os dados são buscados ao abrir, não recebidos por prop: o mesmo diálogo é
 * usado na ficha da inbox e na página do cliente, que carregam recortes
 * diferentes do registro. Buscar aqui evita salvar em cima de um estado
 * parcial e apagar campo que a tela de origem não conhecia.
 */
export function EditContactDialog({ contactId, compact = false, onSaved }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contact, setContact] = useState<ContactRow | null>(null);
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [platform, setPlatform] = useState<string>("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [name, setName] = useState("");

  async function load(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) return;

    setLoading(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();

    const [{ data: loadedContact }, { data: vehicles }] = await Promise.all([
      supabase.from("contacts").select("*").eq("id", contactId).maybeSingle(),
      supabase
        .from("vehicles")
        .select("*")
        .eq("contact_id", contactId)
        .order("is_primary", { ascending: false })
        .limit(1),
    ]);

    if (!loadedContact) {
      setError("Não foi possível carregar o cliente.");
      setLoading(false);
      return;
    }

    setContact(loadedContact);
    setName(loadedContact.full_name);
    setPhoto(null);
    setPhotoRemoved(false);
    setVehicle(vehicles?.[0] ?? null);
    setPlatform(vehicles?.[0]?.source_platform ?? loadedContact.source_platform ?? "");
    setLoading(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !contact) return;

    const form = new FormData(event.currentTarget);
    const phoneInput = String(form.get("phone") ?? "").trim();
    const phone = normalizePhone(phoneInput);

    if (!phone) {
      setError("Telefone inválido. Informe DDD + número.");
      return;
    }

    setSaving(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const listingUrl = String(form.get("listingUrl") ?? "").trim() || null;
    const nextActionAt = String(form.get("nextActionAt") ?? "").trim();

    const { error: contactError } = await supabase
      .from("contacts")
      .update({
        full_name: name.trim(),
        ...(photoRemoved && !photo ? { photo_path: null } : {}),
        phone_e164: phone,
        phone_raw: phoneInput,
        source_platform: platform || null,
        listing_url: listingUrl,
        notes: String(form.get("notes") ?? "").trim() || null,
        // `datetime-local` não carrega fuso; o valor digitado é horário de
        // Brasília e precisa virar instante antes de ir para o banco.
        next_action_at: nextActionAt ? localInputToIso(nextActionAt) : null,
        next_action_note: String(form.get("nextActionNote") ?? "").trim() || null,
      })
      .eq("id", contactId);

    if (contactError) {
      setError(
        contactError.code === "23505"
          ? "Este telefone já pertence a outro cliente cadastrado."
          : "Não foi possível salvar as alterações.",
      );
      setSaving(false);
      return;
    }

    const vehiclePayload = {
      brand: String(form.get("brand") ?? "").trim() || null,
      model: String(form.get("model") ?? "").trim() || null,
      version: String(form.get("version") ?? "").trim() || null,
      color: String(form.get("color") ?? "").trim() || null,
      plate: String(form.get("plate") ?? "").trim().toUpperCase() || null,
      year: numberOrNull(form.get("year")),
      model_year: numberOrNull(form.get("modelYear")),
      km: numberOrNull(form.get("km")),
      listed_price: numberOrNull(form.get("price")),
      listing_url: listingUrl,
      source_platform: platform || null,
    };

    // O veículo pode não existir: o prospect nasce sem ele quando o vendedor
    // cadastra só o telefone para não perder o contato.
    const { error: vehicleError } = vehicle
      ? await supabase.from("vehicles").update(vehiclePayload).eq("id", vehicle.id)
      : await supabase
          .from("vehicles")
          .insert({ ...vehiclePayload, contact_id: contactId, is_primary: true });

    if (vehicleError) {
      setError("Cliente salvo, mas houve erro ao salvar o veículo.");
      setSaving(false);
      return;
    }

    if (photo) {
      const upload = await uploadContactPhoto(contactId, photo);
      if (!upload.ok) {
        setError(upload.error);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setOpen(false);
    onSaved?.();
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={load}>
      <DialogTrigger asChild>
        {compact ? (
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
            <Pencil className="h-3 w-3" />
            Editar
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar cliente</DialogTitle>
          <DialogDescription>
            Corrija os dados do proprietário e do veículo anunciado.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !contact ? (
          <p className="py-6 text-sm text-destructive">{error ?? "Cliente não encontrado."}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <PhotoPicker
              name={name}
              contactId={contactId}
              photoPath={photoRemoved ? null : contact.photo_path}
              file={photo}
              onFileChange={setPhoto}
              onRemoveExisting={() => setPhotoRemoved(true)}
            />

            <section className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-fullName">Nome *</Label>
                <Input
                  id="edit-fullName"
                  name="fullName"
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-phone">Telefone (WhatsApp) *</Label>
                <Input
                  id="edit-phone"
                  name="phone"
                  required
                  inputMode="tel"
                  defaultValue={contact.phone_e164}
                />
              </div>
            </section>

            <Separator />

            <section className="space-y-3">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Veículo
              </h3>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-brand">Marca</Label>
                  <Input id="edit-brand" name="brand" defaultValue={vehicle?.brand ?? ""} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-model">Modelo</Label>
                  <Input id="edit-model" name="model" defaultValue={vehicle?.model ?? ""} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-version">Versão</Label>
                  <Input id="edit-version" name="version" defaultValue={vehicle?.version ?? ""} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-year">Ano</Label>
                  <Input
                    id="edit-year"
                    name="year"
                    inputMode="numeric"
                    maxLength={4}
                    defaultValue={vehicle?.year ?? ""}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-modelYear">Ano modelo</Label>
                  <Input
                    id="edit-modelYear"
                    name="modelYear"
                    inputMode="numeric"
                    maxLength={4}
                    defaultValue={vehicle?.model_year ?? ""}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-km">Quilometragem</Label>
                  <Input
                    id="edit-km"
                    name="km"
                    inputMode="numeric"
                    defaultValue={vehicle?.km ?? ""}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-price">Preço anunciado</Label>
                  <Input
                    id="edit-price"
                    name="price"
                    inputMode="numeric"
                    defaultValue={vehicle?.listed_price ?? ""}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-color">Cor</Label>
                  <Input id="edit-color" name="color" defaultValue={vehicle?.color ?? ""} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-plate">Placa</Label>
                  <Input
                    id="edit-plate"
                    name="plate"
                    maxLength={10}
                    className="uppercase"
                    defaultValue={vehicle?.plate ?? ""}
                  />
                </div>
              </div>
            </section>

            <Separator />

            <section className="space-y-3">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Origem e acompanhamento
              </h3>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-platform">Plataforma</Label>
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger id="edit-platform">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCE_PLATFORMS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-listingUrl">Link do anúncio</Label>
                  <Input
                    id="edit-listingUrl"
                    name="listingUrl"
                    type="url"
                    defaultValue={vehicle?.listing_url ?? contact.listing_url ?? ""}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-nextActionAt">Próxima ação</Label>
                  <Input
                    id="edit-nextActionAt"
                    name="nextActionAt"
                    type="datetime-local"
                    defaultValue={isoToLocalInput(contact.next_action_at)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Horário de Brasília. Deixe vazio para remover.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-nextActionNote">O que fazer</Label>
                  <Input
                    id="edit-nextActionNote"
                    name="nextActionNote"
                    maxLength={200}
                    placeholder="Ex.: retornar sobre a proposta"
                    defaultValue={contact.next_action_note ?? ""}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-notes">Observações</Label>
                <Textarea
                  id="edit-notes"
                  name="notes"
                  rows={3}
                  maxLength={2000}
                  defaultValue={contact.notes ?? ""}
                />
              </div>
            </section>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Salvar alterações"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function numberOrNull(value: FormDataEntryValue | null): number | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 0) return null;

  const parsed = Number(digits);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
