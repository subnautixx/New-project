/** Formato dos webhooks da Meta WhatsApp Cloud API. */

export interface MetaWebhookBody {
  object?: string;
  entry?: MetaEntry[];
}

export interface MetaEntry {
  id?: string;
  changes?: MetaChange[];
}

export interface MetaChange {
  field?: string;
  value?: MetaChangeValue;
}

export interface MetaChangeValue {
  messaging_product?: string;
  metadata?: {
    display_phone_number?: string;
    phone_number_id?: string;
  };
  contacts?: MetaContact[];
  messages?: MetaMessage[];
  statuses?: MetaStatus[];
  errors?: MetaError[];
}

export interface MetaContact {
  wa_id?: string;
  profile?: { name?: string };
}

export interface MetaMediaPayload {
  id?: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
  filename?: string;
  voice?: boolean;
}

export interface MetaMessage {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: MetaMediaPayload;
  audio?: MetaMediaPayload;
  video?: MetaMediaPayload;
  document?: MetaMediaPayload;
  sticker?: MetaMediaPayload;
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contacts?: unknown[];
  button?: { text?: string; payload?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
  context?: { id?: string; from?: string };
  errors?: MetaError[];
}

export interface MetaStatus {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  conversation?: { id?: string; expiration_timestamp?: string };
  errors?: MetaError[];
}

export interface MetaError {
  code?: number;
  title?: string;
  message?: string;
  error_data?: { details?: string };
}
