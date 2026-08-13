import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, LeadStatus } from "@/lib/types/database";
import type {
  AccountRef,
  ContactListItem,
  ContactNote,
  ConversationListItem,
  StatusHistoryEntry,
  UserRef,
  VehicleSummary,
} from "@/lib/types/views";

type Client = SupabaseClient<Database>;

/**
 * Consultas compartilhadas entre servidor e navegador.
 *
 * Todas usam o cliente da SESSÃO, nunca o service_role: o recorte por
 * consignador vem da RLS. Se um dia uma policy quebrar, a interface some junto
 * — em vez de vazar dado de outro vendedor.
 *
 * As formas aninhadas do PostgREST são convertidas por `shape*` porque os
 * tipos gerados descrevem tabelas planas, não o JSON com joins.
 */

const VEHICLE_FIELDS =
  "id, brand, model, version, year, model_year, km, listed_price, listing_url, source_platform, is_primary";

const CONTACT_FIELDS =
  "id, full_name, phone_e164, status, source_platform, listing_url, notes, next_action_at, next_action_note, last_interaction_at, photo_path, owner_user_id, created_at";

interface RawNested {
  [key: string]: unknown;
}

/** PostgREST devolve objeto para "to-one" e array quando não consegue inferir. */
function one<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return (value as T) ?? null;
}

function primaryVehicle(value: unknown): VehicleSummary | null {
  const list = (Array.isArray(value) ? value : value ? [value] : []) as (VehicleSummary & {
    is_primary?: boolean;
  })[];

  return list.find((v) => v.is_primary) ?? list[0] ?? null;
}

export interface ConversationFilters {
  search?: string;
  status?: LeadStatus | "todos";
  unreadOnly?: boolean;
  assigneeId?: string | "todos";
  accountId?: string | "todos";
}

export async function fetchConversations(
  supabase: Client,
  filters: ConversationFilters = {},
  limit = 200,
): Promise<ConversationListItem[]> {
  let query = supabase
    .from("conversations")
    .select(
      `id, last_message_at, last_message_preview, unread_count, assigned_user_id,
       whatsapp_account_id, service_window_expires_at,
       contact:contacts!inner(${CONTACT_FIELDS}, vehicles(${VEHICLE_FIELDS})),
       assignee:profiles!conversations_assigned_user_id_fkey(id, full_name),
       account:whatsapp_accounts(id, display_name, phone_e164, mode)` as "*",
    )
    .eq("is_archived", false)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (filters.unreadOnly) query = query.gt("unread_count", 0);
  if (filters.status && filters.status !== "todos") {
    // O recurso embutido foi apelidado de `contact`; o filtro precisa usar o
    // apelido, não o nome da tabela, senão o PostgREST devolve 400.
    query = query.eq("contact.status", filters.status);
  }
  if (filters.assigneeId && filters.assigneeId !== "todos") {
    query = query.eq("assigned_user_id", filters.assigneeId);
  }
  if (filters.accountId && filters.accountId !== "todos") {
    query = query.eq("whatsapp_account_id", filters.accountId);
  }

  const search = filters.search?.trim();
  if (search) {
    const term = `%${escapeLike(search)}%`;
    query = query.or(`full_name.ilike.${term},phone_e164.ilike.${term}`, {
      referencedTable: "contact",
    });
  }

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao carregar conversas: ${error.message}`);

  return (data ?? []).map((row) => {
    const raw = row as unknown as RawNested;
    const contact = one<RawNested>(raw.contact);

    return {
      id: raw.id as string,
      last_message_at: (raw.last_message_at as string | null) ?? null,
      last_message_preview: (raw.last_message_preview as string | null) ?? null,
      unread_count: (raw.unread_count as number) ?? 0,
      assigned_user_id: raw.assigned_user_id as string,
      whatsapp_account_id: raw.whatsapp_account_id as string,
      service_window_expires_at: (raw.service_window_expires_at as string | null) ?? null,
      contact: contact as unknown as ConversationListItem["contact"],
      vehicle: primaryVehicle(contact?.vehicles),
      assignee: one<UserRef>(raw.assignee),
      account: one<AccountRef>(raw.account),
    } satisfies ConversationListItem;
  });
}

export interface ContactFilters {
  search?: string;
  status?: LeadStatus | "todos";
  ownerId?: string | "todos";
}

export async function fetchContacts(
  supabase: Client,
  filters: ContactFilters = {},
  limit = 300,
): Promise<ContactListItem[]> {
  let query = supabase
    .from("contacts")
    .select(
      `${CONTACT_FIELDS},
       vehicles(${VEHICLE_FIELDS}),
       owner:profiles!contacts_owner_user_id_fkey(id, full_name),
       conversations(id)` as "*",
    )
    .order("last_interaction_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (filters.status && filters.status !== "todos") query = query.eq("status", filters.status);
  if (filters.ownerId && filters.ownerId !== "todos") query = query.eq("owner_user_id", filters.ownerId);

  const search = filters.search?.trim();
  if (search) {
    const term = `%${escapeLike(search)}%`;
    query = query.or(`full_name.ilike.${term},phone_e164.ilike.${term}`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao carregar clientes: ${error.message}`);

  return (data ?? []).map((row) => {
    const raw = row as unknown as RawNested;
    const conversations = (raw.conversations as { id: string }[] | null) ?? [];

    return {
      ...(raw as unknown as ContactListItem),
      vehicle: primaryVehicle(raw.vehicles),
      owner: one<UserRef>(raw.owner),
      conversation_id: conversations[0]?.id ?? null,
    } satisfies ContactListItem;
  });
}

export async function fetchContactNotes(
  supabase: Client,
  contactId: string,
): Promise<ContactNote[]> {
  const { data, error } = await supabase
    .from("notes")
    .select("id, body, created_at, author:profiles!notes_author_user_id_fkey(id, full_name)" as "*")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`Falha ao carregar notas: ${error.message}`);

  return (data ?? []).map((row) => {
    const raw = row as unknown as RawNested;
    return {
      id: raw.id as string,
      body: raw.body as string,
      created_at: raw.created_at as string,
      author: one<UserRef>(raw.author),
    };
  });
}

export async function fetchStatusHistory(
  supabase: Client,
  contactId: string,
): Promise<StatusHistoryEntry[]> {
  const { data, error } = await supabase
    .from("lead_status_history")
    .select(
      "id, from_status, to_status, created_at, changed_by:profiles!lead_status_history_changed_by_fkey(id, full_name)" as "*",
    )
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw new Error(`Falha ao carregar histórico: ${error.message}`);

  return (data ?? []).map((row) => {
    const raw = row as unknown as RawNested;
    return {
      id: raw.id as string,
      from_status: raw.from_status as StatusHistoryEntry["from_status"],
      to_status: raw.to_status as StatusHistoryEntry["to_status"],
      created_at: raw.created_at as string,
      changed_by: one<UserRef>(raw.changed_by),
    };
  });
}

export async function fetchActiveUsers(supabase: Client): Promise<UserRef[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("is_active", true)
    .order("full_name");

  if (error) throw new Error(`Falha ao carregar usuários: ${error.message}`);
  return data ?? [];
}

export async function fetchAccessibleAccounts(supabase: Client): Promise<AccountRef[]> {
  const { data, error } = await supabase
    .from("whatsapp_accounts")
    .select("id, display_name, phone_e164, mode")
    .eq("is_active", true)
    .order("display_name");

  if (error) throw new Error(`Falha ao carregar WhatsApps: ${error.message}`);
  return data ?? [];
}

/** Evita que `%` e `_` digitados na busca virem curinga. */
function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&").replace(/,/g, " ");
}
