-- =============================================================================
-- Bucket para mídias enviadas pelo CRM
-- =============================================================================
-- Por que passar pelo Storage em vez de subir o arquivo pela rota de API:
-- funções serverless na Vercel têm limite de ~4,5 MB por requisição, e foto de
-- celular passa disso com frequência. O navegador sobe direto para o Storage
-- com uma URL assinada emitida pelo backend, e a Meta busca o arquivo por um
-- link temporário. O tráfego pesado nunca atravessa a função.
--
-- O bucket é PRIVADO e não recebe policy nenhuma: todo acesso é intermediado
-- pelo backend com service_role, que confere a permissão antes. Guardar a
-- cópia aqui também preserva o histórico — a mídia da Meta expira.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'whatsapp-media',
  'whatsapp-media',
  false,
  16777216, -- 16 MB: teto prático da Cloud API para vídeo e áudio
  array[
    'image/jpeg', 'image/png', 'image/webp',
    'video/mp4', 'video/3gpp',
    'audio/aac', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/amr',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
on conflict (id) do nothing;
