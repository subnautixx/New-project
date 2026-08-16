"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PhotoPicker } from "@/components/crm/photo-picker";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/components/ui/toast";
import { SOURCE_PLATFORMS } from "@/lib/domain/lead";
import { normalizePhone } from "@/lib/phone";
import { uploadContactPhoto } from "@/lib/contacts/upload-photo";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AccountRef } from "@/lib/types/views";

const NO_ACCOUNT = "nenhum";

/**
 * Cadastro de prospect vindo de anúncio: cria o cliente, o veículo e — se um
 * número for escolhido — já abre a conversa, para o vendedor mandar a primeira
 * mensagem sem passos extras.
 */
export function NewContactForm({
  accounts,
  currentUserId,
}: {
  accounts: AccountRef[];
  currentUserId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id ?? NO_ACCOUNT);
  const [platform, setPlatform] = useState<string>(SOURCE_PLATFORMS[0]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [name, setName] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("fullName") ?? "").trim();
    const phoneInput = String(form.get("phone") ?? "").trim();
    const phone = normalizePhone(phoneInput);

    if (!phone) {
      setError("Telefone inválido. Informe DDD + número.");
      return;
    }

    setPending(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const listingUrl = String(form.get("listingUrl") ?? "").trim() || null;

    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .insert({
        full_name: fullName,
        phone_e164: phone,
        phone_raw: phoneInput,
        owner_user_id: currentUserId,
        created_by: currentUserId,
        status: "novo",
        source_platform: platform,
        listing_url: listingUrl,
        notes: String(form.get("notes") ?? "").trim() || null,
      })
      .select("id")
      .single();

    if (contactError || !contact) {
      setError(
        contactError?.code === "23505"
          ? "Este telefone já está cadastrado para outro consignador. Fale com o administrador."
          : "Não foi possível salvar o cliente.",
      );
      setPending(false);
      return;
    }

    const numberOrNull = (value: FormDataEntryValue | null) => {
      const parsed = Number(String(value ?? "").replace(/\D/g, ""));
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };

    await supabase.from("vehicles").insert({
      contact_id: contact.id,
      brand: String(form.get("brand") ?? "").trim() || null,
      model: String(form.get("model") ?? "").trim() || null,
      version: String(form.get("version") ?? "").trim() || null,
      year: numberOrNull(form.get("year")),
      model_year: numberOrNull(form.get("modelYear")),
      km: numberOrNull(form.get("km")),
      listed_price: numberOrNull(form.get("price")),
      listing_url: listingUrl,
      source_platform: platform,
      is_primary: true,
    });

    // A foto só pode ser enviada agora: antes disso não havia cliente a quem
    // vinculá-la. Se falhar, o cadastro continua válido — sem foto.
    if (photo) {
      await uploadContactPhoto(contact.id, photo);
    }

    if (accountId !== NO_ACCOUNT) {
      await supabase.from("conversations").insert({
        contact_id: contact.id,
        whatsapp_account_id: accountId,
        assigned_user_id: currentUserId,
      });
    }

    toast.success("Cliente cadastrado.");
    router.push(`/clientes/${contact.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <section className="space-y-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Proprietário
        </h2>

        <PhotoPicker name={name} file={photo} onFileChange={setPhoto} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Nome *</Label>
            <Input
              id="fullName"
              name="fullName"
              required
              maxLength={120}
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Telefone (WhatsApp) *</Label>
            <Input
              id="phone"
              name="phone"
              required
              inputMode="tel"
              placeholder="(11) 98765-4321"
              autoComplete="off"
            />
          </div>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Veículo anunciado
        </h2>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="brand">Marca</Label>
            <Input id="brand" name="brand" maxLength={40} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="model">Modelo</Label>
            <Input id="model" name="model" maxLength={60} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="version">Versão</Label>
            <Input id="version" name="version" maxLength={60} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="year">Ano</Label>
            <Input id="year" name="year" inputMode="numeric" maxLength={4} placeholder="2019" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="modelYear">Ano modelo</Label>
            <Input id="modelYear" name="modelYear" inputMode="numeric" maxLength={4} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="km">Quilometragem</Label>
            <Input id="km" name="km" inputMode="numeric" placeholder="65000" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="price">Preço anunciado</Label>
            <Input id="price" name="price" inputMode="numeric" placeholder="89900" />
          </div>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Origem
        </h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="platform">Plataforma</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger id="platform">
                <SelectValue />
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
            <Label htmlFor="listingUrl">Link do anúncio</Label>
            <Input id="listingUrl" name="listingUrl" type="url" placeholder="https://" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="whatsapp">Atender por qual WhatsApp</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger id="whatsapp">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.display_name} · {a.phone_e164}
                </SelectItem>
              ))}
              <SelectItem value={NO_ACCOUNT}>Não abrir conversa agora</SelectItem>
            </SelectContent>
          </Select>
          {accounts.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum número liberado para você. Peça ao administrador.
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Observações</Label>
          <Textarea id="notes" name="notes" rows={3} maxLength={2000} />
        </div>
      </section>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 pb-6">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Cadastrar prospect"}
        </Button>
      </div>
    </form>
  );
}
