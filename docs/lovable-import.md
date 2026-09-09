# Reimportação da Inbox no Lovable

Este repositório usa Next.js. O projeto **Connect My Code**, na workspace
**TRABALHO** do Lovable, usa TanStack Start e recebe adaptações manuais deste
código. Uma publicação no Lovable não atualiza automaticamente este repositório.

Preferência de trabalho: implementar, revisar e testar primeiro no código local;
subir a versão pronta para o GitHub e só então pedir ao Lovable que importe.
Evitar rodadas de desenvolvimento no Lovable para economizar créditos.

Ao reimportar as melhorias da Inbox:

- Preserve as rotas e a autenticação do projeto de destino. No Next.js, as
  chamadas usam `fetch` e a sessão em cookies. No Lovable, as chamadas às APIs
  protegidas usam o adaptador `apiFetch` do projeto.
- Imagens, vídeos e áudios continuam passando pela rota autenticada de mídia.
  As URLs `blob:` usadas na tela são temporárias e devem ser revogadas.
- Importe juntos os componentes da Inbox e os utilitários em `src/lib/inbox`.
  Rascunhos contêm apenas texto e são separados por usuário e conversa.
- Preserve a paginação por `(created_at, id)`, a mesclagem por ID e a
  atualização em tempo real das mensagens já carregadas.
- Mantenha a validação de arquivos, a compressão existente, o limite de dez
  anexos e a janela de atendimento. Colar ou arrastar um arquivo apenas o anexa.

Antes de publicar, rode tipos, lint, testes e build no projeto de destino.
Confira também a Inbox no desktop e no celular com respostas de API simuladas:
envio lento ou com falha, troca de conversa, rascunho após recarga, excesso de
anexos, histórico com mídia carregando e navegação de fotos pelo teclado.
Os testes de envio não devem atingir clientes reais.

## Vídeos e reenvio manual

Importar também `src/lib/messages`, `src/lib/media/upload-xhr*`,
`attachment-preview*`, `template-dialog.tsx`, as três rotas de envio e a nova
rota POST `/api/messages/retry`. No destino, adaptar `NextResponse.json`,
`authorizeRequest()`, `server-only` e o acesso ao ambiente ao TanStack existente.
O upload XHR usa URL pública do Supabase e chave anon; nunca chave de serviço.

Não substituir a política de entrega incerta por reenvio automático. O navegador
reutiliza o clientRef após resposta perdida; o servidor retorna a linha existente.
O reenvio manual só aceita falhas inequívocas e adquire a versão da linha com uma
atualização condicional antes de chamar a Meta. Falha ao persistir o resultado
retorna 202 e não anuncia sucesso. Sem id do provedor, a conciliação automática
pode não ocorrer; o aviso pede conferência da conversa.

Validação local: reprodução de MP4 gerado com dados fictícios, duração/tamanho,
upload a 35%, upload concluído aguardando confirmação e botão de reenvio
bloqueado durante a tentativa, em 1280 e 390 px. A rota temporária de QA foi
removida. Não houve envio real de WhatsApp.
